/**
 * Pure logic behind repo-scope search: tagging repo grep hits against the
 * diff, slicing peek context out of a fetched blob, and deriving the pane's
 * phase from the repo store's lifecycle.
 *
 * A hit counts as "in this PR" only when its exact line exists on the new side
 * of the diff (a `RIGHT:` anchor) — path overlap alone is not enough to jump
 * to or comment on. Anchored hits sort first, stably, so the results a review
 * can act on lead the list. Blob decoding goes through TextDecoder because
 * atob alone mangles anything outside Latin-1.
 *
 * The phase derivation orders the store above the grep: until the store has
 * the commit the grep cannot mean anything, and a store the backend lost (a
 * clone or fetch error) is a terminal "failed" whose reason is the backend's
 * own words — a dead network and a missing git must read as different
 * problems.
 *
 * `buildRepoState` assembles the pane's whole prop from those pieces, so the
 * host computes it during render with nothing to memoize and the assembly
 * itself is testable without a component.
 */
import type {
  PrSearchFile,
  PrSearchSnippetLine,
  RepoSearchHit,
  RepoSearchState,
} from "@nod/ui/pr-search";

import type { GrepHit, RepoStoreStatus } from "../types.ts";

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

export function repoSearchPhase(args: {
  store: RepoStoreStatus | undefined;
  storeError: unknown;
  grepFetching: boolean;
  grepError: unknown;
}): Pick<RepoSearchState, "reason" | "status"> {
  const { store, storeError, grepFetching, grepError } = args;
  if (storeError !== null && storeError !== undefined) {
    return { reason: String(storeError), status: "failed" };
  }
  if (store?.state === "failed") {
    return {
      reason: store.detail === "" ? undefined : store.detail,
      status: "failed",
    };
  }
  if (store?.state !== "ready") {
    return { status: "preparing" };
  }
  if (grepError !== null && grepError !== undefined) {
    return { reason: String(grepError), status: "failed" };
  }
  return { status: grepFetching ? "loading" : "ready" };
}

export function buildRepoState(args: {
  files: readonly PrSearchFile[];
  grepError: unknown;
  grepFetching: boolean;
  hits: readonly GrepHit[];
  peekLines: readonly string[] | null;
  peekPath: string | null;
  peekRadius: number;
  store: RepoStoreStatus | undefined;
  storeError: unknown;
  truncated: boolean;
}): RepoSearchState {
  const { files, hits, peekLines, peekPath, peekRadius, truncated } = args;
  const withContext = tagRepoHits(hits, files).map((hit) =>
    hit.path === peekPath && peekLines
      ? { ...hit, context: sliceContext(peekLines, hit.line, peekRadius) }
      : hit
  );
  return { hits: withContext, ...repoSearchPhase(args), truncated };
}
