/**
 * The row renders five unbounded strings and two counts on two lines, so the
 * fixtures are mostly about what happens when one of them refuses to be small:
 * an unbreakable title token, a monorepo-length slug, a release-branch name,
 * and counts in the tens of thousands.
 *
 * updatedAt values are fixed timestamps, never Date.now(): the label is
 * relative, so a capture of "3m ago" expires within the hour. Far-past dates
 * (matching search-pane's fixtures) sit inside a year bucket, the future date
 * pins "just now" permanently, and the empty one is the API value that yields
 * no label at all. The avatar URL resolves nowhere on purpose, the same way
 * avatar's own fixtures do — no capture should depend on the network.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { PRListItem, type PullRequestRow } from "./pr-list-item.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(2000);

function pr(overrides: Partial<PullRequestRow>): PullRequestRow {
  return {
    author: "paulius",
    authorAvatarUrl: AVATAR,
    commentsCount: 4,
    draft: false,
    headRef: "feat/gallery-route",
    merged: false,
    number: 274,
    repo: "nod/nod",
    title: "Make the gallery the source of truth",
    updatedAt: "2024-08-01T00:00:00Z",
    ...overrides,
  };
}

export const prListItemEntry = defineEntry(PRListItem, {
  "ledger-topic": {
    props: {
      onOpen: noop,
      pr: {
        commentsCount: 0,
        draft: false,
        headRef: "chat-panel",
        merged: false,
        repo: "PauliusKrutkis/nod",
        title: "feat(chat): the AI chat panel — chat, skills, and suggestions",
      },
      selected: true,
      unread: false,
    },
  },
  ancient: {
    props: {
      onOpen: noop,
      pr: pr({ updatedAt: "2016-03-04T09:00:00Z" }),
      selected: false,
      unread: false,
    },
  },
  cjk: {
    props: {
      onHover: noop,
      onOpen: noop,
      pr: pr({
        author: "藤本 さくら",
        repo: "株式会社/設計システム",
        title: "ギャラリーを唯一の情報源にする、そして固定具を追加する",
      }),
      selected: false,
      unread: true,
    },
  },
  draft: {
    props: {
      onOpen: noop,
      pr: pr({ draft: true, title: "WIP: port the pure rows into @nod/ui" }),
      selected: false,
      unread: true,
    },
  },
  future: {
    props: {
      onOpen: noop,
      pr: pr({ updatedAt: "2099-01-01T00:00:00Z" }),
      selected: false,
      unread: false,
    },
  },
  "huge-counts": {
    props: {
      onOpen: noop,
      pr: pr({ commentsCount: 99_999, number: 999_999 }),
      selected: false,
      unread: true,
    },
  },
  "markup-as-text": {
    props: {
      onOpen: noop,
      pr: pr({
        author: '<img src=x onerror="alert(1)">',
        title: 'Fix <img src=x onerror="alert(1)"> in the title bar',
      }),
      selected: false,
      unread: true,
    },
  },
  merged: {
    props: {
      onOpen: noop,
      pr: pr({ commentsCount: 12, merged: true }),
      selected: false,
      unread: false,
    },
  },
  minimal: {
    props: {
      onOpen: noop,
      pr: {
        author: "a",
        commentsCount: 0,
        draft: false,
        headRef: "",
        merged: false,
        number: 1,
        repo: "n/n",
        title: "x",
        updatedAt: "",
      },
      selected: false,
      unread: false,
    },
  },
  "no-avatar": {
    props: {
      onOpen: noop,
      pr: pr({ author: "renovate[bot]", authorAvatarUrl: null }),
      selected: false,
      unread: false,
    },
  },
  overflow: {
    props: {
      onOpen: noop,
      pr: pr({
        author: "a-very-long-machine-account-name-for-continuous-delivery",
        commentsCount: 128,
        headRef:
          "release/2026.08-hotfix-candidate-do-not-force-push-this-branch",
        repo: "an-organisation-with-a-long-name/a-monorepo-with-a-longer-name",
        title: `Bump ${UNBREAKABLE}`,
      }),
      selected: false,
      unread: true,
    },
  },
  read: {
    props: { onOpen: noop, pr: pr({}), selected: false, unread: false },
  },
  rtl: {
    props: {
      onOpen: noop,
      pr: pr({
        author: "محمد الأمين",
        repo: "منظمة/مستودع",
        title: "إصلاح ترتيب الأعمدة في لوحة المراجعة",
      }),
      selected: false,
      unread: true,
    },
  },
  selected: {
    props: { onOpen: noop, pr: pr({}), selected: true, unread: true },
  },
  unread: {
    props: {
      onHover: noop,
      onOpen: noop,
      pr: pr({}),
      selected: false,
      unread: true,
    },
  },
  "zero-counts": {
    props: {
      onOpen: noop,
      pr: pr({ commentsCount: 0, headRef: "", number: 0 }),
      selected: false,
      unread: false,
    },
  },
});
