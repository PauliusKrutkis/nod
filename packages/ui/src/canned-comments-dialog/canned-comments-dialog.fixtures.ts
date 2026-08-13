/**
 * Every payload here is a line a reviewer typed into the input above it, so
 * nothing validates it on the way in: the hostile cases are a line longer
 * than the panel, a line with no spaces to break at, and a line that is
 * markup. `empty` is the first-run state a reviewer reaches by deleting the
 * defaults, which is a real state and not the same as never having opened
 * the dialog. `many` runs past the list's fixed height so the scroll floor is
 * shot rather than assumed.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { CannedCommentsDialog } from "./canned-comments-dialog.tsx";

const noop = () => {
  return;
};

const onAdd = (_text: string) => {
  return;
};

const onRemove = (_index: number) => {
  return;
};

const shared = { onAdd, onClose: noop, onRemove };

const DEFAULTS = [
  "nit: naming",
  "Needs a test.",
  "Prefer an early return here.",
  "Can you pull this out into its own function?",
  "Worth a comment explaining why.",
  "Not blocking, take it or leave it.",
];

const UNBREAKABLE = `sk-${"nod".repeat(40)}`;

export const cannedCommentsDialogEntry = defineEntry(
  CannedCommentsDialog,
  {
    empty: {
      props: { ...shared, comments: [] },
    },
    many: {
      props: {
        ...shared,
        comments: Array.from(
          { length: 20 },
          (_, i) => `nit: the ${i + 1}th thing I say on every review`
        ),
      },
    },
    "markup-as-text": {
      props: {
        ...shared,
        comments: [
          "Needs a guard: `<script>alert(1)</script>` reaches the page",
          "Prefer <Foo bar={1} /> over the factory here.",
        ],
      },
    },
    minimal: {
      props: { ...shared, comments: ["nit: naming"] },
    },
    overflow: {
      props: {
        ...shared,
        comments: [
          `The key in the diff is live — rotate it before merging: ${UNBREAKABLE}`,
          "Not blocking, but this is the third place that reimplements the same retry loop, and the next person to touch it will not know the other two exist — worth pulling out before it spreads again.",
        ],
      },
    },
    typical: {
      props: { ...shared, comments: DEFAULTS },
    },
    unicode: {
      props: {
        ...shared,
        comments: [
          "これはテストが必要です。",
          "محمد راجع التغيير ووافق عليه.",
          "👨‍👩‍👧‍👦 藤本 さくら に確認してください",
        ],
      },
    },
  },
  { dialog: true }
);
