import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024;

export type GitRun = (
  args: readonly string[],
  options?: {
    input?: string;
    /**
     * "latin1" gives a byte-exact string (one char per byte) for output that
     * must be sliced by byte counts, e.g. `cat-file --batch` headers.
     */
    encoding?: "utf8" | "latin1";
  }
) => Promise<string>;

/**
 * A runner bound to one repository. Everything in the ledger shells out to
 * system git through this seam (docs/LEDGER.md §5), which is also what tests
 * point at temp repos.
 */
export const gitIn =
  (repoDir: string): GitRun =>
  async (args, options) => {
    const pending = execFileAsync("git", [...args], {
      cwd: repoDir,
      encoding: options?.encoding ?? "utf8",
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    if (options?.input !== undefined) {
      pending.child.stdin?.write(options.input);
      pending.child.stdin?.end();
    }
    const { stdout } = await pending;
    return stdout;
  };
