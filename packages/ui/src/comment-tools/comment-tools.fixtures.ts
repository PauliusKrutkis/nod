/**
 * The strip's shape is decided entirely by which handlers arrive, so the
 * fixtures enumerate that power set: copy alone (someone else's comment),
 * copy + edit, copy + delete, and the full own-comment strip with and without
 * its hotkey chip. The chip is the only unbounded thing on the row, so it gets
 * a chord and a key name Kbd has no glyph for.
 *
 * `body` is a payload the strip copies and never renders, which is why the
 * markup fixture exists — it pins that contract rather than a look.
 *
 * The "Copied" flash and the armed "Delete?" step are internal state no
 * fixture can reach; the desktop e2e specs own those.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { CommentTools } from "./comment-tools.tsx";

const noop = () => {
  return;
};

const BODY = "Worth a follow-up, but not a blocker for this PR.";

export const commentToolsEntry = defineEntry(CommentTools, {
  chord: {
    props: {
      body: BODY,
      commentId: 1,
      editKbd: "mod+shift+e",
      onDelete: noop,
      onStartEdit: noop,
    },
  },
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
  own: {
    props: { body: BODY, commentId: 1, onDelete: noop, onStartEdit: noop },
  },
  "own-with-kbd": {
    props: {
      body: BODY,
      commentId: 1,
      editKbd: "e",
      onDelete: noop,
      onStartEdit: noop,
    },
  },
  "unknown-key": {
    props: {
      body: BODY,
      commentId: 1,
      editKbd: "hyper",
      onDelete: noop,
      onStartEdit: noop,
    },
  },
});
