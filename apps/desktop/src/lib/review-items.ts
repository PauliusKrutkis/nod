/**
 * The review scroll's flattened item model. The whole PR renders as ONE
 * virtualized list (react-virtuoso) — files are groups with sticky headers,
 * and every hunk header, diff row, and comment block is an item. Building the
 * flat list here, as a pure function, gives every consumer the same indexing:
 * the list renders items, the keyboard cursor walks `nav`, find/search jumps
 * resolve `anchorItem`, ]c/[c walks `commentItems`, and the overview ruler
 * turns item indexes into fractions.
 *
 * A comment block shares its parent row's anchor, so `nav` entries carry a
 * `kind` and are indexed by `navKey`, not `fileAnchorKey` — otherwise the two
 * would collide in `navIndexOf` and the cursor could not tell "line 42" from
 * "the conversation on line 42". `navKey(f, a, "row")` is deliberately equal to
 * `fileAnchorKey(f, a)`, so anchor-keyed lookups (`anchorItem`, `openBoxes`,
 * flash keys) are untouched and keep resolving rows.
 *
 * A previewable file (`isImage`) opens its group with an image item. Bitmaps
 * stop there, having no patch; an SVG carries one, so its rows follow the
 * preview and stay navigable, searchable and commentable like any other text.
 *
 * The "ask" item is the inline AI note's slot, anchored under its row like a
 * comment block but off the nav (not a cursor stop). At most one exists —
 * `askItem` points at it — and its content lives outside the model, in
 * use-ask-note.ts.
 */
import type { ChangedFile, PendingComment, ReviewComment } from "../types.ts";
import { type DiffHunk, type DiffRow, parsePatch, rowAnchor } from "./diff.ts";
import { markBlockCommentRows } from "./highlight.ts";
import {
  detectIndentUnit,
  guideLevelsForHunk,
  type IndentUnit,
} from "./indent.ts";
import { type IntralineRanges, intralinePairs } from "./intraline.ts";

/** A stable key for anchoring comments/boxes to a (side, line) location. */
function anchorKey(side: string, line: number): string {
  return `${side}:${line}`;
}

/** A file-scoped anchor key — the openBoxes / anchorItem index key. */
export function fileAnchorKey(fileIndex: number, anchor: string): string {
  return `${fileIndex}:${anchor}`;
}

export type NavKind = "row" | "comments";

/** A cursor-stop key — `fileAnchorKey` for rows, suffixed for comment blocks. */
export function navKey(
  fileIndex: number,
  anchor: string,
  kind: NavKind
): string {
  const base = fileAnchorKey(fileIndex, anchor);
  return kind === "comments" ? `${base}#c` : base;
}

/**
 * Resolve the comment target for a diff row. Synthetic rows (full-file
 * expansion) have real line numbers but are not part of the patch, and the
 * forges reject comments outside it — no target, so every comment affordance
 * (plus button, `c`, drag selection) skips them by the existing target checks.
 */
function rowTarget(row: DiffRow): { line: number; side: string } | null {
  if (row.synthetic) {
    return null;
  }
  if (row.type === "del") {
    return row.oldLine === null ? null : { line: row.oldLine, side: "LEFT" };
  }
  if (row.type === "add" || row.type === "context") {
    return row.newLine === null ? null : { line: row.newLine, side: "RIGHT" };
  }
  return null;
}

/** The line number an anchor key encodes ("SIDE:line"). */
export function anchorLine(anchor: string): number {
  return Number(anchor.slice(anchor.indexOf(":") + 1));
}

/**
 * The neighboring row anchor a line selection may extend to: the immediately
 * adjacent nav row in the same file, same hunk, on the same comment side.
 * Anything else (hunk header, side flip, file boundary) ends the range —
 * multi-line comments are one-side, hunk-contiguous runs. Comment blocks are
 * cursor stops but not selectable lines, so the walk steps over them; a
 * commented line must not dead-end a range.
 */
export function adjacentSelectableAnchor(
  m: ReviewListModel,
  fileIndex: number,
  side: string,
  hunkIndex: number,
  fromAnchor: string,
  delta: 1 | -1
): string | null {
  const idx = m.navIndexOf.get(fileAnchorKey(fileIndex, fromAnchor));
  if (idx === undefined) {
    return null;
  }
  let at = idx + delta;
  while (m.nav[at]?.kind === "comments") {
    at += delta;
  }
  const next = m.nav[at];
  if (!next || next.fileIndex !== fileIndex) {
    return null;
  }
  const item = m.items[next.itemIndex];
  if (item.kind !== "row" || item.hunkIndex !== hunkIndex) {
    return null;
  }
  if (item.target === null || item.target.side !== side) {
    return null;
  }
  return next.anchor;
}

/**
 * Where a fast jump (`f`/`g`) should actually land: the first comment block
 * strictly between the cursor and the arithmetic landing row, else that row.
 * A fast step is a fixed hop over `nav`, not a semantic jump, so without this
 * it sails over a conversation four times in five — and skipping a collapsed
 * thread means never learning it exists.
 *
 * `isRepeat` — the key's auto-repeat, so the key is being held — turns the
 * clamp off: holding means "get me far away", and stopping at every thread
 * would make a comment-dense file unnavigable. An open composer clamps either
 * way, since it holds unsaved text.
 */
export function clampFastStep(
  m: ReviewListModel,
  fromIdx: number,
  delta: number,
  isRepeat: boolean
): number {
  const landing = Math.min(Math.max(fromIdx + delta, 0), m.nav.length - 1);
  if (landing === fromIdx) {
    return landing;
  }
  const from = m.nav[fromIdx];
  const step = landing > fromIdx ? 1 : -1;
  for (let at = fromIdx + step; at !== landing + step; at += step) {
    const entry = m.nav[at];
    if (entry?.kind !== "comments") {
      continue;
    }
    const item = m.items[entry.itemIndex];
    const boxOpen = item?.kind === "comments" && item.boxOpen;
    const ownRow =
      entry.anchor === from?.anchor && entry.fileIndex === from.fileIndex;
    if (ownRow && !boxOpen) {
      continue;
    }
    if (!isRepeat || boxOpen) {
      return at;
    }
  }
  return landing;
}

/**
 * The thread `r`/`x`/`z`/`shift+e` should act on once the cursor is at
 * `itemIndex` — the block's first thread, or null when it holds only a pending
 * comment or an open composer. Shared by every path that moves the cursor onto
 * a comment block so keyboard nav and `q`/`w` cannot arm different things.
 */
export function armedThreadAt(
  m: ReviewListModel,
  files: readonly ChangedFile[],
  itemIndex: number
): { rootId: number; path: string } | null {
  const item = m.items[itemIndex];
  if (item?.kind !== "comments" || item.threads.length === 0) {
    return null;
  }
  return {
    path: files[item.fileIndex]?.filename ?? "",
    rootId: item.threads[0][0].id,
  };
}

/**
 * The comment block `q`/`w` should land on: the nearest one after (or before)
 * the cursor's own position in the item stream, wrapping at the ends. Derived
 * from the cursor rather than a running index, so the cycle always continues
 * from where you are — jumping files or running a find no longer restarts it
 * at the first comment in the PR.
 */
export function adjacentCommentItem(
  m: ReviewListModel,
  fromItem: number,
  delta: number
): number | undefined {
  const list = m.commentItems;
  if (list.length === 0) {
    return undefined;
  }
  if (delta > 0) {
    return list.find((i) => i > fromItem) ?? list[0];
  }
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] < fromItem) {
      return list[i];
    }
  }
  return list.at(-1);
}

/**
 * Group flat review comments into threads (root first, then replies) and
 * index each thread by the anchor of its root comment.
 */
function buildThreads(
  comments: ReviewComment[]
): Map<string, ReviewComment[][]> {
  const byId = new Map<number, ReviewComment>();
  for (const c of comments) {
    byId.set(c.id, c);
  }

  function rootOf(c: ReviewComment): ReviewComment {
    let cur = c;
    const seen = new Set<number>();
    while (cur.inReplyToId !== null && byId.has(cur.inReplyToId)) {
      if (seen.has(cur.id)) {
        break;
      }
      seen.add(cur.id);
      const parent = byId.get(cur.inReplyToId);
      if (!parent) {
        break;
      }
      cur = parent;
    }
    return cur;
  }

  const threadsByRoot = new Map<number, ReviewComment[]>();
  for (const c of comments) {
    const root = rootOf(c);
    const list = threadsByRoot.get(root.id) ?? [];
    list.push(c);
    threadsByRoot.set(root.id, list);
  }

  const out = new Map<string, ReviewComment[][]>();
  for (const [rootId, list] of threadsByRoot) {
    const root = byId.get(rootId);
    if (!root) {
      continue;
    }
    const line = root.line ?? root.originalLine;
    if (line === null) {
      continue;
    }
    const key = anchorKey(root.side || "RIGHT", line);
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const bucket = out.get(key) ?? [];
    bucket.push(sorted);
    out.set(key, bucket);
  }
  return out;
}

export interface ReviewRowItem {
  anchor: string | null;
  fileIndex: number;
  hasAnchored: boolean;
  hunkIndex: number;
  kind: "row";
  row: DiffRow;
  target: { line: number; side: string } | null;
}

export interface ReviewHunkItem {
  collapsed: boolean;
  fileIndex: number;
  header: string;
  hunkIndex: number;
  kind: "hunk";
}

export interface ReviewCommentsItem {
  anchor: string;
  boxOpen: boolean;
  boxStartLine: number | null;
  fileIndex: number;
  kind: "comments";
  pending: PendingComment[];
  rangeContent: string | null;
  rowContent: string | null;
  target: { line: number; side: string } | null;
  threads: ReviewComment[][];
}

export interface ReviewImageItem {
  fileIndex: number;
  kind: "image";
}
export interface ReviewNoteItem {
  fileIndex: number;
  kind: "note";
  text: string;
}
interface ReviewAskItem {
  anchor: string;
  fileIndex: number;
  kind: "ask";
}

export type ReviewItem =
  | ReviewRowItem
  | ReviewHunkItem
  | ReviewCommentsItem
  | ReviewImageItem
  | ReviewNoteItem
  | ReviewAskItem;

export interface ReviewListModel {
  anchorItem: Map<string, number>;
  askItem: number | null;
  commentItems: number[];
  groupCounts: number[];
  groupFirstItem: number[];
  items: ReviewItem[];
  nav: Array<{
    fileIndex: number;
    anchor: string;
    itemIndex: number;
    kind: NavKind;
  }>;
  navIndexOf: Map<string, number>;
}

export interface BuildReviewItemsInput {
  ask: { anchor: string; fileIndex: number } | null;
  collapsed: ReadonlyMap<number, ReadonlySet<number>>;
  commentsByFile: ReadonlyMap<string, ReviewComment[]>;
  expandedRows: ReadonlyMap<number, readonly DiffRow[]>;
  files: readonly ChangedFile[];
  isImage: (file: ChangedFile) => boolean;
  openBoxes: ReadonlyMap<string, number | null>;
  pendingByFile: ReadonlyMap<string, PendingComment[]>;
}

interface HunkBuildContext {
  anchorItem: Map<string, number>;
  ask: BuildReviewItemsInput["ask"];
  askItemBox: { index: number | null };
  commentItems: number[];
  contentByAnchor: Map<string, string>;
  fileIndex: number;
  hunkIndex: number;
  items: ReviewItem[];
  nav: ReviewListModel["nav"];
  navIndexOf: Map<string, number>;
  openBoxes: ReadonlyMap<string, number | null>;
  pendingByAnchor: Map<string, PendingComment[]>;
  threads: Map<string, ReviewComment[][]>;
}

function appendCommentBlock(
  ctx: HunkBuildContext,
  row: DiffRow,
  anchor: string,
  target: { line: number; side: string },
  rowThreads: ReviewComment[][] | undefined,
  rowPending: PendingComment[] | undefined,
  boxOpen: boolean,
  boxStartLine: number | null
): void {
  let rangeContent: string | null = null;
  if (boxOpen && boxStartLine !== null) {
    const lines: string[] = [];
    for (let l = boxStartLine; l <= target.line; l += 1) {
      const c = ctx.contentByAnchor.get(anchorKey(target.side, l));
      if (c !== undefined) {
        lines.push(c);
      }
    }
    rangeContent = lines.join("\n");
  }
  ctx.commentItems.push(ctx.items.length);
  ctx.navIndexOf.set(navKey(ctx.fileIndex, anchor, "comments"), ctx.nav.length);
  ctx.nav.push({
    anchor,
    fileIndex: ctx.fileIndex,
    itemIndex: ctx.items.length,
    kind: "comments",
  });
  ctx.items.push({
    anchor,
    boxOpen,
    boxStartLine: boxOpen ? boxStartLine : null,
    fileIndex: ctx.fileIndex,
    kind: "comments",
    pending: rowPending ?? [],
    rangeContent,
    rowContent: row.content,
    target,
    threads: rowThreads ?? [],
  });
}

function appendHunkRow(ctx: HunkBuildContext, row: DiffRow): void {
  const target = rowTarget(row);
  const anchor = target ? anchorKey(target.side, target.line) : rowAnchor(row);
  if (anchor !== null) {
    ctx.contentByAnchor.set(anchor, row.content);
  }
  const rowThreads = anchor ? ctx.threads.get(anchor) : undefined;
  const rowPending = anchor ? ctx.pendingByAnchor.get(anchor) : undefined;
  const boxStartLine =
    anchor === null
      ? null
      : (ctx.openBoxes.get(fileAnchorKey(ctx.fileIndex, anchor)) ?? null);
  const boxOpen =
    anchor !== null && ctx.openBoxes.has(fileAnchorKey(ctx.fileIndex, anchor));
  const hasAnchored =
    (rowThreads?.length ?? 0) > 0 || (rowPending?.length ?? 0) > 0;
  if (anchor !== null) {
    ctx.anchorItem.set(fileAnchorKey(ctx.fileIndex, anchor), ctx.items.length);
    ctx.navIndexOf.set(navKey(ctx.fileIndex, anchor, "row"), ctx.nav.length);
    ctx.nav.push({
      anchor,
      fileIndex: ctx.fileIndex,
      itemIndex: ctx.items.length,
      kind: "row",
    });
  }
  ctx.items.push({
    anchor,
    fileIndex: ctx.fileIndex,
    hasAnchored,
    hunkIndex: ctx.hunkIndex,
    kind: "row",
    row,
    target,
  });
  if ((hasAnchored || boxOpen) && anchor !== null && target !== null) {
    appendCommentBlock(
      ctx,
      row,
      anchor,
      target,
      rowThreads,
      rowPending,
      boxOpen,
      boxStartLine
    );
  }
  if (
    ctx.ask &&
    anchor !== null &&
    ctx.ask.fileIndex === ctx.fileIndex &&
    ctx.ask.anchor === anchor
  ) {
    ctx.askItemBox.index = ctx.items.length;
    ctx.items.push({ anchor, fileIndex: ctx.fileIndex, kind: "ask" });
  }
}

function appendHunkRows(ctx: HunkBuildContext, hunk: DiffHunk): void {
  for (const row of hunk.rows) {
    if (row.type === "hunk") {
      continue;
    }
    appendHunkRow(ctx, row);
  }
}

/**
 * One expanded file's rows (expand-file.ts) as a single headerless run —
 * context is continuous, so hunk separators would be noise. hunkIndex 0 for
 * every row; selection adjacency still can't cross a change boundary because
 * the synthesized rows between hunks have no target.
 */
function appendExpandedRows(
  ctx: HunkBuildContext,
  rows: readonly DiffRow[]
): void {
  for (const row of rows) {
    if (row.type !== "hunk") {
      appendHunkRow(ctx, row);
    }
  }
}

export function buildReviewItems(
  input: BuildReviewItemsInput
): ReviewListModel {
  const {
    ask,
    files,
    isImage,
    collapsed,
    expandedRows,
    openBoxes,
    commentsByFile,
    pendingByFile,
  } = input;
  const items: ReviewItem[] = [];
  const groupCounts: number[] = [];
  const groupFirstItem: number[] = [];
  const anchorItem = new Map<string, number>();
  const nav: ReviewListModel["nav"] = [];
  const navIndexOf = new Map<string, number>();
  const commentItems: number[] = [];
  const askItemBox: { index: number | null } = { index: null };

  files.forEach((file, fileIndex) => {
    groupFirstItem.push(items.length);
    const startCount = items.length;

    const previewable = isImage(file);
    if (previewable) {
      items.push({ fileIndex, kind: "image" });
    }
    if (!file.patch) {
      if (!previewable) {
        items.push({
          fileIndex,
          kind: "note",
          text:
            file.changes > 0
              ? "Diff not available."
              : "Binary file or no textual diff.",
        });
      }
      groupCounts.push(items.length - startCount);
      return;
    }

    const threads = buildThreads(commentsByFile.get(file.filename) ?? []);
    const pendingByAnchor = new Map<string, PendingComment[]>();
    for (const p of pendingByFile.get(file.filename) ?? []) {
      const k = anchorKey(p.side, p.line);
      const arr = pendingByAnchor.get(k) ?? [];
      arr.push(p);
      pendingByAnchor.set(k, arr);
    }

    const expanded = expandedRows.get(fileIndex);
    if (expanded) {
      appendExpandedRows(
        {
          anchorItem,
          ask,
          askItemBox,
          commentItems,
          contentByAnchor: new Map<string, string>(),
          fileIndex,
          hunkIndex: 0,
          items,
          nav,
          navIndexOf,
          openBoxes,
          pendingByAnchor,
          threads,
        },
        expanded
      );
      groupCounts.push(items.length - startCount);
      return;
    }

    const fileCollapsed = collapsed.get(fileIndex);
    const hunks = parsePatch(file.patch);
    hunks.forEach((hunk, hunkIndex) => {
      const isCollapsed = fileCollapsed?.has(hunkIndex) ?? false;
      items.push({
        collapsed: isCollapsed,
        fileIndex,
        header: hunk.header,
        hunkIndex,
        kind: "hunk",
      });
      if (isCollapsed) {
        return;
      }

      appendHunkRows(
        {
          anchorItem,
          ask,
          askItemBox,
          commentItems,
          contentByAnchor: new Map<string, string>(),
          fileIndex,
          hunkIndex,
          items,
          nav,
          navIndexOf,
          openBoxes,
          pendingByAnchor,
          threads,
        },
        hunk
      );
    });

    groupCounts.push(items.length - startCount);
  });

  return {
    anchorItem,
    askItem: askItemBox.index,
    commentItems,
    groupCounts,
    groupFirstItem,
    items,
    nav,
    navIndexOf,
  };
}

/**
 * Intraline emphasis, indent guides, and the indent unit are derived from the
 * parsed hunks alone, but commentByRow also depends on filename (language).
 * parsePatch caches by patch string, so the hunks array identity is stable —
 * a WeakMap keyed by it, nested under filename, gives every rendered row
 * O(1) access without recomputing per render or per item, while still
 * keeping distinct results for two files whose patch text happens to match
 * byte-for-byte but whose languages differ.
 */
export interface FileRenderMeta {
  commentByRow: ReadonlyMap<DiffRow, boolean>;
  guideByRow: ReadonlyMap<DiffRow, number>;
  indentUnit: IndentUnit;
  intraByRow: ReadonlyMap<DiffRow, IntralineRanges>;
}

const metaCache = new WeakMap<object, Map<string, FileRenderMeta>>();

export function fileRenderMeta(
  patch: string,
  filename: string
): FileRenderMeta {
  const hunks: DiffHunk[] = parsePatch(patch);
  let byFilename = metaCache.get(hunks);
  const hit = byFilename?.get(filename);
  if (hit) {
    return hit;
  }
  const indentUnit = detectIndentUnit(hunks);
  const guideByRow = new Map<DiffRow, number>();
  for (const hunk of hunks) {
    const levels = guideLevelsForHunk(hunk.rows, indentUnit);
    hunk.rows.forEach((row, i) => {
      const lvl = levels[i];
      if (lvl !== null) {
        guideByRow.set(row, lvl);
      }
    });
  }
  const meta: FileRenderMeta = {
    commentByRow: markBlockCommentRows(hunks, filename),
    guideByRow,
    indentUnit,
    intraByRow: intralinePairs(hunks),
  };
  if (!byFilename) {
    byFilename = new Map<string, FileRenderMeta>();
    metaCache.set(hunks, byFilename);
  }
  byFilename.set(filename, meta);
  return meta;
}

export function buildCommentsByFile(
  comments: readonly ReviewComment[]
): Map<string, ReviewComment[]> {
  const m = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const arr = m.get(c.path) ?? [];
    arr.push(c);
    m.set(c.path, arr);
  }
  return m;
}

export function buildPendingByFile(
  pending: readonly PendingComment[]
): Map<string, PendingComment[]> {
  const m = new Map<string, PendingComment[]>();
  for (const p of pending) {
    const arr = m.get(p.path) ?? [];
    arr.push(p);
    m.set(p.path, arr);
  }
  return m;
}
