import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import {
  SPACES_WS_METHODS,
  type EnvironmentId,
  type ScopedThreadRef,
  type Space,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";

import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentAtomList, environmentIdsKey } from "../state/environmentAtomList";
import { useConnectedEnvironmentIds } from "../state/environments";
import { buildThreadRouteParams } from "../threadRoutes";
import type { SpaceTab } from "./spaceTabs.logic";

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

export const renameSpace = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:spaces:rename",
  tag: SPACES_WS_METHODS.rename,
});

export const deleteSpace = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:spaces:delete",
  tag: SPACES_WS_METHODS.delete,
});

export const setSpaceThread = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:spaces:set-thread",
  tag: SPACES_WS_METHODS.setThread,
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

export function findSpaceOfThread(
  spaces: ReadonlyArray<EnvironmentSpace>,
  ref: ScopedThreadRef,
): EnvironmentSpace | null {
  return (
    spaces.find(
      ({ environmentId, space }) =>
        environmentId === ref.environmentId && space.threadIds.includes(ref.threadId),
    ) ?? null
  );
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

/** Unsent drafts by thread key, so a space can show a tab before its first message. */
export function useDraftIdByThreadKey(): ReadonlyMap<string, DraftId> {
  const sessions = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const byKey = new Map<string, DraftId>();
  for (const [draftId, session] of Object.entries(sessions)) {
    if (session.promotedTo != null) continue;
    byKey.set(
      scopedThreadKey(scopeThreadRef(session.environmentId, session.threadId)),
      DraftId.make(draftId),
    );
  }
  return byKey;
}

export function useOpenSpaceTab() {
  const router = useRouter();
  return (environmentId: EnvironmentId, tab: SpaceTab<unknown>) =>
    tab.draftId !== null
      ? router.navigate({ to: "/draft/$draftId", params: { draftId: tab.draftId } })
      : router.navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(environmentId, tab.threadId)),
        });
}
