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
 * caller wrapped in), and it is parsed into a detached `<template>` — never
 * attached to the document, so the string is inert regardless of its contents
 * — then walked into React nodes. Only the tag name and className survive the
 * walk: no attribute, event handler, or URL from the source line can reach the
 * live DOM, which is why the cell never needs `dangerouslySetInnerHTML`.
 *
 * `guideLvl` drives the indent-guide custom property; rows without indent
 * guides omit it.
 */

import { type CSSProperties, createElement, type ReactNode } from "react";
import "./code-cell.css";

function domNodeToReactNode(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  const children = Array.from(el.childNodes).map((child, i) =>
    domNodeToReactNode(child, `${key}-${i}`)
  );
  return createElement(
    el.tagName.toLowerCase(),
    { className: el.className || undefined, key },
    ...children
  );
}

function highlightHtmlToNodes(html: string): ReactNode[] {
  if (html.length === 0) {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes).map((node, i) =>
    domNodeToReactNode(node, String(i))
  );
}

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
