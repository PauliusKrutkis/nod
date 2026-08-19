import { beforeEach, describe, expect, it } from "vitest";
import type { DeltaSnapshot } from "./delta-review.ts";
import {
  getDeltaSnapshot,
  resetDeltaSnapshotCache,
  saveDeltaSnapshot,
} from "./delta-snapshots.ts";

const KEY = "nod:deltaSnapshots:v1";
const MAX_PRS = 40;

function snapshot(submittedAt: string): DeltaSnapshot {
  return {
    files: { "a.ts": { fp: "p:abc", rows: { deadbeef: 1 } } },
    headSha: "head",
    submittedAt,
  };
}

function dayIso(day: number): string {
  return `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
}

beforeEach(() => {
  localStorage.clear();
  resetDeltaSnapshotCache();
});

describe("delta snapshot storage", () => {
  it("has nothing for a pull request never reviewed here", () => {
    expect(getDeltaSnapshot("o/r#1")).toBeUndefined();
  });

  it("round-trips a snapshot through localStorage", () => {
    const snap = snapshot(dayIso(5));
    saveDeltaSnapshot("o/r#1", snap);
    resetDeltaSnapshotCache();
    expect(getDeltaSnapshot("o/r#1")).toEqual(snap);
  });

  it("keeps snapshots for different pull requests apart", () => {
    saveDeltaSnapshot("o/r#1", snapshot(dayIso(5)));
    saveDeltaSnapshot("o/r#2", snapshot(dayIso(6)));
    expect(getDeltaSnapshot("o/r#1")?.submittedAt).toBe(dayIso(5));
    expect(getDeltaSnapshot("o/r#2")?.submittedAt).toBe(dayIso(6));
  });

  it("replaces the snapshot when the same pull request is reviewed again", () => {
    saveDeltaSnapshot("o/r#1", snapshot(dayIso(5)));
    saveDeltaSnapshot("o/r#1", snapshot(dayIso(9)));
    expect(getDeltaSnapshot("o/r#1")?.submittedAt).toBe(dayIso(9));
  });

  it("evicts the oldest submission once past the cap", () => {
    for (let i = 1; i <= MAX_PRS; i += 1) {
      saveDeltaSnapshot(`o/r#${i}`, snapshot(dayIso(i)));
    }
    expect(getDeltaSnapshot("o/r#1")).toBeDefined();

    saveDeltaSnapshot("o/r#99", snapshot(dayIso(28)));

    expect(getDeltaSnapshot("o/r#1")).toBeUndefined();
    expect(getDeltaSnapshot(`o/r#${MAX_PRS}`)).toBeDefined();
    expect(getDeltaSnapshot("o/r#99")).toBeDefined();
    expect(
      Object.keys(JSON.parse(localStorage.getItem(KEY) ?? "{}"))
    ).toHaveLength(MAX_PRS);
  });

  it("survives a corrupted key instead of throwing", () => {
    localStorage.setItem(KEY, "not json");
    resetDeltaSnapshotCache();
    expect(getDeltaSnapshot("o/r#1")).toBeUndefined();
  });

  it("ignores a stored value that is not an object map", () => {
    localStorage.setItem(KEY, "[1,2,3]");
    resetDeltaSnapshotCache();
    expect(getDeltaSnapshot("o/r#1")).toBeUndefined();
  });
});
