/**
 * A ledger session (docs/LEDGER.md §6 screen 2): one provenance group's
 * queued files rendered through the same diff surface as a PR review — the
 * session *is* the net diff since the last signature. The verbs are `r`
 * (sign the region under the cursor), `c` (start a comment thread — a fact,
 * posted immediately), `v`/`a` (viewed / approve). Threads render inline
 * exactly like PR comments, positioned by their anchors on tip.
 *
 * Parity is the contract, so the review screen's own hooks run here with
 * topic data: useReviewFileNavigation (t/Tab/f/g/e), useReviewThreadActions
 * (q/w/x/z), useFileExpansion (shift+v — blobs come off the store clone via
 * the same store-first get_file_blob the PR surface uses), and the
 * RightDock + PrDrawer info panel (`mod+i`) with the topic's story where
 * the PR description sits. Keys that exist on the PR surface but not here
 * are the forge-only ones: pending-review staging, AI ask/chat, delta mode,
 * open-in-browser, repo search. `r` stays the signing verb (the review
 * screen's reply-or-next-file), because signing is what this surface is for.
 *
 * Mutations are optimistic (useLedgerMutations): the fact's effect paints
 * from cache instantly and the sidecar reconciles behind it, exactly like
 * the PR surface's comment mutations.
 */

import { InboxZero } from "@nod/ui/inbox-zero";
import { type DrawerReview, PrDrawer } from "@nod/ui/pr-drawer";
import { ReviewHeader } from "@nod/ui/review-header";
import { ReviewScreenPending } from "@nod/ui/review-screen-pending";
import { RightDock } from "@nod/ui/right-dock";
import { useLatest } from "@nod/ui/use-latest";
import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useExpansionScrollRestore,
  useFileExpansion,
} from "../../hooks/use-file-expansion.ts";
import { useLedgerMutations } from "../../hooks/use-ledger-mutations.ts";
import { useReviewFileNavigation } from "../../hooks/use-review-file-navigation.ts";
import { useReviewFind } from "../../hooks/use-review-find.ts";
import { isRealPointer } from "../../hooks/use-review-list-callbacks.ts";
import { useReviewPanels } from "../../hooks/use-review-panels.ts";
import { useReviewThreadActions } from "../../hooks/use-review-thread-actions.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { copyTextToClipboard } from "../../lib/clipboard.ts";
import { cn } from "../../lib/cn.ts";
import {
  actorAvatarUrl,
  groupQueueByProvenance,
  initialAnchorFor,
  ledgerCommentsToReview,
  regionAtCursor,
  sessionToChangedFiles,
  topicStory,
} from "../../lib/ledger-session.ts";
import { queryKeys } from "../../lib/query-client.ts";
import {
  buildCursorMover,
  type CursorPos,
  type LineSelection,
  type resolveLiveSelection,
} from "../../lib/review-cursor.ts";
import { resolveMarks, resolveRulerFractions } from "../../lib/review-find.ts";
import {
  buildCommentsByFile,
  buildReviewItems,
  fileAnchorKey,
  type ReviewListModel,
  withoutResolvedThreads,
} from "../../lib/review-items.ts";
import { fingerprintFile } from "../../lib/viewed-fingerprint.ts";
import { useAppStore } from "../../store/app-store.ts";
import type { LedgerTopicApproval, PendingComment } from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";
import { ReviewDiffPane } from "../review/review-diff-pane.tsx";
import type {
  ReviewListCallbacks,
  ReviewListHandle,
} from "../review/review-list.tsx";
import { FileTreeColumn } from "../review/review-screen.tsx";

const EMPTY_PENDING: ReadonlyMap<string, PendingComment[]> = new Map();
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_PENDING_LIST: PendingComment[] = [];
const EMPTY_OCC: never[] = [];
const CAPABILITIES = {
  comment: true,
  expand: true,
  stage: false,
  viewed: true,
};
const INFO_TABS = [{ id: "info", kbd: "mod+i", label: "Info" }];
const notImage = () => false;
/** Pending/staging affordances stay inert — facts post now or not at all. */
const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** The review screen's own focus-return: Esc keeps working from the diff. */
function focusScrollHost() {
  document
    .querySelector<HTMLElement>(".qf-scrollhost")
    ?.focus({ preventScroll: true });
}

// react-doctor-disable-next-line no-giant-component -- what is left after the shared hooks moved in is state wiring: the review screen's own hooks feeding one ReviewDiffPane, so an extraction would thread every ref through a new interface and read worse, not better. Same call as review-screen.tsx; BACKLOG § Tech debt records it
export function LedgerSession({
  approval = null,
  author,
  authorAvatarUrl,
  group,
  initialTarget,
  number,
  onExit,
  onSigned,
  repoKey,
  targets,
  updatedAt,
}: {
  /** A standing approval on the topic, shown as the header's verdict pill. */
  approval?: LedgerTopicApproval | null;
  /** The group's sole commit author, PR-header style (queue's entryMeta). */
  author?: string;
  authorAvatarUrl?: string;
  /** The topic's fact-minted display number (#N). */
  number?: number;
  group: { label: string; subject: string };
  initialTarget: string;
  onExit: () => void;
  onSigned: (target: string) => void;
  repoKey: string;
  targets: string[];
  /** The group's freshness, shown in the info drawer's summary. */
  updatedAt?: string;
}) {
  const [owner = "", name = ""] = repoKey.split("/");
  const setToast = useAppStore((s) => s.setToast);
  const setFlash = useAppStore((s) => s.setFlash);
  const setLedgerSessionOpen = useAppStore((s) => s.setLedgerSessionOpen);
  const viewedKey = `ledger:${repoKey}`;
  const viewedFiles = useAppStore((s) => s.viewed[viewedKey]);
  const toggleViewed = useAppStore((s) => s.toggleViewed);
  const hideResolved = useAppStore((s) => s.hideResolvedThreads);
  const toggleHideResolved = useAppStore((s) => s.toggleHideResolvedThreads);
  const ownLogin = useAppStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.login
  );
  const panels = useReviewPanels();

  useEffect(() => {
    setLedgerSessionOpen(true);
    return () => {
      setLedgerSessionOpen(false);
    };
  }, [setLedgerSessionOpen]);

  const session = useQuery({
    enabled: targets.length > 0,
    queryFn: () => api.ledgerSession(repoKey, targets),
    queryKey: queryKeys.ledgerSession(repoKey, targets),
  });
  // The queue's own status query, warm from the tab — the drawer's story
  // (coverage, provenance, files) reads from the same cache the queue
  // paints from.
  const status = useQuery({
    queryFn: () => api.ledgerStatus(repoKey),
    queryKey: queryKeys.ledger(repoKey),
    staleTime: 60_000,
  });

  const tip = session.data?.tip ?? "";
  const mutations = useLedgerMutations({ repoKey, targets, tip });
  const sessionFiles = useMemo(
    () => session.data?.sessions ?? [],
    [session.data]
  );
  const files = useMemo(
    () => sessionToChangedFiles(sessionFiles, tip),
    [sessionFiles, tip]
  );
  const threadMaps = useMemo(
    () => ledgerCommentsToReview(session.data?.comments ?? []),
    [session.data]
  );
  const commentList = useMemo(
    () => [...threadMaps.byFile.values()].flat(),
    [threadMaps]
  );
  const visibleThreads = hideResolved
    ? withoutResolvedThreads(commentList)
    : null;
  const commentsByFile = visibleThreads
    ? buildCommentsByFile(visibleThreads.comments)
    : threadMaps.byFile;

  // A file counts as viewed only while its content fingerprint still
  // matches — a new tip that changed the patch clears the mark.
  const viewedSet = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) {
      if (viewedFiles?.[file.filename] === fingerprintFile(file, tip)) {
        set.add(file.filename);
      }
    }
    return set;
  }, [files, tip, viewedFiles]);

  // ---- cursor slice, mirroring the review screen's ---------------------
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [inputMode, setInputMode] = useState<"keyboard" | "mouse">("keyboard");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [copiedPathIndex, setCopiedPathIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<
    ReadonlyMap<number, ReadonlySet<number>>
  >(new Map());
  const [openBoxes, setOpenBoxes] = useState<
    ReadonlyMap<string, number | null>
  >(new Map());
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

  const listRef = useRef<ReviewListHandle | null>(null);
  const cursorRef = useRef<CursorPos | null>(null);
  const activeIndexRef = useRef(0);
  const activeThreadRef = useRef<{ rootId: number; path: string } | null>(null);
  const pendingDeltaRef = useRef(0);
  const cursorRafRef = useRef<number | null>(null);
  const heldRepeatsRef = useRef(0);
  const keyboardHoldRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const threadFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyNonceRef = useRef(0);
  const toggleNonceRef = useRef(0);
  const editNonceRef = useRef(0);
  const selectionRef = useRef<LineSelection | null>(null);
  const liveSelectionRef = useRef<ReturnType<
    typeof resolveLiveSelection
  > | null>(null);

  const filesRef = useLatest(files);
  const fileCountRef = useLatest(files.length);
  const commentListRef = useLatest(commentList);
  const rawCursorRef = useRef<CursorPos | null>(null);
  useInsertionEffect(() => {
    cursorRef.current = cursor;
    rawCursorRef.current = cursor;
  });

  const clampedIndex = Math.max(0, Math.min(activeIndex, files.length - 1));

  // Full-file expansion off the store clone: get_file_blob resolves the tip
  // sha locally before it would ever ask the forge, so this is the review
  // screen's own hook, unchanged.
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
    headSha: tip,
    listRef,
    owner,
    repo: name,
    setFlash,
  });

  const toggleExpandHeld = (fileIndex: number) => {
    keyboardHoldRef.current = true;
    toggleExpand(fileIndex);
  };

  const model: ReviewListModel = useMemo(
    () =>
      buildReviewItems({
        ask: null,
        collapsed,
        commentsByFile,
        expandedRows,
        files,
        isImage: notImage,
        openBoxes,
        pendingByFile: EMPTY_PENDING,
      }),
    [collapsed, files, openBoxes, commentsByFile, expandedRows]
  );
  const modelRef = useLatest(model);

  const onExpandRestored = (row: { anchor: string; fileIndex: number }) => {
    setFlashKey(fileAnchorKey(row.fileIndex, row.anchor));
  };
  useExpansionScrollRestore(
    expandRestoreRef,
    modelRef,
    listRef,
    onExpandRestored
  );

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

  const placeCursor = (fileIndex: number, anchor: string) => {
    setInputMode("keyboard");
    setActiveIndex(fileIndex);
    activeIndexRef.current = fileIndex;
    const next: CursorPos = { anchor, fileIndex, kind: "row" };
    setCursor(next);
    cursorRef.current = next;
  };

  const selectLine = (fileIndex: number, anchor: string) => {
    placeCursor(fileIndex, anchor);
    setFlashKey(fileAnchorKey(fileIndex, anchor));
    const itemIndex = model.anchorItem.get(fileAnchorKey(fileIndex, anchor));
    if (itemIndex !== undefined) {
      listRef.current?.centerItem(itemIndex);
    }
  };

  // Land on the region the queue row pointed at, once per payload.
  const placedRef = useRef(false);
  useEffect(() => {
    if (placedRef.current || files.length === 0) {
      return;
    }
    placedRef.current = true;
    const at = initialAnchorFor(files, model, initialTarget);
    if (at) {
      // react-doctor-disable-next-line react-hooks-js/set-state-in-effect -- landing the cursor needs the built model and a mounted list to center against, so it cannot be derived before render; the placedRef guard keeps it to once per payload
      placeCursor(at.fileIndex, at.anchor);
      const itemIndex = model.anchorItem.get(
        fileAnchorKey(at.fileIndex, at.anchor)
      );
      if (itemIndex !== undefined) {
        listRef.current?.centerItem(itemIndex);
      }
    }
  });

  const find = useReviewFind({
    files,
    listRef,
    model,
    rowsByFile: expandedRows,
    selectLine,
  });
  const marks = resolveMarks(
    find.findOpen,
    find.findQuery,
    find.findCase,
    null
  );
  const rulerFractions = resolveRulerFractions(
    model,
    find.findOpen,
    find.findQuery,
    find.findMatches,
    null,
    EMPTY_OCC
  );

  const current = regionAtCursor(model, files, sessionFiles, cursor);

  const toggleViewedAt = (fileIndex: number) => {
    const file = filesRef.current[fileIndex];
    if (file) {
      toggleViewed(viewedKey, file.filename, fingerprintFile(file, tip));
    }
  };

  const openBoxAt = (fileIndex: number, anchor: string, startLine?: number) => {
    setOpenBoxes((cur) =>
      new Map(cur).set(fileAnchorKey(fileIndex, anchor), startLine ?? null)
    );
  };

  const nav = useReviewFileNavigation({
    activeIndexRef,
    cursorMoverRefs,
    cursorRef,
    fileCountRef,
    keyboardHoldRef,
    listCallbacks: {
      onCloseBox: (fileIndex, anchor) => {
        setOpenBoxes((cur) => {
          const next = new Map(cur);
          next.delete(fileAnchorKey(fileIndex, anchor));
          return next;
        });
      },
      onOpenBox: openBoxAt,
    },
    listRef,
    liveSelectionRef,
    modelRef,
    persistFileIndex: noop,
    selectionRef,
    setActiveIndex,
    setCursor,
    setInputMode,
    setOccSpec: noop,
    setSelection: noop,
  });

  const threadActions = useReviewThreadActions({
    activeIndexRef,
    activeThreadRef,
    commentsRef: commentListRef,
    cursorRef,
    editNonceRef,
    filesRef,
    keyValue: viewedKey,
    listRef,
    modelRef,
    nextFile: nav.nextFile,
    removePendingStore: noop,
    replyNonceRef,
    requestResolveThread: ({ resolved, threadId }) => {
      if (!resolved) {
        setToast({
          message: "The fact log is append-only; resolution stands.",
          title: "Cannot unresolve",
        });
        return;
      }
      mutations.resolveThread(threadId);
    },
    setActiveIndex,
    setCursor,
    setEditReq: noop,
    setInputMode,
    setReplyReq,
    setRightOpen: panels.setRightOpen,
    setToggleReq,
    threadFlashRef,
    toggleNonceRef,
  });

  const approve = () => {
    mutations.approve(group.label);
    setToast({
      message: `${group.label} at ${shortSha(tip)}`,
      title: "Topic approved",
    });
    onExit();
  };

  const sign = () => {
    if (!current) {
      return;
    }
    mutations.sign(current.target);
    setToast({ message: current.target, title: "Region signed" });
    onSigned(current.target);
  };

  const markViewedAndNext = () => {
    const file = filesRef.current[activeIndexRef.current];
    if (file && !viewedSet.has(file.filename)) {
      toggleViewedAt(activeIndexRef.current);
    }
    nav.nextFile();
  };

  const copyGroupLink = () => {
    const url = `nod://ledger/${repoKey}/${encodeURIComponent(group.label)}`;
    copyTextToClipboard(url);
    setToast({ message: url, title: "Copied group link" });
  };

  const callbacks: ReviewListCallbacks = {
    onAddComment: ({ path, line, side, body, startLine }) => {
      if (side !== "RIGHT") {
        setToast({
          message: "Only code on tip can carry a thread.",
          title: "Cannot comment here",
        });
        return Promise.resolve();
      }
      mutations.addComment({ body, line, path, startLine });
      return Promise.resolve();
    },
    onAddPending: noop,
    onCloseBox: (fileIndex, anchor) => {
      setOpenBoxes((cur) => {
        const next = new Map(cur);
        next.delete(fileAnchorKey(fileIndex, anchor));
        return next;
      });
    },
    onCopyPath: (fileIndex) => {
      const file = filesRef.current[fileIndex];
      if (!file) {
        return;
      }
      navigator.clipboard?.writeText(file.filename).catch(noop);
      setCopiedPathIndex(fileIndex);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedPathIndex(null);
      }, 1200);
    },
    onDeleteComment: asyncNoop,
    onDeltaExpand: noop,
    onEditComment: asyncNoop,
    onEditPending: noop,
    onMouseMove: (x, y) => {
      isRealPointer(x, y, keyboardHoldRef, lastPointRef);
    },
    onOpenBox: openBoxAt,
    onPendingHover: noop,
    onPlusDragEnd: noop,
    onPlusDragOver: noop,
    onPlusDragStart: noop,
    onPostPendingNow: asyncNoop,
    onRemovePending: noop,
    onReply: ({ inReplyTo, body }) => {
      const parent = threadMaps.factIdOf.get(inReplyTo);
      if (parent) {
        mutations.reply(parent, body);
      }
      return Promise.resolve();
    },
    onResolveThread: ({ threadId, resolved }) => {
      if (!resolved) {
        setToast({
          message: "The fact log is append-only; resolution stands.",
          title: "Cannot unresolve",
        });
        return;
      }
      mutations.resolveThread(threadId);
    },
    onRowEnter: (fileIndex, anchor, x, y) => {
      if (!isRealPointer(x, y, keyboardHoldRef, lastPointRef)) {
        return;
      }
      setInputMode("mouse");
      setActiveIndex(fileIndex);
      activeIndexRef.current = fileIndex;
      const next: CursorPos = { anchor, fileIndex, kind: "row" };
      setCursor(next);
      cursorRef.current = next;
    },
    onScroll: noop,
    onThreadHover: noop,
    onToggleExpand: toggleExpandHeld,
    onUpdatePending: noop,
    onToggleHunk: (fileIndex, hunkIndex) => {
      setCollapsed((cur) => {
        const next = new Map(cur);
        const set = new Set(next.get(fileIndex) ?? []);
        if (set.has(hunkIndex)) {
          set.delete(hunkIndex);
        } else {
          set.add(hunkIndex);
        }
        next.set(fileIndex, set);
        return next;
      });
    },
    onToggleViewed: toggleViewedAt,
  };

  useHotkeys("ledger-session", [
    {
      description: "Next line",
      group: "Session",
      keys: ["j", "down"],
      run: (e) => buildCursorMover(cursorMoverRefs).move(1, e.repeat),
    },
    {
      description: "Previous line",
      group: "Session",
      keys: ["k", "up"],
      run: (e) => buildCursorMover(cursorMoverRefs).move(-1, e.repeat),
    },
    {
      description: "Fast down",
      group: "Session",
      keys: "f",
      run: (e) => nav.moveCursorFast(1, e.repeat),
    },
    {
      description: "Fast up",
      group: "Session",
      keys: "g",
      run: (e) => nav.moveCursorFast(-1, e.repeat),
    },
    {
      description: "Previous file",
      group: "Files",
      keys: "t",
      run: nav.prevFile,
    },
    {
      description: "Cycle files",
      group: "Files",
      keys: "tab",
      run: (e) => nav.cycleFile(e.shiftKey ? -1 : 1),
    },
    {
      description: "Page down",
      group: "Session",
      hidden: true,
      keys: ["space", "pagedown"],
      run: () => nav.pageScroll(1),
    },
    {
      description: "Page up",
      group: "Session",
      hidden: true,
      keys: ["shift+space", "pageup"],
      run: () => nav.pageScroll(-1),
    },
    {
      description: "Next comment",
      group: "Comments",
      keys: "q",
      run: () => threadActions.goToComment(1),
    },
    {
      description: "Previous comment",
      group: "Comments",
      keys: "w",
      run: () => threadActions.goToComment(-1),
    },
    {
      description: "Resolve comment",
      group: "Comments",
      keys: "x",
      run: (e) => {
        if (!e.repeat) {
          threadActions.resolveActiveThread();
        }
      },
    },
    {
      description: "Expand / collapse comment",
      group: "Comments",
      keys: "z",
      run: threadActions.toggleActiveThread,
    },
    {
      description: "Hide / show resolved threads",
      group: "Comments",
      keys: "shift+z",
      run: (e) => {
        if (!e.repeat) {
          toggleHideResolved();
        }
      },
    },
    {
      description: "Comment on the line under cursor",
      group: "Comments",
      keys: "c",
      run: nav.commentAtCursor,
    },
    {
      description: "Sign region under cursor",
      group: "Session",
      keys: "r",
      run: sign,
    },
    {
      description: "Toggle file viewed",
      group: "Files",
      keys: "v",
      run: () => {
        if (cursor) {
          toggleViewedAt(cursor.fileIndex);
        }
      },
    },
    {
      description: "Mark viewed & next",
      group: "Files",
      keys: "e",
      run: markViewedAndNext,
    },
    {
      description: "Expand full file",
      group: "Files",
      keys: "shift+v",
      run: () => toggleExpandHeld(activeIndexRef.current),
    },
    {
      description: "Toggle file tree",
      group: "Files",
      keys: "mod+b",
      run: panels.onToggleSidebar,
    },
    {
      description: "Toggle info panel",
      global: true,
      group: "Session",
      keys: "mod+i",
      run: panels.onToggleRightPanel,
    },
    {
      description: "Copy group link",
      group: "Session",
      keys: "y",
      run: copyGroupLink,
    },
    {
      description: "Copy file path",
      group: "Files",
      keys: "mod+shift+c",
      run: () => callbacks.onCopyPath(activeIndexRef.current),
    },
    {
      description: "Find in session",
      group: "Session",
      keys: "mod+f",
      run: () => find.openFind(),
    },
    ...(find.findOpen
      ? [
          {
            description: "Next match",
            hidden: true,
            keys: ["enter", "f3"],
            run: (e: KeyboardEvent) =>
              e.shiftKey ? find.onFindPrev() : find.onFindNext(),
          },
          {
            description: "Next match",
            hidden: true,
            keys: "mod+g",
            run: (e: KeyboardEvent) =>
              e.shiftKey ? find.onFindPrev() : find.onFindNext(),
          },
        ]
      : []),
    {
      description: "Approve the topic",
      group: "Session",
      keys: "a",
      run: approve,
    },
    {
      description: "Back to the queue",
      group: "Session",
      keys: "esc",
      run: () => {
        if (find.findOpen) {
          find.closeFind();
        } else if (panels.sidebarOverlayOpenRef.current) {
          panels.onCloseSidebar();
        } else if (panels.rightOpenRef.current) {
          panels.setRightOpen(false);
        } else {
          onExit();
        }
      },
    },
  ]);

  const baseline = sessionFiles.find((f) => f.baseline)?.baseline ?? null;
  const rootComments = commentList.filter((c) => c.inReplyToId === null);
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  const storyGroup = status.data
    ? groupQueueByProvenance(status.data.queue).groups.find(
        (g) => g.key === group.label
      )
    : undefined;
  const description =
    storyGroup && status.data ? topicStory(storyGroup, status.data) : "";

  const approvalReviews: DrawerReview[] = approval
    ? [
        {
          body: "",
          id: 1,
          state: "APPROVED",
          submittedAt: approval.atTime,
          user: approval.actor.id,
          userAvatarUrl: actorAvatarUrl(approval.actor),
        },
      ]
    : [];

  const body = () => {
    if (targets.length === 0 || files.length === 0) {
      return (
        <div className="min-h-0 flex-1">
          <InboxZero
            hint="esc returns to the queue."
            title="Session signed off"
          />
        </div>
      );
    }
    return (
      <ReviewDiffPane
        addPending={false}
        askDraft={null}
        askNote={null}
        baseSha={baseline?.sha ?? ""}
        capabilities={CAPABILITIES}
        changedSinceViewed={EMPTY_SET}
        changeFindQuery={find.changeFindQuery}
        clampedIndex={clampedIndex}
        closeFind={find.closeFind}
        copiedPathIndex={copiedPathIndex}
        dragging={false}
        editingPending={null}
        editReq={null}
        expandedNames={expandedNames}
        expandingNames={expandingNames}
        fileCount={files.length}
        files={files}
        findCase={find.findCase}
        findCurrent={find.findCurrent}
        findFocusSeq={find.findFocusSeq}
        findMatches={find.findMatches}
        findOpen={find.findOpen}
        findQuery={find.findQuery}
        findSafeIndex={find.findSafeIndex}
        flashKey={flashKey}
        headSha={tip}
        hiddenResolved={visibleThreads?.hiddenByPath}
        initialMem={undefined}
        inputMode={inputMode}
        listCallbacks={callbacks}
        listRef={listRef}
        liveCursor={cursor}
        liveSelection={null}
        marks={marks}
        model={model}
        onFindNext={find.onFindNext}
        onFindPrev={find.onFindPrev}
        owner={owner}
        replyPending={false}
        replyReq={replyReq}
        repo={name}
        rulerFractions={rulerFractions}
        toggleFindCase={find.toggleFindCase}
        toggleReq={toggleReq}
        viewedSet={viewedSet}
      />
    );
  };

  // targets empty = everything signed: the query is disabled (isPending by
  // definition) and the frame's signed-off state owns the screen instead.
  if (targets.length > 0 && (session.isPending || session.error)) {
    // The review screen's own cold state — skeleton shell or error face —
    // replacing the whole surface, exactly as opening a PR does.
    return (
      <div className="dir-quiet flex h-full min-h-0 flex-col">
        <ReviewScreenPending
          backLabel="Back to the queue"
          error={session.error ? String(session.error) : ""}
          errorTitle="Couldn't derive this session"
          isError={Boolean(session.error)}
          onBack={onExit}
          pr={null}
        />
      </div>
    );
  }

  return (
    // The review screen's exact frame — full-height file tree beside a main
    // column whose header is the review screen's own ReviewHeader with
    // topic data: the topic is the title, the group's sole author wears the
    // PR header's avatar slot, baseline→tip shas ride the branch chips
    // (copyable like branches), a standing approval shows as the verdict
    // pill, and Approve stands where submit stands. The info button opens
    // the same RightDock + PrDrawer the PR surface docks, with the topic's
    // story as the description and the session's threads as the discussion.
    <div className="dir-quiet relative flex h-full min-h-0 overflow-hidden">
      <FileTreeColumn
        changed={EMPTY_SET}
        comments={commentList}
        compact={panels.sidebarCompact}
        files={files}
        onResize={panels.onSidebarResize}
        onSelect={(i) => {
          nav.scrollToFile(i);
          panels.closeSidebarOverlay();
        }}
        open={panels.sidebarOpen}
        pending={EMPTY_PENDING_LIST}
        prKeyValue={viewedKey}
        selectedIndex={clampedIndex}
        width={panels.sidebarWidth}
      />
      <button
        aria-hidden={!panels.sidebarOverlayOpen}
        aria-label="Close file tree"
        className={cn(
          "qf-sidebar-scrim",
          panels.sidebarOverlayOpen && "qf-sidebar-scrim-open"
        )}
        onClick={panels.onCloseSidebar}
        tabIndex={-1}
        type="button"
      />

      <main className="qf-main flex min-w-0 flex-1 flex-col">
        <ReviewHeader
          approved={approval ? [{ user: approval.actor.id }] : undefined}
          convoCount={rootComments.length}
          onCopyBranch={copyTextToClipboard}
          onOpenSubmit={approve}
          onOpenTicket={noop}
          onToggleRightPanel={panels.onToggleRightPanel}
          onToggleSidebar={panels.onToggleSidebar}
          pr={{
            author,
            authorAvatarUrl,
            baseRef: baseline ? shortSha(baseline.sha) : undefined,
            draft: false,
            headRef: baseline ? shortSha(tip) : undefined,
            merged: false,
            number,
            repo: repoKey,
            state: "open",
            title: group.label,
          }}
          rightOpen={panels.rightOpen}
          showSidebarToggle={panels.sidebarCompact || !panels.sidebarOpen}
          sidebarOpen={panels.sidebarOpen}
          submitCombo="a"
          submitLabel="Approve"
        />
        {body()}
      </main>

      <RightDock
        activeTab="info"
        onClose={panels.onCloseRightPanel}
        onFocusExit={focusScrollHost}
        onResize={panels.onDockResize}
        onSelectTab={panels.onSelectRightTab}
        open={panels.rightOpen}
        overlay={panels.sidebarCompact}
        tabs={INFO_TABS}
        width={panels.dockWidth}
      >
        <div className="qf-dock-tabpane">
          <PrDrawer
            addCommentPending={false}
            callbacks={{
              onAddComment: asyncNoop,
              onClose: panels.onCloseRightPanel,
              onDeleteComment: asyncNoop,
              onEditComment: asyncNoop,
              onJumpToThread: threadActions.jumpToThread,
              onOpenCiUrl: noop,
              onOpenPr: noop,
              onOpenTicket: noop,
            }}
            conversation={[]}
            fileCount={files.length}
            frameless
            inlineComments={commentList}
            open={panels.rightOpen}
            openLabel=""
            ownLogin={ownLogin}
            pr={{
              additions,
              author,
              authorAvatarUrl,
              body: description,
              deletions,
              number,
              title: group.label,
              updatedAt,
            }}
            renderMarkdown={(text) => (
              <Markdown owner={owner} repo={name}>
                {text}
              </Markdown>
            )}
            reviews={approvalReviews}
            showComposer={false}
          />
        </div>
      </RightDock>
    </div>
  );
}
