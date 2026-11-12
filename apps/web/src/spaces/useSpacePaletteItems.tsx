import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { FolderMinusIcon, FolderPlusIcon, LayersIcon } from "lucide-react";

import { type CommandPaletteActionItem, ITEM_ICON_CLASS } from "../components/CommandPalette.logic";
import { useQuietThreadShells } from "../state/entities";
import { pickSpaceTabToOpen, resolveSpaceTabs } from "./spaceTabs.logic";
import { runSpaceThreadMenuAction } from "./spaceThreadMenu";
import {
  findSpaceOfThread,
  useDraftIdByThreadKey,
  useOpenSpaceTab,
  useSpaces,
} from "./spacesState";

/** Palette entries: start or leave a space for the open thread, and open any space. */
export function useSpacePaletteItems(
  activeThread: {
    readonly environmentId: EnvironmentId;
    readonly id: ThreadId;
    readonly title: string;
  } | null,
): CommandPaletteActionItem[] {
  const spaces = useSpaces();
  const threads = useQuietThreadShells();
  const draftIdByKey = useDraftIdByThreadKey();
  const openTab = useOpenSpaceTab();
  const items: CommandPaletteActionItem[] = [];

  if (activeThread !== null) {
    const target = {
      threadRef: scopeThreadRef(activeThread.environmentId, activeThread.id),
      title: activeThread.title,
    };
    items.push(
      findSpaceOfThread(spaces, target.threadRef) === null
        ? {
            kind: "action",
            value: "action:space-start",
            searchTerms: ["space", "start", "group", "tabs", "agents"],
            title: "Start a space from this thread",
            icon: <FolderPlusIcon className={ITEM_ICON_CLASS} />,
            run: () => runSpaceThreadMenuAction("space:start", target),
          }
        : {
            kind: "action",
            value: "action:space-remove",
            searchTerms: ["space", "remove", "leave", "tabs"],
            title: "Remove this thread from its space",
            icon: <FolderMinusIcon className={ITEM_ICON_CLASS} />,
            run: () => runSpaceThreadMenuAction("space:remove", target),
          },
    );
  }

  const threadByKey = new Map(
    threads.map((thread) => [
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      thread,
    ]),
  );
  for (const { environmentId, space } of spaces) {
    const tab = pickSpaceTabToOpen(
      resolveSpaceTabs(environmentId, space.threadIds, threadByKey, draftIdByKey),
      (candidate) => candidate.thread?.lastVisitedAt ?? undefined,
    );
    if (tab === null) continue;
    items.push({
      kind: "action",
      value: `action:space-open:${environmentId}:${space.id}`,
      searchTerms: ["space", "open", space.name],
      title: `Open space: ${space.name}`,
      icon: <LayersIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        await openTab(environmentId, tab);
      },
    });
  }
  return items;
}
