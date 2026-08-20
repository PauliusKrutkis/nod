/**
 * The offline bar's domain: the queue summarised by verb ("2 comments · 1
 * reply · review staged") and per-item labels and text. The review submission
 * is singled out because it never replays on its own; the summary word
 * "staged" carries that.
 *
 * QueuedWrite and ReplayedItem are the package's own mirror of the Rust
 * queue's serialised shapes, not imports from the app — the desktop's types
 * satisfy them structurally, the same bridge review-toast uses for its
 * request. `event` is a plain string here because the bar never reads the
 * verdict, only the fact that a review is staged.
 */

export type QueueVerb =
  | {
      kind: "comment";
      body: string;
      commitId: string;
      path: string;
      line: number;
      side: string;
      startLine?: number | null;
    }
  | { kind: "reply"; body: string; inReplyTo: number }
  | { kind: "resolve"; threadId: string; resolved: boolean }
  | { kind: "issueComment"; body: string }
  | {
      kind: "submitReview";
      event: string;
      body: string;
      commitId: string;
      comments: {
        path: string;
        line: number;
        side: string;
        body: string;
        startLine?: number | null;
      }[];
    };

export interface QueuedWrite {
  createdAt: number;
  failure: string | null;
  id: string;
  number: number;
  owner: string;
  repo: string;
  state: "queued" | "failed";
  verb: QueueVerb;
}

export interface ReplayedItem {
  item: QueuedWrite;
  outcome: "landed" | "nothingToDo" | "failed";
  reason: string | null;
}

const VERB_NOUNS: Record<QueueVerb["kind"], [string, string]> = {
  comment: ["comment", "comments"],
  issueComment: ["PR comment", "PR comments"],
  reply: ["reply", "replies"],
  resolve: ["resolve", "resolves"],
  submitReview: ["review", "reviews"],
};

export function queueSummary(queue: readonly QueuedWrite[]): string {
  const counts = new Map<QueueVerb["kind"], number>();
  for (const item of queue) {
    counts.set(item.verb.kind, (counts.get(item.verb.kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const kind of Object.keys(VERB_NOUNS) as QueueVerb["kind"][]) {
    const n = counts.get(kind) ?? 0;
    if (n === 0) {
      continue;
    }
    if (kind === "submitReview") {
      parts.push("review staged");
      continue;
    }
    const [one, many] = VERB_NOUNS[kind];
    parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return parts.join(" · ");
}

export function itemLabel(item: QueuedWrite): string {
  const at = `${item.owner}/${item.repo}#${item.number}`;
  switch (item.verb.kind) {
    case "comment":
      return `comment on ${item.verb.path}:${item.verb.line}`;
    case "reply":
      return `reply on ${at}`;
    case "resolve":
      return item.verb.resolved
        ? `resolve a thread on ${at}`
        : `reopen a thread on ${at}`;
    case "issueComment":
      return `PR comment on ${at}`;
    case "submitReview":
      return `review of ${at}`;
    default:
      return at;
  }
}

export function itemText(item: QueuedWrite): string | null {
  switch (item.verb.kind) {
    case "comment":
    case "reply":
    case "issueComment":
      return item.verb.body;
    case "submitReview":
      return item.verb.body || null;
    default:
      return null;
  }
}

export function canPlaceAgain(
  item: QueuedWrite
): item is QueuedWrite & { verb: Extract<QueueVerb, { kind: "comment" }> } {
  return item.verb.kind === "comment";
}
