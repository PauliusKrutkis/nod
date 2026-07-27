import { describe, expect, it } from "vitest";
import type { ChangedFile, ReviewComment } from "../types.ts";
import {
  adjacentSelectableAnchor,
  buildReviewItems,
  fileAnchorKey,
  navKey,
} from "./review-items.ts";

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

function comment(over: Partial<ReviewComment> = {}): ReviewComment {
  return {
    body: "why not a constant?",
    createdAt: "2026-01-01T00:00:00Z",
    diffHunk: "",
    id: 1,
    inReplyToId: null,
    line: 2,
    originalLine: 2,
    path: "src/retry.ts",
    resolved: false,
    side: "RIGHT",
    threadId: "t1",
    user: "octocat",
    userAvatarUrl: "",
    ...over,
  };
}

function build(comments: ReviewComment[]) {
  return buildReviewItems({
    collapsed: new Map(),
    commentsByFile: new Map([[FILE.filename, comments]]),
    expandedRows: new Map(),
    files: [FILE],
    isImage: () => false,
    openBoxes: new Map(),
    pendingByFile: new Map(),
  });
}

describe("navKey", () => {
  it("keeps the row key byte-identical to fileAnchorKey", () => {
    expect(navKey(0, "RIGHT:2", "row")).toBe(fileAnchorKey(0, "RIGHT:2"));
  });

  it("distinguishes a comment block from its parent row", () => {
    expect(navKey(0, "RIGHT:2", "comments")).not.toBe(
      navKey(0, "RIGHT:2", "row")
    );
  });
});

describe("buildReviewItems nav", () => {
  it("makes a comment block a cursor stop right after its row", () => {
    const m = build([comment()]);
    const rowIdx = m.navIndexOf.get(navKey(0, "RIGHT:2", "row"));
    const threadIdx = m.navIndexOf.get(navKey(0, "RIGHT:2", "comments"));

    expect(rowIdx).toBeDefined();
    expect(threadIdx).toBe((rowIdx as number) + 1);
    expect(m.nav[threadIdx as number].kind).toBe("comments");
    expect(m.items[m.nav[threadIdx as number].itemIndex].kind).toBe("comments");
  });

  it("does not let the comment block evict its row from navIndexOf", () => {
    const m = build([comment()]);
    const rowIdx = m.navIndexOf.get(fileAnchorKey(0, "RIGHT:2"));

    expect(rowIdx).toBeDefined();
    expect(m.nav[rowIdx as number].kind).toBe("row");
  });

  it("leaves uncommented rows as the only stops", () => {
    const m = build([]);

    expect(m.nav.every((n) => n.kind === "row")).toBe(true);
    expect(m.navIndexOf.has(navKey(0, "RIGHT:2", "comments"))).toBe(false);
  });

  it("adds one stop per commented row, not per thread", () => {
    const m = build([
      comment({ id: 1, threadId: "t1" }),
      comment({ id: 2, threadId: "t2" }),
    ]);
    const stops = m.nav.filter((n) => n.kind === "comments");

    expect(stops).toHaveLength(1);
  });
});

describe("adjacentSelectableAnchor", () => {
  it("steps over a comment block instead of dead-ending on it", () => {
    const m = build([comment()]);

    expect(adjacentSelectableAnchor(m, 0, "RIGHT", 0, "RIGHT:2", 1)).toBe(
      "RIGHT:3"
    );
  });

  it("steps back over a comment block belonging to the row above", () => {
    const m = build([comment()]);

    expect(adjacentSelectableAnchor(m, 0, "RIGHT", 0, "RIGHT:3", -1)).toBe(
      "RIGHT:2"
    );
  });

  it("matches the uncommented walk in both directions", () => {
    const plain = build([]);
    const commented = build([comment()]);

    expect(
      adjacentSelectableAnchor(commented, 0, "RIGHT", 0, "RIGHT:2", 1)
    ).toBe(adjacentSelectableAnchor(plain, 0, "RIGHT", 0, "RIGHT:2", 1));
  });
});
