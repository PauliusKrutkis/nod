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
 *
 * run-20, run-50 and run-100 are the review-scale runs: whole hunks with
 * several distinct edits each (del+add replacement blocks of varying sizes,
 * a pure-addition block, a pure-deletion block, context stretches between
 * them), because a real review hunk is diff-heavy, not one edit in a sea of
 * context. What a 100-row cell pins that a 6-row one cannot: gutter
 * alignment sustained down a long column of 3- and 4-digit line numbers,
 * indent-guide continuity across dozens of neighbouring rows and depths, a
 * wrapped row shoving the run below it from the middle rather than the edge
 * of a 3-row specimen, and the plain render density of a review-sized cell.
 * The short runs above stay: they are the readable specimens of one seam
 * each, the scale runs are where the seams have to survive repetition.
 * run-20 is written out row by row; run-50 and run-100 are composed by
 * buildRun from named blocks (one block per edited function), so the
 * line-number arithmetic and the LEFT/RIGHT anchor rule cannot drift from
 * the rows. The blocks feed authored plain lines through hl(), a fixed
 * keyword/string/number wrapper, standing in for the hljs spans the host
 * would send; kind-only single rows (add, del, context, minimal) were
 * subsumed by the runs and removed.
 */

import { defineEntry, defineStep } from "../fixtures/fixtures.ts";
import { HunkRow } from "../hunk-row/hunk-row.tsx";
import { DiffRow, type DiffRowKind, type DiffRowProps } from "./diff-row.tsx";

const row = (props: DiffRowProps) => defineStep(DiffRow, props);

const UNBREAKABLE = `const ${"nod".repeat(64)} = 1;`;

const TYPICAL_HTML =
  '<span class="hljs-keyword">const</span> retries = <span class="hljs-number">3</span>; <span class="hljs-comment">// bounded</span>';

/* The scale runs' line payloads are authored as plain (entity-escaped) code
   and run through hl(), which wraps the token classes the app's highlighter
   would have sent. A fixed replacement, not a highlighter: deterministic,
   good enough for pixels, and it keeps a hundred authored lines readable. */
const STRING_RE = /&quot;.*?&quot;/g;
const KEYWORD_RE =
  /\b(?:break|const|continue|export|for|function|if|let|new|of|return|while)\b/g;
const TITLE_RE = /(<span class="hljs-keyword">function<\/span>) (\w+)\(/g;
const NUMBER_RE = /\b\d+\b/g;

const hl = (line: string) =>
  line
    .replace(STRING_RE, '<span class="hljs-string">$&</span>')
    .replace(KEYWORD_RE, '<span class="hljs-keyword">$&</span>')
    .replace(TITLE_RE, '$1 <span class="hljs-title">$2</span>(')
    .replace(NUMBER_RE, '<span class="hljs-number">$&</span>');

interface RunLine {
  guideLvl?: number;
  html: string;
  kind: DiffRowKind;
  threaded?: boolean;
}

const ctx = (line: string, guideLvl?: number): RunLine => ({
  guideLvl,
  html: hl(line),
  kind: "context",
});

const ins = (line: string, guideLvl?: number): RunLine => ({
  guideLvl,
  html: hl(line),
  kind: "add",
});

const cut = (line: string, guideLvl?: number): RunLine => ({
  guideLvl,
  html: hl(line),
  kind: "del",
});

const threadedCtx = (line: string, guideLvl?: number): RunLine => ({
  ...ctx(line, guideLvl),
  threaded: true,
});

/* Threads line numbers and comment anchors through a run: context and del
   rows consume an old line, context and add rows consume a new one, dels
   anchor LEFT and everything else RIGHT — the same bookkeeping the desktop's
   patch parser does, so a hand-miscounted gutter cannot happen at 100 rows. */
const buildRun = (
  oldStart: number,
  newStart: number,
  lines: readonly RunLine[]
) => {
  let oldNext = oldStart;
  let newNext = newStart;
  return lines.map((line) => {
    const oldLine = line.kind === "add" ? null : oldNext;
    const newLine = line.kind === "del" ? null : newNext;
    if (oldLine !== null) {
      oldNext += 1;
    }
    if (newLine !== null) {
      newNext += 1;
    }
    return row({
      anchor: line.kind === "del" ? `LEFT:${oldLine}` : `RIGHT:${newLine}`,
      canComment: true,
      fileIndex: 0,
      guideLvl: line.guideLvl,
      html: line.html,
      kind: line.kind,
      newLine,
      oldLine,
      threaded: line.threaded,
    });
  });
};

/* run-50, block 1 of 5 (22 rows): the highlighter's frame-budget loop gets
   its dequeue rewritten (3 del + 5 add) and its return shape widened
   (1 del + 1 add) inside 12 rows of surviving context. */
const FLUSH_QUEUE_REWORK: readonly RunLine[] = [
  ctx("export function flushHighlightQueue(budget: number) {", 0),
  ctx("  const queue = highlightQueueFor(activeFile);", 1),
  ctx("  const started = performance.now();", 1),
  ctx("  let painted = 0;", 1),
  ctx("  while (queue.length &gt; 0) {", 1),
  cut("    const next = queue.shift();", 2),
  cut("    if (!next) { break; }", 2),
  cut("    paintRow(next);", 2),
  ins("    const next = queue.dequeue();", 2),
  ins("    if (next === undefined) {", 2),
  ins("      break;", 3),
  ins("    }", 2),
  ins("    painted += paintRow(next);", 2),
  ctx("    if (performance.now() - started &gt; budget) {", 2),
  ctx("      deferRemainder(queue);", 3),
  ctx("      break;", 3),
  ctx("    }", 2),
  ctx("  }", 1),
  cut("  return painted;", 1),
  ins("  return { painted, remaining: queue.length };", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-50, block 2 of 5 (8 rows): a pure-addition block, the stall counter
   that did not exist on the left side at all. */
const STALL_REPORT_ADDED: readonly RunLine[] = [
  ins("export function reportHighlightStall(remaining: number) {", 0),
  ins("  if (remaining === 0) {", 1),
  ins("    return;", 2),
  ins("  }", 1),
  ins("  telemetry.count(&quot;highlight.stall&quot;, remaining);", 1),
  ins("  log.debug(&quot;highlight queue stalled&quot;, { remaining });", 1),
  ins("}", 0),
  ctx(""),
];

/* run-50, block 3 of 5 (11 rows): the premount call gains an options bag
   whose one-liner passes 200 characters, so the wrapped row sits mid-run
   and the rows after it must keep their gutters. */
const PRIME_VISIBLE_WRAP: readonly RunLine[] = [
  ctx("export function primeVisibleRows(rows: readonly RowHandle[]) {", 0),
  ctx("  for (const handle of rows) {", 1),
  cut("    handle.mount();", 2),
  cut("    handle.markPrimed();", 2),
  ins("    if (handle.primed) { continue; }", 2),
  ins(
    "    handle.mount({ reason: &quot;idle-premount&quot;, priority: computePremountPriority(handle.fileIndex, handle.anchor, viewport.firstVisibleAnchor, viewport.lastVisibleAnchor), signal: premountController.signal });",
    2
  ),
  ins("    handle.markPrimed();", 2),
  ctx("  }", 1),
  ctx("  viewport.notePrimedBatch(rows.length);", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-50, block 4 of 5 (4 rows): a pure-deletion block, the deprecated
   prime-everything path removed whole. */
const LEGACY_PRIME_REMOVED: readonly RunLine[] = [
  cut("export function legacyPrimeAll(rows: RowHandle[]) {", 0),
  cut("  rows.forEach((handle) =&gt; handle.mount());", 1),
  cut(
    "  console.warn(&quot;primeAll is deprecated, use primeVisibleRows&quot;);",
    1
  ),
  cut("}", 0),
];

/* run-50, block 5 of 5 (5 rows): trailing context after the last edit. */
const QUEUE_TAIL: readonly RunLine[] = [
  ctx("export const HIGHLIGHT_BUDGET_MS = 6;", 0),
  ctx(""),
  ctx("export function queueDepth() {", 0),
  ctx("  return queue.length;", 1),
  ctx("}", 0),
];

/* run-100, block 1 of 8 (14 rows): advanceOccurrence learns to align the
   viewport (2 del + 4 add). */
const ADVANCE_OCCURRENCE: readonly RunLine[] = [
  ctx(
    "export function advanceOccurrence(state: ReviewState, dir: 1 | -1) {",
    0
  ),
  ctx("  const marks = state.occurrences;", 1),
  ctx("  if (marks.length === 0) {", 1),
  ctx("    return state;", 2),
  ctx("  }", 1),
  ctx("  const current = marks.indexOf(state.currentMark);", 1),
  cut("  const next = (current + dir + marks.length) % marks.length;", 1),
  cut("  return { ...state, currentMark: marks[next] };", 1),
  ins("  const wrapped = (current + dir + marks.length) % marks.length;", 1),
  ins("  const target = marks[wrapped];", 1),
  ins("  scrollHandle.alignToAnchor(target.anchor, &quot;center&quot;);", 1),
  ins("  return { ...state, currentMark: target };", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-100, block 2 of 8 (20 rows): the sweep's counting shortcut becomes a
   column walk (3 del + 6 add), five indent levels deep. */
const SWEEP_OCCURRENCES: readonly RunLine[] = [
  ctx(
    "export function sweepOccurrences(word: string, files: readonly PatchFile[]) {",
    0
  ),
  ctx("  const found: OccurrenceMark[] = [];", 1),
  ctx("  for (const [fileIndex, file] of files.entries()) {", 1),
  ctx("    for (const hunk of file.hunks) {", 2),
  ctx("      for (const row of hunk.rows) {", 3),
  cut("        const hits = row.text.split(word).length - 1;", 4),
  cut("        if (hits &gt; 0) found.push(markFor(row, hits));", 4),
  cut("        continue;", 4),
  ins("        if (row.kind === &quot;del&quot; && !options.includeLeft) {", 4),
  ins("          continue;", 5),
  ins("        }", 4),
  ins("        for (const column of wordColumns(row.text, word)) {", 4),
  ins("          found.push(markFor(fileIndex, row, column));", 5),
  ins("        }", 4),
  ctx("      }", 3),
  ctx("    }", 2),
  ctx("  }", 1),
  ctx("  return found;", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-100, block 3 of 8 (14 rows): a pure-addition block inside moveCursor,
   the out-of-viewport guard. */
const MOVE_CURSOR: readonly RunLine[] = [
  ctx("export function moveCursor(state: ReviewState, step: number) {", 0),
  ctx("  const rows = state.visibleRows;", 1),
  ctx("  const index = clamp(state.cursor + step, 0, rows.length - 1);", 1),
  ctx("  const target = rows[index];", 1),
  ins("  if (target === undefined) {", 1),
  ins("    return state;", 2),
  ins("  }", 1),
  ins("  if (!rowVisible(target, state.viewport)) {", 1),
  ins(
    "    scrollHandle.alignToAnchor(target.anchor, step &gt; 0 ? &quot;bottom&quot; : &quot;top&quot;);",
    2
  ),
  ins("    flashQueue.push(target.anchor);", 2),
  ins("  }", 1),
  ins("  return { ...state, cursor: index };", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-100, block 4 of 8 (11 rows): threadAnchors starts reporting orphans
   (1 del + 2 add); the bucket row carries a live thread underline. */
const THREAD_ANCHORS: readonly RunLine[] = [
  ctx("export function threadAnchors(threads: readonly Thread[]) {", 0),
  ctx("  const anchored = new Map&lt;string, Thread[]&gt;();", 1),
  ctx("  for (const thread of threads) {", 1),
  threadedCtx("    const bucket = anchored.get(thread.anchor) ?? [];", 2),
  ctx("    anchored.set(thread.anchor, [...bucket, thread]);", 2),
  ctx("  }", 1),
  cut("  return anchored;", 1),
  ins("  const orphaned = threads.filter((t) =&gt; t.anchor === null);", 1),
  ins("  return { anchored, orphaned };", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-100, block 5 of 8 (7 rows): a pure-deletion block, the superseded
   find-next path removed whole, its trailing blank line with it. */
const LEGACY_FIND_REMOVED: readonly RunLine[] = [
  cut("export function legacyFindNext(state: ReviewState) {", 0),
  cut("  const marks = state.occurrences;", 1),
  cut(
    "  const index = (marks.indexOf(state.currentMark) + 1) % marks.length;",
    1
  ),
  cut(
    "  window.requestAnimationFrame(() =&gt; flashRow(marks[index].anchor));",
    1
  ),
  cut("  return { ...state, currentMark: marks[index] };", 1),
  cut("}", 0),
  cut(""),
];

/* run-100, block 6 of 8 (11 rows): rowVisible gains slack (2 del + 3 add). */
const ROW_VISIBLE_SLACK: readonly RunLine[] = [
  ctx("export function rowVisible(row: DiffRowModel, viewport: Viewport) {", 0),
  ctx("  const top = viewport.offsetForAnchor(row.anchor);", 1),
  ctx("  if (top === null) {", 1),
  ctx("    return false;", 2),
  ctx("  }", 1),
  cut(
    "  return top &gt;= viewport.scrollTop && top &lt;= viewport.scrollBottom;",
    1
  ),
  cut("}", 0),
  ins("  const slack = viewport.rowHeight * 2;", 1),
  ins(
    "  return top &gt;= viewport.scrollTop - slack && top &lt;= viewport.scrollBottom + slack;",
    1
  ),
  ins("}", 0),
  ctx(""),
];

/* run-100, block 7 of 8 (19 rows): schedulePremount's fire-and-forget body
   becomes a cancellable walk (3 del + 6 add). */
const SCHEDULE_PREMOUNT: readonly RunLine[] = [
  ctx("export function schedulePremount(files: readonly PatchFile[]) {", 0),
  ctx("  const idle = window.requestIdleCallback ?? fallbackIdle;", 1),
  ctx("  let cancelled = false;", 1),
  ctx("  idle(() =&gt; {", 1),
  cut("    files.forEach((file) =&gt; file.hunks.forEach(mountHunk));", 2),
  cut("    telemetry.mark(&quot;premount.done&quot;);", 2),
  cut("    return;", 2),
  ins("    for (const [fileIndex, file] of files.entries()) {", 2),
  ins("      if (cancelled) {", 3),
  ins("        return;", 4),
  ins("      }", 3),
  ins("      mountFileRows(fileIndex, file);", 3),
  ins("    }", 2),
  ctx("  });", 1),
  ctx("  return () =&gt; {", 1),
  ctx("    cancelled = true;", 2),
  ctx("  };", 1),
  ctx("}", 0),
  ctx(""),
];

/* run-100, block 8 of 8 (4 rows): a pure-addition tail, the capped count. */
const OCCURRENCE_COUNT_ADDED: readonly RunLine[] = [
  ins("export const OCCURRENCE_LIMIT = 2000;", 0),
  ins("export function occurrenceCount(state: ReviewState) {", 0),
  ins("  return Math.min(state.occurrences.length, OCCURRENCE_LIMIT);", 1),
  ins("}", 0),
];

export const diffRowEntry = defineEntry(DiffRow, {
  blank: {
    props: {
      fileIndex: 0,
      html: "",
      kind: "context",
      newLine: 91,
      oldLine: 88,
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
  "run-100": {
    sequence: buildRun(1418, 1462, [
      ...ADVANCE_OCCURRENCE,
      ...SWEEP_OCCURRENCES,
      ...MOVE_CURSOR,
      ...THREAD_ANCHORS,
      ...LEGACY_FIND_REMOVED,
      ...ROW_VISIBLE_SLACK,
      ...SCHEDULE_PREMOUNT,
      ...OCCURRENCE_COUNT_ADDED,
    ]),
  },
  "run-20": {
    sequence: [
      row({
        anchor: "RIGHT:240",
        canComment: true,
        fileIndex: 0,
        guideLvl: 0,
        html: '<span class="hljs-keyword">export</span> <span class="hljs-keyword">function</span> <span class="hljs-title">collectAnchors</span>(patch: PatchFile) {',
        kind: "context",
        newLine: 240,
        oldLine: 231,
      }),
      row({
        anchor: "RIGHT:241",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: '  <span class="hljs-keyword">const</span> anchors: AnchorMap = <span class="hljs-keyword">new</span> <span class="hljs-title">Map</span>();',
        kind: "context",
        newLine: 241,
        oldLine: 232,
      }),
      row({
        anchor: "RIGHT:242",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: '  <span class="hljs-keyword">for</span> (<span class="hljs-keyword">const</span> hunk <span class="hljs-keyword">of</span> patch.hunks) {',
        kind: "context",
        newLine: 242,
        oldLine: 233,
      }),
      row({
        anchor: "LEFT:234",
        canComment: true,
        fileIndex: 0,
        guideLvl: 2,
        html: '    <span class="hljs-keyword">const</span> rows = hunk.rows.filter(isCommentable);',
        kind: "del",
        oldLine: 234,
      }),
      row({
        anchor: "LEFT:235",
        canComment: true,
        fileIndex: 0,
        guideLvl: 2,
        html: "    rows.forEach((row) =&gt; anchors.set(row.anchor, row));",
        kind: "del",
        oldLine: 235,
      }),
      row({
        anchor: "RIGHT:243",
        canComment: true,
        fileIndex: 0,
        guideLvl: 2,
        html: '    <span class="hljs-keyword">for</span> (<span class="hljs-keyword">const</span> row <span class="hljs-keyword">of</span> hunk.rows) {',
        kind: "add",
        newLine: 243,
      }),
      row({
        anchor: "RIGHT:244",
        canComment: true,
        fileIndex: 0,
        guideLvl: 3,
        html: '      <span class="hljs-keyword">if</span> (!isCommentable(row)) {',
        kind: "add",
        newLine: 244,
      }),
      row({
        anchor: "RIGHT:245",
        canComment: true,
        fileIndex: 0,
        guideLvl: 4,
        html: '        <span class="hljs-keyword">continue</span>;',
        kind: "add",
        newLine: 245,
      }),
      row({
        anchor: "RIGHT:246",
        canComment: true,
        fileIndex: 0,
        guideLvl: 3,
        html: "      }",
        kind: "add",
        newLine: 246,
      }),
      row({
        anchor: "RIGHT:247",
        canComment: true,
        fileIndex: 0,
        guideLvl: 3,
        html: "      anchors.set(row.anchor, row);",
        kind: "add",
        newLine: 247,
      }),
      row({
        anchor: "RIGHT:248",
        canComment: true,
        fileIndex: 0,
        guideLvl: 2,
        html: "    }",
        kind: "add",
        newLine: 248,
      }),
      row({
        anchor: "RIGHT:249",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: "  }",
        kind: "context",
        newLine: 249,
        oldLine: 236,
      }),
      row({
        anchor: "LEFT:237",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: "  reportOrphans(anchors, patch.path);",
        kind: "del",
        oldLine: 237,
      }),
      row({
        anchor: "LEFT:238",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: "  logAnchorCount(anchors.size);",
        kind: "del",
        oldLine: 238,
      }),
      row({
        anchor: "RIGHT:250",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: '  <span class="hljs-keyword">return</span> anchors;',
        kind: "context",
        newLine: 250,
        oldLine: 239,
      }),
      row({
        anchor: "RIGHT:251",
        canComment: true,
        fileIndex: 0,
        guideLvl: 0,
        html: "}",
        kind: "context",
        newLine: 251,
        oldLine: 240,
      }),
      row({
        anchor: "RIGHT:252",
        canComment: true,
        fileIndex: 0,
        html: "",
        kind: "context",
        newLine: 252,
        oldLine: 241,
      }),
      row({
        anchor: "RIGHT:253",
        canComment: true,
        fileIndex: 0,
        guideLvl: 0,
        html: '<span class="hljs-keyword">export</span> <span class="hljs-keyword">function</span> <span class="hljs-title">hasAnchor</span>(map: AnchorMap, key: string) {',
        kind: "add",
        newLine: 253,
      }),
      row({
        anchor: "RIGHT:254",
        canComment: true,
        fileIndex: 0,
        guideLvl: 1,
        html: '  <span class="hljs-keyword">return</span> map.has(normalizeAnchor(key));',
        kind: "add",
        newLine: 254,
      }),
      row({
        anchor: "RIGHT:255",
        canComment: true,
        fileIndex: 0,
        guideLvl: 0,
        html: "}",
        kind: "add",
        newLine: 255,
      }),
    ],
  },
  "run-50": {
    sequence: buildRun(402, 417, [
      ...FLUSH_QUEUE_REWORK,
      ...STALL_REPORT_ADDED,
      ...PRIME_VISIBLE_WRAP,
      ...LEGACY_PRIME_REMOVED,
      ...QUEUE_TAIL,
    ]),
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
