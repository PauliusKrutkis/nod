/**
 * Two strings and an optional button, which sounds unbreakable until you
 * remember the hint is written by whoever added the tab: the fixtures pin the
 * empty string, a paragraph that outgrows the 380px measure, an unbreakable
 * token with nowhere to wrap, and the bidi cases where a centred column is
 * exactly where mixed direction goes wrong.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { InboxZero } from "./inbox-zero.tsx";

const noop = () => {
  return;
};

const UNBREAKABLE = "x".repeat(2000);

export const inboxZeroEntry = defineEntry(InboxZero, {
  "all-clear": {
    props: {
      hint: "Nothing is waiting on your review. New requests land here and pop a toast.",
      title: "All clear",
    },
  },
  archived: {
    props: {
      hint: "Archive a PR with e and it waits here. Press u to come back.",
      title: "No archived PRs in “Review requests”",
    },
  },
  cjk: {
    props: {
      hint: "レビュー待ちのプルリクエストはありません。新しい依頼が届くとここに表示されます。",
      title: "すべて完了",
    },
  },
  empty: {
    props: { hint: "", title: "" },
  },
  "markup-as-text": {
    props: {
      action: {
        kbd: "w",
        label: '<img src=x onerror="alert(1)">',
        onClick: noop,
      },
      hint: 'A hint carrying <img src=x onerror="alert(1)"> from a PR title',
      title: 'Nothing in “<img src=x onerror="alert(1)">”',
    },
  },
  overflow: {
    props: {
      action: {
        kbd: "shift+w",
        label: "Watch a repository, or several, or as many as you like",
        onClick: noop,
      },
      hint: `Nothing here yet. ${UNBREAKABLE}`,
      title: `Nothing in “${UNBREAKABLE}”`,
    },
  },
  rtl: {
    props: {
      hint: "لا توجد طلبات مراجعة معلقة. ستظهر الطلبات الجديدة هنا.",
      title: "لا يوجد شيء في “المُسندة إليّ”",
    },
  },
  "with-action": {
    props: {
      action: { kbd: "w", label: "Watch a repository", onClick: noop },
      hint: "Every open PR in the repositories you watch, involved or not.",
      title: "Not watching anything yet",
    },
  },
});
