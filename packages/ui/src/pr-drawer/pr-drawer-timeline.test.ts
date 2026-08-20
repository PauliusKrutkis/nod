import { describe, expect, it } from "vitest";
import {
  buildDiscussionTimeline,
  newestCommentEntry,
  type TimelineComment,
  type TimelineInlineComment,
  type TimelineReview,
  threadRowsFrom,
} from "./pr-drawer-timeline.ts";

function comment(over: Partial<TimelineComment> = {}): TimelineComment {
  return {
    body: "ship it",
    createdAt: "2026-06-02T10:00:00Z",
    id: 1,
    user: "octocat",
    userAvatarUrl: "",
    ...over,
  };
}

function review(over: Partial<TimelineReview> = {}): TimelineReview {
  return {
    body: "looks right",
    id: 1,
    state: "APPROVED",
    submittedAt: "2026-06-02T10:00:00Z",
    user: "hubot",
    userAvatarUrl: "",
    ...over,
  };
}

function inline(
  over: Partial<TimelineInlineComment> = {}
): TimelineInlineComment {
  return {
    body: "why not a constant?",
    createdAt: "2026-06-02T10:00:00Z",
    id: 1,
    inReplyToId: null,
    line: 12,
    path: "src/retry.ts",
    resolved: false,
    user: "octocat",
    userAvatarUrl: "",
    ...over,
  };
}

describe("buildDiscussionTimeline", () => {
  it("orders every kind together, oldest first", () => {
    const timeline = buildDiscussionTimeline({
      conversation: [comment({ createdAt: "2026-06-03T00:00:00Z", id: 10 })],
      inlineComments: [inline({ createdAt: "2026-06-01T00:00:00Z", id: 30 })],
      reviews: [review({ id: 20, submittedAt: "2026-06-02T00:00:00Z" })],
    });

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "thread",
      "review",
      "comment",
    ]);
  });

  it("seats a thread at its root's time, not its latest reply's", () => {
    const timeline = buildDiscussionTimeline({
      conversation: [comment({ createdAt: "2026-06-05T00:00:00Z", id: 10 })],
      inlineComments: [
        inline({ createdAt: "2026-06-01T00:00:00Z", id: 30 }),
        inline({
          createdAt: "2026-06-09T00:00:00Z",
          id: 31,
          inReplyToId: 30,
        }),
      ],
      reviews: [],
    });

    expect(timeline.map((entry) => entry.kind)).toEqual(["thread", "comment"]);
    expect(timeline[0]?.at).toBe("2026-06-01T00:00:00Z");
  });

  it("lists a reply as a count on its root rather than its own row", () => {
    const timeline = buildDiscussionTimeline({
      conversation: [],
      inlineComments: [
        inline({ id: 30 }),
        inline({ id: 31, inReplyToId: 30 }),
        inline({ id: 32, inReplyToId: 30 }),
      ],
      reviews: [],
    });

    expect(timeline).toHaveLength(1);
    const [entry] = timeline;
    expect(entry?.kind === "thread" && entry.thread.replyCount).toBe(2);
  });

  it("keeps a stable order when timestamps tie", () => {
    const at = "2026-06-02T10:00:00Z";
    const timeline = buildDiscussionTimeline({
      conversation: [comment({ createdAt: at, id: 10 })],
      inlineComments: [inline({ createdAt: at, id: 30 })],
      reviews: [review({ id: 20, submittedAt: at })],
    });

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "comment",
      "review",
      "thread",
    ]);
  });

  it("is empty when the pull request has no discussion at all", () => {
    expect(
      buildDiscussionTimeline({
        conversation: [],
        inlineComments: [],
        reviews: [],
      })
    ).toEqual([]);
  });
});

describe("threadRowsFrom", () => {
  it("folds a body down to its first line for the row snippet", () => {
    const [row] = threadRowsFrom([
      inline({ body: "why not a constant?\n\nthe retry loop reads it twice" }),
    ]);

    expect(row?.snippet).toBe("why not a constant?");
  });

  it("carries the resolved mark and an outdated thread's null line", () => {
    const rows = threadRowsFrom([
      inline({ id: 30, line: null, resolved: true }),
    ]);

    expect(rows[0]?.resolved).toBe(true);
    expect(rows[0]?.line).toBeNull();
  });

  it("keeps a reply whose root is missing out of the rows", () => {
    const rows = threadRowsFrom([inline({ id: 31, inReplyToId: 999 })]);

    expect(rows).toEqual([]);
  });
});

describe("newestCommentEntry", () => {
  it("finds the last comment, ignoring later verdicts and threads", () => {
    const timeline = buildDiscussionTimeline({
      conversation: [
        comment({ createdAt: "2026-06-01T00:00:00Z", id: 10 }),
        comment({ createdAt: "2026-06-02T00:00:00Z", id: 11 }),
      ],
      inlineComments: [inline({ createdAt: "2026-06-09T00:00:00Z", id: 30 })],
      reviews: [review({ id: 20, submittedAt: "2026-06-08T00:00:00Z" })],
    });

    const newest = newestCommentEntry(timeline);

    expect(newest?.kind === "comment" && newest.comment.id).toBe(11);
  });

  it("finds nothing when the feed holds no PR-level comment", () => {
    const timeline = buildDiscussionTimeline({
      conversation: [],
      inlineComments: [inline({ id: 30 })],
      reviews: [review({ id: 20 })],
    });

    expect(newestCommentEntry(timeline)).toBeUndefined();
  });
});
