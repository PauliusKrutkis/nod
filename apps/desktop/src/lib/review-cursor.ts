/**
 * The review pane's line cursor and multi-line selection: stepping the cursor
 * through the nav order (with hold-to-accelerate batching over rAF), growing a
 * one-side hunk-contiguous selection, resolving it to item indexes, and
 * picking where `e` lands next. Pure functions over the review list model —
 * React state comes in as refs and setters, never read from hooks.
 */
import type React from "react";
import type {
  ReviewListCallbacks,
  ReviewListHandle,
} from "../components/review/review-list.tsx";
import type { ChangedFile } from "../types.ts";
import {
  adjacentSelectableAnchor,
  anchorLine,
  armedThreadAt,
  fileAnchorKey,
  type NavKind,
  navKey,
  type ReviewListModel,
} from "./review-items.ts";

export interface CursorPos {
  anchor: string;
  fileIndex: number;
  kind: NavKind;
}

/** A multi-line comment range: a one-side, hunk-contiguous run of rows.
 *  `from` is the fixed end (where extension started), `to` the moving end. */
export interface LineSelection {
  fileIndex: number;
  from: string;
  hunkIndex: number;
  side: string;
  to: string;
}

function cursorRepeatMultiplier(held: number): number {
  if (held >= 24) {
    return 6;
  }
  if (held >= 8) {
    return 3;
  }
  return 1;
}

export function extendExistingSelection(
  sel: LineSelection,
  delta: 1 | -1,
  m: ReviewListModel,
  listRef: React.RefObject<ReviewListHandle | null>,
  setSelection: (s: LineSelection | null) => void,
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>
): boolean {
  const next = adjacentSelectableAnchor(
    m,
    sel.fileIndex,
    sel.side,
    sel.hunkIndex,
    sel.to,
    delta
  );
  if (!next) {
    return true;
  }
  if (next === sel.from) {
    setSelection(null);
    setCursor({ anchor: next, fileIndex: sel.fileIndex, kind: "row" });
    return true;
  }
  setSelection({ ...sel, to: next });
  setCursor({ anchor: next, fileIndex: sel.fileIndex, kind: "row" });
  const itemIndex = m.anchorItem.get(fileAnchorKey(sel.fileIndex, next));
  if (itemIndex !== undefined) {
    listRef.current?.nudgeItemIntoView(itemIndex);
  }
  return true;
}

export function startSelectionFromCursor(
  cur: CursorPos,
  delta: 1 | -1,
  m: ReviewListModel,
  listRef: React.RefObject<ReviewListHandle | null>,
  setSelection: (s: LineSelection) => void,
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>
): void {
  const item =
    m.items[m.anchorItem.get(fileAnchorKey(cur.fileIndex, cur.anchor)) ?? -1];
  if (item?.kind !== "row" || item.target === null) {
    return;
  }
  const next = adjacentSelectableAnchor(
    m,
    cur.fileIndex,
    item.target.side,
    item.hunkIndex,
    cur.anchor,
    delta
  );
  if (!next) {
    return;
  }
  setSelection({
    fileIndex: cur.fileIndex,
    from: cur.anchor,
    hunkIndex: item.hunkIndex,
    side: item.target.side,
    to: next,
  });
  setCursor({ anchor: next, fileIndex: cur.fileIndex, kind: "row" });
  const itemIndex = m.anchorItem.get(fileAnchorKey(cur.fileIndex, next));
  if (itemIndex !== undefined) {
    listRef.current?.nudgeItemIntoView(itemIndex);
  }
}

export function resolveLiveSelection(
  selection: LineSelection | null,
  model: ReviewListModel
): {
  endItem: number;
  fileIndex: number;
  fromItem: number;
  hunkIndex: number;
  side: string;
  toItem: number;
} | null {
  if (!selection) {
    return null;
  }
  const a = model.anchorItem.get(
    fileAnchorKey(selection.fileIndex, selection.from)
  );
  const b = model.anchorItem.get(
    fileAnchorKey(selection.fileIndex, selection.to)
  );
  if (a === undefined || b === undefined || a === b) {
    return null;
  }
  return {
    endItem: b,
    fileIndex: selection.fileIndex,
    fromItem: Math.min(a, b),
    hunkIndex: selection.hunkIndex,
    side: selection.side,
    toItem: Math.max(a, b),
  };
}

export function commentAtCursorPos(
  modelRef: React.RefObject<ReviewListModel>,
  liveSelectionRef: React.RefObject<ReturnType<typeof resolveLiveSelection>>,
  cursorRef: React.RefObject<CursorPos | null>,
  activeIndexRef: React.RefObject<number>,
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>,
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>,
  onOpenBox: ReviewListCallbacks["onOpenBox"]
): void {
  const m = modelRef.current;

  const sel = liveSelectionRef.current;
  if (sel) {
    const endItem = m.items[sel.toItem];
    const startItem = m.items[sel.fromItem];
    if (
      endItem?.kind === "row" &&
      endItem.anchor !== null &&
      startItem?.kind === "row" &&
      startItem.anchor !== null
    ) {
      onOpenBox(sel.fileIndex, endItem.anchor, anchorLine(startItem.anchor));
      return;
    }
  }
  const cur = cursorRef.current;
  const entry = cur ?? m.nav[0];
  if (!entry) {
    return;
  }
  if (!cur) {
    setCursor({
      anchor: entry.anchor,
      fileIndex: entry.fileIndex,
      kind: "row",
    });
    setActiveIndex(entry.fileIndex);
    activeIndexRef.current = entry.fileIndex;
  }
  onOpenBox(entry.fileIndex, entry.anchor);
}

/**
 * Where `e` should land after marking the file at `from` viewed: the next file
 * the reviewer still has to review, walking forward and wrapping past the end
 * of the list — files get skipped over by the sidebar, `mod+p` file search and
 * `r`/`t`, so unreviewed work is not always ahead of you. `from` is never a
 * candidate (it was just marked), so `e` can't bounce in place. `null` when
 * nothing is left: `e` then stays put instead of parking the reviewer on an
 * already-viewed file, where another `e` would silently unmark it.
 */
export function nextUnviewedFileIndex(
  files: readonly ChangedFile[],
  viewedSet: ReadonlySet<string>,
  from: number
): number | null {
  for (let step = 1; step < files.length; step += 1) {
    const index = (from + step) % files.length;
    if (!viewedSet.has(files[index].filename)) {
      return index;
    }
  }
  return null;
}

export function buildCursorMover(refs: {
  modelRef: React.RefObject<ReviewListModel>;
  cursorRef: React.RefObject<CursorPos | null>;
  activeIndexRef: React.RefObject<number>;
  activeThreadRef: React.RefObject<{ rootId: number; path: string } | null>;
  filesRef: React.RefObject<ChangedFile[]>;
  pendingDeltaRef: React.RefObject<number>;
  cursorRafRef: React.RefObject<number | null>;
  heldRepeatsRef: React.RefObject<number>;
  keyboardHoldRef: React.RefObject<boolean>;
  listRef: React.RefObject<ReviewListHandle | null>;
  setCursor: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  setActiveIndex: (i: number) => void;
  setInputMode: (m: "keyboard" | "mouse") => void;
}): { move: (delta: number, isRepeat: boolean) => void } {
  const place = (entry: ReviewListModel["nav"][number]) => {
    refs.setCursor({
      anchor: entry.anchor,
      fileIndex: entry.fileIndex,
      kind: entry.kind,
    });
    refs.setActiveIndex(entry.fileIndex);
    refs.activeIndexRef.current = entry.fileIndex; // eager — see scrollToFile
    refs.activeThreadRef.current = armedThreadAt(
      refs.modelRef.current,
      refs.filesRef.current,
      entry.itemIndex
    );
  };
  const flush = () => {
    refs.cursorRafRef.current = null;
    const m = refs.modelRef.current;
    const delta = refs.pendingDeltaRef.current;
    refs.pendingDeltaRef.current = 0;
    if (delta === 0 || m.nav.length === 0) {
      return;
    }
    const cur = refs.cursorRef.current;
    const curIdx = cur
      ? m.navIndexOf.get(navKey(cur.fileIndex, cur.anchor, cur.kind))
      : undefined;
    if (curIdx === undefined) {
      const start = refs.listRef.current?.firstVisibleRowItem() ?? 0;
      const entry = m.nav.find((n) => n.itemIndex >= start) ?? m.nav[0];
      place(entry);
      return;
    }
    const nextIdx = Math.min(Math.max(curIdx + delta, 0), m.nav.length - 1);
    if (nextIdx === curIdx) {
      return;
    }
    const entry = m.nav[nextIdx];
    place(entry);
    refs.listRef.current?.nudgeItemIntoView(entry.itemIndex);
  };
  return {
    move(delta, isRepeat) {
      refs.keyboardHoldRef.current = true;
      refs.setInputMode("keyboard");
      refs.heldRepeatsRef.current = isRepeat
        ? refs.heldRepeatsRef.current + 1
        : 0;
      const held = refs.heldRepeatsRef.current;
      const multiplier = cursorRepeatMultiplier(held);
      refs.pendingDeltaRef.current += delta * multiplier;
      if (refs.cursorRafRef.current === null) {
        refs.cursorRafRef.current = requestAnimationFrame(flush);
      }
    },
  };
}
