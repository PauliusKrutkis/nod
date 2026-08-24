/**
 * The pull request's diff, shaped for the chat request so the model's
 * read_diff tool can serve real hunks — the diff is what is being reviewed,
 * and file names with +/- counts (the summary) were never enough to answer
 * questions about it. Per-file and total caps keep the request bounded on
 * monster PRs; a capped file is truncated with a marker and an over-budget
 * file is present by name with an omission note, so the model always knows
 * what it is not seeing.
 */

import type { ChangedFile, ChatDiff } from "../types.ts";

const MAX_PATCH_CHARS = 40_000;
const MAX_TOTAL_CHARS = 400_000;

export function buildChatDiffs(files: readonly ChangedFile[]): ChatDiff[] {
  const out: ChatDiff[] = [];
  let total = 0;
  for (const file of files) {
    if (!file.patch) {
      continue;
    }
    let patch = file.patch;
    if (patch.length > MAX_PATCH_CHARS) {
      patch = `${patch.slice(0, MAX_PATCH_CHARS)}\n[truncated — the diff for this file continues]`;
    }
    if (total + patch.length > MAX_TOTAL_CHARS) {
      out.push({
        patch:
          "[omitted — the whole diff is too large to attach; read this file with the repository tools]",
        path: file.filename,
      });
      continue;
    }
    total += patch.length;
    out.push({ patch, path: file.filename });
  }
  return out;
}
