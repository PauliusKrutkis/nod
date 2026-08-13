import type { Anchor } from "../anchors/anchor.ts";
import { loadAnchorLines } from "../anchors/ref.ts";
import {
  buildTipIndex,
  DEFAULT_RESOLVE_CONFIG,
  type ResolveConfig,
  resolveAnchor,
} from "../anchors/resolve.ts";
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

export interface QueueItem {
  path: string;
  /** 1-based, inclusive span on tip. */
  startLine: number;
  endLine: number;
  /** Unreviewed post-epoch lines inside the span (the span may bridge a few old lines). */
  newLines: number;
  provenance: Provenance[];
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

/** Paint every line still covered by a reviewed/approved anchor. */
const applyReviewMarks = async (
  git: GitRun,
  raw: ReadonlyMap<string, string[]>,
  config: ResolveConfig
): Promise<Map<string, Uint8Array>> => {
  const facts = await readFacts(git);
  const anchorRefs = await readAnchorRefs(git);
  const index = buildTipIndex(raw, config.normalization);
  const masks = new Map<string, Uint8Array>();

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
  return masks;
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
  const masks = await applyReviewMarks(git, raw, config);

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
