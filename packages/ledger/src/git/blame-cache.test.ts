import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blameTree } from "./blame.ts";
import { cachedBlameTree } from "./blame-cache.ts";
import { type GitRun, gitIn } from "./exec.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

interface Repo {
  dir: string;
  git: GitRun;
}

const makeRepo = async (): Promise<Repo> => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-blame-cache-test-"));
  dirs.push(dir);
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

const cacheDirOf = (repo: Repo): string =>
  join(repo.dir, ".git", "ledger-cache");

describe("cachedBlameTree", () => {
  it("matches a live blame and hits on the second call", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "one\ntwo\n");
    await write(repo, "sub/b.ts", "three\n");
    const tip = await commitAll(repo, "first");

    const paths = ["a.ts", "sub/b.ts"];
    const live = await blameTree(repo.git, tip, paths);
    const cold = await cachedBlameTree(repo.git, tip, paths);
    expect(cold).toEqual(live);
    await expect(readdir(cacheDirOf(repo))).resolves.toContain(
      `blame-${tip}.json`
    );

    const warm = await cachedBlameTree(repo.git, tip, paths);
    expect(warm).toEqual(live);
  });

  it("keys by rev, so a new commit derives fresh", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "one\n");
    const first = await commitAll(repo, "first");
    await cachedBlameTree(repo.git, first, ["a.ts"]);

    await write(repo, "a.ts", "one\nchanged\n");
    const second = await commitAll(repo, "second");
    const blames = await cachedBlameTree(repo.git, second, ["a.ts"]);
    expect(blames.get("a.ts")).toHaveLength(2);
    expect(blames.get("a.ts")?.[1]).toBe(second);
  });

  it("falls back to a live blame when the cache entry is corrupt", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "one\n");
    const tip = await commitAll(repo, "first");

    await mkdir(cacheDirOf(repo), { recursive: true });
    await writeFile(join(cacheDirOf(repo), `blame-${tip}.json`), "not json");

    const blames = await cachedBlameTree(repo.git, tip, ["a.ts"]);
    expect(blames.get("a.ts")?.[0]).toBe(tip);
  });

  it("prunes old revs beyond the keep limit", async () => {
    const repo = await makeRepo();
    const tips: string[] = [];
    for (let i = 0; i < 4; i++) {
      await write(repo, "a.ts", `line-${i}\n`);
      const tip = await commitAll(repo, `commit ${i}`);
      tips.push(tip);
      await cachedBlameTree(repo.git, tip, ["a.ts"]);
    }
    const entries = await readdir(cacheDirOf(repo));
    const cached = entries.filter((name) => name.startsWith("blame-"));
    expect(cached).toHaveLength(2);
    expect(cached).toContain(`blame-${tips[3]}.json`);
  });
});
