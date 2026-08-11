/**
 * Diff wiring for the in-PR search pane; the view is pr-search, catalogued in
 * @nod/ui. It parses the PR's patches into the rows the pane searches and
 * lends it the app's syntax highlighter, so the pane itself stays renderable
 * from a fixture.
 *
 * Rows keep their hunk grouping because the pane's context snippet must stop
 * at a hunk boundary — rows either side of one are not adjacent in the file —
 * and they are built only while the pane is open (`mode === null` is closed),
 * since parsing every patch of a large PR is wasted work the rest of the time.
 */

import {
  PrSearch,
  type PrSearchFile,
  type PrSearchMode,
} from "@nod/ui/pr-search";
import { useMemo } from "react";
import { type DiffRow, parsePatch } from "../../lib/diff.ts";
import { highlightLineWithMatch } from "../../lib/highlight.ts";
import type { ChangedFile } from "../../types.ts";

function rowAnchor(row: DiffRow): string | null {
  if (row.type === "del") {
    return row.oldLine === null ? null : `LEFT:${row.oldLine}`;
  }
  return row.newLine === null ? null : `RIGHT:${row.newLine}`;
}

function toSearchFiles(files: ChangedFile[]): PrSearchFile[] {
  return files.map((f) => ({
    filename: f.filename,
    hunks: parsePatch(f.patch).map((hunk) =>
      hunk.rows
        .filter((row) => row.type !== "hunk")
        .map((row) => ({
          anchor: rowAnchor(row),
          num: row.newLine ?? row.oldLine,
          text: row.content,
        }))
    ),
  }));
}

export function DiffSearch({
  mode,
  files,
  onClose,
  onSelectFile,
  onSelectLine,
}: {
  mode: PrSearchMode | null;
  files: ChangedFile[];
  onClose: () => void;
  onSelectFile: (index: number) => void;
  onSelectLine: (index: number, anchor: string) => void;
}) {
  const open = mode !== null;
  const searchFiles = useMemo(
    () => (open ? toSearchFiles(files) : []),
    [open, files]
  );

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  return (
    <PrSearch
      files={searchFiles}
      highlightLine={highlightLineWithMatch}
      mode={mode ?? "files"}
      onOpenChange={onOpenChange}
      onSelectFile={onSelectFile}
      onSelectLine={onSelectLine}
      open={open}
    />
  );
}
