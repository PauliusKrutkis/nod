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
 *
 * Tauri events work here too: transformCallback registers the real callback
 * functions, the event plugin's listen/unlisten commands track which
 * callback ids follow which event name, and `window.__emitEvent(event,
 * payload)` fires an event into the app exactly the way Rust's `app.emit`
 * would — which is what lets a mocked command (ai_chat's scripted replay) or
 * a spec drive streaming UI.
 */

import type { BucketFixture, InboxFixture } from "./fixtures.ts";
import {
  ACCOUNT,
  DETAIL,
  EMPTY_LEDGER,
  FULL_FILES,
  INBOX,
} from "./fixtures.ts";

export interface AppOptions {
  detail?: unknown;
  activateLicense?: "hang" | "error" | "licensed";
  appVersion?: string;
  aiCompletion?: string;
  aiInfo?: {
    configured: boolean;
    baseUrl: string | null;
    model: string | null;
  };
  aiAnswer?: string | "error";
  aiChatAnswer?: string | "error" | "hang";
  aiChatScript?: {
    delta?: string;
    reasoning?: string;
    tool?: { tool: string; detail: string };
    proposal?: Record<string, unknown>;
  }[];
  aiModels?: { id: string; contextLength: number | null }[];
  aiModelsError?: string;
  chatSkills?: { name: string; description: string; source: string }[];
  snapshotState?: "ready" | "downloading" | "failed" | "skipped";
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
  ledger?: unknown;
  ledgerAfterApprove?: unknown;
  ledgerAfterReview?: unknown;
  ledgerSession?: unknown;
  repoHits?: { fullName: string; description: string }[];
  subscribed?: BucketFixture;
  subscribedDelayMs?: number;
  update?: UpdateFixture | null;
  updateAfterActivation?: UpdateFixture | null;
  watchedRepos?: string[];
}

interface UpdateFixture {
  currentVersion: string;
  eligible: boolean;
  notes: string | null;
  selfInstallable?: boolean;
  version: string;
}

function updateDefaults(update: UpdateFixture | null | undefined) {
  return update
    ? { ...update, selfInstallable: update.selfInstallable ?? true }
    : null;
}

function aiDefaults(opts: AppOptions) {
  return {
    aiAnswer:
      opts.aiAnswer ?? "It renames the retry knob — see `src/retry.ts:2`.",
    aiChatAnswer:
      opts.aiChatAnswer ?? "The retry knob is safe — see `src/retry.ts:2`.",
    aiChatScript: opts.aiChatScript ?? [],
    aiCompletion: opts.aiCompletion ?? "",
    chatSkills: opts.chatSkills ?? [],
    snapshotState: opts.snapshotState ?? "ready",
    aiInfo: opts.aiInfo ?? { baseUrl: null, configured: false, model: null },
    aiModelsError: opts.aiModelsError ?? null,
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
    ledger: opts.ledger ?? EMPTY_LEDGER,
    ledgerAfterApprove: opts.ledgerAfterApprove ?? null,
    ledgerAfterReview: opts.ledgerAfterReview ?? null,
    ledgerSession: opts.ledgerSession ?? null,
    repoHits: opts.repoHits ?? [],
    subscribed: opts.subscribed ?? { count: 0, prs: [] },
    subscribedDelayMs: opts.subscribedDelayMs ?? 0,
    update: updateDefaults(opts.update),
    updateAfterActivation: updateDefaults(opts.updateAfterActivation),
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
  let snapshotState = cfg.snapshotState;
  (
    window as unknown as { __setSnapshotState: (s: string) => void }
  ).__setSnapshotState = (next: string) => {
    snapshotState = next as typeof snapshotState;
  };
  let ledgerReviews = 0;
  let ledgerApprovals = 0;

  let callbackId = 0;
  const eventCallbacks = new Map<number, (event: unknown) => void>();
  const eventListeners = new Map<string, Set<number>>();
  const emitEvent = (event: string, payload: unknown) => {
    for (const id of eventListeners.get(event) ?? []) {
      eventCallbacks.get(id)?.({ event, id, payload });
    }
  };
  (
    window as unknown as {
      __emitEvent: (event: string, payload: unknown) => void;
    }
  ).__emitEvent = emitEvent;

  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    "plugin:event|listen": (args) => {
      const event = args.event as string;
      const set = eventListeners.get(event) ?? new Set<number>();
      set.add(args.handler as number);
      eventListeners.set(event, set);
      return args.handler;
    },
    "plugin:event|unlisten": (args) => {
      eventListeners.get(args.event as string)?.delete(args.eventId as number);
      return null;
    },
    ai_chat: (args) => {
      countCall("ai_chat");
      localStorage.setItem("e2e:aiChat", JSON.stringify(args));
      if (cfg.aiChatAnswer === "error") {
        throw new Error("AI provider error (402): out of credits");
      }
      const ids = { chatId: args.chatId, turnId: args.turnId };
      return new Promise((resolve) => {
        let step = 0;
        const play = () => {
          const entry = cfg.aiChatScript[step];
          if (!entry) {
            if (cfg.aiChatAnswer !== "hang") {
              resolve(cfg.aiChatAnswer);
            }
            return;
          }
          step += 1;
          if (entry.delta) {
            emitEvent("ai-chat-delta", { ...ids, text: entry.delta });
          }
          if (entry.reasoning) {
            emitEvent("ai-chat-reasoning", { ...ids, text: entry.reasoning });
          }
          if (entry.tool) {
            emitEvent("ai-chat-tool", { ...ids, ...entry.tool });
          }
          if (entry.proposal) {
            emitEvent("ai-chat-proposal", { ...ids, proposal: entry.proposal });
          }
          setTimeout(play, 10);
        };
        setTimeout(play, 0);
      });
    },
    ai_chat_cancel: (args) => {
      countCall("ai_chat_cancel");
      localStorage.setItem("e2e:aiChatCancel", JSON.stringify(args));
      return null;
    },
    list_chat_skills: () => {
      countCall("list_chat_skills");
      return cfg.chatSkills;
    },
    create_skill: (args) => {
      countCall("create_skill");
      localStorage.setItem("e2e:createdSkill", String(args.name));
      return "/tmp/nod/skills/new";
    },
    open_skills_dir: () => {
      countCall("open_skills_dir");
      localStorage.setItem("e2e:openedSkillsDir", "1");
      return "/tmp/nod/skills";
    },
    "plugin:opener|open_path": (args) => {
      localStorage.setItem("e2e:revealedPath", String(args.path));
      return null;
    },
    ai_ask: (args) => {
      countCall("ai_ask");
      localStorage.setItem("e2e:aiAsk", JSON.stringify(args));
      if (cfg.aiAnswer === "error") {
        throw new Error("AI provider error (402): out of credits");
      }
      return cfg.aiAnswer;
    },
    ai_complete: (args) => {
      countCall("ai_complete");
      localStorage.setItem("e2e:aiComplete", JSON.stringify(args));
      if (cfg.aiCompletion === "error") {
        throw new Error("AI provider error (402): out of credits");
      }
      return cfg.aiCompletion ?? "";
    },
    ai_list_models: () => {
      countCall("ai_list_models");
      if (cfg.aiModelsError) {
        throw new Error(cfg.aiModelsError);
      }
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
    snapshot_status: () => ({ detail: "", state: snapshotState }),
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
    ledger_approve: (args) => {
      countCall("ledger_approve");
      localStorage.setItem("e2e:ledgerApprove", JSON.stringify(args));
      ledgerApprovals += 1;
      return null;
    },
    ledger_review: (args) => {
      countCall("ledger_review");
      localStorage.setItem("e2e:ledgerReview", JSON.stringify(args));
      ledgerReviews += 1;
      return null;
    },
    ledger_session: (args) => {
      countCall("ledger_session");
      localStorage.setItem("e2e:ledgerSession", JSON.stringify(args));
      const payload = cfg.ledgerSession as {
        sessions: { path: string }[];
        tip: string;
      } | null;
      if (!payload) {
        return { sessions: [], tip: "" };
      }
      // Filter by target paths so the post-sign refetch naturally shrinks.
      // (No module-scope helpers here — this function is serialized into the
      // init script, so the path is sliced off at the last colon inline.)
      const targets = (args as { targets?: string[] }).targets ?? [];
      const wanted = new Set(
        targets.map((t) => {
          const colon = t.lastIndexOf(":");
          return colon === -1 ? t : t.slice(0, colon);
        })
      );
      return {
        sessions: payload.sessions.filter((s) => wanted.has(s.path)),
        tip: payload.tip,
      };
    },
    ledger_status: () => {
      countCall("ledger_status");
      if (ledgerApprovals > 0 && cfg.ledgerAfterApprove) {
        return cfg.ledgerAfterApprove;
      }
      if (ledgerReviews > 0 && cfg.ledgerAfterReview) {
        return cfg.ledgerAfterReview;
      }
      return cfg.ledger;
    },
    is_gitlab_oauth_configured: () => false,
    is_oauth_configured: () => false,
    list_accounts: () =>
      cfg.hasToken
        ? { accounts: [cfg.account], activeId: cfg.account.id }
        : { accounts: [], activeId: null },
    list_inbox: () => {
      countCall("list_inbox");
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
    "plugin:opener|open_url": (args) => {
      localStorage.setItem("e2e:lastOpenUrl", JSON.stringify(args));
      return null;
    },
    // No native zoom without Tauri. Reject the way a refusing platform
    // webview does, so lib/zoom.ts engages its CSS-zoom fallback — resolving
    // null here made the app believe zoom had worked, and the browser demo
    // could not zoom at all.
    "plugin:webview|set_webview_zoom": () =>
      Promise.reject(new Error("no native zoom outside Tauri")),
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
    set_watched_repos: () => {
      countCall("set_watched_repos");
      return null;
    },
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

  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    configurable: true,
    value: {
      unregisterListener: (event: string, eventId: number) => {
        eventListeners.get(event)?.delete(eventId);
        eventCallbacks.delete(eventId);
      },
    },
  });

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
      transformCallback: (callback?: (event: unknown) => void) => {
        callbackId += 1;
        if (callback) {
          eventCallbacks.set(callbackId, callback);
        }
        return callbackId;
      },
    },
  });
}
