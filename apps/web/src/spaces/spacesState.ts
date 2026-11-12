import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { SPACES_WS_METHODS, type EnvironmentId, type Space } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentAtomList, environmentIdsKey } from "../state/environmentAtomList";
import { useConnectedEnvironmentIds } from "../state/environments";

const spacesLive = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:spaces:live",
  tag: SPACES_WS_METHODS.subscribe,
});

const connectedSpacesAtom = environmentAtomList("web-spaces", (environmentId) =>
  spacesLive({ environmentId, input: {} }),
);

export const createSpace = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:spaces:create",
  tag: SPACES_WS_METHODS.create,
});

export interface EnvironmentSpace {
  readonly environmentId: EnvironmentId;
  readonly space: Space;
}

/** Spaces on every connected environment. A server without Spaces contributes none. */
export function useSpaces(): ReadonlyArray<EnvironmentSpace> {
  const environmentIds = useConnectedEnvironmentIds();
  const results = useAtomValue(connectedSpacesAtom(environmentIdsKey(environmentIds)));
  return environmentIds.flatMap((environmentId, index) => {
    const result = results[index];
    const list = result ? Option.getOrUndefined(AsyncResult.value(result)) : undefined;
    return (list?.spaces ?? []).map((space) => ({ environmentId, space }));
  });
}

/** Adds every thread in a space to a set of thread keys the sidebar lists elsewhere. */
export function useWithSpaceThreads(hidden: ReadonlySet<string>): ReadonlySet<string> {
  const spaces = useSpaces();
  if (spaces.length === 0) return hidden;
  const keys = new Set(hidden);
  for (const { environmentId, space } of spaces) {
    for (const threadId of space.threadIds) {
      keys.add(threadKey(scopeThreadRef(environmentId, threadId)));
    }
  }
  return keys;
}
