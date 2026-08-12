/**
 * Every string in a row is remote data, so the cases are the shapes that data
 * takes: an empty log, one item, the long tail that has to scroll, and the
 * pair that breaks this layout if anything forgets to wrap — an unbreakable
 * title and a machine account's name, which together push the date column off
 * the panel. `markup-as-text` pins that titles render as text, since they
 * arrive verbatim from a PR nobody here controls.
 *
 * The channel dials get their own cases rather than riding along: `all-off`
 * and `os-only` are the two settings a screenshot would otherwise never show,
 * and they are the states a refactor inverts silently because both look like
 * "not the default".
 *
 * Read state is pinned per case instead of derived — the unread dot, the
 * accent kind label and the header count all key off it, and `all-read` is
 * the one that must also disable "Mark all read". Timestamps are fixed dates,
 * never the clock, so a capture taken next year is the same image.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import {
  NotificationCenter,
  type NotificationItem,
} from "./notification-center.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(2000);

const shared = {
  channels: { authorResponded: "toast", reviewRequested: "toast" } as const,
  onChannelChange: noop,
  onMarkAllRead: noop,
  onOpenChange: noop,
  onOpenItem: noop,
  open: true,
};

function item(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    actor: "alice",
    actorAvatarUrl: AVATAR,
    createdAt: "2026-07-02T12:00:00Z",
    id: "authorResponded:acme/nod#5@2026-07-02T12:00:00Z",
    kind: "authorResponded",
    number: 5,
    read: false,
    repo: "acme/nod",
    title: "Tighten the retry backoff",
    ...over,
  };
}

const many: NotificationItem[] = Array.from({ length: 18 }, (_, i) =>
  item({
    actor: i % 2 === 0 ? "alice" : "bruno",
    createdAt: `2026-0${1 + (i % 9)}-1${i % 10}T09:00:00Z`,
    id: `e${i}`,
    kind: i % 3 === 0 ? "reviewRequested" : "authorResponded",
    number: 100 + i,
    read: i > 3,
    title:
      i % 4 === 0
        ? "Collapse generated files by default and discount them everywhere size is counted"
        : "Tighten the retry backoff",
  })
);

export const notificationCenterEntry = defineEntry(
  NotificationCenter,
  {
    "all-off": {
      props: {
        ...shared,
        channels: { authorResponded: "off", reviewRequested: "off" },
        items: [item()],
      },
    },
    "all-read": {
      props: {
        ...shared,
        items: [item({ read: true }), item({ id: "b", number: 6, read: true })],
      },
    },
    cjk: {
      props: {
        ...shared,
        items: [
          item({
            actor: "藤本 さくら",
            title: "ギャラリーを唯一の情報源にする",
          }),
        ],
      },
    },
    empty: {
      props: { ...shared, items: [] },
    },
    "markup-as-text": {
      props: {
        ...shared,
        items: [
          item({
            actor: '<img src=x onerror="alert(1)">',
            title: 'Fix <img src=x onerror="alert(1)"> in the header',
          }),
        ],
      },
    },
    "no-avatar": {
      props: {
        ...shared,
        items: [item({ actor: "renovate[bot]", actorAvatarUrl: null })],
      },
    },
    "os-only": {
      props: {
        ...shared,
        channels: { authorResponded: "os", reviewRequested: "both" },
        items: [item()],
      },
    },
    overflow: {
      props: {
        ...shared,
        items: [
          item({
            actor: "a-very-long-machine-account-name-for-continuous-delivery",
            number: 999_999,
            repo: `acme/${UNBREAKABLE}`,
            title: `Bump ${UNBREAKABLE}`,
          }),
        ],
      },
    },
    rtl: {
      props: {
        ...shared,
        items: [
          item({
            actor: "محمد الأمين",
            title: "إصلاح ترتيب الأعمدة في لوحة المراجعة",
          }),
        ],
      },
    },
    scrolling: {
      props: { ...shared, items: many },
    },
    typical: {
      props: {
        ...shared,
        items: [
          item(),
          item({
            actor: "bruno",
            createdAt: "2026-07-01T08:30:00Z",
            id: "reviewRequested:acme/nod#12@",
            kind: "reviewRequested",
            number: 12,
            read: true,
            title: "Collapse generated files by default",
          }),
        ],
      },
    },
  },
  { dialog: true }
);
