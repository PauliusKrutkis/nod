import type { ResolveConfig } from "../anchors/resolve.ts";
import { diffFilePatch } from "../git/diff.ts";
import type { GitRun } from "../git/exec.ts";
import { readLinesAt } from "../git/files.ts";
import { deriveStatus, type QueueBaseline, type QueueItem } from "./status.ts";

/**
 * The session payload (docs/LEDGER.md §6 screen 2): each queued file as a
 * unified patch the PR diff surface can render unchanged. When every run in
 * a file decayed from one signed sha, the patch is the real net diff from
 * that baseline to tip; otherwise it is synthesized — unreviewed lines as
 * `+` with context — which is always truthful about what is unsigned.
 * Patches are hunk bodies only (first `@@` onward), matching the desktop's
 * single-file patch parser.
 */

/** 1-based inclusive span on tip; identical to the queue item's span. */
export interface SessionRegion {
  startLine: number;
  endLine: number;
}

interface SessionFile {
  path: string;
  /** Non-null iff `patch` is the real diff from this sha to tip. */
  baseline: QueueBaseline | null;
  patch: string;
  regions: SessionRegion[];
}

export interface LedgerSession {
  tip: string;
  sessions: SessionFile[];
}

/** Context lines around each unreviewed run in a synthesized patch. */
const CONTEXT = 8;

const TARGET = /^(.+):(\d+)-(\d+)$/;

/** Same grammar and overlap semantics as `ledger review` targets. */
const matchesTarget = (item: QueueItem, target: string): boolean => {
  const range = TARGET.exec(target);
  if (!range) {
    return item.path === target;
  }
  return (
    item.path === range[1] &&
    item.startLine <= Number(range[3]) &&
    item.endLine >= Number(range[2])
  );
};

/**
 * Build a hunk body presenting `regions` as additions over a synthetic old
 * file that lacks them: region lines are `+`, surrounding context ` `. The
 * old side therefore counts context lines only, and git's `-X,0` convention
 * (insert after old line X) applies when a hunk is pure addition.
 */
export const synthesizePatch = (
  fileLines: readonly string[],
  regions: readonly SessionRegion[],
  context: number
): string => {
  if (fileLines.length === 0 || regions.length === 0) {
    return "";
  }
  const isAdd = new Uint8Array(fileLines.length);
  for (const region of regions) {
    for (let i = region.startLine - 1; i < region.endLine; i++) {
      if (i >= 0 && i < isAdd.length) {
        isAdd[i] = 1;
      }
    }
  }
  // addsBefore[i] = region lines at index < i.
  const addsBefore = new Uint32Array(fileLines.length + 1);
  for (let i = 0; i < fileLines.length; i++) {
    addsBefore[i + 1] = addsBefore[i] + isAdd[i];
  }

  const windows: { start: number; end: number }[] = [];
  for (const region of regions) {
    const start = Math.max(0, region.startLine - 1 - context);
    const end = Math.min(fileLines.length - 1, region.endLine - 1 + context);
    const last = windows.at(-1);
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      windows.push({ start, end });
    }
  }

  const hunks = windows.map(({ start, end }) => {
    const newStart = start + 1;
    const newCount = end - start + 1;
    const adds = addsBefore[end + 1] - addsBefore[start];
    const oldCount = newCount - adds;
    const oldLinesBefore = start - addsBefore[start];
    const oldStart = oldCount > 0 ? oldLinesBefore + 1 : oldLinesBefore;
    const rows: string[] = [
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ];
    for (let i = start; i <= end; i++) {
      rows.push(`${isAdd[i] ? "+" : " "}${fileLines[i]}`);
    }
    return rows.join("\n");
  });
  return hunks.join("\n");
};

export const deriveSession = async (
  git: GitRun,
  options: {
    epoch: string;
    tip?: string;
    targets?: readonly string[];
    config?: ResolveConfig;
    approvalsRequired?: number;
  }
): Promise<LedgerSession> => {
  // Always re-derive: run spans, masks, and baselines are only correct
  // against current facts + tip, and a stale span would present already
  // reviewed lines as unsigned. (A future `paths` option could narrow the
  // blame pass — resolution still needs the whole tip index.)
  const status = await deriveStatus(git, options);
  const targets = options.targets ?? [];

  const byPath = new Map<string, QueueItem[]>();
  for (const item of status.queue) {
    const wanted =
      targets.length === 0 ||
      targets.some((target) => matchesTarget(item, target));
    if (wanted) {
      const list = byPath.get(item.path) ?? [];
      list.push(item);
      byPath.set(item.path, list);
    }
  }

  const sessions: SessionFile[] = [];
  for (const [path] of byPath) {
    // A session file carries every run in the file, targeted or not — the
    // reviewer should see all that is unsigned in what they are reading.
    const items = status.queue.filter((item) => item.path === path);
    const regions = items.map(({ startLine, endLine }) => ({
      startLine,
      endLine,
    }));
    const shared = sharedBaseline(items);
    if (shared) {
      const patch = await diffFilePatch(
        git,
        shared.sha,
        status.tip,
        path,
        CONTEXT,
        shared.refPath
      );
      if (patch !== "") {
        sessions.push({ path, baseline: shared, patch, regions });
        continue;
      }
    }
    const lines = await readLinesAt(git, status.tip, path);
    sessions.push({
      path,
      baseline: null,
      patch: synthesizePatch(lines, regions, CONTEXT),
      regions,
    });
  }
  return { tip: status.tip, sessions };
};

/**
 * The one sha the whole file's runs decayed from, or null. Mixed baselines
 * synthesize instead: diffing from the older sha would drown the view in
 * churn a newer fact already signed, and from the newer one would hide
 * unsigned lines older than it.
 */
const sharedBaseline = (items: readonly QueueItem[]): QueueBaseline | null => {
  const first = items[0]?.baseline;
  if (!first) {
    return null;
  }
  return items.every((item) => item.baseline?.sha === first.sha) ? first : null;
};
