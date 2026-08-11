/**
 * The header is whatever text followed `@@ … @@` in the patch, which is
 * whatever the forge's function-context heuristic found — an unbounded string
 * from a machine, so it gets the unbounded-string treatment: the enclosing
 * signature of a deeply nested member, a minified line with no spaces, and
 * non-Latin identifiers.
 *
 * The empty header is not hypothetical: a patch whose first line is not a
 * `@@` marker (some forges' rename-only or mode-only patches) yields a hunk
 * with `header: ""`, and the band still has to hold its shape and stay
 * clickable.
 *
 * The long header is a couple of hundred characters, not a couple of
 * thousand: the band wraps rather than truncating, so more length only buys a
 * screenshot too tall to review (the same reason diff-row's does).
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { HunkRow } from "./hunk-row.tsx";

export const hunkRowEntry = defineEntry(HunkRow, {
  collapsed: {
    props: {
      collapsed: true,
      fileIndex: 2,
      header: "@@ -1,7 +1,9 @@ export function ReviewList(",
    },
  },
  empty: { props: { fileIndex: 0, header: "" } },
  "markup-as-text": {
    props: {
      fileIndex: 0,
      header: '@@ -1 +1 @@ <img src=x onerror="alert(1)">',
    },
  },
  overflow: {
    props: {
      fileIndex: 0,
      header: `@@ -204,6 +204,31 @@ ${"deeplyNestedNamespace.".repeat(8)}handler`,
    },
  },
  typical: {
    props: {
      fileIndex: 0,
      header: "@@ -204,6 +204,31 @@ function renderItem(",
    },
  },
  unicode: {
    props: {
      fileIndex: 0,
      header: "@@ -12,4 +12,4 @@ function 説明を描画(محمد, 🦊)",
    },
  },
});
