import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type ContextMenuItem,
  type LocalApi,
  type ScopedThreadRef,
} from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readEnvironmentScope } from "../state/session";
import { createSpace } from "./spacesState";

export type SpaceThreadMenuId = "space:start";

export const isSpaceThreadMenuId = (id: string): id is SpaceThreadMenuId => id === "space:start";

/** Shows a thread's menu with the space actions after the new-thread actions, before Rename's group. */
export function showThreadMenuWithSpaces<Id extends string>(
  api: Pick<LocalApi, "contextMenu">,
  threadRef: ScopedThreadRef,
  items: ReadonlyArray<ContextMenuItem<Id>>,
  position: { readonly x: number; readonly y: number },
): Promise<Id | SpaceThreadMenuId | null> {
  const spaceItems: ContextMenuItem<SpaceThreadMenuId>[] = [
    {
      id: "space:start",
      label: "Start a space from this thread",
      icon: "folder-plus",
      disabled: !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope),
    },
  ];
  const at = items.findIndex((item) => item.id === "rename");
  return api.contextMenu.show<Id | SpaceThreadMenuId>(
    at === -1
      ? [...items, ...spaceItems]
      : [...items.slice(0, at), ...spaceItems, ...items.slice(at)],
    position,
  );
}

export async function runSpaceThreadMenuAction(
  _action: SpaceThreadMenuId,
  target: { readonly threadRef: ScopedThreadRef; readonly title: string },
  openThread: (threadRef: ScopedThreadRef) => unknown,
): Promise<void> {
  const result = await runAtomCommand(
    appAtomRegistry,
    createSpace,
    {
      environmentId: target.threadRef.environmentId,
      input: { name: target.title, threadIds: [target.threadRef.threadId] },
    },
    { label: "start space from thread", reportFailure: false },
  );
  if (result._tag === "Success") {
    openThread(target.threadRef);
    return;
  }
  if (isAtomCommandInterrupted(result)) return;
  const error = squashAtomCommandFailure(result);
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title: "Could not start a space",
      ...(error instanceof Error ? { description: error.message } : {}),
    }),
  );
}
