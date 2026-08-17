/**
 * Groups the flat changed-file list into a directory tree for the sidebar.
 *
 * Two invariants keep the tree a pure presentation layer over the existing
 * flat model: every file node carries its ORIGINAL index in `files`, so
 * selection and `onSelect(index)` are unchanged; and `flattenTree` returns a
 * linear row list, so the sidebar still renders one array.
 *
 * Directory chains with a single child are collapsed into one breadcrumb row
 * (`src/lib/review` rather than three nested rows) — a PR usually touches a
 * few deep paths, and the un-collapsed version is mostly indentation.
 */

import type { SidebarFile } from "./file-sidebar.tsx";

interface FileTreeFileNode {
  kind: "file";
  index: number;
  name: string;
  file: SidebarFile;
}

interface FileTreeDirNode {
  kind: "dir";
  path: string;
  name: string;
  children: FileTreeNode[];
}

export type FileTreeNode = FileTreeFileNode | FileTreeDirNode;

export interface FileTreeRow {
  depth: number;
  node: FileTreeNode;
}

interface MutableDir {
  children: Map<string, MutableDir>;
  files: FileTreeFileNode[];
}

function emptyDir(): MutableDir {
  return { children: new Map(), files: [] };
}

function toNodes(dir: MutableDir, prefix: string): FileTreeNode[] {
  const out: FileTreeNode[] = [];
  for (const [name, child] of dir.children) {
    const path = prefix ? `${prefix}/${name}` : name;
    out.push(collapseChain({ children: [], kind: "dir", name, path }, child));
  }
  out.push(...dir.files);
  return out;
}

function collapseChain(
  node: FileTreeDirNode,
  dir: MutableDir
): FileTreeDirNode {
  let current = dir;
  let { name, path } = node;
  while (current.files.length === 0 && current.children.size === 1) {
    const [childName, childDir] = [...current.children][0];
    name = `${name}/${childName}`;
    path = `${path}/${childName}`;
    current = childDir;
  }
  return { children: toNodes(current, path), kind: "dir", name, path };
}

export function buildFileTree(files: readonly SidebarFile[]): FileTreeNode[] {
  const root = emptyDir();
  for (const [index, file] of files.entries()) {
    const parts = file.filename.split("/");
    const name = parts.pop() ?? file.filename;
    let dir = root;
    for (const part of parts) {
      let next = dir.children.get(part);
      if (!next) {
        next = emptyDir();
        dir.children.set(part, next);
      }
      dir = next;
    }
    dir.files.push({ file, index, kind: "file", name });
  }
  return toNodes(root, "");
}

/**
 * The changed files in the order the tree shows them: directories before
 * files at each level, everything else in the order the host returned.
 *
 * The tree is a presentation layer over flat indices, which is fine until
 * the keyboard walks the flat order while the eye reads the tree — then
 * "next file" jumps upward or across directories (docs/BACKLOG.md § Inbox).
 * Sorting the list once at load, through the same builder the sidebar uses,
 * makes the flat order and the tree order the same order by construction
 * rather than by two implementations agreeing.
 */
export function treeOrder<T extends SidebarFile>(files: readonly T[]): T[] {
  const order: T[] = [];
  const walk = (nodes: readonly FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "file") {
        const file = files[node.index];
        if (file !== undefined) {
          order.push(file);
        }
      } else {
        walk(node.children);
      }
    }
  };
  walk(buildFileTree(files));
  return order;
}

export function flattenTree(
  nodes: readonly FileTreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0
): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  for (const node of nodes) {
    rows.push({ depth, node });
    if (node.kind === "dir" && !collapsed.has(node.path)) {
      rows.push(...flattenTree(node.children, collapsed, depth + 1));
    }
  }
  return rows;
}

/**
 * Directory paths that must be open for `index` to be a visible row, or null
 * when the file is not in this subtree. Callers use it to auto-expand the
 * folder holding the selected file, which otherwise has no rendered row and
 * so can never scroll itself into view.
 */
export function dirPathsForIndex(
  nodes: readonly FileTreeNode[],
  index: number
): string[] | null {
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.index === index) {
        return [];
      }
      continue;
    }
    const inner = dirPathsForIndex(node.children, index);
    if (inner) {
      return [node.path, ...inner];
    }
  }
  return null;
}
