/**
 * The strip is a row that must survive both ends: no tabs at all (the host
 * hides empty buckets, so a quiet morning can leave one), and five tabs whose
 * labels have been translated into something three times longer. `no-match`
 * pins the case where activeKey names a tab that is not in the list — a stale
 * store value — because the row must still render, with nothing underlined
 * rather than the first tab underlined by accident.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { type InboxTab, InboxTabs } from "./inbox-tabs.tsx";

const noop = () => {
  return;
};

const REVIEW_REQUESTS: InboxTab = {
  count: 3,
  hint: "PRs where your review was requested.",
  key: "reviewRequested",
  label: "Review requests",
};

const TABS: InboxTab[] = [
  REVIEW_REQUESTS,
  {
    count: 1,
    hint: "PRs assigned to you.",
    key: "assigned",
    label: "Assigned",
  },
  { count: 7, hint: "PRs you opened.", key: "created", label: "Created" },
  {
    count: 12,
    hint: "PRs that involve or mention you.",
    key: "involved",
    label: "Involved",
  },
  {
    count: 41,
    hint: "Every open PR in the repositories you watch.",
    key: "subscribed",
    label: "Watching",
  },
];

const handlers = {
  archivedActive: false,
  archivedCount: 0,
  onSelect: noop,
  onToggleArchived: noop,
  onWatch: noop,
};

export const inboxTabsEntry = defineEntry(InboxTabs, {
  "archived-open": {
    props: {
      ...handlers,
      activeKey: "created",
      archivedActive: true,
      archivedCount: 9,
      tabs: TABS.slice(0, 3),
    },
  },
  cjk: {
    props: {
      ...handlers,
      activeKey: "reviewRequested",
      tabs: [
        {
          count: 2,
          hint: "レビューを依頼されたプルリクエスト",
          key: "reviewRequested",
          label: "レビュー依頼",
        },
        {
          count: 0,
          hint: "自分が開いたプルリクエスト",
          key: "created",
          label: "自分が作成",
        },
      ],
    },
  },
  empty: {
    props: { ...handlers, activeKey: "reviewRequested", tabs: [] },
  },
  full: {
    props: {
      ...handlers,
      activeKey: "reviewRequested",
      archivedCount: 4,
      tabs: TABS,
    },
  },
  "huge-counts": {
    props: {
      ...handlers,
      activeKey: "subscribed",
      archivedCount: 99_999,
      tabs: TABS.map((tab) => ({ ...tab, count: 12_438 })),
    },
  },
  "markup-as-text": {
    props: {
      ...handlers,
      activeKey: "created",
      tabs: [
        {
          count: 1,
          hint: 'A hint with <img src=x onerror="alert(1)"> in it',
          key: "created",
          label: '<img src=x onerror="alert(1)">',
        },
      ],
    },
  },
  "no-match": {
    props: { ...handlers, activeKey: "a-tab-that-went-away", tabs: TABS },
  },
  overflow: {
    props: {
      ...handlers,
      activeKey: "reviewRequested",
      archivedCount: 1288,
      tabs: TABS.map((tab) => ({
        ...tab,
        label: `${tab.label} that someone translated at length`,
      })),
    },
  },
  rtl: {
    props: {
      ...handlers,
      activeKey: "assigned",
      tabs: [
        {
          count: 5,
          hint: "طلبات المراجعة الموكلة إليك",
          key: "assigned",
          label: "المُسندة إليّ",
        },
        {
          count: 2,
          hint: "الطلبات التي فتحتها",
          key: "created",
          label: "التي أنشأتها",
        },
      ],
    },
  },
  single: {
    props: {
      ...handlers,
      activeKey: "reviewRequested",
      tabs: [REVIEW_REQUESTS],
    },
  },
  "zero-count": {
    props: {
      ...handlers,
      activeKey: "reviewRequested",
      tabs: [{ ...REVIEW_REQUESTS, count: 0 }],
    },
  },
});
