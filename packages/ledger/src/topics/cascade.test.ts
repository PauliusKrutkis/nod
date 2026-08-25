import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deriveStatus } from "../derive/status.ts";
import type { Fact } from "../facts/schema.ts";
import { appendFacts } from "../facts/store.ts";
import { type GitRun, gitIn } from "../git/exec.ts";

/**
 * The classification cascade end to end (docs/LEDGER.md §3): corrected >
 * assigned > conventional scope > provenance bucket, with `unassigned`
 * reporting exactly the bucket dwellers — the LLM stage's work list.
 */

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
  const dir = await mkdtemp(join(tmpdir(), "ledger-cascade-test-"));
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

const assignment = (
  verdict: "assigned" | "corrected",
  sha: string,
  topic: string,
  atTime: string
): Fact => ({
  actor:
    verdict === "assigned"
      ? { id: "agent:test", kind: "agent" }
      : { id: "tester", kind: "human" },
  atSha: sha,
  atTime,
  body: topic,
  subject: { id: sha, kind: "sha" },
  v: 1,
  verdict,
});

/** Epoch commit, one scoped commit, one scopeless commit. */
const seeded = async (): Promise<{
  repo: Repo;
  epoch: string;
  scopeless: string;
}> => {
  const repo = await makeRepo();
  await write(repo, "src/base.ts", "const base = 1;\n");
  const epoch = await commitAll(repo, "chore(seed): baseline");
  await write(repo, "src/scoped.ts", "export const scoped = 1;\n");
  await commitAll(repo, "feat(payments): scoped work");
  await write(repo, "src/mystery.ts", "export const mystery = 1;\n");
  const scopeless = await commitAll(repo, "tweak things");
  return { epoch, repo, scopeless };
};

describe("classification cascade", () => {
  it("reports scopeless commits as unassigned, in their sha bucket", async () => {
    const { repo, epoch, scopeless } = await seeded();
    const status = await deriveStatus(repo.git, { epoch });

    expect(status.unassigned).toHaveLength(1);
    const entry = status.unassigned[0];
    expect(entry?.sha).toBe(scopeless);
    expect(entry?.subject).toBe("tweak things");
    expect(entry?.topic).toBe(scopeless.slice(0, 7));
    expect(entry?.files).toEqual(["src/mystery.ts"]);
    expect(entry?.lines).toBe(1);

    const item = status.queue.find((i) => i.path === "src/mystery.ts");
    expect(item?.topic).toBe(scopeless.slice(0, 7));
  });

  it("an assigned fact renames the bucket and clears the work list", async () => {
    const { repo, epoch, scopeless } = await seeded();
    await appendFacts(repo.git, [
      assignment("assigned", scopeless, "onboarding", "2026-08-25T10:00:00Z"),
    ]);
    const status = await deriveStatus(repo.git, { epoch });

    expect(status.unassigned).toHaveLength(0);
    const item = status.queue.find((i) => i.path === "src/mystery.ts");
    expect(item?.topic).toBe("onboarding");
    expect(status.topics.some((t) => t.id === "onboarding")).toBe(true);
  });

  it("a correction beats a newer agent proposal", async () => {
    const { repo, epoch, scopeless } = await seeded();
    await appendFacts(repo.git, [
      assignment("corrected", scopeless, "billing", "2026-08-25T10:00:00Z"),
      assignment("assigned", scopeless, "onboarding", "2026-08-25T11:00:00Z"),
    ]);
    const status = await deriveStatus(repo.git, { epoch });

    const item = status.queue.find((i) => i.path === "src/mystery.ts");
    expect(item?.topic).toBe("billing");
  });

  it("scoped commits never reach the work list", async () => {
    const { repo, epoch } = await seeded();
    const status = await deriveStatus(repo.git, { epoch });
    const item = status.queue.find((i) => i.path === "src/scoped.ts");
    expect(item?.topic).toBe("payments");
    expect(status.unassigned.some((u) => u.topic === "payments")).toBe(false);
  });
});
