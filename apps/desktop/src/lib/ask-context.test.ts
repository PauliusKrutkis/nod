import { describe, expect, it } from "vitest";
import type { ChangedFile, PullRequest } from "../types.ts";
import { askTargetLabel, buildAskContext } from "./ask-context.ts";
import { buildReviewItems, fileAnchorKey } from "./review-items.ts";

const PATCH = `@@ -1,4 +1,4 @@
 export function withRetry() {
-  const retryCount = 3;
+  const retryLimit = 3;
   let delay = 100;
 }`;

const FILE: ChangedFile = {
  additions: 1,
  changes: 2,
  deletions: 1,
  filename: "src/retry.ts",
  patch: PATCH,
  sha: "abc123",
  status: "modified",
};

const PR = {
  body: "Renames the retry knob.",
  headSha: "abc123",
  owner: "acme",
  repo: "widget-app",
  title: "Rename retryCount",
} as PullRequest;

function model() {
  return buildReviewItems({
    ask: null,
    collapsed: new Map(),
    commentsByFile: new Map(),
    expandedRows: new Map(),
    files: [FILE],
    isImage: () => false,
    openBoxes: new Map(),
    pendingByFile: new Map(),
  });
}

function itemIndexOf(m: ReturnType<typeof model>, anchor: string): number {
  const index = m.anchorItem.get(fileAnchorKey(0, anchor));
  if (index === undefined) {
    throw new Error(`no item for ${anchor}`);
  }
  return index;
}

describe("buildAskContext", () => {
  it("uses the selection rows and labels their line range", () => {
    const m = model();
    const fromItem = itemIndexOf(m, "RIGHT:2");
    const toItem = itemIndexOf(m, "RIGHT:3");

    const context = buildAskContext({
      cursor: null,
      files: [FILE],
      model: m,
      pr: PR,
      selection: { fileIndex: 0, fromItem, side: "RIGHT", toItem },
    });

    expect(context.filePath).toBe("src/retry.ts");
    expect(context.lineRange).toBe("2–3");
    expect(context.code).toBe("  const retryLimit = 3;\n  let delay = 100;");
    expect(context.diffSummary).toBeNull();
    expect(context.prTitle).toBe("Rename retryCount");
  });

  it("falls back to the cursor row", () => {
    const context = buildAskContext({
      cursor: { anchor: "RIGHT:2", fileIndex: 0, kind: "row" },
      files: [FILE],
      model: model(),
      pr: PR,
      selection: null,
    });

    expect(context.filePath).toBe("src/retry.ts");
    expect(context.lineRange).toBe("2");
    expect(context.code).toBe("  const retryLimit = 3;");
  });

  it("summarizes changed files when nothing is focused", () => {
    const context = buildAskContext({
      cursor: null,
      files: [FILE],
      model: model(),
      pr: PR,
      selection: null,
    });

    expect(context.code).toBeNull();
    expect(context.filePath).toBeNull();
    expect(context.diffSummary).toBe("src/retry.ts (+1 -1)");
    expect(context.owner).toBe("acme");
    expect(context.repo).toBe("widget-app");
    expect(context.headSha).toBe("abc123");
  });

  it("labels the target without building the summary", () => {
    const m = model();
    expect(
      askTargetLabel({
        cursor: { anchor: "RIGHT:2", fileIndex: 0, kind: "row" },
        files: [FILE],
        model: m,
        selection: null,
      })
    ).toBe("src/retry.ts:2");
    expect(
      askTargetLabel({ cursor: null, files: [FILE], model: m, selection: null })
    ).toBe("Whole pull request");
  });

  it("falls through to the summary when the cursor anchor is stale", () => {
    const context = buildAskContext({
      cursor: { anchor: "RIGHT:999", fileIndex: 0, kind: "row" },
      files: [FILE],
      model: model(),
      pr: PR,
      selection: null,
    });

    expect(context.code).toBeNull();
    expect(context.diffSummary).toBe("src/retry.ts (+1 -1)");
  });
});
