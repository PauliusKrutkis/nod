import { create } from "zustand";
import { api } from "../lib/api.ts";
import { usePerfStore } from "../lib/perf.ts";
import { migrateStorageKeys } from "../lib/storage-migrations.ts";
import {
  autoUnviewedKey,
  reconcileViewedEntry,
  UNKNOWN_FINGERPRINT,
  unviewedReconcileToast,
} from "../lib/viewed-fingerprint.ts";
import type {
  AccountInfo,
  AccountsInfo,
  ChangedFile,
  ChatRegion,
  ChatThread,
  ChatTurnRecord,
  InboxTabKey,
  PendingComment,
  ViewedMap,
} from "../types.ts";

migrateStorageKeys();

export type Route =
  | { name: "loading" }
  | { name: "token" }
  | { name: "inbox" }
  | { name: "ledger" }
  | { name: "review"; owner: string; repo: string; number: number };

/**
 * We remember the inbox/ledger/review screen you were last on (never the
 * token/loading screens) so the next launch reopens it instead of always
 * landing on the inbox.
 */
const LAST_ROUTE_KEY = "nod:lastRoute:v1";
type ResumableRoute = Extract<
  Route,
  { name: "inbox" } | { name: "ledger" } | { name: "review" }
>;

function saveLastRoute(route: Route) {
  if (
    route.name !== "inbox" &&
    route.name !== "ledger" &&
    route.name !== "review"
  ) {
    return;
  }
  try {
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(route));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/** The screen to resume on launch, if any. Validated to a known shape. */
export function loadLastRoute(): ResumableRoute | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) ?? "null");
    if (v?.name === "inbox") {
      return { name: "inbox" };
    }
    if (v?.name === "ledger") {
      return { name: "ledger" };
    }
    if (
      v?.name === "review" &&
      typeof v.owner === "string" &&
      typeof v.repo === "string" &&
      typeof v.number === "number"
    ) {
      return { name: "review", number: v.number, owner: v.owner, repo: v.repo };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Which inbox tab you were last on, so a restart doesn't reset it. */
const LAST_TAB_KEY = "nod:lastInboxTab:v1";
const TAB_KEYS: readonly InboxTabKey[] = [
  "reviewRequested",
  "assigned",
  "created",
  "involved",
  "subscribed",
];

function saveLastTab(tab: InboxTabKey) {
  try {
    localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function loadLastTab(): InboxTabKey | null {
  try {
    const v = localStorage.getItem(LAST_TAB_KEY);
    return (TAB_KEYS as readonly string[]).includes(v ?? "")
      ? (v as InboxTabKey)
      : null;
  } catch {
    return null;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingViewed: ViewedMap | null = null;
function schedulePersistViewed(map: ViewedMap) {
  pendingViewed = map;
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(flushPersistViewed, 400);
}
function flushPersistViewed() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingViewed) {
    const map = pendingViewed;
    pendingViewed = null;
    api
      .setViewedMap(map)
      .catch((e) => console.error("persist viewed failed", e));
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPersistViewed);
}

const LAST_SEEN_KEY = "nod:lastSeen:v1";
function loadLastSeen(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function saveLastSeen(map: Record<string, string>) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/**
 * Archiving hides a PR from the inbox *until it updates again* — the Superhuman
 * "done" move. We store the updatedAt seen at archive time; any newer activity
 * resurfaces the PR on its own.
 */

const DISMISSED_KEY = "nod:dismissed:v1";
function loadDismissed(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function saveDismissed(map: Record<string, string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/**
 * Kept in the store (and localStorage) so leaving the review screen — or the
 * app — never loses a drafted comment.
 */

const PENDING_KEY = "nod:pendingComments:v1";
function loadPending(): Record<string, PendingComment[]> {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function savePending(map: Record<string, PendingComment[]>) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}
let pendingIdCounter = 0;

/**
 * Chat conversations persist per PR (docs/AI.md § Second surface) so the
 * background-agent workflow survives restarts — as a list of threads per PR
 * since v2, so one PR can hold several conversations. v1 (one turn list per
 * PR) migrates by wrapping the list as the single existing thread. Capped in
 * both directions so neither a long conversation nor a pile of threads can
 * crowd the store.
 */

const CHAT_KEY = "nod:chatHistory:v2";
const LEGACY_CHAT_KEY = "nod:chatHistory:v1";
const MAX_CHAT_TURNS = 200;
const MAX_CHAT_THREADS = 20;
function loadChats(): Record<string, ChatThread[]> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "null");
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CHAT_KEY) ?? "null");
    if (!(legacy && typeof legacy === "object") || Array.isArray(legacy)) {
      return {};
    }
    const migrated: Record<string, ChatThread[]> = {};
    for (const [key, turns] of Object.entries(legacy)) {
      if (Array.isArray(turns) && turns.length > 0) {
        migrated[key] = [{ id: "t1", turns }];
      }
    }
    localStorage.setItem(CHAT_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_CHAT_KEY);
    return migrated;
  } catch {
    return {};
  }
}
function saveChats(map: Record<string, ChatThread[]>) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

const TRACKERS_KEY = "nod:issueTrackers:v1";
function loadTrackers(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(TRACKERS_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function saveTrackers(map: Record<string, string>) {
  try {
    localStorage.setItem(TRACKERS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

interface AppState {
  accounts: AccountInfo[];
  activeAccountId: string | null;
  autoUnviewed: Record<string, string[]>;
  addPendingComment: (
    prKey: string,
    c: {
      path: string;
      line: number;
      side: string;
      body: string;
      fromAi?: boolean;
      startLine?: number;
      turnId?: string;
    }
  ) => void;
  addChatChip: (chip: ChatRegion) => void;
  aiSetupOpen: boolean;
  appendChatTurn: (
    prKey: string,
    threadId: string,
    turn: ChatTurnRecord
  ) => void;
  chatChips: ChatRegion[];
  chatHistory: Record<string, ChatThread[]>;
  nameChatThread: (prKey: string, threadId: string, title: string) => void;
  clearChat: (prKey: string) => void;
  removeChatThread: (prKey: string, threadId: string) => void;
  clearChatChips: () => void;
  removeChatChip: (index: number) => void;
  updatePendingComment: (prKey: string, id: string, body: string) => void;
  clearDismissed: (prKey: string) => void;
  clearPendingComments: (prKey: string) => void;
  closeAiSetup: () => void;
  closePalette: () => void;
  dismiss: (prKey: string, updatedAt: string) => void;

  dismissed: Record<string, string>;
  goInbox: () => void;
  goLedger: () => void;
  helpOpen: boolean;
  inboxPaneVisible: boolean;
  inboxSelectedKey: string | null;
  inboxTab: InboxTabKey;
  isDismissed: (prKey: string, updatedAt: string) => boolean;
  /** A ledger session is mounted — the help sheet keys off its scope. */
  ledgerSessionOpen: boolean;

  issueTrackers: Record<string, string>;
  isUnread: (prKey: string, updatedAt: string) => boolean;
  isViewed: (prKey: string, file: string) => boolean;
  lastDismissedKey: string | null;
  lastSeen: Record<string, string>;

  markSeen: (prKey: string, updatedAt: string) => void;

  openAiSetup: () => void;
  openPalette: () => void;
  openReview: (owner: string, repo: string, number: number) => void;
  paletteOpen: boolean;

  pendingComments: Record<string, PendingComment[]>;
  reconcileViewed: (
    prKey: string,
    files: readonly ChangedFile[],
    headSha: string
  ) => string[];
  removePendingComment: (prKey: string, id: string) => void;
  route: Route;
  searchOpen: boolean;
  setAccounts: (info: AccountsInfo) => void;
  setFlash: (message: string | null) => void;
  setHelpOpen: (open: boolean) => void;
  setInboxPaneVisible: (visible: boolean) => void;
  setLedgerSessionOpen: (open: boolean) => void;
  setInboxSelectedKey: (key: string | null) => void;
  setInboxTab: (tab: InboxTabKey) => void;
  setIssueTracker: (accountId: string, url: string | null) => void;

  setRoute: (route: Route) => void;
  setSearchOpen: (open: boolean) => void;
  setToast: (toast: AppToast | null) => void;

  setViewed: (map: ViewedMap) => void;
  switchAccount: (id: string) => void;

  toast: AppToast | null;
  toggleHelp: () => void;
  togglePalette: () => void;
  toggleSearch: () => void;
  toggleViewed: (prKey: string, file: string, fingerprint?: string) => void;
  undoDismiss: () => void;
  viewed: ViewedMap;
  viewedCount: (prKey: string) => number;
}

interface AppToast {
  action?: () => void;
  actionLabel?: string;
  message: string;
  note?: string;
  title: string;
}

export const useAppStore = create<AppState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  autoUnviewed: {},
  updatePendingComment: (prKey, id, body) => {
    const list = (get().pendingComments[prKey] ?? []).map((c) =>
      c.id === id ? { ...c, body } : c
    );
    const map = { ...get().pendingComments, [prKey]: list };
    set({ pendingComments: map });
    savePending(map);
  },
  addPendingComment: (prKey, c) => {
    const id = `p${Date.now()}-${pendingIdCounter}`;
    pendingIdCounter += 1;
    const map = {
      ...get().pendingComments,
      [prKey]: [...(get().pendingComments[prKey] ?? []), { id, ...c }],
    };
    set({ pendingComments: map });
    savePending(map);
  },
  clearDismissed: (prKey) => {
    const map = { ...get().dismissed };
    delete map[prKey];
    set({ dismissed: map, lastDismissedKey: null });
    saveDismissed(map);
  },
  clearPendingComments: (prKey) => {
    const map = { ...get().pendingComments };
    delete map[prKey];
    set({ pendingComments: map });
    savePending(map);
  },
  addChatChip: (chip) => {
    const chips = get().chatChips;
    const key = (c: ChatRegion) =>
      c.filePath ? `${c.filePath}:${c.lineRange}:${c.side}` : `code:${c.code}`;
    if (chips.some((c) => key(c) === key(chip))) {
      return;
    }
    set({ chatChips: [...chips, chip] });
  },
  aiSetupOpen: false,
  appendChatTurn: (prKey, threadId, turn) => {
    const threads = get().chatHistory[prKey] ?? [];
    const existing = threads.find((t) => t.id === threadId);
    const next = existing
      ? threads.map((t) =>
          t.id === threadId
            ? { ...t, turns: [...t.turns, turn].slice(-MAX_CHAT_TURNS) }
            : t
        )
      : [...threads, { id: threadId, turns: [turn] }].slice(-MAX_CHAT_THREADS);
    const map = { ...get().chatHistory, [prKey]: next };
    set({ chatHistory: map });
    saveChats(map);
  },
  nameChatThread: (prKey, threadId, title) => {
    const threads = get().chatHistory[prKey] ?? [];
    if (!threads.some((t) => t.id === threadId)) {
      return;
    }
    const map = {
      ...get().chatHistory,
      [prKey]: threads.map((t) => (t.id === threadId ? { ...t, title } : t)),
    };
    set({ chatHistory: map });
    saveChats(map);
  },
  chatChips: [],
  chatHistory: loadChats(),
  clearChat: (prKey) => {
    const map = { ...get().chatHistory };
    delete map[prKey];
    set({ chatHistory: map });
    saveChats(map);
  },
  clearChatChips: () => set({ chatChips: [] }),
  removeChatThread: (prKey, threadId) => {
    const threads = (get().chatHistory[prKey] ?? []).filter(
      (t) => t.id !== threadId
    );
    const map = { ...get().chatHistory };
    if (threads.length === 0) {
      delete map[prKey];
    } else {
      map[prKey] = threads;
    }
    set({ chatHistory: map });
    saveChats(map);
  },
  removeChatChip: (index) =>
    set({ chatChips: get().chatChips.filter((_, i) => i !== index) }),
  closeAiSetup: () => set({ aiSetupOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  dismiss: (prKey, updatedAt) => {
    const map = { ...get().dismissed, [prKey]: updatedAt };
    set({ dismissed: map, lastDismissedKey: prKey });
    saveDismissed(map);
  },

  dismissed: loadDismissed(),
  goInbox: () => {
    flushPersistViewed();
    saveLastRoute({ name: "inbox" });
    set({ route: { name: "inbox" } });
  },
  goLedger: () => {
    flushPersistViewed();
    saveLastRoute({ name: "ledger" });
    set({ paletteOpen: false, route: { name: "ledger" } });
  },
  helpOpen: false,
  inboxPaneVisible: false,
  inboxSelectedKey: null,
  inboxTab: loadLastTab() ?? "reviewRequested",
  isDismissed: (prKey, updatedAt) => {
    const at = get().dismissed[prKey];
    if (!at) {
      return false;
    }
    return new Date(updatedAt).getTime() <= new Date(at).getTime();
  },

  issueTrackers: loadTrackers(),
  isUnread: (prKey, updatedAt) => {
    const seen = get().lastSeen[prKey];
    if (!seen) {
      return true;
    }
    return new Date(updatedAt).getTime() > new Date(seen).getTime();
  },
  isViewed: (prKey, file) => file in (get().viewed[prKey] ?? {}),
  lastDismissedKey: null,
  lastSeen: loadLastSeen(),
  ledgerSessionOpen: false,

  markSeen: (prKey, updatedAt) => {
    const map = { ...get().lastSeen, [prKey]: updatedAt };
    set({ lastSeen: map });
    saveLastSeen(map);
  },

  openAiSetup: () => set({ aiSetupOpen: true, paletteOpen: false }),
  openPalette: () => set({ paletteOpen: true }),
  openReview: (owner, repo, number) => {
    flushPersistViewed();
    usePerfStore.getState().markOpenStart();
    const route: Route = { name: "review", number, owner, repo };
    saveLastRoute(route);
    set({ paletteOpen: false, route, searchOpen: false });
  },
  paletteOpen: false,

  pendingComments: loadPending(),
  reconcileViewed: (prKey, files, headSha) => {
    const res = reconcileViewedEntry(get().viewed[prKey], files, headSha);
    if (!res.changed) {
      return [];
    }
    const map = { ...get().viewed, [prKey]: res.entry };
    if (res.unviewed.length > 0) {
      const key = autoUnviewedKey(prKey, headSha);
      const prev = get().autoUnviewed[key] ?? [];
      const merged = Array.from(new Set([...prev, ...res.unviewed]));
      set({
        autoUnviewed: { ...get().autoUnviewed, [key]: merged },
        toast: unviewedReconcileToast(res.unviewed),
        viewed: map,
      });
    } else {
      set({ viewed: map });
    }
    schedulePersistViewed(map);
    return res.unviewed;
  },
  removePendingComment: (prKey, id) => {
    const map = {
      ...get().pendingComments,
      [prKey]: (get().pendingComments[prKey] ?? []).filter((p) => p.id !== id),
    };
    set({ pendingComments: map });
    savePending(map);
  },
  route: { name: "loading" },
  searchOpen: false,
  setAccounts: (info) =>
    set({ accounts: info.accounts, activeAccountId: info.activeId }),
  setFlash: (message) =>
    set({
      toast: message ? { message, title: "Something didn't stick" } : null,
    }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setInboxPaneVisible: (inboxPaneVisible) => set({ inboxPaneVisible }),
  setLedgerSessionOpen: (ledgerSessionOpen) => set({ ledgerSessionOpen }),
  setInboxSelectedKey: (key) => set({ inboxSelectedKey: key }),
  setInboxTab: (tab) => {
    saveLastTab(tab);
    set({ inboxTab: tab });
  },
  setIssueTracker: (accountId, url) => {
    const map = { ...get().issueTrackers };
    const cleaned = url?.trim();
    if (cleaned) {
      map[accountId] = cleaned;
    } else {
      delete map[accountId];
    }
    set({ issueTrackers: map });
    saveTrackers(map);
  },

  setRoute: (route) => {
    saveLastRoute(route);
    set({ route });
  },
  setSearchOpen: (open) => set({ searchOpen: open }),
  setToast: (toast) => set({ toast }),

  setViewed: (map) => set({ viewed: map }),
  switchAccount: (id) => {
    if (get().activeAccountId === id) {
      return;
    }
    saveLastRoute({ name: "inbox" });
    api
      .setActiveAccount(id)
      .then(() => window.location.reload())
      .catch((e) => console.error("switch account failed", e));
  },

  toast: null,
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  toggleViewed: (prKey, file, fingerprint = UNKNOWN_FINGERPRINT) => {
    const next = { ...(get().viewed[prKey] ?? {}) };
    if (file in next) {
      delete next[file];
    } else {
      next[file] = fingerprint;
    }
    const map = { ...get().viewed, [prKey]: next };
    set({ viewed: map });
    schedulePersistViewed(map);
  },
  undoDismiss: () => {
    const key = get().lastDismissedKey;
    if (!key) {
      return;
    }
    const map = { ...get().dismissed };
    delete map[key];
    set({ dismissed: map, lastDismissedKey: null });
    saveDismissed(map);
  },
  viewed: {},
  viewedCount: (prKey) => Object.keys(get().viewed[prKey] ?? {}).length,
}));
