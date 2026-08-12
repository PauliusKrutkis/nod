/**
 * A thread's shape comes from three things a host cannot control: how many
 * comments arrived, who wrote them, and whether the provider gave the thread
 * a resolvable handle. The fixtures walk that space — one comment, a long
 * back-and-forth, many participants, and no threadId, which is the provider
 * saying this thread cannot be resolved at all. A resolved thread arrives
 * folded, so `resolved-folded` is also the only static view of the collapsed
 * lead; every other fixture is the expanded card.
 *
 * `ownLogin` is what makes Edit and Delete appear, so the own/foreign split
 * is a fixture pair rather than a prop table: `own-last` also earns the
 * hotkey chip, `own-buried` is the case the chip is deliberately withheld
 * from — `shift+e` still edits that comment, but it is no longer the thread's
 * last word.
 *
 * createdAt values are fixed timestamps, never Date.now(): the labels are
 * relative, so a capture of "3m ago" expires within the hour.
 *
 * Two states no fixture can reach. The reply and edit composers are a host
 * slot (a rich text editor the package does not own, still uncatalogued), so
 * a thread mid-draft is a desktop e2e concern; and folding, replying and the
 * three keyboard commands are all interactions, which the same specs cover.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { CommentThread, type ThreadComment } from "./comment-thread.tsx";

const noop = () => Promise.resolve();

const AT = "2024-08-01T00:00:00Z";

const comment = (over: Partial<ThreadComment> & { id: number }) =>
  ({
    body: "Looks right to me.",
    createdAt: AT,
    resolved: false,
    threadId: "PRRT_kwDOA",
    user: "maya",
    userAvatarUrl: "",
    ...over,
  }) satisfies ThreadComment;

const ROOT_BODY = [
  "This drops the guard that kept an outdated hunk from being anchored to a",
  "line that no longer exists. Is that deliberate?",
].join("\n");

const CHAIN: ThreadComment[] = [
  comment({ body: ROOT_BODY, id: 1, user: "priya" }),
  comment({
    body: "It is — the anchor moved to `originalLine` two commits ago, so the guard was rejecting rows that are fine now.",
    id: 2,
    user: "kai",
  }),
  comment({
    body: "Then the comment above it is stale as well; it still says the outdated case is unreachable.",
    id: 3,
    user: "priya",
  }),
  comment({
    body: "Fixed in the last push, along with the test that asserted the old behaviour.",
    id: 4,
    user: "kai",
  }),
  comment({
    body: "One more: `line` can still be null for a file-level comment, and this path indexes it without checking.",
    id: 5,
    user: "sam",
  }),
  comment({
    body: "Good catch — pushed a guard and a fixture for the null case.",
    id: 6,
    user: "kai",
  }),
];

const CROWD: ThreadComment[] = [
  comment({ body: "Kicking this off — see the thread below.", id: 1 }),
  ...Array.from({ length: 14 }, (_, i) =>
    comment({
      body: `Agreed. Point ${i + 1} still stands, though: the retry budget is shared and nothing here says so.`,
      id: i + 2,
      user: `reviewer-${i + 1}`,
    })
  ),
];

export const commentThreadEntry = defineEntry(CommentThread, {
  crowd: {
    props: {
      comments: CROWD,
      onReply: noop,
      onResolve: noop,
      ownLogin: "kai",
      replyPending: false,
    },
  },
  "long-chain": {
    props: {
      comments: CHAIN,
      onDelete: noop,
      onEdit: noop,
      onReply: noop,
      onResolve: noop,
      ownLogin: "sam",
      replyPending: false,
    },
  },
  "not-resolvable": {
    props: {
      comments: [comment({ body: ROOT_BODY, id: 1, threadId: null })],
      onReply: noop,
      onResolve: noop,
      replyPending: false,
    },
  },
  "own-buried": {
    props: {
      comments: CHAIN,
      onDelete: noop,
      onEdit: noop,
      onReply: noop,
      onResolve: noop,
      ownLogin: "priya",
      replyPending: false,
    },
  },
  "own-last": {
    props: {
      comments: CHAIN,
      onDelete: noop,
      onEdit: noop,
      onReply: noop,
      onResolve: noop,
      ownLogin: "kai",
      replyPending: false,
    },
  },
  overflow: {
    props: {
      comments: [
        comment({
          body: `Reproduced with request id req_${"9f8e7d6c".repeat(250)}`,
          id: 1,
          user: `bot-${"automation".repeat(40)}`,
        }),
      ],
      onReply: noop,
      onResolve: noop,
      replyPending: false,
    },
  },
  "resolved-folded": {
    props: {
      comments: CHAIN.map((c) => ({ ...c, resolved: true })),
      onReply: noop,
      onResolve: noop,
      ownLogin: "kai",
      replyPending: false,
    },
  },
  single: {
    props: {
      comments: [comment({ body: ROOT_BODY, id: 1, user: "priya" })],
      onReply: noop,
      onResolve: noop,
      replyPending: false,
    },
  },
  unicode: {
    props: {
      comments: [
        comment({
          body: "この分岐は空配列で落ちます。境界値のテストを足しました。",
          id: 1,
          user: "藤本 さくら",
        }),
        comment({
          body: "شكراً — سأضيف اختباراً للحالة الفارغة أيضاً. 🙏",
          id: 2,
          user: "محمد الأمين",
        }),
      ],
      onReply: noop,
      onResolve: noop,
      replyPending: false,
    },
  },
});
