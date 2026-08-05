import { describe, expect, it } from "vitest";
import type { ChangedFile, ReviewComment } from "../types.ts";
import {
  adjacentCommentItem,
  adjacentSelectableAnchor,
  armedThreadAt,
  buildReviewItems,
  clampFastStep,
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
    ask: null,
    collapsed: new Map(),
    commentsByFile: new Map([[FILE.filename, comments]]),
    expandedRows: new Map(),
    files: [FILE],
    isImage: () => false,
    openBoxes: new Map(),
    pendingByFile: new Map(),
  });
}

const LONG_PATCH = `@@ -1,12 +1,12 @@
 const a = 1;
 const b = 2;
 const c = 3;
 const d = 4;
 const e = 5;
 const f = 6;
 const g = 7;
 const h = 8;
 const i = 9;
 const j = 10;
 const k = 11;
 const l = 12;`;

const LONG_FILE: ChangedFile = {
  ...FILE,
  filename: "src/consts.ts",
  patch: LONG_PATCH,
};

function buildLong(opts: { commentOn?: number; boxOn?: number } = {}) {
  const comments =
    opts.commentOn === undefined
      ? []
      : [
          comment({
            line: opts.commentOn,
            originalLine: opts.commentOn,
            path: LONG_FILE.filename,
          }),
        ];
  return buildReviewItems({
    ask: null,
    collapsed: new Map(),
    commentsByFile: new Map([[LONG_FILE.filename, comments]]),
    expandedRows: new Map(),
    files: [LONG_FILE],
    isImage: () => false,
    openBoxes:
      opts.boxOn === undefined
        ? new Map()
        : new Map([[fileAnchorKey(0, `RIGHT:${opts.boxOn}`), null]]),
    pendingByFile: new Map(),
  });
}

function buildLongCommentedOn(lines: number[]) {
  return buildReviewItems({
    ask: null,
    collapsed: new Map(),
    commentsByFile: new Map([
      [
        LONG_FILE.filename,
        lines.map((line, i) =>
          comment({
            id: i + 1,
            line,
            originalLine: line,
            path: LONG_FILE.filename,
            threadId: `t${i + 1}`,
          })
        ),
      ],
    ]),
    expandedRows: new Map(),
    files: [LONG_FILE],
    isImage: () => false,
    openBoxes: new Map(),
    pendingByFile: new Map(),
  });
}

const FAST_STEP = 5;

const NO_CURSOR = -1;

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

describe("buildReviewItems ask", () => {
  const withAsk = (ask: { anchor: string; fileIndex: number } | null) =>
    buildReviewItems({
      ask,
      collapsed: new Map(),
      commentsByFile: new Map([[FILE.filename, [comment()]]]),
      expandedRows: new Map(),
      files: [FILE],
      isImage: () => false,
      openBoxes: new Map(),
      pendingByFile: new Map(),
    });

  it("slots the ask item after the row's comment block, off the nav", () => {
    const m = withAsk({ anchor: "RIGHT:2", fileIndex: 0 });

    expect(m.askItem).not.toBeNull();
    const item = m.items[m.askItem as number];
    expect(item.kind).toBe("ask");
    const commentsIdx =
      m.nav[m.navIndexOf.get(navKey(0, "RIGHT:2", "comments")) as number]
        .itemIndex;
    expect(m.askItem).toBe(commentsIdx + 1);
    expect(m.nav.some((n) => n.itemIndex === m.askItem)).toBe(false);
  });

  it("reports no slot when the anchor is not in the diff", () => {
    const m = withAsk({ anchor: "RIGHT:99", fileIndex: 0 });

    expect(m.askItem).toBeNull();
    expect(m.items.some((i) => i.kind === "ask")).toBe(false);
  });

  it("reports no slot without an ask", () => {
    expect(withAsk(null).askItem).toBeNull();
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

describe("clampFastStep", () => {
  it("stops at a thread the jump would have crossed", () => {
    const m = buildLong({ commentOn: 4 });
    const threadIdx = m.navIndexOf.get(navKey(0, "RIGHT:4", "comments"));

    expect(clampFastStep(m, 0, FAST_STEP, false)).toBe(threadIdx);
  });

  it("takes the full step when the span holds no thread", () => {
    const m = buildLong({ commentOn: 4 });
    const from = m.navIndexOf.get(navKey(0, "RIGHT:6", "row")) as number;

    expect(clampFastStep(m, from, FAST_STEP, false)).toBe(from + FAST_STEP);
  });

  it("behaves exactly like an unclamped hop in a file with no threads", () => {
    const m = buildLong();

    expect(clampFastStep(m, 0, FAST_STEP, false)).toBe(FAST_STEP);
  });

  it("advances past the thread on the row it is already sitting on", () => {
    const m = buildLong({ commentOn: 1 });

    expect(clampFastStep(m, 0, FAST_STEP, false)).toBe(FAST_STEP);
  });

  it("advances past the thread it is already sitting on", () => {
    const m = buildLong({ commentOn: 4 });
    const threadIdx = m.navIndexOf.get(
      navKey(0, "RIGHT:4", "comments")
    ) as number;

    expect(clampFastStep(m, threadIdx, FAST_STEP, false)).toBe(
      threadIdx + FAST_STEP
    );
  });

  it("clamps going up as well as down", () => {
    const m = buildLong({ commentOn: 4 });
    const threadIdx = m.navIndexOf.get(navKey(0, "RIGHT:4", "comments"));
    const from = m.navIndexOf.get(navKey(0, "RIGHT:8", "row")) as number;

    expect(clampFastStep(m, from, -FAST_STEP, false)).toBe(threadIdx);
    expect(threadIdx).not.toBe(from - FAST_STEP);
  });

  it("ignores threads while the key is held", () => {
    const m = buildLong({ commentOn: 4 });

    expect(clampFastStep(m, 0, FAST_STEP, true)).toBe(FAST_STEP);
  });

  it("stops at an open composer even while the key is held", () => {
    const m = buildLong({ boxOn: 4 });
    const boxIdx = m.navIndexOf.get(navKey(0, "RIGHT:4", "comments"));

    expect(clampFastStep(m, 0, FAST_STEP, true)).toBe(boxIdx);
  });

  it("stops at an open composer on the row it is already sitting on, even while held", () => {
    const m = buildLong({ boxOn: 1 });
    const boxIdx = m.navIndexOf.get(navKey(0, "RIGHT:1", "comments"));

    expect(clampFastStep(m, 0, FAST_STEP, true)).toBe(boxIdx);
  });

  it("never walks past the ends of the list", () => {
    const m = buildLong({ commentOn: 4 });

    expect(clampFastStep(m, 0, -FAST_STEP, false)).toBe(0);
    expect(clampFastStep(m, m.nav.length - 1, FAST_STEP, false)).toBe(
      m.nav.length - 1
    );
  });
});

describe("adjacentCommentItem", () => {
  it("has nowhere to go in a PR with no comments", () => {
    const m = buildLong();

    expect(adjacentCommentItem(m, NO_CURSOR, 1)).toBeUndefined();
    expect(adjacentCommentItem(m, NO_CURSOR, -1)).toBeUndefined();
  });

  it("steps to the next block, then wraps to the first", () => {
    const m = buildLongCommentedOn([2, 8]);
    const [first, second] = m.commentItems;

    expect(adjacentCommentItem(m, first, 1)).toBe(second);
    expect(adjacentCommentItem(m, second, 1)).toBe(first);
  });

  it("steps to the previous block, then wraps to the last", () => {
    const m = buildLongCommentedOn([2, 8]);
    const [first, second] = m.commentItems;

    expect(adjacentCommentItem(m, second, -1)).toBe(first);
    expect(adjacentCommentItem(m, first, -1)).toBe(second);
  });

  it("lands on the block of the row the cursor sits on", () => {
    const m = buildLongCommentedOn([2, 8]);
    const rowNav = m.navIndexOf.get(navKey(0, "RIGHT:2", "row")) as number;

    expect(adjacentCommentItem(m, m.nav[rowNav].itemIndex, 1)).toBe(
      m.commentItems[0]
    );
  });

  it("enters at the first block forward and the last block backward with no cursor", () => {
    const m = buildLongCommentedOn([2, 8]);

    expect(adjacentCommentItem(m, NO_CURSOR, 1)).toBe(m.commentItems[0]);
    expect(adjacentCommentItem(m, NO_CURSOR, -1)).toBe(m.commentItems.at(-1));
  });
});

describe("armedThreadAt", () => {
  it("arms the block's first thread, with the file it belongs to", () => {
    const m = buildLongCommentedOn([2]);

    expect(armedThreadAt(m, [LONG_FILE], m.commentItems[0])).toEqual({
      path: LONG_FILE.filename,
      rootId: 1,
    });
  });

  it("arms nothing on a row, or off the end of the item list", () => {
    const m = buildLongCommentedOn([2]);
    const rowNav = m.navIndexOf.get(navKey(0, "RIGHT:2", "row")) as number;

    expect(armedThreadAt(m, [LONG_FILE], m.nav[rowNav].itemIndex)).toBeNull();
    expect(armedThreadAt(m, [LONG_FILE], m.items.length)).toBeNull();
  });

  it("arms nothing on a block that holds only a pending comment", () => {
    const m = buildReviewItems({
      ask: null,
      collapsed: new Map(),
      commentsByFile: new Map(),
      expandedRows: new Map(),
      files: [LONG_FILE],
      isImage: () => false,
      openBoxes: new Map(),
      pendingByFile: new Map([
        [
          LONG_FILE.filename,
          [
            {
              body: "not sent yet",
              id: "p1",
              line: 2,
              path: LONG_FILE.filename,
              side: "RIGHT",
            },
          ],
        ],
      ]),
    });

    expect(m.commentItems).toHaveLength(1);
    expect(armedThreadAt(m, [LONG_FILE], m.commentItems[0])).toBeNull();
  });
});
