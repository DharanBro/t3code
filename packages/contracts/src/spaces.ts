import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentAuthorizationError,
} from "./auth.ts";
import {
  ForwardCompatibleArray,
  IsoDateTime,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const SpaceId = TrimmedNonEmptyString.pipe(Schema.brand("SpaceId"));
export type SpaceId = typeof SpaceId.Type;

export const Space = Schema.Struct({
  id: SpaceId,
  name: TrimmedNonEmptyString,
  /** Tab order. May name drafts the server has not seen yet and threads deleted since. */
  threadIds: Schema.Array(ThreadId),
  createdAt: IsoDateTime,
});
export type Space = typeof Space.Type;

export const SpaceListInput = Schema.Struct({});
export type SpaceListInput = typeof SpaceListInput.Type;

export const SpaceList = Schema.Struct({
  spaces: ForwardCompatibleArray(Space),
});
export type SpaceList = typeof SpaceList.Type;

export const SpaceCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  /** The first becomes the first tab. Each thread leaves any space it was in. */
  threadIds: Schema.Array(ThreadId),
});
export type SpaceCreateInput = typeof SpaceCreateInput.Type;

export const SpaceRenameInput = Schema.Struct({
  spaceId: SpaceId,
  name: TrimmedNonEmptyString,
});
export type SpaceRenameInput = typeof SpaceRenameInput.Type;

export const SpaceDeleteInput = Schema.Struct({
  spaceId: SpaceId,
});
export type SpaceDeleteInput = typeof SpaceDeleteInput.Type;

export const SpaceSetThreadInput = Schema.Struct({
  threadId: ThreadId,
  /** Null removes the thread from its space. */
  spaceId: Schema.NullOr(SpaceId),
  /** Tab index in the target space; omitted appends. */
  position: Schema.optional(NonNegativeInt),
});
export type SpaceSetThreadInput = typeof SpaceSetThreadInput.Type;

export class SpaceNotFoundError extends Schema.TaggedError<SpaceNotFoundError>()(
  "SpaceNotFoundError",
  { spaceId: SpaceId },
) {
  override get message(): string {
    return "This space no longer exists.";
  }
}

export class SpaceStorageError extends Schema.TaggedError<SpaceStorageError>()(
  "SpaceStorageError",
  {
    operation: Schema.Literals(["list", "create", "rename", "delete", "setThread"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Could not ${this.operation === "list" ? "load" : "save"} spaces.`;
  }
}

export const SPACES_WS_METHODS = {
  subscribe: "spaces.subscribe",
  create: "spaces.create",
  rename: "spaces.rename",
  delete: "spaces.delete",
  setThread: "spaces.setThread",
} as const;

const SpaceMutationError = Schema.Union([
  SpaceNotFoundError,
  SpaceStorageError,
  EnvironmentAuthorizationError,
]);

export const SpacesRpcGroup = RpcGroup.make(
  Rpc.make(SPACES_WS_METHODS.subscribe, {
    payload: SpaceListInput,
    success: SpaceList,
    error: Schema.Union([SpaceStorageError, EnvironmentAuthorizationError]),
    stream: true,
  }),
  Rpc.make(SPACES_WS_METHODS.create, {
    payload: SpaceCreateInput,
    success: Space,
    error: SpaceMutationError,
  }),
  Rpc.make(SPACES_WS_METHODS.rename, {
    payload: SpaceRenameInput,
    success: Space,
    error: SpaceMutationError,
  }),
  Rpc.make(SPACES_WS_METHODS.delete, {
    payload: SpaceDeleteInput,
    success: Schema.Void,
    error: SpaceMutationError,
  }),
  Rpc.make(SPACES_WS_METHODS.setThread, {
    payload: SpaceSetThreadInput,
    success: Schema.Void,
    error: SpaceMutationError,
  }),
);

export const SPACES_CLIENT_GUARDED_RPC_SCOPES = {
  [SPACES_WS_METHODS.create]: AuthOrchestrationOperateScope,
  [SPACES_WS_METHODS.rename]: AuthOrchestrationOperateScope,
  [SPACES_WS_METHODS.delete]: AuthOrchestrationOperateScope,
  [SPACES_WS_METHODS.setThread]: AuthOrchestrationOperateScope,
} as const;

export const SPACES_RPC_SCOPES = {
  ...SPACES_CLIENT_GUARDED_RPC_SCOPES,
  [SPACES_WS_METHODS.subscribe]: AuthOrchestrationReadScope,
} as const;
