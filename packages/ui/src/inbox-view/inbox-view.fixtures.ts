/**
 * The inbox as a whole surface, which is the point: these cells are the only
 * place the tab strip, the list and the reading pane are judged against each
 * other — whether their type sizes agree, whether the list's right border
 * meets the pane, whether a selected row reads as selected next to a pane
 * showing the same PR.
 *
 * The slots carry real components rather than stand-ins (InboxDetail in the
 * pane, InboxZero in `body`), because a view composed of placeholders proves
 * nothing about the composition.
 *
 * `crowd-40` is named for the stress rule: view fixtures whose names promise
 * layout stress also capture at 900px, the app's minimum window, which is
 * exactly where the reading pane folds away and the list has to stand alone.
 *
 * Timestamps are fixed, never Date.now() — the rows render relative labels,
 * so a live clock would expire the baselines.
 */

import { createElement } from "react";
import { defineEntry } from "../fixtures/fixtures.ts";
import {
  InboxDetail,
  type InboxPullRequest,
} from "../inbox-detail/inbox-detail.tsx";
import { InboxZero } from "../inbox-zero/inbox-zero.tsx";
import type { PullRequestRow } from "../pr-list-item/pr-list-item.tsx";
import { InboxView, type InboxViewRow } from "./inbox-view.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(400);

function pr(overrides: Partial<PullRequestRow>): PullRequestRow {
  return {
    author: "paulius",
    authorAvatarUrl: AVATAR,
    commentsCount: 4,
    draft: false,
    headRef: "feat/gallery-views",
    merged: false,
    number: 274,
    repo: "nod/nod",
    title: "Make the gallery the source of truth",
    updatedAt: "2024-08-01T00:00:00Z",
    ...overrides,
  };
}

function row(
  over: Partial<InboxViewRow> & { pr: PullRequestRow }
): InboxViewRow {
  return { selected: false, unread: false, ...over };
}

const ROWS: InboxViewRow[] = [
  row({ pr: pr({}), selected: true, unread: true }),
  row({
    pr: pr({
      author: "asta",
      number: 273,
      repo: "nod/tokens",
      title: "Retune the quiet palette's line contrast",
      updatedAt: "2024-07-30T09:00:00Z",
    }),
  }),
  row({
    pr: pr({
      commentsCount: 0,
      draft: true,
      number: 271,
      title: "Spike: tree-sitter tags over the repo store",
      updatedAt: "2024-07-28T09:00:00Z",
    }),
  }),
  row({
    pr: pr({
      merged: true,
      number: 268,
      title: "Retire the snapshot module",
      updatedAt: "2024-06-02T09:00:00Z",
    }),
  }),
];

const TABS = {
  activeKey: "review",
  archivedActive: false,
  archivedCount: 3,
  items: [
    { count: 4, hint: "Review requested", key: "review", label: "Review" },
    { count: 2, hint: "Assigned to you", key: "assigned", label: "Assigned" },
    { count: 9, hint: "You opened", key: "created", label: "Created" },
    { count: 0, hint: "You are involved", key: "involved", label: "Involved" },
  ],
  onSelect: noop,
  onToggleArchived: noop,
  onWatch: noop,
};

const detailFor = (over: Partial<InboxPullRequest> = {}) =>
  createElement(InboxDetail, {
    onOpenTicket: noop,
    pr: {
      additions: 214,
      author: "paulius",
      authorAvatarUrl: AVATAR,
      body: "Adds a views tier so a surface is judged at the width it is\nactually used at.\n\nThe rail splits into two tabs.",
      changedFiles: 9,
      commentsCount: 4,
      deletions: 37,
      draft: false,
      merged: false,
      number: 274,
      repo: "nod/nod",
      title: "Make the gallery the source of truth",
      updatedAt: "2024-08-01T00:00:00Z",
      ...over,
    },
  });

export const inboxViewEntry = defineEntry(
  InboxView,
  {
    typical: {
      props: {
        detail: detailFor(),
        listLabel: "Review requested",
        onOpenRow: noop,
        rows: ROWS,
        tabs: TABS,
      },
    },
    /** The pane folded away and the list holding the full width — the state
     *  every reviewer on a small window lives in. */
    "crowd-40": {
      props: {
        detail: detailFor(),
        listLabel: "Review requested",
        onOpenRow: noop,
        rows: Array.from({ length: 40 }, (_, i) =>
          row({
            pr: pr({
              number: 300 - i,
              title: `Row ${i + 1} of a queue nobody has burned down`,
            }),
            selected: i === 0,
          })
        ),
        tabs: TABS,
      },
    },
    archived: {
      props: {
        banner: "Archived · e restores, u returns",
        detail: detailFor(),
        listLabel: "Archived",
        onOpenRow: noop,
        rows: ROWS.slice(0, 2),
        tabs: { ...TABS, archivedActive: true },
      },
    },
    /** Nothing to review: `body` replaces both columns, so the empty state
     *  owns the width rather than sitting in a 1fr track beside a pane. */
    empty: {
      props: {
        body: createElement(InboxZero, {
          hint: "Nothing is waiting on you.",
          title: "Inbox zero",
        }),
        listLabel: "Review requested",
        onOpenRow: noop,
        rows: [],
        tabs: { ...TABS, items: TABS.items.map((t) => ({ ...t, count: 0 })) },
      },
    },
    /** No pane at all — the list is the whole screen, which is what a
     *  cursor-less inbox renders. */
    "no-detail": {
      props: {
        listLabel: "Review requested",
        onOpenRow: noop,
        rows: ROWS.map((r) => ({ ...r, selected: false })),
        tabs: TABS,
      },
    },
    overflow: {
      props: {
        detail: detailFor({ title: UNBREAKABLE }),
        listLabel: "Review requested",
        onOpenRow: noop,
        rows: [
          row({
            pr: pr({
              commentsCount: 12_438,
              headRef: `feature/${UNBREAKABLE}`,
              repo: "nod/a-monorepo-with-a-very-long-organisation-name",
              title: UNBREAKABLE,
            }),
            selected: true,
          }),
          ...ROWS.slice(1),
        ],
        tabs: {
          ...TABS,
          archivedCount: 12_438,
          items: TABS.items.map((t) => ({ ...t, count: 9999 })),
        },
      },
    },
    unicode: {
      props: {
        detail: detailFor({
          author: "藤本 さくら",
          repo: "株式会社/設計システム",
          title: "レビュー画面のヘッダーを @nod/ui に移す 👩‍💻",
        }),
        listLabel: "レビュー依頼",
        onOpenRow: noop,
        rows: [
          row({
            pr: pr({
              author: "محمد الأمين",
              headRef: "機能/レビュー画面",
              repo: "株式会社/設計システム",
              title: "レビュー画面のヘッダーを @nod/ui に移す 👩‍💻",
            }),
            selected: true,
          }),
          ...ROWS.slice(1, 3),
        ],
        tabs: TABS,
      },
    },
    "markup-as-text": {
      props: {
        detail: detailFor({ title: "<img onerror=alert(1) src=x> in a title" }),
        listLabel: "Review requested",
        onOpenRow: noop,
        rows: [
          row({
            pr: pr({
              author: "<script>alert(1)</script>",
              headRef: "<img onerror=alert(1) src=x>",
              title: "<b>not bold</b> in a title",
            }),
            selected: true,
          }),
        ],
        tabs: TABS,
      },
    },
  },
  { view: true }
);
