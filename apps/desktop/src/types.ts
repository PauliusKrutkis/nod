/**
 * Shared data model. These mirror exactly the camelCase structs returned by
 * the Rust backend (see src-tauri/src/github.rs).
 *
 * PullRequest list items omit heavy fields (headSha, files); detail fetches
 * fill baseSha and lastComment (inbox pane teaser only). headRef/baseRef ride
 * the list query too, which is what lets stacked-PR detection join over the
 * inbox without a second request.
 * ReviewComment.threadId/resolved come from the provider's resolvable-thread
 * handle — null hides the resolve affordance. PendingComment.line is the
 * range end for multi-line drafts; startLine is the start when present.
 * ViewedFileMap maps filename → content fingerprint ("?" = legacy mark).
 * PullRequest.viewerDidAuthor and viewerLastReviewAt are relative to the
 * signed-in account; an absent viewerLastReviewAt means you have not reviewed
 * the PR, and providers that cannot answer (GitLab) leave both at their
 * defaults, which reads as "not yours, not reviewed".
 * LicenseState.updatesUntil bounds update eligibility, not app function —
 * a licensed app never stops working, it stops receiving newer releases.
 * UpdateInfo.selfInstallable is false on a Linux .deb/.rpm install, where the
 * app cannot put a release in place and the new package has to be downloaded
 * and installed by hand.
 * CiStatus.checks is optional because details cached by an older version
 * predate the per-check breakdown; an absent list reads the same as an empty
 * one, which is a host that reports only a rollup.
 */

export interface GitHubUser {
  avatarUrl: string;
  login: string;
  name: string;
}

export interface PullRequest {
  additions: number;
  author: string;
  authorAvatarUrl: string;
  baseRef: string;
  baseSha: string;
  body: string;
  changedFiles: number;
  commentsCount: number;
  createdAt: string;
  deletions: number;
  draft: boolean;
  headRef: string;
  headSha: string;
  id: number;
  lastComment?: LastComment;
  merged: boolean;
  name: string;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
  viewerDidAuthor: boolean;
  viewerLastReviewAt?: string;
}

interface LastComment {
  author: string;
  authorAvatarUrl: string;
  body: string;
  createdAt: string;
}

type FileStatus =
  | "added"
  | "modified"
  | "removed"
  | "renamed"
  | "copied"
  | "changed"
  | string;

export interface ChangedFile {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  patch?: string | null;
  previousFilename?: string | null;
  sha: string;
  status: FileStatus;
}

export interface ReviewComment {
  body: string;
  createdAt: string;
  diffHunk: string;
  id: number;
  inReplyToId: number | null;
  line: number | null;
  originalLine: number | null;
  path: string;
  resolved: boolean;
  side: string;
  threadId: string | null;
  user: string;
  userAvatarUrl: string;
}

export interface IssueComment {
  body: string;
  createdAt: string;
  id: number;
  user: string;
  userAvatarUrl: string;
}

export interface ReviewSummary {
  body: string;
  id: number;
  state: string;
  submittedAt: string;
  user: string;
  userAvatarUrl: string;
}

interface CiCheck {
  name: string;
  state: "success" | "failure" | "pending";
  url: string;
}

export interface CiStatus {
  checks?: CiCheck[];
  failed: number;
  state: "success" | "failure" | "pending" | "none";
  total: number;
  url: string;
}

export interface PullRequestDetail {
  ciStatus: CiStatus;
  comments: ReviewComment[];
  fetchedAt: number;
  files: ChangedFile[];
  issueComments: IssueComment[];
  pr: PullRequest;
  reviews: ReviewSummary[];
}

export interface InboxBucket {
  count: number;
  prs: PullRequest[];
}

export interface InboxData {
  assigned: InboxBucket;
  created: InboxBucket;
  involved: InboxBucket;
  reviewRequested: InboxBucket;
}

export type InboxTabKey = keyof InboxData | "subscribed";

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export interface PendingComment {
  body: string;
  /** Staged by the chat rather than typed. It is a pending comment either
   *  way — it submits with the rest and can be edited or discarded — the flag
   *  only lets the card say where it came from. */
  fromAi?: boolean;
  id: string;
  line: number;
  path: string;
  side: string;
  startLine?: number;
  /** The chat turn that staged it, so the transcript can list a turn's
   *  comments inside that turn. */
  turnId?: string;
}

export type ViewedFileMap = Record<string, string>;

export type ViewedMap = Record<string, ViewedFileMap>;

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
      event: ReviewEvent;
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

/** A write made while offline, held in the Rust queue. `state` is "queued"
 *  until a replay either lands it (it leaves the queue), finds nothing to do
 *  (it leaves too), or fails, which keeps the item with `failure` set so its
 *  text is never lost. */
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

export interface ConnectivityInfo {
  online: boolean;
  queue: QueuedWrite[];
}

export interface ReplayedItem {
  item: QueuedWrite;
  outcome: "landed" | "nothingToDo" | "failed";
  reason: string | null;
}

export interface ReplayReport {
  attempted: ReplayedItem[];
  wentOffline: boolean;
}

export interface RepoHit {
  description: string;
  fullName: string;
}

export interface FileBlob {
  base64: string;
  size: number;
}

export interface SnapshotStatus {
  state: "idle" | "downloading" | "ready" | "skipped" | "failed";
  detail: string;
}

export interface GrepHit {
  line: number;
  path: string;
  text: string;
}

export interface GrepResult {
  hits: GrepHit[];
  truncated: boolean;
}

export interface AccountInfo {
  avatarUrl: string;
  host: string;
  id: string;
  login: string;
  provider: string;
}

export interface AccountsInfo {
  accounts: AccountInfo[];
  activeId: string | null;
}

export interface AiInfo {
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
}

export interface AiModel {
  id: string;
  contextLength: number | null;
}

export type ChatPart =
  | { kind: "text"; text: string }
  | { kind: "code"; region: ChatRegion };

export interface ChatRegion {
  code: string;
  filePath: string;
  lineRange: string;
  side: string;
}

export type ChatTurnRecord =
  | {
      kind: "user";
      at?: string;
      id: string;
      /** Prose and code in the order they were written. */
      parts?: ChatPart[];
      regions: ChatRegion[];
      /** v2 history kept one skill per turn. */
      skill?: string;
      skills?: string[];
      text: string;
    }
  | {
      kind: "assistant";
      activity?: string[];
      at?: string;
      error: string | null;
      id: string;
      reasoning?: string;
      text: string;
      workedMs?: number;
    };

export interface SkillInfo {
  name: string;
  description: string;
  source: "repo" | "personal" | "built-in";
}

export interface ChatDiff {
  path: string;
  patch: string;
}

export interface ChatThread {
  id: string;
  /** The model's name for the thread, written once off the first exchange.
   *  Absent until it arrives, and absent forever if the call failed — the
   *  reader falls back to the message the thread opened with. */
  title?: string;
  turns: ChatTurnRecord[];
}

export interface CommentableSide {
  path: string;
  side: string;
  ranges: [number, number][];
}

export interface AiAskContext {
  prTitle: string;
  prBody: string;
  filePath: string | null;
  lineRange: string | null;
  code: string | null;
  diffSummary: string | null;
  owner: string;
  repo: string;
  headSha: string;
}

export interface UpdateInfo {
  currentVersion: string;
  eligible: boolean;
  notes: string | null;
  selfInstallable: boolean;
  version: string;
}

export type LicenseState =
  | { status: "licensed"; updatesUntil: string }
  | { status: "trial"; daysLeft: number }
  | { status: "trialExpired" };

/** One published version release on the app's GitHub repo. */
export interface ReleaseInfo {
  notes: string | null;
  publishedAt: string | null;
  tag: string;
}

/**
 * Review-ledger shapes, produced by the ledger CLI's --json output and passed
 * through Rust untouched. `pr` is null for direct pushes, where provenance
 * falls back to the bare commit. Line spans are 1-based and inclusive;
 * `newLines` counts only unreviewed post-epoch lines inside the span.
 */
interface LedgerProvenance {
  pr: number | null;
  sha: string;
  subject: string;
}

interface LedgerActor {
  id: string;
  kind: "agent" | "human";
}

/** The last attestation a region decayed from; `sha` is the diff baseline. */
interface LedgerBaseline {
  actor: LedgerActor;
  atTime: string;
  /** The signed anchor's path at `sha`; differs from the item's across a rename. */
  refPath: string;
  sha: string;
  /** What was attested: a signed region, or the whole topic at a sha. */
  source: "anchor" | "approval";
}

export interface LedgerQueueItem {
  baseline: LedgerBaseline | null;
  endLine: number;
  newLines: number;
  path: string;
  provenance: LedgerProvenance[];
  startLine: number;
  /** Engine-derived feature label: conventional scope, #pr, or short sha. */
  topic: string;
}

interface LedgerTopicApproval {
  actor: LedgerActor;
  atTime: string;
  sha: string;
}

interface LedgerTopicStatus {
  /** Distinct human actors with a resolvable approval. */
  approvals: number;
  /** Null until the threshold is met. */
  approvedAt: LedgerTopicApproval | null;
  id: string;
  requiredApprovals: number;
  reviewedLines: number;
  totalLines: number;
}

/**
 * A comment-thread fact positioned on tip: `alive` at the discussed content's
 * current home, `stale` on its nearest surviving lines, `gone` (null span)
 * when the content was rewritten away. Replies carry the root's id in
 * `parent` and inherit its position.
 */
export interface LedgerComment {
  actor: { id: string; kind: "agent" | "human" };
  anchorStatus: "alive" | "gone" | "stale";
  atSha: string;
  atTime: string;
  body: string;
  endLine: number | null;
  id: string;
  parent: string | null;
  path: string;
  resolved: boolean;
  startLine: number | null;
}

export interface LedgerStatus {
  comments: LedgerComment[];
  coverage: number;
  epoch: string;
  queue: LedgerQueueItem[];
  reviewedLines: number;
  tip: string;
  topics: LedgerTopicStatus[];
  totalLines: number;
}

/** 1-based inclusive span on tip; identical to the queue item's span. */
export interface LedgerSessionRegion {
  endLine: number;
  startLine: number;
}

/**
 * One queued file as a unified patch (hunk body only, parsePatch-ready).
 * `baseline` non-null means the patch is the real net diff from that sha to
 * tip; null means it is synthesized — unreviewed lines as adds with context.
 */
export interface LedgerSessionFile {
  baseline: LedgerBaseline | null;
  patch: string;
  path: string;
  regions: LedgerSessionRegion[];
}

export interface LedgerSession {
  /** Every thread positioned in one of the session's files. */
  comments: LedgerComment[];
  sessions: LedgerSessionFile[];
  tip: string;
}

export interface PRRef {
  name: string;
  number: number;
  owner: string;
}

/** Stable identity for a PR, used as the key for viewed/last-seen state. */
export function prKey(pr: PRRef): string {
  return `${pr.owner}/${pr.name}#${pr.number}`;
}

/** Inverse of `prKey` — parses `owner/name#number`. */
export function parsePrKey(key: string): PRRef {
  const hash = key.lastIndexOf("#");
  const slash = key.indexOf("/");
  return {
    name: key.slice(slash + 1, hash),
    number: Number(key.slice(hash + 1)),
    owner: key.slice(0, slash),
  };
}
