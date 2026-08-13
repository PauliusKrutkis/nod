/**
 * Canned comments: the handful of sentences a reviewer types on every pull
 * request. They are a per-user preference, so they live in localStorage on
 * this machine and never touch the repo or the host. They stay plain text on
 * purpose — the moment they take variables they become a template language.
 * A missing storage key means first run and yields the defaults; a stored
 * empty array means the reviewer deleted every one of them and stays empty.
 *
 * The list is read by every open composer and written by one dialog, so it is
 * kept as a module-level snapshot with subscribers rather than re-read per
 * render: useSyncExternalStore needs a stable reference to avoid tearing, and
 * a fresh array parsed out of localStorage on each call would be a new one
 * every time. The cache is only ever replaced wholesale, so a subscriber that
 * compares by identity sees exactly the edits the dialog made.
 */

const STORAGE_KEY = "nod:cannedComments:v1";

export const DEFAULT_CANNED_COMMENTS = [
  "nit: naming",
  "Needs a test.",
  "Prefer an early return here.",
  "Can you pull this out into its own function?",
  "Worth a comment explaining why.",
  "Not blocking, take it or leave it.",
];

let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [...DEFAULT_CANNED_COMMENTS];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_CANNED_COMMENTS];
    }
    return parsed.filter(
      (v): v is string => typeof v === "string" && !!v.trim()
    );
  } catch {
    return [...DEFAULT_CANNED_COMMENTS];
  }
}

export function getCannedComments(): string[] {
  cache ??= read();
  return cache;
}

export function setCannedComments(next: string[]): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode) — the edit just won't survive a restart */
  }
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeCannedComments(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drops the snapshot so the next read goes back to storage. */
export function resetCannedCommentsCache(): void {
  cache = null;
}
