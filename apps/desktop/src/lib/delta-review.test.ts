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
