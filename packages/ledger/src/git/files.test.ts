import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type GitRun, gitIn } from "./exec.ts";
import { readLinesAt, readTreeLines } from "./files.ts";

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
  const dir = await mkdtemp(join(tmpdir(), "ledger-files-test-"));
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

describe("readTreeLines", () => {
  it("reads every trackable file, multi-byte content intact", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "plain\nlines\n");
    // Multi-byte chars make byte counts diverge from char counts — the
    // batch framing must stay byte-accurate for everything after them.
    await write(repo, "unicode.ts", "naïve — héllo\n日本語の行\n");
    await write(repo, "after.ts", "still aligned\n");
    await write(repo, "assets/logo.png", "not text");
    const tip = await commitAll(repo, "first");

    const tree = await readTreeLines(repo.git, tip);
    expect([...tree.keys()].sort()).toEqual(["a.ts", "after.ts", "unicode.ts"]);
    expect(tree.get("unicode.ts")).toEqual(["naïve — héllo", "日本語の行"]);
    expect(tree.get("after.ts")).toEqual(["still aligned"]);
  });

  it("matches readLinesAt file for file", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "one\ntwo\n");
    await write(repo, "sub/b.ts", "three\nfour — ✓\n");
    const tip = await commitAll(repo, "first");

    const tree = await readTreeLines(repo.git, tip);
    for (const [path, lines] of tree) {
      expect(lines).toEqual(await readLinesAt(repo.git, tip, path));
    }
  });
});
