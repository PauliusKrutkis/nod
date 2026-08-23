/**
 * The whole file behind a repo-search hit, opened in place of the result
 * list so a repo-only match can be read without leaving the review. This is
 * the second consumer of the single code view (docs/ARCHITECTURE.md): every
 * line renders through CodeCell, the paint unit the find/occurrence helpers
 * key on, with the host's `highlightLine` lens supplying syntax colors and
 * query marks — the same escape-and-mark default as the search pane when a
 * fixture brings none.
 *
 * The hit line is the anchor: it scrolls to center on mount and wears the
 * same hit tint as the peek snippet, so the eye lands where the match is.
 * The query is marked on every line, not just the hit — this surface exists
 * because someone searched, and the other occurrences are the context they
 * came for.
 *
 * Files larger than the window are clipped around the hit rather than
 * virtualized: a dialog viewer needs "arrives instantly and scrolls
 * natively" more than it needs the ten-thousandth line, and the clip rows
 * say exactly how much is beyond the window. `lines === null` is the
 * loading state — the host fetches the blob on demand.
 */

import { useLayoutEffect, useRef } from "react";
import { cn } from "../cn/cn.ts";
import { CodeCell } from "../code-cell/code-cell.tsx";
import "./repo-file-view.css";

export type HighlightFileLine = (
  code: string,
  filename: string,
  query: string
) => string;

/** Lines kept on either side of the hit; beyond them the clip rows take
 *  over. One thousand each way reads as "the whole file" for almost every
 *  real source file while keeping the worst-case DOM bounded. Overridable
 *  so a fixture can prove the clipping without rendering two thousand rows
 *  — the gallery's shot frame never stabilizes under that many. */
const WINDOW_RADIUS = 1000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The fixture-friendly default: no syntax colors, query occurrences marked. */
function markQuery(code: string, _filename: string, query: string): string {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return escapeHtml(code);
  }
  const hay = code.toLowerCase();
  let out = "";
  let at = 0;
  let hit = hay.indexOf(needle);
  while (hit !== -1) {
    const end = hit + needle.length;
    out += `${escapeHtml(code.slice(at, hit))}<mark class="q-hl">${escapeHtml(code.slice(hit, end))}</mark>`;
    at = end;
    hit = hay.indexOf(needle, at);
  }
  return out + escapeHtml(code.slice(at));
}

export function RepoFileView({
  filename,
  lines,
  line,
  query,
  highlightLine = markQuery,
  windowRadius = WINDOW_RADIUS,
}: {
  filename: string;
  /** The file's full lines, or null while the host is still fetching. */
  lines: readonly string[] | null;
  /** 1-based line of the hit the view opened on. */
  line: number;
  query: string;
  highlightLine?: HighlightFileLine;
  windowRadius?: number;
}) {
  const hitRef = useRef<HTMLElement>(null);
  const loaded = lines !== null && lines.length > 0;

  useLayoutEffect(() => {
    if (loaded) {
      hitRef.current?.scrollIntoView({ block: "center" });
    }
  }, [loaded]);

  if (!loaded) {
    return (
      <div className="qrfv">
        <FileHead filename={filename} line={line} total={null} />
        <p className="qrfv-empty">Loading the file…</p>
      </div>
    );
  }

  const first = Math.max(1, line - windowRadius);
  const last = Math.min(lines.length, line + windowRadius);

  return (
    <div className="qrfv">
      <FileHead filename={filename} line={line} total={lines.length} />
      <div className="qrfv-body">
        {first > 1 && (
          <p className="qrfv-clip">
            … {first - 1} earlier line{first - 1 === 1 ? "" : "s"}
          </p>
        )}
        {lines.slice(first - 1, last).map((text, i) => {
          const num = first + i;
          const hit = num === line;
          return (
            <span
              className={cn("qrfv-line", hit && "qrfv-line-hit")}
              key={num}
              ref={hit ? hitRef : undefined}
            >
              <span aria-hidden className="qrfv-num">
                {num}
              </span>
              <CodeCell html={highlightLine(text, filename, query)} />
            </span>
          );
        })}
        {last < lines.length && (
          <p className="qrfv-clip">
            … {lines.length - last} later line
            {lines.length - last === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

function FileHead({
  filename,
  line,
  total,
}: {
  filename: string;
  line: number;
  total: number | null;
}) {
  return (
    <p className="qrfv-head">
      <span className="qrfv-path">{filename}</span>
      <span className="qrfv-loc">
        Ln {line}
        {total === null ? "" : ` · ${total} lines`}
      </span>
    </p>
  );
}
