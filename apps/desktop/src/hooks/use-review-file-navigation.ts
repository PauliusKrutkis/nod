/**
 * File-level navigation for the review pane. `scrollToFile` is the single
 * entry point every file jump routes through — `e`, `r`/`t`, Tab, the
 * sidebar, and the file search all call it. It also seeds the line cursor on
 * the target file's first nav row, because everything the cursor drives
 * afterwards (`f`/`g`, `j`/`k`, `c`, selection) steps from wherever the
 * cursor is, and leaving it on the file just left makes those keys act on
 * the wrong file. Files with no nav rows (image, binary, fully collapsed)
 * keep the previous cursor rather than clearing it.
 *
 * useReviewResumeScroll restores the saved scroll position once the model
 * that contains it has been built, corrected once against the real row
 * offsets.
 */

import type React from "react";
import { useEffect, useRef } from "react";
import type {
  ReviewListCallbacks,
  ReviewListHandle,
} from "../components/review/review-list.tsx";
import type { OccState } from "../lib/code-dom.ts";
import { usePerfStore } from "../lib/perf.ts";
import {
  buildCursorMover,
  type CursorPos,
  commentAtCursorPos,
  extendExistingSelection,
  type LineSelection,
  type resolveLiveSelection,
  startSelectionFromCursor,
} from "../lib/review-cursor.ts";
import {
  clampFastStep,
  fileAnchorKey,
  navKey,
  type ReviewListModel,
} from "../lib/review-items.ts";
import type { getReviewMemory } from "../lib/review-memory.ts";
import {
  markKeyboardNavigation,
  syncActiveIndexRef,
} from "./use-review-list-callbacks.ts";

const FAST_CURSOR_STEP = 5;

export function useReviewResumeScroll(args: {
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
export function useReviewFileNavigation(args: {
  activeIndexRef: React.RefObject<number>;
  cursorMoverRefs: Parameters<typeof buildCursorMover>[0];
  cursorRef: React.RefObject<CursorPos | null>;
  fileCountRef: React.RefObject<number>;
  keyboardHoldRef: React.RefObject<boolean>;
  listCallbacks: Pick<ReviewListCallbacks, "onOpenBox" | "onCloseBox">;
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
