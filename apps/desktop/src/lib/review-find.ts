/**
 * Find-in-diff UI state (reducer) and match-position math: seeding the active
 * match from the captured viewport, and naming the current match as
 * (file, row anchor, occurrence ordinal) for the find bar.
 */
import type {
  FindCurrent,
  MarkSpec,
} from "../components/review/review-list.tsx";
import type { OccState } from "./code-dom.ts";
import type { FindMatch } from "./find-in-diff.ts";
import type { OccurrenceMatch } from "./occurrences.ts";
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

const EMPTY_FRACTIONS: number[] = [];

/** What the list should mark: the find query while the bar is open, else occurrences. */
export function resolveMarks(
  findOpen: boolean,
  findQuery: string,
  findCase: boolean,
  occSpec: OccState | null
): MarkSpec | null {
  if (findOpen) {
    if (findQuery) {
      return { caseSensitive: findCase, kind: "find", query: findQuery };
    }
    return null;
  }
  if (occSpec) {
    return {
      fileIndex: occSpec.fileIndex,
      kind: "occurrence",
      query: occSpec.query,
      wholeWord: occSpec.wholeWord,
    };
  }
  return null;
}

/** Ruler tick positions for the active mark set, as fractions of the list. */
export function resolveRulerFractions(
  model: ReviewListModel,
  findOpen: boolean,
  findQuery: string,
  findMatches: FindMatch[],
  occSpec: OccState | null,
  occMatchList: OccurrenceMatch[]
): number[] {
  if (model.items.length === 0) {
    return EMPTY_FRACTIONS;
  }
  if (findOpen && findQuery) {
    return findMatches.map((m) => {
      const idx = model.anchorItem.get(fileAnchorKey(m.fileIndex, m.anchor));
      return idx === undefined ? -1 : idx / model.items.length;
    });
  }
  if (occSpec) {
    return occMatchList.map((m) => {
      const idx = model.anchorItem.get(
        fileAnchorKey(occSpec.fileIndex, m.anchor)
      );
      return idx === undefined ? -1 : idx / model.items.length;
    });
  }
  return EMPTY_FRACTIONS;
}
