/**
 * The review sidebar: every changed file, as a directory tree or a flat list
 * over the same flat model. Tree rows are a pure presentation layer — every
 * file row keeps its original index, so selection, `onSelect` and the host's
 * r/t/e file order are identical in both modes.
 *
 * Which mode is showing belongs to the host (it persists the choice across
 * launches), so `treeMode`/`onToggleTreeMode` arrive as props; which folders
 * are collapsed is ephemeral view state and stays here. A folder auto-expands
 * when the selection MOVES into it — on selection change only, never on every
 * render, or the folder holding the current file could never be collapsed at
 * all. Keyboard navigation does not enter the tree: the host walks the flat
 * file order, which is why a collapsed folder must still yield its file.
 *
 * Counts (threads, pending drafts), which files are viewed and which changed
 * since they were viewed are all host derivations over payloads this side
 * never sees, so they arrive already reduced to a path → count map and two
 * path lists.
 *
 * A mouse click blurs the row after selecting so its focus ring never lingers
 * once keyboard nav moves the active file elsewhere.
 *
 * SidebarFile is the package's own minimal shape, not an import from the app:
 * the desktop's richer ChangedFile satisfies it structurally.
 */
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  List,
} from "lucide-react";
import { type CSSProperties, type MouseEvent, useRef, useState } from "react";
import { cn } from "../cn/cn.ts";
import { Tooltip } from "../tooltip/tooltip.tsx";
import { buildFileTree, dirPathsForIndex, flattenTree } from "./file-tree.ts";
import "./file-sidebar.css";

export interface SidebarFile {
  additions: number;
  deletions: number;
  filename: string;
  status: string;
}

interface Glyph {
  cls: string;
  letter: string;
  title: string;
}

/** Unknown statuses read as modified: the provider grows states we haven't
 *  seen, and a file with an unrenderable glyph would be worse than a wrong
 *  one. */
function glyphFor(status: string): Glyph {
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

export function FileSidebar({
  changed = [],
  defaultCollapsed = [],
  files,
  onSelect,
  onToggleTreeMode,
  pendingCounts = {},
  selectedIndex,
  threadCounts = {},
  treeMode = true,
  viewed = [],
}: {
  changed?: readonly string[];
  defaultCollapsed?: readonly string[];
  files: readonly SidebarFile[];
  onSelect: (index: number) => void;
  onToggleTreeMode: () => void;
  pendingCounts?: Readonly<Record<string, number>>;
  selectedIndex: number;
  threadCounts?: Readonly<Record<string, number>>;
  treeMode?: boolean;
  viewed?: readonly string[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const viewedSet = new Set(viewed);
  const changedSet = new Set(changed);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(defaultCollapsed)
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
        node: {
          file,
          index,
          kind: "file" as const,
          name: splitPath(file.filename).base,
        },
      }));

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

  const modeLabel = treeMode ? "Show a flat file list" : "Show a file tree";

  return (
    <div className="qf-sidebar">
      <div className="qf-side-head">
        <span className="qf-side-title">Files</span>
        <span className="qf-side-head-right">
          <span className="qf-side-count">
            {viewedSet.size}/{files.length} viewed
          </span>
          <Tooltip label={modeLabel}>
            <button
              aria-label={modeLabel}
              className="qf-side-mode q-focus"
              onClick={onToggleTreeMode}
              type="button"
            >
              {treeMode ? <List size={13} /> : <FolderTree size={13} />}
            </button>
          </Tooltip>
        </span>
      </div>

      <nav className="qf-filelist" ref={listRef}>
        {rows.map(({ depth, node }) => {
          if (node.kind === "dir") {
            const isCollapsed = collapsed.has(node.path);
            return (
              <button
                aria-expanded={!isCollapsed}
                className="qf-file qf-file-dirrow q-focus"
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
          const { dir } = splitPath(file.filename);
          const on = index === selectedIndex;
          const isViewed = viewedSet.has(file.filename);
          const threads = threadCounts[file.filename] ?? 0;
          const pend = pendingCounts[file.filename] ?? 0;
          return (
            <button
              aria-current={on}
              className={cn(
                "qf-file q-focus",
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
                <span className="qf-file-base">{node.name}</span>
              </span>
              <span className="qf-file-meta">
                {changedSet.has(file.filename) && (
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
                  <span className="qf-file-add">+{file.additions}</span>
                  <span className="qf-file-del">−{file.deletions}</span>
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
          <p className="qf-side-empty">No files changed.</p>
        )}
      </nav>
    </div>
  );
}
