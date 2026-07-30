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

import type { ChangedFile } from "../types.ts";

interface FileTreeFileNode {
  kind: "file";
  index: number;
  name: string;
  file: ChangedFile;
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

export function buildFileTree(files: readonly ChangedFile[]): FileTreeNode[] {
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
