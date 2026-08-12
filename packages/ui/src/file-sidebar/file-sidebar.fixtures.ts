/**
 * A sidebar is a list of paths, and paths are the most hostile strings a
 * provider hands over: unbreakable, unbounded, sometimes right-to-left, and
 * numbering in the hundreds. So the cases are a PR with nothing in it, a PR
 * with one file, the deep monorepo path, the 2,000-character name with no
 * separator to break on, and a 300-file crowd that must scroll rather than
 * grow the column.
 *
 * Every status the provider sends gets a glyph, plus one it does not send
 * ("unmerged") to pin the fallback — GitHub grows states we have not seen and
 * an unknown one reads as modified rather than as nothing.
 *
 * The two modes are the same data twice (`flat` vs the tree default), because
 * the row's directory prefix only exists in one of them, and `collapsed`
 * pins the chevron-right state a click would otherwise be needed to reach.
 * Counts, viewed and changed-since-viewed are host derivations, so they are
 * given as literal maps: all-viewed and none-viewed are separate fixtures
 * because the header count and the row dimming both read from them.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { FileSidebar, type SidebarFile } from "./file-sidebar.tsx";

const noop = () => {
  return;
};

const UNBREAKABLE = `src/generated/${"x".repeat(2000)}.ts`;

function file(
  overrides: Partial<SidebarFile> & { filename: string }
): SidebarFile {
  return { additions: 12, deletions: 3, status: "modified", ...overrides };
}

const typical: SidebarFile[] = [
  file({ additions: 84, filename: "src/components/review/file-sidebar.tsx" }),
  file({ additions: 4, deletions: 61, filename: "src/lib/file-tree.ts" }),
  file({
    additions: 210,
    deletions: 0,
    filename: "src/lib/reviews.ts",
    status: "added",
  }),
  file({
    additions: 0,
    deletions: 143,
    filename: "src/legacy/tree-view.tsx",
    status: "removed",
  }),
  file({ additions: 2, deletions: 2, filename: "README.md" }),
];

const everyStatus: SidebarFile[] = [
  file({ filename: "src/added.ts", status: "added" }),
  file({ filename: "src/modified.ts", status: "modified" }),
  file({ filename: "src/removed.ts", status: "removed" }),
  file({ filename: "src/renamed.ts", status: "renamed" }),
  file({ filename: "src/copied.ts", status: "copied" }),
  file({ filename: "src/changed.ts", status: "changed" }),
  file({ filename: "assets/logo.png", status: "unmerged" }),
];

const crowd: SidebarFile[] = Array.from({ length: 300 }, (_, i) =>
  file({
    additions: i % 97,
    deletions: i % 13,
    filename: `packages/core/src/module-${String(i).padStart(3, "0")}/index.ts`,
    status: i % 5 === 0 ? "added" : "modified",
  })
);

const deep: SidebarFile[] = [
  file({
    filename:
      "packages/platform/services/review/internal/adapters/github/graphql/queries/pull-request-detail.ts",
  }),
  file({
    filename:
      "packages/platform/services/review/internal/adapters/github/graphql/queries/pull-request-files.ts",
  }),
  file({
    filename:
      "packages/platform/services/review/internal/adapters/gitlab/rest/merge-request-changes.ts",
  }),
  file({ filename: "docs/architecture/decisions/0042-tree-over-flat-list.md" }),
];

const unicode: SidebarFile[] = [
  file({ filename: "ソース/コンポーネント/レビュー/ファイル一覧.tsx" }),
  file({ filename: "مصدر/مكونات/مراجعة/قائمة-الملفات.tsx", status: "added" }),
  file({ filename: "src/emoji/👩‍💻-review-🎉.ts" }),
  file({ filename: "src/<img onerror=alert(1)>.ts", status: "renamed" }),
];

export const fileSidebarEntry = defineEntry(FileSidebar, {
  collapsed: {
    props: {
      defaultCollapsed: [
        "packages/platform/services/review/internal/adapters/github/graphql/queries",
      ],
      files: deep,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 3,
    },
  },
  "crowd-300": {
    props: {
      changed: ["packages/core/src/module-004/index.ts"],
      files: crowd,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 7,
      threadCounts: { "packages/core/src/module-002/index.ts": 3 },
      viewed: crowd.slice(0, 40).map((f) => f.filename),
    },
  },
  deep: {
    props: {
      files: deep,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 0,
    },
  },
  empty: {
    props: {
      files: [],
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 0,
    },
  },
  "every-status": {
    props: {
      files: everyStatus,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 1,
      treeMode: false,
    },
  },
  flat: {
    props: {
      changed: ["src/lib/file-tree.ts"],
      files: typical,
      onSelect: noop,
      onToggleTreeMode: noop,
      pendingCounts: { "src/lib/reviews.ts": 1 },
      selectedIndex: 1,
      threadCounts: { "src/components/review/file-sidebar.tsx": 2 },
      treeMode: false,
      viewed: ["README.md"],
    },
  },
  "none-viewed": {
    props: {
      files: typical,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 0,
      viewed: [],
    },
  },
  overflow: {
    props: {
      files: [
        file({ additions: 9999, deletions: 12_438, filename: UNBREAKABLE }),
      ],
      onSelect: noop,
      onToggleTreeMode: noop,
      pendingCounts: { [UNBREAKABLE]: 12 },
      selectedIndex: 0,
      threadCounts: { [UNBREAKABLE]: 40 },
      treeMode: false,
    },
  },
  single: {
    props: {
      files: [file({ filename: "CHANGELOG.md" })],
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 0,
    },
  },
  typical: {
    props: {
      changed: ["src/lib/file-tree.ts"],
      files: typical,
      onSelect: noop,
      onToggleTreeMode: noop,
      pendingCounts: { "src/lib/reviews.ts": 1 },
      selectedIndex: 2,
      threadCounts: { "src/components/review/file-sidebar.tsx": 2 },
      viewed: ["README.md", "src/lib/file-tree.ts"],
    },
  },
  unicode: {
    props: {
      changed: ["src/emoji/👩‍💻-review-🎉.ts"],
      files: unicode,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 1,
      viewed: ["مصدر/مكونات/مراجعة/قائمة-الملفات.tsx"],
    },
  },
  "viewed-all": {
    props: {
      files: typical,
      onSelect: noop,
      onToggleTreeMode: noop,
      selectedIndex: 0,
      viewed: typical.map((f) => f.filename),
    },
  },
});
