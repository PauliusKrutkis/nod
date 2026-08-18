import type { QueuedWrite, QueueVerb, ReviewComment } from "../types.ts";
import { api } from "./api.ts";
import { queryClient } from "./query-client.ts";

/**
 * Offline-aware variants of the five queueable writes. When the app already
 * knows it is offline the write queues immediately, so acting offline never
 * waits out a request timeout. Otherwise the real command runs first; when it
 * fails and the Rust side says the failure was connectivity (the failed
 * request itself flipped the flag), the write is queued instead of surfacing
 * as an error, and the caller learns which of the two happened from the
 * discriminated result. Any failure while the host is reachable is rethrown
 * untouched, so real rejections keep today's rollback path. The connectivity
 * query is invalidated after queueing so the offline bar picks the item up
 * without waiting for its poll.
 */

export type WriteAttempt<T> =
  | { queued: false; value: T }
  | { queued: true; item: QueuedWrite };

export const connectivityKey = ["connectivity"] as const;

async function enqueue<T>(
  target: { owner: string; repo: string; number: number },
  verb: QueueVerb
): Promise<WriteAttempt<T>> {
  const item = await api.queueWrite({ ...target, verb });
  queryClient.invalidateQueries({ queryKey: connectivityKey });
  return { item, queued: true };
}

async function attemptOrQueue<T>(
  attempt: () => Promise<T>,
  target: { owner: string; repo: string; number: number },
  verb: QueueVerb
): Promise<WriteAttempt<T>> {
  const known = await api.connectivityStatus().catch(() => null);
  if (known && !known.online) {
    return enqueue(target, verb);
  }
  try {
    return { queued: false, value: await attempt() };
  } catch (e) {
    const status = await api.connectivityStatus().catch(() => null);
    if (status && !status.online) {
      return enqueue(target, verb);
    }
    throw e;
  }
}

export const offlineWrites = {
  createIssueComment(args: {
    owner: string;
    repo: string;
    number: number;
    body: string;
  }): Promise<WriteAttempt<void>> {
    return attemptOrQueue(() => api.createIssueComment(args), args, {
      body: args.body,
      kind: "issueComment",
    });
  },

  createReviewComment(args: {
    owner: string;
    repo: string;
    number: number;
    body: string;
    commitId: string;
    path: string;
    line: number;
    side: string;
    startLine?: number;
  }): Promise<WriteAttempt<ReviewComment>> {
    return attemptOrQueue(() => api.createReviewComment(args), args, {
      body: args.body,
      commitId: args.commitId,
      kind: "comment",
      line: args.line,
      path: args.path,
      side: args.side,
      startLine: args.startLine ?? null,
    });
  },

  replyToReviewComment(args: {
    owner: string;
    repo: string;
    number: number;
    body: string;
    inReplyTo: number;
  }): Promise<WriteAttempt<ReviewComment>> {
    return attemptOrQueue(() => api.replyToReviewComment(args), args, {
      body: args.body,
      inReplyTo: args.inReplyTo,
      kind: "reply",
    });
  },

  resolveThread(args: {
    owner: string;
    repo: string;
    number: number;
    threadId: string;
    resolved: boolean;
  }): Promise<WriteAttempt<void>> {
    return attemptOrQueue(() => api.resolveThread(args), args, {
      kind: "resolve",
      resolved: args.resolved,
      threadId: args.threadId,
    });
  },

  submitReview(args: {
    owner: string;
    repo: string;
    number: number;
    event: string;
    body: string;
    commitId: string;
    comments: {
      path: string;
      line: number;
      side: string;
      body: string;
      startLine?: number;
    }[];
  }): Promise<WriteAttempt<void>> {
    return attemptOrQueue(
      () =>
        api.submitReview({
          ...args,
          event: args.event as "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
        }),
      args,
      {
        body: args.body,
        comments: args.comments.map((c) => ({
          ...c,
          startLine: c.startLine ?? null,
        })),
        commitId: args.commitId,
        event: args.event,
        kind: "submitReview",
      }
    );
  },
};
