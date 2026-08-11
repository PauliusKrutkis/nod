/**
 * The pane's two modes are two different renderers over the same pull request,
 * so every case names its mode first. `initialQuery` is what makes result
 * states capturable at all — with an empty field there is only ever one
 * picture — so the hostile cases are queries: one that matches nothing, one
 * that is an unbreakable 720-character token the empty state has to echo, one
 * that hits the 60-result cap, and one whose match sits on the first or the
 * last row of a hunk (the context window has nothing to show on one side).
 * `text-hunk-boundary` is the one
 * that would silently pass with a flat row list: the snippet must stop at the
 * hunk edge, never splice two distant parts of the file together.
 *
 * The two overflow cases are the same 2,000-column line in the two roles a
 * snippet gives it: as context it must ellipsize, as the match it must wrap,
 * because a match nobody can read is not a search result. `markup-as-text` is
 * the security case: highlighted lines arrive as HTML, so a diff line that
 * looks like a tag must render as text, never mount.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { PrSearch, type PrSearchHunk } from "./pr-search.tsx";

const noop = () => {
  return;
};

function hunk(start: number, texts: readonly string[]): PrSearchHunk {
  return texts.map((text, i) => ({
    anchor: `RIGHT:${start + i}`,
    num: start + i,
    text,
  }));
}

const useGamma = hunk(1, [
  'import { useState } from "react";',
  "",
  "export function useGamma(initial: number) {",
  "  const [gamma, setGamma] = useState(initial);",
  "  const bump = () => setGamma((g) => g + 1);",
  "  return { bump, gamma, setGamma };",
  "}",
]);

const gammaTail = hunk(48, [
  "  const label = formatGamma(gamma);",
  "  return <span className={styles.gamma}>{label}</span>;",
  "}",
]);

const files = [
  { filename: "src/hooks/use-gamma.ts", hunks: [useGamma] },
  {
    filename: "src/components/review/gamma-panel.tsx",
    hunks: [
      hunk(12, [
        "  const rows = useMemo(() => buildRows(files), [files]);",
        "  const { gamma } = useGamma(0);",
        "  if (rows.length === 0) {",
        "    return <Empty />;",
        "  }",
      ]),
      gammaTail,
    ],
  },
  { filename: "assets/logo.png" },
  { filename: "docs/ARCHITECTURE.md", hunks: [hunk(203, ["## Gamma"])] },
];

const boundaryFile = [
  {
    filename: "src/lib/diff.ts",
    hunks: [
      hunk(30, [
        "  for (const row of hunk.rows) {",
        "    if (row.type === HUNK) {",
        "      continue;",
        "    }",
        "    out.push(marker(row));",
      ]),
      hunk(212, [
        "  return out;",
        "}",
        "",
        "export function marker(row: DiffRow): string {",
        "  return MARKERS[row.type];",
      ]),
    ],
  },
];

const firstAndLast = [
  {
    filename: "src/lib/edges.ts",
    hunks: [
      hunk(1, [
        "export const EDGE = Symbol.for('edge');",
        "const inner = 1;",
        "const other = 2;",
        "const third = 3;",
        "const last = 4;",
      ]),
    ],
  },
];

const crowd = [
  {
    filename: "src/generated/registry.ts",
    hunks: [
      hunk(
        1,
        Array.from(
          { length: 90 },
          (_, i) => `  register("widget-${i}", widgetFactory);`
        )
      ),
    ],
  },
];

const wideLine = `const payload = "${"chunk-of-a-line-that-never-wraps-".repeat(60)}";`;

const wideFile = [
  {
    filename: "src/lib/wide.ts",
    hunks: [
      hunk(1, [
        "const before = 1;",
        wideLine,
        "  const gamma = payload.length;",
        "const after = 2;",
      ]),
    ],
  },
];

const wideHitFile = [
  {
    filename: "src/lib/wide.ts",
    hunks: [
      hunk(1, [
        "const before = 1;",
        `${wideLine.slice(0, -2)}gamma";`,
        "const after = 2;",
      ]),
    ],
  },
];

const unicodeFiles = [
  {
    filename: "src/コンポーネント/さくら.tsx",
    hunks: [
      hunk(4, [
        "  const 名前 = 「藤本 さくら」;",
        "  const مؤلف = 'محمد الأمين';",
        "  return <span>{名前}</span>;",
      ]),
    ],
  },
  { filename: "docs/ドキュメント/さくら.md", hunks: [hunk(1, ["# さくら"])] },
];

const markupFiles = [
  {
    filename: "src/pages/report.tsx",
    hunks: [
      hunk(7, [
        '  const banner = `<img src=x onerror="alert(1)">`;',
        "  return <div dangerouslySetInnerHTML={{ __html: banner }} />;",
      ]),
    ],
  },
];

const manyFiles = Array.from({ length: 120 }, (_, i) => ({
  filename: `packages/ui/src/generated/component-${i}/component-${i}.tsx`,
  hunks: [hunk(1, [`export const Component${i} = () => null;`])],
}));

const shared = {
  onOpenChange: noop,
  onSelectFile: noop,
  onSelectLine: noop,
  open: true,
};

export const prSearchEntry = defineEntry(
  PrSearch,
  {
    "crowd-60": {
      props: {
        ...shared,
        files: crowd,
        initialQuery: "register",
        mode: "text",
      },
    },
    "files-crowd": {
      props: { ...shared, files: manyFiles, initialQuery: "", mode: "files" },
    },
    "files-empty-query": {
      props: { ...shared, files, initialQuery: "", mode: "files" },
    },
    "files-matches": {
      props: { ...shared, files, initialQuery: "gamma", mode: "files" },
    },
    "files-no-matches": {
      props: { ...shared, files, initialQuery: "zzzz", mode: "files" },
    },
    "markup-as-text": {
      props: {
        ...shared,
        files: markupFiles,
        initialQuery: "img",
        mode: "text",
      },
    },
    "overflow-long-hit": {
      props: {
        ...shared,
        files: wideHitFile,
        initialQuery: "gamma",
        mode: "text",
      },
    },
    "overflow-long-line": {
      props: {
        ...shared,
        files: wideFile,
        initialQuery: "gamma",
        mode: "text",
      },
    },
    "overflow-unbreakable-query": {
      props: {
        ...shared,
        files,
        initialQuery: "unmatchabletoken".repeat(45),
        mode: "text",
      },
    },
    "text-empty-query": {
      props: { ...shared, files, initialQuery: "", mode: "text" },
    },
    "text-first-line": {
      props: {
        ...shared,
        files: firstAndLast,
        initialQuery: "EDGE",
        mode: "text",
      },
    },
    "text-hunk-boundary": {
      props: {
        ...shared,
        files: boundaryFile,
        initialQuery: "out.push",
        mode: "text",
      },
    },
    "text-last-line": {
      props: {
        ...shared,
        files: firstAndLast,
        initialQuery: "last",
        mode: "text",
      },
    },
    "text-no-matches": {
      props: { ...shared, files, initialQuery: "qqqq", mode: "text" },
    },
    "text-snippets": {
      props: { ...shared, files, initialQuery: "gamma", mode: "text" },
    },
    unicode: {
      props: {
        ...shared,
        files: unicodeFiles,
        initialQuery: "さくら",
        mode: "text",
      },
    },
  },
  { dialog: true }
);
