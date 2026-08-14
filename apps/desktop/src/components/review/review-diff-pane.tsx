/**
 * The review screen's diff pane: the find bar, the virtualized diff list (or
 * the empty state), and the overview ruler, in the shared scroll container.
 * Pure pass-through — every piece of state lives in the screen and arrives as
 * props, typed off ReviewList's own prop contract so the two cannot drift.
 */

import { FindBar } from "@nod/ui/find-bar";
import { OverviewRuler } from "@nod/ui/overview-ruler";
import type React from "react";
import type { ComponentProps } from "react";
import type { FindMatch } from "../../lib/find-in-diff.ts";
import type {
  CursorPos,
  resolveLiveSelection,
} from "../../lib/review-cursor.ts";
import { navKey } from "../../lib/review-items.ts";
import type { getReviewMemory } from "../../lib/review-memory.ts";
import { ReviewList, type ReviewListHandle } from "./review-list.tsx";

type ListProps = ComponentProps<typeof ReviewList>;

export function ReviewDiffPane({
  addPending,
  askDraft,
  askNote,
  baseSha,
  capabilities,
  changedSinceViewed,
  changeFindQuery,
  clampedIndex,
  closeFind,
  copiedPathIndex,
  dragging,
  editReq,
  expandedNames,
  expandingNames,
  fileCount,
  files,
  findCase,
  findCurrent,
  findFocusSeq,
  findMatches,
  findOpen,
  findQuery,
  findSafeIndex,
  flashKey,
  headSha,
  initialMem,
  inputMode,
  listCallbacks,
  listRef,
  liveCursor,
  liveSelection,
  marks,
  model,
  onFindNext,
  onFindPrev,
  owner,
  replyPending,
  replyReq,
  repo,
  rulerFractions,
  toggleFindCase,
  toggleReq,
  viewedSet,
}: {
  addPending: boolean;
  askDraft: ListProps["askDraft"];
  askNote: ListProps["askNote"];
  baseSha: string;
  capabilities?: ListProps["capabilities"];
  changedSinceViewed: ListProps["changedSinceViewed"];
  changeFindQuery: (q: string) => void;
  clampedIndex: number;
  closeFind: () => void;
  copiedPathIndex: number | null;
  dragging: boolean;
  editReq: ListProps["editRequest"];
  expandedNames: ListProps["expandedFiles"];
  expandingNames: ListProps["expandingFiles"];
  fileCount: number;
  files: ListProps["files"];
  findCase: boolean;
  findCurrent: ListProps["findCurrent"];
  findFocusSeq: number;
  findMatches: FindMatch[];
  findOpen: boolean;
  findQuery: string;
  findSafeIndex: number;
  flashKey: string | null;
  headSha: string;
  initialMem: ReturnType<typeof getReviewMemory>;
  inputMode: ListProps["inputMode"];
  listCallbacks: ListProps["callbacks"];
  listRef: React.RefObject<ReviewListHandle | null>;
  liveCursor: CursorPos | null;
  liveSelection: ReturnType<typeof resolveLiveSelection>;
  marks: ListProps["marks"];
  model: ListProps["model"];
  onFindNext: () => void;
  onFindPrev: () => void;
  owner: string;
  replyPending: boolean;
  replyReq: ListProps["replyRequest"];
  repo: string;
  rulerFractions: number[];
  toggleFindCase: () => void;
  toggleReq: ListProps["toggleRequest"];
  viewedSet: ListProps["viewedSet"];
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <FindBar
        caseSensitive={findCase}
        current={findMatches.length > 0 ? findSafeIndex + 1 : 0}
        focusSeq={findFocusSeq}
        onClose={closeFind}
        onNext={onFindNext}
        onPrev={onFindPrev}
        onQueryChange={changeFindQuery}
        onToggleCase={toggleFindCase}
        open={findOpen}
        query={findQuery}
        total={findMatches.length}
      />
      {fileCount === 0 ? (
        <div className="qf-empty">No files changed.</div>
      ) : (
        <ReviewList
          activeIndex={clampedIndex}
          addPending={addPending}
          askDraft={askDraft}
          askNote={askNote}
          baseSha={baseSha}
          callbacks={listCallbacks}
          capabilities={capabilities}
          changedSinceViewed={changedSinceViewed}
          copiedPathIndex={copiedPathIndex}
          cursorKey={
            liveCursor
              ? navKey(liveCursor.fileIndex, liveCursor.anchor, liveCursor.kind)
              : null
          }
          dragging={dragging}
          editRequest={editReq}
          expandedFiles={expandedNames}
          expandingFiles={expandingNames}
          files={files}
          findCurrent={findCurrent}
          flashKey={flashKey}
          headSha={headSha}
          initialFileIndex={initialMem?.fileIndex ?? 0}
          inputMode={inputMode}
          marks={marks}
          model={model}
          owner={owner}
          ref={listRef}
          replyPending={replyPending}
          replyRequest={replyReq}
          repo={repo}
          restoreState={initialMem?.listState}
          selection={
            liveSelection
              ? {
                  endItem: liveSelection.endItem,
                  fileIndex: liveSelection.fileIndex,
                  fromItem: liveSelection.fromItem,
                  toItem: liveSelection.toItem,
                }
              : null
          }
          toggleRequest={toggleReq}
          viewedSet={viewedSet}
        />
      )}
      <OverviewRuler
        currentIndex={findOpen && findMatches.length > 0 ? findSafeIndex : null}
        fractions={rulerFractions}
        kind={findOpen ? "find" : "occurrence"}
      />
    </div>
  );
}
