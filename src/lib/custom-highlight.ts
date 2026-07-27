/**
 * The CSS Custom Highlight API, behind a null guard and a local type.
 *
 * Painting a Range styles text without owning an element for it, which is the
 * only way to decorate a word that React renders as part of a larger innerHTML
 * blob. Style the registered name with `::highlight(name)` in CSS.
 *
 * Typed here because lib.dom declares HighlightRegistry with `forEach` alone,
 * not the maplike `set`/`delete` it actually ships. Engines without the API
 * (WebKit before Safari 17.2) yield null, so callers lose the paint and nothing
 * else — never gate behaviour on this, only decoration.
 */

interface CustomHighlights {
  delete: (name: string) => void;
  set: (name: string, highlight: Highlight) => void;
}

export function highlightRegistry(): CustomHighlights | null {
  if (typeof Highlight === "undefined") {
    return null;
  }
  const registry = (CSS as unknown as { highlights?: CustomHighlights })
    .highlights;
  return registry ?? null;
}
