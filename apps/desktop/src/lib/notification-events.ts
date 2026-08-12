/**
 * What the app is willing to interrupt you for, derived from one inbox poll.
 *
 * `detectEvents` is a pure function of the payload — no React, no storage, no
 * clock — so every rule below is decidable in a unit test. It reports what is
 * currently true, not what changed; suppressing repeats is the event log's
 * job (`store/notification-store.ts`), which dedupes on `id`. That split is
 * deliberate: a diff against the previous poll cannot survive a restart, so it
 * would either re-announce everything on launch or need a second ledger to
 * stop itself.
 *
 * Because the log is the memory, an `id` must name the happening rather than
 * the PR. Two rules follow from that:
 *
 * - A reply keys on the comment's `createdAt`, so a second reply announces
 *   again while re-polling the same reply stays quiet.
 * - A review request keys on `viewerLastReviewAt`, which is empty until you
 *   review and then fixed. So one pending request announces once no matter how
 *   many polls or restarts it survives, and a request that arrives after you
 *   already reviewed announces as the new thing it is. Keying on `updatedAt`
 *   instead would fire on every label and CI run; keying on the PR alone would
 *   swallow the re-request.
 *
 * `viewerDidAuthor` and `viewerLastReviewAt` come from the host per signed-in
 * account, which is what lets `authorResponded` mean "the author answered the
 * review you left". Inbox bucket membership cannot carry that: `involves:@me`
 * is equally true for a PR you were merely mentioned on, so a bucket-only rule
 * announces replies on PRs you never read. Requiring `viewerLastReviewAt` and
 * demanding the comment be newer than it is the whole difference.
 *
 * Not detectable from this payload, and so deliberately absent: a push with no
 * comment (nothing identifies it), a reply inside a review thread (`lastComment`
 * is conversation comments only), and anything on GitLab, which leaves the
 * viewer fields at their defaults and therefore never matches.
 */
import { type InboxData, type PullRequest, prKey } from "../types.ts";

export type NotificationKind = "reviewRequested" | "authorResponded";

export interface NotificationEvent {
  actor: string;
  actorAvatarUrl: string;
  createdAt: string;
  id: string;
  kind: NotificationKind;
  name: string;
  number: number;
  owner: string;
  prKey: string;
  title: string;
}

function eventFrom(
  pr: PullRequest,
  kind: NotificationKind,
  actor: string,
  actorAvatarUrl: string,
  createdAt: string,
  stamp: string
): NotificationEvent {
  const key = prKey(pr);
  return {
    actor,
    actorAvatarUrl,
    createdAt,
    id: `${kind}:${key}@${stamp}`,
    kind,
    name: pr.name,
    number: pr.number,
    owner: pr.owner,
    prKey: key,
    title: pr.title,
  };
}

function reviewRequested(inbox: InboxData): NotificationEvent[] {
  return inbox.reviewRequested.prs
    .filter((pr) => !pr.viewerDidAuthor)
    .map((pr) =>
      eventFrom(
        pr,
        "reviewRequested",
        pr.author,
        pr.authorAvatarUrl,
        pr.updatedAt,
        pr.viewerLastReviewAt ?? ""
      )
    );
}

/**
 * True when the PR's own author posted the newest conversation comment after
 * the viewer's latest review — the reply to that review. Anything the viewer
 * wrote fails on `viewerDidAuthor` or on the author check, so this can never
 * be triggered by your own activity.
 */
function isAuthorReplyToViewer(pr: PullRequest): boolean {
  const reviewedAt = pr.viewerLastReviewAt;
  const comment = pr.lastComment;
  if (pr.viewerDidAuthor || !(reviewedAt && comment)) {
    return false;
  }
  return (
    comment.author === pr.author &&
    new Date(comment.createdAt).getTime() > new Date(reviewedAt).getTime()
  );
}

function authorResponded(inbox: InboxData): NotificationEvent[] {
  const buckets = [
    inbox.reviewRequested,
    inbox.assigned,
    inbox.involved,
    inbox.created,
  ];
  const out: NotificationEvent[] = [];
  for (const bucket of buckets) {
    for (const pr of bucket.prs) {
      if (!isAuthorReplyToViewer(pr)) {
        continue;
      }
      const comment = pr.lastComment;
      if (!comment) {
        continue;
      }
      out.push(
        eventFrom(
          pr,
          "authorResponded",
          comment.author,
          comment.authorAvatarUrl,
          comment.createdAt,
          comment.createdAt
        )
      );
    }
  }
  return out;
}

const DETECTORS = [reviewRequested, authorResponded];

/**
 * Every announceable event true of this poll, newest first, one per `id`. A PR
 * sitting in several buckets yields one event, not one per bucket.
 */
export function detectEvents(inbox: InboxData): NotificationEvent[] {
  const byId = new Map<string, NotificationEvent>();
  for (const detector of DETECTORS) {
    for (const event of detector(inbox)) {
      if (!byId.has(event.id)) {
        byId.set(event.id, event);
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Headline and one-line body for an event, used for the OS banner and the
 * notification list. It mirrors the wording `ReviewToast` renders in @nod/ui;
 * that component owns its own copy because it is catalogued with fixtures, so
 * the two are kept in step by hand rather than shared.
 */
export function notificationCopy(event: NotificationEvent): {
  body: string;
  title: string;
} {
  const verb =
    event.kind === "authorResponded" ? "replied on" : "asked you to review";
  return {
    body: `${event.actor} ${verb} #${event.number} · ${event.title}`,
    title:
      event.kind === "authorResponded"
        ? "Author replied"
        : "New review request",
  };
}
