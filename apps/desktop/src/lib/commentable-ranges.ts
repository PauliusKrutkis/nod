/**
 * The diff positions a comment may anchor to, computed from the patches with
 * the same rules that gate the composer (review-items' rowTarget): deleted
 * rows comment on the LEFT at their old line, added and context rows on the
 * RIGHT at their new line, and nothing else. Built from `parsePatch` output
 * only, so synthetic full-file-expansion rows — which the forges reject —
 * can never appear. Ranges are inclusive, sorted, disjoint; Rust validates
 * every propose_comment call against them, which is what makes an
 * agent-authored anchor as trustworthy as a hand-placed one.
 */

import type { ChangedFile, CommentableSide } from "../types.ts";
import { parsePatch } from "./diff.ts";

function mergeLines(lines: number[]): [number, number][] {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const line of sorted) {
    const last = ranges.at(-1);
    if (last && line === last[1] + 1) {
      last[1] = line;
    } else {
      ranges.push([line, line]);
    }
  }
  return ranges;
}

export function buildCommentableRanges(
  files: readonly ChangedFile[]
): CommentableSide[] {
  const out: CommentableSide[] = [];
  for (const file of files) {
    const left: number[] = [];
    const right: number[] = [];
    for (const hunk of parsePatch(file.patch)) {
      for (const row of hunk.rows) {
        if (row.type === "del" && row.oldLine !== null) {
          left.push(row.oldLine);
        } else if (
          (row.type === "add" || row.type === "context") &&
          row.newLine !== null
        ) {
          right.push(row.newLine);
        }
      }
    }
    if (left.length > 0) {
      out.push({ path: file.filename, ranges: mergeLines(left), side: "LEFT" });
    }
    if (right.length > 0) {
      out.push({
        path: file.filename,
        ranges: mergeLines(right),
        side: "RIGHT",
      });
    }
  }
  return out;
}
