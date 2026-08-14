import type { GitRun } from "./exec.ts";

/**
 * The hunk body (first `@@` onward) of one tip file's diff between two revs;
 * "" when the file is unchanged, pure-rename, or absent from the diff — the
 * caller falls back to synthesizing a patch. `\ No newline at end of file`
 * rows survive: the desktop parser skips `\`-prefixed lines correctly.
 *
 * `extraPath` widens the pathspec to the baseline anchor's original path so
 * a rename diffs as a rename instead of a whole-file delete + add.
 */
export const diffFilePatch = async (
  git: GitRun,
  from: string,
  to: string,
  tipPath: string,
  context: number,
  extraPath?: string
): Promise<string> => {
  const paths =
    extraPath && extraPath !== tipPath ? [tipPath, extraPath] : [tipPath];
  const out = await git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--find-renames",
    `--unified=${context}`,
    from,
    to,
    "--",
    ...paths,
  ]);
  return sectionFor(out, tipPath);
};

const SECTION_START = /^(?=diff --git )/m;
const TRAILING_NEWLINE = /\n$/;

/**
 * Two pathspecs can match two changed files, so headers are stripped by
 * section: split on `diff --git`, keep the section whose `+++ b/<path>` (or
 * `rename to <path>`) names the tip file, return it from its first `@@`.
 */
const sectionFor = (diff: string, tipPath: string): string => {
  for (const section of diff.split(SECTION_START)) {
    const named =
      section.includes(`\n+++ b/${tipPath}\n`) ||
      section.includes(`\nrename to ${tipPath}\n`);
    if (!named) {
      continue;
    }
    const at = section.indexOf("\n@@");
    if (at === -1) {
      return "";
    }
    return section.slice(at + 1).replace(TRAILING_NEWLINE, "");
  }
  return "";
};
