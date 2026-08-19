import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "../facts/schema.ts";
import { type GitRun, gitIn } from "../git/exec.ts";
import { commentOnRegion, replyToComment, resolveComment } from "./comment.ts";
import { deriveSession } from "./session.ts";
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
  const dir = await mkdtemp(join(tmpdir(), "ledger-comment-test-"));
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
const REPLIER: Actor = { kind: "human", id: "colleague" };
const T0 = "2026-08-19T12:00:00.000Z";
const T1 = "2026-08-19T12:01:00.000Z";
const T2 = "2026-08-19T12:02:00.000Z";

const BLOCK = `export function computeReviewDebt(queue) {
  const weights = queue.map((item) => item.churn * item.blastRadius);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Math.round(total / queue.length);
}
`;

/** Epoch with a base file, then one post-epoch commit adding src/debt.ts. */
const setup = async (): Promise<{ repo: Repo; epoch: string; tip: string }> => {
  const repo = await makeRepo();
  await write(repo, "src/base.ts", "const one = 1;\n");
  const epoch = await commitAll(repo, "pre-ledger world");
  await write(repo, "src/debt.ts", BLOCK);
  const tip = await commitAll(repo, "feat: review debt (#1)");
  return { repo, epoch, tip };
};

describe("comment facts", () => {
  it("threads a root, a reply, and a resolution onto tip", async () => {
    const { repo, epoch, tip } = await setup();
    const root = await commentOnRegion(
      repo.git,
      tip,
      { path: "src/debt.ts", startLine: 2, endLine: 3 },
      ACTOR,
      T0,
      "churn times blast radius seems arbitrary"
    );
    expect(root).not.toBeNull();
    if (!root) {
      return;
    }
    const reply = await replyToComment(
      repo.git,
      tip,
      root,
      REPLIER,
      T1,
      "it matched the probe data"
    );
    expect(reply).not.toBeNull();

    let status = await deriveStatus(repo.git, { epoch });
    expect(status.comments).toHaveLength(2);
    const [first, second] = status.comments;
    expect(first).toMatchObject({
      id: root,
      parent: null,
      path: "src/debt.ts",
      startLine: 2,
      endLine: 3,
      anchorStatus: "alive",
      resolved: false,
      body: "churn times blast radius seems arbitrary",
    });
    expect(second).toMatchObject({
      id: reply,
      parent: root,
      startLine: 2,
      endLine: 3,
      actor: REPLIER,
    });

    await resolveComment(repo.git, tip, root, ACTOR, T2);
    status = await deriveStatus(repo.git, { epoch });
    expect(status.comments[0].resolved).toBe(true);
    // The resolution itself is not a comment row.
    expect(status.comments).toHaveLength(2);
  });

  it("travels with moved content and degrades when it is rewritten", async () => {
    const { repo, epoch, tip } = await setup();
    const moving = await commentOnRegion(
      repo.git,
      tip,
      { path: "src/debt.ts", startLine: 2, endLine: 3 },
      ACTOR,
      T0,
      "still fine after the move"
    );
    const doomed = await commentOnRegion(
      repo.git,
      tip,
      { path: "src/base.ts", startLine: 1, endLine: 1 },
      ACTOR,
      T1,
      "this constant will not survive"
    );

    // Push the commented block down two lines, and rewrite base.ts wholesale.
    await write(repo, "src/debt.ts", `// leading\n// context\n${BLOCK}`);
    await write(repo, "src/base.ts", "export const totally = 'different';\n");
    await commitAll(repo, "feat: shuffle (#2)");

    const status = await deriveStatus(repo.git, { epoch });
    const movingNow = status.comments.find((c) => c.id === moving);
    expect(movingNow).toMatchObject({
      path: "src/debt.ts",
      startLine: 4,
      endLine: 5,
      anchorStatus: "alive",
    });
    const doomedNow = status.comments.find((c) => c.id === doomed);
    expect(doomedNow).toMatchObject({
      path: "src/base.ts",
      startLine: null,
      endLine: null,
      anchorStatus: "gone",
    });
  });

  it("hands the session only the threads in its files", async () => {
    const { repo, epoch, tip } = await setup();
    await commentOnRegion(
      repo.git,
      tip,
      { path: "src/debt.ts", startLine: 1, endLine: 1 },
      ACTOR,
      T0,
      "in the queued file"
    );
    await commentOnRegion(
      repo.git,
      tip,
      { path: "src/base.ts", startLine: 1, endLine: 1 },
      ACTOR,
      T1,
      "on grandfathered code"
    );

    const session = await deriveSession(repo.git, { epoch });
    expect(session.sessions.map((file) => file.path)).toEqual(["src/debt.ts"]);
    expect(session.comments).toHaveLength(1);
    expect(session.comments[0].body).toBe("in the queued file");
  });

  it("refuses replies to a fact that is not a comment root", async () => {
    const { repo, tip } = await setup();
    const missing = await replyToComment(
      repo.git,
      tip,
      "0".repeat(64),
      ACTOR,
      T0,
      "into the void"
    );
    expect(missing).toBeNull();
  });
});
