/**
 * The `<code>` cell of a code row: the single unit the find/occurrence DOM
 * helpers key on (`.qf-code`, its `.hljs` inner span, and the text nodes column
 * math walks). Every code-rendering surface must use this cell — rendering an
 * identical cell is what lets one find/occurrence controller drive them all
 * (see "Code view" in docs/ARCHITECTURE.md). Row-level chrome (gutters,
 * markers, `data-anchor`) stays with each caller; this is only the code
 * itself.
 *
 * `html` is a highlighted line (hljs token spans, plus any `<mark>` layers the
 * caller wrapped in), rendered through highlight-html's inert walk, which is
 * why the cell never needs `dangerouslySetInnerHTML`.
 *
 * `guideLvl` drives the indent-guide custom property; rows without indent
 * guides omit it.
 */

import type { CSSProperties } from "react";
import { highlightHtmlToNodes } from "../highlight-html/highlight-html.ts";
import "./code-cell.css";

export function CodeCell({
  html,
  guideLvl = null,
}: {
  html: string;
  guideLvl?: number | null;
}) {
  return (
    <code
      className="qf-code"
      style={
        guideLvl === null
          ? undefined
          : ({ "--qf-lvl": guideLvl } as CSSProperties)
      }
    >
      <span className="hljs">{highlightHtmlToNodes(html)}</span>
    </code>
  );
}
