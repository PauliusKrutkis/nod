/**
 * The pane renders four unbounded strings (title, repo, author, body), a
 * quoted comment and five counts inside a 380px column, so the fixtures are
 * about what each of them does when it refuses to be small: an unbreakable
 * title token, a monorepo-length slug, a body of 90 lines the clamp has to
 * hold, and counts in the tens of thousands.
 *
 * `zero-stats` is the strip's own boundary — no files, no diff, so only the
 * comment count survives and neither separator may show. Timestamps are fixed
 * (a relative label captured as "3m ago" expires within the hour), with the
 * far-past, future and empty API values each pinned.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { InboxDetail, type InboxPullRequest } from "./inbox-detail.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(2000);

const BODY = `Ports the inbox reading pane into @nod/ui behind a body slot.

The host keeps the markdown renderer — it needs the Tauri opener for links
and a sanitiser for embedded HTML — and hands the pane a rendered node.`;

function pr(overrides: Partial<InboxPullRequest>): InboxPullRequest {
  return {
    additions: 128,
    author: "paulius",
    authorAvatarUrl: AVATAR,
    body: BODY,
    changedFiles: 7,
    commentsCount: 4,
    deletions: 31,
    draft: false,
    merged: false,
    number: 274,
    repo: "nod/nod",
    title: "SCR-2891 Make the gallery the source of truth",
    updatedAt: "2024-08-01T00:00:00Z",
    ...overrides,
  };
}

export const inboxDetailEntry = defineEntry(InboxDetail, {
  "ledger-topic": {
    props: {
      archivable: false,
      onOpenTicket: noop,
      openHint: "open session",
      pr: {
        additions: 11_764,
        body: "How it got here:\n#348 feat(chat): the AI chat panel\n#358 feat(chat): suggested comments\n4e43d2a fix chat scroll pinning",
        changedFiles: 86,
        commentsCount: 0,
        deletions: 0,
        draft: false,
        author: "PauliusKrutkis",
        merged: false,
        number: 7,
        repo: "PauliusKrutkis/nod",
        title: "feat(chat): the AI chat panel — chat, skills, and suggestions",
      },
    },
  },
  archived: {
    props: {
      archived: true,
      onOpenTicket: noop,
      pr: pr({ merged: true, updatedAt: "2016-03-04T09:00:00Z" }),
    },
  },
  cjk: {
    props: {
      onOpenTicket: noop,
      pr: pr({
        author: "藤本 さくら",
        body: "ギャラリーを唯一の情報源にします。固定具はコンポーネントの隣に置きます。",
        lastComment: {
          author: "田中 一郎",
          authorAvatarUrl: null,
          body: "これで問題ありません。マージしてください。",
          createdAt: "2024-07-31T12:00:00Z",
        },
        repo: "株式会社/設計システム",
        title: "ギャラリーを唯一の情報源にする",
      }),
    },
  },
  draft: {
    props: {
      onOpenTicket: noop,
      pr: pr({ body: "", draft: true, title: "WIP: port the reading pane" }),
    },
  },
  "last-comment": {
    props: {
      onOpenTicket: noop,
      pr: pr({
        lastComment: {
          author: "renovate[bot]",
          authorAvatarUrl: null,
          body: "This PR contains the following updates:\n\n- bump vite from 7.0.3 to 7.0.4\n- bump vitest from 4.1.8 to 4.1.9\n- bump playwright from 1.61.0 to 1.61.1\n- bump react from 19.1.0 to 19.1.1\n- bump lucide-react from 1.21.0 to 1.22.0\n- bump typescript from 5.8.2 to 5.8.3\n- bump biome from 2.0.0 to 2.0.1",
          createdAt: "2024-07-31T23:30:00Z",
        },
      }),
      trackerBase: "https://tracker.example.test/browse/",
    },
  },
  "markup-as-text": {
    props: {
      onOpenTicket: noop,
      pr: pr({
        author: '<img src=x onerror="alert(1)">',
        body: 'A body carrying <img src=x onerror="alert(1)"> as text',
        lastComment: {
          author: "bob",
          authorAvatarUrl: null,
          body: '<img src=x onerror="alert(1)">',
          createdAt: "2024-08-01T00:00:00Z",
        },
        title: 'Fix <img src=x onerror="alert(1)"> in the header',
      }),
    },
  },
  minimal: {
    props: {
      onOpenTicket: noop,
      pr: {
        additions: 0,
        author: "a",
        body: "",
        changedFiles: 0,
        commentsCount: 0,
        deletions: 0,
        draft: false,
        merged: false,
        number: 1,
        repo: "n/n",
        title: "x",
        updatedAt: "",
      },
    },
  },
  overflow: {
    props: {
      onOpenTicket: noop,
      pr: pr({
        additions: 99_999,
        author: "a-very-long-machine-account-name-for-continuous-delivery",
        body: `Bump ${UNBREAKABLE}`,
        changedFiles: 12_438,
        commentsCount: 4096,
        deletions: 12_004,
        lastComment: {
          author: "a-very-long-machine-account-name-for-continuous-delivery",
          authorAvatarUrl: AVATAR,
          body: Array.from(
            { length: 90 },
            (_, line) => `line ${line + 1} of a comment nobody will read`
          ).join("\n"),
          createdAt: "2099-01-01T00:00:00Z",
        },
        number: 999_999,
        repo: "an-organisation-with-a-long-name/a-monorepo-with-a-longer-name",
        title: `Bump ${UNBREAKABLE}`,
      }),
    },
  },
  rtl: {
    props: {
      onOpenTicket: noop,
      pr: pr({
        author: "محمد الأمين",
        body: "إصلاح ترتيب الأعمدة في لوحة المراجعة، ثم إضافة الاختبارات.",
        repo: "منظمة/مستودع",
        title: "إصلاح ترتيب الأعمدة في لوحة المراجعة",
      }),
    },
  },
  ticket: {
    props: {
      onOpenTicket: noop,
      pr: pr({}),
      trackerBase: "https://tracker.example.test/browse/",
    },
  },
  typical: {
    props: { onOpenTicket: noop, pr: pr({}) },
  },
  "zero-stats": {
    props: {
      onOpenTicket: noop,
      pr: pr({
        additions: 0,
        changedFiles: 0,
        commentsCount: 1,
        deletions: 0,
      }),
    },
  },
});
