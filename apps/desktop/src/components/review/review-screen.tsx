/**
 * `scrollToFile` (in `useReviewFileNavigation`) is the single entry point
 * every file jump routes through — `e`, `r`/`t`, Tab, the sidebar, and the
 * file search all call it. It also seeds the line cursor on the target
 * file's first nav row, because everything the cursor drives afterwards
 * (`f`/`g`, `j`/`k`, `c`, selection) steps from wherever the cursor is, and
 * leaving it on the file just left makes those keys act on the wrong file.
 * Files with no nav rows (image, binary, fully collapsed) keep the previous
 * cursor rather than clearing it.
 *
 * A freshly opened comment box (`c`, drag-select, or the `+` button) can
 * render partly or fully below the fold on a short viewport.
 * `reviewListOnOpenBox` flags the anchor it just opened in
 * `pendingBoxNudgeRef`, and a layout effect nudges it into view once the
 * model that contains it has rebuilt — same instant, no-animation easing
 * keyboard row navigation already uses via `nudgeItemIntoView`.
 *
 * READABLE_TEXT_SELECTOR is prose the user reads and copies but cannot edit
 * (every Markdown render shares `.md`, plus the comment header and the whole
 * collapsed-thread lead — matching containers, not prose leaves, so clicks on
 * their padding or icons bail too). Occurrence handling must leave its caret
 * alone: such text matches neither `.qf-row` nor `.qf-code`, so without the
 * bail-out a click inside it fell through to the branch that clears the DOM
 * selection whenever occurrence marks happen to be lit.
 *
 * `activeThreadRef` — the thread `r`/`x`/`z`/`shift+e` act on — is written by
 * both hover and the cursor, so mouse-leave cannot simply null it: the cursor
 * may be parked on a comment block, and `q` scrolls threads out from under a
 * stationary pointer, which fires leave events nobody asked for.
 * `reviewListOnThreadHover` therefore falls back to the cursor's own thread
 * (`armedThreadAt`) instead, and only a cursor that is not on a block disarms.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, GitBranch, PanelLeft } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCommentMutations } from "../../hooks/use-comments.ts";
import {
  useExpansionScrollRestore,
  useFileExpansion,
} from "../../hooks/use-file-expansion.ts";
import { useInboxDetailNudge } from "../../hooks/use-inbox-detail-nudge.ts";
import { useLatest } from "../../hooks/use-latest.ts";
import { useOccLinkAffordance } from "../../hooks/use-occ-link-affordance.ts";
import { useOccurrenceTracking } from "../../hooks/use-occurrence-tracking.ts";
import { usePullRequestDetail } from "../../hooks/use-pull-request-detail.ts";
import { useReviewFind } from "../../hooks/use-review-find.ts";
import { useReviewHeadShaSync } from "../../hooks/use-review-head-sha-sync.ts";
import { useReviewHotkeys } from "../../hooks/use-review-hotkeys.ts";
import {
  isRealPointer,
  markKeyboardNavigation,
  syncActiveIndexRef,
  useReviewListCallbacks,
} from "../../hooks/use-review-list-callbacks.ts";
import { useViewedFileReconcile } from "../../hooks/use-viewed-file-reconcile.ts";
import { copyTextToClipboard } from "../../lib/clipboard.ts";
import { cn } from "../../lib/cn.ts";
import {
  type CapturedSelection,
  type OccState,
  restoreCodeSelection,
} from "../../lib/code-dom.ts";
import type { FindMatch } from "../../lib/find-in-diff.ts";
import { warmHighlightCache } from "../../lib/highlight.ts";
import { isImageFile } from "../../lib/image-file.ts";
import {
  type OccurrenceMatch,
  occurrenceMatches,
} from "../../lib/occurrences.ts";
import { usePerfStore } from "../../lib/perf.ts";
import { isGitlabPrUrl } from "../../lib/provider.ts";
import { queryClient, queryKeys } from "../../lib/query-client.ts";
import {
  buildCursorMover,
  type CursorPos,
  commentAtCursorPos,
  extendExistingSelection,
  type LineSelection,
  nextUnviewedFileIndex,
  resolveLiveSelection,
  startSelectionFromCursor,
} from "../../lib/review-cursor.ts";
import {
  adjacentCommentItem,
  armedThreadAt,
  buildCommentsByFile,
  buildPendingByFile,
  buildReviewItems,
  clampFastStep,
  fileAnchorKey,
  navKey,
  type ReviewListModel,
} from "../../lib/review-items.ts";
import {
  getReviewMemory,
  updateReviewMemory,
} from "../../lib/review-memory.ts";
import {
  autoUnviewedKey,
  buildChangedSinceViewed,
  fingerprintFile,
  reconcileHighlightKey,
} from "../../lib/viewed-fingerprint.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  ChangedFile,
  CiStatus,
  InboxBucket,
  InboxData,
  PendingComment,
  PullRequest,
  ReviewComment,
  ReviewEvent,
} from "../../types.ts";
import { parsePrKey, prKey } from "../../types.ts";
import { Avatar } from "../ui/avatar.tsx";
import { Kbd } from "../ui/kbd.tsx";
import { TicketTitle } from "../ui/ticket-title.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { FileSidebar } from "./file-sidebar.tsx";
import { FindBar } from "./find-bar.tsx";
import { OverviewRuler } from "./overview-ruler.tsx";
import { PrSearch } from "./pr-search.tsx";
import {
  type MarkSpec,
  ReviewList,
  type ReviewListCallbacks,
  type ReviewListHandle,
} from "./review-list.tsx";
import { ReviewVerdicts } from "./review-verdicts.tsx";
import { RightPanel, type RightPanelHandle } from "./right-panel.tsx";
import { SubmitReviewModal } from "./submit-review-modal.tsx";

/**
 * Full-screen PR review: a virtualized diff list, keyboard cursor, multi-line
 * selection, find-in-diff, and inline comment threads.
 *
 * Interaction model:
 * - The line cursor (j/k, f/g, hover) is the source of truth for the active
 *   file — wheel scrolling alone does not move it.
 * - Collapsed hunks and open composers feed the flattened item model.
 * - Multi-line selection (shift+j/k, gutter drag) is independent of the
 *   cursor once created; plain cursor moves collapse it.
 * - Find-in-diff (mod+f) seeds from the viewport, not the top of the PR.
 * - Occurrences: a plain click marks every occurrence of the word under the
 *   pointer within that file and never moves the viewport — hover has already
 *   put the cursor on the row, so the click has nowhere to travel to. Walking
 *   the matches is a separate, deliberate gesture: n/p, or mod+click (the
 *   editor's go-to-next-reference). mod+click reads the file rather than the
 *   current highlight, so it works on any word on first contact — no need to
 *   click one first. A match already in frame is left where it is; one that
 *   isn't is brought in by the shared cursor nudge, which leaves
 *   CURSOR_CONTEXT_ROWS of slack (review-list.tsx) rather than landing the row
 *   flush against a fold. Holding the mod key underlines the word under the
 *   pointer (useOccLinkAffordance) so the gesture is discoverable rather than
 *   folklore; OCC_LINK is deliberately one token for both the body class that
 *   arms the pointer cursor and the highlight name quiet.css paints.
 * - A double-click keeps the browser's own word selection, painted in the
 *   accent by quiet.css. Two distinct colours for two distinct things: the grey
 *   marks say "here is that word again", the accent says "this text is
 *   selected, ready to copy".
 */
interface ReviewScreenProps {
  routeKey: string;
}

const FAST_CURSOR_STEP = 5;

const EMPTY_COMMENTS: ReviewComment[] = [];
const EMPTY_PENDING: PendingComment[] = [];
const EMPTY_OCC: OccurrenceMatch[] = [];
const EMPTY_FRACTIONS: number[] = [];
const EMPTY_COLLAPSED: ReadonlyMap<number, ReadonlySet<number>> = new Map();

const SIDEBAR_SKELETON_WIDTHS = [88, 72, 56, 40, 88, 72, 56, 40, 88] as const;
const MAIN_SKELETON_WIDTHS = Array.from(
  { length: 16 },
  (_, index) => ((index * 37) % 52) + 32
);

function applyLineSelection(args: {
  anchor: string;
  clearOccurrences: boolean;
  fileIndex: number;
  flashKey: string;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  setFlashKey: React.Dispatch<React.SetStateAction<string | null>>;
  setInputMode: React.Dispatch<React.SetStateAction<"keyboard" | "mouse">>;
  setOccSpec: React.Dispatch<React.SetStateAction<OccState | null>>;
}) {
  const { anchor, clearOccurrences, fileIndex, flashKey } = args;
  args.setActiveIndex((cur) => (cur === fileIndex ? cur : fileIndex));
  if (clearOccurrences) {
    args.setOccSpec((cur) => (cur === null ? cur : null));
  }
  args.setInputMode((mode) => (mode === "keyboard" ? mode : "keyboard"));
  args.setCursor((cur) =>
    cur?.fileIndex === fileIndex && cur.anchor === anchor && cur.kind === "row"
      ? cur
      : { anchor, fileIndex, kind: "row" }
  );
  args.setFlashKey((cur) => (cur === flashKey ? cur : flashKey));
}

function resolveMarks(
  findOpen: boolean,
  findQuery: string,
  findCase: boolean,
  occSpec: OccState | null
): MarkSpec | null {
  if (findOpen) {
    if (findQuery) {
      return { caseSensitive: findCase, kind: "find", query: findQuery };
    }
    return null;
  }
  if (occSpec) {
    return {
      fileIndex: occSpec.fileIndex,
      kind: "occurrence",
      query: occSpec.query,
      wholeWord: occSpec.wholeWord,
    };
  }
  return null;
}

function resolveRulerFractions(
  model: ReviewListModel,
  findOpen: boolean,
  findQuery: string,
  findMatches: FindMatch[],
  occSpec: OccState | null,
  occMatchList: OccurrenceMatch[]
): number[] {
  if (model.items.length === 0) {
    return EMPTY_FRACTIONS;
  }
  if (findOpen && findQuery) {
    return findMatches.map((m) => {
      const idx = model.anchorItem.get(fileAnchorKey(m.fileIndex, m.anchor));
      return idx === undefined ? -1 : idx / model.items.length;
    });
  }
  if (occSpec) {
    return occMatchList.map((m) => {
      const idx = model.anchorItem.get(
        fileAnchorKey(occSpec.fileIndex, m.anchor)
      );
      return idx === undefined ? -1 : idx / model.items.length;
    });
  }
  return EMPTY_FRACTIONS;
}

/** Below this viewport width the 300px file tree stops being a push column and
 *  becomes an overlay drawer, so the diff keeps its full width on small windows
 *  and under high webview zoom (which shrinks the effective CSS width). */
const SIDEBAR_COMPACT_QUERY = "(max-width: 1024px)";

function getSidebarCompactSnapshot(): boolean {
  return window.matchMedia(SIDEBAR_COMPACT_QUERY).matches;
}

function getSidebarCompactServerSnapshot(): boolean {
  return false;
}

function subscribeSidebarCompact(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(SIDEBAR_COMPACT_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/** Class for the small CI status dot on the info button, or null when a repo
 *  has no checks (state "none") — the dot should stay quiet then. */
function ciDotClass(ci: CiStatus | undefined): string | null {
  if (!ci || ci.state === "none") {
    return null;
  }
  return `qf-ci-dot-${ci.state}`;
}

function ciDotLabel(ci: CiStatus | undefined): string {
  switch (ci?.state) {
    case "success":
      return "checks passing";
    case "failure":
      return "checks failing";
    case "pending":
      return "checks running";
    default:
      return "checks";
  }
}

function resolvePrStateClass(pr: PullRequest): string {
  if (pr.draft) {
    return "qf-state-draft";
  }
  if (pr.merged) {
    return "qf-state-merged";
  }
  if (pr.state === "open") {
    return "qf-state-open";
  }
  return "qf-state-draft";
}

function resolvePrStateLabel(pr: PullRequest): string {
  if (pr.draft) {
    return "Draft";
  }
  if (pr.merged) {
    return "Merged";
  }
  if (pr.state === "open") {
    return "Open";
  }
  return pr.state;
}

const DRAWER_WIDE_KEY = "pr-flow:drawerWide";

// TODO: extract a useLocalStorage hook when a second persisted UI pref lands (separate PR).
function readDrawerWide(): boolean {
  try {
    return localStorage.getItem(DRAWER_WIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDrawerWide(wide: boolean): void {
  try {
    localStorage.setItem(DRAWER_WIDE_KEY, wide ? "1" : "0");
  } catch {
    // storage unavailable (private mode) — width just won't persist
  }
}

function useReviewResumeScroll(args: {
  initialMem: ReturnType<typeof getReviewMemory>;
  listRef: React.RefObject<ReviewListHandle | null>;
  modelRef: React.RefObject<ReviewListModel>;
  resumeCorrectedRef: React.RefObject<boolean>;
}): void {
  const { initialMem, listRef, modelRef, resumeCorrectedRef } = args;
  useEffect(() => {
    if (resumeCorrectedRef.current) {
      return;
    }
    if (modelRef.current.items.length === 0) {
      return;
    }
    resumeCorrectedRef.current = true;
    const t = initialMem?.topRow;
    if (!(t && initialMem?.listState)) {
      return;
    }
    const idx = modelRef.current.anchorItem.get(
      fileAnchorKey(t.fileIndex, t.anchor)
    );
    let tries = 0;
    let raf = 0;
    let settled = 0;
    const step = () => {
      const scroller = listRef.current?.scroller();
      if (!scroller) {
        return;
      }
      const row = scroller.querySelector<HTMLElement>(
        `[data-anchor="${t.anchor}"][data-file-index="${t.fileIndex}"]`
      );
      if (row) {
        const delta =
          row.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          t.top;
        if (Math.abs(delta) > 2) {
          scroller.scrollTop += delta;
          settled = 0;
        } else {
          settled += 1;
          if (settled >= 2) {
            return;
          }
        }
      } else if (idx !== undefined) {
        listRef.current?.scrollItemTo(idx, t.top);
      }
      tries += 1;
      if (tries < 12) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [initialMem, listRef, modelRef, resumeCorrectedRef]);
}

function ReviewScreenPending({
  error,
  goInbox,
  isError,
  number,
  owner,
  repo,
}: {
  error: unknown;
  goInbox: () => void;
  isError: boolean;
  number: number;
  owner: string;
  repo: string;
}) {
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-medium text-danger text-sm">
          Couldn't load this pull request
        </p>
        <p className="max-w-md break-words text-muted text-xs">
          {String(error)}
        </p>
        <button
          className="rounded-card border border-line px-3 py-1.5 text-fg text-sm hover:bg-elevated"
          onClick={goInbox}
          type="button"
        >
          Back to inbox
        </button>
        <p className="text-faint text-xs">Press Esc to go back</p>
      </div>
    );
  }

  const cached = findCachedInboxPr(owner, repo, number);
  return (
    <div className="dir-quiet relative flex h-full min-h-0 overflow-hidden">
      <aside className="w-[300px] shrink-0 border-line border-r">
        <div className="qf-sidebar flex h-full flex-col">
          <div className="qf-side-head flex items-center justify-between px-4 py-3">
            <span className="qf-side-title">Files</span>
          </div>
          <div className="px-3 py-1">
            {SIDEBAR_SKELETON_WIDTHS.map((width, index, widths) => {
              const n = widths
                .slice(0, index)
                .filter((w) => w === width).length;
              return (
                <div
                  className="qf-skel"
                  key={`${width}-${n}`}
                  style={{
                    height: 17,
                    margin: "10px 8px",
                    width: `${width}%`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </aside>
      <main className="qf-main flex min-w-0 flex-1 flex-col">
        <header className="qf-header shrink-0 px-6 py-3">
          {cached ? (
            <>
              <div className="flex items-center gap-2">
                <h1 className="qf-pr-title truncate" title={cached.title}>
                  {cached.title}
                </h1>
              </div>
              <div className="qf-pr-sub mt-1 flex items-center gap-2">
                <span className="qf-pr-num">#{cached.number}</span>
                <span className="qf-dot">·</span>
                <span>{cached.repo}</span>
                <span className="qf-dot">·</span>
                <Avatar
                  name={cached.author}
                  size={15}
                  url={cached.authorAvatarUrl}
                />
                <span className="qf-muted">{cached.author}</span>
              </div>
            </>
          ) : (
            <>
              <div className="qf-skel" style={{ height: 16, width: 340 }} />
              <div
                className="qf-skel"
                style={{ height: 11, marginTop: 9, width: 190 }}
              />
            </>
          )}
        </header>
        <div className="min-w-0 flex-1 overflow-hidden px-6 py-5">
          {MAIN_SKELETON_WIDTHS.map((width) => (
            <div
              className="qf-skel"
              key={width}
              style={{
                height: 12,
                margin: "11px 0",
                width: `${width}%`,
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function flashCommentThread(
  listRef: React.RefObject<ReviewListHandle | null>,
  threadFlashRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  rootId: number
): void {
  let tries = 0;
  const land = () => {
    const el = listRef.current
      ?.scroller()
      ?.querySelector<HTMLElement>(`[data-comment-root="${rootId}"]`);
    if (!el) {
      tries += 1;
      if (tries < 20) {
        requestAnimationFrame(land);
      }
      return;
    }
    el.classList.add("qf-row-flash");
    if (threadFlashRef.current) {
      clearTimeout(threadFlashRef.current);
    }
    threadFlashRef.current = setTimeout(
      () => el.classList.remove("qf-row-flash"),
      1600
    );
  };
  requestAnimationFrame(land);
}

function useReviewThreadActions(args: {
  activeIndexRef: React.RefObject<number>;
  activeThreadRef: React.RefObject<{ rootId: number; path: string } | null>;
  commentsRef: React.RefObject<ReviewComment[]>;
  cursorRef: React.RefObject<CursorPos | null>;
  editNonceRef: React.RefObject<number>;
  filesRef: React.RefObject<ChangedFile[]>;
  keyValue: string;
  listRef: React.RefObject<ReviewListHandle | null>;
  modelRef: React.RefObject<ReviewListModel>;
  nextFile: () => void;
  removePendingStore: (key: string, id: string) => void;
  replyNonceRef: React.RefObject<number>;
  requestResolveThread: ReturnType<
    typeof useCommentMutations
  >["requestResolveThread"];
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  setEditReq: React.Dispatch<
    React.SetStateAction<{
      rootId: number;
      path: string;
      nonce: number;
    } | null>
  >;
  setInputMode: React.Dispatch<React.SetStateAction<"keyboard" | "mouse">>;
  setReplyReq: React.Dispatch<
    React.SetStateAction<{
      rootId: number;
      path: string;
      nonce: number;
    } | null>
  >;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToggleReq: React.Dispatch<
    React.SetStateAction<{
      rootId: number;
      path: string;
      nonce: number;
    } | null>
  >;
  threadFlashRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  toggleNonceRef: React.RefObject<number>;
}) {
  const jumpToThread = (path: string, rootId: number) => {
    const m = args.modelRef.current;
    const fileIndex = args.filesRef.current.findIndex(
      (f) => f.filename === path
    );
    if (fileIndex < 0) {
      return;
    }
    args.setRightOpen(false);
    usePerfStore.getState().markFileStart();
    args.setActiveIndex(fileIndex);
    args.activeIndexRef.current = fileIndex;
    const itemIndex = m.commentItems.find((i) => {
      const it = m.items[i];
      return (
        it.kind === "comments" &&
        it.fileIndex === fileIndex &&
        it.threads.some((t) => t[0]?.id === rootId)
      );
    });
    if (itemIndex === undefined) {
      args.listRef.current?.scrollToFileStart(fileIndex);
      return;
    }
    args.listRef.current?.centerItem(itemIndex);
    flashCommentThread(args.listRef, args.threadFlashRef, rootId);
  };

  const goToComment = (delta: number) => {
    const m = args.modelRef.current;
    const cur = args.cursorRef.current;
    const curNav = cur
      ? m.navIndexOf.get(navKey(cur.fileIndex, cur.anchor, cur.kind))
      : undefined;
    const fromItem = curNav === undefined ? -1 : m.nav[curNav].itemIndex;
    const target = adjacentCommentItem(m, fromItem, delta);
    if (target === undefined) {
      return;
    }
    const item = m.items[target];
    if (item?.kind !== "comments") {
      return;
    }
    args.setInputMode("keyboard");
    args.setActiveIndex(item.fileIndex);
    args.activeIndexRef.current = item.fileIndex;
    args.setCursor({
      anchor: item.anchor,
      fileIndex: item.fileIndex,
      kind: "comments",
    });
    args.listRef.current?.centerItem(target);
    args.activeThreadRef.current = armedThreadAt(
      m,
      args.filesRef.current,
      target
    );
  };

  const discardPendingAtCursor = () => {
    const m = args.modelRef.current;
    const cur = args.cursorRef.current;
    if (!cur) {
      return;
    }
    const navIdx = m.navIndexOf.get(
      navKey(cur.fileIndex, cur.anchor, "comments")
    );
    if (navIdx === undefined) {
      return;
    }
    const item = m.items[m.nav[navIdx].itemIndex];
    if (item?.kind !== "comments") {
      return;
    }
    const newest = item.pending.at(-1);
    if (!newest) {
      return;
    }
    args.removePendingStore(args.keyValue, newest.id);
    const blockSurvives =
      item.pending.length > 1 || item.threads.length > 0 || item.boxOpen;
    if (cur.kind === "comments" && !blockSurvives) {
      args.setCursor({ ...cur, kind: "row" });
    }
  };

  const replyToActiveThreadOrNextFile = () => {
    const t = args.activeThreadRef.current;
    if (t && args.commentsRef.current.some((c) => c.id === t.rootId)) {
      args.replyNonceRef.current += 1;
      args.setReplyReq({ ...t, nonce: args.replyNonceRef.current });
      return;
    }
    args.nextFile();
  };

  const resolveActiveThread = () => {
    const t = args.activeThreadRef.current;
    if (!t) {
      return;
    }
    const root = args.commentsRef.current.find((c) => c.id === t.rootId);
    if (!root || root.threadId === null) {
      return;
    }
    args.requestResolveThread({
      resolved: !root.resolved,
      threadId: root.threadId,
    });
  };

  const editActiveThreadComment = () => {
    const t = args.activeThreadRef.current;
    if (!(t && args.commentsRef.current.some((c) => c.id === t.rootId))) {
      return;
    }
    args.editNonceRef.current += 1;
    args.setEditReq({ ...t, nonce: args.editNonceRef.current });
  };

  const toggleActiveThread = () => {
    const t = args.activeThreadRef.current;
    if (!t) {
      return;
    }
    args.toggleNonceRef.current += 1;
    args.setToggleReq({ ...t, nonce: args.toggleNonceRef.current });
  };

  return {
    discardPendingAtCursor,
    editActiveThreadComment,
    goToComment,
    jumpToThread,
    replyToActiveThreadOrNextFile,
    resolveActiveThread,
    toggleActiveThread,
  };
}

function advanceToNextReview(
  owner: string,
  repo: string,
  number: number,
  goInbox: () => void
): void {
  const inbox = queryClient.getQueryData<InboxData>(queryKeys.inbox);
  const list = inbox?.reviewRequested.prs ?? [];
  const isCurrent = (p: PullRequest) =>
    p.owner === owner && p.name === repo && p.number === number;
  const idx = list.findIndex(isCurrent);
  const next =
    (idx >= 0 ? list.slice(idx + 1).find((p) => !isCurrent(p)) : undefined) ??
    list.find((p) => !isCurrent(p));
  if (next) {
    const store = useAppStore.getState();
    store.openReview(next.owner, next.name, next.number);
    store.markSeen(
      prKey({ name: next.name, number: next.number, owner: next.owner }),
      next.updatedAt
    );
  } else {
    goInbox();
  }
}

function useReviewFileNavigation(args: {
  activeIndexRef: React.RefObject<number>;
  cursorMoverRefs: Parameters<typeof buildCursorMover>[0];
  cursorRef: React.RefObject<CursorPos | null>;
  fileCountRef: React.RefObject<number>;
  keyboardHoldRef: React.RefObject<boolean>;
  listCallbacks: ReviewListCallbacks;
  listRef: React.RefObject<ReviewListHandle | null>;
  liveSelectionRef: React.RefObject<ReturnType<typeof resolveLiveSelection>>;
  modelRef: React.RefObject<ReviewListModel>;
  persistFileIndex: (index: number) => void;
  selectionRef: React.RefObject<LineSelection | null>;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  setInputMode: React.Dispatch<React.SetStateAction<"keyboard" | "mouse">>;
  setOccSpec: (next: OccState | null) => void;
  setSelection: (s: LineSelection | null) => void;
}) {
  const scrollToFile = (i: number) => {
    if (args.fileCountRef.current === 0) {
      return;
    }
    const target = Math.min(Math.max(i, 0), args.fileCountRef.current - 1);
    usePerfStore.getState().markFileStart();
    args.setActiveIndex(target);
    syncActiveIndexRef(args.activeIndexRef, target);
    args.persistFileIndex(target);
    args.setOccSpec(null);
    args.setSelection(null);
    args.listRef.current?.scrollToFileStart(target);
    const entry = args.modelRef.current.nav.find(
      (n) => n.fileIndex === target && n.kind === "row"
    );
    if (entry) {
      markKeyboardNavigation(args);
      args.setCursor({
        anchor: entry.anchor,
        fileIndex: entry.fileIndex,
        kind: "row",
      });
    }
  };

  const fileDeltaRef = useRef(0);
  const fileRafRef = useRef<number | null>(null);
  const flushFileMove = () => {
    fileRafRef.current = null;
    const delta = fileDeltaRef.current;
    fileDeltaRef.current = 0;
    if (delta === 0) {
      return;
    }
    scrollToFile(args.activeIndexRef.current + delta);
  };

  const moveFile = (delta: number) => {
    if (args.fileCountRef.current === 0) {
      return;
    }
    fileDeltaRef.current += delta;
    if (fileRafRef.current === null) {
      fileRafRef.current = requestAnimationFrame(flushFileMove);
    }
  };

  const nextFile = () => moveFile(1);
  const prevFile = () => moveFile(-1);

  const cycleFile = (dir: number) => {
    const n = args.fileCountRef.current;
    if (n === 0) {
      return;
    }
    scrollToFile((args.activeIndexRef.current + dir + n) % n);
  };

  const pageScroll = (dir: number) => {
    const el = args.listRef.current?.scroller();
    if (el) {
      el.scrollBy({ top: dir * el.clientHeight * 0.85 });
    }
  };

  const moveCursorFast = (delta: 1 | -1, isRepeat: boolean) => {
    const refs = args.cursorMoverRefs;
    const m = refs.modelRef.current;
    const cur = refs.cursorRef.current;
    const curIdx = cur
      ? m.navIndexOf.get(navKey(cur.fileIndex, cur.anchor, cur.kind))
      : undefined;
    const step =
      curIdx === undefined
        ? delta * FAST_CURSOR_STEP
        : clampFastStep(m, curIdx, delta * FAST_CURSOR_STEP, isRepeat) - curIdx;
    buildCursorMover(refs).move(step, false);
  };

  const extendSelection = (delta: 1 | -1) => {
    const m = args.modelRef.current;
    markKeyboardNavigation(args);
    const sel = args.selectionRef.current;
    if (sel) {
      extendExistingSelection(
        sel,
        delta,
        m,
        args.listRef,
        args.setSelection,
        args.setCursor
      );
      return;
    }
    const cur = args.cursorRef.current;
    if (!cur) {
      buildCursorMover(args.cursorMoverRefs).move(delta, false);
      return;
    }
    startSelectionFromCursor(
      cur,
      delta,
      m,
      args.listRef,
      args.setSelection,
      args.setCursor
    );
  };

  const commentAtCursor = () => {
    commentAtCursorPos(
      args.modelRef,
      args.liveSelectionRef,
      args.cursorRef,
      args.activeIndexRef,
      args.setCursor,
      args.setActiveIndex,
      args.listCallbacks.onOpenBox
    );
  };

  return {
    commentAtCursor,
    cycleFile,
    extendSelection,
    fileRafRef,
    moveCursorFast,
    nextFile,
    pageScroll,
    prevFile,
    scrollToFile,
  };
}

function useReviewSubmitActions(args: {
  activeFile: ChangedFile | undefined;
  activeIndexRef: React.RefObject<number>;
  advanceAfterSubmit: () => void;
  clearPendingComments: (key: string) => void;
  files: ChangedFile[];
  keyValue: string;
  number: number;
  owner: string;
  pending: PendingComment[];
  pr: PullRequest | undefined;
  prUrl: string | undefined;
  repo: string;
  scrollToFile: (i: number) => void;
  setFlash: (msg: string) => void;
  setSubmitOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToast: (t: { message: string; title: string }) => void;
  submitReview: ReturnType<typeof useCommentMutations>["submitReview"];
  toggleViewedWithFp: (f: ChangedFile) => void;
  viewedSet: Set<string>;
}) {
  const toggleViewedFile = () => {
    if (args.activeFile) {
      args.toggleViewedWithFp(args.activeFile);
    }
  };

  const markViewedAndNext = () => {
    if (!args.activeFile) {
      return;
    }
    const wasViewed = args.viewedSet.has(args.activeFile.filename);
    args.toggleViewedWithFp(args.activeFile);
    if (wasViewed) {
      return;
    }
    const target = nextUnviewedFileIndex(
      args.files,
      args.viewedSet,
      args.activeIndexRef.current
    );
    if (target !== null) {
      args.scrollToFile(target);
    }
  };

  const copyLink = () => {
    if (!args.prUrl) {
      return;
    }
    copyTextToClipboard(args.prUrl);
    args.setToast({ message: args.prUrl, title: "Copied PR link" });
  };

  const copyFilePath = () => {
    if (!args.activeFile) {
      return;
    }
    copyTextToClipboard(args.activeFile.filename);
    args.setToast({
      message: args.activeFile.filename,
      title: "Copied file path",
    });
  };

  const openSubmit = () => {
    args.submitReview.reset();
    args.setSubmitOpen(true);
  };

  const handleSubmitReview = (event: ReviewEvent, body: string) => {
    const payload = {
      body,
      comments: args.pending.map((p) => ({
        body: p.body,
        line: p.line,
        path: p.path,
        side: p.side,
        startLine: p.startLine,
      })),
      commitId: args.pr?.headSha ?? "",
      event,
    };
    args.setSubmitOpen(false);
    args.advanceAfterSubmit();
    args.submitReview
      .mutateAsync(payload)
      .then(() => args.clearPendingComments(args.keyValue))
      .catch((e) => {
        args.setFlash(
          `Review for ${args.owner}/${args.repo}#${args.number} didn't submit — your comments are still pending. ${String(e)}`
        );
      });
  };

  return {
    copyFilePath,
    copyLink,
    handleSubmitReview,
    markViewedAndNext,
    openSubmit,
    toggleViewedFile,
  };
}

export function ReviewScreen({ routeKey }: ReviewScreenProps) {
  return <ReviewScreenInner routeKey={routeKey} />;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: TODO split into smaller components (see BACKLOG.md § Tech debt) and drop test-noise ignore in doctor.config.json
function ReviewScreenInner({ routeKey }: { routeKey: string }) {
  const { name: repo, number, owner } = parsePrKey(routeKey);
  const keyValue = routeKey;

  const { data, isError, error } = usePullRequestDetail(owner, repo, number);
  const {
    addReviewComment,
    reply,
    addIssueComment,
    deleteIssueComment,
    deleteReviewComment,
    requestResolveThread,
    submitReview,
    updateIssueComment,
    updateReviewComment,
  } = useCommentMutations(owner, repo, number);

  const detail = data;
  const pr = detail?.pr;
  const headShaRef = useLatest(pr?.headSha ?? "");

  const [initialMem] = useState(() => getReviewMemory(keyValue));

  const [activeIndex, setActiveIndex] = useState(initialMem?.fileIndex ?? 0);
  const [rightOpen, setRightOpen] = useState(false);
  const rightOpenRef = useLatest(rightOpen);
  const rightPanelRef = useRef<RightPanelHandle>(null);
  const sidebarCompact = useSyncExternalStore(
    subscribeSidebarCompact,
    getSidebarCompactSnapshot,
    getSidebarCompactServerSnapshot
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !getSidebarCompactSnapshot()
  );
  const [prevSidebarCompact, setPrevSidebarCompact] = useState(sidebarCompact);
  if (prevSidebarCompact !== sidebarCompact) {
    setPrevSidebarCompact(sidebarCompact);
    setSidebarOpen(!sidebarCompact);
  }
  const sidebarOverlayOpen = sidebarCompact && sidebarOpen;
  const sidebarOverlayOpenRef = useLatest(sidebarOverlayOpen);
  const [drawerWide, setDrawerWide] = useState(readDrawerWide);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [prSearch, setPrSearch] = useState<null | "files" | "text">(null);
  const [reconcileDismissed, setReconcileDismissed] = useState<Set<string>>(
    () => new Set()
  );
  const [replyReq, setReplyReq] = useState<{
    rootId: number;
    path: string;
    nonce: number;
  } | null>(null);
  const [toggleReq, setToggleReq] = useState<{
    rootId: number;
    path: string;
    nonce: number;
  } | null>(null);
  const [editReq, setEditReq] = useState<{
    rootId: number;
    path: string;
    nonce: number;
  } | null>(null);

  const [collapsed, setCollapsed] =
    useState<ReadonlyMap<number, ReadonlySet<number>>>(EMPTY_COLLAPSED);
  const [openBoxes, setOpenBoxes] = useState<
    ReadonlyMap<string, number | null>
  >(() => new Map<string, number | null>());
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [dragging, setDragging] = useState(false);
  const [inputMode, setInputMode] = useState<"keyboard" | "mouse">("keyboard");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [copiedPathIndex, setCopiedPathIndex] = useState<number | null>(null);

  const [occSpec, setOccSpec] = useState<OccState | null>(null);
  const occSpecRef = useLatest(occSpec);

  const occRestoreRef = useRef<CapturedSelection | null>(null);
  const occNavRef = useRef(-1);
  const occOriginRef = useRef<{ anchor: string; column: number } | null>(null);

  const listRef = useRef<ReviewListHandle>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyNonceRef = useRef(0);
  const toggleNonceRef = useRef(0);
  const editNonceRef = useRef(0);
  const threadFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBoxNudgeRef = useRef<{
    fileIndex: number;
    anchor: string;
  } | null>(null);

  const activeThreadRef = useRef<{ rootId: number; path: string } | null>(null);
  const keyboardHoldRef = useRef(false);

  const goInbox = useAppStore((s) => s.goInbox);
  const toggleViewed = useAppStore((s) => s.toggleViewed);
  const reconcileViewed = useAppStore((s) => s.reconcileViewed);

  const viewed = useAppStore((s) => s.viewed);
  const autoUnviewedByHead = useAppStore((s) => s.autoUnviewed);

  const pendingMap = useAppStore((s) => s.pendingComments);
  const pending = pendingMap[keyValue] ?? EMPTY_PENDING;
  const addPendingStore = useAppStore((s) => s.addPendingComment);
  const removePendingStore = useAppStore((s) => s.removePendingComment);
  const clearPendingComments = useAppStore((s) => s.clearPendingComments);
  const setFlash = useAppStore((s) => s.setFlash);
  const setToast = useAppStore((s) => s.setToast);
  const activeLogin = useAppStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.login
  );
  const trackerBase = useAppStore((s) =>
    s.activeAccountId ? s.issueTrackers[s.activeAccountId] : undefined
  );
  const viewedFiles = viewed[keyValue];
  const viewedSet = new Set(Object.keys(viewedFiles ?? {}));

  const files = detail?.files ?? [];
  const fileCount = files.length;
  const clampedIndex = Math.min(activeIndex, Math.max(fileCount - 1, 0));
  const activeFile = files[clampedIndex];

  const autoUnviewedForHead =
    pr?.headSha === undefined
      ? undefined
      : autoUnviewedByHead[autoUnviewedKey(keyValue, pr.headSha)];
  const changedSinceViewed = buildChangedSinceViewed(
    keyValue,
    pr?.headSha,
    files,
    viewedFiles,
    reconcileDismissed,
    autoUnviewedForHead
  );

  const dismissReconcileHighlight = (filename: string) => {
    const headSha = pr?.headSha;
    if (!headSha) {
      return;
    }
    const dismissKey = reconcileHighlightKey(keyValue, headSha, filename);
    setReconcileDismissed((prev) => {
      if (prev.has(dismissKey)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(dismissKey);
      return next;
    });
  };

  const toggleViewedWithFp = (f: ChangedFile) => {
    toggleViewed(keyValue, f.filename, fingerprintFile(f, headShaRef.current));
    dismissReconcileHighlight(f.filename);
  };

  const persistFileIndex = (index: number) => {
    updateReviewMemory(keyValue, { fileIndex: index });
  };

  const activeIndexRef = useLatest(clampedIndex);
  const fileCountRef = useLatest(fileCount);
  const filesRef = useLatest(files);
  const commentsRef = useLatest<ReviewComment[]>(
    detail?.comments ?? EMPTY_COMMENTS
  );

  const commentsByFile = buildCommentsByFile(
    detail?.comments ?? EMPTY_COMMENTS
  );
  const pendingByFile = buildPendingByFile(pending);

  const rawCursorRef = useLatest(cursor);
  const {
    expandedNames,
    expandedRows,
    expandingNames,
    pendingRestoreRef: expandRestoreRef,
    toggleExpand,
  } = useFileExpansion({
    activeFileIndex: clampedIndex,
    cursorRef: rawCursorRef,
    files,
    headSha: pr?.headSha ?? "",
    listRef,
    owner,
    repo,
    setFlash,
  });

  const model: ReviewListModel = buildReviewItems({
    collapsed,
    commentsByFile,
    expandedRows,
    files,
    isImage: isImageFile,
    openBoxes,
    pendingByFile,
  });
  const modelRef = useLatest(model);

  // biome-ignore lint/correctness/useExhaustiveDependencies: model is rebuilt fresh every render (not memoized), so listing it would rerun this every render; openBoxes is the actual gate
  useLayoutEffect(() => {
    const pending = pendingBoxNudgeRef.current;
    if (!pending) {
      return;
    }
    pendingBoxNudgeRef.current = null;
    const navIdx = model.navIndexOf.get(
      navKey(pending.fileIndex, pending.anchor, "comments")
    );
    if (navIdx === undefined) {
      return;
    }
    listRef.current?.nudgeItemIntoView(model.nav[navIdx].itemIndex);
  }, [openBoxes]);

  /**
   * The expand/collapse swap shifts rows under a stationary pointer, and the
   * browser re-dispatches hover on those shifts — through the settle window
   * and past the mask reveal (the mask is opacity-only, so rows stay
   * hit-testable). Hold hover reseeds until the pointer genuinely moves
   * (isRealPointer clears the hold at >6px) so the swap can never walk the
   * cursor.
   */
  const toggleExpandHeld = (fileIndex: number) => {
    keyboardHoldRef.current = true;
    toggleExpand(fileIndex);
  };

  const onExpandRestored = (row: { anchor: string; fileIndex: number }) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = setTimeout(() => setFlashKey(null), 1600);
    setFlashKey(fileAnchorKey(row.fileIndex, row.anchor));
  };
  useExpansionScrollRestore(
    expandRestoreRef,
    modelRef,
    listRef,
    onExpandRestored
  );

  const liveCursor =
    cursor &&
    model.navIndexOf.has(navKey(cursor.fileIndex, cursor.anchor, cursor.kind))
      ? cursor
      : null;

  const liveSelection = resolveLiveSelection(selection, model);
  const selectionRef = useLatest(selection);
  const liveSelectionRef = useLatest(liveSelection);

  const selectLineRef = useRef<
    (
      fileIndex: number,
      anchor: string,
      opts?: { keepOccurrences?: boolean; nudge?: boolean }
    ) => void
  >(() => undefined);

  const {
    changeFindQuery,
    closeFind,
    closeFindRef,
    findCase,
    findCurrent,
    findFocusSeq,
    findMatches,
    findOpen,
    findOpenRef,
    findQuery,
    findSafeIndex,
    findStep,
    onFindNext,
    onFindPrev,
    openFind,
    toggleFindCase,
  } = useReviewFind({
    files,
    listRef,
    model,
    rowsByFile: expandedRows,
    selectLine: (...args) => selectLineRef.current(...args),
  });

  const selectLine = (
    fileIndex: number,
    anchor: string,
    opts: { keepOccurrences?: boolean; nudge?: boolean } = {}
  ) => {
    const m = modelRef.current;
    const key = fileAnchorKey(fileIndex, anchor);
    usePerfStore.getState().markFileStart();
    activeIndexRef.current = fileIndex;
    persistFileIndex(fileIndex);
    keyboardHoldRef.current = true;
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = setTimeout(() => setFlashKey(null), 1600);
    const itemIndex = m.anchorItem.get(key);
    applyLineSelection({
      anchor,
      clearOccurrences: !(findOpenRef.current || opts.keepOccurrences),
      fileIndex,
      flashKey: key,
      setActiveIndex,
      setCursor,
      setFlashKey,
      setInputMode,
      setOccSpec,
    });
    if (itemIndex !== undefined) {
      if (opts.nudge) {
        listRef.current?.nudgeItemIntoView(itemIndex);
      } else {
        listRef.current?.centerItem(itemIndex);
      }
    }
  };

  useLayoutEffect(() => {
    selectLineRef.current = selectLine;
  });

  const filesForHighlightRef = useLatest(files);

  useEffect(() => {
    const cachedFiles = filesForHighlightRef.current;
    if (cachedFiles.length === 0) {
      return;
    }
    return warmHighlightCache(cachedFiles);
  }, [filesForHighlightRef]);

  useReviewHeadShaSync(keyValue, pr);
  useInboxDetailNudge(keyValue, pr);
  useViewedFileReconcile(keyValue, pr, files, reconcileViewed);

  const resumeCorrectedRef = useRef(false);
  useReviewResumeScroll({
    initialMem,
    listRef,
    modelRef,
    resumeCorrectedRef,
  });

  useEffect(() => {
    requestAnimationFrame(() => usePerfStore.getState().completeFile());
  }, []);

  /**
   * Scroll → debounce → snapshot the virtualizer state into review memory.
   * The snapshot IS the resume position (restoreStateFrom on next mount).
   */
  function handleListScroll() {
    if (saveStateTimerRef.current) {
      clearTimeout(saveStateTimerRef.current);
    }
    saveStateTimerRef.current = setTimeout(() => {
      const topRow = listRef.current?.firstVisibleRow() ?? undefined;
      listRef.current?.getState((state) => {
        updateReviewMemory(keyValue, { listState: state, topRow });
      });
    }, 300);
  }

  const cursorRef = useLatest(liveCursor);

  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const isRealPointerAt = (x: number, y: number) =>
    isRealPointer(x, y, keyboardHoldRef, lastPointRef);

  const pendingDeltaRef = useRef(0);
  const cursorRafRef = useRef<number | null>(null);
  const heldRepeatsRef = useRef(0);

  const cursorMoverRefs = {
    activeIndexRef,
    activeThreadRef,
    cursorRafRef,
    cursorRef,
    filesRef,
    heldRepeatsRef,
    keyboardHoldRef,
    listRef,
    modelRef,
    pendingDeltaRef,
    setActiveIndex,
    setCursor,
    setInputMode,
  };

  const dragRef = useRef<{
    fileIndex: number;
    side: string;
    hunkIndex: number;
    from: string;
  } | null>(null);

  const listCallbacks = useReviewListCallbacks({
    activeThreadRef,
    addPendingStore,
    addReviewComment,
    copyTimerRef,
    cursorRef,
    deleteReviewComment,
    dragRef,
    filesRef,
    handleListScroll,
    headShaRef,
    isRealPointerAt,
    keyboardHoldRef,
    keyValue,
    lastPointRef,
    liveSelectionRef,
    modelRef,
    pendingBoxNudgeRef,
    removePendingStore,
    reply,
    requestResolveThread,
    setActiveIndex,
    dismissReconcileHighlight,
    setCollapsed,
    setCopiedPathIndex,
    setCursor,
    setDragging,
    setInputMode,
    setOpenBoxes,
    setSelection,
    toggleExpand: toggleExpandHeld,
    toggleViewed,
    updateReviewComment,
  });

  const {
    commentAtCursor,
    cycleFile,
    extendSelection,
    fileRafRef,
    moveCursorFast,
    nextFile,
    pageScroll,
    prevFile,
    scrollToFile,
  } = useReviewFileNavigation({
    activeIndexRef,
    cursorMoverRefs,
    cursorRef,
    fileCountRef,
    keyboardHoldRef,
    listCallbacks,
    listRef,
    liveSelectionRef,
    modelRef,
    persistFileIndex,
    selectionRef,
    setActiveIndex,
    setCursor,
    setInputMode,
    setOccSpec,
    setSelection,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO mount-only cleanup for timer/raf refs
  useEffect(
    () => () => {
      const flashTimer = flashTimerRef.current;
      const threadFlash = threadFlashRef.current;
      const copyTimer = copyTimerRef.current;
      const saveStateTimer = saveStateTimerRef.current;
      const fileRaf = fileRafRef.current;
      const cursorRaf = cursorRafRef.current;
      if (flashTimer) {
        clearTimeout(flashTimer);
      }
      if (threadFlash) {
        clearTimeout(threadFlash);
      }
      if (copyTimer) {
        clearTimeout(copyTimer);
      }
      if (saveStateTimer) {
        clearTimeout(saveStateTimer);
      }
      if (fileRaf !== null) {
        cancelAnimationFrame(fileRaf);
      }
      if (cursorRaf !== null) {
        cancelAnimationFrame(cursorRaf);
      }
    },
    [
      copyTimerRef,
      cursorRafRef,
      fileRafRef,
      flashTimerRef,
      saveStateTimerRef,
      threadFlashRef,
    ]
  );

  const matchesFor = (spec: OccState) =>
    occurrenceMatches(
      files[spec.fileIndex] ?? {},
      spec,
      expandedRows.get(spec.fileIndex)
    );
  const matchesForRef = useLatest(matchesFor);

  const occMatchList = occSpec ? matchesFor(occSpec) : EMPTY_OCC;
  const occMatchListRef = useLatest(occMatchList);

  const occNavRefs = {
    occMatchListRef,
    occNavRef,
    occOriginRef,
    occSpecRef,
    selectLineRef,
  };

  useOccurrenceTracking({
    closeFindRef,
    findOpenRef,
    matchesForRef,
    occMatchListRef,
    occNavRef,
    occOriginRef,
    occRestoreRef,
    occSpecRef,
    selectLineRef,
    setOccSpec,
  });

  useOccLinkAffordance();

  useLayoutEffect(() => {
    const captured = occRestoreRef.current;
    occRestoreRef.current = null;
    if (captured) {
      restoreCodeSelection(captured);
    }
  }, []);

  const marks = resolveMarks(findOpen, findQuery, findCase, occSpec);

  const rulerFractions = resolveRulerFractions(
    model,
    findOpen,
    findQuery,
    findMatches,
    occSpec,
    occMatchList
  );

  const advanceAfterSubmit = () =>
    advanceToNextReview(owner, repo, number, goInbox);

  const {
    discardPendingAtCursor,
    editActiveThreadComment,
    goToComment,
    jumpToThread,
    replyToActiveThreadOrNextFile,
    resolveActiveThread,
    toggleActiveThread,
  } = useReviewThreadActions({
    activeIndexRef,
    activeThreadRef,
    commentsRef,
    cursorRef,
    editNonceRef,
    filesRef,
    keyValue,
    listRef,
    modelRef,
    nextFile,
    removePendingStore,
    replyNonceRef,
    requestResolveThread,
    setActiveIndex,
    setCursor,
    setEditReq,
    setInputMode,
    setReplyReq,
    setRightOpen,
    setToggleReq,
    threadFlashRef,
    toggleNonceRef,
  });

  const {
    copyFilePath,
    copyLink,
    handleSubmitReview,
    markViewedAndNext,
    openSubmit,
    toggleViewedFile,
  } = useReviewSubmitActions({
    activeFile,
    activeIndexRef,
    advanceAfterSubmit,
    clearPendingComments,
    files,
    keyValue,
    number,
    owner,
    pending,
    pr,
    prUrl: pr?.url,
    repo,
    scrollToFile,
    setFlash,
    setSubmitOpen,
    setToast,
    submitReview,
    toggleViewedWithFp,
    viewedSet,
  });

  const onOpenPrUrl = () => {
    if (pr?.url) {
      openUrl(pr.url);
    }
  };

  const onToggleRightPanel = () => {
    setRightOpen((open) => !open);
  };

  const onCloseRightPanel = () => {
    setRightOpen(false);
  };

  const onToggleSidebar = () => {
    setSidebarOpen((open) => !open);
  };

  const onCloseSidebar = () => {
    setSidebarOpen(false);
  };

  const onSelectFile = (i: number) => {
    scrollToFile(i);
    if (sidebarOverlayOpenRef.current) {
      setSidebarOpen(false);
    }
  };

  const onToggleDrawerWide = () => {
    if (!rightOpenRef.current) {
      setRightOpen(true);
      return;
    }
    const next = !drawerWide;
    setDrawerWide(next);
    persistDrawerWide(next);
  };

  const onCloseSubmitModal = () => {
    setSubmitOpen(false);
  };

  const onClosePrSearch = () => {
    setPrSearch(null);
  };

  const onAddIssueComment = async (body: string) => {
    await addIssueComment.mutateAsync({ body });
  };

  const onCommentOnPr = () => {
    setRightOpen(true);
    rightPanelRef.current?.openComposer();
  };

  const onEditIssueComment = async (a: { commentId: number; body: string }) => {
    await updateIssueComment.mutateAsync(a);
  };

  const onDeleteIssueComment = async (a: { commentId: number }) => {
    await deleteIssueComment.mutateAsync(a);
  };

  const onOpenPrFiles = () => {
    if (!pr?.url) {
      return;
    }
    const urlFilesPath = isGitlabPrUrl(pr.url) ? "/diffs" : "/files";
    openUrl(pr.url + urlFilesPath);
  };

  useReviewHotkeys({
    closeFind,
    commentAtCursor,
    commentOnPr: onCommentOnPr,
    copyFilePath,
    copyLink,
    cursorMoverRefs,
    cycleFile,
    discardPendingAtCursor,
    editActiveThreadComment,
    extendSelection,
    findOpen,
    findOpenRef,
    findStep,
    goInbox,
    goToComment,
    moveCursorFast,
    markViewedAndNext,
    occNavRefs,
    occSpec,
    openFind,
    openPrFiles: onOpenPrFiles,
    openSubmit,
    pageScroll,
    prevFile,
    replyToActiveThreadOrNextFile,
    resolveActiveThread,
    rightOpenRef,
    selectionRef,
    setPrSearch,
    setRightOpen,
    setSelection,
    sidebarOverlayOpenRef,
    toggleActiveThread,
    toggleDrawerWide: onToggleDrawerWide,
    toggleFullFile: () => toggleExpandHeld(activeIndexRef.current),
    toggleSidebar: onToggleSidebar,
    closeSidebar: onCloseSidebar,
    toggleViewedFile,
  });

  if (!(detail && pr)) {
    return (
      <ReviewScreenPending
        error={error}
        goInbox={goInbox}
        isError={isError}
        number={number}
        owner={owner}
        repo={repo}
      />
    );
  }

  const stateClass = resolvePrStateClass(pr);
  const stateLabel = resolvePrStateLabel(pr);

  const isOwnPr = !!activeLogin && pr.author === activeLogin;
  const reviews = detail.reviews ?? [];

  const convoCount =
    (detail.issueComments?.length ?? 0) +
    reviews.filter((r) => r.body.trim().length > 0).length +
    detail.comments.filter((c) => c.inReplyToId === null).length;

  const ciDot = ciDotClass(detail.ciStatus);
  const infoTitle = ciDot
    ? `PR info & checks — ${ciDotLabel(detail.ciStatus)}`
    : "PR description & conversation";
  return (
    <div className="dir-quiet relative flex h-full min-h-0 overflow-hidden">
      <aside
        className={cn(
          "qf-sidebar-col",
          sidebarCompact ? "qf-sidebar-overlay" : "qf-sidebar-inline",
          sidebarOpen && "qf-sidebar-open"
        )}
      >
        <FileSidebar
          changed={changedSinceViewed}
          comments={detail.comments}
          files={files}
          onSelect={onSelectFile}
          pending={pending}
          prKeyValue={keyValue}
          selectedIndex={clampedIndex}
        />
      </aside>
      <button
        aria-hidden={!sidebarOverlayOpen}
        aria-label="Close file tree"
        className={cn(
          "qf-sidebar-scrim",
          sidebarOverlayOpen && "qf-sidebar-scrim-open"
        )}
        onClick={onCloseSidebar}
        tabIndex={-1}
        type="button"
      />

      <main className="qf-main flex min-w-0 flex-1 flex-col">
        <header className="qf-header flex shrink-0 items-center gap-4 px-6 py-3">
          {(sidebarCompact || !sidebarOpen) && (
            <Tooltip combo="b" label="Show files">
              <button
                aria-label="Show files"
                aria-pressed={sidebarOpen}
                className="qf-files-toggle qf-focusable"
                onClick={onToggleSidebar}
                type="button"
              >
                <PanelLeft aria-hidden size={16} />
              </button>
            </Tooltip>
          )}
          <div className="qf-header-id min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("qf-state", stateClass)}>
                <span className="qf-state-dot" />
                {stateLabel}
              </span>
              <h1 className="qf-pr-title truncate" title={pr.title}>
                <TicketTitle title={pr.title} trackerBase={trackerBase} />
              </h1>
            </div>
            <div className="qf-pr-sub mt-1 flex min-w-0 items-center gap-2">
              <span className="qf-pr-num">#{pr.number}</span>
              <span className="qf-dot">·</span>
              <span>{pr.repo}</span>
              <span className="qf-dot">·</span>
              <Avatar name={pr.author} size={15} url={pr.authorAvatarUrl} />
              <span className="qf-muted">{pr.author}</span>
              {!!pr.baseRef && !!pr.headRef && (
                <>
                  <span className="qf-dot">·</span>
                  <span className="qf-branch">
                    <BranchChip
                      label="Target branch — click to copy"
                      name={pr.baseRef}
                    />
                    <span className="qf-arrow">←</span>
                    <BranchChip
                      label="PR branch — click to copy"
                      name={pr.headRef}
                    />
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="qf-header-actions flex shrink-0 items-center gap-4">
            <ReviewVerdicts reviews={reviews} />
            <Tooltip combo="i" label={infoTitle}>
              <button
                aria-pressed={rightOpen}
                className="qf-info-btn qf-focusable"
                onClick={onToggleRightPanel}
                type="button"
              >
                i
                {ciDot && (
                  <span aria-hidden className={cn("qf-ci-dot", ciDot)} />
                )}
                {convoCount > 0 && (
                  <span className="qf-info-count">{convoCount}</span>
                )}
              </button>
            </Tooltip>
            <button
              className="qf-submit qf-focusable"
              onClick={openSubmit}
              type="button"
            >
              {pending.length > 0 ? "Submit review" : "Review"}
              {pending.length > 0 && (
                <span className="qf-submit-badge">{pending.length}</span>
              )}
              <Kbd combo="s" />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <FindBar
            caseSensitive={findCase}
            current={findMatches.length > 0 ? findSafeIndex + 1 : 0}
            focusSeq={findFocusSeq}
            onClose={closeFind}
            onNext={onFindNext}
            onPrev={onFindPrev}
            onQueryChange={changeFindQuery}
            onToggleCase={toggleFindCase}
            open={findOpen}
            query={findQuery}
            total={findMatches.length}
          />
          {fileCount === 0 ? (
            <div className="qf-empty">No files changed.</div>
          ) : (
            <ReviewList
              activeIndex={clampedIndex}
              addPending={addReviewComment.isPending}
              baseSha={pr.baseSha}
              callbacks={listCallbacks}
              changedSinceViewed={changedSinceViewed}
              copiedPathIndex={copiedPathIndex}
              cursorKey={
                liveCursor
                  ? navKey(
                      liveCursor.fileIndex,
                      liveCursor.anchor,
                      liveCursor.kind
                    )
                  : null
              }
              dragging={dragging}
              editRequest={editReq}
              expandedFiles={expandedNames}
              expandingFiles={expandingNames}
              files={files}
              findCurrent={findCurrent}
              flashKey={flashKey}
              headSha={pr.headSha}
              initialFileIndex={initialMem?.fileIndex ?? 0}
              inputMode={inputMode}
              marks={marks}
              model={model}
              owner={owner}
              ref={listRef}
              replyPending={reply.isPending}
              replyRequest={replyReq}
              repo={repo}
              restoreState={initialMem?.listState}
              selection={
                liveSelection
                  ? {
                      endItem: liveSelection.endItem,
                      fileIndex: liveSelection.fileIndex,
                      fromItem: liveSelection.fromItem,
                      toItem: liveSelection.toItem,
                    }
                  : null
              }
              toggleRequest={toggleReq}
              viewedSet={viewedSet}
            />
          )}
          <OverviewRuler
            currentIndex={
              findOpen && findMatches.length > 0 ? findSafeIndex : null
            }
            fractions={rulerFractions}
            kind={findOpen ? "find" : "occurrence"}
          />
        </div>
      </main>

      <RightPanel
        addIssueCommentPending={addIssueComment.isPending}
        ci={detail.ciStatus}
        conversation={detail.issueComments ?? []}
        fileCount={fileCount}
        inlineComments={detail.comments}
        onAddIssueComment={onAddIssueComment}
        onClose={onCloseRightPanel}
        onDeleteIssueComment={onDeleteIssueComment}
        onEditIssueComment={onEditIssueComment}
        onJumpToThread={jumpToThread}
        onOpenPr={onOpenPrUrl}
        onToggleWide={onToggleDrawerWide}
        open={rightOpen}
        pr={pr}
        ref={rightPanelRef}
        reviews={reviews}
        wide={drawerWide}
      />

      <SubmitReviewModal
        busy={submitReview.isPending}
        error={null}
        onClose={onCloseSubmitModal}
        onSubmit={handleSubmitReview}
        open={submitOpen}
        ownPr={isOwnPr}
        pendingCount={pending.length}
      />

      <PrSearch
        files={files}
        mode={prSearch ?? "files"}
        onClose={onClosePrSearch}
        onSelectFile={scrollToFile}
        onSelectLine={selectLine}
        open={prSearch !== null}
      />
    </div>
  );
}

/** The inbox cache's view of a PR, for painting the shell before detail loads. */
function findCachedInboxPr(
  owner: string,
  repo: string,
  number: number
): PullRequest | undefined {
  const match = (p: PullRequest) =>
    p.owner === owner && p.name === repo && p.number === number;
  const inbox = queryClient.getQueryData<InboxData>(queryKeys.inbox);
  if (inbox) {
    for (const key of [
      "reviewRequested",
      "assigned",
      "created",
      "involved",
    ] as const) {
      const hit = inbox[key].prs.find(match);
      if (hit) {
        return hit;
      }
    }
  }
  return queryClient
    .getQueryData<InboxBucket>(queryKeys.subscribed)
    ?.prs.find(match);
}

/** A branch name as a copyable chip: click copies the name, the icon confirms. */
function BranchChip({ name, label }: { name: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );
  const onCopy = () => {
    copyTextToClipboard(name);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Tooltip label={copied ? "Copied" : label}>
      <button
        className={cn("qf-branch-chip", copied && "qf-branch-copied")}
        onClick={onCopy}
        type="button"
      >
        {copied ? (
          <Check aria-hidden size={11} />
        ) : (
          <GitBranch aria-hidden size={11} />
        )}
        {name}
      </button>
    </Tooltip>
  );
}
