import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffFilePatch } from "./diff.ts";
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
  const dir = await mkdtemp(join(tmpdir(), "ledger-diff-test-"));
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

describe("diffFilePatch", () => {
  it("returns the hunk body only, headers stripped", async () => {
    const repo = await makeRepo();
    await write(repo, "src/a.ts", "const a = 1;\nconst b = 2;\n");
    const from = await commitAll(repo, "one");
    await write(repo, "src/a.ts", "const a = 1;\nconst b = 3;\n");
    const to = await commitAll(repo, "two");

    const patch = await diffFilePatch(repo.git, from, to, "src/a.ts", 3);
    expect(patch.startsWith("@@")).toBe(true);
    expect(patch).toContain("-const b = 2;");
    expect(patch).toContain("+const b = 3;");
    expect(patch).not.toContain("diff --git");
    expect(patch).not.toContain("+++");
  });

  it("preserves the no-newline marker", async () => {
    const repo = await makeRepo();
    await write(repo, "a.txt", "one\n");
    const from = await commitAll(repo, "one");
    await write(repo, "a.txt", "one\ntwo");
    const to = await commitAll(repo, "two");

    const patch = await diffFilePatch(repo.git, from, to, "a.txt", 3);
    expect(patch).toContain("\\ No newline at end of file");
  });

  it("returns empty for an unchanged file", async () => {
    const repo = await makeRepo();
    await write(repo, "a.txt", "same\n");
    const from = await commitAll(repo, "one");
    await write(repo, "b.txt", "other\n");
    const to = await commitAll(repo, "two");

    expect(await diffFilePatch(repo.git, from, to, "a.txt", 3)).toBe("");
  });

  it("selects the tip file's section when the extra path also changed", async () => {
    const repo = await makeRepo();
    await write(repo, "a.txt", "aaa\n");
    await write(repo, "b.txt", "bbb\n");
    const from = await commitAll(repo, "one");
    await write(repo, "a.txt", "aaa changed\n");
    await write(repo, "b.txt", "bbb changed\n");
    const to = await commitAll(repo, "two");

    const patch = await diffFilePatch(repo.git, from, to, "a.txt", 3, "b.txt");
    expect(patch).toContain("+aaa changed");
    expect(patch).not.toContain("bbb");
  });

  it("diffs across a rename when given the original path", async () => {
    const repo = await makeRepo();
    const body = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
    await write(repo, "old.txt", `${body}\n`);
    const from = await commitAll(repo, "one");
    await repo.git(["mv", "old.txt", "new.txt"]);
    await write(repo, "new.txt", `${body}\nadded\n`);
    const to = await commitAll(repo, "two");

    const patch = await diffFilePatch(
      repo.git,
      from,
      to,
      "new.txt",
      3,
      "old.txt"
    );
    expect(patch.startsWith("@@")).toBe(true);
    expect(patch).toContain("+added");
    expect(patch).not.toContain("rename");
  });
});
