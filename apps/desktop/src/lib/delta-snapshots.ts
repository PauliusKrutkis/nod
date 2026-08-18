/**
 * Per-PR delta snapshots — what the diff looked like when you last submitted
 * a review from this app (see delta-review.ts for what they mean). Stored in
 * localStorage like the review memory: local-only, loaded once, written
 * through a module cache. Saving prunes to the newest MAX_PRS entries by
 * submission time so a year of reviewing cannot grow the key without bound.
 */

import type { DeltaSnapshot } from "./delta-review.ts";

const KEY = "nod:deltaSnapshots:v1";
const MAX_PRS = 40;

function loadAll(): Record<string, DeltaSnapshot> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const cache: Record<string, DeltaSnapshot> = loadAll();

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
