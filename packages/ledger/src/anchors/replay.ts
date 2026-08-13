import { mapLimit } from "../concurrency.ts";
import type { GitRun } from "../git/exec.ts";
import { readTreeLines, renameMap } from "../git/files.ts";
import { type Anchor, extractAnchors } from "./anchor.ts";
import type { Normalization } from "./normalize.ts";
import {
  buildTipIndex,
  type Resolution,
  type ResolveConfig,
  resolveAnchor,
  type TipIndex,
} from "./resolve.ts";

/**
 * The phase 2 acceptance harness (docs/LEDGER.md §7): pretend a reviewer
 * signed every hunk of the last N squash merges at their merge shas, resolve
 * every anchor against today's tip, and grade the result against a blame
 * oracle.
 *
 * Reading the numbers: low survival alone is not failure — old code
 * legitimately gets rewritten. The failure metric is *unexplained* lines:
 * lines git blame still attributes to a merge, in a file where our resolver
 * claims less than blame sees. Blame without move detection is a lower bound
 * on survival (moved lines re-attribute to the mover), so the resolver
 * should always explain at least what blame sees; anything short of that is
 * false churn — a signed region we lost track of.
 */

const SQUASH_SUBJECT = /\(#(\d+)\)\s*$/;
const BLAME_GROUP_HEADER = /^([0-9a-f]{40}) \d+ \d+ (\d+)$/;

export interface MergedPr {
  sha: string;
  pr: number;
  subject: string;
}

export const listSquashMerges = async (
  git: GitRun,
  ref: string,
  count: number
): Promise<MergedPr[]> => {
  const out = await git([
    "log",
    "--first-parent",
    "--format=%H%x09%s",
    "-n",
    "400",
    ref,
  ]);
  const merges: MergedPr[] = [];
  for (const row of out.split("\n")) {
    const [sha, subject] = row.split("\t");
    const match = subject ? SQUASH_SUBJECT.exec(subject) : null;
    if (sha && subject && match) {
      merges.push({ sha, pr: Number(match[1]), subject });
    }
    if (merges.length === count) {
      break;
    }
  }
  return merges;
};

/** merge sha → path → lines blame still attributes to it on tip. */
const blameOracle = async (
  git: GitRun,
  tip: string,
  paths: readonly string[],
  interesting: ReadonlySet<string>
): Promise<Map<string, Map<string, number>>> => {
  const oracle = new Map<string, Map<string, number>>();
  await mapLimit(paths, 8, async (path) => {
    let out: string;
    try {
      out = await git(["blame", "--porcelain", tip, "--", path]);
    } catch {
      return;
    }
    for (const line of out.split("\n")) {
      const match = BLAME_GROUP_HEADER.exec(line);
      if (!(match && interesting.has(match[1]))) {
        continue;
      }
      const perPath = oracle.get(match[1]) ?? new Map<string, number>();
      perPath.set(path, (perPath.get(path) ?? 0) + Number(match[2]));
      oracle.set(match[1], perPath);
    }
  });
  return oracle;
};

export interface ConfigReplay {
  config: ResolveConfig;
  anchors: number;
  /** All line counts are anchor-line-weighted. */
  lines: number;
  alive: number;
  stale: number;
  gone: number;
  /** Blame-surviving lines the resolver failed to explain — false churn. */
  unexplained: number;
  /** Total lines blame attributes to the replayed merges on tip. */
  blameSurvivors: number;
}

export interface ReplayReport {
  tip: string;
  merges: MergedPr[];
  configs: ConfigReplay[];
  /** Where the first config's unexplained lines live, largest first. */
  unexplainedDetail: UnexplainedEntry[];
  /** Per-PR breakdown under the first (default) config. */
  perPr: {
    pr: MergedPr;
    anchors: number;
    lines: number;
    alive: number;
    stale: number;
    gone: number;
  }[];
}

interface SignedAnchor {
  anchor: Anchor;
  merge: MergedPr;
  renamedTo: string | undefined;
}

export interface UnexplainedEntry {
  pr: number;
  path: string;
  lines: number;
}

const gradeConfig = (
  index: TipIndex,
  signed: readonly SignedAnchor[],
  config: ResolveConfig,
  oracle: ReadonlyMap<string, ReadonlyMap<string, number>>,
  prBySha: ReadonlyMap<string, number>
): {
  replay: ConfigReplay;
  resolutions: Resolution[];
  unexplainedDetail: UnexplainedEntry[];
} => {
  const resolutions: Resolution[] = [];
  const explained = new Map<string, number>();
  const replay: ConfigReplay = {
    config,
    anchors: signed.length,
    lines: 0,
    alive: 0,
    stale: 0,
    gone: 0,
    unexplained: 0,
    blameSurvivors: 0,
  };

  for (const { anchor, renamedTo } of signed) {
    const resolution = resolveAnchor(index, anchor, config, renamedTo);
    resolutions.push(resolution);
    const lines = anchor.lines.length;
    replay.lines += lines;
    if (resolution.status === "alive") {
      replay.alive += lines;
      const key = `${anchor.atSha}\0${resolution.path}`;
      explained.set(key, (explained.get(key) ?? 0) + lines);
    } else if (resolution.status === "stale") {
      replay.stale += lines;
      const key = `${anchor.atSha}\0${resolution.path}`;
      const matched = Math.round(resolution.ratio * lines);
      explained.set(key, (explained.get(key) ?? 0) + matched);
    } else {
      replay.gone += lines;
    }
  }

  const unexplainedDetail: UnexplainedEntry[] = [];
  for (const [sha, perPath] of oracle) {
    for (const [path, survivors] of perPath) {
      replay.blameSurvivors += survivors;
      const short = survivors - (explained.get(`${sha}\0${path}`) ?? 0);
      if (short > 0) {
        replay.unexplained += short;
        unexplainedDetail.push({
          pr: prBySha.get(sha) ?? 0,
          path,
          lines: short,
        });
      }
    }
  }
  unexplainedDetail.sort((a, b) => b.lines - a.lines);
  return { replay, resolutions, unexplainedDetail };
};

export const runReplay = async (
  git: GitRun,
  options: { tip?: string; count?: number; configs: ResolveConfig[] }
): Promise<ReplayReport> => {
  const tip = options.tip ?? "HEAD";
  const merges = await listSquashMerges(git, tip, options.count ?? 20);

  const anchorsPerMerge = await mapLimit(merges, 8, (merge) =>
    extractAnchors(git, merge.sha)
  );
  const renamesPerMerge = await mapLimit(merges, 8, (merge) =>
    renameMap(git, merge.sha, tip)
  );
  const signed: SignedAnchor[] = merges.flatMap((merge, i) =>
    anchorsPerMerge[i].map((anchor) => ({
      anchor,
      merge,
      renamedTo: renamesPerMerge[i].get(anchor.path),
    }))
  );

  const raw = await readTreeLines(git, tip);
  const oracle = await blameOracle(
    git,
    tip,
    [...raw.keys()],
    new Set(merges.map((m) => m.sha))
  );

  const prBySha = new Map(merges.map((m) => [m.sha, m.pr]));
  const indexes = new Map<Normalization, TipIndex>();
  const configs: ConfigReplay[] = [];
  let defaultResolutions: Resolution[] = [];
  let defaultUnexplained: UnexplainedEntry[] = [];
  for (const config of options.configs) {
    const index =
      indexes.get(config.normalization) ??
      buildTipIndex(raw, config.normalization);
    indexes.set(config.normalization, index);
    const { replay, resolutions, unexplainedDetail } = gradeConfig(
      index,
      signed,
      config,
      oracle,
      prBySha
    );
    configs.push(replay);
    if (defaultResolutions.length === 0) {
      defaultResolutions = resolutions;
      defaultUnexplained = unexplainedDetail;
    }
  }

  const perPr = merges.map((pr) => ({
    pr,
    anchors: 0,
    lines: 0,
    alive: 0,
    stale: 0,
    gone: 0,
  }));
  const rowByPr = new Map(perPr.map((row) => [row.pr.sha, row]));
  for (const [i, { anchor, merge }] of signed.entries()) {
    const row = rowByPr.get(merge.sha);
    const resolution = defaultResolutions[i];
    if (!(row && resolution)) {
      continue;
    }
    row.anchors += 1;
    row.lines += anchor.lines.length;
    row[resolution.status] += anchor.lines.length;
  }

  return { tip, merges, configs, unexplainedDetail: defaultUnexplained, perPr };
};

const pct = (part: number, whole: number): string =>
  whole === 0 ? "  0.0%" : `${((100 * part) / whole).toFixed(1).padStart(5)}%`;

export const formatReplayReport = (report: ReplayReport): string => {
  const out: string[] = [];
  out.push(
    `replayed ${report.merges.length} squash merges, ` +
      `${report.configs[0]?.anchors ?? 0} anchors, ` +
      `${report.configs[0]?.lines ?? 0} signed lines`,
    "",
    "normalization  threshold   alive   stale    gone   unexplained (of blame survivors)"
  );
  for (const c of report.configs) {
    out.push(
      `${c.config.normalization.padEnd(13)}  ${String(
        c.config.staleThreshold
      ).padEnd(9)}  ${pct(c.alive, c.lines)}  ${pct(c.stale, c.lines)}  ${pct(
        c.gone,
        c.lines
      )}   ${String(c.unexplained).padStart(5)} ${pct(
        c.unexplained,
        c.blameSurvivors
      )} of ${c.blameSurvivors}`
    );
  }
  if (report.unexplainedDetail.length > 0) {
    out.push("", "unexplained lines (first config), largest first:");
    for (const entry of report.unexplainedDetail.slice(0, 10)) {
      out.push(
        `  #${entry.pr} ${entry.path}: ${entry.lines} blame-surviving line(s) unaccounted for`
      );
    }
  }
  out.push("", "per PR (first config), newest first:");
  for (const row of report.perPr) {
    out.push(
      `#${String(row.pr.pr).padEnd(4)} ${pct(row.alive, row.lines)} alive ${pct(
        row.stale,
        row.lines
      )} stale ${pct(row.gone, row.lines)} gone  · ${row.anchors} anchors, ${
        row.lines
      } lines · ${row.pr.subject.slice(0, 60)}`
    );
  }
  return out.join("\n");
};
