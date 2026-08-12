/**
 * Whether the composer asks the model to finish a sentence. Off until the
 * reviewer turns it on, and separate from having AI configured at all: a key
 * is for the features you asked for, and nobody asks for their comments to be
 * written for them by setting up "ask about this code".
 *
 * A per-machine preference, so it lives in localStorage next to the canned
 * list, with the same snapshot-and-subscribe shape — a composer already open
 * has to see the switch flip.
 */

const STORAGE_KEY = "nod:aiCompletion:v1";

let cache: boolean | null = null;
const listeners = new Set<() => void>();

export function getAiCompletionEnabled(): boolean {
  cache ??= localStorage.getItem(STORAGE_KEY) === "true";
  return cache;
}

export function setAiCompletionEnabled(enabled: boolean): void {
  cache = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* storage unavailable (private mode) — the choice just won't survive a restart */
  }
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAiCompletion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drops the snapshot so the next read goes back to storage. */
export function resetAiCompletionCache(): void {
  cache = null;
}
