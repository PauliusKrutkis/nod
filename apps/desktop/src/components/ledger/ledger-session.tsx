/**
 * A ledger session (docs/LEDGER.md §6 screen 2): one provenance group's
 * queued files rendered through the same diff surface as a PR review — the
 * session *is* the net diff since the last signature. Forge-only affordances
 * are absent via the list's `capabilities` seam (no blob expansion, no
 * staging); the verbs are `r` (sign the region under the cursor), `c`
 * (start a comment thread — a fact, posted immediately), `v`/`a` (viewed /
 * approve). Threads render inline exactly like PR comments, positioned by
 * their anchors on tip.
 *
 * The container owns the same cursor slice the review screen keeps —
 * mover refs, input mode, flash — because the surface underneath is the
 * same list with the same keyboard feel. Signing invalidates the status
 * query so the queue and coverage are fresh on esc.
 */
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { Spinner } from "@nod/ui/spinner";
import { useLatest } from "@nod/ui/use-latest";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReviewFind } from "../../hooks/use-review-find.ts";
import { isRealPointer } from "../../hooks/use-review-list-callbacks.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import type { DiffRow } from "../../lib/diff.ts";
import {
  initialAnchorFor,
  ledgerCommentsToReview,
  regionAtCursor,
  sessionToChangedFiles,
} from "../../lib/ledger-session.ts";
import { queryKeys } from "../../lib/query-client.ts";
import { buildCursorMover, type CursorPos } from "../../lib/review-cursor.ts";
import { resolveMarks, resolveRulerFractions } from "../../lib/review-find.ts";
import {
  buildReviewItems,
  fileAnchorKey,
  type ReviewListModel,
} from "../../lib/review-items.ts";
import { fingerprintFile } from "../../lib/viewed-fingerprint.ts";
import { useAppStore } from "../../store/app-store.ts";
import type { PendingComment } from "../../types.ts";
import { FileSidebarLoader } from "../review/file-sidebar-loader.tsx";
import { ReviewDiffPane } from "../review/review-diff-pane.tsx";
import type {
  ReviewListCallbacks,
  ReviewListHandle,
} from "../review/review-list.tsx";

const EMPTY_PENDING: ReadonlyMap<string, PendingComment[]> = new Map();
const EMPTY_ROWS: ReadonlyMap<number, readonly DiffRow[]> = new Map();
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_PENDING_LIST: PendingComment[] = [];
const EMPTY_OCC: never[] = [];
/**
 * Comments are live — they post ledger facts immediately, so staging (a
 * forge-review concept) is off and the composer's one action is "Comment".
 * Forge blob expansion stays absent; there is no forge.
 */
const CAPABILITIES = {
  comment: true,
  expand: false,
  stage: false,
  viewed: true,
};
const notImage = () => false;
/** Pending/staging affordances stay inert — facts post now or not at all. */
const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

// react-doctor-disable-next-line no-giant-component -- what is left after the sub-views moved out is state wiring: 27 hooks feeding one ReviewDiffPane that takes 45 props, so an extraction would thread every one of them through a new interface and read worse, not better. Same call as review-screen.tsx; BACKLOG § Tech debt records it
export function LedgerSession({
  group,
  initialTarget,
  onExit,
  onSigned,
  repoPath,
  targets,
}: {
  group: { label: string; subject: string };
  initialTarget: string;
  onExit: () => void;
  onSigned: (target: string) => void;
  repoPath: string;
  targets: string[];
}) {
  const setToast = useAppStore((s) => s.setToast);
  const setLedgerSessionOpen = useAppStore((s) => s.setLedgerSessionOpen);
  const viewedKey = `ledger:${repoPath}`;
  const viewedFiles = useAppStore((s) => s.viewed[viewedKey]);
  const toggleViewed = useAppStore((s) => s.toggleViewed);
  const queryClient = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    setLedgerSessionOpen(true);
    return () => {
      setLedgerSessionOpen(false);
    };
  }, [setLedgerSessionOpen]);

  const session = useQuery({
    enabled: targets.length > 0,
    queryFn: () => api.ledgerSession(repoPath, targets),
    queryKey: queryKeys.ledgerSession(repoPath, targets),
  });

  const tip = session.data?.tip ?? "";
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

  // A file counts as viewed only while its content fingerprint still
  // matches — a new tip that changed the patch clears the mark, so the
  // approve gate can never be satisfied by stale reading.
  const viewedSet = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) {
      if (viewedFiles?.[file.filename] === fingerprintFile(file, tip)) {
        set.add(file.filename);
      }
    }
    return set;
  }, [files, tip, viewedFiles]);
  const allViewed = files.length > 0 && viewedSet.size === files.length;

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

  const model: ReviewListModel = useMemo(
    () =>
      buildReviewItems({
        ask: null,
        collapsed,
        commentsByFile: threadMaps.byFile,
        expandedRows: EMPTY_ROWS,
        files,
        isImage: notImage,
        openBoxes,
        pendingByFile: EMPTY_PENDING,
      }),
    [collapsed, files, openBoxes, threadMaps]
  );
  const modelRef = useLatest(model);
  const filesRef = useLatest(files);
  useInsertionEffect(() => {
    cursorRef.current = cursor;
  });

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
    rowsByFile: EMPTY_ROWS,
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

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.ledger(repoPath),
      }),
      queryClient.invalidateQueries({
        queryKey: ["ledger-session", repoPath],
      }),
    ]);

  const approve = async () => {
    if (!allViewed || approving || signing) {
      return;
    }
    setApproving(true);
    try {
      await api.ledgerApprove(repoPath, group.label);
      await refresh();
      setToast({
        message: `${group.label} at ${shortSha(tip)}`,
        title: "Topic approved",
      });
      onExit();
    } catch (e) {
      setToast({ message: String(e), title: "Approval failed" });
    }
    setApproving(false);
  };

  const sign = async () => {
    if (!current || signing) {
      return;
    }
    setSigning(true);
    try {
      await api.ledgerReview(repoPath, current.target);
      await refresh();
      setToast({ message: current.target, title: "Region signed" });
      onSigned(current.target);
    } catch (e) {
      setToast({ message: String(e), title: "Signing failed" });
    }
    setSigning(false);
  };

  const scrollPage = (dir: 1 | -1) => {
    const scroller = listRef.current?.scroller();
    scroller?.scrollBy({ top: dir * 0.85 * scroller.clientHeight });
  };

  const jumpToFile = (i: number) => {
    if (files.length === 0) {
      return;
    }
    const target = Math.min(Math.max(i, 0), files.length - 1);
    setActiveIndex(target);
    activeIndexRef.current = target;
    listRef.current?.scrollToFileStart(target);
    const entry = model.nav.find(
      (n) => n.fileIndex === target && n.kind === "row"
    );
    if (entry) {
      placeCursor(entry.fileIndex, entry.anchor);
    }
  };

  const openBoxAt = (fileIndex: number, anchor: string, startLine?: number) => {
    setOpenBoxes((cur) =>
      new Map(cur).set(fileAnchorKey(fileIndex, anchor), startLine ?? null)
    );
  };

  const callbacks: ReviewListCallbacks = {
    onAddComment: async ({ path, line, side, body, startLine }) => {
      if (side !== "RIGHT") {
        setToast({
          message: "Only code on tip can carry a thread.",
          title: "Cannot comment here",
        });
        return;
      }
      try {
        await api.ledgerComment(
          repoPath,
          `${path}:${startLine ?? line}-${line}`,
          body
        );
        await refresh();
      } catch (e) {
        setToast({ message: String(e), title: "Comment failed" });
      }
    },
    onAddPending: noop,
    onPostPendingNow: asyncNoop,
    onCloseBox: (fileIndex, anchor) => {
      setOpenBoxes((cur) => {
        const next = new Map(cur);
        next.delete(fileAnchorKey(fileIndex, anchor));
        return next;
      });
    },
    onEditPending: noop,
    onPendingHover: noop,
    onUpdatePending: noop,
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
    onEditComment: asyncNoop,
    onMouseMove: (x, y) => {
      isRealPointer(x, y, keyboardHoldRef, lastPointRef);
    },
    onOpenBox: openBoxAt,
    onPlusDragEnd: noop,
    onPlusDragOver: noop,
    onPlusDragStart: noop,
    onRemovePending: noop,
    onReply: async ({ inReplyTo, body }) => {
      const parent = threadMaps.factIdOf.get(inReplyTo);
      if (!parent) {
        return;
      }
      try {
        await api.ledgerComment(repoPath, "", body, parent);
        await refresh();
      } catch (e) {
        setToast({ message: String(e), title: "Reply failed" });
      }
    },
    onResolveThread: ({ threadId, resolved }) => {
      if (!resolved) {
        setToast({
          message: "The fact log is append-only; resolution stands.",
          title: "Cannot unresolve",
        });
        return;
      }
      api
        .ledgerResolve(repoPath, threadId)
        .then(refresh)
        .catch((e) =>
          setToast({ message: String(e), title: "Resolve failed" })
        );
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
    onToggleExpand: noop,
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
      description: "Page down",
      group: "Session",
      hidden: true,
      keys: ["space", "pagedown"],
      run: () => scrollPage(1),
    },
    {
      description: "Page up",
      group: "Session",
      hidden: true,
      keys: ["shift+space", "pageup"],
      run: () => scrollPage(-1),
    },
    {
      description: "Find in session",
      group: "Session",
      keys: "mod+f",
      run: () => find.openFind(),
    },
    {
      description: "Next match",
      group: "Session",
      hidden: !find.findOpen,
      keys: ["f3", "mod+g"],
      run: () => find.onFindNext(),
    },
    {
      description: "Sign region under cursor",
      group: "Session",
      keys: "r",
      run: sign,
    },
    {
      description: "Comment on the line under cursor",
      group: "Session",
      keys: "c",
      run: () => {
        if (cursor) {
          openBoxAt(cursor.fileIndex, cursor.anchor);
        }
      },
    },
    {
      description: "Toggle file viewed",
      group: "Session",
      keys: "v",
      run: () => {
        if (cursor) {
          toggleViewedAt(cursor.fileIndex);
        }
      },
    },
    {
      description: "Approve the topic (view every file first)",
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
        } else {
          onExit();
        }
      },
    },
  ]);

  const clampedIndex = Math.max(0, Math.min(activeIndex, files.length - 1));
  const baseline = sessionFiles.find((f) => f.baseline)?.baseline ?? null;

  const body = () => {
    if (targets.length === 0) {
      return (
        <div className="min-h-0 flex-1">
          <InboxZero
            hint="esc returns to the queue."
            title="Session signed off"
          />
        </div>
      );
    }
    if (session.isPending) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner label="Deriving session diff from git…" />
        </div>
      );
    }
    if (session.error) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8">
          <p className="max-w-lg text-danger text-sm">
            {String(session.error)}
          </p>
        </div>
      );
    }
    if (files.length === 0) {
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
        expandedNames={EMPTY_SET}
        expandingNames={EMPTY_SET}
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
        owner=""
        replyPending={false}
        replyReq={null}
        repo=""
        rulerFractions={rulerFractions}
        toggleFindCase={find.toggleFindCase}
        toggleReq={null}
        viewedSet={viewedSet}
      />
    );
  };

  return (
    <div className="dir-quiet flex h-full min-h-0 flex-col">
      <header className="flex items-baseline gap-3 border-line border-b px-6 py-3">
        <span className="shrink-0 font-medium text-accent">{group.label}</span>
        <span className="truncate text-muted text-sm">{group.subject}</span>
        <span className="ml-auto shrink-0 text-faint text-xs">
          {baseline
            ? `since ${shortSha(baseline.sha)} → tip ${shortSha(tip)}`
            : "no prior signature — everything here is new"}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {files.length > 1 && (
          <aside
            className={cn(
              "qf-sidebar-col",
              "qf-sidebar-inline",
              "qf-sidebar-open"
            )}
          >
            <FileSidebarLoader
              changed={EMPTY_SET}
              comments={commentList}
              files={files}
              onSelect={jumpToFile}
              pending={EMPTY_PENDING_LIST}
              prKeyValue={`ledger:${repoPath}`}
              selectedIndex={clampedIndex}
            />
          </aside>
        )}
        {body()}
      </div>

      <footer className="flex items-center gap-5 border-line border-t px-6 py-2 text-faint text-xs">
        <span>
          <Kbd combo="j" /> / <Kbd combo="k" /> move
        </span>
        <span>
          <Kbd combo="r" /> sign{" "}
          {current
            ? `${current.target} · ${current.region.endLine - current.region.startLine + 1} lines`
            : ""}
        </span>
        <span>
          <Kbd combo="c" /> comment
        </span>
        <span>
          <Kbd combo="v" /> viewed ({viewedSet.size}/{files.length})
        </span>
        <span className={allViewed ? "text-fg" : undefined}>
          <Kbd combo="a" /> approve {group.label}
          {allViewed ? "" : " — view every file first"}
        </span>
        <span>
          <Kbd combo="mod+f" /> find
        </span>
        <span>
          <Kbd combo="esc" /> queue
        </span>
      </footer>
    </div>
  );
}
