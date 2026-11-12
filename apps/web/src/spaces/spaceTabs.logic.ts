import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import type { DraftId } from "../composerDraftStore";

export interface SpaceTab<Thread> {
  readonly threadId: ThreadId;
  /** Null while the tab is a draft that has not been sent yet. */
  readonly thread: Thread | null;
  readonly draftId: DraftId | null;
}

/**
 * A space's tabs the client can show, in tab order. The server keeps ids of threads
 * deleted since they joined; ids with neither a loaded thread nor a draft drop out here.
 */
export function resolveSpaceTabs<Thread>(
  environmentId: EnvironmentId,
  threadIds: ReadonlyArray<ThreadId>,
  threadByKey: ReadonlyMap<string, Thread>,
  draftIdByKey: ReadonlyMap<string, DraftId>,
): SpaceTab<Thread>[] {
  return threadIds.flatMap((threadId): SpaceTab<Thread>[] => {
    const key = scopedThreadKey(scopeThreadRef(environmentId, threadId));
    const thread = threadByKey.get(key);
    if (thread !== undefined) return [{ threadId, thread, draftId: null }];
    const draftId = draftIdByKey.get(key);
    return draftId === undefined ? [] : [{ threadId, thread: null, draftId }];
  });
}

/** The tab a space opens on: the one visited last, else the first. */
export function pickSpaceTabToOpen<Tab>(
  tabs: ReadonlyArray<Tab>,
  lastVisitedAt: (tab: Tab) => string | undefined,
): Tab | null {
  let picked: Tab | null = null;
  let pickedAt: string | undefined;
  for (const tab of tabs) {
    const visitedAt = lastVisitedAt(tab);
    if (picked === null || (visitedAt !== undefined && (pickedAt ?? "") < visitedAt)) {
      picked = tab;
      pickedAt = visitedAt;
    }
  }
  return picked;
}
