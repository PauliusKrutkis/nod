import { invoke } from "@tauri-apps/api/core";
import type {
  AccountInfo,
  AccountsInfo,
  AiAskContext,
  AiInfo,
  AiModel,
  ChatDiff,
  ChatPart,
  ChatRegion,
  CommentableSide,
  FileBlob,
  GitHubUser,
  GrepResult,
  InboxBucket,
  InboxData,
  LedgerSession,
  LedgerStatus,
  LicenseState,
  PullRequestDetail,
  ReleaseInfo,
  RepoHit,
  ReviewComment,
  ReviewEvent,
  SkillInfo,
  SnapshotStatus,
  UpdateInfo,
  ViewedMap,
} from "../types.ts";

/**
 * Thin, typed wrappers over the Rust Tauri commands. Argument keys are
 * camelCase; Tauri converts them to the snake_case Rust parameters.
 */

export const api = {
  activateLicense: () => invoke<LicenseState>("activate_license"),
  addAccount: (args: {
    provider: string;
    host?: string | null;
    token: string;
  }) => invoke<AccountInfo>("add_account", args),

  aiAsk: (args: { question: string; context: AiAskContext; askId: string }) =>
    invoke<string>("ai_ask", args),
  aiChat: (args: {
    chatId: string;
    turnId: string;
    message: string;
    parts: ChatPart[];
    regions: ChatRegion[];
    history: { role: string; content: string }[];
    context: AiAskContext;
    commentable: CommentableSide[];
    diffs: ChatDiff[];
    skills: string[];
    model: string | null;
    effort: string | null;
  }) => invoke<string>("ai_chat", args),
  aiChatCancel: (chatId: string) => invoke<void>("ai_chat_cancel", { chatId }),
  aiComplete: (args: {
    prefix: string;
    context: { filePath?: string; code?: string };
  }) => invoke<string>("ai_complete", args),
  aiListModels: () => invoke<AiModel[]>("ai_list_models"),

  listChatSkills: (owner: string, repo: string, headSha: string) =>
    invoke<SkillInfo[]>("list_chat_skills", { headSha, owner, repo }),

  checkForUpdate: () => invoke<UpdateInfo | null>("check_for_update"),
  clearAiConfig: () => invoke<void>("clear_ai_config"),
  clearToken: () => invoke<void>("clear_token"),
  getAiConfig: () => invoke<AiInfo>("get_ai_config"),
  createIssueComment: (args: {
    owner: string;
    repo: string;
    number: number;
    body: string;
  }) => invoke<void>("create_issue_comment", args),

  createReviewComment: (args: {
    owner: string;
    repo: string;
    number: number;
    body: string;
    commitId: string;
    path: string;
    line: number;
    side: string;
    startLine?: number;
  }) => invoke<ReviewComment>("create_review_comment", args),
  deleteIssueComment: (args: {
    owner: string;
    repo: string;
    number: number;
    commentId: number;
  }) => invoke<void>("delete_issue_comment", args),
  deleteReviewComment: (args: {
    owner: string;
    repo: string;
    number: number;
    commentId: number;
  }) => invoke<void>("delete_review_comment", args),
  getCachedInbox: () => invoke<InboxData | null>("get_cached_inbox"),
  getCachedPullRequestDetail: (owner: string, repo: string, number: number) =>
    invoke<PullRequestDetail | null>("get_cached_pull_request_detail", {
      number,
      owner,
      repo,
    }),
  getAppVersion: () => invoke<string>("get_app_version"),
  getCachedSubscribed: () =>
    invoke<InboxBucket | null>("get_cached_subscribed"),
  getCurrentUser: () => invoke<GitHubUser>("get_current_user"),
  getLicenseState: () => invoke<LicenseState>("get_license_state"),

  ensureRepoSnapshot: (owner: string, repo: string, sha: string) =>
    invoke<SnapshotStatus>("ensure_repo_snapshot", { owner, repo, sha }),

  snapshotStatus: (owner: string, repo: string, sha: string) =>
    invoke<SnapshotStatus>("snapshot_status", { owner, repo, sha }),

  getFileBlob: (owner: string, repo: string, path: string, ref: string) =>
    invoke<FileBlob>("get_file_blob", { owner, path, ref, repo }),

  getPullRequestDetail: (owner: string, repo: string, number: number) =>
    invoke<PullRequestDetail>("get_pull_request_detail", {
      number,
      owner,
      repo,
    }),

  getUploadBlob: (
    owner: string,
    repo: string,
    secret: string,
    filename: string
  ) => invoke<FileBlob>("get_upload_blob", { filename, owner, repo, secret }),

  listReleases: () => invoke<ReleaseInfo[] | null>("list_releases"),

  getViewedMap: () => invoke<unknown>("get_viewed_map"),
  getWatchedRepos: () => invoke<string[]>("get_watched_repos"),
  hasToken: () => invoke<boolean>("has_token"),
  installUpdate: () => invoke<void>("install_update"),
  isGitlabOAuthConfigured: () => invoke<boolean>("is_gitlab_oauth_configured"),
  isOAuthConfigured: () => invoke<boolean>("is_oauth_configured"),

  ledgerApprove: (repoPath: string, topic: string) =>
    invoke<void>("ledger_approve", { repoPath, topic }),
  ledgerReview: (repoPath: string, target: string) =>
    invoke<void>("ledger_review", { repoPath, target }),
  ledgerSession: (repoPath: string, targets: string[]) =>
    invoke<LedgerSession>("ledger_session", { repoPath, targets }),
  ledgerStatus: (repoPath: string) =>
    invoke<LedgerStatus>("ledger_status", { repoPath }),

  listAccounts: () => invoke<AccountsInfo>("list_accounts"),

  listInbox: () => invoke<InboxData>("list_inbox"),
  listSubscribed: () => invoke<InboxBucket>("list_subscribed"),
  loginWithGithub: () => invoke<GitHubUser>("login_with_github"),
  loginWithGitlab: (args?: {
    host?: string | null;
    clientId?: string | null;
  }) =>
    invoke<GitHubUser>("login_with_gitlab", {
      clientId: args?.clientId ?? null,
      host: args?.host ?? null,
    }),
  probeGitlab: (host: string) => invoke<string>("probe_gitlab", { host }),
  removeAccount: (id: string) => invoke<AccountsInfo>("remove_account", { id }),
  replyToReviewComment: (args: {
    owner: string;
    repo: string;
    number: number;
    body: string;
    inReplyTo: number;
  }) => invoke<ReviewComment>("reply_to_review_comment", args),
  resolveThread: (args: {
    owner: string;
    repo: string;
    number: number;
    threadId: string;
    resolved: boolean;
  }) => invoke<void>("resolve_thread", args),

  searchRepoContent: (
    owner: string,
    repo: string,
    sha: string,
    pattern: string
  ) => invoke<GrepResult>("search_repo_content", { owner, pattern, repo, sha }),

  searchRepos: (query: string) => invoke<RepoHit[]>("search_repos", { query }),
  setActiveAccount: (id: string) => invoke<void>("set_active_account", { id }),
  setAiConfig: (args: {
    baseUrl: string;
    apiKey: string;
    model: string | null;
  }) => invoke<AiInfo>("set_ai_config", args),
  setToken: (token: string) => invoke<GitHubUser>("set_token", { token }),
  setViewedMap: (map: ViewedMap) => invoke<void>("set_viewed_map", { map }),
  setWatchedRepos: (repos: string[]) =>
    invoke<void>("set_watched_repos", { repos }),
  submitReview: (args: {
    owner: string;
    repo: string;
    number: number;
    event: ReviewEvent;
    body: string;
    commitId: string;
    comments: {
      path: string;
      line: number;
      side: string;
      body: string;
      startLine?: number;
    }[];
  }) => invoke<void>("submit_review", args),
  updateIssueComment: (args: {
    owner: string;
    repo: string;
    number: number;
    commentId: number;
    body: string;
  }) => invoke<void>("update_issue_comment", args),
  updateReviewComment: (args: {
    owner: string;
    repo: string;
    number: number;
    commentId: number;
    body: string;
  }) => invoke<void>("update_review_comment", args),
};
