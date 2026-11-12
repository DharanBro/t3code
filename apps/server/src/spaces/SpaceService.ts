import {
  SpaceId,
  SpaceNotFoundError,
  SpaceStorageError,
  ThreadId,
  type Space,
  type SpaceCreateInput,
  type SpaceDeleteInput,
  type SpaceList,
  type SpaceRenameInput,
  type SpaceSetThreadInput,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

export class SpaceService extends Context.Service<
  SpaceService,
  {
    readonly list: () => Effect.Effect<SpaceList, SpaceStorageError>;
    readonly subscribe: () => Stream.Stream<SpaceList, SpaceStorageError>;
    readonly create: (input: SpaceCreateInput) => Effect.Effect<Space, SpaceStorageError>;
    readonly rename: (
      input: SpaceRenameInput,
    ) => Effect.Effect<Space, SpaceNotFoundError | SpaceStorageError>;
    readonly delete: (
      input: SpaceDeleteInput,
    ) => Effect.Effect<void, SpaceNotFoundError | SpaceStorageError>;
    readonly setThread: (
      input: SpaceSetThreadInput,
    ) => Effect.Effect<void, SpaceNotFoundError | SpaceStorageError>;
  }
>()("t3/spaces/SpaceService") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const random = yield* SecureRandom.SecureRandom;
  // Every change re-sends the full list, so slow subscribers need only the newest signal.
  const changes = yield* PubSub.sliding<void>(1);
  const notifyChanged = PubSub.publish(changes, undefined);

  const threadIdsOf = (spaceId: SpaceId) =>
    sql<{ readonly thread_id: string }>`
      SELECT thread_id FROM fork_space_threads
      WHERE space_id = ${spaceId}
      ORDER BY position, rowid
    `.pipe(Effect.map((rows) => rows.map((row) => ThreadId.make(row.thread_id))));

  // Runs inside create and setThread transactions, which carry the span.
  const placeThread = Effect.fnUntraced(function* (
    threadId: ThreadId,
    spaceId: SpaceId,
    position: number | undefined,
  ) {
    yield* sql`DELETE FROM fork_space_threads WHERE thread_id = ${threadId}`;
    const order = yield* threadIdsOf(spaceId);
    order.splice(Math.min(position ?? order.length, order.length), 0, threadId);
    yield* sql`
      INSERT INTO fork_space_threads (thread_id, space_id, position)
      VALUES (${threadId}, ${spaceId}, ${order.length})
    `;
    yield* Effect.forEach(
      order,
      (id, index) => sql`UPDATE fork_space_threads SET position = ${index} WHERE thread_id = ${id}`,
      { discard: true },
    );
  });

  const readList = Effect.gen(function* () {
    const spaces = yield* sql<{
      readonly space_id: string;
      readonly name: string;
      readonly created_at: string;
    }>`SELECT space_id, name, created_at FROM fork_spaces ORDER BY rowid`;
    const members = yield* sql<{ readonly thread_id: string; readonly space_id: string }>`
      SELECT thread_id, space_id FROM fork_space_threads ORDER BY position, rowid
    `;
    const threadIdsBySpace = new Map<string, ThreadId[]>();
    for (const member of members) {
      const threadIds = threadIdsBySpace.get(member.space_id) ?? [];
      threadIds.push(ThreadId.make(member.thread_id));
      threadIdsBySpace.set(member.space_id, threadIds);
    }
    return {
      spaces: spaces.map((row) => ({
        id: SpaceId.make(row.space_id),
        name: row.name,
        threadIds: threadIdsBySpace.get(row.space_id) ?? [],
        createdAt: row.created_at,
      })),
    };
  });

  const list = Effect.fn("SpaceService.list")(
    function* () {
      return yield* readList.pipe(NodeSqliteClient.readOnly);
    },
    Effect.mapError((cause) => new SpaceStorageError({ operation: "list", cause })),
  );

  const subscribe = () =>
    Stream.unwrap(
      Effect.gen(function* () {
        // Subscribe before reading so a change between the two still arrives.
        const subscription = yield* PubSub.subscribe(changes);
        return Stream.concat(
          Stream.fromEffect(list()),
          Stream.fromSubscription(subscription).pipe(Stream.mapEffect(() => list())),
        );
      }),
    );

  const create = Effect.fn("SpaceService.create")(
    function* (input: SpaceCreateInput) {
      const id = SpaceId.make(yield* random.uuidV4());
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      const threadIds = [...new Set(input.threadIds)];
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            INSERT INTO fork_spaces (space_id, name, created_at)
            VALUES (${id}, ${input.name}, ${createdAt})
          `;
          yield* Effect.forEach(threadIds, (threadId) => placeThread(threadId, id, undefined), {
            discard: true,
          });
        }),
      );
      yield* notifyChanged;
      return { id, name: input.name, threadIds, createdAt };
    },
    Effect.mapError((cause) => new SpaceStorageError({ operation: "create", cause })),
  );

  const rename = Effect.fn("SpaceService.rename")(
    function* (input: SpaceRenameInput) {
      const rows = yield* sql<{ readonly created_at: string }>`
        UPDATE fork_spaces SET name = ${input.name}
        WHERE space_id = ${input.spaceId}
        RETURNING created_at
      `;
      const row = rows[0];
      if (row === undefined) return yield* new SpaceNotFoundError({ spaceId: input.spaceId });
      const threadIds = yield* threadIdsOf(input.spaceId);
      yield* notifyChanged;
      return { id: input.spaceId, name: input.name, threadIds, createdAt: row.created_at };
    },
    Effect.catchTags({
      SqlError: (cause) => Effect.fail(new SpaceStorageError({ operation: "rename", cause })),
    }),
  );

  const deleteSpace = Effect.fn("SpaceService.delete")(
    function* (input: SpaceDeleteInput) {
      const deleted = yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`DELETE FROM fork_space_threads WHERE space_id = ${input.spaceId}`;
          return yield* sql`
            DELETE FROM fork_spaces WHERE space_id = ${input.spaceId} RETURNING space_id
          `;
        }),
      );
      if (deleted.length === 0) return yield* new SpaceNotFoundError({ spaceId: input.spaceId });
      yield* notifyChanged;
    },
    Effect.catchTags({
      SqlError: (cause) => Effect.fail(new SpaceStorageError({ operation: "delete", cause })),
    }),
  );

  const setThread = Effect.fn("SpaceService.setThread")(
    function* (input: SpaceSetThreadInput) {
      const { spaceId } = input;
      yield* sql.withTransaction(
        Effect.gen(function* () {
          if (spaceId === null) {
            yield* sql`DELETE FROM fork_space_threads WHERE thread_id = ${input.threadId}`;
            return;
          }
          const exists = yield* sql`SELECT 1 FROM fork_spaces WHERE space_id = ${spaceId}`;
          if (exists.length === 0) return yield* new SpaceNotFoundError({ spaceId });
          yield* placeThread(input.threadId, spaceId, input.position);
        }),
      );
      yield* notifyChanged;
    },
    Effect.catchTags({
      SqlError: (cause) => Effect.fail(new SpaceStorageError({ operation: "setThread", cause })),
    }),
  );

  return SpaceService.of({
    list,
    subscribe,
    create,
    rename,
    delete: deleteSpace,
    setThread,
  });
});

export const layer = Layer.effect(SpaceService, make);
