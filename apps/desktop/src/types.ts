/**
 * Shared data model. These mirror exactly the camelCase structs returned by
 * the Rust backend (see src-tauri/src/github.rs).
 *
 * PullRequest list items omit heavy fields (headSha, files); detail fetches
 * fill baseSha/headRef/baseRef and lastComment (inbox pane teaser only).
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

export interface CiStatus {
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
  id: string;
  line: number;
  path: string;
  side: string;
  startLine?: number;
}

export type ViewedFileMap = Record<string, string>;

export type ViewedMap = Record<string, ViewedFileMap>;

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

export interface LedgerStatus {
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
