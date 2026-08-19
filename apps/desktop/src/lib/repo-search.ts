/**
 * Pure logic behind repo-scope search: tagging snapshot grep hits against the
 * diff, slicing peek context out of a fetched blob, and deriving the pane's
 * phase from the snapshot's lifecycle.
 *
 * A hit counts as "in this PR" only when its exact line exists on the new side
 * of the diff (a `RIGHT:` anchor) — path overlap alone is not enough to jump
 * to or comment on. Anchored hits sort first, stably, so the results a review
 * can act on lead the list. Blob decoding goes through TextDecoder because
 * atob alone mangles anything outside Latin-1.
 *
 * The phase derivation orders the snapshot above the grep: until the snapshot
 * is ready the grep cannot mean anything, and a snapshot the backend refused
 * (too large) or lost (download error) is a terminal "failed" whose reason is
 * the backend's own words — a too-large repository and a dead network must
 * read as different problems. The grep's "snapshot not ready" error still
 * maps to "preparing" as a race guard for a snapshot evicted between the
 * status poll and the search.
 */
import type {
  PrSearchFile,
  PrSearchSnippetLine,
  RepoSearchHit,
  RepoSearchState,
} from "@nod/ui/pr-search";

import type { GrepHit, SnapshotStatus } from "../types.ts";

export function tagRepoHits(
  hits: readonly GrepHit[],
  files: readonly PrSearchFile[]
): RepoSearchHit[] {
  const byPath = new Map<string, { index: number; rightLines: Set<number> }>();
  files.forEach((file, index) => {
    const rightLines = new Set<number>();
    for (const hunk of file.hunks ?? []) {
      for (const line of hunk) {
        if (line.num !== null && line.anchor === `RIGHT:${line.num}`) {
          rightLines.add(line.num);
        }
      }
    }
    byPath.set(file.filename, { index, rightLines });
  });
  const tagged = hits.map((hit): RepoSearchHit => {
    const file = byPath.get(hit.path);
    const anchored = file?.rightLines.has(hit.line) ?? false;
    return {
      anchor: anchored ? `RIGHT:${hit.line}` : null,
      fileIndex: file === undefined ? null : file.index,
      line: hit.line,
      path: hit.path,
      text: hit.text,
    };
  });
  return [
    ...tagged.filter((hit) => hit.anchor !== null),
    ...tagged.filter((hit) => hit.anchor === null),
  ];
}

const LINE_BREAK = /\r?\n/;

export function blobLines(base64: string): string[] {
  const raw = atob(base64);
  const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes).split(LINE_BREAK);
}

export function sliceContext(
  lines: readonly string[],
  line: number,
  radius: number
): PrSearchSnippetLine[] {
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const out: PrSearchSnippetLine[] = [];
  for (let num = start; num <= end; num += 1) {
    out.push({ hit: num === line, num, text: lines[num - 1] });
  }
  return out;
}

const NOT_READY = "snapshot not ready";

export const SNAPSHOT_SETTLED: ReadonlySet<SnapshotStatus["state"]> = new Set([
  "failed",
  "ready",
  "skipped",
]);

export function isSnapshotNotReady(error: unknown): boolean {
  return String(error).includes(NOT_READY);
}

export function repoSearchPhase(args: {
  snapshot: SnapshotStatus | undefined;
  snapshotError: unknown;
  grepFetching: boolean;
  grepError: unknown;
}): Pick<RepoSearchState, "reason" | "status"> {
  const { snapshot, snapshotError, grepFetching, grepError } = args;
  if (snapshotError !== null && snapshotError !== undefined) {
    return { reason: String(snapshotError), status: "failed" };
  }
  if (snapshot?.state === "skipped") {
    return {
      reason: "This repository is too large for a local snapshot.",
      status: "failed",
    };
  }
  if (snapshot?.state === "failed") {
    return {
      reason: snapshot.detail === "" ? undefined : snapshot.detail,
      status: "failed",
    };
  }
  if (snapshot?.state !== "ready") {
    return { status: "preparing" };
  }
  if (grepError !== null && grepError !== undefined) {
    return isSnapshotNotReady(grepError)
      ? { status: "preparing" }
      : { reason: String(grepError), status: "failed" };
  }
  return { status: grepFetching ? "loading" : "ready" };
}
