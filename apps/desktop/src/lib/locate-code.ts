/**
 * Where pasted code sits in this pull request, if it sits here at all.
 *
 * A pasted chip has no path — it is text the reviewer copied from somewhere
 * — so clicking it can only mean "show me where this is". This walks the
 * diff for a run of consecutive rows whose contents match the paste, and
 * hands back the same `{filePath, lineRange, side}` shape a captured region
 * carries, so the caller reveals it through one path.
 *
 * Matching is on trimmed content, ignoring blank lines in the paste: code
 * copied out of a terminal or a browser arrives re-indented, and an exact
 * match would fail on whitespace the reviewer never touched. Leading `+`,
 * `-` and gutter numbers are stripped for the same reason — a paste lifted
 * from a diff view should still find its lines.
 *
 * A miss returns null. There is nothing sensible to jump to, and inventing a
 * near-match would move the reviewer somewhere they did not ask to go.
 */

import type { ChangedFile } from "../types.ts";
import { parsePatch } from "./diff.ts";

export interface LocatedRegion {
  filePath: string;
  lineRange: string;
  side: string;
}

const DIFF_GUTTER = /^[+-]?\s*\d*\s?/;

function normalize(line: string): string {
  return line.replace(DIFF_GUTTER, "").trim();
}

/** The paste as the lines worth matching on — blank lines carry no identity
 *  and their placement differs between copy sources. */
function needleLines(code: string): string[] {
  return code
    .split("\n")
    .map(normalize)
    .filter((line) => line !== "");
}

interface Candidate {
  content: string;
  line: number;
  side: string;
}

function fileRows(file: ChangedFile): Candidate[] {
  const rows: Candidate[] = [];
  for (const hunk of parsePatch(file.patch)) {
    for (const row of hunk.rows) {
      if (row.type === "del" && row.oldLine !== null) {
        rows.push({
          content: normalize(row.content),
          line: row.oldLine,
          side: "LEFT",
        });
      } else if (
        (row.type === "add" || row.type === "context") &&
        row.newLine !== null
      ) {
        rows.push({
          content: normalize(row.content),
          line: row.newLine,
          side: "RIGHT",
        });
      }
    }
  }
  return rows;
}

/** Does the paste start at `start` on this side? Blank rows in between are
 *  skipped rather than breaking the run: a copy rarely keeps them. Returns
 *  the row after the match, or null. */
function runEndsAt(
  rows: readonly Candidate[],
  needle: readonly string[],
  start: number
): number | null {
  let at = start;
  let matched = 0;
  while (matched < needle.length && at < rows.length) {
    const row = rows[at];
    if (row === undefined) {
      return null;
    }
    if (row.content === "") {
      at += 1;
      continue;
    }
    if (row.content !== needle[matched]) {
      return null;
    }
    matched += 1;
    at += 1;
  }
  return matched === needle.length ? at : null;
}

/** The first run of rows matching the paste, on one side of one file. */
function matchInFile(
  file: ChangedFile,
  needle: readonly string[]
): LocatedRegion | null {
  const rows = fileRows(file);
  for (const side of ["RIGHT", "LEFT"]) {
    const sideRows = rows.filter((row) => row.side === side);
    for (let start = 0; start + needle.length <= sideRows.length; start += 1) {
      const end = runEndsAt(sideRows, needle, start);
      const first = end === null ? undefined : sideRows[start]?.line;
      const last = end === null ? undefined : sideRows[end - 1]?.line;
      if (first !== undefined && last !== undefined) {
        return {
          filePath: file.filename,
          lineRange: first === last ? String(first) : `${first}–${last}`,
          side,
        };
      }
    }
  }
  return null;
}

export function locatePastedCode(
  files: readonly ChangedFile[],
  code: string
): LocatedRegion | null {
  const needle = needleLines(code);
  if (needle.length === 0) {
    return null;
  }
  for (const file of files) {
    const found = matchInFile(file, needle);
    if (found) {
      return found;
    }
  }
  return null;
}
