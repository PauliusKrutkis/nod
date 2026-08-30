/**
 * The drawer's shape comes from what the provider returned: how much
 * description, how many comments and verdicts, whether CI exists and how it
 * went, and whether any inline threads survived the last push. The fixtures
 * walk that space — a typical read, an empty conversation, a 20-entry crowd,
 * verdict-free discussion, failing checks — and the hostile corners: a
 * 2000-character unbreakable token in the description AND in a comment
 * (narrow captures come free, the shots suite reshoots overflow/crowd names
 * at 280px), CJK/RTL names and bodies, and script/onerror payloads that must
 * come out inert (author names render as text; bodies pass through the
 * package's sanitizing Markdown, since no fixture supplies renderMarkdown).
 *
 * `ownLogin` is what makes Edit/Delete appear, so own vs foreign is a
 * fixture pair; the tool strips are always visible here because the at-rest
 * hiding is the desktop's hover reveal, which stays in its stylesheet.
 * `draft-present` seeds `initialDraft` to show the collapsed prompt
 * advertising a surviving draft ("Continue your draft…"). No fixture opens
 * the composer: expanding it focuses the editor by design, and a focused
 * editor paints a blinking caret — a flaky pixel no capture should carry —
 * so the expanded footer stays a desktop e2e concern (composer.spec,
 * drawer-comment.spec). Every fixture is `embedded` and `open`: the drawer
 * is the app's overlay, and the review screen owns the frame it docks to;
 * embedded is the panel in normal flow, which is the only static view a
 * frame with no height of its own can hold.
 *
 * Timestamps are fixed ISO strings, never Date.now(): the labels are
 * relative, so a capture of "3m ago" expires within the hour.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import {
  type DrawerComment,
  type DrawerInlineComment,
  type DrawerReview,
  PrDrawer,
  type PrDrawerCallbacks,
  type PrDrawerProps,
} from "./pr-drawer.tsx";

const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

const CALLBACKS: PrDrawerCallbacks = {
  onAddComment: asyncNoop,
  onClose: noop,
  onDeleteComment: asyncNoop,
  onEditComment: asyncNoop,
  onJumpToThread: noop,
  onOpenCiUrl: noop,
  onOpenPr: noop,
  onOpenTicket: noop,
};

const DESCRIPTION = [
  "Polling the inbox every 45s hammers the API the moment a laptop wakes with six windows open. This adds **jittered backoff** to the poll:",
  "",
  "- base interval unchanged at 45s",
  "- on failure: 90s, 3m, 12m, capped at 30m",
  "- jitter of ±20% so the windows never stampede together",
  "",
  "The ledger in `localStorage` keeps the last good cursor, so a recovered poll resumes instead of refetching the world.",
].join("\n");

const comment = (over: Partial<DrawerComment> & { id: number }) =>
  ({
    body: "Looks right to me.",
    createdAt: "2025-06-03T10:00:00Z",
    user: "maya",
    userAvatarUrl: "",
    ...over,
  }) satisfies DrawerComment;

const review = (over: Partial<DrawerReview> & { id: number }) =>
  ({
    body: "",
    state: "APPROVED",
    submittedAt: "2025-06-04T16:00:00Z",
    user: "priya",
    userAvatarUrl: "",
    ...over,
  }) satisfies DrawerReview;

const CONVERSATION: DrawerComment[] = [
  comment({
    body: "Does the cap survive a machine sleep? The poll timer used to reset on wake and start the ladder over.",
    createdAt: "2025-06-03T09:12:00Z",
    id: 210,
    user: "priya",
  }),
  comment({
    body: "It does now — the ladder position rides in the ledger next to the cursor, so wake resumes where it left off.",
    createdAt: "2025-06-03T11:40:00Z",
    id: 211,
    user: "kai",
  }),
  comment({
    body: "Deploying to staging first to watch the request graph for a day.",
    createdAt: "2025-06-04T08:05:00Z",
    id: 212,
    user: "kai",
  }),
];

const REVIEWS: DrawerReview[] = [
  review({
    body: "LGTM once the ladder reset question is settled.",
    id: 900,
    state: "COMMENTED",
    submittedAt: "2025-06-03T10:30:00Z",
    user: "maya",
  }),
  review({ id: 901, submittedAt: "2025-06-04T16:00:00Z" }),
];

const INLINE: DrawerInlineComment[] = [
  {
    body: "This shared retry budget is per-window; nothing here says so.",
    createdAt: "2025-06-03T09:40:00Z",
    id: 501,
    inReplyToId: null,
    line: 142,
    path: "apps/desktop/src/hooks/use-inbox-poll.ts",
    resolved: false,
    user: "maya",
    userAvatarUrl: "",
  },
  {
    body: "Good catch — documented in the header now.",
    createdAt: "2025-06-03T10:05:00Z",
    id: 502,
    inReplyToId: 501,
    line: 142,
    path: "apps/desktop/src/hooks/use-inbox-poll.ts",
    resolved: false,
    user: "kai",
    userAvatarUrl: "",
  },
  {
    body: "The old cursor key never gets cleaned up.",
    createdAt: "2025-06-02T17:55:00Z",
    id: 503,
    inReplyToId: null,
    line: null,
    path: "apps/desktop/src/store/app-store.ts",
    resolved: true,
    user: "priya",
    userAvatarUrl: "",
  },
];

const base = (over: Partial<PrDrawerProps>): PrDrawerProps => ({
  addCommentPending: false,
  callbacks: CALLBACKS,
  ci: {
    failed: 0,
    state: "success",
    total: 9,
    url: "https://github.com/nod/pr-flow/actions/runs/98",
  },
  conversation: CONVERSATION,
  embedded: true,
  fileCount: 12,
  inlineComments: INLINE,
  open: true,
  openLabel: "Open on GitHub",
  ownLogin: "kai",
  pr: {
    additions: 214,
    author: "kai",
    authorAvatarUrl: "",
    body: DESCRIPTION,
    deletions: 96,
    number: 4182,
    title: "NOD-1428: Retry the inbox poll with jittered backoff",
    updatedAt: "2025-06-04T16:20:00Z",
    url: "https://github.com/nod/pr-flow/pull/4182",
  },
  reviews: REVIEWS,
  trackerBase: "https://nod.atlassian.net/browse/",
  ...over,
});

const LONG_TOKEN = `req_${"9f8e7d6c".repeat(250)}`;

export const prDrawerEntry = defineEntry(PrDrawer, {
  "ci-failing": {
    props: base({
      ci: {
        failed: 2,
        state: "failure",
        total: 9,
        url: "https://github.com/nod/pr-flow/actions/runs/99",
      },
      reviews: [
        review({
          body: "The backoff cap regresses the staleness budget; see the inline thread.",
          id: 902,
          state: "CHANGES_REQUESTED",
          user: "sam",
        }),
      ],
    }),
  },
  crowd: {
    props: base({
      conversation: [
        ...CONVERSATION,
        ...Array.from({ length: 16 }, (_, i) =>
          comment({
            body: `Point ${i + 1} still stands: the retry budget is shared across windows and nothing in the description says so.`,
            createdAt: `2025-06-05T${String(i + 6).padStart(2, "0")}:00:00Z`,
            id: 300 + i,
            user: `reviewer-${i + 1}`,
          })
        ),
      ],
      reviews: [
        ...REVIEWS,
        review({
          id: 903,
          state: "DISMISSED",
          submittedAt: "2025-06-05T09:30:00Z",
          user: "sam",
        }),
        review({
          id: 904,
          state: "SOMETHING_NEW",
          submittedAt: "2025-06-05T10:30:00Z",
          user: "ada",
        }),
      ],
    }),
  },
  "draft-present": {
    props: base({
      initialDraft:
        "Half a thought about the retry budget that Esc must not eat:",
    }),
  },
  "empty-conversation": {
    props: base({
      ci: undefined,
      conversation: [],
      inlineComments: [],
      pr: { ...base({}).pr, body: "" },
      reviews: [],
      trackerBase: undefined,
    }),
  },
  "foreign-comment": {
    props: base({
      conversation: [
        comment({
          body: "Nice direction overall. The ladder caps where our rate limiter starts to complain, which is the right ceiling.",
          id: 230,
          user: "priya",
        }),
      ],
      inlineComments: [],
      reviews: [],
    }),
  },
  "markup-as-text": {
    props: base({
      conversation: [
        comment({
          body: 'Repro: <img src="./missing.png" onerror="alert(1)"> and <script>alert(2)</script> inline.',
          id: 240,
          user: "<script>alert(3)</script>",
        }),
      ],
      inlineComments: [
        {
          body: "<svg onload=alert(4)> in a snippet stays text.",
          createdAt: "2025-06-03T12:00:00Z",
          id: 504,
          inReplyToId: null,
          line: 7,
          path: "<b>not/markup</b>.ts",
          resolved: false,
          user: "<script>alert(3)</script>",
          userAvatarUrl: "",
        },
      ],
      pr: {
        ...base({}).pr,
        body: 'Before.\n\n<script>alert(5)</script>\n\n<a href="javascript:alert(6)">defused</a>\n\nAfter.',
        title: "<b>Bold</b> is not a title & neither is <script>",
      },
      reviews: [],
      trackerBase: undefined,
    }),
  },
  "no-verdicts": {
    props: base({ reviews: [] }),
  },
  overflow: {
    props: base({
      conversation: [
        comment({
          body: `Reproduced with request id ${LONG_TOKEN}`,
          id: 250,
          user: `bot-${"automation".repeat(20)}`,
        }),
      ],
      pr: {
        ...base({}).pr,
        body: `Fails only for tokens shaped like ${LONG_TOKEN} which never wrap on their own.`,
        title: `Handle ${"very".repeat(40)} long unbreakable titles`,
      },
      reviews: [],
      trackerBase: undefined,
    }),
  },
  "own-comment": {
    props: base({
      conversation: [
        comment({
          body: "Deploying to staging first to watch the request graph for a day.",
          id: 212,
          user: "kai",
        }),
      ],
      inlineComments: [],
      reviews: [],
    }),
  },
  // The ledger session's seating: a topic instead of a PR — no number, no
  // page to open, no composer (facts need an anchor) — with the group's
  // story as the description and a standing approval as the one verdict.
  "ledger-topic": {
    props: base({
      ci: undefined,
      conversation: [],
      pr: {
        additions: 214,
        author: "kai",
        authorAvatarUrl: "",
        body: "Coverage 42.0% · 214/510 post-epoch lines · epoch e9017aa → tip 71b0000\n\nHow it got here:\n#321 feat(ledger): anchor resolver (#321)\n\nFiles:\nsrc/anchors/resolve.ts (+40)",
        deletions: 0,
        title: "ledger",
      },
      reviews: [review({ id: 906, state: "APPROVED", user: "kai" })],
      showComposer: false,
    }),
  },
  typical: {
    props: base({}),
  },
  unicode: {
    props: base({
      conversation: [
        comment({
          body: "この分岐は空配列で落ちます。境界値のテストを足しました。",
          id: 260,
          user: "藤本 さくら",
        }),
        comment({
          body: "شكراً — سأضيف اختباراً للحالة الفارغة أيضاً. 🙏",
          createdAt: "2025-06-03T12:00:00Z",
          id: 261,
          user: "محمد الأمين",
        }),
      ],
      pr: {
        ...base({}).pr,
        author: "藤本 さくら",
        body: "空配列でポーリングが落ちる問題を修正します。\n\nيصحّح هذا التغيير سلوك إعادة المحاولة عند الاستيقاظ.",
        title: "受信トレイのポーリングを指数バックオフで再試行する",
      },
      reviews: [review({ id: 905, user: "藤本 さくら" })],
      trackerBase: undefined,
    }),
  },
});
