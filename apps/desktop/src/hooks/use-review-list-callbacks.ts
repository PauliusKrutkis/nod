/**
 * The callback bundle handed to ReviewList: pointer-aware cursor placement,
 * gutter plus-drag range building, thread hover arming, open-composer
 * bookkeeping and copy-path — plus the small pointer/keyboard helpers the
 * file-navigation path shares (isRealPointer, markKeyboardNavigation,
 * syncActiveIndexRef).
 *
 * `activeThreadRef` — the thread `r`/`x`/`z`/`shift+e` act on — is written by
 * both hover and the cursor, so mouse-leave cannot simply null it: the cursor
 * may be parked on a comment block, and `q` scrolls threads out from under a
 * stationary pointer, which fires leave events nobody asked for.
 * `reviewListOnThreadHover` therefore falls back to the cursor's own thread
 * (`armedThreadAt`) instead, and only a cursor that is not on a block disarms.
 */

import { useLatest } from "@nod/ui/use-latest";
import type React from "react";
import { useState } from "react";
import type { ReviewListCallbacks } from "../components/review/review-list.tsx";
import { copyTextToClipboard } from "../lib/clipboard.ts";
import type { CursorPos, LineSelection } from "../lib/review-cursor.ts";
import {
  adjacentSelectableAnchor,
  anchorLine,
  armedThreadAt,
  fileAnchorKey,
  navKey,
  type ReviewListModel,
} from "../lib/review-items.ts";
import { fingerprintFile } from "../lib/viewed-fingerprint.ts";
import type { ChangedFile } from "../types.ts";
import type { useCommentMutations } from "./use-comments.ts";

export function isRealPointer(
  x: number,
  y: number,
  keyboardHoldRef: React.RefObject<boolean>,
  lastPointRef: React.RefObject<{ x: number; y: number } | null>
): boolean {
  if (!keyboardHoldRef.current) {
    lastPointRef.current = { x, y };
    return true;
  }
  const last = lastPointRef.current;
  if (!last) {
    lastPointRef.current = { x, y };
    return false;
  }
  if (Math.abs(x - last.x) + Math.abs(y - last.y) > 6) {
    keyboardHoldRef.current = false;
    lastPointRef.current = { x, y };
    return true;
  }
  return false;
}

interface ReviewListCallbackArgs {
  activeThreadRef: React.RefObject<{ rootId: number; path: string } | null>;
  addPendingStore: (
    key: string,
    c: {
      path: string;
      line: number;
      side: string;
      body: string;
      fromAi?: boolean;
      startLine?: number;
    }
  ) => void;
  addReviewComment: ReturnType<typeof useCommentMutations>["addReviewComment"];
  copyTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  cursorRef: React.RefObject<CursorPos | null>;
  deleteReviewComment: ReturnType<
    typeof useCommentMutations
  >["deleteReviewComment"];
  dragRef: React.RefObject<{
    fileIndex: number;
    side: string;
    hunkIndex: number;
    from: string;
  } | null>;
  filesRef: React.RefObject<ChangedFile[]>;
  handleListScroll: () => void;
  headShaRef: React.RefObject<string>;
  isRealPointerAt: (x: number, y: number) => boolean;
  keyboardHoldRef: React.RefObject<boolean>;
  keyValue: string;
  lastPointRef: React.RefObject<{ x: number; y: number } | null>;
  liveSelectionRef: React.RefObject<{
    endItem: number;
    fileIndex: number;
    fromItem: number;
    hunkIndex: number;
    side: string;
    toItem: number;
  } | null>;
  modelRef: React.RefObject<ReviewListModel>;
  pendingBoxNudgeRef: React.RefObject<{
    fileIndex: number;
    anchor: string;
  } | null>;
  removePendingStore: (key: string, id: string) => void;
  toggleExpand: (fileIndex: number) => void;
  reply: ReturnType<typeof useCommentMutations>["reply"];
  requestResolveThread: ReturnType<
    typeof useCommentMutations
  >["requestResolveThread"];
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  dismissReconcileHighlight: (filename: string) => void;
  setCollapsed: React.Dispatch<
    React.SetStateAction<ReadonlyMap<number, ReadonlySet<number>>>
  >;
  setCopiedPathIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  setDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setInputMode: React.Dispatch<React.SetStateAction<"keyboard" | "mouse">>;
  setOpenBoxes: React.Dispatch<
    React.SetStateAction<ReadonlyMap<string, number | null>>
  >;
  setSelection: (s: LineSelection | null) => void;
  toggleViewed: (key: string, filename: string, fingerprint: string) => void;
  updateReviewComment: ReturnType<
    typeof useCommentMutations
  >["updateReviewComment"];
}

function reviewListOnCopyPath(
  args: ReviewListCallbackArgs,
  fileIndex: number
): void {
  const f = args.filesRef.current[fileIndex];
  if (!f) {
    return;
  }
  copyTextToClipboard(f.filename);
  args.setCopiedPathIndex(fileIndex);
  if (args.copyTimerRef.current) {
    clearTimeout(args.copyTimerRef.current);
  }
  args.copyTimerRef.current = setTimeout(
    () => args.setCopiedPathIndex(null),
    1200
  );
}

function reviewListOnPlusDragEnd(
  args: ReviewListCallbackArgs,
  openBox: (fileIndex: number, anchor: string, startLine?: number) => void
): void {
  const d = args.dragRef.current;
  args.dragRef.current = null;
  args.setDragging(false);
  if (!d) {
    return;
  }
  const live = args.liveSelectionRef.current;
  const m = args.modelRef.current;
  if (live && live.fileIndex === d.fileIndex) {
    const endItem = m.items[live.toItem];
    const startItem = m.items[live.fromItem];
    if (
      endItem?.kind === "row" &&
      endItem.anchor &&
      startItem?.kind === "row"
    ) {
      openBox(
        d.fileIndex,
        endItem.anchor,
        anchorLine(startItem.anchor ?? endItem.anchor)
      );
      return;
    }
  }
  openBox(d.fileIndex, d.from);
}

function reviewListOnPlusDragStart(
  args: ReviewListCallbackArgs,
  fileIndex: number,
  anchor: string
): void {
  const m = args.modelRef.current;
  const item =
    m.items[m.anchorItem.get(fileAnchorKey(fileIndex, anchor)) ?? -1];
  if (item?.kind !== "row" || item.target === null) {
    return;
  }
  args.dragRef.current = {
    fileIndex,
    from: anchor,
    hunkIndex: item.hunkIndex,
    side: item.target.side,
  };
  args.setDragging(true);
}

function reviewListOnThreadHover(
  args: ReviewListCallbackArgs,
  t: { rootId: number; path: string } | null
): void {
  if (t) {
    args.activeThreadRef.current = t;
    return;
  }
  const cur = args.cursorRef.current;
  const m = args.modelRef.current;
  const navIdx = cur
    ? m.navIndexOf.get(navKey(cur.fileIndex, cur.anchor, cur.kind))
    : undefined;
  args.activeThreadRef.current =
    navIdx === undefined
      ? null
      : armedThreadAt(m, args.filesRef.current, m.nav[navIdx].itemIndex);
}

export function syncActiveIndexRef(
  activeIndexRef: React.RefObject<number>,
  target: number
): void {
  activeIndexRef.current = target;
}

export function markKeyboardNavigation(args: {
  keyboardHoldRef: React.RefObject<boolean>;
  setInputMode: React.Dispatch<React.SetStateAction<"keyboard" | "mouse">>;
}): void {
  args.keyboardHoldRef.current = true;
  args.setInputMode("keyboard");
}

function reviewListOnOpenBox(
  args: ReviewListCallbackArgs,
  fileIndex: number,
  anchor: string,
  startLine?: number
): void {
  args.pendingBoxNudgeRef.current = { anchor, fileIndex };
  args.setOpenBoxes((prev) =>
    new Map(prev).set(fileAnchorKey(fileIndex, anchor), startLine ?? null)
  );
}

function reviewListOnPlusDragOver(
  args: ReviewListCallbackArgs,
  fileIndex: number,
  anchor: string
): void {
  const d = args.dragRef.current;
  if (!d || fileIndex !== d.fileIndex) {
    return;
  }
  args.setCursor({ anchor, fileIndex, kind: "row" });
  if (anchor === d.from) {
    args.setSelection(null);
    return;
  }

  const m = args.modelRef.current;
  const fromIdx = m.navIndexOf.get(fileAnchorKey(fileIndex, d.from));
  const toIdx = m.navIndexOf.get(fileAnchorKey(fileIndex, anchor));
  if (fromIdx === undefined || toIdx === undefined) {
    return;
  }
  const delta = toIdx > fromIdx ? (1 as const) : (-1 as const);
  let last = d.from;
  while (last !== anchor) {
    const next = adjacentSelectableAnchor(
      m,
      d.fileIndex,
      d.side,
      d.hunkIndex,
      last,
      delta
    );
    if (!next) {
      break;
    }
    last = next;
  }
  if (last === d.from) {
    args.setSelection(null);
    return;
  }
  args.setSelection({
    fileIndex: d.fileIndex,
    from: d.from,
    hunkIndex: d.hunkIndex,
    side: d.side,
    to: last,
  });
}

type BaseReviewListCallbacks = Omit<
  ReviewListCallbacks,
  "onPendingHover" | "onUpdatePending"
>;

export function useReviewListCallbacks(
  args: ReviewListCallbackArgs
): BaseReviewListCallbacks {
  const cbRef = useLatest({
    async onAddComment(a: {
      path: string;
      line: number;
      side: string;
      body: string;
      startLine?: number;
    }) {
      await args.addReviewComment.mutateAsync({
        body: a.body,
        commitId: args.headShaRef.current,
        line: a.line,
        path: a.path,
        side: a.side,
        startLine: a.startLine,
      });
    },
    onAddPending(c: {
      path: string;
      line: number;
      side: string;
      body: string;
      startLine?: number;
    }) {
      args.addPendingStore(args.keyValue, c);
    },
    onCloseBox(fileIndex: number, anchor: string) {
      args.setSelection(null);
      args.setOpenBoxes((prev) => {
        const next = new Map(prev);
        next.delete(fileAnchorKey(fileIndex, anchor));
        return next;
      });
    },
    onCopyPath(fileIndex: number) {
      reviewListOnCopyPath(args, fileIndex);
    },
    async onDeleteComment(a: { commentId: number }) {
      await args.deleteReviewComment.mutateAsync(a);
    },
    async onEditComment(a: { commentId: number; body: string }) {
      await args.updateReviewComment.mutateAsync(a);
    },
    onMouseMove(x: number, y: number) {
      if (!args.isRealPointerAt(x, y)) {
        return;
      }
      args.setInputMode((mo) => (mo === "mouse" ? mo : "mouse"));
    },
    onOpenBox(fileIndex: number, anchor: string, startLine?: number) {
      reviewListOnOpenBox(args, fileIndex, anchor, startLine);
    },
    onPlusDragEnd() {
      reviewListOnPlusDragEnd(args, (fi, a, sl) =>
        cbRef.current.onOpenBox(fi, a, sl)
      );
    },
    onPlusDragOver(fileIndex: number, anchor: string) {
      reviewListOnPlusDragOver(args, fileIndex, anchor);
    },
    onPlusDragStart(fileIndex: number, anchor: string) {
      reviewListOnPlusDragStart(args, fileIndex, anchor);
    },
    onRemovePending(id: string) {
      args.removePendingStore(args.keyValue, id);
    },
    async onReply(a: { inReplyTo: number; body: string }) {
      await args.reply.mutateAsync(a);
    },
    onResolveThread(a: { threadId: string; resolved: boolean }) {
      args.requestResolveThread(a);
    },
    onRowEnter(fileIndex: number, anchor: string, x: number, y: number) {
      if (!args.isRealPointerAt(x, y)) {
        return;
      }
      args.setInputMode((mo: "keyboard" | "mouse") =>
        mo === "mouse" ? mo : "mouse"
      );
      args.setCursor((cur: CursorPos | null) =>
        cur &&
        cur.fileIndex === fileIndex &&
        cur.anchor === anchor &&
        cur.kind === "row"
          ? cur
          : { anchor, fileIndex, kind: "row" }
      );
      args.setActiveIndex((cur) => (cur === fileIndex ? cur : fileIndex));
    },
    onScroll() {
      args.handleListScroll();
    },
    onThreadHover(t: { rootId: number; path: string } | null) {
      reviewListOnThreadHover(args, t);
    },
    onToggleExpand(fileIndex: number) {
      args.toggleExpand(fileIndex);
    },
    onToggleHunk(fileIndex: number, hunkIndex: number) {
      args.setCollapsed((prev) => {
        const next = new Map(prev);
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
    onToggleViewed(fileIndex: number) {
      const f = args.filesRef.current[fileIndex];
      if (!f) {
        return;
      }
      args.toggleViewed(
        args.keyValue,
        f.filename,
        fingerprintFile(f, args.headShaRef.current)
      );
      args.dismissReconcileHighlight(f.filename);
    },
  });

  const [listCallbacks] = useState<BaseReviewListCallbacks>(() => {
    const r = cbRef;
    return {
      onAddComment: (...a) => r.current.onAddComment(...a),
      onAddPending: (...a) => r.current.onAddPending(...a),
      onCloseBox: (...a) => r.current.onCloseBox(...a),
      onCopyPath: (...a) => r.current.onCopyPath(...a),
      onDeleteComment: (...a) => r.current.onDeleteComment(...a),
      onEditComment: (...a) => r.current.onEditComment(...a),
      onMouseMove: (...a) => r.current.onMouseMove(...a),
      onOpenBox: (...a) => r.current.onOpenBox(...a),
      onPlusDragEnd: () => r.current.onPlusDragEnd(),
      onPlusDragOver: (...a) => r.current.onPlusDragOver(...a),
      onPlusDragStart: (...a) => r.current.onPlusDragStart(...a),
      onRemovePending: (...a) => r.current.onRemovePending(...a),
      onReply: (...a) => r.current.onReply(...a),
      onResolveThread: (...a) => r.current.onResolveThread(...a),
      onRowEnter: (...a) => r.current.onRowEnter(...a),
      onScroll: () => r.current.onScroll(),
      onThreadHover: (...a) => r.current.onThreadHover(...a),
      onToggleExpand: (...a) => r.current.onToggleExpand(...a),
      onToggleHunk: (...a) => r.current.onToggleHunk(...a),
      onToggleViewed: (...a) => r.current.onToggleViewed(...a),
    };
  });

  return listCallbacks;
}
