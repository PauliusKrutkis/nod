/**
 * The indices come from fuzzy matching, so the hostile cases are indices
 * that disagree with the text: out of range, empty, or over multi-byte
 * characters where slicing by the wrong unit would split a glyph.
 */
import { defineEntry } from "./fixtures.ts";
import { HighlightIndices } from "./highlight.tsx";

export const highlightIndicesEntry = defineEntry(HighlightIndices, {
  cjk: { props: { indices: [0, 2], text: "藤本さくらのレビュー" } },
  "empty-text": { props: { indices: [0], text: "" }, rendersNothing: true },
  every: { props: { indices: [0, 1, 2, 3], text: "diff" } },
  none: { props: { text: "review-header.tsx" } },
  "out-of-range": { props: { indices: [2, 99], text: "kbd" } },
  typical: { props: { indices: [0, 5, 6], text: "fixup search pane" } },
});
