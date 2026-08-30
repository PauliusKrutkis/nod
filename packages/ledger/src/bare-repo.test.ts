import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRepoRoot } from "./cli-args.ts";
import { readCommittedConfig } from "./config.ts";
import { signRegion } from "./derive/sign.ts";
import { deriveStatus } from "./derive/status.ts";
import type { Actor } from "./facts/schema.ts";
import { type GitRun, gitIn } from "./git/exec.ts";

/**
 * The desktop app runs the engine against app-owned bare clones. These
 * tests hold the line the whole integration stands on: everything the
 * engine does is rev-addressed, so a bare clone derives, signs, and reads
 * config exactly like the worktree it was cloned from.
 */

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const makeDir = async (prefix: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

interface Repo {
  dir: string;
  git: GitRun;
}

const makeRepo = async (): Promise<Repo> => {
  const dir = await makeDir("ledger-bare-test-");
  const git = gitIn(dir);
  await git(["init", "--quiet"]);
  await git(["config", "user.name", "ledger-test"]);
  await git(["config", "user.email", "ledger-test@invalid"]);
  return { dir, git };
};

const write = async (repo: Repo, path: string, content: string) => {
  const target = join(repo.dir, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
};

const commitAll = async (repo: Repo, message: string): Promise<string> => {
  await repo.git(["add", "-A"]);
  await repo.git(["commit", "--quiet", "-m", message]);
  return (await repo.git(["rev-parse", "HEAD"])).trim();
};

const ACTOR: Actor = { kind: "human", id: "tester" };
const AT_TIME = "2026-08-25T12:00:00.000Z";

/** A worktree repo with an epoch, a committed config, and post-epoch code. */
const seededRepo = async (): Promise<{ repo: Repo; epoch: string }> => {
  const repo = await makeRepo();
  await write(repo, "src/base.ts", "const base = 1;\n");
  const epoch = await commitAll(repo, "chore: seed");
  await write(
    repo,
    ".ledger/config.json",
    `${JSON.stringify({ version: 1, epoch }, null, 2)}\n`
  );
  await commitAll(repo, "chore: adopt ledger");
  await write(
    repo,
    "src/feature.ts",
    "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n"
  );
  await commitAll(repo, "feat(core): add feature");
  return { epoch, repo };
};

const bareCloneOf = async (repo: Repo): Promise<string> => {
  const parent = await makeDir("ledger-bare-clone-");
  const dest = join(parent, "store.git");
  await gitIn(parent)(["clone", "--quiet", "--bare", repo.dir, dest]);
  return dest;
};

describe("resolveRepoRoot", () => {
  it("resolves a worktree to its top level from a subdirectory", async () => {
    const { repo } = await seededRepo();
    const root = await resolveRepoRoot(join(repo.dir, "src"));
    expect(await realpath(root)).toBe(await realpath(repo.dir));
  });

  it("resolves a bare repo to its git dir", async () => {
    const { repo } = await seededRepo();
    const bare = await bareCloneOf(repo);
    const root = await resolveRepoRoot(bare);
    expect(await realpath(root)).toBe(await realpath(bare));
  });

  it("rejects a directory that is not a repository", async () => {
    const stray = await makeDir("ledger-not-a-repo-");
    await expect(resolveRepoRoot(stray)).rejects.toThrow(
      "not a git repository"
    );
  });
});

describe("readCommittedConfig", () => {
  it("reads the committed config from the tip tree of a bare clone", async () => {
    const { repo, epoch } = await seededRepo();
    const bare = await bareCloneOf(repo);
    const config = await readCommittedConfig(gitIn(bare), "HEAD");
    expect(config).toMatchObject({ epoch, version: 1 });
  });

  it("returns null when no config is committed", async () => {
    const repo = await makeRepo();
    await write(repo, "src/base.ts", "const base = 1;\n");
    await commitAll(repo, "chore: seed");
    expect(await readCommittedConfig(repo.git, "HEAD")).toBeNull();
  });

  it("throws loudly on a malformed committed config", async () => {
    const repo = await makeRepo();
    await write(repo, ".ledger/config.json", `{"version":1}\n`);
    await commitAll(repo, "chore: bad config");
    await expect(readCommittedConfig(repo.git, "HEAD")).rejects.toThrow(
      "invalid committed"
    );
  });
});

describe("bare-clone derivation", () => {
  it("derives the same status from a bare clone as from its worktree", async () => {
    const { repo, epoch } = await seededRepo();
    const bare = await bareCloneOf(repo);
    const fromWorktree = await deriveStatus(repo.git, { epoch });
    const fromBare = await deriveStatus(gitIn(bare), { epoch, tip: "HEAD" });
    expect(fromBare.tip).toBe(fromWorktree.tip);
    expect(fromBare.totalLines).toBe(fromWorktree.totalLines);
    expect(fromBare.coverage).toBe(fromWorktree.coverage);
    expect(fromBare.queue.length).toBe(fromWorktree.queue.length);
  });

  it("derives against an explicit tip ref, not just HEAD", async () => {
    const { repo, epoch } = await seededRepo();
    const bare = await bareCloneOf(repo);
    const tipSha = (await gitIn(bare)(["rev-parse", "HEAD"])).trim();
    const status = await deriveStatus(gitIn(bare), { epoch, tip: tipSha });
    expect(status.tip).toBe(tipSha);
  });

  it("signs a region in a bare clone and counts it as reviewed", async () => {
    const { repo, epoch } = await seededRepo();
    const bare = await bareCloneOf(repo);
    const git = gitIn(bare);
    const before = await deriveStatus(git, { epoch });
    const item = before.queue.find((i) => i.path === "src/feature.ts");
    expect(item).toBeDefined();
    if (!item) {
      return;
    }
    const factId = await signRegion(git, before.tip, item, ACTOR, AT_TIME);
    expect(factId).not.toBeNull();
    const after = await deriveStatus(git, { epoch });
    expect(after.reviewedLines).toBeGreaterThan(before.reviewedLines);
  });
});
