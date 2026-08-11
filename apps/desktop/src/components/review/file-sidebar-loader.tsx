import { FileSidebar } from "@nod/ui/file-sidebar";
import { useState } from "react";
import { useAppStore } from "../../store/app-store.ts";
import type {
  ChangedFile,
  PendingComment,
  ReviewComment,
} from "../../types.ts";

/**
 * Store and payload wiring for the file column; its view is file-sidebar,
 * catalogued in @nod/ui. Which files you have seen lives in the store keyed by
 * PR, and thread/draft counts are reductions over the review payloads — the
 * view is handed the finished path → count maps so it never learns what a
 * comment is.
 *
 * Tree-vs-flat is remembered across launches, so the mode (and its
 * localStorage round trip) stays here: a component that reads storage cannot
 * be rendered from a fixture alone.
 */

const TREE_MODE_KEY = "nod:fileTreeMode";

function readTreeMode(): boolean {
  try {
    return localStorage.getItem(TREE_MODE_KEY) !== "flat";
  } catch {
    return true;
  }
}

function persistTreeMode(isTree: boolean): void {
  try {
    localStorage.setItem(TREE_MODE_KEY, isTree ? "tree" : "flat");
  } catch {
    /* ignore */
  }
}

function countByPath(
  items: readonly { path: string }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.path] = (counts[item.path] ?? 0) + 1;
  }
  return counts;
}

export function FileSidebarLoader({
  changed,
  comments,
  files,
  onSelect,
  pending,
  prKeyValue,
  selectedIndex,
}: {
  changed: ReadonlySet<string>;
  comments: ReviewComment[];
  files: ChangedFile[];
  onSelect: (i: number) => void;
  pending: PendingComment[];
  prKeyValue: string;
  selectedIndex: number;
}) {
  const viewedFiles = useAppStore((s) => s.viewed[prKeyValue]);
  const [treeMode, setTreeMode] = useState(readTreeMode);

  const toggleTreeMode = () => {
    const next = !treeMode;
    setTreeMode(next);
    persistTreeMode(next);
  };

  return (
    <FileSidebar
      changed={[...changed]}
      files={files}
      onSelect={onSelect}
      onToggleTreeMode={toggleTreeMode}
      pendingCounts={countByPath(pending)}
      selectedIndex={selectedIndex}
      threadCounts={countByPath(comments.filter((c) => c.inReplyToId === null))}
      treeMode={treeMode}
      viewed={Object.keys(viewedFiles ?? {})}
    />
  );
}
