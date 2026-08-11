/**
 * Three payloads decide what this renders: the draft (which the editor
 * parses), the two labels (caller text on buttons that must clip), and the
 * presence of a secondary action, which is what brings the segmented control
 * and its explanatory line. `overflow` is about the labels alone and keeps
 * its draft short, so that the 280px shot contains the footer — which is the
 * only thing a long label can break. An unbreakable run of text belongs to
 * composer-editor's fixtures, since the surface below owns the wrapping.
 *
 * `now-mode` exists because the second half of the batch/now control is
 * otherwise unreachable from props — the mode is the composer's own state
 * once open, so `initialMode` seeds it the way `initialMarkdown` seeds the
 * text. `raw-html` is the security case and a finding at once: the tag never
 * becomes an element, but a bare one in prose is dropped by the schema
 * instead of surviving as text (see composer-editor.fixtures.ts).
 *
 * There is no error fixture: a failed submit rolls back and flashes at the
 * mutation layer, and this component deliberately renders nothing for it
 * beyond keeping the typed text.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { AddCommentBox } from "./add-comment-box.tsx";

const noop = () => {
  return;
};

const submit = (_body: string) => {
  return;
};

const shared = {
  onCancel: noop,
  onSubmit: submit,
  pending: false,
};

const LONG_DRAFT = [
  "The rename is mechanical — every call site that passed `attempts` now passes `maxAttempts`, and the compiler found all of them.",
  "The behavioural change is the default. Three attempts is right for the interactive path, but the sync worker shares this client, and a sync that used to survive a flaky minute now gives up inside twenty seconds.",
  "```ts",
  "const client = createClient({ maxAttempts: 5 });",
  "```",
  "Keeping the client default at three and letting the worker pass its own five would leave both callers honest.",
].join("\n\n");

export const addCommentBoxEntry = defineEntry(AddCommentBox, {
  "draft-with-text": {
    props: {
      ...shared,
      initialMarkdown:
        "Nice catch — this is the last place that read the old name.",
    },
  },
  "empty-draft": {
    props: shared,
  },
  "long-draft": {
    props: { ...shared, initialMarkdown: LONG_DRAFT },
  },
  "now-mode": {
    props: {
      ...shared,
      initialMarkdown: "Unrelated to the review — posting this one on its own.",
      initialMode: "now" as const,
      onSecondary: submit,
      secondaryLabel: "Comment now",
      submitLabel: "Add to review",
    },
  },
  overflow: {
    props: {
      ...shared,
      initialMarkdown: "Rotate this, the key in the diff is live.",
      onSecondary: submit,
      secondaryLabel: "Post it to the pull request immediately",
      submitLabel: "Add to this review and hold it until submit",
    },
  },
  "raw-html": {
    props: {
      ...shared,
      initialMarkdown:
        'This renders unescaped: `<img src=x onerror="alert(1)">` lands in the page as markup, and a bare <img src=x onerror="alert(1)"> does too.',
    },
  },
  reply: {
    props: {
      ...shared,
      placeholder: "Reply…",
      submitLabel: "Reply",
    },
  },
  submitting: {
    props: {
      ...shared,
      initialMarkdown: "Holds up — shipping it.",
      onSecondary: submit,
      pending: true,
      submitLabel: "Add to review",
    },
  },
  suggestion: {
    props: {
      ...shared,
      onSecondary: submit,
      placeholder: "Add a review comment…",
      submitLabel: "Add to review",
      suggestionText: "const parsed = JSON.parse(body);",
    },
  },
  "two-modes": {
    props: {
      ...shared,
      initialMarkdown: "Worth folding into the review rather than posting now.",
      onSecondary: submit,
      secondaryLabel: "Comment now",
      submitLabel: "Add to review",
    },
  },
  unicode: {
    props: {
      ...shared,
      initialMarkdown:
        "この変更はリトライ回数を三回に減らします。\n\nمحمد الأمين راجع التغيير ووافق عليه.",
      onSecondary: submit,
      placeholder: "コメントを残す…",
      secondaryLabel: "الآن",
      submitLabel: "レビューに追加",
    },
  },
});
