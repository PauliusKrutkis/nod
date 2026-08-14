import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "../facts/schema.ts";
import { type GitRun, gitIn } from "../git/exec.ts";
import { deriveSession, synthesizePatch } from "./session.ts";
import { signRegion } from "./sign.ts";
import { deriveStatus } from "./status.ts";

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
  const dir = await mkdtemp(join(tmpdir(), "ledger-session-test-"));
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

const ACTOR: Actor = { kind: "human", id: "tester" };
const AT_TIME = "2026-08-13T12:00:00.000Z";

const numbered = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `line ${from + i}`);

describe("synthesizePatch", () => {
  it("renders an interior run with exact hunk math", () => {
    const lines = numbered(1, 30);
    const patch = synthesizePatch(lines, [{ startLine: 11, endLine: 13 }], 3);
    // Window is lines 8..16 (1-based); old side lacks the 3 region lines.
    expect(patch.split("\n")[0]).toBe("@@ -8,6 +8,9 @@");
    expect(patch).toContain("+line 11");
    expect(patch).toContain(" line 8");
    expect(patch).toContain(" line 16");
  });

  it("covers a whole-file-new file as an insert at old line zero", () => {
    const lines = numbered(1, 4);
    const patch = synthesizePatch(lines, [{ startLine: 1, endLine: 4 }], 3);
    expect(patch.split("\n")[0]).toBe("@@ -0,0 +1,4 @@");
    expect(patch.split("\n").slice(1)).toEqual(lines.map((l) => `+${l}`));
  });

  it("clamps a run at file start and end", () => {
    const lines = numbered(1, 10);
    const head = synthesizePatch(lines, [{ startLine: 1, endLine: 2 }], 3);
    expect(head.split("\n")[0]).toBe("@@ -1,3 +1,5 @@");
    const tail = synthesizePatch(lines, [{ startLine: 9, endLine: 10 }], 3);
    expect(tail.split("\n")[0]).toBe("@@ -6,3 +6,5 @@");
  });

  it("merges touching context windows into one hunk", () => {
    const lines = numbered(1, 40);
    const patch = synthesizePatch(
      lines,
      [
        { startLine: 10, endLine: 11 },
        { startLine: 16, endLine: 17 },
      ],
      3
    );
    expect(patch.match(/^@@/gm)).toHaveLength(1);
    expect(patch.split("\n")[0]).toBe("@@ -7,10 +7,14 @@");
  });

  it("keeps far-apart runs as separate hunks with consistent old numbering", () => {
    const lines = numbered(1, 60);
    const patch = synthesizePatch(
      lines,
      [
        { startLine: 5, endLine: 6 },
        { startLine: 40, endLine: 41 },
      ],
      3
    );
    const headers = patch.match(/^@@.*$/gm);
    expect(headers).toEqual([
      "@@ -2,6 +2,8 @@",
      // Old side above line 37: 36 tip lines minus the 2 added at 5-6.
      "@@ -35,6 +37,8 @@",
    ]);
  });

  it("returns empty for an empty file or no regions", () => {
    expect(synthesizePatch([], [{ startLine: 1, endLine: 1 }], 3)).toBe("");
    expect(synthesizePatch(numbered(1, 3), [], 3)).toBe("");
  });
});

describe("deriveSession", () => {
  const BLOCK = `export function one() {
  return 1;
}
export function two() {
  return 2;
}
`;

  it("synthesizes all-adds patches for never-signed files", async () => {
    const repo = await makeRepo();
    await write(repo, "src/base.ts", "const zero = 0;\n");
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(repo, "src/base.ts", `const zero = 0;\n${BLOCK}`);
    await commitAll(repo, "feat: functions (#1)");

    const session = await deriveSession(repo.git, { epoch });
    expect(session.sessions).toHaveLength(1);
    const file = session.sessions[0];
    expect(file.path).toBe("src/base.ts");
    expect(file.baseline).toBeNull();
    expect(file.regions).toEqual([{ startLine: 2, endLine: 7 }]);
    expect(file.patch.startsWith("@@")).toBe(true);
    expect(file.patch).toContain("+export function one() {");
    expect(file.patch).toContain(" const zero = 0;");
    expect(file.patch).not.toContain("diff --git");
  });

  it("shows the real net diff for a signed-then-edited file", async () => {
    const repo = await makeRepo();
    await write(repo, "src/base.ts", "const zero = 0;\n");
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(repo, "src/base.ts", `const zero = 0;\n${BLOCK}`);
    await commitAll(repo, "feat: functions (#1)");

    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[0], ACTOR, AT_TIME);
    await write(
      repo,
      "src/base.ts",
      `const zero = 0;\n${BLOCK.replace("return 2;", "return 2 + 2;")}`
    );
    await commitAll(repo, "fix: double it (#2)");

    const session = await deriveSession(repo.git, { epoch });
    const file = session.sessions[0];
    expect(file.baseline?.sha).toBe(before.tip);
    expect(file.patch.startsWith("@@")).toBe(true);
    expect(file.patch).toContain("-  return 2;");
    expect(file.patch).toContain("+  return 2 + 2;");
    expect(file.patch).not.toContain("+++");
  });

  it("follows a rename through the baseline's original path", async () => {
    const repo = await makeRepo();
    await write(repo, "src/old.ts", "const zero = 0;\n");
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(repo, "src/old.ts", `const zero = 0;\n${BLOCK}`);
    await commitAll(repo, "feat: functions (#1)");

    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[0], ACTOR, AT_TIME);
    await repo.git(["mv", "src/old.ts", "src/new.ts"]);
    await write(
      repo,
      "src/new.ts",
      `const zero = 0;\n${BLOCK.replace("return 2;", "return 2 + 2;")}`
    );
    await commitAll(repo, "refactor: rename (#2)");

    const session = await deriveSession(repo.git, { epoch });
    const file = session.sessions.find((s) => s.path === "src/new.ts");
    expect(file?.baseline?.refPath).toBe("src/old.ts");
    expect(file?.patch).toContain("+  return 2 + 2;");
    // The rename must not degrade to a whole-file delete + add.
    expect(file?.patch).not.toContain("-const zero = 0;");
  });

  it("synthesizes when a file mixes signed and never-signed runs", async () => {
    const repo = await makeRepo();
    // Pre-epoch filler keeps the two later runs from bridging into one.
    const filler = numbered(1, 12)
      .map((l) => `// ${l}`)
      .join("\n");
    await write(repo, "src/base.ts", `const zero = 0;\n${filler}\n`);
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(repo, "src/base.ts", `const zero = 0;\n${BLOCK}${filler}\n`);
    await commitAll(repo, "feat: functions (#1)");

    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[0], ACTOR, AT_TIME);

    // Edit inside the signed block AND append a brand-new far block.
    await write(
      repo,
      "src/base.ts",
      `const zero = 0;\n${BLOCK.replace("return 2;", "return 2 + 2;")}${filler}\nexport const three = 3;\n`
    );
    await commitAll(repo, "feat: three (#2)");

    const session = await deriveSession(repo.git, { epoch });
    const file = session.sessions.find((s) => s.path === "src/base.ts");
    expect(file?.regions.length).toBeGreaterThan(1);
    expect(file?.baseline).toBeNull();
    expect(file?.patch).toContain("+export const three = 3;");
  });

  it("filters files by target but keeps all runs of a matched file", async () => {
    const repo = await makeRepo();
    await write(repo, "src/base.ts", "const zero = 0;\n");
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(repo, "src/base.ts", `const zero = 0;\n${BLOCK}`);
    await write(repo, "src/util.ts", "export const u = 1;\n");
    await commitAll(repo, "feat: functions (#1)");

    const all = await deriveSession(repo.git, { epoch });
    expect(all.sessions.map((s) => s.path)).toEqual([
      "src/base.ts",
      "src/util.ts",
    ]);

    const one = await deriveSession(repo.git, {
      epoch,
      targets: ["src/base.ts:2-3"],
    });
    expect(one.sessions.map((s) => s.path)).toEqual(["src/base.ts"]);

    const none = await deriveSession(repo.git, {
      epoch,
      targets: ["src/base.ts:9999-9999"],
    });
    expect(none.sessions).toEqual([]);
  });
});
