/**
 * "What changed since my last review" — the delta mode's pure core.
 *
 * The mode is a filter over the row stream the review already renders, never
 * a second diff source. Its ground truth is a snapshot taken the moment YOU
 * submit a review from this app: per file, the same content fingerprint the
 * viewed marks use, plus a multiset of the file's changed-row contents. On the
 * next visit, a file whose fingerprint still matches did not move and can be
 * collapsed whole; inside a file that did move, a changed row whose content
 * was already in the snapshot is old (dimmed) and one that was not is new.
 *
 * Honesty limits, by construction: rows are matched by content, so a line
 * that was edited counts as new (its old form silently drops out) and a
 * duplicate of an already-reviewed line consumes one snapshot count before
 * reading as new. A renamed file loses its snapshot entry and reads as all
 * new. Reviews submitted outside this app leave no snapshot, so the mode
 * compares against the last one submitted from here — the header copy carries
 * that date rather than pretending otherwise. Past SNAPSHOT_ROW_CAP changed
 * rows the snapshot keeps fingerprints only — file granularity stays exact,
 * row dimming degrades to "show everything" in the files that moved.
 */

import type { ChangedFile } from "../types.ts";
import { parsePatch, rowAnchor } from "./diff.ts";
import { fingerprintFile } from "./viewed-fingerprint.ts";

interface DeltaFileSnapshot {
  fp: string;
  rows?: Record<string, number>;
}

export interface DeltaSnapshot {
  files: Record<string, DeltaFileSnapshot>;
  headSha: string;
  submittedAt: string;
}

export type DeltaFileState =
  | { kind: "unchanged" }
  | { kind: "all-new" }
  | { kind: "partial"; newAnchors: ReadonlySet<string> };

export interface DeltaView {
  files: ReadonlyMap<string, DeltaFileState>;
  sinceIso: string;
  unchangedCount: number;
}

export const SNAPSHOT_ROW_CAP = 30_000;

function stringHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 4_294_967_296;
  }
  return hash.toString(16).padStart(8, "0");
}

function rowKey(type: string, content: string): string {
  return stringHash(`${type}\u0000${content}`);
}

type SnapshotFile = Pick<ChangedFile, "filename" | "patch" | "sha">;

function changedRowKeys(patch: string): string[] {
  const keys: string[] = [];
  for (const hunk of parsePatch(patch)) {
    for (const row of hunk.rows) {
      if (row.type === "add" || row.type === "del") {
        keys.push(rowKey(row.type, row.content));
      }
    }
  }
  return keys;
}

export function buildDeltaSnapshot(
  files: readonly SnapshotFile[],
  headSha: string,
  submittedAt: string
): DeltaSnapshot {
  const rowsByFile = new Map<string, string[]>();
  let totalRows = 0;
  for (const file of files) {
    if (!file.patch) {
      continue;
    }
    const keys = changedRowKeys(file.patch);
    totalRows += keys.length;
    rowsByFile.set(file.filename, keys);
  }
  const keepRows = totalRows <= SNAPSHOT_ROW_CAP;

  const out: Record<string, DeltaFileSnapshot> = {};
  for (const file of files) {
    const entry: DeltaFileSnapshot = { fp: fingerprintFile(file, headSha) };
    const keys = rowsByFile.get(file.filename);
    if (keepRows && keys) {
      const counts: Record<string, number> = {};
      for (const key of keys) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
      entry.rows = counts;
    }
    out[file.filename] = entry;
  }
  return { files: out, headSha, submittedAt };
}

function classifyChangedFile(
  file: SnapshotFile,
  snap: DeltaFileSnapshot
): DeltaFileState {
  if (!(snap.rows && file.patch)) {
    return { kind: "all-new" };
  }
  const remaining: Record<string, number> = { ...snap.rows };
  const newAnchors = new Set<string>();
  for (const hunk of parsePatch(file.patch)) {
    for (const row of hunk.rows) {
      if (row.type !== "add" && row.type !== "del") {
        continue;
      }
      const key = rowKey(row.type, row.content);
      const left = remaining[key] ?? 0;
      if (left > 0) {
        remaining[key] = left - 1;
        continue;
      }
      const anchor = rowAnchor(row);
      if (anchor !== null) {
        newAnchors.add(anchor);
      }
    }
  }
  return { kind: "partial", newAnchors };
}

/**
 * Classifies the current file list against the snapshot. Files the snapshot
 * never saw are all new; files whose fingerprint still matches are unchanged;
 * the rest get row-level anchors of what arrived after the review.
 */
export function classifyDelta(
  snapshot: DeltaSnapshot,
  files: readonly SnapshotFile[],
  headSha: string
): DeltaView {
  const out = new Map<string, DeltaFileState>();
  let unchangedCount = 0;
  for (const file of files) {
    const snap = snapshot.files[file.filename];
    if (!snap) {
      out.set(file.filename, { kind: "all-new" });
      continue;
    }
    if (fingerprintFile(file, headSha) === snap.fp) {
      out.set(file.filename, { kind: "unchanged" });
      unchangedCount += 1;
      continue;
    }
    out.set(file.filename, classifyChangedFile(file, snap));
  }
  return { files: out, sinceIso: snapshot.submittedAt, unchangedCount };
}

export function deltaBadge(sinceIso: string): { label: string; title: string } {
  const parsed = new Date(sinceIso);
  const date = Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
  return {
    label: "since your review",
    title: date
      ? `Showing what changed since the review you submitted on ${date}. Rows you already reviewed are dimmed; files that did not move are folded. Press d to show everything.`
      : "Showing what changed since your last review. Rows you already reviewed are dimmed; files that did not move are folded. Press d to show everything.",
  };
}

export function deltaUnavailableMessage(): string {
  return "Nothing to compare against yet. A snapshot is saved when you submit a review from the app, and this pull request has none.";
}
