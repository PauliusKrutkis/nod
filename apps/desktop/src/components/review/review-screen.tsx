/**
 * A freshly opened comment box (`c`, drag-select, or the `+` button) can
 * render partly or fully below the fold on a short viewport.
 * `reviewListOnOpenBox` flags the anchor it just opened in
 * `pendingBoxNudgeRef`, and a layout effect nudges it into view once the
 * model that contains it has rebuilt — same instant, no-animation easing
 * keyboard row navigation already uses via `nudgeItemIntoView`.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
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
import {
  useReviewFileNavigation,
  useReviewResumeScroll,
} from "../../hooks/use-review-file-navigation.ts";
import { useReviewFind } from "../../hooks/use-review-find.ts";
import { useReviewHeadShaSync } from "../../hooks/use-review-head-sha-sync.ts";
import { useReviewHotkeys } from "../../hooks/use-review-hotkeys.ts";
import {
  isRealPointer,
  useReviewListCallbacks,
} from "../../hooks/use-review-list-callbacks.ts";
import {
  advanceToNextReview,
  useReviewSubmitActions,
} from "../../hooks/use-review-submit-actions.ts";
import { useReviewThreadActions } from "../../hooks/use-review-thread-actions.ts";
import { useViewedFileReconcile } from "../../hooks/use-viewed-file-reconcile.ts";
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
import {
  type CursorPos,
  type LineSelection,
  resolveLiveSelection,
} from "../../lib/review-cursor.ts";
import {
  buildCommentsByFile,
  buildPendingByFile,
  buildReviewItems,
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
  PendingComment,
  ReviewComment,
} from "../../types.ts";
import { parsePrKey } from "../../types.ts";
import { FileSidebar } from "./file-sidebar.tsx";
import { PrSearch } from "./pr-search.tsx";
import { ReviewDiffPane } from "./review-diff-pane.tsx";
import { ReviewHeader } from "./review-header.tsx";
import type { MarkSpec, ReviewListHandle } from "./review-list.tsx";
import { ReviewScreenPending } from "./review-screen-pending.tsx";
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

const EMPTY_COMMENTS: ReviewComment[] = [];
const EMPTY_PENDING: PendingComment[] = [];
const EMPTY_OCC: OccurrenceMatch[] = [];
const EMPTY_FRACTIONS: number[] = [];
const EMPTY_COLLAPSED: ReadonlyMap<number, ReadonlySet<number>> = new Map();

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

  const isOwnPr = !!activeLogin && pr.author === activeLogin;
  const reviews = detail.reviews ?? [];
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
        <ReviewHeader
          detail={detail}
          onOpenSubmit={openSubmit}
          onToggleRightPanel={onToggleRightPanel}
          onToggleSidebar={onToggleSidebar}
          pendingCount={pending.length}
          pr={pr}
          reviews={reviews}
          rightOpen={rightOpen}
          sidebarCompact={sidebarCompact}
          sidebarOpen={sidebarOpen}
        />

        <ReviewDiffPane
          addPending={addReviewComment.isPending}
          changedSinceViewed={changedSinceViewed}
          changeFindQuery={changeFindQuery}
          clampedIndex={clampedIndex}
          closeFind={closeFind}
          copiedPathIndex={copiedPathIndex}
          dragging={dragging}
          editReq={editReq}
          expandedNames={expandedNames}
          expandingNames={expandingNames}
          fileCount={fileCount}
          files={files}
          findCase={findCase}
          findCurrent={findCurrent}
          findFocusSeq={findFocusSeq}
          findMatches={findMatches}
          findOpen={findOpen}
          findQuery={findQuery}
          findSafeIndex={findSafeIndex}
          flashKey={flashKey}
          initialMem={initialMem}
          inputMode={inputMode}
          listCallbacks={listCallbacks}
          listRef={listRef}
          liveCursor={liveCursor}
          liveSelection={liveSelection}
          marks={marks}
          model={model}
          onFindNext={onFindNext}
          onFindPrev={onFindPrev}
          owner={owner}
          pr={pr}
          replyPending={reply.isPending}
          replyReq={replyReq}
          repo={repo}
          rulerFractions={rulerFractions}
          toggleFindCase={toggleFindCase}
          toggleReq={toggleReq}
          viewedSet={viewedSet}
        />
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
