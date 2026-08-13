import type { Anchor } from "./anchor.ts";
import { type Normalization, normalizeLines } from "./normalize.ts";

/**
 * The moved-vs-rewritten boundary, made concrete:
 *
 * - alive — the anchor's exact (normalized) content still exists on tip as a
 *   contiguous block, in any file. Moves and renames keep review state.
 * - stale — the best surviving match keeps at least `staleThreshold` of the
 *   anchor's lines in order. The region evolved; the delta is reviewable.
 * - gone — nothing recognizable survives. Either the code was deleted
 *   (correct) or tracking failed (false churn — what the replay harness
 *   measures against the blame oracle).
 */
export interface ResolveConfig {
  normalization: Normalization;
  staleThreshold: number;
}

/** Chosen by the phase 2 replay over this repo's real history. */
export const DEFAULT_RESOLVE_CONFIG: ResolveConfig = {
  normalization: "ws",
  staleThreshold: 0.35,
};

export type Resolution =
  | { status: "alive"; path: string; line: number }
  | {
      status: "stale";
      path: string;
      ratio: number;
      /**
       * 0-based tip lines (in `path`) that survive from the anchor, so a
       * consumer can keep them reviewed and re-queue only what changed.
       */
      matchedTipLines: number[];
    }
  | { status: "gone" };

/** Above this many occurrences a line says nothing about location. */
const POSTING_CAP = 256;
/** Above this many lines, order-sensitive LCS gives way to containment. */
const MAX_LCS_LINES = 400;
const MAX_PROBE_LINES = 4;
const MAX_CANDIDATE_FILES = 8;
const WINDOW_SLACK = 128;

interface Posting {
  path: string;
  /** 0-based. */
  line: number;
}

export interface TipIndex {
  normalization: Normalization;
  files: Map<string, string[]>;
  /**
   * normalized line → where it occurs on tip. Missing key: nowhere.
   * `null`: more than POSTING_CAP places — too common to be a locator.
   */
  postings: Map<string, Posting[] | null>;
}

/** Index one tree's raw lines (from readTreeLines) under one normalization. */
export const buildTipIndex = (
  raw: ReadonlyMap<string, string[]>,
  normalization: Normalization
): TipIndex => {
  const files = new Map<string, string[]>();
  const postings = new Map<string, Posting[] | null>();
  for (const [path, rawLines] of raw) {
    const lines = normalizeLines(rawLines, normalization);
    files.set(path, lines);
    for (const [line, text] of lines.entries()) {
      if (text === "") {
        continue;
      }
      const existing = postings.get(text);
      if (existing === null) {
        continue;
      }
      if (existing === undefined) {
        postings.set(text, [{ path, line }]);
      } else if (existing.length >= POSTING_CAP) {
        postings.set(text, null);
      } else {
        existing.push({ path, line });
      }
    }
  }
  return { normalization, files, postings };
};

const matchesAt = (
  fileLines: readonly string[],
  start: number,
  content: readonly string[]
): boolean => {
  if (start < 0 || start + content.length > fileLines.length) {
    return false;
  }
  return content.every((line, i) => fileLines[start + i] === line);
};

/** Non-empty content lines, rarest on tip first; absent lines are index 0. */
const byRarity = (index: TipIndex, content: readonly string[]) =>
  content
    .map((text, offset) => ({ text, offset }))
    .filter(({ text }) => text !== "")
    .map((probe) => {
      const posts = index.postings.get(probe.text);
      const rarity =
        posts === null ? Number.POSITIVE_INFINITY : (posts?.length ?? 0);
      return { ...probe, posts: posts ?? null, rarity };
    })
    .sort((a, b) => a.rarity - b.rarity);

const findExact = (
  index: TipIndex,
  content: readonly string[],
  preferredPaths: readonly string[]
): Resolution | null => {
  const ranked = byRarity(index, content);
  if (ranked.length === 0) {
    return null;
  }
  // A non-empty line that exists nowhere on tip rules out an exact match.
  if (ranked[0].rarity === 0) {
    return null;
  }

  const probe = ranked[0];
  if (probe.posts) {
    const matches: { path: string; line: number }[] = [];
    for (const posting of probe.posts) {
      const fileLines = index.files.get(posting.path);
      const start = posting.line - probe.offset;
      if (fileLines && matchesAt(fileLines, start, content)) {
        matches.push({ path: posting.path, line: start + 1 });
      }
    }
    const preferred = preferredPaths
      .map((path) => matches.find((m) => m.path === path))
      .find((m) => m !== undefined);
    const found = preferred ?? matches[0];
    return found ? { status: "alive", ...found } : null;
  }

  // Every line of the anchor is ubiquitous (import blocks, brace lines).
  // Location data is useless; scan only the file the anchor should be in.
  for (const path of preferredPaths) {
    const fileLines = index.files.get(path);
    if (!fileLines) {
      continue;
    }
    for (let start = 0; start + content.length <= fileLines.length; start++) {
      if (matchesAt(fileLines, start, content)) {
        return { status: "alive", path, line: start + 1 };
      }
    }
  }
  return null;
};

/** LCS with backtracking: which indices of `b` participate in the match. */
const lcsMatch = (
  a: readonly string[],
  b: readonly string[]
): { length: number; bIndices: number[] } => {
  const m = a.length;
  const n = b.length;
  const width = n + 1;
  // Values are bounded by min(m, n) ≤ MAX_LCS_LINES, so Uint16 is safe.
  const dp = new Uint16Array((m + 1) * width);
  for (let i = 1; i <= m; i++) {
    const row = i * width;
    const above = row - width;
    for (let j = 1; j <= n; j++) {
      dp[row + j] =
        a[i - 1] === b[j - 1]
          ? dp[above + j - 1] + 1
          : Math.max(dp[above + j], dp[row + j - 1]);
    }
  }
  const bIndices: number[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (
      a[i - 1] === b[j - 1] &&
      dp[i * width + j] === dp[(i - 1) * width + j - 1] + 1
    ) {
      bIndices.push(j - 1);
      i -= 1;
      j -= 1;
    } else if (dp[(i - 1) * width + j] >= dp[i * width + j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  bIndices.reverse();
  return { length: dp[m * width + n], bIndices };
};

interface Survival {
  ratio: number;
  /** 0-based line numbers in the candidate file that carry the match. */
  matched: number[];
}

/** How much of the anchor survives in one candidate file, and where. */
const survivalInFile = (
  content: readonly string[],
  fileLines: readonly string[]
): Survival => {
  const nonEmpty = content.filter((line) => line !== "");
  if (nonEmpty.length === 0) {
    return { ratio: 0, matched: [] };
  }
  const contentSet = new Set(nonEmpty);
  const hits: number[] = [];
  for (const [line, text] of fileLines.entries()) {
    if (contentSet.has(text)) {
      hits.push(line);
    }
  }
  if (hits.length === 0) {
    return { ratio: 0, matched: [] };
  }
  const mid = hits[Math.floor(hits.length / 2)];
  const halfSpan = 3 * content.length + WINDOW_SLACK;
  const windowStart = Math.max(0, mid - halfSpan);
  const window = fileLines.slice(
    windowStart,
    Math.min(fileLines.length, mid + halfSpan)
  );

  if (content.length > MAX_LCS_LINES) {
    // Too large for order-sensitive matching; approximate with the windowed
    // hit positions (multiset containment).
    const matched = hits.filter(
      (line) => line >= windowStart && line < windowStart + window.length
    );
    const distinct = new Set(nonEmpty);
    const containedCount = window.filter((text) => distinct.has(text)).length;
    return {
      ratio: Math.min(1, containedCount / nonEmpty.length),
      matched,
    };
  }

  // Order-sensitive check, bounded to a window around the surviving lines so
  // a scattered handful of common lines can't masquerade as the region.
  const { length, bIndices } = lcsMatch(content, window);
  return {
    ratio: length / content.length,
    matched: bIndices.map((j) => windowStart + j),
  };
};

const findBestPartial = (
  index: TipIndex,
  content: readonly string[],
  preferredPaths: readonly string[]
): ({ path: string } & Survival) | null => {
  const candidates = new Set<string>();
  for (const path of preferredPaths) {
    if (index.files.has(path)) {
      candidates.add(path);
    }
  }
  for (const probe of byRarity(index, content).slice(0, MAX_PROBE_LINES)) {
    for (const posting of probe.posts ?? []) {
      if (candidates.size >= MAX_CANDIDATE_FILES) {
        break;
      }
      candidates.add(posting.path);
    }
  }

  let best: ({ path: string } & Survival) | null = null;
  for (const path of candidates) {
    const fileLines = index.files.get(path);
    if (!fileLines) {
      continue;
    }
    const survival = survivalInFile(content, fileLines);
    if (survival.ratio > (best?.ratio ?? 0)) {
      best = { path, ...survival };
    }
  }
  return best;
};

/**
 * Locate an anchor on tip. `renamedTo` is an optional routing hint (where
 * git thinks the anchor's file went); it biases which match is reported and
 * where the ubiquitous-content fallback looks, never whether content counts
 * as surviving.
 */
export const resolveAnchor = (
  index: TipIndex,
  anchor: Anchor,
  config: ResolveConfig,
  renamedTo?: string
): Resolution => {
  const content = normalizeLines(anchor.lines, config.normalization);
  const preferredPaths = renamedTo ? [renamedTo, anchor.path] : [anchor.path];

  const exact = findExact(index, content, preferredPaths);
  if (exact) {
    return exact;
  }
  const best = findBestPartial(index, content, preferredPaths);
  if (best && best.ratio >= config.staleThreshold) {
    return {
      status: "stale",
      path: best.path,
      ratio: best.ratio,
      matchedTipLines: best.matched,
    };
  }
  return { status: "gone" };
};
