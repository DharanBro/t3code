import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useRouter } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";
import { memo } from "react";

import { resolveSidebarFolderDot, resolveThreadLastVisitedAt } from "../components/Sidebar.logic";
import { useSidebar } from "../components/ui/sidebar";
import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";
import { cn } from "../lib/utils";
import { useQuietThreadShells } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import { pickSpaceTabToOpen, resolveSpaceTabs } from "./spaceTabs.logic";
import { useSpaces } from "./spacesState";

// Same dots as a closed project folder.
const DOT_CLASS_NAME = {
  attention: "bg-warning",
  failed: "bg-error",
  unread: "bg-success",
  working: "bg-info",
} as const;

const DOT_LABEL = {
  attention: ", needs you",
  failed: ", failed",
  unread: ", done",
  working: ", working",
} as const;

const shellKey = (thread: EnvironmentThreadShell) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

/** One row per space above the thread list; a row opens the tab visited last. */
export const SpacesSidebarBlock = memo(function SpacesSidebarBlock() {
  const spaces = useSpaces();
  const threads = useQuietThreadShells();
  const localLastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const routeRef = useThreadRouteRef();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  if (spaces.length === 0) return null;

  const threadByKey = new Map(threads.map((thread) => [shellKey(thread), thread]));
  const routeKey = routeRef === null ? null : scopedThreadKey(routeRef);
  const lastVisitedAt = (thread: EnvironmentThreadShell) =>
    resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAtByKey[shellKey(thread)]);
  const openThread = (thread: EnvironmentThreadShell) => {
    if (isMobile) setOpenMobile(false);
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  };

  return (
    <>
      <li className="list-none px-2 pt-1 pb-0.5 text-xs font-medium text-sidebar-muted-foreground">
        Spaces
      </li>
      {spaces.map(({ environmentId, space }) => {
        const tabs = resolveSpaceTabs(environmentId, space.threadIds, threadByKey);
        const target = pickSpaceTabToOpen(tabs, lastVisitedAt);
        const isActive = tabs.some((tab) => shellKey(tab) === routeKey);
        const dot = resolveSidebarFolderDot(
          tabs.map((tab) => ({ ...tab, lastVisitedAt: lastVisitedAt(tab) })),
        );
        return (
          <li key={`${environmentId}:${space.id}`} className="list-none py-0.5">
            <button
              type="button"
              data-sidebar-row={`space:${environmentId}:${space.id}`}
              data-testid="sidebar-space-row"
              aria-current={isActive ? "page" : undefined}
              disabled={target === null}
              onClick={() => {
                if (target !== null) openThread(target);
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
                <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS_NAME[dot])}>
                  <span className="sr-only">{DOT_LABEL[dot]}</span>
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
