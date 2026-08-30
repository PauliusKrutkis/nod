import { describe, expect, it } from "vitest";
import type {
  LedgerComment,
  LedgerQueueItem,
  LedgerSessionFile,
  LedgerStatus,
} from "../types.ts";
import {
  actorAvatarUrl,
  forgeIdentity,
  groupQueueByProvenance,
  initialAnchorFor,
  ledgerCommentsToReview,
  newestProvenanceAt,
  regionAtCursor,
  sessionToChangedFiles,
  topicStory,
} from "./ledger-session.ts";
import { buildReviewItems } from "./review-items.ts";

const EMPTY = new Map();

const SYNTH: LedgerSessionFile = {
  baseline: null,
  patch: "@@ -1,2 +1,4 @@\n line1\n+line2\n+line3\n line4",
  path: "a.ts",
  regions: [{ endLine: 3, startLine: 2 }],
};

const REAL: LedgerSessionFile = {
  baseline: {
    actor: { id: "tester", kind: "human" },
    atTime: "2026-08-13T12:00:00.000Z",
    refPath: "b.ts",
    sha: "b".repeat(40),
    source: "anchor",
  },
  patch: "@@ -1,3 +1,3 @@\n ctx1\n-old\n+new\n ctx2",
  path: "b.ts",
  regions: [{ endLine: 2, startLine: 2 }],
};

const files = sessionToChangedFiles([SYNTH, REAL], "t".repeat(40));
const model = buildReviewItems({
  ask: null,
  collapsed: EMPTY,
  commentsByFile: EMPTY,
  expandedRows: EMPTY,
  files,
  isImage: () => false,
  openBoxes: EMPTY,
  pendingByFile: EMPTY,
});

describe("sessionToChangedFiles", () => {
  it("counts adds and dels from the patch", () => {
    expect(files[0]).toMatchObject({
      additions: 2,
      deletions: 0,
      filename: "a.ts",
      status: "modified",
    });
    expect(files[1]).toMatchObject({ additions: 1, deletions: 1 });
  });
});

describe("regionAtCursor", () => {
  it("signs the region containing the cursor's tip line", () => {
    const at = regionAtCursor(model, files, [SYNTH, REAL], {
      anchor: "RIGHT:2",
      fileIndex: 0,
      kind: "row",
    });
    expect(at?.target).toBe("a.ts:2-3");
  });

  it("falls back to the nearest region from a context row", () => {
    const at = regionAtCursor(model, files, [SYNTH, REAL], {
      anchor: "RIGHT:4",
      fileIndex: 0,
      kind: "row",
    });
    expect(at?.target).toBe("a.ts:2-3");
  });

  it("resolves a deleted row through its neighbours", () => {
    const at = regionAtCursor(model, files, [SYNTH, REAL], {
      anchor: "LEFT:2",
      fileIndex: 1,
      kind: "row",
    });
    expect(at?.target).toBe("b.ts:2-2");
  });

  it("returns null without a cursor or a session file", () => {
    expect(regionAtCursor(model, files, [SYNTH, REAL], null)).toBeNull();
    expect(
      regionAtCursor(model, files, [], {
        anchor: "RIGHT:2",
        fileIndex: 0,
        kind: "row",
      })
    ).toBeNull();
  });
});

describe("initialAnchorFor", () => {
  it("lands on the region's first line present in the patch", () => {
    expect(initialAnchorFor(files, model, "a.ts:2-3")).toEqual({
      anchor: "RIGHT:2",
      fileIndex: 0,
    });
  });

  it("falls back to the file's first nav row when the span is absent", () => {
    const at = initialAnchorFor(files, model, "a.ts:9-9");
    expect(at?.fileIndex).toBe(0);
    expect(at?.anchor).toBe("RIGHT:1");
  });

  it("returns null for an unknown file", () => {
    expect(initialAnchorFor(files, model, "nope.ts:1-2")).toBeNull();
  });
});

describe("groupQueueByProvenance", () => {
  const item = (
    path: string,
    topic: string,
    pr: number | null,
    sha: string,
    subject: string
  ): LedgerQueueItem => ({
    baseline: null,
    endLine: 6,
    newLines: 6,
    path,
    provenance: [
      {
        at: "2026-08-25T12:00:00Z",
        author: "paulius",
        authorEmail: "paulius@example.com",
        pr,
        sha,
        subject,
      },
    ],
    startLine: 1,
    topic,
  });

  it("groups by the engine topic, in first-appearance order", () => {
    const queue = [
      item("a.ts", "ledger", 321, "a".repeat(40), "feat(ledger): a (#321)"),
      item("b.ts", "d1eec70", null, "d1eec70aa".padEnd(40, "0"), "direct"),
      item("c.ts", "ledger", 322, "b".repeat(40), "docs(ledger): c (#322)"),
    ];
    const { flat, groups } = groupQueueByProvenance(queue);
    expect(groups.map((g) => g.label)).toEqual(["ledger", "d1eec70"]);
    expect(groups[0].items.map((i) => i.path)).toEqual(["a.ts", "c.ts"]);
    expect(flat.map((i) => i.path)).toEqual(["a.ts", "c.ts", "b.ts"]);
    expect(groups[0].subject).toBe("feat(ledger): a (#321)");
    expect(groups[0].chips).toEqual(["#321", "#322"]);
    expect(groups[0].fileCount).toBe(2);
    expect(groups[0].newLines).toBe(12);
  });
});

describe("forgeIdentity", () => {
  it("names the login from a numeric-prefix noreply email, with avatar", () => {
    expect(
      forgeIdentity("Amy Santiago", "1234+amy@users.noreply.github.com")
    ).toEqual({
      author: "amy",
      authorAvatarUrl: "https://avatars.githubusercontent.com/amy",
    });
  });

  it("keeps the git name for a plain email, no avatar", () => {
    expect(forgeIdentity("Rosa Diaz", "rosa@example.com")).toEqual({
      author: "Rosa Diaz",
    });
  });

  it("tolerates a missing email", () => {
    expect(forgeIdentity("Rosa Diaz", undefined)).toEqual({
      author: "Rosa Diaz",
    });
  });
});

describe("actorAvatarUrl", () => {
  it("derives the forge avatar for a human actor", () => {
    expect(actorAvatarUrl({ id: "amy", kind: "human" })).toBe(
      "https://avatars.githubusercontent.com/amy"
    );
  });

  it("leaves agent actors on the letter fallback", () => {
    expect(actorAvatarUrl({ id: "agent:claude", kind: "agent" })).toBe("");
  });
});

describe("ledgerCommentsToReview", () => {
  const comment = (
    over: Partial<LedgerComment> & { id: string }
  ): LedgerComment => ({
    actor: { id: "amy", kind: "human" },
    anchorStatus: "alive",
    atSha: "t1p".padEnd(40, "0"),
    atTime: "2026-08-25T12:00:00Z",
    body: "root",
    endLine: 4,
    parent: null,
    path: "a.ts",
    resolved: false,
    startLine: 4,
    ...over,
  });

  it("threads a reply to its parent's numeric id and fact id", () => {
    const root = comment({ id: "aaaa111100000000" });
    const child = comment({
      body: "reply",
      endLine: null,
      id: "bbbb222200000000",
      parent: "aaaa111100000000",
      startLine: null,
    });
    const { byFile, factIdOf } = ledgerCommentsToReview([root, child]);
    const [first, second] = byFile.get("a.ts") ?? [];
    expect(second.inReplyToId).toBe(first.id);
    expect(second.threadId).toBe("aaaa111100000000");
    expect(factIdOf.get(first.id)).toBe("aaaa111100000000");
  });

  it("appends the stale note and carries resolution and avatar", () => {
    const { byFile } = ledgerCommentsToReview([
      comment({
        anchorStatus: "stale",
        id: "cccc333300000000",
        resolved: true,
      }),
    ]);
    const [only] = byFile.get("a.ts") ?? [];
    expect(only.body).toContain("previous version");
    expect(only.resolved).toBe(true);
    expect(only.userAvatarUrl).toBe(
      "https://avatars.githubusercontent.com/amy"
    );
  });
});

describe("topicStory", () => {
  it("tells coverage, provenance, and files", () => {
    const queue: LedgerQueueItem[] = [
      {
        baseline: null,
        endLine: 6,
        newLines: 6,
        path: "a.ts",
        provenance: [
          {
            at: "2026-08-25T12:00:00Z",
            author: "amy",
            authorEmail: "amy@example.com",
            pr: 321,
            sha: "a".repeat(40),
            subject: "feat(ledger): a (#321)",
          },
        ],
        startLine: 1,
        topic: "ledger",
      },
    ];
    const status = {
      comments: [],
      coverage: 0.5,
      epoch: "e".repeat(40),
      queue,
      reviewedLines: 5,
      tip: "f".repeat(40),
      topics: [],
      totalLines: 10,
      unassigned: [],
    } as unknown as LedgerStatus;
    const [group] = groupQueueByProvenance(queue).groups;
    const story = topicStory(group, status);
    expect(story).toContain("Coverage 50.0%");
    expect(story).toContain("#321 feat(ledger): a (#321)");
    expect(story).toContain("a.ts (+6)");
  });
});

describe("newestProvenanceAt", () => {
  it("returns the newest commit time across the group", () => {
    const queue: LedgerQueueItem[] = [
      {
        baseline: null,
        endLine: 2,
        newLines: 2,
        path: "a.ts",
        provenance: [
          {
            at: "2026-08-20T12:00:00Z",
            author: "amy",
            authorEmail: "",
            pr: null,
            sha: "a".repeat(40),
            subject: "one",
          },
          {
            at: "2026-08-26T12:00:00Z",
            author: "amy",
            authorEmail: "",
            pr: null,
            sha: "b".repeat(40),
            subject: "two",
          },
        ],
        startLine: 1,
        topic: "t",
      },
    ];
    const [group] = groupQueueByProvenance(queue).groups;
    expect(newestProvenanceAt(group)).toBe("2026-08-26T12:00:00Z");
  });
});
