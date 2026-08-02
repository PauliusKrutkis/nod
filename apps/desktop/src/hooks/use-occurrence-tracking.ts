/**
 * Occurrence tracking for the review pane: a document-level pointer/selection
 * listener pair that commits the marked word (plain click), walks to the next
 * occurrence (mod+click), and captures/restores the DOM selection across the
 * marks repaint. Owns no state — everything arrives as refs so per-event
 * handlers stay interchangeable.
 *
 * READABLE_TEXT_SELECTOR is prose the user reads and copies but cannot edit
 * (every Markdown render shares `.md`, plus the comment header and the whole
 * collapsed-thread lead — matching containers, not prose leaves, so clicks on
 * their padding or icons bail too). Occurrence handling must leave its caret
 * alone: such text matches neither `.qf-row` nor `.qf-code`, so without the
 * bail-out a click inside it fell through to the branch that clears the DOM
 * selection whenever occurrence marks happen to be lit.
 */
import { useEffect } from "react";
import {
  type CapturedSelection,
  captureCodeSelection,
  codeAtPoint,
  isPastLineContent,
  type OccState,
  occurrenceOriginFromDom,
  occurrenceOriginFromPoint,
  specFromDomSelection,
  wordAtPoint,
} from "../lib/code-dom.ts";
import type { OccurrenceMatch } from "../lib/occurrences.ts";
import {
  buildOccNav,
  type OccNav,
  stepToNeighbourOccurrence,
} from "../lib/review-occurrences.ts";

const EDITABLE_SURFACE_SELECTOR =
  'input, textarea, [contenteditable="true"], .qa-editor';

const READABLE_TEXT_SELECTOR =
  ".md, .qf-comment-head, .qf-thread-collapsed-lead";

/**
 * A plain click marks the word under the pointer; mod+click walks from it to the
 * next occurrence instead. Multi-click clicks are left alone so the browser's own
 * word selection stands (see the file header).
 *
 * A click into an editable surface must not disturb its caret (composers
 * render inside rows, so they'd otherwise hit the removeAllRanges paths
 * below), and the click that ends a drag-select must not wipe the selection
 * it just made — selectionchange owns occurrence state for real selections.
 */
function handleOccPointerClick(
  e: MouseEvent,
  refs: {
    matchesForRef: React.RefObject<(spec: OccState) => OccurrenceMatch[]>;
    occSpecRef: React.RefObject<OccState | null>;
  },
  occNav: OccNav,
  commit: (
    next: OccState | null,
    origin?: { anchor: string; column: number } | null
  ) => void
): void {
  const { matchesForRef, occSpecRef } = refs;
  if (e.detail > 1) {
    return;
  }
  const target = e.target instanceof Element ? e.target : null;
  if (
    target?.closest(EDITABLE_SURFACE_SELECTOR) ||
    target?.closest(READABLE_TEXT_SELECTOR)
  ) {
    return;
  }
  const domSel = window.getSelection();
  if (domSel && !domSel.isCollapsed) {
    return;
  }
  const row = target?.closest(".qf-row:not(.qf-row-hunk)");
  const code = codeAtPoint(e.clientX, e.clientY);
  if (!(row || code)) {
    if (occSpecRef.current) {
      window.getSelection()?.removeAllRanges();
      commit(null);
    }
    return;
  }

  if (
    (e.metaKey || e.ctrlKey) &&
    stepToNeighbourOccurrence(e, matchesForRef.current, occNav, commit)
  ) {
    return;
  }

  if (!code) {
    window.getSelection()?.removeAllRanges();
    commit(null);
    return;
  }

  window.getSelection()?.removeAllRanges();
  const clickOrigin = occurrenceOriginFromPoint(e.clientX, e.clientY);
  if (isPastLineContent(code, e.clientX, e.clientY)) {
    commit(null);
    return;
  }
  const word = wordAtPoint(e.clientX, e.clientY);
  if (!word) {
    commit(null);
    return;
  }
  commit(word.spec, clickOrigin);
}

export function useOccurrenceTracking(refs: {
  closeFindRef: React.RefObject<() => void>;
  findOpenRef: React.RefObject<boolean>;
  matchesForRef: React.RefObject<(spec: OccState) => OccurrenceMatch[]>;
  occMatchListRef: React.RefObject<OccurrenceMatch[]>;
  occNavRef: React.RefObject<number>;
  occOriginRef: React.RefObject<{ anchor: string; column: number } | null>;
  occRestoreRef: React.RefObject<CapturedSelection | null>;
  occSpecRef: React.RefObject<OccState | null>;
  selectLineRef: React.RefObject<
    (
      fileIndex: number,
      anchor: string,
      opts?: { keepOccurrences?: boolean; nudge?: boolean }
    ) => void
  >;
  setOccSpec: (next: OccState | null) => void;
}): void {
  const {
    closeFindRef,
    findOpenRef,
    matchesForRef,
    occMatchListRef,
    occNavRef,
    occOriginRef,
    occRestoreRef,
    occSpecRef,
    selectLineRef,
    setOccSpec,
  } = refs;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const occNav = buildOccNav({
      occMatchListRef,
      occNavRef,
      occOriginRef,
      occSpecRef,
      selectLineRef,
    });

    function commit(
      next: OccState | null,
      origin?: { anchor: string; column: number } | null
    ) {
      const prev = occSpecRef.current;
      occOriginRef.current = next
        ? (origin ?? occurrenceOriginFromDom())
        : null;
      occNavRef.current = -1;
      if (
        prev &&
        next &&
        prev.query === next.query &&
        prev.wholeWord === next.wholeWord &&
        prev.fileIndex === next.fileIndex
      ) {
        return;
      }
      if (prev === next) {
        return;
      }
      if (next && findOpenRef.current) {
        closeFindRef.current();
      }
      occRestoreRef.current = captureCodeSelection();
      setOccSpec(next);
    }

    function apply() {
      timer = null;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return;
      }
      commit(specFromDomSelection());
    }

    function onSelectionChange() {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(apply, 150);
    }

    function onOccClick(e: MouseEvent) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      handleOccPointerClick(e, { matchesForRef, occSpecRef }, occNav, commit);
    }

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("click", onOccClick);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("click", onOccClick);
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [
    closeFindRef,
    findOpenRef,
    matchesForRef,
    occMatchListRef,
    occNavRef,
    occOriginRef,
    occRestoreRef,
    occSpecRef,
    selectLineRef,
    setOccSpec,
  ]);
}
