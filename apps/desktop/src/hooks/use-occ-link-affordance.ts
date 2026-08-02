/**
 * Underlines whichever word the pointer is on while the mod key is held, so
 * mod+click advertises itself the way it does in an editor — see the doc block
 * on the hook for the Custom Highlight mechanics.
 */
import { useEffect } from "react";
import { type PointerWord, wordAtPoint } from "../lib/code-dom.ts";
import { highlightRegistry } from "../lib/custom-highlight.ts";

const OCC_LINK = "qf-occ-link";

const isModKey = (key: string): boolean => key === "Meta" || key === "Control";

/**
 * Underlines whichever word the pointer is on while the mod key is held, so
 * mod+click advertises itself the way it does in an editor.
 *
 * The word usually has no element of its own to style — mod+click works on any
 * identifier, not just the marked ones — so this paints through the Custom
 * Highlight API, which styles a Range without touching the DOM React owns. Rows
 * are never re-rendered for it: repainting a code line on every pointer move is
 * the kind of work this screen is built to avoid, and a stale <mark> layer would
 * fight the occurrence marks for the same text. Where the API is missing the
 * gesture still works, it just goes unadvertised.
 *
 * A painted Range is only as durable as the text nodes under it, and both a
 * click (the row it lands on repaints its marks) and a scroll (Virtuoso recycles
 * rows) replace those out from under it, collapsing the paint to nothing while
 * the pointer never moved. So the Range is re-registered on every repaint rather
 * than diffed against the last one, and a click or scroll schedules a repaint on
 * the next frame — by which time React has committed and the word under the
 * pointer may legitimately be a different one. Recomputing measured at ~0.01ms.
 *
 * It tracks the pointer itself instead of borrowing the screen's lastPointRef,
 * which is not a live position — isRealPointer deliberately leaves it stale
 * while the keyboard holds the cursor. Listening on the document also means
 * leaving the diff clears the paint, which a listener on the list would miss.
 */
export function useOccLinkAffordance(): void {
  useEffect(() => {
    const registry = highlightRegistry();
    let held = false;
    let at: { x: number; y: number } | null = null;
    let painted = false;

    const paint = (word: PointerWord | null) => {
      if (!word) {
        if (painted) {
          painted = false;
          document.body.classList.remove(OCC_LINK);
          registry?.delete(OCC_LINK);
        }
        return;
      }
      painted = true;
      document.body.classList.add(OCC_LINK);
      registry?.set(OCC_LINK, new Highlight(word.range));
    };
    const repaint = () => {
      paint(held && at ? wordAtPoint(at.x, at.y) : null);
    };
    let frame: number | null = null;
    const repaintNextFrame = () => {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          repaint();
        });
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      at = { x: e.clientX, y: e.clientY };
      repaint();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModKey(e.key) && !held) {
        held = true;
        repaint();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isModKey(e.key)) {
        held = false;
        repaint();
      }
    };
    const clear = () => {
      held = false;
      repaint();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("click", repaintNextFrame);
    document.addEventListener("scroll", repaintNextFrame, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("click", repaintNextFrame);
      document.removeEventListener("scroll", repaintNextFrame, true);
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      clear();
    };
  }, []);
}
