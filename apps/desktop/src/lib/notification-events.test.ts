import { describe, expect, it } from "vitest";
import type { InboxBucket, InboxData, PullRequest } from "../types.ts";
import { detectEvents } from "./notification-events.ts";

const REVIEWED_AT = "2026-07-02T09:00:00Z";
const BEFORE_REVIEW = "2026-07-02T08:00:00Z";
const AFTER_REVIEW = "2026-07-02T12:00:00Z";

function pr(over: Partial<PullRequest> = {}): PullRequest {
  return {
    additions: 1,
    author: "alice",
    authorAvatarUrl: "av",
    baseRef: "main",
    baseSha: "",
    body: "",
    changedFiles: 1,
    commentsCount: 0,
    createdAt: "2026-07-01T00:00:00Z",
    deletions: 0,
    draft: false,
    headRef: "feat",
    headSha: "",
    id: 1,
    merged: false,
    name: "nod",
    number: 5,
    owner: "acme",
    repo: "acme/nod",
    state: "open",
    title: "Tighten the retry backoff",
    updatedAt: "2026-07-02T12:00:00Z",
    url: "https://github.com/acme/nod/pull/5",
    viewerDidAuthor: false,
    ...over,
  };
}

function reply(author: string, createdAt: string) {
  return { author, authorAvatarUrl: "av", body: "Pushed it.", createdAt };
}

function bucket(prs: PullRequest[]): InboxBucket {
  return { count: prs.length, prs };
}

function inbox(over: Partial<InboxData> = {}): InboxData {
  return {
    assigned: bucket([]),
    created: bucket([]),
    involved: bucket([]),
    reviewRequested: bucket([]),
    ...over,
  };
}

describe("review requests", () => {
  it("announces a PR waiting on your review", () => {
    const events = detectEvents(inbox({ reviewRequested: bucket([pr()]) }));
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("reviewRequested");
    expect(events[0]?.actor).toBe("alice");
    expect(events[0]?.prKey).toBe("acme/nod#5");
  });

  it("keeps one id while the request is pending, so churn on the PR is silent", () => {
    const first = detectEvents(inbox({ reviewRequested: bucket([pr()]) }));
    const later = detectEvents(
      inbox({
        reviewRequested: bucket([
          pr({ commentsCount: 9, updatedAt: "2026-07-09T23:00:00Z" }),
        ]),
      })
    );
    expect(later[0]?.id).toBe(first[0]?.id);
  });

  it("announces again when a review is requested after you already reviewed", () => {
    const before = detectEvents(inbox({ reviewRequested: bucket([pr()]) }));
    const after = detectEvents(
      inbox({
        reviewRequested: bucket([pr({ viewerLastReviewAt: REVIEWED_AT })]),
      })
    );
    expect(after[0]?.id).not.toBe(before[0]?.id);
  });

  it("ignores your own PR", () => {
    const events = detectEvents(
      inbox({ reviewRequested: bucket([pr({ viewerDidAuthor: true })]) })
    );
    expect(events).toEqual([]);
  });
});

describe("author responded", () => {
  it("announces the author replying after the review you left", () => {
    const events = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("alice", AFTER_REVIEW),
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
      })
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("authorResponded");
    expect(events[0]?.createdAt).toBe(AFTER_REVIEW);
  });

  it("stays silent on a PR you never reviewed, however you were pulled in", () => {
    const events = detectEvents(
      inbox({
        involved: bucket([pr({ lastComment: reply("alice", AFTER_REVIEW) })]),
      })
    );
    expect(events).toEqual([]);
  });

  it("stays silent when the reply predates your review", () => {
    const events = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("alice", BEFORE_REVIEW),
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
      })
    );
    expect(events).toEqual([]);
  });

  it("stays silent when the newest comment is from anyone but the author", () => {
    const events = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("bob", AFTER_REVIEW),
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
      })
    );
    expect(events).toEqual([]);
  });

  it("stays silent on your own PR, even when you reviewed it yourself", () => {
    const events = detectEvents(
      inbox({
        created: bucket([
          pr({
            lastComment: reply("alice", AFTER_REVIEW),
            viewerDidAuthor: true,
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
      })
    );
    expect(events).toEqual([]);
  });

  it("gives a second reply its own id and keeps the first one's stable", () => {
    const one = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("alice", AFTER_REVIEW),
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
      })
    );
    const two = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("alice", "2026-07-02T13:00:00Z"),
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
      })
    );
    expect(two[0]?.id).not.toBe(one[0]?.id);
    expect(one[0]?.id).toBe(
      detectEvents(
        inbox({
          involved: bucket([
            pr({
              lastComment: reply("alice", AFTER_REVIEW),
              viewerLastReviewAt: REVIEWED_AT,
            }),
          ]),
        })
      )[0]?.id
    );
  });

  it("stays silent for a provider that cannot answer the viewer fields", () => {
    const events = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("alice", AFTER_REVIEW),
            viewerDidAuthor: false,
            viewerLastReviewAt: undefined,
          }),
        ]),
      })
    );
    expect(events).toEqual([]);
  });
});

describe("the whole poll", () => {
  it("emits one event for a PR sitting in several buckets", () => {
    const replied = pr({
      lastComment: reply("alice", AFTER_REVIEW),
      viewerLastReviewAt: REVIEWED_AT,
    });
    const events = detectEvents(
      inbox({ assigned: bucket([replied]), involved: bucket([replied]) })
    );
    expect(events).toHaveLength(1);
  });

  it("reports both kinds at once, newest first", () => {
    const events = detectEvents(
      inbox({
        involved: bucket([
          pr({
            lastComment: reply("alice", AFTER_REVIEW),
            viewerLastReviewAt: REVIEWED_AT,
          }),
        ]),
        reviewRequested: bucket([
          pr({ number: 9, updatedAt: "2026-07-01T06:00:00Z" }),
        ]),
      })
    );
    expect(events.map((e) => e.kind)).toEqual([
      "authorResponded",
      "reviewRequested",
    ]);
  });
});
