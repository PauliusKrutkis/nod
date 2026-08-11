/**
 * The `@@ … @@` band that opens a hunk, and the control that collapses it.
 *
 * A hunk header is a row: it wears `.qf-row` so it lines up column-for-column
 * with the code above and below it, and every DOM helper that walks the diff
 * excludes it by `.qf-row:not(.qf-row-hunk)` — occurrence tracking, the column
 * math, the cursor model. That is why this file loads the row's stylesheet
 * alongside its own, and why the class pair is contract rather than styling.
 *
 * The header text is plain text, not highlighted markup, so it renders in a
 * bare `.qf-code` rather than through the code cell: nothing here is ever
 * marked, tokenized, or clicked through to an occurrence.
 */

import "../diff-row/diff-row.css";
import "./hunk-row.css";

export function HunkRow({
  collapsed = false,
  fileIndex,
  header,
  onToggle,
}: {
  collapsed?: boolean;
  fileIndex: number;
  header: string;
  onToggle?: () => void;
}) {
  return (
    <button
      className="qf-row qf-row-hunk"
      data-file-index={fileIndex}
      onClick={onToggle}
      type="button"
    >
      <span className="qf-gutter qf-gutter-old" />
      <span className="qf-gutter qf-gutter-new" />
      <span className="qf-marker">{collapsed ? "▸" : ""}</span>
      <code className="qf-code">{header}</code>
    </button>
  );
}
