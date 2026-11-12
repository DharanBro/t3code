import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { LayersIcon } from "lucide-react";
import { memo, useState } from "react";

import { resolveSidebarFolderDot, resolveThreadLastVisitedAt } from "../components/Sidebar.logic";
import { Input } from "../components/ui/input";
import { useSidebar } from "../components/ui/sidebar";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import { useQuietThreadShells } from "../state/entities";
import { readEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { useUiStateStore } from "../uiStateStore";
import { SPACE_DOT_CLASS_NAME, SPACE_DOT_LABEL } from "./spaceDot";
import { pickSpaceTabToOpen, resolveSpaceTabs, type SpaceTab } from "./spaceTabs.logic";
import {
  deleteSpace,
  renameSpace,
  useDraftIdByThreadKey,
  useOpenSpaceTab,
  useSpaces,
  type EnvironmentSpace,
} from "./spacesState";

const shellKey = (thread: EnvironmentThreadShell) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

const reportFailure = (title: string, error: unknown) =>
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      ...(error instanceof Error ? { description: error.message } : {}),
    }),
  );

/** One row per space above the thread list; a row opens the tab visited last. */
export const SpacesSidebarBlock = memo(function SpacesSidebarBlock() {
  const spaces = useSpaces();
  const threads = useQuietThreadShells();
  const draftIdByKey = useDraftIdByThreadKey();
  const localLastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const routeRef = useThreadRouteRef();
  const openTab = useOpenSpaceTab();
  const { isMobile, setOpenMobile } = useSidebar();
  const rename = useAtomCommand(renameSpace, { label: "rename space", reportFailure: false });
  const remove = useAtomCommand(deleteSpace, { label: "delete space", reportFailure: false });
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  if (spaces.length === 0) return null;

  const threadByKey = new Map(threads.map((thread) => [shellKey(thread), thread]));
  const routeKey = routeRef === null ? null : scopedThreadKey(routeRef);
  const lastVisitedAt = (tab: SpaceTab<EnvironmentThreadShell>) =>
    tab.thread === null
      ? undefined
      : resolveThreadLastVisitedAt(
          tab.thread.lastVisitedAt,
          localLastVisitedAtByKey[shellKey(tab.thread)],
        );

  const commitRename = async ({ environmentId, space }: EnvironmentSpace, name: string) => {
    setRenamingKey(null);
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === space.name) return;
    const result = await rename({ environmentId, input: { spaceId: space.id, name: trimmed } });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not rename the space", squashAtomCommandFailure(result));
    }
  };

  const showSpaceMenu = async (
    entry: EnvironmentSpace,
    rowKey: string,
    position: { x: number; y: number },
  ) => {
    const api = readLocalApi();
    if (!api) return;
    const canOperate = readEnvironmentScope(entry.environmentId, AuthOrchestrationOperateScope);
    const picked = await api.contextMenu.show(
      [
        { id: "rename", label: "Rename space", icon: "pencil", disabled: !canOperate },
        {
          id: "delete",
          label: "Delete space",
          icon: "trash",
          destructive: true,
          disabled: !canOperate,
          separatorBefore: true,
        },
      ],
      position,
    );
    if (picked === "rename") {
      setRenamingKey(rowKey);
      return;
    }
    if (picked !== "delete") return;
    const confirmed = await api.dialogs.confirm(
      `Delete the space "${entry.space.name}"? Its threads are kept and return to the thread list.`,
      { variant: "destructive" },
    );
    if (!confirmed) return;
    const result = await remove({
      environmentId: entry.environmentId,
      input: { spaceId: entry.space.id },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not delete the space", squashAtomCommandFailure(result));
    }
  };

  return (
    <>
      <li className="list-none px-2 pt-1 pb-0.5 text-xs font-medium text-sidebar-muted-foreground">
        Spaces
      </li>
      {spaces.map((entry) => {
        const { environmentId, space } = entry;
        const rowKey = `${environmentId}:${space.id}`;
        const tabs = resolveSpaceTabs(environmentId, space.threadIds, threadByKey, draftIdByKey);
        const target = pickSpaceTabToOpen(tabs, lastVisitedAt);
        const isActive = tabs.some(
          (tab) => scopedThreadKey(scopeThreadRef(environmentId, tab.threadId)) === routeKey,
        );
        const dot = resolveSidebarFolderDot(
          tabs.flatMap((tab) =>
            tab.thread === null ? [] : [{ ...tab.thread, lastVisitedAt: lastVisitedAt(tab) }],
          ),
        );
        if (renamingKey === rowKey) {
          return (
            <li key={rowKey} className="list-none py-0.5">
              <Input
                size="sm"
                aria-label="Space name"
                defaultValue={space.name}
                ref={(element) => element?.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename(entry, event.currentTarget.value);
                  if (event.key === "Escape") setRenamingKey(null);
                }}
                onBlur={(event) => void commitRename(entry, event.currentTarget.value)}
              />
            </li>
          );
        }
        return (
          <li key={rowKey} className="list-none py-0.5">
            <button
              type="button"
              data-sidebar-row={`space:${rowKey}`}
              data-testid="sidebar-space-row"
              aria-current={isActive ? "page" : undefined}
              disabled={target === null}
              onClick={() => {
                if (target === null) return;
                if (isMobile) setOpenMobile(false);
                void openTab(environmentId, target);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                void showSpaceMenu(entry, rowKey, { x: event.clientX, y: event.clientY });
              }}
              className={cn(
                "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
                isActive && "bg-sidebar-row-active",
              )}
            >
              <LayersIcon aria-hidden className="size-4 shrink-0 text-sidebar-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground/90">
                {space.name}
              </span>
              {dot ? (
                <span className={cn("size-1.5 shrink-0 rounded-full", SPACE_DOT_CLASS_NAME[dot])}>
                  <span className="sr-only">{SPACE_DOT_LABEL[dot]}</span>
                </span>
              ) : null}
              <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground">
                {tabs.length}
              </span>
            </button>
          </li>
        );
      })}
      <li aria-hidden className="mx-2.5 my-1.5 h-px list-none bg-sidebar-border/60" />
    </>
  );
});
