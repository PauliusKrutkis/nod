/**
 * Everything hostile about this component arrives as `initialMarkdown`: it is
 * parsed, not printed, so each case probes a different path through the
 * markdown reader and the schema it lands in — prose, fences, lists, links,
 * a suggestion block, and raw HTML.
 *
 * `raw-html` carries the same tag twice, because the two halves land
 * differently: inside a code span it survives as escaped text, while a bare
 * one in prose is parsed and then dropped by a schema with no image node —
 * never executed, but not preserved either, so editing a comment that
 * contains hand-written HTML loses it. The placeholder is the other payload,
 * because it is also the editor's accessible name, so a long one has to clip
 * instead of pushing the surface open.
 *
 * No fixture sets `autoFocus`: a focused ProseMirror paints a blinking caret,
 * which is a flaky pixel in every screenshot cell it appears in. There is no
 * disabled or busy case either — the composer has neither state by design;
 * the submitting affordance belongs to add-comment-box below it.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { ComposerEditor } from "./composer-editor.tsx";

const noop = () => {
  return;
};

const emptyChange = (_empty: boolean) => {
  return;
};

const shared = {
  onCancel: noop,
  onEmptyChange: emptyChange,
  onSubmitRequest: noop,
  placeholder: "Leave a comment…  ⌘↵ to save",
};

const UNBREAKABLE = `sk-${"nod".repeat(660)}`;

const MARKDOWN = [
  "### What changed",
  "",
  "- `resolveRetry` now owns the default",
  "- the backoff table lost its last entry",
  "",
  "See [the retry notes](https://example.com/retry) before merging.",
  "",
  "```ts",
  "const parsed = safeParse(schema, body);",
  "if (!parsed.ok) {",
  "  return problem(400, parsed.error);",
  "}",
  "```",
  "",
  "> Worth a second pair of eyes.",
].join("\n");

const LONG_DRAFT = [
  "This rename is mechanical, so most of the diff reads itself: every call site that passed `attempts` now passes `maxAttempts`, and the compiler found all of them.",
  "The behavioural change is the default. Dropping from five attempts to three is the right call for the interactive path, but the sync worker inherits the same client, and a sync that used to survive a flaky minute now gives up inside twenty seconds.",
  "My suggestion is to keep the client default at three and let the worker pass its own five, rather than moving the number and hoping nobody downstream depended on the old one.",
  "One leftover: the backoff table is indexed by attempt number, so with one fewer attempt its last entry is now unreachable. Dead configuration rather than a bug, but it will confuse whoever reads this next.",
].join("\n\n");

export const composerEditorEntry = defineEntry(ComposerEditor, {
  empty: {
    props: { ...shared, initialMarkdown: "" },
  },
  "long-draft": {
    props: { ...shared, initialMarkdown: LONG_DRAFT },
  },
  markdown: {
    props: { ...shared, initialMarkdown: MARKDOWN },
  },
  minimal: {
    props: shared,
  },
  overflow: {
    props: {
      ...shared,
      initialMarkdown: `The key in the diff is live — rotate it: ${UNBREAKABLE}`,
    },
  },
  "placeholder-long": {
    props: {
      ...shared,
      initialMarkdown: "",
      placeholder:
        "Comment on packages/integrations/src/providers/github/enterprise/webhooks/handler.ts — ⌘↵ saves, Esc backs out, Tab switches when to post",
    },
  },
  "plain-text": {
    props: {
      ...shared,
      initialMarkdown:
        "Nice catch — this is the last place that read the old name.",
    },
  },
  "raw-html": {
    props: {
      ...shared,
      initialMarkdown:
        'The template interpolates unescaped: `<img src=x onerror="alert(1)">` reaches the page as markup, and so does a bare <img src=x onerror="alert(1)"> in prose.',
    },
  },
  suggestion: {
    props: {
      ...shared,
      initialMarkdown:
        "Guard the parse instead of trusting the header:\n\n```suggestion\nconst parsed = safeParse(schema, body);\n```",
      suggestionText: "const parsed = JSON.parse(body);",
    },
  },
  unicode: {
    props: {
      ...shared,
      initialMarkdown:
        "この変更はリトライ回数を三回に減らします。\n\nمحمد الأمين راجع التغيير ووافق عليه، لكن العدد الجديد صغير.\n\n👨‍👩‍👧‍👦 藤本 さくら",
      placeholder: "コメントを残す…  ⌘↵ で保存",
    },
  },
});
