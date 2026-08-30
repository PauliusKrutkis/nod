import type { Anchor } from "../anchors/anchor.ts";
import { type AnchorRef, loadAnchorLines } from "../anchors/ref.ts";
import {
  buildTipIndex,
  DEFAULT_RESOLVE_CONFIG,
  type Resolution,
  type ResolveConfig,
  resolveAnchor,
} from "../anchors/resolve.ts";
import { type Actor, type Fact, factId } from "../facts/schema.ts";
import { readAnchorRefs, readFacts } from "../facts/store.ts";
import { cachedBlameTree } from "../git/blame-cache.ts";
import type { GitRun } from "../git/exec.ts";
import { readTreeLines } from "../git/files.ts";
import { type Assignment, assignmentsFrom } from "../topics/assign.ts";

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

interface Provenance {
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
  /** What was attested: a signed region, or the whole topic at a sha. */
  source: "anchor" | "approval";
}

/** The effective approval a topic's deltas are baselined against. */
interface TopicApproval {
  sha: string;
  atTime: string;
  actor: Actor;
}

interface TopicStatus {
  id: string;
  /** Post-epoch tip lines classified into this topic. */
  totalLines: number;
  reviewedLines: number;
  requiredApprovals: number;
  /** Distinct human actors with a resolvable approval on this topic. */
  approvals: number;
  /** Null until the threshold is met. */
  approvedAt: TopicApproval | null;
}

export interface QueueItem {
  path: string;
  /** 1-based, inclusive span on tip. */
  startLine: number;
  endLine: number;
  /** Unreviewed post-epoch lines inside the span (the span may bridge a few old lines). */
  newLines: number;
  provenance: Provenance[];
  /** Null when no attestation decayed into this run (genuinely new code). */
  baseline: QueueBaseline | null;
  /** Derived feature label: conventional scope, #pr, or short-sha fallback. */
  topic: string;
}

/**
 * A comment thread entry, positioned on tip by resolving its anchor: `alive`
 * sits exactly where the discussed content lives now, `stale` on the nearest
 * surviving lines ("commented on a previous version"), `gone` degrades to
 * the file it was made in. Replies inherit the root's position.
 */
export interface LedgerComment {
  id: string;
  /** Root fact id for replies; null on thread roots. */
  parent: string | null;
  actor: Actor;
  atSha: string;
  atTime: string;
  body: string;
  path: string;
  /** 1-based tip span; null when the commented content is gone. */
  startLine: number | null;
  endLine: number | null;
  anchorStatus: "alive" | "stale" | "gone";
  /** True when a `resolved` fact closes the thread; roots only. */
  resolved: boolean;
}

/**
 * A post-epoch commit no assignment fact names yet. The deterministic
 * label it wears meanwhile (conventional scope, `#123`, short sha) is a
 * component-or-provenance bucket, not a feature — the host's LLM stage
 * reads this list, proposes real feature topics, and writes them back as
 * `assigned` facts via `ledger assign`; keyless repos simply keep the
 * deterministic labels.
 */
interface UnassignedSha {
  sha: string;
  subject: string;
  /** The deterministic label it wears until assigned. */
  topic: string;
  /** Files holding lines that blame to this commit, capped for payload. */
  files: string[];
  /** Tip lines blaming to this commit. */
  lines: number;
}

export interface LedgerStatus {
  tip: string;
  epoch: string;
  totalLines: number;
  reviewedLines: number;
  /** reviewedLines / totalLines; 1 when nothing is post-epoch. */
  coverage: number;
  queue: QueueItem[];
  topics: TopicStatus[];
  comments: LedgerComment[];
  unassigned: UnassignedSha[];
}

/**
 * Where a derivation currently is, for hosts that show the one expensive
 * load (a cold blame pass) as staged progress instead of a mute spinner.
 * `blame` carries file counts; the other stages are quick and just mark
 * the phase.
 */
export interface DeriveProgress {
  stage: "reading" | "blame" | "deriving";
  done?: number;
  total?: number;
}

const SQUASH_SUBJECT = /\(#(\d+)\)\s*$/;
/** `feat(ledger): …` → "ledger"; conventional-commit scope. */
const CONVENTIONAL_SCOPE = /^[a-z]+\(([^)]+)\)!?:/;
/** Queue regions may bridge this many non-countable lines to stay coherent. */
const BRIDGE = 2;
const SUBJECT_BATCH = 200;

/**
 * A commit's derived topic when no assignment fact names it (docs/LEDGER.md
 * §3, the deterministic tail of the cascade): the declared scope when the
 * subject carries one, the PR for scopeless squash merges, the bare sha for
 * direct pushes. Ergonomics only — a wrong label mislabels a queue item,
 * never loses a line. Scopeless commits are also what `unassigned` reports
 * to the host's LLM stage.
 */
const topicOf = (subject: string, sha: string): string => {
  const scope = CONVENTIONAL_SCOPE.exec(subject)?.[1]?.trim();
  if (scope) {
    return scope;
  }
  const pr = SQUASH_SUBJECT.exec(subject);
  return pr ? `#${pr[1]}` : sha.slice(0, 7);
};

const hasScope = (subject: string): boolean => CONVENTIONAL_SCOPE.test(subject);

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
interface ResolvedAnchor {
  ref: AnchorRef;
  fact: Fact;
  resolution: Resolution;
}

/**
 * Paint every line still covered by a human's reviewed/approved anchor, and
 * resolve comment-thread roots to their tip position on the way (same index,
 * same pass; comments never touch the masks — a remark is not a review).
 */
const applyReviewMarks = async (
  git: GitRun,
  raw: ReadonlyMap<string, string[]>,
  config: ResolveConfig,
  facts: readonly Fact[]
): Promise<{
  masks: Map<string, Uint8Array>;
  resolved: ResolvedAnchor[];
  commented: ResolvedAnchor[];
}> => {
  const anchorRefs = await readAnchorRefs(git);
  const index = buildTipIndex(raw, config.normalization);
  const masks = new Map<string, Uint8Array>();
  const resolved: ResolvedAnchor[] = [];
  const commented: ResolvedAnchor[] = [];

  for (const fact of facts) {
    if (fact.subject.kind !== "anchor") {
      continue;
    }
    // Agent facts are triage signal, never coverage — the ratchet counts
    // human attention only (docs/LEDGER.md §5).
    const marks =
      (fact.verdict === "reviewed" || fact.verdict === "approved") &&
      fact.actor.kind === "human";
    const isRoot = fact.verdict === "commented" && fact.parent === undefined;
    const ref = marks || isRoot ? anchorRefs.get(fact.subject.id) : undefined;
    if (!ref) {
      continue;
    }
    const lines = await loadAnchorLines(git, ref);
    if (!lines) {
      continue;
    }
    const anchor: Anchor = { ...ref, lines };
    const resolution = resolveAnchor(index, anchor, config);
    if (isRoot) {
      commented.push({ ref, fact, resolution });
      continue;
    }
    resolved.push({ ref, fact, resolution });
    paintResolution(masks, raw, resolution, lines.length);
  }
  return { masks, resolved, commented };
};

const paintResolution = (
  masks: Map<string, Uint8Array>,
  raw: ReadonlyMap<string, string[]>,
  resolution: Resolution,
  lineCount: number
): void => {
  if (resolution.status === "gone") {
    return;
  }
  const length = raw.get(resolution.path)?.length ?? 0;
  if (resolution.status === "alive") {
    markRange(masks, resolution.path, length, resolution.line - 1, lineCount);
  } else {
    for (const line of resolution.matchedTipLines) {
      markRange(masks, resolution.path, length, line, 1);
    }
  }
};

const commentSpan = (
  record: ResolvedAnchor
): Pick<LedgerComment, "path" | "startLine" | "endLine" | "anchorStatus"> => {
  const { ref, resolution } = record;
  if (resolution.status === "alive") {
    return {
      path: resolution.path,
      startLine: resolution.line,
      endLine: resolution.line + ref.lineCount - 1,
      anchorStatus: "alive",
    };
  }
  if (resolution.status === "stale" && resolution.matchedTipLines.length > 0) {
    return {
      path: resolution.path,
      startLine: Math.min(...resolution.matchedTipLines) + 1,
      endLine: Math.max(...resolution.matchedTipLines) + 1,
      anchorStatus: "stale",
    };
  }
  return {
    path: ref.path,
    startLine: null,
    endLine: null,
    anchorStatus: "gone",
  };
};

const byThreadOrder = (a: LedgerComment, b: LedgerComment): number => {
  if (a.path !== b.path) {
    return a.path < b.path ? -1 : 1;
  }
  if ((a.startLine ?? 0) !== (b.startLine ?? 0)) {
    return (a.startLine ?? 0) - (b.startLine ?? 0);
  }
  return a.atTime < b.atTime ? -1 : 1;
};

/** Thread roots positioned on tip, each followed by its replies in order. */
const deriveComments = (
  facts: readonly Fact[],
  commented: readonly ResolvedAnchor[]
): LedgerComment[] => {
  const roots: LedgerComment[] = commented
    .map((record) => ({
      id: factId(record.fact),
      parent: null,
      actor: record.fact.actor,
      atSha: record.fact.atSha,
      atTime: record.fact.atTime,
      body: record.fact.body ?? "",
      resolved: false,
      ...commentSpan(record),
    }))
    .sort(byThreadOrder);

  const out: LedgerComment[] = [];
  for (const root of roots) {
    root.resolved = facts.some(
      (fact) => fact.verdict === "resolved" && fact.parent === root.id
    );
    out.push(root);
    const replies = facts
      .filter((fact) => fact.verdict === "commented" && fact.parent === root.id)
      .sort((a, b) => (a.atTime < b.atTime ? -1 : 1));
    for (const reply of replies) {
      out.push({
        id: factId(reply),
        parent: root.id,
        actor: reply.actor,
        atSha: reply.atSha,
        atTime: reply.atTime,
        body: reply.body ?? "",
        path: root.path,
        startLine: root.startLine,
        endLine: root.endLine,
        anchorStatus: root.anchorStatus,
        resolved: false,
      });
    }
  }
  return out;
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

interface TopicApprovalState {
  /** Distinct human actors with at least one resolvable approval. */
  approvals: number;
  /** Null while distinct actors < required. */
  effective: TopicApproval | null;
  /** ≥ required distinct actors attested a state containing this commit. */
  covers: (blameSha: string) => boolean;
}

const newerFact = (
  a: { atTime: string; atSha: string },
  b: { atTime: string; atSha: string }
): boolean =>
  a.atTime > b.atTime || (a.atTime === b.atTime && a.atSha > b.atSha);

/**
 * Approval semantics, derived per topic from human `approved` topic facts:
 *
 * - Coverage is per line and monotone: a line counts as reviewed when at
 *   least `required` distinct human actors each hold an approval whose
 *   `epoch..atSha` history contains the line's blame commit. Union over an
 *   actor's approvals — appending a fact can never reduce coverage, and a
 *   stale-checkout approval covers exactly what its author could have seen.
 * - The `effective` record (baseline + display) is the oldest among the
 *   `required` newest per-actor approvals; with the solo default it is
 *   simply the newest human approval.
 * - Approvals whose atSha the repo cannot resolve are inert everywhere.
 */
const buildTopicApprovals = async (
  git: GitRun,
  facts: readonly Fact[],
  options: {
    epoch: string;
    tip: string;
    postEpoch: ReadonlySet<string>;
    required: number;
  }
): Promise<Map<string, TopicApprovalState>> => {
  const relevant = facts.filter(
    (fact) =>
      fact.verdict === "approved" &&
      fact.subject.kind === "topic" &&
      fact.actor.kind === "human"
  );

  const membership = new Map<string, ReadonlySet<string>>();
  for (const sha of new Set(relevant.map((fact) => fact.atSha))) {
    if (sha === options.tip) {
      membership.set(sha, options.postEpoch);
      continue;
    }
    try {
      await git(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]);
    } catch {
      continue; // unknown to this repo — the fact stays inert
    }
    membership.set(
      sha,
      new Set(
        (await git(["rev-list", `${options.epoch}..${sha}`]))
          .split("\n")
          .filter(Boolean)
      )
    );
  }

  const byTopic = new Map<string, Map<string, Fact[]>>();
  for (const fact of relevant) {
    if (!membership.has(fact.atSha) || fact.subject.kind !== "topic") {
      continue;
    }
    const actors = byTopic.get(fact.subject.id) ?? new Map<string, Fact[]>();
    byTopic.set(fact.subject.id, actors);
    const list = actors.get(fact.actor.id) ?? [];
    list.push(fact);
    actors.set(fact.actor.id, list);
  }

  const states = new Map<string, TopicApprovalState>();
  for (const [id, actors] of byTopic) {
    const approvals = actors.size;
    let effective: TopicApproval | null = null;
    if (approvals >= options.required) {
      const latestPerActor = [...actors.values()].map((list) =>
        list.reduce((a, b) => (newerFact(b, a) ? b : a))
      );
      latestPerActor.sort((a, b) => (newerFact(a, b) ? -1 : 1));
      const nth = latestPerActor[options.required - 1];
      effective = { sha: nth.atSha, atTime: nth.atTime, actor: nth.actor };
    }
    const covers = (blameSha: string): boolean => {
      let count = 0;
      for (const list of actors.values()) {
        if (list.some((fact) => membership.get(fact.atSha)?.has(blameSha))) {
          count += 1;
          if (count >= options.required) {
            return true;
          }
        }
      }
      return false;
    };
    states.set(id, { approvals, covers, effective });
  }
  return states;
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
  candidatesByPath: ReadonlyMap<string, ResolvedAnchor[]>,
  approval: TopicApproval | null
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
    if (!best || newerFact(fact, best.fact)) {
      best = record;
    }
  }
  const fromAnchor: QueueBaseline | null = best
    ? {
        sha: best.fact.atSha,
        atTime: best.fact.atTime,
        actor: best.fact.actor,
        refPath: best.ref.path,
        source: "anchor",
      }
    : null;
  // The topic's approval competes as one more attestation; approvals carry
  // no rename knowledge, so the run's own tip path stands in for refPath.
  const fromApproval: QueueBaseline | null = approval
    ? {
        sha: approval.sha,
        atTime: approval.atTime,
        actor: approval.actor,
        refPath: run.path,
        source: "approval",
      }
    : null;
  if (!(fromAnchor && fromApproval)) {
    return fromAnchor ?? fromApproval;
  }
  return newerFact(
    { atSha: fromApproval.sha, atTime: fromApproval.atTime },
    { atSha: fromAnchor.sha, atTime: fromAnchor.atTime }
  )
    ? fromApproval
    : fromAnchor;
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

/**
 * Line-level topics, computed before runs: approval coverage must paint the
 * masks so mixed-topic runs shrink and split before any run is labeled.
 * The cascade per sha: a human `corrected` fact, an agent `assigned` fact,
 * then the deterministic fallback (conventional scope, provenance bucket).
 * Every sha still on the fallback is reported as `unassigned` — the LLM
 * stage's work list. Scopes are component names, not features, so they do
 * not exempt a commit from mapping; they only name it until then.
 */
const classifyTipShas = async (
  git: GitRun,
  blames: ReadonlyMap<string, readonly string[]>,
  postEpoch: ReadonlySet<string>,
  assignments: ReadonlyMap<string, Assignment>
): Promise<{
  subjects: Map<string, string>;
  topicBySha: Map<string, string>;
  unassignedShas: Set<string>;
}> => {
  const tipShas = new Set<string>();
  for (const blame of blames.values()) {
    for (const sha of blame) {
      if (postEpoch.has(sha)) {
        tipShas.add(sha);
      }
    }
  }
  const subjects = await loadSubjects(git, [...tipShas]);
  const topicBySha = new Map<string, string>();
  const unassignedShas = new Set<string>();
  for (const sha of tipShas) {
    const assigned = assignments.get(sha);
    if (assigned) {
      topicBySha.set(sha, assigned.topic);
      continue;
    }
    topicBySha.set(sha, topicOf(subjects.get(sha) ?? "", sha));
    unassignedShas.add(sha);
  }
  return { subjects, topicBySha, unassignedShas };
};

/** Files-and-lines context for each sha the LLM stage will be asked about. */
const UNASSIGNED_FILE_CAP = 8;

const describeUnassigned = (
  blames: ReadonlyMap<string, readonly string[]>,
  subjects: ReadonlyMap<string, string>,
  topicBySha: ReadonlyMap<string, string>,
  unassignedShas: ReadonlySet<string>
): UnassignedSha[] => {
  const bySha = new Map<string, { files: Set<string>; lines: number }>();
  for (const [path, blame] of blames) {
    for (const sha of blame) {
      if (!unassignedShas.has(sha)) {
        continue;
      }
      const entry = bySha.get(sha) ?? { files: new Set<string>(), lines: 0 };
      entry.files.add(path);
      entry.lines += 1;
      bySha.set(sha, entry);
    }
  }
  const out: UnassignedSha[] = [];
  for (const [sha, entry] of bySha) {
    out.push({
      files: [...entry.files].slice(0, UNASSIGNED_FILE_CAP),
      lines: entry.lines,
      sha,
      subject: subjects.get(sha) ?? "",
      topic: topicBySha.get(sha) ?? sha.slice(0, 7),
    });
  }
  out.sort((a, b) => b.lines - a.lines);
  return out;
};

/**
 * Union approval coverage into the anchor masks. All lines sharing a blame
 * commit share topic and coverage, so approval coverage resolves once per
 * commit, then paints line by line.
 */
const paintApprovalCoverage = (
  blames: ReadonlyMap<string, readonly string[]>,
  raw: ReadonlyMap<string, string[]>,
  masks: Map<string, Uint8Array>,
  topicBySha: ReadonlyMap<string, string>,
  topicStates: ReadonlyMap<string, TopicApprovalState>
): void => {
  const coveredShas = new Set<string>();
  for (const [sha, topic] of topicBySha) {
    if (topicStates.get(topic)?.covers(sha)) {
      coveredShas.add(sha);
    }
  }
  for (const [path, blame] of blames) {
    const length = raw.get(path)?.length ?? 0;
    for (let i = 0; i < blame.length; i++) {
      const sha = blame[i];
      if (sha !== undefined && coveredShas.has(sha)) {
        markRange(masks, path, length, i, 1);
      }
    }
  }
};

/**
 * Baseline candidates: stale anchors keyed where their lines survived,
 * gone anchors keyed where they were signed (no tip position exists).
 */
const groupBaselineCandidates = (
  resolved: readonly ResolvedAnchor[]
): Map<string, ResolvedAnchor[]> => {
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
  return candidatesByPath;
};

export const deriveStatus = async (
  git: GitRun,
  options: {
    epoch: string;
    tip?: string;
    config?: ResolveConfig;
    approvalsRequired?: number;
    onProgress?: (progress: DeriveProgress) => void;
  }
): Promise<LedgerStatus> => {
  const config = options.config ?? DEFAULT_RESOLVE_CONFIG;
  const required = options.approvalsRequired ?? 1;
  const onProgress = options.onProgress;
  const tip = (await git(["rev-parse", options.tip ?? "HEAD"])).trim();
  const epoch = (await git(["rev-parse", options.epoch])).trim();

  onProgress?.({ stage: "reading" });
  const raw = await readTreeLines(git, tip);
  const postEpoch = new Set(
    (await git(["rev-list", `${epoch}..${tip}`])).split("\n").filter(Boolean)
  );
  const blames = await cachedBlameTree(
    git,
    tip,
    [...raw.keys()],
    (done, total) => onProgress?.({ done, stage: "blame", total })
  );
  onProgress?.({ stage: "deriving" });
  const facts = await readFacts(git);
  const { subjects, topicBySha, unassignedShas } = await classifyTipShas(
    git,
    blames,
    postEpoch,
    assignmentsFrom(facts)
  );

  const { masks, resolved, commented } = await applyReviewMarks(
    git,
    raw,
    config,
    facts
  );
  const topicStates = await buildTopicApprovals(git, facts, {
    epoch,
    postEpoch,
    required,
    tip,
  });
  paintApprovalCoverage(blames, raw, masks, topicBySha, topicStates);
  const candidatesByPath = groupBaselineCandidates(resolved);

  let totalLines = 0;
  let reviewedLines = 0;
  const runs: Run[] = [];
  const perTopic = new Map<string, { total: number; reviewed: number }>();
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
    const mask = masks.get(path);
    for (let i = 0; i < fileLines.length; i++) {
      const sha = blame[i];
      const topic = sha === undefined ? undefined : topicBySha.get(sha);
      if (topic === undefined) {
        continue;
      }
      const tally = perTopic.get(topic) ?? { reviewed: 0, total: 0 };
      perTopic.set(topic, tally);
      tally.total += 1;
      if (mask?.[i] === 1) {
        tally.reviewed += 1;
      }
    }
  }

  const queue: QueueItem[] = runs
    .map((run) => {
      const headSha = blames.get(run.path)?.[run.start] ?? "";
      const topic = topicBySha.get(headSha) ?? headSha.slice(0, 7);
      return {
        path: run.path,
        startLine: run.start + 1,
        endLine: run.end + 1,
        newLines: run.newLines,
        provenance: [...run.shas].map((sha) => {
          const subject = subjects.get(sha) ?? "";
          const match = SQUASH_SUBJECT.exec(subject);
          return { sha, pr: match ? Number(match[1]) : null, subject };
        }),
        baseline: baselineForRun(
          run,
          candidatesByPath,
          topicStates.get(topic)?.effective ?? null
        ),
        topic,
      };
    })
    .sort(byPathThenLine);

  const topics: TopicStatus[] = [...perTopic.entries()]
    .map(([id, tally]) => ({
      id,
      totalLines: tally.total,
      reviewedLines: tally.reviewed,
      requiredApprovals: required,
      approvals: topicStates.get(id)?.approvals ?? 0,
      approvedAt: topicStates.get(id)?.effective ?? null,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  return {
    tip,
    epoch,
    totalLines,
    reviewedLines,
    coverage: totalLines === 0 ? 1 : reviewedLines / totalLines,
    queue,
    topics,
    comments: deriveComments(facts, commented),
    unassigned: describeUnassigned(
      blames,
      subjects,
      topicBySha,
      unassignedShas
    ),
  };
};
