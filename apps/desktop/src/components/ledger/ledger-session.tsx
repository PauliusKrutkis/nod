/**
 * A ledger session (docs/LEDGER.md §6 screen 2): one provenance group's
 * queued files rendered through the same diff surface as a PR review — the
 * session *is* the net diff since the last signature. PR-only affordances
 * are absent via the list's `capabilities` seam (no comments, no forge blob
 * expansion, no viewed state); the only verb here is `r`, which signs the
 * region under the cursor and shrinks the session.
 *
 * The container owns the same cursor slice the review screen keeps —
 * mover refs, input mode, flash — because the surface underneath is the
 * same list with the same keyboard feel. Signing invalidates the status
 * query so the queue and coverage are fresh on esc.
 */
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { Spinner } from "@nod/ui/spinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReviewFind } from "../../hooks/use-review-find.ts";
import { isRealPointer } from "../../hooks/use-review-list-callbacks.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import type { DiffRow } from "../../lib/diff.ts";
import {
  initialAnchorFor,
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
import { useAppStore } from "../../store/app-store.ts";
import type {
  ChangedFile,
  PendingComment,
  ReviewComment,
} from "../../types.ts";
import { FileSidebarLoader } from "../review/file-sidebar-loader.tsx";
import { ReviewDiffPane } from "../review/review-diff-pane.tsx";
import type {
  ReviewListCallbacks,
  ReviewListHandle,
} from "../review/review-list.tsx";

const EMPTY_COMMENTS: ReadonlyMap<string, ReviewComment[]> = new Map();
const EMPTY_PENDING: ReadonlyMap<string, PendingComment[]> = new Map();
const EMPTY_BOXES: ReadonlyMap<string, number | null> = new Map();
const EMPTY_ROWS: ReadonlyMap<number, readonly DiffRow[]> = new Map();
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_COMMENT_LIST: ReviewComment[] = [];
const EMPTY_PENDING_LIST: PendingComment[] = [];
const EMPTY_OCC: never[] = [];
const NO_CAPABILITIES = { comment: false, expand: false, viewed: false };
const notImage = () => false;
/** The session offers no comment/viewed affordances; their callbacks are inert. */
const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

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
  const queryClient = useQueryClient();
  const [signing, setSigning] = useState(false);

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

  // ---- cursor slice, mirroring the review screen's ---------------------
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [inputMode, setInputMode] = useState<"keyboard" | "mouse">("keyboard");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [copiedPathIndex, setCopiedPathIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<
    ReadonlyMap<number, ReadonlySet<number>>
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
        commentsByFile: EMPTY_COMMENTS,
        expandedRows: EMPTY_ROWS,
        files,
        isImage: notImage,
        openBoxes: EMPTY_BOXES,
        pendingByFile: EMPTY_PENDING,
      }),
    [collapsed, files]
  );
  const modelRef = useRef(model);
  modelRef.current = model;
  const filesRef = useRef<ChangedFile[]>(files);
  filesRef.current = files;
  cursorRef.current = cursor;

  const mover = buildCursorMover({
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
  });

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

  const sign = async () => {
    if (!current || signing) {
      return;
    }
    setSigning(true);
    try {
      await api.ledgerReview(repoPath, current.target);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.ledger(repoPath),
        }),
        queryClient.invalidateQueries({
          queryKey: ["ledger-session", repoPath],
        }),
      ]);
      setToast({ message: current.target, title: "Region signed" });
      onSigned(current.target);
    } catch (e) {
      setToast({ message: String(e), title: "Signing failed" });
    } finally {
      setSigning(false);
    }
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

  const callbacks: ReviewListCallbacks = {
    onAddComment: asyncNoop,
    onAddPending: noop,
    onCloseBox: noop,
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
    onOpenBox: noop,
    onPlusDragEnd: noop,
    onPlusDragOver: noop,
    onPlusDragStart: noop,
    onRemovePending: noop,
    onReply: asyncNoop,
    onResolveThread: noop,
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
    onToggleViewed: noop,
  };

  useHotkeys("ledger-session", [
    {
      description: "Next line",
      group: "Session",
      keys: ["j", "down"],
      run: (e) => mover.move(1, e.repeat),
    },
    {
      description: "Previous line",
      group: "Session",
      keys: ["k", "up"],
      run: (e) => mover.move(-1, e.repeat),
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
        capabilities={NO_CAPABILITIES}
        changedSinceViewed={EMPTY_SET}
        changeFindQuery={find.changeFindQuery}
        clampedIndex={clampedIndex}
        closeFind={find.closeFind}
        copiedPathIndex={copiedPathIndex}
        dragging={false}
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
        viewedSet={EMPTY_SET}
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
              comments={EMPTY_COMMENT_LIST}
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
          <Kbd combo="mod+f" /> find
        </span>
        <span>
          <Kbd combo="esc" /> queue
        </span>
      </footer>
    </div>
  );
}
