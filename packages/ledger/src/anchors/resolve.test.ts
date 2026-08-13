import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type GitRun, gitIn } from "../git/exec.ts";
import { readTreeLines, renameMap } from "../git/files.ts";
import { type Anchor, extractAnchors } from "./anchor.ts";
import type { Normalization } from "./normalize.ts";
import { buildTipIndex, type ResolveConfig, resolveAnchor } from "./resolve.ts";

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
  const dir = await mkdtemp(join(tmpdir(), "ledger-anchor-test-"));
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

const BASE_FILE = `export const alphabetSoup = "quiet";

export function unrelatedHelper(): string {
  return alphabetSoup.toUpperCase();
}
`;

const BLOCK = `export function computeReviewDebt(queue: QueueItem[]): number {
  const weights = queue.map((item) => item.churn * item.blastRadius);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Math.round(total / queue.length);
}
`;

const DEFAULT: ResolveConfig = { normalization: "ws", staleThreshold: 0.35 };

/** Base commit, then a commit adding BLOCK to alpha.ts; returns its anchor. */
const setupWithBlock = async (): Promise<{ repo: Repo; anchor: Anchor }> => {
  const repo = await makeRepo();
  await write(repo, "src/alpha.ts", BASE_FILE);
  await commitAll(repo, "base");
  await write(repo, "src/alpha.ts", `${BASE_FILE}\n${BLOCK}`);
  const sha = await commitAll(repo, "add review debt block");
  const anchors = await extractAnchors(repo.git, sha);
  if (anchors.length !== 1) {
    throw new Error(`expected exactly one anchor, got ${anchors.length}`);
  }
  return { repo, anchor: anchors[0] };
};

const resolveAtTip = async (
  repo: Repo,
  anchor: Anchor,
  config: ResolveConfig = DEFAULT,
  renamedTo?: string
) => {
  const raw = await readTreeLines(repo.git, "HEAD");
  const index = buildTipIndex(raw, config.normalization);
  return resolveAnchor(index, anchor, config, renamedTo);
};

describe("extractAnchors", () => {
  it("captures one anchor per added hunk with post-image positions", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "one\ntwo\nthree\nfour\n");
    await commitAll(repo, "base");
    await write(
      repo,
      "a.ts",
      "one\nINSERTED-A\ntwo\nthree\nfour\nINSERTED-B\n"
    );
    const sha = await commitAll(repo, "two hunks");

    const anchors = await extractAnchors(repo.git, sha);
    expect(
      anchors.map(({ path, startLine, lines }) => ({ path, startLine, lines }))
    ).toEqual([
      { path: "a.ts", startLine: 2, lines: ["INSERTED-A"] },
      { path: "a.ts", startLine: 6, lines: ["INSERTED-B"] },
    ]);
  });

  it("drops whitespace-only hunks and untrackable files", async () => {
    const repo = await makeRepo();
    await write(repo, "a.ts", "one\n");
    await commitAll(repo, "base");
    await write(repo, "a.ts", "one\n\n\n");
    await write(repo, "pnpm-lock.yaml", "lockfileVersion: 9\n");
    const sha = await commitAll(repo, "noise only");

    expect(await extractAnchors(repo.git, sha)).toEqual([]);
  });
});

describe("resolveAnchor", () => {
  it("finds an untouched anchor alive in place", async () => {
    const { repo, anchor } = await setupWithBlock();
    const resolution = await resolveAtTip(repo, anchor);
    expect(resolution).toEqual({
      status: "alive",
      path: "src/alpha.ts",
      line: anchor.startLine,
    });
  });

  it("survives a file rename", async () => {
    const { repo, anchor } = await setupWithBlock();
    await mkdir(join(repo.dir, "src/core"), { recursive: true });
    await repo.git(["mv", "src/alpha.ts", "src/core/beta.ts"]);
    await commitAll(repo, "rename");

    const renames = await renameMap(repo.git, anchor.atSha, "HEAD");
    expect(renames.get("src/alpha.ts")).toBe("src/core/beta.ts");

    const resolution = await resolveAtTip(
      repo,
      anchor,
      DEFAULT,
      renames.get(anchor.path)
    );
    expect(resolution).toMatchObject({
      status: "alive",
      path: "src/core/beta.ts",
    });
  });

  it("survives the block moving to another file", async () => {
    const { repo, anchor } = await setupWithBlock();
    await write(repo, "src/alpha.ts", BASE_FILE);
    await write(repo, "src/debt.ts", BLOCK);
    await commitAll(repo, "extract block to its own file");

    const resolution = await resolveAtTip(repo, anchor);
    expect(resolution).toMatchObject({ status: "alive", path: "src/debt.ts" });
  });

  it("reports an edited block stale with a survival ratio", async () => {
    const { repo, anchor } = await setupWithBlock();
    const edited = BLOCK.replace(
      "const total = weights.reduce((sum, weight) => sum + weight, 0);",
      "const total = sumOf(weights);"
    ).replace(
      "return Math.round(total / queue.length);",
      "return Math.ceil(total / Math.max(queue.length, 1));"
    );
    await write(repo, "src/alpha.ts", `${BASE_FILE}\n${edited}`);
    await commitAll(repo, "rework the math");

    const resolution = await resolveAtTip(repo, anchor);
    expect(resolution).toMatchObject({ status: "stale", path: "src/alpha.ts" });
    if (resolution.status === "stale") {
      expect(resolution.ratio).toBeGreaterThan(0.4);
      expect(resolution.ratio).toBeLessThan(0.9);
    }
  });

  it("reports a deleted block gone", async () => {
    const { repo, anchor } = await setupWithBlock();
    await write(repo, "src/alpha.ts", BASE_FILE);
    await commitAll(repo, "delete the block");

    expect(await resolveAtTip(repo, anchor)).toEqual({ status: "gone" });
  });

  it("draws the boundary per normalization on an indentation change", async () => {
    const { repo, anchor } = await setupWithBlock();
    const indented = BLOCK.split("\n")
      .map((line) => (line === "" ? line : `  ${line}`))
      .join("\n");
    await write(
      repo,
      "src/alpha.ts",
      `${BASE_FILE}\nexport namespace debt {\n${indented}}\n`
    );
    await commitAll(repo, "wrap in namespace");

    const statusUnder = async (normalization: Normalization) =>
      (await resolveAtTip(repo, anchor, { ...DEFAULT, normalization })).status;

    expect(await statusUnder("ws")).toBe("alive");
    expect(await statusUnder("rtrim")).toBe("gone");
    expect(await statusUnder("exact")).toBe("gone");
  });

  it("treats trailing-whitespace churn as alive under rtrim, stale under exact", async () => {
    const { repo, anchor } = await setupWithBlock();
    const noisy = BLOCK.split("\n")
      .map((line, i) => (i % 2 === 0 && line !== "" ? `${line}  ` : line))
      .join("\n");
    await write(repo, "src/alpha.ts", `${BASE_FILE}\n${noisy}`);
    await commitAll(repo, "editor added trailing spaces");

    expect(
      (await resolveAtTip(repo, anchor, { ...DEFAULT, normalization: "rtrim" }))
        .status
    ).toBe("alive");
    expect(
      (await resolveAtTip(repo, anchor, { ...DEFAULT, normalization: "exact" }))
        .status
    ).toBe("stale");
  });
});
