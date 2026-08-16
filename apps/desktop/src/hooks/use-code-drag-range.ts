/**
 * Arms the drag-over-code range (lib/drag-range.ts) on pointer release. The
 * range is computed once, at the end of the gesture, rather than on every
 * `selectionchange` the drag emits: the browser is already painting the text
 * selection while the pointer moves, so the only moment the row range has to
 * be right is when the pointer lifts — and the anchor walk it needs is not
 * something to run at pointer-move rate.
 *
 * Input mode is deliberately left alone. The row wash paints in both modes,
 * so the range is visible immediately; flipping to keyboard mode here would
 * kill the hover highlight under a pointer that has not moved yet.
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
    const onPointerUp = () => {
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
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [activeIndexRef, modelRef, setActiveIndex, setCursor, setSelection]);
}
