/**
 * Drag one vertical edge of a panel to resize it. Both of the review
 * screen's columns are sized this way — the file tree from its right edge,
 * the dock from its left — and they should feel identical, so the mechanics
 * live in one place: the pointer is captured on the grip, the width is
 * written straight to the element's style during the drag (no state, no
 * re-render, no virtualizer churn per frame), and the host is told once on
 * release so it can persist the value.
 *
 * The grip measures from the edge that is NOT moving: dragging the dock's
 * left edge keeps its right edge pinned, and the sidebar's right edge keeps
 * its left. Anything else drifts as the pointer overshoots the clamp.
 */

import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useLatest } from "../use-latest/use-latest.ts";

export interface EdgeResizeOptions {
  /** Which edge the grip sits on — the side the pointer drags. */
  edge: "left" | "right";
  /** Smallest width the panel may be dragged to, in px. */
  min: number;
  /** Largest width, as a fraction of the viewport. */
  maxFraction: number;
  onResize: ((width: number) => void) | undefined;
  panelRef: RefObject<HTMLElement | null>;
}

export function useEdgeResize({
  edge,
  min,
  maxFraction,
  onResize,
  panelRef,
}: EdgeResizeOptions) {
  const onResizeRef = useLatest(onResize);

  return (down: ReactPointerEvent<HTMLElement>) => {
    const el = panelRef.current;
    if (!el) {
      return;
    }
    down.preventDefault();
    const clamp = (width: number) =>
      Math.min(
        Math.max(width, min),
        Math.floor(window.innerWidth * maxFraction)
      );
    const box = el.getBoundingClientRect();
    const pinned = edge === "left" ? box.right : box.left;
    const handle = down.currentTarget;
    handle.setPointerCapture(down.pointerId);
    let latest = box.width;
    const move = (e: PointerEvent) => {
      latest = clamp(edge === "left" ? pinned - e.clientX : e.clientX - pinned);
      el.style.width = `${latest}px`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      el.style.width = "";
      onResizeRef.current?.(Math.round(latest));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };
}
