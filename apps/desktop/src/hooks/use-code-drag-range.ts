/**
 * Arms the drag-over-code range (lib/drag-range.ts) while the pointer moves,
 * and settles it on release. Computing it only at the end read as a lag: you
 * sweep three rows, nothing happens, you let go and the range appears — so
 * the gesture never felt like it was doing anything. The walk runs at most
 * once per animation frame, which is the same budget the cursor's own moves
 * are held to.
 *
 * Input mode is deliberately left alone. The row wash paints in both modes,
 * so the range is visible immediately; flipping to keyboard mode here would
 * kill the hover highlight under a pointer that has not moved yet.
 *
 * The range follows the text selection in both directions, and the clearing
 * half is the fiddly one. A click that lands INSIDE an existing selection
 * does not collapse it at pointerdown — WebKit holds the old selection until
 * mouseup so the text can be dragged instead — so reading the selection at
 * pointerup saw the run still standing and re-armed the range the click was
 * meant to dismiss. Two things fix it: a press that never moved is treated as
 * a click and clears regardless of what the selection currently says, and a
 * `selectionchange` that collapses a range we armed clears it whenever the
 * browser gets round to it. Keyboard selections are never touched by the
 * second rule — the document selection is collapsed for their whole life, and
 * clearing on that would make `shift+j` impossible.
 */

import type React from "react";
import { useEffect } from "react";
import {
  collectSelectedRowAnchors,
  rangeFromAnchors,
} from "../lib/drag-range.ts";
import type { CursorPos, LineSelection } from "../lib/review-cursor.ts";
import type { ReviewListModel } from "../lib/review-items.ts";

/** How far a pointer may travel and still count as a click. */
const CLICK_SLOP_PX = 4;

export function useCodeDragRange(args: {
  activeIndexRef: React.RefObject<number>;
  modelRef: React.RefObject<ReviewListModel>;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  setSelection: React.Dispatch<React.SetStateAction<LineSelection | null>>;
}) {
  const { activeIndexRef, modelRef, setActiveIndex, setCursor, setSelection } =
    args;

  useEffect(() => {
    let dragging = false;
    let armed = false;
    let frame = 0;
    let downAt: { x: number; y: number } | null = null;

    const clear = () => {
      armed = false;
      setSelection((current) => (current === null ? current : null));
    };

    const apply = () => {
      frame = 0;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }
      const range = rangeFromAnchors(
        modelRef.current,
        collectSelectedRowAnchors(selection)
      );
      if (!range) {
        return;
      }
      armed = true;
      setActiveIndex(range.fileIndex);
      activeIndexRef.current = range.fileIndex;
      setCursor({ anchor: range.to, fileIndex: range.fileIndex, kind: "row" });
      setSelection(range);
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = (e.target as HTMLElement | null)?.closest(".qf-code") !== null;
      downAt = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = () => {
      if (dragging && !frame) {
        frame = requestAnimationFrame(apply);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      // A press we never saw the start of (it began outside the window) is
      // not a click, whatever the coordinates say.
      const isClick =
        downAt !== null &&
        Math.abs(e.clientX - downAt.x) <= CLICK_SLOP_PX &&
        Math.abs(e.clientY - downAt.y) <= CLICK_SLOP_PX;
      downAt = null;
      if (isClick) {
        clear();
        return;
      }
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        clear();
        return;
      }
      apply();
    };

    const onSelectionChange = () => {
      if (!armed || dragging) {
        return;
      }
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        clear();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [activeIndexRef, modelRef, setActiveIndex, setCursor, setSelection]);
}
