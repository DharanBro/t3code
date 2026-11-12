import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { memo } from "react";

import { resolveSidebarFolderDot } from "../components/Sidebar.logic";
import { Button } from "../components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../components/ui/menu";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import { useQuietThreadShells } from "../state/entities";
import { useAtomCommand } from "../state/use-atom-command";
import { SPACE_DOT_CLASS_NAME, SPACE_DOT_LABEL } from "./spaceDot";
import { resolveSpaceTabs, type SpaceTab } from "./spaceTabs.logic";
import {
  findSpaceOfThread,
  setSpaceThread,
  useDraftIdByThreadKey,
  useOpenSpaceTab,
  useSpaces,
} from "./spacesState";

const reportFailure = (title: string, error: unknown) =>
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      ...(error instanceof Error ? { description: error.message } : {}),
    }),
  );

/** One tab per agent thread in the open thread's space; renders nothing outside a space. */
export const SpaceTabStrip = memo(function SpaceTabStrip(props: {
  threadRef: ScopedThreadRef | null;
  /** The open tab has not sent its first message, so it has no folder to share yet. */
  isDraft: boolean;
}) {
  const spaces = useSpaces();
  const threads = useQuietThreadShells();
  const draftIdByKey = useDraftIdByThreadKey();
  const openTab = useOpenSpaceTab();
  const handleNewThread = useNewThreadHandler();
  const setThread = useAtomCommand(setSpaceThread, { label: "space tab", reportFailure: false });
  const { threadRef } = props;
  const owner = threadRef === null ? null : findSpaceOfThread(spaces, threadRef);
  if (threadRef === null || owner === null) return null;

  const { environmentId, space } = owner;
  const threadByKey = new Map(
    threads.map((thread) => [
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      thread,
    ]),
  );
  const tabs = resolveSpaceTabs(environmentId, space.threadIds, threadByKey, draftIdByKey);
  const current = props.isDraft ? null : (threadByKey.get(scopedThreadKey(threadRef)) ?? null);

  const addTab = async (ownWorktree: boolean) => {
    if (current === null) return;
    let created: Awaited<ReturnType<typeof handleNewThread>>;
    try {
      created = await handleNewThread(
        scopeProjectRef(environmentId, current.projectId),
        ownWorktree
          ? {
              branch: current.branch,
              worktreePath: null,
              envMode: "worktree",
              startFromOrigin: false,
            }
          : {
              branch: current.branch,
              worktreePath: current.worktreePath,
              envMode: current.worktreePath ? "worktree" : "local",
              startFromOrigin: false,
            },
      );
    } catch (error) {
      reportFailure("Could not open a new tab", error);
      return;
    }
    if (created === null) return;
    const result = await setThread({
      environmentId,
      input: { threadId: created.threadId, spaceId: space.id },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not add the tab to this space", squashAtomCommandFailure(result));
    }
  };

  const showTabMenu = async (
    tab: SpaceTab<EnvironmentThreadShell>,
    position: { x: number; y: number },
  ) => {
    const picked = await readLocalApi()?.contextMenu.show(
      [{ id: "remove", label: "Remove from space" }],
      position,
    );
    if (picked !== "remove") return;
    const result = await setThread({
      environmentId,
      input: { threadId: tab.threadId, spaceId: null },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not remove the tab", squashAtomCommandFailure(result));
    }
  };

  return (
    <div
      role="tablist"
      aria-label={space.name}
      data-testid="space-tab-strip"
      className="flex shrink-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border bg-background pt-1 pr-(--workspace-gutter-end) pl-(--workspace-gutter-start)"
    >
      {tabs.map((tab) => {
        const isActive = tab.threadId === threadRef.threadId;
        const dot = tab.thread === null ? null : resolveSidebarFolderDot([tab.thread]);
        return (
          <button
            key={tab.threadId}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) void openTab(environmentId, tab);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              void showTabMenu(tab, { x: event.clientX, y: event.clientY });
            }}
            className={cn(
              "flex h-8 max-w-56 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              isActive
                ? "border-border bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {dot ? (
              <span className={cn("size-1.5 shrink-0 rounded-full", SPACE_DOT_CLASS_NAME[dot])}>
                <span className="sr-only">{SPACE_DOT_LABEL[dot]}</span>
              </span>
            ) : null}
            <span className="min-w-0 truncate">{tab.thread?.title ?? "New tab"}</span>
          </button>
        );
      })}
      <span className="mb-1 ml-1 shrink-0">
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                disabled={current === null}
                aria-label={
                  current === null ? "New tab, after this tab's first message" : "New tab"
                }
                title={
                  current === null
                    ? "Send this tab's first message to give the space a folder"
                    : "New tab"
                }
              />
            }
          >
            <PlusIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup align="start">
            <MenuItem onClick={() => void addTab(false)}>New tab in this folder</MenuItem>
            <MenuItem onClick={() => void addTab(true)}>New tab in its own worktree</MenuItem>
          </MenuPopup>
        </Menu>
      </span>
    </div>
  );
});
