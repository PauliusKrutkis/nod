import { describe, expect, it } from "vitest";
import type { LedgerQueueItem, LedgerSessionFile } from "../types.ts";
import {
  groupQueueByProvenance,
  initialAnchorFor,
  regionAtCursor,
  sessionToChangedFiles,
} from "./ledger-session.ts";
import { buildReviewItems } from "./review-items.ts";

const EMPTY = new Map();

const SYNTH: LedgerSessionFile = {
  baseline: null,
  patch: "@@ -1,2 +1,4 @@\n line1\n+line2\n+line3\n line4",
  path: "a.ts",
  regions: [{ endLine: 3, startLine: 2 }],
};

const REAL: LedgerSessionFile = {
  baseline: {
    actor: { id: "tester", kind: "human" },
    atTime: "2026-08-13T12:00:00.000Z",
    refPath: "b.ts",
    sha: "b".repeat(40),
    source: "anchor",
  },
  patch: "@@ -1,3 +1,3 @@\n ctx1\n-old\n+new\n ctx2",
  path: "b.ts",
  regions: [{ endLine: 2, startLine: 2 }],
};

const files = sessionToChangedFiles([SYNTH, REAL], "t".repeat(40));
const model = buildReviewItems({
  ask: null,
  collapsed: EMPTY,
  commentsByFile: EMPTY,
  expandedRows: EMPTY,
  files,
  isImage: () => false,
  openBoxes: EMPTY,
  pendingByFile: EMPTY,
});

describe("sessionToChangedFiles", () => {
  it("counts adds and dels from the patch", () => {
    expect(files[0]).toMatchObject({
      additions: 2,
      deletions: 0,
      filename: "a.ts",
      status: "modified",
    });
    expect(files[1]).toMatchObject({ additions: 1, deletions: 1 });
  });
});

describe("regionAtCursor", () => {
  it("signs the region containing the cursor's tip line", () => {
    const at = regionAtCursor(model, files, [SYNTH, REAL], {
      anchor: "RIGHT:2",
      fileIndex: 0,
      kind: "row",
    });
    expect(at?.target).toBe("a.ts:2-3");
  });

  it("falls back to the nearest region from a context row", () => {
    const at = regionAtCursor(model, files, [SYNTH, REAL], {
      anchor: "RIGHT:4",
      fileIndex: 0,
      kind: "row",
    });
    expect(at?.target).toBe("a.ts:2-3");
  });

  it("resolves a deleted row through its neighbours", () => {
    const at = regionAtCursor(model, files, [SYNTH, REAL], {
      anchor: "LEFT:2",
      fileIndex: 1,
      kind: "row",
    });
    expect(at?.target).toBe("b.ts:2-2");
  });

  it("returns null without a cursor or a session file", () => {
    expect(regionAtCursor(model, files, [SYNTH, REAL], null)).toBeNull();
    expect(
      regionAtCursor(model, files, [], {
        anchor: "RIGHT:2",
        fileIndex: 0,
        kind: "row",
      })
    ).toBeNull();
  });
});

describe("initialAnchorFor", () => {
  it("lands on the region's first line present in the patch", () => {
    expect(initialAnchorFor(files, model, "a.ts:2-3")).toEqual({
      anchor: "RIGHT:2",
      fileIndex: 0,
    });
  });

  it("falls back to the file's first nav row when the span is absent", () => {
    const at = initialAnchorFor(files, model, "a.ts:9-9");
    expect(at?.fileIndex).toBe(0);
    expect(at?.anchor).toBe("RIGHT:1");
  });

  it("returns null for an unknown file", () => {
    expect(initialAnchorFor(files, model, "nope.ts:1-2")).toBeNull();
  });
});

describe("groupQueueByProvenance", () => {
  const item = (
    path: string,
    topic: string,
    pr: number | null,
    sha: string,
    subject: string
  ): LedgerQueueItem => ({
    baseline: null,
    endLine: 6,
    newLines: 6,
    path,
    provenance: [
      { at: "2026-08-25T12:00:00Z", author: "paulius", pr, sha, subject },
    ],
    startLine: 1,
    topic,
  });

  it("groups by the engine topic, in first-appearance order", () => {
    const queue = [
      item("a.ts", "ledger", 321, "a".repeat(40), "feat(ledger): a (#321)"),
      item("b.ts", "d1eec70", null, "d1eec70aa".padEnd(40, "0"), "direct"),
      item("c.ts", "ledger", 322, "b".repeat(40), "docs(ledger): c (#322)"),
    ];
    const { flat, groups } = groupQueueByProvenance(queue);
    expect(groups.map((g) => g.label)).toEqual(["ledger", "d1eec70"]);
    expect(groups[0].items.map((i) => i.path)).toEqual(["a.ts", "c.ts"]);
    expect(flat.map((i) => i.path)).toEqual(["a.ts", "c.ts", "b.ts"]);
    expect(groups[0].subject).toBe("feat(ledger): a (#321)");
    expect(groups[0].chips).toEqual(["#321", "#322"]);
    expect(groups[0].fileCount).toBe(2);
    expect(groups[0].newLines).toBe(12);
  });
});
