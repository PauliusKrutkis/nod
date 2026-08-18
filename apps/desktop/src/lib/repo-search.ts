/**
 * Pure logic behind repo-scope search: tagging snapshot grep hits against the
 * diff and slicing peek context out of a fetched blob.
 *
 * A hit counts as "in this PR" only when its exact line exists on the new side
 * of the diff (a `RIGHT:` anchor) — path overlap alone is not enough to jump
 * to or comment on. Anchored hits sort first, stably, so the results a review
 * can act on lead the list. Blob decoding goes through TextDecoder because
 * atob alone mangles anything outside Latin-1.
 */
import type {
  PrSearchFile,
  PrSearchSnippetLine,
  RepoSearchHit,
} from "@nod/ui/pr-search";

import type { GrepHit } from "../types.ts";

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
