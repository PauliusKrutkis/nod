import type { Anchor } from "../anchors/anchor.ts";
import { type AnchorRef, loadAnchorLines } from "../anchors/ref.ts";
import {
  buildTipIndex,
  DEFAULT_RESOLVE_CONFIG,
  type Resolution,
  type ResolveConfig,
  resolveAnchor,
} from "../anchors/resolve.ts";
import type { Actor, Fact } from "../facts/schema.ts";
import { readAnchorRefs, readFacts } from "../facts/store.ts";
import { blameTree } from "../git/blame.ts";
import type { GitRun } from "../git/exec.ts";
import { readTreeLines } from "../git/files.ts";

/**
 * The invariant made executable: `status = f(facts, tip)` (docs/LEDGER.md
 * §2). Nothing here is stored — coverage, review marks, and the queue are
 * recomputed from the immutable fact log joined against the current tip.
 *
 * A tip line is *reviewed* when some reviewed/approved anchor still covers
 * it: fully when the anchor is alive, line-for-line via the stale
 * alignment when the region evolved — so an edit inside a signed block
 * re-queues only the changed lines. A tip line is *counted* when its blame
 * commit is post-epoch; pre-epoch code is grandfathered out of both sides
 * of the coverage fraction.
 */

export interface Provenance {
  sha: string;
  pr: number | null;
  subject: string;
}

/**
 * The last human attestation a queue item decayed from: the fact behind the
 * stale anchor whose surviving lines flank this run. `sha` is the tip the
 * reviewer was looking at, so `git diff sha..tip` is the net change since a
 * human last signed this region (docs/LEDGER.md §2 — deltas are baselined
 * at the last-reviewed sha).
 */
export interface QueueBaseline {
  sha: string;
  atTime: string;
  actor: Actor;
  /** The signed anchor's path at `sha`; differs from the item's across a rename. */
  refPath: string;
}

export interface QueueItem {
  path: string;
  /** 1-based, inclusive span on tip. */
  startLine: number;
  endLine: number;
  /** Unreviewed post-epoch lines inside the span (the span may bridge a few old lines). */
  newLines: number;
  provenance: Provenance[];
  /** Null when no signed anchor decayed into this run (genuinely new code). */
  baseline: QueueBaseline | null;
}

export interface LedgerStatus {
  tip: string;
  epoch: string;
  totalLines: number;
  reviewedLines: number;
  /** reviewedLines / totalLines; 1 when nothing is post-epoch. */
  coverage: number;
  queue: QueueItem[];
}

const SQUASH_SUBJECT = /\(#(\d+)\)\s*$/;
/** Queue regions may bridge this many non-countable lines to stay coherent. */
const BRIDGE = 2;
const SUBJECT_BATCH = 200;

interface Run {
  path: string;
  start: number;
  end: number;
  newLines: number;
  shas: Set<string>;
}

const markRange = (
  masks: Map<string, Uint8Array>,
  path: string,
  fileLength: number,
  from: number,
  count: number
): void => {
  const mask = masks.get(path) ?? new Uint8Array(fileLength);
  masks.set(path, mask);
  for (let i = from; i < from + count && i < mask.length; i++) {
    if (i >= 0) {
      mask[i] = 1;
    }
  }
};

/** One signed anchor joined against tip: where its content ended up. */
export interface ResolvedAnchor {
  ref: AnchorRef;
  fact: Fact;
  resolution: Resolution;
}

/** Paint every line still covered by a reviewed/approved anchor. */
const applyReviewMarks = async (
  git: GitRun,
  raw: ReadonlyMap<string, string[]>,
  config: ResolveConfig
): Promise<{ masks: Map<string, Uint8Array>; resolved: ResolvedAnchor[] }> => {
  const facts = await readFacts(git);
  const anchorRefs = await readAnchorRefs(git);
  const index = buildTipIndex(raw, config.normalization);
  const masks = new Map<string, Uint8Array>();
  const resolved: ResolvedAnchor[] = [];

  for (const fact of facts) {
    const relevant =
      (fact.verdict === "reviewed" || fact.verdict === "approved") &&
      fact.subject.kind === "anchor";
    const ref = relevant ? anchorRefs.get(fact.subject.id) : undefined;
    if (!ref) {
      continue;
    }
    const lines = await loadAnchorLines(git, ref);
    if (!lines) {
      continue;
    }
    const anchor: Anchor = { ...ref, lines };
    const resolution = resolveAnchor(index, anchor, config);
    resolved.push({ ref, fact, resolution });
    if (resolution.status === "gone") {
      continue;
    }
    const length = raw.get(resolution.path)?.length ?? 0;
    if (resolution.status === "alive") {
      markRange(
        masks,
        resolution.path,
        length,
        resolution.line - 1,
        lines.length
      );
    } else {
      for (const line of resolution.matchedTipLines) {
        markRange(masks, resolution.path, length, line, 1);
      }
    }
  }
  return { masks, resolved };
};

/** Walk one file's lines, counting coverage and growing queue runs. */
const collectFileRuns = (
  path: string,
  lineCount: number,
  blame: readonly string[],
  mask: Uint8Array | undefined,
  postEpoch: ReadonlySet<string>,
  runs: Run[]
): { total: number; reviewed: number } => {
  let total = 0;
  let reviewed = 0;
  let run: Run | null = null;
  for (let i = 0; i < lineCount; i++) {
    const sha = blame[i];
    if (sha === undefined || !postEpoch.has(sha)) {
      continue;
    }
    total += 1;
    if (mask?.[i] === 1) {
      reviewed += 1;
      continue;
    }
    if (run && i - run.end <= BRIDGE + 1) {
      run.end = i;
      run.newLines += 1;
      run.shas.add(sha);
    } else {
      if (run) {
        runs.push(run);
      }
      run = { path, start: i, end: i, newLines: 1, shas: new Set([sha]) };
    }
  }
  if (run) {
    runs.push(run);
  }
  return { total, reviewed };
};

/**
 * A stale footprint may sit this far from a run and still claim it — the
 * same slack the run builder bridges, so a gap punched into a signed block
 * joins even when separated from the surviving lines by non-countable rows.
 */
const BASELINE_GAP = BRIDGE + 1;

/**
 * The signed anchor this run decayed from, if any. A `stale` anchor joins
 * when its surviving lines flank the run (positional evidence); a `gone`
 * anchor joins on its original path alone — a small signed region rewritten
 * wholesale leaves no surviving lines, and that full rewrite is exactly the
 * case where the net diff since signing matters most. `alive` never joins:
 * its neighbour is genuinely new code. Several candidates → the newest
 * attestation wins, per docs/LEDGER.md §1 — the unit of review is the diff
 * from the *last* human-signed state.
 */
const baselineForRun = (
  run: Run,
  candidatesByPath: ReadonlyMap<string, ResolvedAnchor[]>
): QueueBaseline | null => {
  let best: ResolvedAnchor | null = null;
  for (const record of candidatesByPath.get(run.path) ?? []) {
    const { fact, resolution } = record;
    if (resolution.status === "stale") {
      if (resolution.matchedTipLines.length === 0) {
        continue;
      }
      const lo = Math.min(...resolution.matchedTipLines);
      const hi = Math.max(...resolution.matchedTipLines);
      if (lo - BASELINE_GAP > run.end || hi + BASELINE_GAP < run.start) {
        continue;
      }
    }
    const newer =
      !best ||
      fact.atTime > best.fact.atTime ||
      (fact.atTime === best.fact.atTime && fact.atSha > best.fact.atSha);
    if (newer) {
      best = record;
    }
  }
  return best
    ? {
        sha: best.fact.atSha,
        atTime: best.fact.atTime,
        actor: best.fact.actor,
        refPath: best.ref.path,
      }
    : null;
};

const loadSubjects = async (
  git: GitRun,
  shas: readonly string[]
): Promise<Map<string, string>> => {
  const subjects = new Map<string, string>();
  for (let i = 0; i < shas.length; i += SUBJECT_BATCH) {
    const out = await git([
      "show",
      "-s",
      "--format=%H%x09%s",
      ...shas.slice(i, i + SUBJECT_BATCH),
    ]);
    for (const row of out.split("\n").filter(Boolean)) {
      const [sha, subject] = row.split("\t");
      if (sha && subject !== undefined) {
        subjects.set(sha, subject);
      }
    }
  }
  return subjects;
};

const byPathThenLine = (a: QueueItem, b: QueueItem): number => {
  if (a.path !== b.path) {
    return a.path < b.path ? -1 : 1;
  }
  return a.startLine - b.startLine;
};

export const deriveStatus = async (
  git: GitRun,
  options: { epoch: string; tip?: string; config?: ResolveConfig }
): Promise<LedgerStatus> => {
  const config = options.config ?? DEFAULT_RESOLVE_CONFIG;
  const tip = (await git(["rev-parse", options.tip ?? "HEAD"])).trim();
  const epoch = (await git(["rev-parse", options.epoch])).trim();

  const raw = await readTreeLines(git, tip);
  const postEpoch = new Set(
    (await git(["rev-list", `${epoch}..${tip}`])).split("\n").filter(Boolean)
  );
  const blames = await blameTree(git, tip, [...raw.keys()]);
  const { masks, resolved } = await applyReviewMarks(git, raw, config);
  // Baseline candidates: stale anchors keyed where their lines survived,
  // gone anchors keyed where they were signed (no tip position exists).
  const candidatesByPath = new Map<string, ResolvedAnchor[]>();
  for (const record of resolved) {
    let path: string | null = null;
    if (record.resolution.status === "stale") {
      path = record.resolution.path;
    } else if (record.resolution.status === "gone") {
      path = record.ref.path;
    }
    if (path !== null) {
      const list = candidatesByPath.get(path) ?? [];
      list.push(record);
      candidatesByPath.set(path, list);
    }
  }

  let totalLines = 0;
  let reviewedLines = 0;
  const runs: Run[] = [];
  for (const [path, fileLines] of raw) {
    const blame = blames.get(path);
    if (!blame) {
      continue;
    }
    const counts = collectFileRuns(
      path,
      fileLines.length,
      blame,
      masks.get(path),
      postEpoch,
      runs
    );
    totalLines += counts.total;
    reviewedLines += counts.reviewed;
  }

  const subjects = await loadSubjects(git, [
    ...new Set(runs.flatMap((r) => [...r.shas])),
  ]);
  const queue: QueueItem[] = runs
    .map((run) => ({
      path: run.path,
      startLine: run.start + 1,
      endLine: run.end + 1,
      newLines: run.newLines,
      provenance: [...run.shas].map((sha) => {
        const subject = subjects.get(sha) ?? "";
        const match = SQUASH_SUBJECT.exec(subject);
        return { sha, pr: match ? Number(match[1]) : null, subject };
      }),
      baseline: baselineForRun(run, candidatesByPath),
    }))
    .sort(byPathThenLine);

  return {
    tip,
    epoch,
    totalLines,
    reviewedLines,
    coverage: totalLines === 0 ? 1 : reviewedLines / totalLines,
    queue,
  };
};
