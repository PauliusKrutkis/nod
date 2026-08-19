import { describe, expect, it } from "vitest";
import {
  buildDeltaSnapshot,
  classifyDelta,
  deltaBadge,
  SNAPSHOT_ROW_CAP,
} from "./delta-review.ts";

const HEAD_A = "head-at-review";
const HEAD_B = "head-after-push";
const AT = "2026-08-12T10:00:00.000Z";

const PATCH_ONE = "@@ -1,2 +1,3 @@\n context\n+added line\n-removed line";
const PATCH_ONE_PLUS =
  "@@ -1,2 +1,4 @@\n context\n+added line\n+brand new line\n-removed line";

function file(filename: string, patch: string | null, sha = "blob") {
  return { filename, patch, sha };
}

describe("buildDeltaSnapshot", () => {
  it("fingerprints every file and counts its changed rows", () => {
    const snap = buildDeltaSnapshot([file("a.ts", PATCH_ONE)], HEAD_A, AT);
    expect(snap.submittedAt).toBe(AT);
    expect(snap.files["a.ts"].fp.startsWith("p:")).toBe(true);
    const counts = Object.values(snap.files["a.ts"].rows ?? {});
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("counts duplicate rows separately", () => {
    const patch = "@@ -1 +1,3 @@\n context\n+same\n+same";
    const snap = buildDeltaSnapshot([file("a.ts", patch)], HEAD_A, AT);
    expect(Object.values(snap.files["a.ts"].rows ?? {})).toEqual([2]);
  });

  it("drops row detail past the cap but keeps fingerprints", () => {
    const count = SNAPSHOT_ROW_CAP + 1;
    const lines: string[] = [`@@ -1 +1,${count + 1} @@`, " context"];
    for (let i = 0; i < count; i += 1) {
      lines.push(`+line ${i}`);
    }
    const snap = buildDeltaSnapshot(
      [file("big.ts", lines.join("\n"))],
      HEAD_A,
      AT
    );
    expect(snap.files["big.ts"].rows).toBeUndefined();
    expect(snap.files["big.ts"].fp.startsWith("p:")).toBe(true);
  });
});

describe("classifyDelta", () => {
  it("marks a file whose patch did not move as unchanged", () => {
    const snap = buildDeltaSnapshot([file("a.ts", PATCH_ONE)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("a.ts", PATCH_ONE)], HEAD_B);
    expect(view.files.get("a.ts")).toEqual({ kind: "unchanged" });
    expect(view.unchangedCount).toBe(1);
    expect(view.sinceIso).toBe(AT);
  });

  it("finds only the rows that arrived after the review", () => {
    const snap = buildDeltaSnapshot([file("a.ts", PATCH_ONE)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("a.ts", PATCH_ONE_PLUS)], HEAD_B);
    const state = view.files.get("a.ts");
    expect(state?.kind).toBe("partial");
    if (state?.kind === "partial") {
      expect([...state.newAnchors]).toEqual(["RIGHT:3"]);
    }
  });

  it("reads an extra copy of an already-reviewed line as new", () => {
    const before = "@@ -1 +1,2 @@\n context\n+same";
    const after = "@@ -1 +1,3 @@\n context\n+same\n+same";
    const snap = buildDeltaSnapshot([file("a.ts", before)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("a.ts", after)], HEAD_B);
    const state = view.files.get("a.ts");
    expect(state?.kind).toBe("partial");
    if (state?.kind === "partial") {
      expect(state.newAnchors.size).toBe(1);
    }
  });

  it("treats a file the snapshot never saw as all new", () => {
    const snap = buildDeltaSnapshot([file("a.ts", PATCH_ONE)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("b.ts", PATCH_ONE)], HEAD_B);
    expect(view.files.get("b.ts")).toEqual({ kind: "all-new" });
  });

  it("degrades to all-new when the snapshot kept no row detail", () => {
    const snap = buildDeltaSnapshot([file("a.ts", PATCH_ONE)], HEAD_A, AT);
    const bare = {
      ...snap,
      files: { "a.ts": { fp: snap.files["a.ts"].fp } },
    };
    const view = classifyDelta(bare, [file("a.ts", PATCH_ONE_PLUS)], HEAD_B);
    expect(view.files.get("a.ts")).toEqual({ kind: "all-new" });
  });

  it("classifies binary files by blob sha", () => {
    const snap = buildDeltaSnapshot([file("img.png", null, "s1")], HEAD_A, AT);
    const same = classifyDelta(snap, [file("img.png", null, "s1")], HEAD_B);
    expect(same.files.get("img.png")).toEqual({ kind: "unchanged" });
    const moved = classifyDelta(snap, [file("img.png", null, "s2")], HEAD_B);
    expect(moved.files.get("img.png")).toEqual({ kind: "all-new" });
  });

  it("reads a renamed file as all new rather than unchanged", () => {
    const snap = buildDeltaSnapshot(
      [file("old-name.ts", PATCH_ONE)],
      HEAD_A,
      AT
    );
    const view = classifyDelta(snap, [file("new-name.ts", PATCH_ONE)], HEAD_B);
    expect(view.files.get("new-name.ts")).toEqual({ kind: "all-new" });
    expect(view.unchangedCount).toBe(0);
  });

  it("reads an edited line as new and forgets its old form", () => {
    const before = "@@ -1 +1,2 @@\n context\n+const timeout = 30";
    const after = "@@ -1 +1,2 @@\n context\n+const timeout = 60";
    const snap = buildDeltaSnapshot([file("a.ts", before)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("a.ts", after)], HEAD_B);
    const state = view.files.get("a.ts");
    expect(state?.kind).toBe("partial");
    if (state?.kind === "partial") {
      expect([...state.newAnchors]).toEqual(["RIGHT:2"]);
    }
  });

  it("consumes one snapshot count per duplicate, leaving matched copies old", () => {
    const twice = "@@ -1 +1,3 @@\n context\n+same\n+same";
    const snap = buildDeltaSnapshot([file("a.ts", twice)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("a.ts", twice)], HEAD_A);
    const state = view.files.get("a.ts");
    expect(state).toEqual({ kind: "unchanged" });

    const thrice = "@@ -1 +1,4 @@\n context\n+same\n+same\n+same";
    const grown = classifyDelta(snap, [file("a.ts", thrice)], HEAD_B);
    const grownState = grown.files.get("a.ts");
    expect(grownState?.kind).toBe("partial");
    if (grownState?.kind === "partial") {
      expect(grownState.newAnchors.size).toBe(1);
    }
  });

  it("distinguishes an added line from a removed one with the same text", () => {
    const added = "@@ -1 +1,2 @@\n context\n+shared text";
    const removed = "@@ -1,2 +1 @@\n context\n-shared text";
    const snap = buildDeltaSnapshot([file("a.ts", added)], HEAD_A, AT);
    const view = classifyDelta(snap, [file("a.ts", removed)], HEAD_B);
    const state = view.files.get("a.ts");
    expect(state?.kind).toBe("partial");
    if (state?.kind === "partial") {
      expect(state.newAnchors.size).toBe(1);
    }
  });

  it("still folds an unmoved file exactly when the snapshot passed the cap", () => {
    const count = SNAPSHOT_ROW_CAP + 1;
    const lines: string[] = [`@@ -1 +1,${count + 1} @@`, " context"];
    for (let i = 0; i < count; i += 1) {
      lines.push(`+line ${i}`);
    }
    const huge = lines.join("\n");
    const snap = buildDeltaSnapshot(
      [file("big.ts", huge), file("small.ts", PATCH_ONE)],
      HEAD_A,
      AT
    );
    expect(snap.files["big.ts"].rows).toBeUndefined();

    const view = classifyDelta(
      snap,
      [file("big.ts", huge), file("small.ts", PATCH_ONE)],
      HEAD_B
    );
    expect(view.files.get("big.ts")).toEqual({ kind: "unchanged" });
    expect(view.files.get("small.ts")).toEqual({ kind: "unchanged" });
    expect(view.unchangedCount).toBe(2);
  });
});

describe("deltaBadge", () => {
  it("carries the review date in the tooltip", () => {
    const badge = deltaBadge(AT);
    expect(badge.label).toBe("since your review");
    expect(badge.title).toContain("Aug");
  });

  it("survives an unparseable date", () => {
    const badge = deltaBadge("not-a-date");
    expect(badge.label).toBe("since your review");
    expect(badge.title).toContain("last review");
  });
});
