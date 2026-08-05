/**
 * The mocked Tauri bridge, split so two callers can share it verbatim:
 * setupApp (e2e/bridge.ts) serializes `installBridge` into a Playwright init
 * script, and the browser demo bundle (demo/main.tsx) calls it directly
 * before importing the app. @tauri-apps/api routes every call through
 * `window.__TAURI_INTERNALS__.invoke`, so installing the mock before the app
 * module loads makes the real frontend run against fixtures — no Rust, no
 * network. `installBridge` must stay fully self-contained (no references to
 * module scope): Playwright serializes its SOURCE, so a closed-over import
 * would be undefined at page time.
 */

import type { BucketFixture, InboxFixture } from "./fixtures.ts";
import { ACCOUNT, DETAIL, FULL_FILES, INBOX } from "./fixtures.ts";

export interface AppOptions {
  detail?: unknown;
  activateLicense?: "hang" | "error" | "licensed";
  appVersion?: string;
  aiInfo?: {
    configured: boolean;
    baseUrl: string | null;
    model: string | null;
  };
  aiAnswer?: string | "error";
  aiModels?: { id: string; contextLength: number | null }[];
  detailByCall?: unknown[];
  detailByLoad?: unknown[];
  detailByNumber?: Record<number, unknown>;
  fileBlobs?: Record<string, string>;
  fileBlobDelayMs?: number;
  hangIssueComment?: boolean;
  hangReviewComment?: boolean;
  hasToken?: boolean;
  licenseState?:
    | { status: "licensed"; updatesUntil: string }
    | { status: "trial"; daysLeft: number }
    | { status: "trialExpired" }
    | "error";
  releases?:
    | { tag: string; publishedAt: string | null; notes: string | null }[]
    | null;
  inbox?: InboxFixture;
  inboxByCall?: unknown[];
  repoHits?: { fullName: string; description: string }[];
  subscribed?: BucketFixture;
  subscribedDelayMs?: number;
  update?: {
    currentVersion: string;
    eligible: boolean;
    notes: string | null;
    version: string;
  } | null;
  updateAfterActivation?: {
    currentVersion: string;
    eligible: boolean;
    notes: string | null;
    version: string;
  } | null;
  watchedRepos?: string[];
}

function aiDefaults(opts: AppOptions) {
  return {
    aiAnswer:
      opts.aiAnswer ?? "It renames the retry knob — see `src/retry.ts:2`.",
    aiInfo: opts.aiInfo ?? { baseUrl: null, configured: false, model: null },
    aiModels: opts.aiModels ?? [
      { contextLength: 128_000, id: "gpt-4o" },
      { contextLength: 200_000, id: "claude-sonnet" },
    ],
  };
}

function detailDefaults(opts: AppOptions) {
  return {
    detail: (opts.detail ?? DETAIL) as typeof DETAIL,
    detailByCall: opts.detailByCall ?? null,
    detailByLoad: opts.detailByLoad ?? null,
    detailByNumber: opts.detailByNumber ?? null,
  };
}

export function buildBridgeConfig(opts: AppOptions = {}) {
  return {
    ...aiDefaults(opts),
    ...detailDefaults(opts),
    account: ACCOUNT,
    activateLicense: opts.activateLicense ?? "licensed",
    appVersion: opts.appVersion ?? "1.0.0",
    fileBlobs: opts.fileBlobs ?? FULL_FILES,
    fileBlobDelayMs: opts.fileBlobDelayMs ?? 0,
    hangIssueComment: opts.hangIssueComment ?? false,
    hangReviewComment: opts.hangReviewComment ?? false,
    hasToken: opts.hasToken ?? true,
    licenseState: opts.licenseState ?? {
      status: "licensed",
      updatesUntil: "2099-01-01",
    },
    releases: opts.releases ?? [],
    inbox: opts.inbox ?? INBOX,
    inboxByCall: opts.inboxByCall ?? null,
    repoHits: opts.repoHits ?? [],
    subscribed: opts.subscribed ?? { count: 0, prs: [] },
    subscribedDelayMs: opts.subscribedDelayMs ?? 0,
    update: opts.update ?? null,
    updateAfterActivation: opts.updateAfterActivation ?? null,
    watchedRepos: opts.watchedRepos ?? [],
  };
}

export type BridgeConfig = ReturnType<typeof buildBridgeConfig>;

export function installBridge(cfg: BridgeConfig) {
  const load = Number(localStorage.getItem("e2e:load") ?? "0");
  localStorage.setItem("e2e:load", String(load + 1));
  const byLoad = cfg.detailByLoad;
  const detail = byLoad
    ? byLoad[Math.min(load, byLoad.length - 1)]
    : cfg.detail;

  let detailCalls = 0;
  let inboxCalls = 0;
  let activated = false;
  const counts: Record<string, number> = {};
  const countCall = (name: string) => {
    counts[name] = (counts[name] ?? 0) + 1;
    (window as unknown as { __calls: Record<string, number> }).__calls = counts;
  };
  const seq = (arr: unknown[] | null, n: number, fallback: unknown) =>
    arr ? arr[Math.min(n, arr.length - 1)] : fallback;

  let aiInfo = cfg.aiInfo;

  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    ai_ask: (args) => {
      countCall("ai_ask");
      localStorage.setItem("e2e:aiAsk", JSON.stringify(args));
      if (cfg.aiAnswer === "error") {
        throw new Error("AI provider error (402): out of credits");
      }
      return cfg.aiAnswer;
    },
    ai_list_models: () => {
      countCall("ai_list_models");
      return cfg.aiModels;
    },
    clear_ai_config: () => {
      aiInfo = { baseUrl: null, configured: false, model: null };
      return null;
    },
    get_ai_config: () => aiInfo,
    set_ai_config: (args) => {
      countCall("set_ai_config");
      aiInfo = {
        baseUrl: args.baseUrl as string,
        configured: true,
        model: (args.model as string | null) ?? null,
      };
      localStorage.setItem("e2e:aiConfig", JSON.stringify(args));
      return aiInfo;
    },
    activate_license: () => {
      countCall("activate_license");
      if (cfg.activateLicense === "hang") {
        return new Promise(() => {
          /* intentionally pending */
        });
      }
      if (cfg.activateLicense === "error") {
        throw new Error("Purchasing isn't configured in this build.");
      }
      activated = true;
      return { status: "licensed", updatesUntil: "2027-08-02" };
    },
    check_for_update: () =>
      activated ? (cfg.updateAfterActivation ?? cfg.update) : cfg.update,
    create_issue_comment: () =>
      cfg.hangIssueComment
        ? new Promise(() => {
            /* intentionally pending */
          })
        : null,
    create_review_comment: (args) => {
      countCall("create_review_comment");
      if (cfg.hangReviewComment) {
        return new Promise(() => {
          /* intentionally pending */
        });
      }
      return {
        body: args.body,
        createdAt: new Date().toISOString(),
        diffHunk: "",
        id: 900,
        inReplyToId: null,
        line: args.line,
        originalLine: null,
        path: args.path,
        resolved: false,
        side: args.side,
        threadId: null,
        user: "me",
        userAvatarUrl: "",
      };
    },
    delete_issue_comment: (args) => {
      cfg.detail.issueComments = (
        cfg.detail.issueComments as Array<{ id: number }>
      ).filter(
        (c) => c.id !== args.commentId
      ) as typeof cfg.detail.issueComments;
      localStorage.setItem("e2e:lastConvoDelete", JSON.stringify(args));
      return null;
    },
    delete_review_comment: (args) => {
      cfg.detail.comments = (
        cfg.detail.comments as Array<{ id: number }>
      ).filter((c) => c.id !== args.commentId) as typeof cfg.detail.comments;
      localStorage.setItem("e2e:lastCommentDelete", JSON.stringify(args));
      return null;
    },
    ensure_repo_snapshot: (args) => {
      const seen = JSON.parse(
        localStorage.getItem("e2e:snapshotEnsures") ?? "[]"
      ) as unknown[];
      seen.push(args);
      localStorage.setItem("e2e:snapshotEnsures", JSON.stringify(seen));
      return { detail: "", state: "skipped" };
    },
    get_app_version: () => cfg.appVersion,
    get_cached_inbox: () => null,
    get_cached_pull_request_detail: () => null,
    get_cached_subscribed: () => null,
    get_file_blob: (args) => {
      const text = cfg.fileBlobs[args.path as string];
      if (text === undefined) {
        throw new Error(`no blob fixture for ${String(args.path)}`);
      }
      const blob = { base64: btoa(text), size: text.length };
      if (cfg.fileBlobDelayMs > 0) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(blob), cfg.fileBlobDelayMs)
        );
      }
      return blob;
    },
    get_license_state: () => {
      if (cfg.licenseState === "error") {
        throw new Error("license backend unavailable");
      }
      return cfg.licenseState;
    },
    get_pull_request_detail: (args) => {
      const byNumber = cfg.detailByNumber as Record<string, unknown> | null;
      const forNumber = byNumber?.[String(args.number)];
      if (forNumber) {
        return forNumber;
      }
      const result = seq(cfg.detailByCall, detailCalls, detail);
      detailCalls += 1;
      return result;
    },
    get_viewed_map: () =>
      JSON.parse(localStorage.getItem("e2e:viewed") ?? "{}"),
    get_watched_repos: () => cfg.watchedRepos,
    has_token: () => cfg.hasToken,
    is_gitlab_oauth_configured: () => false,
    is_oauth_configured: () => false,
    list_accounts: () =>
      cfg.hasToken
        ? { accounts: [cfg.account], activeId: cfg.account.id }
        : { accounts: [], activeId: null },
    list_inbox: () => {
      const result = seq(cfg.inboxByCall, inboxCalls, cfg.inbox);
      inboxCalls += 1;
      return result;
    },
    list_releases: () => cfg.releases,
    list_subscribed: () =>
      cfg.subscribedDelayMs > 0
        ? new Promise((resolve) =>
            setTimeout(() => resolve(cfg.subscribed), cfg.subscribedDelayMs)
          )
        : cfg.subscribed,
    "plugin:opener|open": () => null,
    "plugin:opener|open_url": () => null,
    resolve_thread: (args) => {
      for (const c of cfg.detail.comments as Array<{
        threadId: string | null;
        resolved: boolean;
      }>) {
        if (c.threadId === args.threadId) {
          c.resolved = args.resolved as boolean;
        }
      }
      return null;
    },
    search_repos: () =>
      new Promise((resolve) => setTimeout(() => resolve(cfg.repoHits), 200)),
    set_viewed_map: (args) => {
      localStorage.setItem("e2e:viewed", JSON.stringify(args.map));
      return null;
    },
    set_watched_repos: () => null,
    submit_review: (args) => {
      localStorage.setItem("e2e:lastReview", JSON.stringify(args));
      return null;
    },
    update_issue_comment: (args) => {
      for (const c of cfg.detail.issueComments as Array<{
        id: number;
        body: string;
      }>) {
        if (c.id === args.commentId) {
          c.body = args.body as string;
        }
      }
      localStorage.setItem("e2e:lastConvoEdit", JSON.stringify(args));
      return null;
    },
    update_review_comment: (args) => {
      for (const c of cfg.detail.comments as Array<{
        id: number;
        body: string;
      }>) {
        if (c.id === args.commentId) {
          c.body = args.body as string;
        }
      }
      localStorage.setItem("e2e:lastCommentEdit", JSON.stringify(args));
      return null;
    },
  };

  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        const handler = handlers[cmd];
        if (!handler) {
          console.warn(`[e2e bridge] unhandled command: ${cmd}`);
          return Promise.resolve(null);
        }
        return Promise.resolve(handler(args ?? {}));
      },
      metadata: {
        currentWebview: { label: "main" },
        currentWindow: { label: "main" },
      },
      transformCallback: (() => {
        let id = 0;
        return () => {
          id += 1;
          return id;
        };
      })(),
    },
  });
}
