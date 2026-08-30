import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "../facts/schema.ts";
import { appendFacts } from "../facts/store.ts";
import { type GitRun, gitIn } from "../git/exec.ts";
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
  const dir = await mkdtemp(join(tmpdir(), "ledger-derive-test-"));
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

const BASE = `const one = 1;
const two = 2;
const three = 3;
`;

const BLOCK = `export function computeReviewDebt(queue) {
  const weights = queue.map((item) => item.churn * item.blastRadius);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Math.round(total / queue.length);
}
`;

const UTIL = `export const formatCoverage = (ratio) => {
  const percent = (ratio * 100).toFixed(1);
  return \`\${percent}% of post-epoch lines\`;
};
`;

/** Epoch commit with BASE, then #1 appends BLOCK, then #2 adds util.ts. */
const setup = async (): Promise<{ repo: Repo; epoch: string }> => {
  const repo = await makeRepo();
  await write(repo, "src/base.ts", BASE);
  const epoch = await commitAll(repo, "pre-ledger world");
  await write(repo, "src/base.ts", `${BASE}${BLOCK}`);
  await commitAll(repo, "feat: review debt (#1)");
  await write(repo, "src/util.ts", UTIL);
  await commitAll(repo, "feat: coverage formatting (#2)");
  return { repo, epoch };
};

describe("deriveStatus", () => {
  it("queues post-epoch regions with provenance; epoch code is invisible", async () => {
    const { repo, epoch } = await setup();
    const status = await deriveStatus(repo.git, { epoch });

    expect(status.totalLines).toBe(9);
    expect(status.reviewedLines).toBe(0);
    expect(status.coverage).toBe(0);
    expect(
      status.queue.map(({ path, startLine, endLine, newLines }) => ({
        path,
        startLine,
        endLine,
        newLines,
      }))
    ).toEqual([
      { path: "src/base.ts", startLine: 4, endLine: 8, newLines: 5 },
      { path: "src/util.ts", startLine: 1, endLine: 4, newLines: 4 },
    ]);
    expect(status.queue[0].provenance).toMatchObject([{ pr: 1 }]);
    expect(status.queue[1].provenance).toMatchObject([{ pr: 2 }]);
  });

  it("provenance carries the commit author, email and date", async () => {
    const { repo, epoch } = await setup();
    const status = await deriveStatus(repo.git, { epoch });
    expect(status.queue[0].provenance[0]).toMatchObject({
      author: "ledger-test",
      authorEmail: "ledger-test@invalid",
    });
    expect(Date.parse(status.queue[0].provenance[0].at)).not.toBeNaN();
  });

  it("numbered facts surface as topics[].number; unclaimed topics stay null", async () => {
    const repo = await makeRepo();
    await write(repo, "src/base.ts", BASE);
    const epoch = await commitAll(repo, "pre-ledger world");
    await write(repo, "src/base.ts", `${BASE}${BLOCK}`);
    await commitAll(repo, "feat(debt): review debt");
    await write(repo, "src/util.ts", UTIL);
    const tip = await commitAll(repo, "feat(coverage): formatting");
    await appendFacts(repo.git, [
      {
        actor: ACTOR,
        atSha: tip,
        atTime: AT_TIME,
        body: "1",
        subject: { id: "debt", kind: "topic" },
        v: 1,
        verdict: "numbered",
      },
    ]);

    const status = await deriveStatus(repo.git, { epoch });
    const numberOf = new Map(status.topics.map((t) => [t.id, t.number]));
    expect(numberOf.get("debt")).toBe(1);
    expect(numberOf.get("coverage")).toBeNull();
  });

  it("signing a region moves coverage and clears its queue item", async () => {
    const { repo, epoch } = await setup();
    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[0], ACTOR, AT_TIME);

    const after = await deriveStatus(repo.git, { epoch });
    expect(after.reviewedLines).toBe(5);
    expect(after.coverage).toBeCloseTo(5 / 9);
    expect(after.queue).toHaveLength(1);
    expect(after.queue[0].path).toBe("src/util.ts");
  });

  it("an edit inside a signed region re-queues only the changed lines", async () => {
    const { repo, epoch } = await setup();
    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[0], ACTOR, AT_TIME);

    const edited = BLOCK.replace(
      "return Math.round(total / queue.length);",
      "return Math.ceil(total / Math.max(queue.length, 1));"
    );
    await write(repo, "src/base.ts", `${BASE}${edited}`);
    await commitAll(repo, "fix: guard empty queues (#3)");

    const status = await deriveStatus(repo.git, { epoch });
    expect(status.totalLines).toBe(9);
    expect(status.reviewedLines).toBe(4);
    const requeued = status.queue.find((item) => item.path === "src/base.ts");
    expect(requeued).toMatchObject({ newLines: 1 });
    expect(requeued?.provenance).toMatchObject([{ pr: 3 }]);
  });

  it("a re-queued edit carries the signing fact as its baseline", async () => {
    const { repo, epoch } = await setup();
    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[0], ACTOR, AT_TIME);

    const edited = BLOCK.replace(
      "return Math.round(total / queue.length);",
      "return Math.ceil(total / Math.max(queue.length, 1));"
    );
    await write(repo, "src/base.ts", `${BASE}${edited}`);
    await commitAll(repo, "fix: guard empty queues (#3)");

    const status = await deriveStatus(repo.git, { epoch });
    const requeued = status.queue.find((item) => item.path === "src/base.ts");
    expect(requeued?.baseline).toEqual({
      sha: before.tip,
      atTime: AT_TIME,
      actor: ACTOR,
      refPath: "src/base.ts",
      source: "anchor",
    });
    const untouched = status.queue.find((item) => item.path === "src/util.ts");
    expect(untouched?.baseline).toBeNull();
  });

  it("the newest attestation wins as baseline", async () => {
    const { repo, epoch } = await setup();
    const first = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, first.tip, first.queue[0], ACTOR, AT_TIME);

    const edited = BLOCK.replace(
      "return Math.round(total / queue.length);",
      "return Math.ceil(total / Math.max(queue.length, 1));"
    );
    await write(repo, "src/base.ts", `${BASE}${edited}`);
    await commitAll(repo, "fix: guard empty queues (#3)");

    const second = await deriveStatus(repo.git, { epoch });
    const requeued = second.queue.find((item) => item.path === "src/base.ts");
    expect(requeued).toBeDefined();
    const laterTime = "2026-08-14T09:00:00.000Z";
    await signRegion(
      repo.git,
      second.tip,
      second.queue.find((item) => item.path === "src/base.ts") ??
        second.queue[0],
      ACTOR,
      laterTime
    );

    const twice = edited.replace(
      "return Math.ceil(total / Math.max(queue.length, 1));",
      "return Math.floor(total / Math.max(queue.length, 1));"
    );
    await write(repo, "src/base.ts", `${BASE}${twice}`);
    await commitAll(repo, "fix: floor not ceil (#5)");

    const status = await deriveStatus(repo.git, { epoch });
    const item = status.queue.find((i) => i.path === "src/base.ts");
    expect(item?.baseline).toMatchObject({
      sha: second.tip,
      atTime: laterTime,
    });
  });

  it("a rename keeps a signed region reviewed", async () => {
    const { repo, epoch } = await setup();
    const before = await deriveStatus(repo.git, { epoch });
    await signRegion(repo.git, before.tip, before.queue[1], ACTOR, AT_TIME);

    await repo.git(["mv", "src/util.ts", "src/format.ts"]);
    await commitAll(repo, "refactor: rename util (#4)");

    const status = await deriveStatus(repo.git, { epoch });
    expect(status.reviewedLines).toBe(4);
    expect(status.queue.every((item) => item.path !== "src/format.ts")).toBe(
      true
    );
  });
});
