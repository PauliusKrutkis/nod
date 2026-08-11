/**
 * A diff row is where this app's rendering bugs live, so the fixtures are the
 * lines a reviewer would rather not receive: an unbreakable token with no
 * space to break at (the row must wrap it, never scroll or shear the columns),
 * hard tabs against the 8-column stop the indent guides assume, mixed CJK and
 * bidi text whose advances disagree with the mono grid, a blank line, and line
 * numbers wide enough to test the 52px gutters.
 *
 * The unbreakable token is a couple of hundred characters rather than the
 * couple of thousand the other components use: a row wraps instead of
 * truncating, so length here buys nothing but a screenshot too tall to read.
 *
 * The three <mark> layers each get a case because they are painted by three
 * different rules and stack in one line: intraline word-diff (tinted by the
 * row's own side), find (the current occurrence inverts), and the quieter
 * selection-occurrence wash.
 *
 * `html` is trusted markup by contract — the host builds it — so the markup
 * case is the escaped payload the real highlighter emits for a line
 * containing a tag: it must read as text, and the raw-markup path is already
 * pinned by code-cell's own fixtures.
 *
 * There is no `active` case: the cursor wash is gated on the diff surface's
 * input mode, which is an ancestor the package does not own, so a row
 * specimen is always at rest. `selected` paints the identical iris treatment
 * and is the row's own decision, so that is the one with pixels.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { DiffRow } from "./diff-row.tsx";

const UNBREAKABLE = `const ${"nod".repeat(64)} = 1;`;

const TYPICAL_HTML =
  '<span class="hljs-keyword">const</span> retries = <span class="hljs-number">3</span>; <span class="hljs-comment">// bounded</span>';

export const diffRowEntry = defineEntry(DiffRow, {
  add: {
    props: {
      anchor: "RIGHT:214",
      canComment: true,
      fileIndex: 0,
      html: '  <span class="hljs-keyword">await</span> flush(queue);',
      kind: "add",
      newLine: 214,
    },
  },
  blank: {
    props: {
      fileIndex: 0,
      html: "",
      kind: "context",
      newLine: 91,
      oldLine: 88,
    },
  },
  context: {
    props: {
      anchor: "RIGHT:212",
      canComment: true,
      fileIndex: 0,
      html: TYPICAL_HTML,
      kind: "context",
      newLine: 212,
      oldLine: 209,
    },
  },
  del: {
    props: {
      anchor: "LEFT:210",
      canComment: true,
      fileIndex: 0,
      html: '  <span class="hljs-keyword">await</span> queue.flushAll();',
      kind: "del",
      oldLine: 210,
    },
  },
  "find-current": {
    props: {
      fileIndex: 0,
      html: 'const <mark class="qf-find-mark qf-find-current">zebra</mark> = herd(<mark class="qf-find-mark">zebra</mark>);',
      kind: "context",
      newLine: 75,
      oldLine: 75,
    },
  },
  flash: {
    props: {
      fileIndex: 0,
      flash: true,
      html: TYPICAL_HTML,
      kind: "context",
      newLine: 212,
      oldLine: 209,
    },
  },
  "huge-line-numbers": {
    props: {
      fileIndex: 0,
      html: '<span class="hljs-comment">-- generated, do not edit</span>',
      kind: "context",
      newLine: 1_284_991,
      oldLine: 1_284_802,
    },
  },
  "indent-guides": {
    props: {
      fileIndex: 0,
      guideLvl: 5,
      html: '          <span class="hljs-keyword">return</span> rows.map(paint);',
      indent: "20.406px",
      kind: "context",
      newLine: 61,
      oldLine: 61,
    },
  },
  intraline: {
    props: {
      fileIndex: 0,
      html: 'const retries = <mark class="qf-intra-mark">3</mark>;',
      kind: "add",
      newLine: 41,
    },
  },
  "markup-as-text": {
    props: {
      fileIndex: 0,
      html: "render(&lt;img src=x onerror=&quot;alert(1)&quot;&gt;);",
      kind: "add",
      newLine: 12,
    },
  },
  minimal: {
    props: { fileIndex: 0, html: TYPICAL_HTML, kind: "context" },
  },
  occurrence: {
    props: {
      fileIndex: 0,
      html: '<mark class="qf-occ-mark">queue</mark>.push(item); <span class="hljs-comment">// the same queue</span>',
      kind: "context",
      newLine: 118,
      oldLine: 118,
    },
  },
  overflow: {
    props: {
      anchor: "RIGHT:7",
      canComment: true,
      fileIndex: 0,
      html: UNBREAKABLE,
      kind: "add",
      newLine: 7,
    },
  },
  selected: {
    props: {
      anchor: "RIGHT:212",
      canComment: true,
      fileIndex: 0,
      html: TYPICAL_HTML,
      kind: "context",
      newLine: 212,
      oldLine: 209,
      selected: true,
      selectionEnd: true,
    },
  },
  synthetic: {
    props: {
      fileIndex: 0,
      html: '<span class="hljs-comment">// unchanged, revealed by full-file expansion</span>',
      kind: "context",
      newLine: 4009,
      oldLine: 4009,
      synthetic: true,
    },
  },
  tabs: {
    props: {
      fileIndex: 0,
      html: '\t\t<span class="hljs-keyword">if</span> (open) {\treturn;\t}',
      kind: "context",
      newLine: 33,
      oldLine: 33,
    },
  },
  threaded: {
    props: {
      anchor: "RIGHT:212",
      canComment: true,
      fileIndex: 0,
      html: TYPICAL_HTML,
      kind: "context",
      newLine: 212,
      oldLine: 209,
      threaded: true,
    },
  },
  unicode: {
    props: {
      fileIndex: 0,
      html: 'const 説明 = "محمد الأمين"; <span class="hljs-comment">// 🦊‍🔥 レビュー</span>',
      kind: "add",
      newLine: 8,
    },
  },
});
