/**
 * Pure adapters between the ledger session payload and the PR review
 * surface. The engine emits per-file patches (hunk bodies); these turn them
 * into the `ChangedFile` shape the diff list eats, resolve the cursor back
 * to a signable region, and group the queue by provenance PR.
 *
 * Region resolution is line-based, not hunk-based: regions are tip
 * coordinates, so a row's RIGHT-side line number locates it inside (or
 * nearest to) a region regardless of how git chose to cut the hunks.
 */
import type {
  ChangedFile,
  LedgerQueueItem,
  LedgerSessionFile,
  LedgerSessionRegion,
} from "../types.ts";
import { parsePatch } from "./diff.ts";
import type { CursorPos } from "./review-cursor.ts";
import {
  fileAnchorKey,
  type ReviewListModel,
  type ReviewRowItem,
} from "./review-items.ts";

export function sessionToChangedFiles(
  files: readonly LedgerSessionFile[],
  tip: string
): ChangedFile[] {
  return files.map((file) => {
    let additions = 0;
    let deletions = 0;
    for (const hunk of parsePatch(file.patch)) {
      for (const row of hunk.rows) {
        if (row.type === "add") {
          additions += 1;
        } else if (row.type === "del") {
          deletions += 1;
        }
      }
    }
    return {
      additions,
      changes: additions + deletions,
      deletions,
      filename: file.path,
      patch: file.patch,
      sha: tip,
      status: "modified",
    };
  });
}

const ANCHOR_LINE = /^(LEFT|RIGHT):(\d+)$/;

/** The row's tip-side line, walking to the nearest row that has one. */
function tipLineAt(model: ReviewListModel, itemIndex: number): number | null {
  const at = model.items[itemIndex];
  if (at?.kind !== "row") {
    return null;
  }
  const scan = (from: number, step: -1 | 1): number | null => {
    for (let i = from; i >= 0 && i < model.items.length; i += step) {
      const item = model.items[i];
      if (item?.kind !== "row" || item.fileIndex !== at.fileIndex) {
        return null;
      }
      const line = (item as ReviewRowItem).row.newLine;
      if (line !== null) {
        return line;
      }
    }
    return null;
  };
  return scan(itemIndex, -1) ?? scan(itemIndex, 1);
}

export interface RegionAtCursor {
  path: string;
  region: LedgerSessionRegion;
  target: string;
}

/** The region `r` would sign: the one under the cursor, else the nearest in its file. */
export function regionAtCursor(
  model: ReviewListModel,
  files: readonly ChangedFile[],
  sessionFiles: readonly LedgerSessionFile[],
  cursor: CursorPos | null
): RegionAtCursor | null {
  if (!cursor) {
    return null;
  }
  const file = files[cursor.fileIndex];
  const session = file
    ? sessionFiles.find((s) => s.path === file.filename)
    : undefined;
  if (!session || session.regions.length === 0) {
    return null;
  }
  const itemIndex = model.anchorItem.get(
    fileAnchorKey(cursor.fileIndex, cursor.anchor)
  );
  const line =
    itemIndex === undefined
      ? Number(ANCHOR_LINE.exec(cursor.anchor)?.[2] ?? Number.NaN)
      : tipLineAt(model, itemIndex);
  if (line === null || Number.isNaN(line)) {
    return null;
  }
  let best: LedgerSessionRegion | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of session.regions) {
    let distance = 0;
    if (line < region.startLine) {
      distance = region.startLine - line;
    } else if (line > region.endLine) {
      distance = line - region.endLine;
    }
    if (distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }
  if (!best) {
    return null;
  }
  return {
    path: session.path,
    region: best,
    target: `${session.path}:${best.startLine}-${best.endLine}`,
  };
}

const TARGET = /^(.+):(\d+)-(\d+)$/;

/** Where the cursor should land when a session opens on `initialTarget`. */
export function initialAnchorFor(
  files: readonly ChangedFile[],
  model: ReviewListModel,
  initialTarget: string
): { anchor: string; fileIndex: number } | null {
  const parsed = TARGET.exec(initialTarget);
  if (!parsed) {
    return null;
  }
  const fileIndex = files.findIndex((f) => f.filename === parsed[1]);
  if (fileIndex === -1) {
    return null;
  }
  const start = Number(parsed[2]);
  const end = Number(parsed[3]);
  // The region's first line present in the patch; a real net diff may render
  // parts of the region as context, so probe the span rather than trusting
  // its first line to be an add row.
  for (let line = start; line <= end; line += 1) {
    const anchor = `RIGHT:${line}`;
    if (model.anchorItem.has(fileAnchorKey(fileIndex, anchor))) {
      return { anchor, fileIndex };
    }
  }
  const first = model.nav.find((entry) => entry.fileIndex === fileIndex);
  return first ? { anchor: first.anchor, fileIndex } : null;
}

export interface ProvenanceGroup {
  /** Distinct headline provenance labels across the group's items (#pr / sha). */
  chips: string[];
  fileCount: number;
  items: LedgerQueueItem[];
  key: string;
  label: string;
  newLines: number;
  subject: string;
}

/**
 * The queue as feature groups keyed by the ENGINE's topic classification
 * (item.topic — conventional scope, #pr, sha fallback, derived line-level
 * in deriveStatus), in first-appearance order. The engine is the single
 * source of truth so the queue, approvals, and coverage all agree on what
 * a topic is; per docs/LEDGER.md §3 grouping is ergonomics only.
 */
export function groupQueueByProvenance(queue: readonly LedgerQueueItem[]): {
  flat: LedgerQueueItem[];
  groups: ProvenanceGroup[];
} {
  const groups: ProvenanceGroup[] = [];
  const byKey = new Map<string, ProvenanceGroup>();
  for (const item of queue) {
    const head = item.provenance[0];
    const key = item.topic;
    let group = byKey.get(key);
    if (!group) {
      group = {
        chips: [],
        fileCount: 0,
        items: [],
        key,
        label: key,
        newLines: 0,
        subject: head?.subject ?? "",
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
    group.newLines += item.newLines;
    if (head !== undefined) {
      const chip = head.pr === null ? head.sha.slice(0, 7) : `#${head.pr}`;
      if (!group.chips.includes(chip)) {
        group.chips.push(chip);
      }
    }
  }
  for (const group of groups) {
    group.fileCount = new Set(group.items.map((i) => i.path)).size;
  }
  return { flat: groups.flatMap((g) => g.items), groups };
}
