/**
 * AI completion for the comment composer, as grey text after the caret that
 * Tab accepts. Installed through the composer's `extensions` seam, never by
 * the composer itself: the continuation comes off the network, and this
 * package does no I/O — the host passes `request` and owns the model, the key
 * and whether the feature is on at all. A composer with no ghostText
 * extension behaves exactly as it always did.
 *
 * It is a ghost rather than a list because that is the honest shape for what
 * it is: one speculative continuation, arriving late, often wrong. A dropdown
 * would promise ranked alternatives that do not exist, and would fight the
 * canned-comment panel for Enter. Tab accepts here; Enter never means "take
 * the AI's word for it".
 *
 * Requests are debounced and only fire at the end of a paragraph with an empty
 * selection — the same rule the canned panel uses, for the same reason: a
 * suggestion in the middle of a rewrite is a suggestion in the way. Every
 * request carries a sequence number and a stale reply is dropped, because the
 * reviewer keeps typing while the model thinks and the answer to a prefix
 * three keystrokes ago is worse than no answer.
 *
 * Suppression exists for one case: the canned panel is showing. Those lines
 * are the reviewer's own, deterministic and free, so they win outright rather
 * than competing with a guess.
 */

import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import "./ghost-text.css";

export interface GhostTextOptions {
  /** Ask the host for a continuation. Empty string means "nothing to add". */
  request: (prefix: string) => Promise<string>;
  /** How long the typing has to stop before asking. */
  delay?: number;
  /** Shortest prefix worth spending a request on. */
  minPrefix?: number;
}

interface GhostState {
  suppressed: boolean;
  text: string;
}

const EMPTY: GhostState = { suppressed: false, text: "" };

const ghostKey = new PluginKey<GhostState>("ghostText");

const DEFAULT_DELAY = 600;
const DEFAULT_MIN_PREFIX = 12;
const TRAILING_SPACE = /\s$/;

/** The paragraph text a completion would continue, or null where none would. */
function ghostPrefix(editor: Editor): string | null {
  const { selection } = editor.state;
  if (!selection.empty) {
    return null;
  }
  const { $from } = selection;
  if ($from.parent.type.name !== "paragraph") {
    return null;
  }
  if ($from.parentOffset !== $from.parent.content.size) {
    return null;
  }
  return $from.parent.textBetween(0, $from.parentOffset);
}

/**
 * The continuation as it will actually be typed. Providers are inconsistent
 * about the leading space and the prompt cannot fix that, so the join is
 * decided here — once, before the ghost is shown, so that what is on screen is
 * exactly what Tab inserts. Without it a continuation lands welded to the last
 * word the reviewer typed.
 */
function joinToPrefix(prefix: string, completion: string): string {
  if (!completion) {
    return "";
  }
  const needsSpace = prefix.length > 0 && !TRAILING_SPACE.test(prefix);
  return needsSpace ? ` ${completion}` : completion;
}

export function ghostTextOf(editor: Editor): string {
  return ghostKey.getState(editor.state)?.text ?? "";
}

/**
 * Hide any ghost and keep it hidden while `suppressed`. Called by the composer
 * when the canned panel takes over; a no-op when the host never installed the
 * extension.
 */
export function setGhostSuppressed(editor: Editor, suppressed: boolean): void {
  if (!ghostKey.getState(editor.state)) {
    return;
  }
  editor.view.dispatch(
    editor.state.tr.setMeta(ghostKey, { suppressed, text: "" })
  );
}

/** Take the offered continuation. False when there was nothing to take. */
export function acceptGhostText(editor: Editor): boolean {
  const text = ghostTextOf(editor);
  if (!text) {
    return false;
  }
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setMeta(ghostKey, { suppressed: false, text: "" });
      return true;
    })
    .insertContent(text)
    .run();
  return true;
}

/** Send the offer away without taking it. False when there was none. */
export function dismissGhostText(editor: Editor): boolean {
  if (!ghostTextOf(editor)) {
    return false;
  }
  setGhostSuppressed(editor, false);
  return true;
}

export function ghostText(options: GhostTextOptions) {
  const delay = options.delay ?? DEFAULT_DELAY;
  const minPrefix = options.minPrefix ?? DEFAULT_MIN_PREFIX;

  return Extension.create({
    // Above the composer's own keymap so Tab reaches an offered continuation
    // before it flips the comment's mode.
    addKeyboardShortcuts() {
      return {
        Escape: ({ editor }) => dismissGhostText(editor),
        Tab: ({ editor }) => acceptGhostText(editor),
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let latest = 0;

      const ask = () => {
        const prefix = ghostPrefix(editor);
        if (prefix === null || prefix.trim().length < minPrefix) {
          return;
        }
        if (ghostKey.getState(editor.state)?.suppressed) {
          return;
        }
        latest += 1;
        const mine = latest;
        options
          .request(prefix)
          .then((text) => {
            const trimmed = joinToPrefix(prefix, text.trim());
            // The reviewer has typed since; this answer is about a line that
            // no longer exists.
            if (mine !== latest || !trimmed || !editor.isEditable) {
              return;
            }
            if (ghostPrefix(editor) !== prefix) {
              return;
            }
            editor.view.dispatch(
              editor.state.tr.setMeta(ghostKey, {
                suppressed: false,
                text: trimmed,
              })
            );
          })
          .catch(() => {
            // A completion is a courtesy; a failed one is silence.
          });
      };

      return [
        new Plugin<GhostState>({
          key: ghostKey,
          props: {
            decorations: (state) => {
              const ghost = ghostKey.getState(state);
              if (!ghost?.text) {
                return DecorationSet.empty;
              }
              const widget = Decoration.widget(
                state.selection.from,
                () => {
                  const span = document.createElement("span");
                  span.className = "qgt-ghost";
                  span.textContent = ghost.text;
                  return span;
                },
                { side: 1 }
              );
              return DecorationSet.create(state.doc, [widget]);
            },
          },
          state: {
            apply: (tr, value) => {
              const meta = tr.getMeta(ghostKey) as GhostState | undefined;
              if (meta) {
                return meta;
              }
              // Any edit or caret move invalidates what is on screen: the
              // ghost was written for a prefix that no longer ends the line.
              if (tr.docChanged || tr.selectionSet) {
                return { suppressed: value.suppressed, text: "" };
              }
              return value;
            },
            init: () => EMPTY,
          },
          view: () => ({
            destroy: () => {
              if (timer) {
                clearTimeout(timer);
              }
              // Outstanding replies are already stale to anything that mounts
              // next.
              latest += 1;
            },
            update: (_view, prev) => {
              if (prev.doc.eq(editor.state.doc)) {
                return;
              }
              if (timer) {
                clearTimeout(timer);
              }
              timer = setTimeout(ask, delay);
            },
          }),
        }),
      ];
    },

    name: "ghostText",

    priority: 200,
  });
}
