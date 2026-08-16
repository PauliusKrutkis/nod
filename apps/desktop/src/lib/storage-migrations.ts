/**
 * One-time localStorage migrations, run before first render.
 *
 * Two of them, and the order matters. The namespace pass moves everything out
 * of the old `pr-flow:` prefix, which the app carried before the rename to
 * Nod; the version pass then does what it always did, moving pre-versioning
 * values under their `:v1` key so a future data-shape change can bump the
 * version and ignore stale state instead of crashing on it. Running the
 * namespace pass first means the version pass only ever sees `nod:` keys, so
 * it stays written in the same namespace as the rest of the app rather than
 * carrying a dead prefix forever.
 *
 * The namespace pass is deliberately a blind prefix sweep rather than a list:
 * unversioned one-offs (zoom, drawerWide, fileTreeMode, lastRunVersion) and
 * caches (releases:v1) live outside VERSIONED_BASES, and a list would drop
 * whichever one nobody remembered to add. Losing these is not cosmetic —
 * pendingComments holds review comments the user has written but not yet
 * posted.
 */

const LEGACY_NAMESPACE = "pr-flow:";
const NAMESPACE = "nod:";

const VERSIONED_BASES = [
  "nod:gitlabInstances",
  "nod:lastRoute",
  "nod:lastInboxTab",
  "nod:lastSeen",
  "nod:dismissed",
  "nod:pendingComments",
  "nod:issueTrackers",
  "nod:reviewMemory",
  "nod:chatHistory",
];

function migrateNamespace(): void {
  // Snapshot the keys first — removeItem during a live index walk reshuffles
  // localStorage and skips entries.
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_NAMESPACE)) {
      legacy.push(key);
    }
  }
  for (const key of legacy) {
    const renamed = `${NAMESPACE}${key.slice(LEGACY_NAMESPACE.length)}`;
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(renamed) === null) {
      localStorage.setItem(renamed, value);
    }
    localStorage.removeItem(key);
  }
}

function migrateVersions(): void {
  for (const base of VERSIONED_BASES) {
    const legacy = localStorage.getItem(base);
    if (legacy !== null) {
      if (localStorage.getItem(`${base}:v1`) === null) {
        localStorage.setItem(`${base}:v1`, legacy);
      }
      localStorage.removeItem(base);
    }
  }
}

export function migrateStorageKeys(): void {
  try {
    migrateNamespace();
    migrateVersions();
  } catch {
    /* ignore */
  }
}
