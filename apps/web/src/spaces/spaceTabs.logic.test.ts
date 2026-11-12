import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "../composerDraftStore";
import { pickSpaceTabToOpen, resolveSpaceTabs } from "./spaceTabs.logic";

const environmentId = EnvironmentId.make("env-1");
const thread = (id: string, lastVisitedAt?: string) => ({ id, lastVisitedAt });
const byKey = (...threads: ReadonlyArray<ReturnType<typeof thread>>) =>
  new Map(
    threads.map((entry) => [
      scopedThreadKey(scopeThreadRef(environmentId, ThreadId.make(entry.id))),
      entry,
    ]),
  );

describe("space tabs", () => {
  it("keeps tab order, shows unsent drafts, and drops ids with neither, such as deleted threads", () => {
    const tabs = resolveSpaceTabs(
      environmentId,
      ["t3", "gone", "draft", "t1"].map((id) => ThreadId.make(id)),
      byKey(thread("t1"), thread("t3")),
      new Map([
        [
          scopedThreadKey(scopeThreadRef(environmentId, ThreadId.make("draft"))),
          DraftId.make("draft-1"),
        ],
      ]),
    );
    expect(tabs.map((tab) => [tab.threadId, tab.thread?.id ?? null, tab.draftId])).toEqual([
      ["t3", "t3", null],
      ["draft", null, "draft-1"],
      ["t1", "t1", null],
    ]);
  });

  it("opens the tab visited last, or the first tab when none was visited", () => {
    const visitedAt = (tab: ReturnType<typeof thread>) => tab.lastVisitedAt;
    expect(
      pickSpaceTabToOpen(
        [
          thread("t1", "2026-11-12T09:00:00.000Z"),
          thread("t2"),
          thread("t3", "2026-11-12T10:00:00.000Z"),
        ],
        visitedAt,
      )?.id,
    ).toBe("t3");
    expect(pickSpaceTabToOpen([thread("t1"), thread("t2")], visitedAt)?.id).toBe("t1");
    expect(pickSpaceTabToOpen([], visitedAt)).toBeNull();
  });
});
