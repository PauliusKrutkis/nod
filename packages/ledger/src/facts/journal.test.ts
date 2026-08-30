import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type GitRun, gitIn } from "../git/exec.ts";
import { syncJournal } from "./journal.ts";
import type { Fact } from "./schema.ts";
import { appendFacts, LEDGER_REF, readFacts } from "./store.ts";

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
  const dir = await makeDir("ledger-journal-test-");
  const git = gitIn(dir);
  await git(["init", "--quiet"]);
  await git(["config", "user.name", "ledger-test"]);
  await git(["config", "user.email", "ledger-test@invalid"]);
  const target = join(dir, "src/base.ts");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, "const base = 1;\n");
  await git(["add", "-A"]);
  await git(["commit", "--quiet", "-m", "chore: seed"]);
  return { dir, git };
};

const tipOf = async (repo: Repo): Promise<string> =>
  (await repo.git(["rev-parse", "HEAD"])).trim();

const fact = (atSha: string, id: string): Fact => ({
  actor: { id: "tester", kind: "human" },
  atSha,
  atTime: "2026-08-25T12:00:00.000Z",
  subject: { id, kind: "topic" },
  v: 1,
  verdict: "approved",
});

describe("syncJournal", () => {
  it("mirrors appended facts into the journal", async () => {
    const repo = await makeRepo();
    const state = await makeDir("ledger-state-");
    await appendFacts(repo.git, [fact(await tipOf(repo), "core")]);
    await syncJournal(repo.git, state);
    expect(await readdir(join(state, "facts"))).toHaveLength(1);
  });

  it("restores facts into a wiped ref from the journal", async () => {
    const repo = await makeRepo();
    const state = await makeDir("ledger-state-");
    const tip = await tipOf(repo);
    await appendFacts(repo.git, [fact(tip, "core"), fact(tip, "ui")]);
    await syncJournal(repo.git, state);

    await repo.git(["update-ref", "-d", LEDGER_REF]);
    expect(await readFacts(repo.git)).toHaveLength(0);

    await syncJournal(repo.git, state);
    const restored = await readFacts(repo.git);
    expect(restored).toHaveLength(2);
    expect(restored.map((f) => f.subject.id).sort()).toEqual(["core", "ui"]);
  });

  it("carries facts into a fresh clone that never held them", async () => {
    const repo = await makeRepo();
    const state = await makeDir("ledger-state-");
    await appendFacts(repo.git, [fact(await tipOf(repo), "core")]);
    await syncJournal(repo.git, state);

    const parent = await makeDir("ledger-clone-");
    const dest = join(parent, "store.git");
    await gitIn(parent)(["clone", "--quiet", "--bare", repo.dir, dest]);
    const cloneGit = gitIn(dest);
    expect(await readFacts(cloneGit)).toHaveLength(0);

    await syncJournal(cloneGit, state);
    expect(await readFacts(cloneGit)).toHaveLength(1);
  });

  it("skips corrupt journal files without poisoning the ref", async () => {
    const repo = await makeRepo();
    const state = await makeDir("ledger-state-");
    await appendFacts(repo.git, [fact(await tipOf(repo), "core")]);
    await syncJournal(repo.git, state);
    await writeFile(join(state, "facts", "garbage.json"), "{not json");
    await writeFile(
      join(state, "facts", "wrong-shape.json"),
      `{"v":1,"hello":"world"}`
    );

    await repo.git(["update-ref", "-d", LEDGER_REF]);
    await syncJournal(repo.git, state);
    expect(await readFacts(repo.git)).toHaveLength(1);
  });

  it("re-addresses a renamed journal file to its computed id", async () => {
    const repo = await makeRepo();
    const state = await makeDir("ledger-state-");
    const one = fact(await tipOf(repo), "core");
    await appendFacts(repo.git, [one]);
    await syncJournal(repo.git, state);

    const names = await readdir(join(state, "facts"));
    expect(names).toHaveLength(1);
    const original = names[0] ?? "";
    await rm(join(state, "facts", original));
    const restoredName = original.replace(".json", "");
    await writeFile(join(state, "facts", "renamed.json"), JSON.stringify(one));

    await repo.git(["update-ref", "-d", LEDGER_REF]);
    await syncJournal(repo.git, state);
    const facts = await readFacts(repo.git);
    expect(facts).toHaveLength(1);
    // The journal gains the canonical name back on export.
    const after = await readdir(join(state, "facts"));
    expect(after).toContain(`${restoredName}.json`);
  });
});
