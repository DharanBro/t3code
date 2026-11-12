import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

/**
 * A space's tabs the client can show, in tab order. The server keeps ids of threads
 * deleted since they joined, so ids without a loaded thread drop out here.
 */
export function resolveSpaceTabs<Thread>(
  environmentId: EnvironmentId,
  threadIds: ReadonlyArray<ThreadId>,
  threadByKey: ReadonlyMap<string, Thread>,
): Thread[] {
  return threadIds.flatMap((threadId) => {
    const thread = threadByKey.get(scopedThreadKey(scopeThreadRef(environmentId, threadId)));
    return thread === undefined ? [] : [thread];
  });
}

/** The tab a space opens on: the one visited last, else the first. */
export function pickSpaceTabToOpen<Thread>(
  tabs: ReadonlyArray<Thread>,
  lastVisitedAt: (thread: Thread) => string | undefined,
): Thread | null {
  let picked: Thread | null = null;
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
