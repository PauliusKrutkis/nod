import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type GitRun, gitIn } from "../git/exec.ts";
import { type Fact, factId } from "./schema.ts";
import { appendFacts, readFacts, sync } from "./store.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const makeDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-test-"));
  dirs.push(dir);
  return dir;
};

const makeOrigin = async (): Promise<string> => {
  const dir = await makeDir();
  await gitIn(dir)(["init", "--bare", "--quiet"]);
  return dir;
};

const makeClone = async (origin: string): Promise<GitRun> => {
  const dir = await makeDir();
  const git = gitIn(dir);
  await git(["init", "--quiet"]);
  await git(["remote", "add", "origin", origin]);
  return git;
};

const fact = (overrides: Partial<Fact>): Fact => ({
  v: 1,
  actor: { kind: "human", id: "paulius" },
  subject: { kind: "anchor", id: "a1" },
  verdict: "reviewed",
  atSha: "0123456789012345678901234567890123456789",
  atTime: "2026-08-13T00:00:00Z",
  ...overrides,
});

const idsOf = (facts: readonly Fact[]): string[] =>
  facts.map(factId).sort((a, b) => (a < b ? -1 : 1));

describe("appendFacts / readFacts", () => {
  it("round-trips facts through refs/ledger", async () => {
    const git = await makeClone(await makeOrigin());
    const written = [
      fact({ subject: { kind: "anchor", id: "a1" } }),
      fact({ subject: { kind: "topic", id: "auth" }, verdict: "approved" }),
    ];
    await appendFacts(git, written);
    expect(idsOf(await readFacts(git))).toEqual(idsOf(written));
  });

  it("is idempotent for identical facts", async () => {
    const git = await makeClone(await makeOrigin());
    const one = fact({});
    await appendFacts(git, [one]);
    await appendFacts(git, [one]);
    expect(await readFacts(git)).toHaveLength(1);
  });

  it("survives concurrent local writers via the CAS retry", async () => {
    const git = await makeClone(await makeOrigin());
    const facts = Array.from({ length: 4 }, (_, i) =>
      fact({ subject: { kind: "anchor", id: `a${i}` } })
    );
    await Promise.all(facts.map((f) => appendFacts(git, [f])));
    expect(idsOf(await readFacts(git))).toEqual(idsOf(facts));
  });

  it("skips a fact whose verdict this build does not know", async () => {
    const git = await makeClone(await makeOrigin());
    const known = fact({});
    const future = {
      ...fact({ subject: { kind: "topic", id: "later" } }),
      verdict: "future-verdict",
    } as unknown as Fact;
    await appendFacts(git, [known, future]);
    expect(idsOf(await readFacts(git))).toEqual(idsOf([known]));
  });
});

describe("sync", () => {
  it("round-trips facts across two clones", async () => {
    const origin = await makeOrigin();
    const alice = await makeClone(origin);
    const bob = await makeClone(origin);

    const fromAlice = [
      fact({ subject: { kind: "anchor", id: "a1" } }),
      fact({ subject: { kind: "anchor", id: "a2" } }),
    ];
    await appendFacts(alice, fromAlice);
    await sync(alice);

    await sync(bob);
    expect(idsOf(await readFacts(bob))).toEqual(idsOf(fromAlice));

    const fromBob = fact({
      actor: { kind: "human", id: "colleague" },
      verdict: "flagged",
    });
    await appendFacts(bob, [fromBob]);
    await sync(bob);

    await sync(alice);
    expect(idsOf(await readFacts(alice))).toEqual(
      idsOf([...fromAlice, fromBob])
    );
  });

  it("converges divergent clones to the union", async () => {
    const origin = await makeOrigin();
    const alice = await makeClone(origin);
    const bob = await makeClone(origin);

    const fromAlice = fact({ subject: { kind: "anchor", id: "alice-hunk" } });
    const fromBob = fact({
      actor: { kind: "agent", id: "reviewer-bot" },
      subject: { kind: "anchor", id: "bob-hunk" },
    });
    await appendFacts(alice, [fromAlice]);
    await appendFacts(bob, [fromBob]);

    await sync(alice);
    await sync(bob);
    await sync(alice);

    const expected = idsOf([fromAlice, fromBob]);
    expect(idsOf(await readFacts(alice))).toEqual(expected);
    expect(idsOf(await readFacts(bob))).toEqual(expected);
  });

  it("converges any interleaving of appends and syncs", async () => {
    const origin = await makeOrigin();
    const clones = [await makeClone(origin), await makeClone(origin)];
    const all: Fact[] = [];

    for (let round = 0; round < 3; round++) {
      for (const [i, clone] of clones.entries()) {
        const f = fact({
          subject: { kind: "anchor", id: `r${round}-c${i}` },
          atTime: `2026-08-1${round}T0${i}:00:00Z`,
        });
        all.push(f);
        await appendFacts(clone, [f]);
      }
      await sync(clones[round % 2]);
    }
    await sync(clones[0]);
    await sync(clones[1]);
    await sync(clones[0]);

    for (const clone of clones) {
      expect(idsOf(await readFacts(clone))).toEqual(idsOf(all));
    }
  });

  it("is a no-op when nothing exists anywhere", async () => {
    const git = await makeClone(await makeOrigin());
    await sync(git);
    expect(await readFacts(git)).toEqual([]);
  });
});
