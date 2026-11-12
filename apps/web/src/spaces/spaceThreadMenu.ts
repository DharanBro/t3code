import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  SpaceId,
  type ContextMenuItem,
  type LocalApi,
  type ScopedThreadRef,
} from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readEnvironmentScope } from "../state/session";
import { createSpace, readEnvironmentSpaces, setSpaceThread } from "./spacesState";

export type SpaceThreadMenuId = "space:start" | "space:remove" | `space:move:${string}`;

export const isSpaceThreadMenuId = (id: string): id is SpaceThreadMenuId => id.startsWith("space:");

/** The space actions for one thread: start or join a space, or leave the one it is in. */
function spaceThreadMenuItems(threadRef: ScopedThreadRef): ContextMenuItem<SpaceThreadMenuId>[] {
  const disabled = !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const spaces = readEnvironmentSpaces(threadRef.environmentId);
  if (spaces.some((space) => space.threadIds.includes(threadRef.threadId))) {
    return [{ id: "space:remove", label: "Remove from space", icon: "folder-tree", disabled }];
  }
  const items: ContextMenuItem<SpaceThreadMenuId>[] = [
    { id: "space:start", label: "Start a space from this thread", icon: "folder-plus", disabled },
  ];
  if (spaces.length > 0) {
    items.push({
      id: "space:move:",
      label: "Move to space",
      icon: "folder-tree",
      disabled,
      children: spaces.map((space) => ({ id: `space:move:${space.id}`, label: space.name })),
    });
  }
  return items;
}

/** Shows a thread's menu with the space actions after the new-thread actions, before Rename's group. */
export function showThreadMenuWithSpaces<Id extends string>(
  api: Pick<LocalApi, "contextMenu">,
  threadRef: ScopedThreadRef,
  items: ReadonlyArray<ContextMenuItem<Id>>,
  position: { readonly x: number; readonly y: number },
): Promise<Id | SpaceThreadMenuId | null> {
  const spaceItems = spaceThreadMenuItems(threadRef);
  const at = items.findIndex((item) => item.id === "rename");
  return api.contextMenu.show<Id | SpaceThreadMenuId>(
    at === -1
      ? [...items, ...spaceItems]
      : [...items.slice(0, at), ...spaceItems, ...items.slice(at)],
    position,
  );
}

const reportFailure = (title: string, error: unknown) =>
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      ...(error instanceof Error ? { description: error.message } : {}),
    }),
  );

export async function runSpaceThreadMenuAction(
  action: SpaceThreadMenuId,
  target: { readonly threadRef: ScopedThreadRef; readonly title: string },
  openThread?: (threadRef: ScopedThreadRef) => unknown,
): Promise<void> {
  // The "Move to space" submenu parent carries no space id.
  if (action === "space:move:") return;
  const { environmentId, threadId } = target.threadRef;
  const options = { label: `space thread action ${action}`, reportFailure: false };
  const result =
    action === "space:start"
      ? await runAtomCommand(
          appAtomRegistry,
          createSpace,
          { environmentId, input: { name: target.title, threadIds: [threadId] } },
          options,
        )
      : await runAtomCommand(
          appAtomRegistry,
          setSpaceThread,
          {
            environmentId,
            input: {
              threadId,
              spaceId:
                action === "space:remove" ? null : SpaceId.make(action.slice("space:move:".length)),
            },
          },
          options,
        );
  if (result._tag === "Success") {
    if (action !== "space:remove") openThread?.(target.threadRef);
    return;
  }
  if (isAtomCommandInterrupted(result)) return;
  reportFailure(
    action === "space:start"
      ? "Could not start a space"
      : action === "space:remove"
        ? "Could not remove the thread from its space"
        : "Could not move the thread",
    squashAtomCommandFailure(result),
  );
}
