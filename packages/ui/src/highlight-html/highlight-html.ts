/**
 * Turns a highlighted code line — hljs token spans, plus any `<mark>` layers
 * the caller wrapped in — into React nodes. The string is parsed inside a
 * detached `<template>`, never attached to the document, so it is inert
 * regardless of its contents, and only the tag name and className survive the
 * walk: no attribute, event handler, or URL from the source line can reach the
 * live DOM. That is why the code surfaces (code-cell, pr-search) render
 * host-supplied highlight HTML without dangerouslySetInnerHTML.
 */

import { createElement, type ReactNode } from "react";

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

export function highlightHtmlToNodes(html: string): ReactNode[] {
  if (html.length === 0) {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes).map((node, i) =>
    domNodeToReactNode(node, String(i))
  );
}
