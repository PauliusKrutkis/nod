import { describe, expect, it } from "vitest";
import type { ChangedFile } from "../types.ts";
import { rangeFromAnchors } from "./drag-range.ts";
import { buildReviewItems } from "./review-items.ts";

const PATCH = `@@ -1,4 +1,4 @@
 export function withRetry() {
-  const retryCount = 3;
+  const retryLimit = 3;
   let delay = 100;
 }
@@ -20,2 +20,3 @@
 function tail() {
+  return 1;
 }`;

const FILE: ChangedFile = {
  additions: 2,
  changes: 3,
  deletions: 1,
  filename: "src/retry.ts",
  patch: PATCH,
  sha: "abc123",
  status: "modified",
};

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

const at = (anchor: string) => ({ anchor, fileIndex: 0 });

describe("rangeFromAnchors", () => {
  it("builds a one-sided range from the rows a drag covered", () => {
    expect(
      rangeFromAnchors(model(), [at("RIGHT:1"), at("RIGHT:2"), at("RIGHT:3")])
    ).toEqual({
      fileIndex: 0,
      from: "RIGHT:1",
      hunkIndex: 0,
      side: "RIGHT",
      to: "RIGHT:3",
    });
  });

  it("keeps the first row's side and ignores the other one", () => {
    const range = rangeFromAnchors(model(), [
      at("RIGHT:1"),
      at("LEFT:2"),
      at("RIGHT:2"),
    ]);
    expect(range?.side).toBe("RIGHT");
    expect(range?.to).toBe("RIGHT:2");
  });

  it("clamps at a hunk boundary instead of spanning it", () => {
    const range = rangeFromAnchors(model(), [
      at("RIGHT:3"),
      at("RIGHT:4"),
      at("RIGHT:20"),
      at("RIGHT:21"),
    ]);
    expect(range?.from).toBe("RIGHT:3");
    expect(range?.to).toBe("RIGHT:4");
  });

  it("answers null for a single row, an empty drag, or unknown anchors", () => {
    expect(rangeFromAnchors(model(), [at("RIGHT:2")])).toBeNull();
    expect(rangeFromAnchors(model(), [])).toBeNull();
    expect(
      rangeFromAnchors(model(), [at("RIGHT:999"), at("RIGHT:1000")])
    ).toBeNull();
  });
});
