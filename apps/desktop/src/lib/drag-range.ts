/**
 * Dragging across code lines grows the line range (BACKLOG P21). The gesture
 * was unclaimed: a cross-line native selection escapes `.qf-code`, so
 * occurrence highlighting never applied to it, and the drag people already
 * make had no second meaning. Now it has one — the same range `shift+j/k`
 * and the `+` gutter drag build, so the text you highlighted is also the
 * lines `c` comments on and `l` sends to the chat. The browser's own
 * selection is left alone, so the drag still copies.
 *
 * The range obeys the forges' rule the other two paths obey: one side, one
 * hunk, contiguous. `rangeFromAnchors` walks out from the first row exactly
 * as the gutter drag does and stops where the walk stops, so a selection
 * sweeping past a hunk boundary or across the gutter into the other side
 * clamps instead of proposing something the host would reject.
 */

import type { LineSelection } from "./review-cursor.ts";
import {
  adjacentSelectableAnchor,
  fileAnchorKey,
  type ReviewListModel,
} from "./review-items.ts";

export interface SelectedRowAnchor {
  anchor: string;
  fileIndex: number;
}

function anchorSide(anchor: string): string {
  return anchor.slice(0, anchor.indexOf(":"));
}

/** The rendered diff rows a live selection touches, in document order. */
export function collectSelectedRowAnchors(
  selection: Selection
): SelectedRowAnchor[] {
  const out: SelectedRowAnchor[] = [];
  const rows = document.querySelectorAll<HTMLElement>(".qf-row[data-anchor]");
  for (const row of rows) {
    if (!selection.containsNode(row, true)) {
      continue;
    }
    const anchor = row.dataset.anchor;
    const fileIndex = Number(row.dataset.fileIndex);
    if (anchor && Number.isInteger(fileIndex)) {
      out.push({ anchor, fileIndex });
    }
  }
  return out;
}

export function rangeFromAnchors(
  model: ReviewListModel,
  anchors: readonly SelectedRowAnchor[]
): LineSelection | null {
  const first = anchors[0];
  if (!first) {
    return null;
  }
  const side = anchorSide(first.anchor);
  const sameRun = anchors.filter(
    (a) => a.fileIndex === first.fileIndex && anchorSide(a.anchor) === side
  );
  const last = sameRun.at(-1);
  if (!last || last.anchor === first.anchor) {
    return null;
  }
  const item =
    model.items[
      model.anchorItem.get(fileAnchorKey(first.fileIndex, first.anchor)) ?? -1
    ];
  if (item?.kind !== "row") {
    return null;
  }
  const fromIdx = model.navIndexOf.get(
    fileAnchorKey(first.fileIndex, first.anchor)
  );
  const toIdx = model.navIndexOf.get(
    fileAnchorKey(last.fileIndex, last.anchor)
  );
  if (fromIdx === undefined || toIdx === undefined) {
    return null;
  }
  const delta = toIdx > fromIdx ? (1 as const) : (-1 as const);
  let reached = first.anchor;
  while (reached !== last.anchor) {
    const next = adjacentSelectableAnchor(
      model,
      first.fileIndex,
      side,
      item.hunkIndex,
      reached,
      delta
    );
    if (!next) {
      break;
    }
    reached = next;
  }
  if (reached === first.anchor) {
    return null;
  }
  return {
    fileIndex: first.fileIndex,
    from: first.anchor,
    hunkIndex: item.hunkIndex,
    side,
    to: reached,
  };
}
