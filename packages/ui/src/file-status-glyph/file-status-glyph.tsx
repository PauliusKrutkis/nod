/**
 * The one-letter tile for what happened to a file — A/D/R/C/M, tinted with the
 * same language as the churn counts. Every surface that lists files wears it:
 * the sidebar tree, the diff's file band. It carries its own word as a native
 * title because a lone letter is a legend nobody was given.
 *
 * `status` is a plain string, not a union: it is the forge's word, and forges
 * add words. Anything unrecognised reads as modified — the honest fallback,
 * and the one a diff of an unknown status is most likely to actually be.
 */

import "./file-status-glyph.css";

interface Glyph {
  className: string;
  letter: string;
  title: string;
}

const GLYPHS: Record<string, Glyph> = {
  added: { className: "qf-st-add", letter: "A", title: "Added" },
  copied: { className: "qf-st-ren", letter: "C", title: "Copied" },
  removed: { className: "qf-st-del", letter: "D", title: "Removed" },
  renamed: { className: "qf-st-ren", letter: "R", title: "Renamed" },
};

const MODIFIED: Glyph = {
  className: "qf-st-mod",
  letter: "M",
  title: "Modified",
};

export function FileStatusGlyph({ status }: { status: string }) {
  const glyph = GLYPHS[status] ?? MODIFIED;
  return (
    <span className={`qf-file-glyph ${glyph.className}`} title={glyph.title}>
      {glyph.letter}
    </span>
  );
}
