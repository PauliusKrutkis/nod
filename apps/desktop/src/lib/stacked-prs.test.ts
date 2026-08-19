import { describe, expect, it } from "vitest";
import type { PullRequest } from "../types.ts";
import { detectStack } from "./stacked-prs.ts";

function pr(over: Partial<PullRequest> = {}): PullRequest {
  return {
    additions: 1,
    author: "alice",
    authorAvatarUrl: "av",
    baseRef: "main",
    baseSha: "",
    body: "",
    changedFiles: 1,
    commentsCount: 0,
    createdAt: "2026-07-01T00:00:00Z",
    deletions: 0,
    draft: false,
    headRef: "feat",
    headSha: "",
    id: 1,
    merged: false,
    name: "nod",
    number: 5,
    owner: "acme",
    repo: "acme/nod",
    state: "open",
    title: "Tighten the retry backoff",
    updatedAt: "2026-07-02T12:00:00Z",
    url: "https://github.com/acme/nod/pull/5",
    viewerDidAuthor: false,
    ...over,
  };
}

const bottom = pr({ baseRef: "main", headRef: "feat/a", number: 10 });
const middle = pr({ baseRef: "feat/a", headRef: "feat/b", number: 11 });
const top = pr({ baseRef: "feat/b", headRef: "feat/c", number: 12 });

describe("detectStack", () => {
  it("finds a two-PR chain and the position within it", () => {
    const info = detectStack(middle, [bottom]);
    expect(info?.entries.map((e) => e.number)).toEqual([10, 11]);
    expect(info?.position).toBe(2);
  });

  it("walks a three-PR chain in merge order from any member", () => {
    for (const [cur, position] of [
      [bottom, 1],
      [middle, 2],
      [top, 3],
    ] as const) {
      const info = detectStack(
        cur,
        [bottom, middle, top].filter((p) => p !== cur)
      );
      expect(info?.entries.map((e) => e.number)).toEqual([10, 11, 12]);
      expect(info?.position).toBe(position);
      expect(info?.entries[position - 1]?.current).toBe(true);
    }
  });

  it("returns null when nothing joins", () => {
    const lone = pr({ baseRef: "main", headRef: "feat/x", number: 40 });
    expect(detectStack(lone, [bottom, top])).toBeNull();
  });

  it("returns null when refs are missing", () => {
    expect(detectStack(pr({ baseRef: "", headRef: "" }), [bottom])).toBeNull();
  });

  it("ignores PRs from another repo even with matching refs", () => {
    const foreign = pr({ headRef: "feat/a", name: "other", number: 90 });
    const cur = pr({ baseRef: "feat/a", number: 91 });
    expect(detectStack(cur, [foreign])).toBeNull();
  });

  it("follows the lowest PR number at a branch point", () => {
    const childA = pr({ baseRef: "feat/a", headRef: "feat/b1", number: 21 });
    const childB = pr({ baseRef: "feat/a", headRef: "feat/b2", number: 22 });
    const info = detectStack(bottom, [childB, childA]);
    expect(info?.entries.map((e) => e.number)).toEqual([10, 21]);
  });

  it("survives a ref cycle without hanging", () => {
    const a = pr({ baseRef: "feat/b", headRef: "feat/a", number: 30 });
    const b = pr({ baseRef: "feat/a", headRef: "feat/b", number: 31 });
    const info = detectStack(a, [b]);
    expect(info?.entries).toHaveLength(2);
  });

  it("deduplicates a PR seen in several inbox buckets", () => {
    const info = detectStack(middle, [bottom, bottom, top, top]);
    expect(info?.entries.map((e) => e.number)).toEqual([10, 11, 12]);
  });

  it("does not invent a bottom when the base branch has no open PR", () => {
    const info = detectStack(bottom, [middle]);
    expect(info?.entries.map((e) => e.number)).toEqual([10, 11]);
    expect(info?.position).toBe(1);
  });

  it("walks a chain longer than three and counts every position", () => {
    const chain = [
      pr({ baseRef: "main", headRef: "feat/1", number: 51 }),
      pr({ baseRef: "feat/1", headRef: "feat/2", number: 52 }),
      pr({ baseRef: "feat/2", headRef: "feat/3", number: 53 }),
      pr({ baseRef: "feat/3", headRef: "feat/4", number: 54 }),
      pr({ baseRef: "feat/4", headRef: "feat/5", number: 55 }),
    ];
    const numbers = chain.map((p) => p.number);
    for (const [index, cur] of chain.entries()) {
      const info = detectStack(
        cur,
        chain.filter((p) => p !== cur)
      );
      expect(info?.entries.map((e) => e.number)).toEqual(numbers);
      expect(info?.position).toBe(index + 1);
      expect(info?.entries[index]?.current).toBe(true);
    }
  });

  it("keeps a foreign repo's identical branch names out of a real chain", () => {
    const sameNameOtherRepo = pr({
      baseRef: "feat/b",
      headRef: "feat/c",
      name: "other",
      number: 70,
    });
    const sameNameOtherOwner = pr({
      baseRef: "feat/b",
      headRef: "feat/c",
      number: 71,
      owner: "globex",
    });
    const info = detectStack(middle, [
      bottom,
      sameNameOtherRepo,
      sameNameOtherOwner,
    ]);
    expect(info?.entries.map((e) => e.number)).toEqual([10, 11]);
  });

  it("carries the fields navigation opens an entry with", () => {
    const info = detectStack(middle, [bottom]);
    expect(info?.entries[0]).toEqual({
      current: false,
      name: "nod",
      number: 10,
      owner: "acme",
      title: "Tighten the retry backoff",
    });
  });
});
