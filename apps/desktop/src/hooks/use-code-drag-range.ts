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
 * The range follows the text selection in both directions: a click that
 * collapses the selection clears the range too, so there is never a run of
 * highlighted rows left over from a drag you have since clicked away from.
 */

import type React from "react";
import { useEffect } from "react";
import {
  collectSelectedRowAnchors,
  rangeFromAnchors,
} from "../lib/drag-range.ts";
import type { CursorPos, LineSelection } from "../lib/review-cursor.ts";
import type { ReviewListModel } from "../lib/review-items.ts";

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
    let frame = 0;

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
      setActiveIndex(range.fileIndex);
      activeIndexRef.current = range.fileIndex;
      setCursor({ anchor: range.to, fileIndex: range.fileIndex, kind: "row" });
      setSelection(range);
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = (e.target as HTMLElement | null)?.closest(".qf-code") !== null;
    };

    const onPointerMove = () => {
      if (dragging && !frame) {
        frame = requestAnimationFrame(apply);
      }
    };

    const onPointerUp = () => {
      dragging = false;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        // A plain click collapses the text selection; the row range it armed
        // goes with it, so the two never disagree about what is selected.
        setSelection((current) => (current === null ? current : null));
        return;
      }
      apply();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeIndexRef, modelRef, setActiveIndex, setCursor, setSelection]);
}
