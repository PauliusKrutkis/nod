/**
 * The find-in-diff feature's single state holder: reducer-backed UI state,
 * matches recomputed in render (viewport-seeded), and the open/step/close
 * actions the find bar and hotkeys share. Seeds from the first visible row so
 * mod+f starts where the reviewer is looking, not at the top of the PR.
 */

import { useLatest } from "@nod/ui";
import { useReducer, useRef } from "react";
import type { ReviewListHandle } from "../components/review/review-list.tsx";
import type { DiffRow } from "../lib/diff.ts";
import { type FindMatch, findInDiff } from "../lib/find-in-diff.ts";
import {
  currentMatchAt,
  findUiReducer,
  INITIAL_FIND_UI,
  seededMatchIndex,
} from "../lib/review-find.ts";
import type { ReviewListModel } from "../lib/review-items.ts";
import type { ChangedFile } from "../types.ts";

const EMPTY_MATCHES: FindMatch[] = [];

export function useReviewFind(args: {
  files: ChangedFile[];
  listRef: React.RefObject<ReviewListHandle | null>;
  model: ReviewListModel;
  rowsByFile: ReadonlyMap<number, readonly DiffRow[]>;
  selectLine: (
    fileIndex: number,
    anchor: string,
    opts?: { keepOccurrences?: boolean }
  ) => void;
}) {
  const { files, listRef, model, rowsByFile, selectLine } = args;
  const [findUi, dispatchFindUi] = useReducer(findUiReducer, INITIAL_FIND_UI);
  const {
    caseSensitive: findCase,
    focusSeq: findFocusSeq,
    index: findIndex,
    open: findOpen,
    query: findQuery,
    seed: findSeed,
  } = findUi;
  const findJumpedRef = useRef(false);
  const findOpenRef = useLatest(findOpen);

  const findMatches =
    findOpen && findQuery
      ? findInDiff(files, findQuery, { caseSensitive: findCase, rowsByFile })
      : EMPTY_MATCHES;
  const findSeededIndex = seededMatchIndex(findMatches, model, findSeed);
  const findSafeIndex =
    findMatches.length > 0
      ? Math.min(findIndex ?? findSeededIndex, findMatches.length - 1)
      : 0;
  const findCurrent = currentMatchAt(findMatches, findSafeIndex);

  const changeFindQuery = (q: string) => {
    dispatchFindUi({
      q,
      seed: listRef.current?.firstVisibleRowItem() ?? null,
      type: "query",
    });
    findJumpedRef.current = false;
  };

  const toggleFindCase = () => {
    dispatchFindUi({
      seed: listRef.current?.firstVisibleRowItem() ?? null,
      type: "toggleCase",
    });
    findJumpedRef.current = false;
  };

  const openFind = () => {
    if (!findOpenRef.current) {
      const selected =
        window.getSelection()?.toString().split("\n")[0].trim() ?? "";
      dispatchFindUi({
        seed: listRef.current?.firstVisibleRowItem() ?? null,
        selected: selected || undefined,
        type: "open",
      });
      findJumpedRef.current = false;
    }
    dispatchFindUi({ focusSeq: findFocusSeq + 1, type: "focus" });
  };

  const closeFind = () => {
    dispatchFindUi({ type: "close" });
  };
  const closeFindRef = useLatest(closeFind);

  const findStep = (dir: 1 | -1) => {
    const n = findMatches.length;
    if (n === 0) {
      return;
    }
    const next = findJumpedRef.current
      ? (findSafeIndex + dir + n) % n
      : findSafeIndex;
    findJumpedRef.current = true;
    dispatchFindUi({ index: next, type: "step" });
    const m = findMatches[next];
    selectLine(m.fileIndex, m.anchor);
  };

  const onFindNext = () => findStep(1);
  const onFindPrev = () => findStep(-1);

  return {
    changeFindQuery,
    closeFind,
    closeFindRef,
    findCase,
    findCurrent,
    findFocusSeq,
    findMatches,
    findOpen,
    findOpenRef,
    findQuery,
    findSafeIndex,
    findStep,
    onFindNext,
    onFindPrev,
    openFind,
    toggleFindCase,
  };
}
