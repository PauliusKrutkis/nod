/**
 * The strip's shape is decided entirely by which handlers arrive, so the
 * fixtures enumerate that power set: copy alone (someone else's comment),
 * copy + edit, copy + delete, the full own-comment strip, and `pending` —
 * the four-tool row a staged comment shows, which is the widest the strip
 * gets and the one that sent this component back to the drawing board.
 *
 * The three key-carrying fixtures (chord, own-with-kbd, unknown-key) went
 * when the keys moved into tooltips. A tooltip is portalled and opens on
 * hover, so at rest those three rendered exactly what `own` renders: three
 * more baselines of the same picture, and a regenerated set that would have
 * "proved" the keys were fine by photographing their absence. Kbd's own
 * fixtures still cover chords and unknown key names.
 *
 * `body` is a payload the strip copies and never renders, which is why the
 * markup fixture exists — it pins that contract rather than a look.
 *
 * The "Copied" flash, the armed "Delete?" step and the tooltips themselves
 * are interaction state no fixture can reach; the desktop e2e specs own those.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { CommentTools } from "./comment-tools.tsx";

const noop = () => {
  return;
};

const BODY = "Worth a follow-up, but not a blocker for this PR.";

export const commentToolsEntry = defineEntry(CommentTools, {
  "copy-only": {
    props: { body: BODY, commentId: 1 },
  },
  "delete-only": {
    props: { body: BODY, commentId: 1, onDelete: noop },
  },
  "edit-only": {
    props: { body: BODY, commentId: 1, onStartEdit: noop },
  },
  "markup-body": {
    props: {
      body: '<img src=x onerror="alert(1)"> — never rendered, only copied',
      commentId: 1,
      onDelete: noop,
      onStartEdit: noop,
    },
  },
  pending: {
    props: {
      body: BODY,
      commentId: 1,
      confirmDelete: false,
      deleteLabel: "Discard",
      onDelete: noop,
      onPostNow: noop,
      onStartEdit: noop,
    },
  },
  own: {
    props: { body: BODY, commentId: 1, onDelete: noop, onStartEdit: noop },
  },
});
