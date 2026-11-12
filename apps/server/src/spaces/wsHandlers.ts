import {
  SPACES_WS_METHODS,
  type SpaceCreateInput,
  type SpaceDeleteInput,
  type SpaceListInput,
  type SpaceRenameInput,
  type SpaceSetThreadInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as SpaceService from "./SpaceService.ts";

export const SPACES_RPC_AGGREGATES = {
  [SPACES_WS_METHODS.subscribe]: "spaces",
  [SPACES_WS_METHODS.create]: "spaces",
  [SPACES_WS_METHODS.rename]: "spaces",
  [SPACES_WS_METHODS.delete]: "spaces",
  [SPACES_WS_METHODS.setThread]: "spaces",
} as const;

export const make = Effect.gen(function* () {
  const spaces = yield* SpaceService.SpaceService;
  return {
    [SPACES_WS_METHODS.subscribe]: (_input: SpaceListInput) => spaces.subscribe(),
    [SPACES_WS_METHODS.create]: (input: SpaceCreateInput) => spaces.create(input),
    [SPACES_WS_METHODS.rename]: (input: SpaceRenameInput) =>
      Effect.annotateCurrentSpan({ "space.id": input.spaceId }).pipe(
        Effect.andThen(spaces.rename(input)),
      ),
    [SPACES_WS_METHODS.delete]: (input: SpaceDeleteInput) =>
      Effect.annotateCurrentSpan({ "space.id": input.spaceId }).pipe(
        Effect.andThen(spaces.delete(input)),
      ),
    [SPACES_WS_METHODS.setThread]: (input: SpaceSetThreadInput) =>
      Effect.annotateCurrentSpan({ "space.id": input.spaceId ?? "none" }).pipe(
        Effect.andThen(spaces.setThread(input)),
      ),
  };
});
