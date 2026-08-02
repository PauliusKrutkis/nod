/**
 * One-time localStorage migrations, run before first render. Storage keys
 * carry a :v1 suffix so a future data-shape change can bump the version and
 * ignore stale saved state instead of crashing on it; this moves any
 * pre-versioning value under its versioned key exactly once.
 */
const VERSIONED_BASES = [
  "pr-flow:gitlabInstances",
  "pr-flow:lastRoute",
  "pr-flow:lastInboxTab",
  "pr-flow:lastSeen",
  "pr-flow:dismissed",
  "pr-flow:pendingComments",
  "pr-flow:issueTrackers",
  "pr-flow:reviewMemory",
];

export function migrateStorageKeys(): void {
  try {
    for (const base of VERSIONED_BASES) {
      const legacy = localStorage.getItem(base);
      if (legacy !== null) {
        if (localStorage.getItem(`${base}:v1`) === null) {
          localStorage.setItem(`${base}:v1`, legacy);
        }
        localStorage.removeItem(base);
      }
    }
  } catch {
    /* ignore */
  }
}
