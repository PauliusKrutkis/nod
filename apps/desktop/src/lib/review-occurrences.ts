/**
 * Occurrence navigation over the review pane's current match list: the OccNav
 * stepper (n/p, wrapping jumps, mod+click retargeting) and the mod+click
 * neighbour-step gesture. Stateless over refs, so per-event instances are
 * interchangeable — see occNavRefs in review-screen.tsx.
 */
import type React from "react";
import { type OccState, wordAtPoint } from "./code-dom.ts";
import type { OccurrenceMatch } from "./occurrences.ts";

/* Index in the match list of the occurrence covering (anchor, column).
 Jump to match `index` (wrapping), keeping the marks alive.
 n/p: step relative to the last-jumped position (or the origin
 occurrence — the clicked/selected one — before any jump).
 stepTo: the neighbour of `from` within an explicitly supplied match list — the
 next match, or the previous one when `from` is already the last. mod+click can
 retarget the marks as it navigates, so it hands in the list it resolved rather
 than reading occMatchListRef, which is a render behind. It also aims at a
 specific match, so wrapping to the top of the file would throw the eye away;
 n/p still wrap. */
export interface OccNav {
  indexAt: (anchor: string, column: number) => number;
  jumpTo: (index: number) => void;
  step: (dir: 1 | -1) => void;
  stepTo: (spec: OccState, matches: OccurrenceMatch[], from: number) => void;
}

export function buildOccNav(refs: {
  occMatchListRef: React.RefObject<OccurrenceMatch[]>;
  occSpecRef: React.RefObject<OccState | null>;
  occNavRef: React.RefObject<number>;
  occOriginRef: React.RefObject<{ anchor: string; column: number } | null>;
  selectLineRef: React.RefObject<
    (
      fileIndex: number,
      anchor: string,
      opts?: { keepOccurrences?: boolean; nudge?: boolean }
    ) => void
  >;
}): OccNav {
  const {
    occMatchListRef,
    occSpecRef,
    occNavRef,
    occOriginRef,
    selectLineRef,
  } = refs;
  const indexAt = (anchor: string, column: number): number =>
    occMatchListRef.current.findIndex(
      (m) => m.anchor === anchor && m.start <= column && column <= m.end
    );
  const land = (
    spec: OccState,
    matches: OccurrenceMatch[],
    index: number
  ): void => {
    occNavRef.current = index;
    selectLineRef.current(spec.fileIndex, matches[index].anchor, {
      keepOccurrences: true,
      nudge: true,
    });
  };
  const jumpTo = (index: number): void => {
    const spec = occSpecRef.current;
    const matches = occMatchListRef.current;
    if (!spec || matches.length === 0) {
      return;
    }
    const n = matches.length;
    land(spec, matches, ((index % n) + n) % n);
  };
  const stepTo = (
    spec: OccState,
    matches: OccurrenceMatch[],
    from: number
  ): void => {
    const n = matches.length;
    if (n < 2) {
      return;
    }
    land(spec, matches, from + 1 < n ? from + 1 : from - 1);
  };
  const step = (dir: 1 | -1): void => {
    if (occMatchListRef.current.length === 0) {
      return;
    }
    let at = occNavRef.current;
    if (at < 0) {
      const origin = occOriginRef.current;
      if (origin) {
        const found = indexAt(origin.anchor, origin.column);
        if (found >= 0) {
          at = found;
        } else if (dir > 0) {
          at = -1;
        } else {
          at = 0;
        }
      } else if (dir > 0) {
        at = -1;
      } else {
        at = 0;
      }
    }
    jumpTo(at + dir);
  };
  return { indexAt, jumpTo, step, stepTo };
}

/**
 * mod+click on any word in a diff line: mark its occurrences in that file and
 * move to the one after the word clicked, or to the one before it when the click
 * landed on the last. Whether that word was already the marked one is beside the
 * point — the gesture reads the file, not the current highlight state, so it
 * works on first contact. False when the pointer wasn't on a word at all, which
 * hands the click back to the ordinary path.
 */
export function stepToNeighbourOccurrence(
  e: MouseEvent,
  matchesFor: (spec: OccState) => OccurrenceMatch[],
  occNav: OccNav,
  commit: (
    next: OccState | null,
    origin?: { anchor: string; column: number } | null
  ) => void
): boolean {
  const word = wordAtPoint(e.clientX, e.clientY);
  if (!word) {
    return false;
  }
  const matches = matchesFor(word.spec);
  const at = matches.findIndex(
    (m) =>
      m.anchor === word.anchor && m.start <= word.column && word.column <= m.end
  );
  if (at < 0) {
    return false;
  }
  window.getSelection()?.removeAllRanges();
  commit(word.spec, { anchor: word.anchor, column: word.column });
  occNav.stepTo(word.spec, matches, at);
  return true;
}
