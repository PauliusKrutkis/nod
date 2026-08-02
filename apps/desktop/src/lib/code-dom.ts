/**
 * DOM hit-testing and selection offsets for diff code lines (.qf-code cells):
 * resolving the code cell / word / caret under a pointer, and pinning document
 * selections to character offsets that survive a marks repaint. Pure DOM — no
 * React.
 */
import {
  type OccurrenceSpec,
  occurrenceSpecFromSelection,
} from "./occurrences.ts";

const RE_WORD = /\w/;
const RE_WORD_2 = /\w/;

export type OccState = OccurrenceSpec & { fileIndex: number };

export interface PointerWord {
  anchor: string;
  column: number;
  range: Range;
  spec: OccState;
}

/**
 * A document selection pinned to a diff code line as character offsets — the
 * form that survives the line's text nodes being replaced by a marks repaint.
 * (hljs spans and marks never add or drop characters, so text offsets within
 * a .qf-code element are stable across repaints.)
 */
export interface CapturedSelection {
  code: Element;
  end: number;
  start: number;
}

function codeAround(el: Element | null | undefined): Element | null {
  const code = el?.closest(".qf-code") ?? null;
  return code && !el?.closest(".qf-row-hunk") ? code : null;
}

/** Resolve the code cell under a pointer, including trailing padding where
 *  `elementFromPoint` returns null because no glyph is painted there. */
export function codeAtPoint(x: number, y: number): Element | null {
  const fromTarget = codeAround(document.elementFromPoint(x, y));
  if (fromTarget) {
    return fromTarget;
  }
  for (const row of document.querySelectorAll(".qf-row:not(.qf-row-hunk)")) {
    const code = row.querySelector(".qf-code");
    if (!code) {
      continue;
    }
    const box = code.getBoundingClientRect();
    if (y >= box.top && y <= box.bottom && x >= box.left && x <= box.right) {
      return code;
    }
  }
  return null;
}

/** True when a click lands in the code cell's trailing padding, past the text. */
export function isPastLineContent(
  code: Element,
  x: number,
  y: number
): boolean {
  const box = code.getBoundingClientRect();
  if (y < box.top || y > box.bottom) {
    return false;
  }
  if (x >= box.right - 12) {
    return true;
  }
  let maxRight = box.left;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.textContent?.trim()) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      maxRight = Math.max(maxRight, rect.right);
    }
  }
  return x > maxRight + 2;
}

function fileIndexOfElement(el: Element): number | null {
  const v = el.closest("[data-file-index]")?.getAttribute("data-file-index");
  const n = v === null ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function caretNodeAtPoint(
  x: number,
  y: number
): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      const { offset, offsetNode } = pos;
      return { node: offsetNode, offset };
    }
    return null;
  }
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      return { node: r.startContainer, offset: r.startOffset };
    }
  }
  return null;
}

function wordBoundsInText(text: string, col: number): [number, number] | null {
  let s = col;
  let e = col;
  while (s > 0 && RE_WORD.test(text[s - 1])) {
    s -= 1;
  }
  while (e < text.length && RE_WORD_2.test(text[e])) {
    e += 1;
  }
  if (s === e) {
    return null;
  }
  return [s, e];
}

export function occurrenceOriginFromPoint(
  x: number,
  y: number
): { anchor: string; column: number } | null {
  const caret = caretNodeAtPoint(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const code = codeAround(caret.node.parentElement);
  if (!code) {
    return null;
  }
  const anchor = caret.node.parentElement
    ?.closest("[data-anchor]")
    ?.getAttribute("data-anchor");
  if (!anchor) {
    return null;
  }
  const nodeStart = codeColumnOf(code, caret.node);
  if (nodeStart === null) {
    return null;
  }
  const text = code.textContent ?? "";
  const col = nodeStart + caret.offset;
  const bounds = wordBoundsInText(text, col);
  return { anchor, column: bounds ? bounds[0] : col };
}

/**
 * The whole word whose glyphs sit under (x, y) in a diff code line: its
 * occurrence spec, where it starts (row anchor + code column, the coordinates
 * occurrenceMatches reports matches in), and a live Range over it for painting.
 * Null unless the pointer is really on the word — its trailing padding and the
 * gaps between tokens are not it.
 */
export function wordAtPoint(x: number, y: number): PointerWord | null {
  const caret = caretNodeAtPoint(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const parent = caret.node.parentElement;
  if (!parent) {
    return null;
  }
  const code = codeAround(parent);
  if (!code) {
    return null;
  }
  const fileIndex = fileIndexOfElement(code);
  const anchor = parent.closest("[data-anchor]")?.getAttribute("data-anchor");
  if (fileIndex === null || !anchor) {
    return null;
  }

  const text = code.textContent ?? "";
  const nodeStart = codeColumnOf(code, caret.node);
  if (nodeStart === null) {
    return null;
  }
  const bounds = wordBoundsInText(text, nodeStart + caret.offset);
  if (!bounds) {
    return null;
  }
  const [s, e] = bounds;

  const start = codePositionAt(code, s);
  const end = codePositionAt(code, e);
  if (!(start && end)) {
    return null;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const hit = Array.from(range.getClientRects()).some(
    (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  );
  if (!hit) {
    return null;
  }
  const spec = occurrenceSpecFromSelection(text.slice(s, e));
  return spec
    ? { anchor, column: s, range, spec: { ...spec, fileIndex } }
    : null;
}

export function specFromDomSelection(): OccState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return null;
  }
  const container = sel.getRangeAt(0).commonAncestorContainer;
  const el = container instanceof Element ? container : container.parentElement;

  const code = codeAround(el);
  if (!code) {
    return null;
  }
  const fileIndex = fileIndexOfElement(code);
  if (fileIndex === null) {
    return null;
  }
  const spec = occurrenceSpecFromSelection(sel.toString());
  return spec ? { ...spec, fileIndex } : null;
}

/**
 * Text offset of `target`'s start within its .qf-code element. hljs spans and
 * marks never add or drop characters, so this offset IS the code column.
 */
function codeColumnOf(code: Element, target: Node): number | null {
  let offset = 0;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === target) {
      return offset;
    }
    offset += node.data.length;
  }
  return null;
}

/** The (text node, local offset) at a line-level code column — the inverse of
 *  codeColumnOf, for building Ranges across mark-fragmented lines. */
function codePositionAt(
  code: Element,
  column: number
): { node: Text; offset: number } | null {
  let offset = 0;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (column <= offset + node.data.length) {
      return { node, offset: column - offset };
    }
    offset += node.data.length;
  }
  return null;
}

/**
 * The occurrence an occ-spec commit came from: the row anchor and code column
 * of the caret / selection start, when it sits inside a diff code line.
 */
export function occurrenceOriginFromDom(): {
  anchor: string;
  column: number;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const el = node.parentElement;
  const code = el?.closest(".qf-code");
  const anchor = el?.closest("[data-anchor]")?.getAttribute("data-anchor");
  if (!(code && anchor)) {
    return null;
  }
  const base = codeColumnOf(code, node);
  return base === null ? null : { anchor, column: base + range.startOffset };
}

/** The current selection as offsets within its diff code line, if it has one. */
export function captureCodeSelection(): CapturedSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const el = container instanceof Element ? container : container.parentElement;
  const code = el?.closest(".qf-code");
  if (!code) {
    return null;
  }
  let offset = 0;
  let start = -1;
  let end = -1;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === range.startContainer) {
      start = offset + range.startOffset;
    }
    if (node === range.endContainer) {
      end = offset + range.endOffset;
    }
    offset += node.data.length;
  }
  if (start < 0 || end < 0 || start >= end) {
    return null;
  }
  return { code, end, start };
}

/** Re-selects the captured offsets over the element's current text nodes. */
export function restoreCodeSelection({
  code,
  start,
  end,
}: CapturedSelection): void {
  if (!code.isConnected) {
    return;
  }
  let offset = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.data.length;
    if (!startNode && start < offset + len) {
      startNode = node;
      startOffset = start - offset;
    }
    if (!endNode && end <= offset + len) {
      endNode = node;
      endOffset = end - offset;
    }
    offset += len;
  }
  if (!(startNode && endNode)) {
    return;
  }
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection();
  if (!sel) {
    return;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
