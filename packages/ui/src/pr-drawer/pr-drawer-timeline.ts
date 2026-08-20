/**
 * Builds the drawer's Discussion feed: PR-level comments, review verdicts and
 * inline code threads folded into one list ordered oldest first, the way a
 * history reads.
 *
 * A thread enters the feed once, at its ROOT comment's time, never at its
 * latest reply's. The row shows the root's author, time and first line, so
 * ordering by a reply would put the feed's order at odds with what the rows
 * say, and a thread would jump to the bottom every time somebody answered it.
 * Replies are therefore counted onto their root rather than listed, and the
 * exchange itself stays at the jump target in the diff. Ties keep the order
 * the sources arrive in (comments, then verdicts, then threads) because the
 * sort is stable, which is what makes a fixture render the same way twice.
 *
 * Sorting compares the ISO timestamps with localeCompare, matching how
 * reviews are already ordered on the desktop side.
 */

import type { ThreadIndexRow } from "../thread-index/thread-index.tsx";

export interface TimelineComment {
  body: string;
  createdAt: string;
  id: number;
  user: string;
  userAvatarUrl: string;
}

export interface TimelineReview {
  body: string;
  id: number;
  state: string;
  submittedAt: string;
  user: string;
  userAvatarUrl: string;
}

export interface TimelineInlineComment {
  body: string;
  createdAt: string;
  id: number;
  inReplyToId: number | null;
  line: number | null;
  path: string;
  resolved: boolean;
  user: string;
  userAvatarUrl: string;
}

export type TimelineEntry<
  Comment extends TimelineComment = TimelineComment,
  Review extends TimelineReview = TimelineReview,
> =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "review"; at: string; review: Review }
  | { kind: "thread"; at: string; thread: ThreadIndexRow };

function firstLine(body: string): string {
  return body.trim().split("\n")[0] ?? "";
}

export function threadRowsFrom(
  inlineComments: readonly TimelineInlineComment[]
): ThreadIndexRow[] {
  const replyCounts = new Map<number, number>();
  for (const comment of inlineComments) {
    if (comment.inReplyToId !== null) {
      replyCounts.set(
        comment.inReplyToId,
        (replyCounts.get(comment.inReplyToId) ?? 0) + 1
      );
    }
  }
  return inlineComments
    .filter((comment) => comment.inReplyToId === null)
    .map((root) => ({
      createdAt: root.createdAt,
      id: root.id,
      line: root.line,
      path: root.path,
      replyCount: replyCounts.get(root.id) ?? 0,
      resolved: root.resolved,
      snippet: firstLine(root.body),
      user: root.user,
      userAvatarUrl: root.userAvatarUrl,
    }));
}

export function buildDiscussionTimeline<
  Comment extends TimelineComment,
  Review extends TimelineReview,
>(source: {
  conversation: readonly Comment[];
  inlineComments: readonly TimelineInlineComment[];
  reviews: readonly Review[];
}): TimelineEntry<Comment, Review>[] {
  const entries: TimelineEntry<Comment, Review>[] = [
    ...source.conversation.map(
      (comment) =>
        ({ at: comment.createdAt, comment, kind: "comment" }) as const
    ),
    ...source.reviews.map(
      (review) => ({ at: review.submittedAt, kind: "review", review }) as const
    ),
    ...threadRowsFrom(source.inlineComments).map(
      (thread) => ({ at: thread.createdAt, kind: "thread", thread }) as const
    ),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

export function newestCommentEntry<
  Comment extends TimelineComment,
  Review extends TimelineReview,
>(
  timeline: readonly TimelineEntry<Comment, Review>[]
): TimelineEntry<Comment, Review> | undefined {
  let newest: TimelineEntry<Comment, Review> | undefined;
  for (const entry of timeline) {
    if (entry.kind === "comment") {
      newest = entry;
    }
  }
  return newest;
}
