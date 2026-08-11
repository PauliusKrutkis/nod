/**
 * `html` arrives from the highlighter as an HTML string, so the hostile cases
 * are string cases plus two markup ones: the escaped payload the real pipeline
 * produces (`&lt;img …&gt;` — it must read as text on screen), and raw markup,
 * which must survive the DOM walk stripped of every attribute. Whitespace,
 * tabs and an unbreakable token are the layout cases — a code cell wraps
 * rather than scrolling its row, and only pixels can prove that.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { CodeCell } from "./code-cell.tsx";

const UNBREAKABLE = "nod-".repeat(128);

export const codeCellEntry = defineEntry(CodeCell, {
  empty: { props: { html: "" } },
  "indent-guides": {
    props: {
      guideLvl: 4,
      html: '        <span class="hljs-keyword">return</span> rows.map(paint);',
    },
  },
  "markup-as-text": {
    props: { html: "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;" },
  },
  overflow: { props: { html: UNBREAKABLE } },
  "raw-markup": { props: { html: '<img src=x onerror="alert(1)">' } },
  tabs: {
    props: { html: '\t\t<span class="hljs-keyword">if</span> (open) {' },
  },
  typical: {
    props: {
      html: '<span class="hljs-keyword">const</span> retries = <span class="hljs-number">3</span>; <span class="hljs-comment">// bounded</span>',
    },
  },
  unicode: {
    props: {
      html: 'const 説明 = "محمد الأمين"; <span class="hljs-comment">// 🦊‍🔥 レビュー</span>',
    },
  },
  whitespace: { props: { html: "      padded on both sides      " } },
});
