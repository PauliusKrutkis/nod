import { describe, expect, it } from "vitest";
import type { SidebarFile } from "./file-sidebar.tsx";
import {
  buildFileTree,
  dirPathsForIndex,
  flattenTree,
  treeOrder,
} from "./file-tree.ts";

const file = (filename: string): SidebarFile =>
  ({ filename }) as unknown as SidebarFile;

describe("buildFileTree", () => {
  it("groups files under their directories and keeps original indices", () => {
    const tree = buildFileTree([
      file("src/lib/a.ts"),
      file("src/lib/b.ts"),
      file("README.md"),
    ]);

    expect(tree).toHaveLength(2);
    const [dir, readme] = tree;
    expect(dir.kind).toBe("dir");
    expect(readme.kind).toBe("file");
    if (dir.kind !== "dir" || readme.kind !== "file") {
      throw new Error("unexpected shape");
    }
    expect(dir.name).toBe("src/lib");
    expect(dir.children.map((c) => c.kind === "file" && c.index)).toEqual([
      0, 1,
    ]);
    expect(readme.index).toBe(2);
  });

  it("collapses single-child directory chains into one breadcrumb", () => {
    const tree = buildFileTree([file("a/b/c/d.ts")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind === "dir" && tree[0].name).toBe("a/b/c");
  });

  it("stops collapsing where a directory branches", () => {
    const tree = buildFileTree([file("a/b/c.ts"), file("a/d/e.ts")]);
    expect(tree[0].kind === "dir" && tree[0].name).toBe("a");
    if (tree[0].kind !== "dir") {
      throw new Error("unexpected shape");
    }
    expect(tree[0].children.map((c) => c.kind === "dir" && c.name)).toEqual([
      "b",
      "d",
    ]);
  });
});

describe("flattenTree", () => {
  it("emits depth-tagged rows and hides collapsed subtrees", () => {
    const tree = buildFileTree([file("a/b.ts"), file("a/c.ts")]);
    expect(flattenTree(tree, new Set())).toHaveLength(3);

    const collapsed = flattenTree(tree, new Set(["a"]));
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].depth).toBe(0);
  });

  it("indents nested rows one step per level", () => {
    const tree = buildFileTree([file("a/b/c.ts"), file("a/d.ts")]);
    const rows = flattenTree(tree, new Set());
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
  });
});

describe("dirPathsForIndex", () => {
  it("returns every directory that must be open to reveal a file", () => {
    const tree = buildFileTree([file("a/b/c.ts"), file("a/d.ts")]);
    expect(dirPathsForIndex(tree, 0)).toEqual(["a", "a/b"]);
    expect(dirPathsForIndex(tree, 1)).toEqual(["a"]);
  });

  it("returns null for an index that is not in the tree", () => {
    expect(dirPathsForIndex(buildFileTree([file("a.ts")]), 9)).toBeNull();
  });
});

describe("treeOrder", () => {
  it("returns the files in the order the tree renders them", () => {
    // Host order interleaves a root file between two directories; the tree
    // shows both directories first, so the walk must too.
    const files = [
      file("README.md"),
      file("src/lib/fuzzy.ts"),
      file("package.json"),
      file("src/app.tsx"),
      file("docs/AI.md"),
    ];

    expect(treeOrder(files).map((f) => f.filename)).toEqual([
      "src/lib/fuzzy.ts",
      "src/app.tsx",
      "docs/AI.md",
      "README.md",
      "package.json",
    ]);
  });

  it("keeps a flat list exactly as the host returned it", () => {
    const files = [file("b.ts"), file("a.ts")];
    expect(treeOrder(files).map((f) => f.filename)).toEqual(["b.ts", "a.ts"]);
  });

  it("is idempotent — sorting a sorted list changes nothing", () => {
    const files = [
      file("README.md"),
      file("src/lib/fuzzy.ts"),
      file("src/app.tsx"),
    ];
    const once = treeOrder(files);
    expect(treeOrder(once)).toEqual(once);
  });
});
