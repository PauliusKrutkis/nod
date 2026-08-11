/**
 * Which composer the reviewer was last writing in. Several can be mounted at
 * once — an inline diff comment, a thread reply, and the pull request drawer's
 * box, which stays in the DOM hidden after it collapses — so a host that drops
 * text into "the" composer needs an order to pick from. Composers push
 * themselves onto the front of a stack when they take focus and drop off when
 * they unmount. That order survives a dialog stealing DOM focus, which a
 * `document.activeElement` lookup at insert time would not. The on-screen
 * check skips the collapsed drawer box: still mounted, but with nowhere to
 * show the text. It asks the panel rather than the layout — `aria-hidden` is
 * what a drawer already sets when it closes, and the geometry says nothing,
 * because the drawer collapses by translating itself off the viewport and
 * stays laid out the whole time.
 */

import type { Editor } from "@tiptap/core";

let composers: Editor[] = [];

export function rememberComposer(editor: Editor): void {
  composers = [editor, ...composers.filter((c) => c !== editor)];
}

export function forgetComposer(editor: Editor): void {
  composers = composers.filter((c) => c !== editor);
}

function isOnScreen(editor: Editor): boolean {
  const dom = editor.view.dom;
  return dom.isConnected && dom.closest('[aria-hidden="true"]') === null;
}

/**
 * The composer that should take inserted text, or null when none of the
 * mounted ones is on screen to show it.
 */
export function activeComposer(): Editor | null {
  return composers.find(isOnScreen) ?? null;
}
