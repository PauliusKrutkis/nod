import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "../facts/schema.ts";
import { appendFacts } from "../facts/store.ts";
import { type GitRun, gitIn } from "../git/exec.ts";
import { approveTopic } from "./approve.ts";
import { deriveSession } from "./session.ts";
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
  const dir = await mkdtemp(join(tmpdir(), "ledger-approve-test-"));
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

const ALICE: Actor = { kind: "human", id: "alice" };
const BOB: Actor = { kind: "human", id: "bob" };
const AGENT: Actor = { kind: "agent", id: "bot" };
const T1 = "2026-08-14T10:00:00.000Z";
const T2 = "2026-08-14T11:00:00.000Z";
const T3 = "2026-08-14T12:00:00.000Z";

const ALPHA = `export function alphaOne() {
  return 1;
}
`;

const BETA = `export function betaOne() {
  return 10;
}
`;

/** Epoch, then a scoped alpha commit, a scoped beta commit, a direct push. */
const setup = async (): Promise<{ repo: Repo; epoch: string }> => {
  const repo = await makeRepo();
  await write(repo, "src/base.ts", "const zero = 0;\n");
  const epoch = await commitAll(repo, "pre-ledger world");
  await write(repo, "src/alpha.ts", ALPHA);
  await commitAll(repo, "feat(alpha): one (#1)");
  await write(repo, "src/beta.ts", BETA);
  await commitAll(repo, "feat(beta): one (#2)");
  await write(repo, "src/loose.ts", "export const loose = true;\n");
  await commitAll(repo, "quick direct push");
  return { repo, epoch };
};

describe("topic classification", () => {
  it("labels queue items by scope, #pr, then short sha", async () => {
    const { repo, epoch } = await setup();
    const status = await deriveStatus(repo.git, { epoch });
    const byPath = new Map(status.queue.map((i) => [i.path, i]));
    expect(byPath.get("src/alpha.ts")?.topic).toBe("alpha");
    expect(byPath.get("src/beta.ts")?.topic).toBe("beta");
    const loose = byPath.get("src/loose.ts");
    expect(loose?.topic).toBe(loose?.provenance[0]?.sha.slice(0, 7));
    expect(status.topics.map((t) => t.id).sort()).toEqual(
      ["alpha", "beta", loose?.topic].sort()
    );
  });
});

describe("approval coverage", () => {
  it("approving a topic at tip clears its queue and counts its lines", async () => {
    const { repo, epoch } = await setup();
    const before = await deriveStatus(repo.git, { epoch });
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });

    const after = await deriveStatus(repo.git, { epoch });
    expect(after.queue.some((i) => i.path === "src/alpha.ts")).toBe(false);
    expect(after.queue.some((i) => i.path === "src/beta.ts")).toBe(true);
    expect(after.reviewedLines).toBe(before.reviewedLines + 3);
    const alpha = after.topics.find((t) => t.id === "alpha");
    expect(alpha).toMatchObject({
      approvals: 1,
      reviewedLines: 3,
      totalLines: 3,
    });
    expect(alpha?.approvedAt).toMatchObject({ sha: before.tip, actor: ALICE });
  });

  it("a commit after approval re-queues only new lines, baselined at the approval", async () => {
    const { repo, epoch } = await setup();
    const approvedAt = (await repo.git(["rev-parse", "HEAD"])).trim();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });

    await write(repo, "src/alpha.ts", `${ALPHA}export const alphaTwo = 2;\n`);
    await commitAll(repo, "feat(alpha): two (#4)");

    const status = await deriveStatus(repo.git, { epoch });
    const item = status.queue.find((i) => i.path === "src/alpha.ts");
    expect(item).toMatchObject({ newLines: 1, topic: "alpha" });
    expect(item?.baseline).toEqual({
      actor: ALICE,
      atTime: T1,
      refPath: "src/alpha.ts",
      sha: approvedAt,
      source: "approval",
    });
  });

  it("covers a renamed file's lines through blame", async () => {
    const { repo, epoch } = await setup();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });
    await repo.git(["mv", "src/alpha.ts", "src/renamed.ts"]);
    await commitAll(repo, "refactor(alpha): rename (#5)");

    const status = await deriveStatus(repo.git, { epoch });
    expect(status.queue.some((i) => i.path === "src/renamed.ts")).toBe(false);
    expect(status.topics.find((t) => t.id === "alpha")?.reviewedLines).toBe(3);
  });

  it("a mixed-topic run shrinks to the unapproved topic and relabels", async () => {
    const repo = await makeRepo();
    await write(repo, "src/mix.ts", "const zero = 0;\n");
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(
      repo,
      "src/mix.ts",
      "const zero = 0;\nconst a1 = 1;\nconst a2 = 2;\n"
    );
    await commitAll(repo, "feat(alpha): a (#1)");
    await write(
      repo,
      "src/mix.ts",
      "const zero = 0;\nconst a1 = 1;\nconst a2 = 2;\nconst b1 = 3;\nconst b2 = 4;\n"
    );
    await commitAll(repo, "feat(beta): b (#2)");

    const before = await deriveStatus(repo.git, { epoch });
    expect(before.queue).toHaveLength(1);
    expect(before.queue[0]).toMatchObject({
      endLine: 5,
      startLine: 2,
      topic: "alpha",
    });

    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });
    const after = await deriveStatus(repo.git, { epoch });
    expect(after.queue).toHaveLength(1);
    expect(after.queue[0]).toMatchObject({
      endLine: 5,
      startLine: 4,
      topic: "beta",
    });
  });

  it("an approval baseline loses to a newer anchor signing", async () => {
    const { repo, epoch } = await setup();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });
    await write(repo, "src/alpha.ts", `${ALPHA}export const alphaTwo = 2;\n`);
    await commitAll(repo, "feat(alpha): two (#4)");

    const mid = await deriveStatus(repo.git, { epoch });
    const requeued = mid.queue.find((i) => i.path === "src/alpha.ts");
    expect(requeued?.baseline?.source).toBe("approval");
    const signedTip = mid.tip;
    await signRegion(repo.git, mid.tip, requeued ?? mid.queue[0], ALICE, T2);

    await write(
      repo,
      "src/alpha.ts",
      `${ALPHA}export const alphaTwo = 2 + 2;\n`
    );
    await commitAll(repo, "fix(alpha): double (#6)");
    const status = await deriveStatus(repo.git, { epoch });
    const item = status.queue.find((i) => i.path === "src/alpha.ts");
    expect(item?.baseline).toMatchObject({
      atTime: T2,
      sha: signedTip,
      source: "anchor",
    });
  });

  it("renders the real net diff from the approval sha in a session", async () => {
    const { repo, epoch } = await setup();
    const approvedAt = (await repo.git(["rev-parse", "HEAD"])).trim();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });
    await write(repo, "src/alpha.ts", ALPHA.replace("return 1;", "return 2;"));
    await commitAll(repo, "fix(alpha): bump (#4)");

    const session = await deriveSession(repo.git, { epoch });
    const file = session.sessions.find((s) => s.path === "src/alpha.ts");
    expect(file?.baseline?.sha).toBe(approvedAt);
    expect(file?.patch).toContain("-  return 1;");
    expect(file?.patch).toContain("+  return 2;");
  });
});

describe("thresholds and inert approvals", () => {
  it("threshold 2: a lone approver covers nothing and is not a baseline", async () => {
    const { repo, epoch } = await setup();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });

    const status = await deriveStatus(repo.git, {
      approvalsRequired: 2,
      epoch,
    });
    expect(status.queue.some((i) => i.path === "src/alpha.ts")).toBe(true);
    const alpha = status.topics.find((t) => t.id === "alpha");
    expect(alpha).toMatchObject({
      approvals: 1,
      approvedAt: null,
      requiredApprovals: 2,
      reviewedLines: 0,
    });
    const item = status.queue.find((i) => i.path === "src/alpha.ts");
    expect(item?.baseline).toBeNull();
  });

  it("threshold 2: coverage reaches what both actors attested", async () => {
    const { repo, epoch } = await setup();
    const tip1 = (await repo.git(["rev-parse", "HEAD"])).trim();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });
    await write(repo, "src/alpha.ts", `${ALPHA}export const alphaTwo = 2;\n`);
    await commitAll(repo, "feat(alpha): two (#4)");
    await approveTopic(repo.git, { topic: "alpha", actor: BOB, atTime: T2 });

    const status = await deriveStatus(repo.git, {
      approvalsRequired: 2,
      epoch,
    });
    const alpha = status.topics.find((t) => t.id === "alpha");
    // Only the original block carries two attestations; the later line has
    // one. Effective record = the older of the two newest per-actor facts.
    expect(alpha).toMatchObject({
      approvals: 2,
      reviewedLines: 3,
      totalLines: 4,
    });
    expect(alpha?.approvedAt).toMatchObject({ actor: ALICE, sha: tip1 });
    const item = status.queue.find((i) => i.path === "src/alpha.ts");
    expect(item).toMatchObject({ newLines: 1 });
  });

  it("the same actor approving twice counts as one approver", async () => {
    const { repo, epoch } = await setup();
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T1 });
    await approveTopic(repo.git, { topic: "alpha", actor: ALICE, atTime: T3 });

    const status = await deriveStatus(repo.git, {
      approvalsRequired: 2,
      epoch,
    });
    expect(status.topics.find((t) => t.id === "alpha")).toMatchObject({
      approvals: 1,
      approvedAt: null,
      reviewedLines: 0,
    });
  });

  it("an agent approval affects nothing, and an agent anchor paints nothing", async () => {
    const { repo, epoch } = await setup();
    await approveTopic(repo.git, { topic: "alpha", actor: AGENT, atTime: T1 });
    const before = await deriveStatus(repo.git, { epoch });
    expect(before.topics.find((t) => t.id === "alpha")).toMatchObject({
      approvals: 0,
      approvedAt: null,
      reviewedLines: 0,
    });

    const item = before.queue.find((i) => i.path === "src/alpha.ts");
    await signRegion(repo.git, before.tip, item ?? before.queue[0], AGENT, T2);
    const after = await deriveStatus(repo.git, { epoch });
    expect(after.reviewedLines).toBe(0);
  });

  it("an approval at a pre-epoch sha covers nothing but counts as an approver", async () => {
    const { repo, epoch } = await setup();
    await approveTopic(repo.git, {
      actor: ALICE,
      atTime: T1,
      tip: epoch,
      topic: "alpha",
    });

    const status = await deriveStatus(repo.git, { epoch });
    expect(status.topics.find((t) => t.id === "alpha")).toMatchObject({
      approvals: 1,
      reviewedLines: 0,
    });
    expect(status.queue.some((i) => i.path === "src/alpha.ts")).toBe(true);
  });

  it("an approval whose sha is unknown to the repo is inert", async () => {
    const { repo, epoch } = await setup();
    await appendFacts(repo.git, [
      {
        v: 1,
        actor: ALICE,
        subject: { kind: "topic", id: "alpha" },
        verdict: "approved",
        atSha: "f".repeat(40),
        atTime: T1,
      },
    ]);

    const status = await deriveStatus(repo.git, { epoch });
    expect(status.topics.find((t) => t.id === "alpha")).toMatchObject({
      approvals: 0,
      approvedAt: null,
      reviewedLines: 0,
    });
  });
});
