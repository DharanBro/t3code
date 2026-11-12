import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as SpaceService from "./SpaceService.ts";
import { FORK_MIGRATIONS_TABLE } from "./SpacesMigrations.ts";

const testLayer = SpaceService.layer.pipe(
  Layer.provideMerge(SqlitePersistence.layerMemory),
  Layer.provide(NodeCrypto.layer),
);

const t = (id: string) => ThreadId.make(id);

it.effect("keeps tab order as threads are added, reordered, moved and removed", () =>
  Effect.gen(function* () {
    const spaces = yield* SpaceService.SpaceService;
    const checkout = yield* spaces.create({
      name: "Checkout",
      threadIds: [t("t1"), t("t2"), t("t1")],
    });
    assert.deepEqual(checkout.threadIds, [t("t1"), t("t2")]);

    yield* spaces.setThread({ threadId: t("t3"), spaceId: checkout.id, position: 0 });
    yield* spaces.setThread({ threadId: t("t2"), spaceId: checkout.id, position: 0 });
    assert.deepEqual((yield* spaces.list()).spaces[0]?.threadIds, [t("t2"), t("t3"), t("t1")]);

    yield* spaces.create({ name: "CI", threadIds: [t("t1")] });
    yield* spaces.setThread({ threadId: t("t3"), spaceId: null });
    assert.deepEqual(
      (yield* spaces.list()).spaces.map((space) => [space.name, space.threadIds]),
      [
        ["Checkout", [t("t2")]],
        ["CI", [t("t1")]],
      ],
    );
  }).pipe(Effect.provide(testLayer)),
);

it.effect("deleting a space frees its threads, and changes to a missing space fail", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const spaces = yield* SpaceService.SpaceService;
    const docs = yield* spaces.create({ name: "Docs", threadIds: [t("t1"), t("t2")] });
    yield* spaces.delete({ spaceId: docs.id });

    assert.deepEqual((yield* spaces.list()).spaces, []);
    const members = yield* sql<{ readonly count: number }>`
      SELECT COUNT(*) AS count FROM fork_space_threads
    `;
    assert.equal(members[0]?.count, 0);

    for (const change of [
      spaces.rename({ spaceId: docs.id, name: "Renamed" }),
      spaces.delete({ spaceId: docs.id }),
      spaces.setThread({ threadId: t("t3"), spaceId: docs.id }),
    ]) {
      assert.equal((yield* Effect.flip(change))._tag, "SpaceNotFoundError");
    }
  }).pipe(Effect.provide(testLayer)),
);

it.effect("records its schema in the fork's own migration table, not upstream's", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const fork = yield* sql.unsafe<{ readonly name: string }>(
      `SELECT name FROM ${FORK_MIGRATIONS_TABLE}`,
    );
    assert.deepEqual(
      fork.map((row) => row.name),
      ["Spaces"],
    );
    const upstream = yield* sql<{ readonly name: string }>`
      SELECT name FROM effect_sql_migrations WHERE name = 'Spaces'
    `;
    assert.lengthOf(upstream, 0);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("sends the full list again after each change", () =>
  Effect.gen(function* () {
    const spaces = yield* SpaceService.SpaceService;
    const firstList = yield* Deferred.make<void>();
    const fiber = yield* spaces.subscribe().pipe(
      Stream.tap(() => Deferred.succeed(firstList, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Deferred.await(firstList);
    yield* spaces.create({ name: "Live", threadIds: [t("t1")] });

    const lists = yield* Fiber.join(fiber);
    assert.deepEqual(
      [...lists].map((list) => list.spaces.map((space) => space.name)),
      [[], ["Live"]],
    );
  }).pipe(Effect.provide(testLayer)),
);
