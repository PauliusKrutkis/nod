/**
 * Thread-level actions for the review pane: reply / resolve / edit / toggle
 * on the active (hovered or q-focused) thread, plus the flash-and-land scroll
 * that walks q/w between threads. State arrives as refs and setters; the
 * request objects carry nonces so repeated actions on the same thread re-fire.
 *
 * The pending-comment actions all aim at the same target: the newest pending
 * comment in the block under the cursor. That is the card whose tool strip
 * shows the key hints, so every key acts on the one the reviewer can see them
 * on, and `pendingAtCursor` is exported for the keys the screen owns.
 */
import type React from "react";
import type { ReviewListHandle } from "../components/review/review-list.tsx";
import { usePerfStore } from "../lib/perf.ts";
import type { CursorPos } from "../lib/review-cursor.ts";
import {
  adjacentCommentItem,
  armedThreadAt,
  navKey,
  type ReviewListModel,
} from "../lib/review-items.ts";
import type { ChangedFile, ReviewComment } from "../types.ts";
import type { useCommentMutations } from "./use-comments.ts";

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

export function useReviewThreadActions(args: {
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

  const commentsItemAtCursor = () => {
    const m = args.modelRef.current;
    const cur = args.cursorRef.current;
    if (!cur) {
      return null;
    }
    const navIdx = m.navIndexOf.get(
      navKey(cur.fileIndex, cur.anchor, "comments")
    );
    if (navIdx === undefined) {
      return null;
    }
    const item = m.items[m.nav[navIdx].itemIndex];
    return item?.kind === "comments" ? item : null;
  };

  const pendingAtCursor = () => commentsItemAtCursor()?.pending.at(-1) ?? null;

  const discardPendingAtCursor = () => {
    const cur = args.cursorRef.current;
    const item = commentsItemAtCursor();
    if (!(cur && item)) {
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
    pendingAtCursor,
    jumpToThread,
    replyToActiveThreadOrNextFile,
    resolveActiveThread,
    toggleActiveThread,
  };
}
