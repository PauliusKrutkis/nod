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
 *
 * The run-* fixtures are sequences, because a diff is never one row: the
 * seams the single-row cases cannot show are del/add replacement pairs
 * reading as one edit, indent guides continuing across neighbouring rows, a
 * wrapped row pushing the rows after it, the threaded underline sitting
 * between plain rows, and a hunk band separating two context runs. The
 * app's run container is the desktop's review-list (store-fed, virtualized,
 * outside this package) and its `.qf-diff` wrapper is app CSS, so the runs
 * stack the real rows bare, exactly as honest as the row's own carried type
 * (see diff-row.css). The sandwich borrows the real HunkRow between the
 * runs; no run-only component exists to drift.
 */

import { defineEntry, defineStep } from "../fixtures/fixtures.ts";
import { HunkRow } from "../hunk-row/hunk-row.tsx";
import { DiffRow, type DiffRowProps } from "./diff-row.tsx";

const row = (props: DiffRowProps) => defineStep(DiffRow, props);

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
  "run-context": {
    sequence: [
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">const</span> entry = catalog[name];',
        kind: "context",
        newLine: 212,
        oldLine: 212,
      }),
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">const</span> fixtures = Object.keys(entry.fixtures);',
        kind: "context",
        newLine: 213,
        oldLine: 213,
      }),
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">const</span> first = fixtures[<span class="hljs-number">0</span>] ?? <span class="hljs-string">&quot;&quot;</span>;',
        kind: "context",
        newLine: 214,
        oldLine: 214,
      }),
      row({
        anchor: "RIGHT:215",
        canComment: true,
        fileIndex: 0,
        html: '<span class="hljs-keyword">const</span> dialog = <span class="hljs-title">Boolean</span>(entry.dialog);',
        kind: "add",
        newLine: 215,
      }),
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">return</span> { dialog, first, fixtures };',
        kind: "context",
        newLine: 216,
        oldLine: 215,
      }),
      row({
        fileIndex: 0,
        html: "}",
        kind: "context",
        newLine: 217,
        oldLine: 216,
      }),
    ],
  },
  "run-hunk-sandwich": {
    sequence: [
      row({
        fileIndex: 0,
        html: '  <span class="hljs-keyword">return</span> occurrences.length;',
        kind: "context",
        newLine: 118,
        oldLine: 118,
      }),
      row({
        fileIndex: 0,
        html: "}",
        kind: "context",
        newLine: 119,
        oldLine: 119,
      }),
      defineStep(HunkRow, {
        fileIndex: 0,
        header: "@@ -204,6 +204,31 @@ function renderItem(",
      }),
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">function</span> <span class="hljs-title">renderItem</span>(item: ReviewItem) {',
        kind: "context",
        newLine: 204,
        oldLine: 204,
      }),
      row({
        fileIndex: 0,
        html: '  <span class="hljs-keyword">const</span> key = computeReviewItemKey(item);',
        kind: "context",
        newLine: 205,
        oldLine: 205,
      }),
    ],
  },
  "run-nesting": {
    sequence: [
      row({
        fileIndex: 0,
        guideLvl: 0,
        html: '<span class="hljs-keyword">export</span> <span class="hljs-keyword">function</span> <span class="hljs-title">walkRuns</span>(model: RunModel) {',
        kind: "context",
        newLine: 140,
        oldLine: 140,
      }),
      row({
        fileIndex: 0,
        guideLvl: 1,
        html: '  <span class="hljs-keyword">for</span> (<span class="hljs-keyword">const</span> run <span class="hljs-keyword">of</span> model.runs) {',
        kind: "context",
        newLine: 141,
        oldLine: 141,
      }),
      row({
        fileIndex: 0,
        guideLvl: 2,
        html: '    <span class="hljs-keyword">if</span> (run.kind === <span class="hljs-string">&quot;context&quot;</span>) {',
        kind: "context",
        newLine: 142,
        oldLine: 142,
      }),
      row({
        fileIndex: 0,
        guideLvl: 3,
        html: "      run.rows.forEach((row) =&gt; {",
        kind: "context",
        newLine: 143,
        oldLine: 143,
      }),
      row({
        fileIndex: 0,
        guideLvl: 4,
        html: "        paint(row, model.indent);",
        kind: "context",
        newLine: 144,
        oldLine: 144,
      }),
    ],
  },
  "run-replacement": {
    sequence: [
      row({
        anchor: "RIGHT:96",
        canComment: true,
        fileIndex: 0,
        html: '<span class="hljs-keyword">function</span> <span class="hljs-title">flushPending</span>(queue: RowQueue) {',
        kind: "context",
        newLine: 96,
        oldLine: 96,
      }),
      row({
        anchor: "LEFT:97",
        canComment: true,
        fileIndex: 0,
        html: "  queue.drain();",
        kind: "del",
        oldLine: 97,
      }),
      row({
        anchor: "LEFT:98",
        canComment: true,
        fileIndex: 0,
        html: "  markClean(queue);",
        kind: "del",
        oldLine: 98,
      }),
      row({
        anchor: "RIGHT:97",
        canComment: true,
        fileIndex: 0,
        html: '  <span class="hljs-keyword">const</span> drained = queue.drain();',
        kind: "add",
        newLine: 97,
      }),
      row({
        anchor: "RIGHT:98",
        canComment: true,
        fileIndex: 0,
        html: "  markClean(queue, drained.length);",
        kind: "add",
        newLine: 98,
      }),
      row({
        anchor: "RIGHT:99",
        canComment: true,
        fileIndex: 0,
        html: "}",
        kind: "context",
        newLine: 99,
        oldLine: 99,
      }),
    ],
  },
  "run-threaded": {
    sequence: [
      row({
        fileIndex: 0,
        html: TYPICAL_HTML,
        kind: "context",
        newLine: 41,
        oldLine: 41,
      }),
      row({
        anchor: "RIGHT:42",
        canComment: true,
        fileIndex: 0,
        html: '<span class="hljs-keyword">const</span> backoff = retries * <span class="hljs-number">250</span>;',
        kind: "add",
        newLine: 42,
      }),
      row({
        anchor: "RIGHT:43",
        canComment: true,
        fileIndex: 0,
        html: '<span class="hljs-keyword">await</span> sendReview(verdict, { backoff });',
        kind: "context",
        newLine: 43,
        oldLine: 42,
        threaded: true,
      }),
      row({
        fileIndex: 0,
        html: "queue.push(verdict);",
        kind: "context",
        newLine: 44,
        oldLine: 43,
      }),
      row({
        fileIndex: 0,
        html: "}",
        kind: "context",
        newLine: 45,
        oldLine: 44,
      }),
    ],
  },
  "run-wrapped": {
    sequence: [
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">const</span> token = sign(payload);',
        kind: "context",
        newLine: 6,
        oldLine: 6,
      }),
      row({
        anchor: "RIGHT:7",
        canComment: true,
        fileIndex: 0,
        html: UNBREAKABLE,
        kind: "add",
        newLine: 7,
      }),
      row({
        fileIndex: 0,
        html: '<span class="hljs-keyword">return</span> token;',
        kind: "context",
        newLine: 8,
        oldLine: 7,
      }),
    ],
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
