/**
 * Canned comments: the handful of sentences a reviewer types on every pull
 * request. They are a per-user preference, so they live in localStorage on
 * this machine and never touch the repo or the host. They stay plain text on
 * purpose — the moment they take variables they become a template language.
 * A missing storage key means first run and yields the defaults; a stored
 * empty array means the reviewer deleted every one of them and stays empty.
 *
 * Inserting needs a target, and several composers can be mounted at once. The
 * one that should receive the text is the one the reviewer was last writing
 * in, which the composer registry in @nod/ui tracks for exactly this.
 */

import { activeComposer } from "@nod/ui/composer-registry";

const STORAGE_KEY = "nod:cannedComments:v1";

export const DEFAULT_CANNED_COMMENTS = [
  "nit: naming",
  "Needs a test.",
  "Prefer an early return here.",
  "Can you pull this out into its own function?",
  "Worth a comment explaining why.",
  "Not blocking, take it or leave it.",
];

export function loadCannedComments(): string[] {
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

export function saveCannedComments(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode) — the list just won't survive a restart */
  }
}

export function hasOpenComposer(): boolean {
  return activeComposer() !== null;
}

/**
 * Drops `text` into the composer the reviewer was last writing in, as its own
 * paragraph unless the box is still empty. Returns false when no composer is
 * on screen to take it.
 */
export function insertCannedComment(text: string): boolean {
  const editor = activeComposer();
  if (!editor) {
    return false;
  }
  const chain = editor.chain().focus();
  if (editor.isEmpty) {
    chain.insertContent(text).run();
  } else {
    chain
      .insertContent({ content: [{ text, type: "text" }], type: "paragraph" })
      .run();
  }
  return true;
}
