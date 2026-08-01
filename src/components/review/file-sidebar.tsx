import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  List,
} from "lucide-react";
import { type CSSProperties, type MouseEvent, useRef, useState } from "react";
import { cn } from "../../lib/cn.ts";
import {
  buildFileTree,
  dirPathsForIndex,
  flattenTree,
} from "../../lib/file-tree.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  ChangedFile,
  FileStatus,
  PendingComment,
  ReviewComment,
} from "../../types.ts";
import { Tooltip } from "../ui/tooltip.tsx";

interface FileSidebarProps {
  changed: Set<string>;
  comments: ReviewComment[];
  files: ChangedFile[];
  onSelect: (i: number) => void;
  pending: PendingComment[];
  prKeyValue: string;
  selectedIndex: number;
}

interface Glyph {
  cls: string;
  letter: string;
  title: string;
}

function glyphFor(status: FileStatus): Glyph {
  switch (status) {
    case "added":
      return { cls: "qf-st-add", letter: "A", title: "Added" };
    case "removed":
      return { cls: "qf-st-del", letter: "D", title: "Removed" };
    case "renamed":
      return { cls: "qf-st-ren", letter: "R", title: "Renamed" };
    case "copied":
      return { cls: "qf-st-ren", letter: "C", title: "Copied" };
    default:
      return { cls: "qf-st-mod", letter: "M", title: "Modified" };
  }
}

function splitPath(filename: string): { dir: string; base: string } {
  const idx = filename.lastIndexOf("/");
  if (idx === -1) {
    return { base: filename, dir: "" };
  }
  return { base: filename.slice(idx + 1), dir: filename.slice(0, idx + 1) };
}

const TREE_MODE_KEY = "pr-flow:fileTreeMode";

function readTreeMode(): boolean {
  try {
    return localStorage.getItem(TREE_MODE_KEY) !== "flat";
  } catch {
    return true;
  }
}

function persistTreeMode(tree: boolean): void {
  try {
    localStorage.setItem(TREE_MODE_KEY, tree ? "tree" : "flat");
  } catch {
    /* ignore */
  }
}

/**
 * The Quiet review sidebar. Two modes over the same flat file model: a
 * directory tree (default) and the original flat list, toggled from the
 * header and remembered in localStorage. Tree rows are a pure presentation
 * layer — every file row keeps its original index, so selection, `onSelect`
 * and the r/t/e file order are identical in both modes.
 *
 * Keyboard navigation does not enter the tree: `r`/`t`/`Tab`/`e` still walk
 * the flat file order, and a folder auto-expands when the selection MOVES
 * into it — on selection change only, never on every render, or the folder
 * holding the current file could never be collapsed at all. That is an accepted limitation for now — a collapsed folder
 * would otherwise have to either swallow files from the cycle or advance the
 * cursor to a row that is not rendered.
 *
 * A mouse click blurs the row after selecting so its focus ring never lingers
 * once keyboard nav moves the active file elsewhere.
 */
export function FileSidebar({
  files,
  selectedIndex,
  onSelect,
  prKeyValue,
  comments,
  pending,
  changed,
}: FileSidebarProps) {
  const viewedFiles = useAppStore((s) => s.viewed[prKeyValue]);
  const viewedSet = new Set(Object.keys(viewedFiles ?? {}));

  const listRef = useRef<HTMLDivElement>(null);

  const threadCounts = (() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.inReplyToId !== null) {
        continue;
      }
      m.set(c.path, (m.get(c.path) ?? 0) + 1);
    }
    return m;
  })();
  const pendingCounts = (() => {
    const m = new Map<string, number>();
    for (const p of pending) {
      m.set(p.path, (m.get(p.path) ?? 0) + 1);
    }
    return m;
  })();

  const [treeMode, setTreeMode] = useState(readTreeMode);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const tree = treeMode ? buildFileTree(files) : [];

  const [prevSelected, setPrevSelected] = useState(selectedIndex);
  if (treeMode && prevSelected !== selectedIndex) {
    setPrevSelected(selectedIndex);
    const ancestors = dirPathsForIndex(tree, selectedIndex) ?? [];
    if (ancestors.some((path) => collapsed.has(path))) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const path of ancestors) {
          next.delete(path);
        }
        return next;
      });
    }
  }

  const rows = treeMode
    ? flattenTree(tree, collapsed)
    : files.map((file, index) => ({
        depth: 0,
        node: { file, index, kind: "file" as const, name: file.filename },
      }));

  const toggleMode = () => {
    const next = !treeMode;
    setTreeMode(next);
    persistTreeMode(next);
  };

  const handleDirClick = (e: MouseEvent<HTMLButtonElement>) => {
    const path = e.currentTarget.dataset.dirPath ?? "";
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    e.currentTarget.blur();
  };

  function revealInList(el: HTMLElement | null) {
    if (!el) {
      return;
    }
    const list = listRef.current;
    if (!list) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const pad = 8;
    if (
      elRect.top < listRect.top + pad ||
      elRect.bottom > listRect.bottom - pad
    ) {
      el.scrollIntoView({ block: "nearest" });
    }
  }

  const handleFileClick = (e: MouseEvent<HTMLButtonElement>) => {
    const index = Number(e.currentTarget.dataset.fileIndex);
    onSelect(index);
    e.currentTarget.blur();
  };

  return (
    <div className="qf-sidebar flex h-full flex-col">
      <div className="qf-side-head flex items-center justify-between px-4 py-3">
        <span className="qf-side-title">Files</span>
        <span className="flex items-center gap-2">
          <span className="qf-side-count">
            {viewedSet.size}/{files.length} viewed
          </span>
          <Tooltip
            label={treeMode ? "Show a flat file list" : "Show a file tree"}
          >
            <button
              aria-label={
                treeMode ? "Show a flat file list" : "Show a file tree"
              }
              aria-pressed={treeMode}
              className="qf-side-mode qf-focusable"
              onClick={toggleMode}
              type="button"
            >
              {treeMode ? <List size={13} /> : <FolderTree size={13} />}
            </button>
          </Tooltip>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav
          className="qf-filelist min-h-0 flex-1 overflow-y-auto py-1"
          ref={listRef}
        >
          {rows.map(({ depth, node }) => {
            if (node.kind === "dir") {
              const isCollapsed = collapsed.has(node.path);
              return (
                <button
                  className="qf-file qf-file-dirrow qf-focusable"
                  data-dir-path={node.path}
                  key={`dir:${node.path}`}
                  onClick={handleDirClick}
                  style={{ "--qf-depth": depth } as CSSProperties}
                  title={node.path}
                  type="button"
                >
                  {isCollapsed ? (
                    <ChevronRight aria-hidden size={13} />
                  ) : (
                    <ChevronDown aria-hidden size={13} />
                  )}
                  <span className="qf-file-name">
                    <span className="qf-file-base">{node.name}</span>
                  </span>
                </button>
              );
            }
            const { file, index } = node;
            const glyph = glyphFor(file.status);
            const { dir, base } = splitPath(file.filename);
            const on = index === selectedIndex;
            const isViewed = viewedSet.has(file.filename);
            const threads = threadCounts.get(file.filename) ?? 0;
            const pend = pendingCounts.get(file.filename) ?? 0;
            return (
              <button
                aria-current={on}
                className={cn(
                  "qf-file qf-focusable",
                  on && "qf-file-active",
                  isViewed && "qf-file-viewed"
                )}
                data-file-index={index}
                key={file.filename}
                onClick={handleFileClick}
                ref={on ? revealInList : undefined}
                style={{ "--qf-depth": depth } as CSSProperties}
                title={file.filename}
                type="button"
              >
                <span
                  className={cn("qf-file-glyph", glyph.cls)}
                  title={glyph.title}
                >
                  {glyph.letter}
                </span>
                <span className="qf-file-name">
                  {!treeMode && <span className="qf-file-dir">{dir}</span>}
                  <span className="qf-file-base">
                    {treeMode ? node.name : base}
                  </span>
                </span>
                <span className="qf-file-meta">
                  {changed.has(file.filename) && (
                    <span
                      className="qf-file-dot"
                      title="Changed since you viewed it"
                    />
                  )}
                  {threads > 0 && (
                    <span
                      className="qf-file-badge qf-file-badge-comment"
                      title={`${threads} thread${threads > 1 ? "s" : ""}`}
                    >
                      {threads}
                    </span>
                  )}
                  {pend > 0 && (
                    <span
                      className="qf-file-badge qf-file-badge-pending"
                      title={`${pend} pending`}
                    >
                      {pend}
                    </span>
                  )}
                  <span className="qf-file-stat">
                    <span className="qf-add">+{file.additions}</span>
                    <span className="qf-del">−{file.deletions}</span>
                  </span>
                  {isViewed && (
                    <Check
                      aria-label="Viewed"
                      className="qf-file-check"
                      size={13}
                    />
                  )}
                </span>
              </button>
            );
          })}
          {files.length === 0 && (
            <div className="px-4 py-6 text-center text-faint text-xs">
              No files changed.
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
