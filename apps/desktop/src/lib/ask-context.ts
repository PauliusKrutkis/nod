/**
 * Assembles the context an ask-about-code question ships with (docs/AI.md):
 * the multi-line selection when one exists, else the cursor row, else a
 * whole-PR summary of changed files. Only what the disclosure sentence
 * promises leaves the app — file path, line numbers, and the code itself —
 * and only for the user-initiated question. Line labels use the target
 * side's numbers, matching the composer's "Lines a–b" chip.
 */
import type {
  AiAskContext,
  ChangedFile,
  ChatRegion,
  PullRequest,
} from "../types.ts";
import type { CursorPos } from "./review-cursor.ts";
import { fileAnchorKey, type ReviewListModel } from "./review-items.ts";

interface SelectionRange {
  fileIndex: number;
  fromItem: number;
  side: string;
  toItem: number;
}

interface CodeContext {
  code: string;
  filePath: string;
  lineRange: string;
  side: string;
}

function lineLabel(lines: number[]): string {
  const first = Math.min(...lines);
  const last = Math.max(...lines);
  return first === last ? String(first) : `${first}–${last}`;
}

function selectionContext(
  model: ReviewListModel,
  files: readonly ChangedFile[],
  selection: SelectionRange
): CodeContext | null {
  const contents: string[] = [];
  const lines: number[] = [];
  for (let i = selection.fromItem; i <= selection.toItem; i += 1) {
    const item = model.items[i];
    if (item?.kind !== "row" || item.target?.side !== selection.side) {
      continue;
    }
    contents.push(item.row.content);
    lines.push(item.target.line);
  }
  const filePath = files[selection.fileIndex]?.filename;
  if (contents.length === 0 || !filePath) {
    return null;
  }
  return {
    code: contents.join("\n"),
    filePath,
    lineRange: lineLabel(lines),
    side: selection.side,
  };
}

function cursorContext(
  model: ReviewListModel,
  files: readonly ChangedFile[],
  cursor: CursorPos
): CodeContext | null {
  const itemIndex = model.anchorItem.get(
    fileAnchorKey(cursor.fileIndex, cursor.anchor)
  );
  const item = itemIndex === undefined ? undefined : model.items[itemIndex];
  const filePath = files[cursor.fileIndex]?.filename;
  if (item?.kind !== "row" || !(item.target && filePath)) {
    return null;
  }
  return {
    code: item.row.content,
    filePath,
    lineRange: String(item.target.line),
    side: item.target.side,
  };
}

function focusedContext(args: {
  cursor: CursorPos | null;
  files: readonly ChangedFile[];
  model: ReviewListModel;
  selection: SelectionRange | null;
}): CodeContext | null {
  return (
    (args.selection &&
      selectionContext(args.model, args.files, args.selection)) ||
    (args.cursor && cursorContext(args.model, args.files, args.cursor)) ||
    null
  );
}

/** The context chip's text — names the ask target without building the
 *  whole-PR summary string the full context would carry. */
export function askTargetLabel(args: {
  cursor: CursorPos | null;
  files: readonly ChangedFile[];
  model: ReviewListModel;
  selection: SelectionRange | null;
}): string {
  const focused = focusedContext(args);
  return focused
    ? `${focused.filePath}:${focused.lineRange}`
    : "Whole pull request";
}

/** The focused code as a chat region chip — selection first, else the
 *  cursor row, else null (nothing under focus adds nothing to the chat). */
export function regionFromSnapshot(args: {
  cursor: CursorPos | null;
  files: readonly ChangedFile[];
  model: ReviewListModel;
  selection: SelectionRange | null;
}): ChatRegion | null {
  const focused = focusedContext(args);
  return focused
    ? {
        code: focused.code,
        filePath: focused.filePath,
        lineRange: focused.lineRange,
        side: focused.side,
      }
    : null;
}

export function buildAskContext(args: {
  cursor: CursorPos | null;
  files: readonly ChangedFile[];
  model: ReviewListModel;
  pr: PullRequest;
  selection: SelectionRange | null;
}): AiAskContext {
  const base: AiAskContext = {
    code: null,
    diffSummary: null,
    filePath: null,
    headSha: args.pr.headSha,
    lineRange: null,
    owner: args.pr.owner,
    prBody: args.pr.body,
    prTitle: args.pr.title,
    // `pr.repo` is the "owner/name" path; the API wants the bare name, which
    // is `pr.name`. Getting this wrong asks for /repos/owner/owner/name and
    // gets a 404, which reads as "no snapshot" rather than as a bug.
    repo: args.pr.name,
  };
  const focused = focusedContext(args);
  if (focused) {
    return {
      ...base,
      code: focused.code,
      filePath: focused.filePath,
      lineRange: focused.lineRange,
    };
  }
  const diffSummary = args.files
    .map((f) => `${f.filename} (+${f.additions} -${f.deletions})`)
    .join("\n");
  return { ...base, diffSummary };
}
