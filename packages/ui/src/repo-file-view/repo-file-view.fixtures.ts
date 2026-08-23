/**
 * The view's space is where the hit sits in the file: mid-file (the normal
 * case, window untouched), first line (no earlier-lines clip), and a hit
 * deep inside a file long enough to clip both ends — the clip rows must
 * count what they hide. `loading` is the null-lines state the host shows
 * while the blob is in flight. Hostile corners: an unbreakable minified
 * line that must scroll inside the body rather than widen the pane,
 * markup-as-text (lines are walked into nodes, never injected), and
 * unicode content with a CJK path. No fixture supplies highlightLine, so
 * every case proves the escape-and-mark default.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { RepoFileView } from "./repo-file-view.tsx";

const FILE_LINES: string[] = [
  "import { poll } from './poll.ts';",
  "",
  "const RETRY_BASE_MS = 200;",
  "let retryLimit = 3;",
  "",
  "export function withRetry(fn: () => Promise<void>) {",
  "  let attempt = 0;",
  "  while (attempt < retryLimit) {",
  "    attempt += 1;",
  "  }",
  "}",
];

const LONG_FILE: string[] = Array.from(
  { length: 2600 },
  (_, i) => `const filler${i + 1} = ${i + 1}; // retryLimit shadows nothing`
);

export const repoFileViewEntry = defineEntry(RepoFileView, {
  "hit-mid-file": {
    props: {
      filename: "src/lib/retry.ts",
      line: 4,
      lines: FILE_LINES,
      query: "retryLimit",
    },
  },
  "hit-first-line": {
    props: {
      filename: "src/lib/retry.ts",
      line: 1,
      lines: FILE_LINES,
      query: "poll",
    },
  },
  "clipped-both-ends": {
    props: {
      filename: "src/generated/fixtures.ts",
      line: 1300,
      lines: LONG_FILE,
      query: "filler1300",
    },
  },
  loading: {
    props: {
      filename: "src/lib/retry.ts",
      line: 4,
      lines: null,
      query: "retryLimit",
    },
  },
  overflow: {
    props: {
      filename: "dist/bundle.min.js",
      line: 2,
      lines: [
        "// prettier-ignore",
        `export const blob=${'"x".repeat(1)+'.repeat(400)}"";`,
      ],
      query: "blob",
    },
  },
  "markup-as-text": {
    props: {
      filename: "src/<b>bold</b>.ts",
      line: 2,
      lines: [
        "<script>alert(1)</script>",
        "<img onerror=alert(2) src=x> stays text",
        "&amp; renders as itself",
      ],
      query: "alert",
    },
  },
  unicode: {
    props: {
      filename: "src/設計/検索.ts",
      line: 2,
      lines: [
        "const 名前 = '検索';",
        "// ここが一致した行 — retryLimit",
        "export default 名前;",
      ],
      query: "retryLimit",
    },
  },
});
