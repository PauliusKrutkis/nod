/**
 * Per-PR delta snapshots — what the diff looked like when you last submitted
 * a review from this app (see delta-review.ts for what they mean). Stored in
 * localStorage like the review memory: local-only, loaded once, written
 * through a module cache. Saving prunes to the newest MAX_PRS entries by
 * submission time so a year of reviewing cannot grow the key without bound.
 * The cache loads once at import, so tests reload it through
 * resetDeltaSnapshotCache after writing the key themselves.
 */

import type { DeltaSnapshot } from "./delta-review.ts";

const KEY = "nod:deltaSnapshots:v1";
const MAX_PRS = 40;

function loadAll(): Record<string, DeltaSnapshot> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

let cache: Record<string, DeltaSnapshot> = loadAll();

export function resetDeltaSnapshotCache(): void {
  cache = loadAll();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function getDeltaSnapshot(prKey: string): DeltaSnapshot | undefined {
  return cache[prKey];
}

export function saveDeltaSnapshot(prKey: string, snap: DeltaSnapshot): void {
  cache[prKey] = snap;
  const keys = Object.keys(cache);
  if (keys.length > MAX_PRS) {
    keys.sort((a, b) =>
      (cache[a]?.submittedAt ?? "").localeCompare(cache[b]?.submittedAt ?? "")
    );
    for (const stale of keys.slice(0, keys.length - MAX_PRS)) {
      delete cache[stale];
    }
  }
  persist();
}
