/**
 * Find-in-diff UI state (reducer) and match-position math: seeding the active
 * match from the captured viewport, and naming the current match as
 * (file, row anchor, occurrence ordinal) for the find bar.
 */
import type { FindCurrent } from "../components/review/review-list.tsx";
import type { FindMatch } from "./find-in-diff.ts";
import { fileAnchorKey, type ReviewListModel } from "./review-items.ts";

export interface FindUi {
  caseSensitive: boolean;
  focusSeq: number;
  index: number | null;
  open: boolean;
  query: string;
  seed: number | null;
}

export type FindUiAction =
  | { type: "close" }
  | { focusSeq: number; type: "focus" }
  | { index: number; type: "step" }
  | { q: string; seed: number | null; type: "query" }
  | { seed: number | null; selected?: string; type: "open" }
  | { seed: number | null; type: "toggleCase" };

export const INITIAL_FIND_UI: FindUi = {
  caseSensitive: false,
  focusSeq: 0,
  index: null,
  open: false,
  query: "",
  seed: null,
};

export function findUiReducer(state: FindUi, action: FindUiAction): FindUi {
  switch (action.type) {
    case "close":
      return { ...state, open: false };
    case "focus":
      return { ...state, focusSeq: action.focusSeq };
    case "open":
      return {
        ...state,
        index: null,
        open: true,
        query: action.selected ?? state.query,
        seed: action.seed,
      };
    case "query":
      return { ...state, index: null, query: action.q, seed: action.seed };
    case "step":
      return { ...state, index: action.index };
    case "toggleCase":
      return {
        ...state,
        caseSensitive: !state.caseSensitive,
        index: null,
        seed: action.seed,
      };
    default:
      return state;
  }
}

/**
 * The first match at/after a captured viewport position (a list item index),
 * wrapping to the top when everything is behind it. Matches without an item
 * (collapsed hunks) can't be compared and are skipped.
 */
export function seededMatchIndex(
  matches: FindMatch[],
  model: ReviewListModel,
  seedItemIndex: number | null
): number {
  if (seedItemIndex === null || matches.length === 0) {
    return 0;
  }
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const idx = model.anchorItem.get(fileAnchorKey(m.fileIndex, m.anchor));
    if (idx !== undefined && idx >= seedItemIndex) {
      return i;
    }
  }
  return 0;
}

/**
 * The match at `index` as (file, row anchor, occurrence ordinal). Matches on
 * one line are adjacent in the list, so the ordinal is the run-length behind.
 */
export function currentMatchAt(
  matches: FindMatch[],
  index: number
): FindCurrent | null {
  const m = matches[index];
  if (!m) {
    return null;
  }
  let ordinal = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const p = matches[i];
    if (p.fileIndex !== m.fileIndex || p.anchor !== m.anchor) {
      break;
    }
    ordinal += 1;
  }
  return { anchor: m.anchor, fileIndex: m.fileIndex, ordinal };
}
