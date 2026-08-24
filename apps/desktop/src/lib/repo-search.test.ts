import { describe, expect, it } from "vitest";
import {
  blobLines,
  buildRepoState,
  repoSearchPhase,
  sliceContext,
  tagRepoHits,
} from "./repo-search.ts";

const FILES = [
  {
    filename: "src/a.ts",
    hunks: [
      [
        { anchor: "RIGHT:10", num: 10, text: "const a = 1;" },
        { anchor: "LEFT:11", num: 11, text: "const gone = 2;" },
        { anchor: "RIGHT:12", num: 12, text: "const b = 3;" },
      ],
    ],
  },
  { filename: "assets/logo.png" },
];

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let raw = "";
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw);
}

describe("tagRepoHits", () => {
  it("anchors a hit whose exact line is on the new side of the diff", () => {
    const [hit] = tagRepoHits(
      [{ line: 10, path: "src/a.ts", text: "const a = 1;" }],
      FILES
    );
    expect(hit.anchor).toBe("RIGHT:10");
    expect(hit.fileIndex).toBe(0);
  });

  it("does not anchor a deleted-side line or an untouched line", () => {
    const hits = tagRepoHits(
      [
        { line: 11, path: "src/a.ts", text: "const gone = 2;" },
        { line: 99, path: "src/a.ts", text: "const far = 4;" },
      ],
      FILES
    );
    expect(hits.map((h) => h.anchor)).toEqual([null, null]);
    expect(hits.map((h) => h.fileIndex)).toEqual([0, 0]);
  });

  it("marks a hit outside every changed file as repo-only", () => {
    const [hit] = tagRepoHits(
      [{ line: 1, path: "src/other.ts", text: "x" }],
      FILES
    );
    expect(hit.anchor).toBeNull();
    expect(hit.fileIndex).toBeNull();
  });

  it("does not treat a path that merely ends with a changed path as that file", () => {
    const [hit] = tagRepoHits(
      [{ line: 10, path: "vendor/src/a.ts", text: "const a = 1;" }],
      FILES
    );
    expect(hit.anchor).toBeNull();
    expect(hit.fileIndex).toBeNull();
  });

  it("locates a changed file that carries no hunks without anchoring it", () => {
    const [hit] = tagRepoHits(
      [{ line: 1, path: "assets/logo.png", text: "binary" }],
      FILES
    );
    expect(hit.fileIndex).toBe(1);
    expect(hit.anchor).toBeNull();
  });

  it("sorts anchored hits first, keeping each group's order", () => {
    const hits = tagRepoHits(
      [
        { line: 1, path: "src/z.ts", text: "z" },
        { line: 10, path: "src/a.ts", text: "const a = 1;" },
        { line: 2, path: "src/y.ts", text: "y" },
        { line: 12, path: "src/a.ts", text: "const b = 3;" },
      ],
      FILES
    );
    expect(hits.map((h) => `${h.path}:${h.line}`)).toEqual([
      "src/a.ts:10",
      "src/a.ts:12",
      "src/z.ts:1",
      "src/y.ts:2",
    ]);
  });
});

describe("blobLines", () => {
  it("decodes utf-8 beyond latin-1", () => {
    expect(blobLines(encode("const 名前 = 1;\nsecond"))).toEqual([
      "const 名前 = 1;",
      "second",
    ]);
  });

  it("splits crlf line endings", () => {
    expect(blobLines(encode("a\r\nb\r\nc"))).toEqual(["a", "b", "c"]);
  });
});

describe("sliceContext", () => {
  const lines = ["l1", "l2", "l3", "l4", "l5", "l6"];

  it("clamps at the top of the file", () => {
    const slice = sliceContext(lines, 1, 2);
    expect(slice.map((l) => l.num)).toEqual([1, 2, 3]);
    expect(slice[0].hit).toBe(true);
  });

  it("clamps at the bottom of the file", () => {
    const slice = sliceContext(lines, 6, 2);
    expect(slice.map((l) => l.num)).toEqual([4, 5, 6]);
    expect(slice.at(-1)?.hit).toBe(true);
  });

  it("marks only the hit line", () => {
    const slice = sliceContext(lines, 3, 1);
    expect(slice.map((l) => l.hit)).toEqual([false, true, false]);
    expect(slice.map((l) => l.text)).toEqual(["l2", "l3", "l4"]);
  });
});

describe("buildRepoState", () => {
  const ready = {
    files: FILES,
    grepError: null,
    grepFetching: false,
    peekRadius: 1,
    store: { detail: "", state: "ready" } as const,
    storeError: null,
    truncated: false,
  };

  it("attaches peek context to the peeked path only", () => {
    const state = buildRepoState({
      ...ready,
      hits: [
        { line: 2, path: "src/other.ts", text: "b" },
        { line: 2, path: "src/far.ts", text: "b" },
      ],
      peekLines: ["one", "two", "three"],
      peekPath: "src/other.ts",
    });
    expect(state.hits[0].context?.map((l) => l.text)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(state.hits[1].context).toBeUndefined();
  });

  it("leaves hits uncontexted until the blob arrives", () => {
    const state = buildRepoState({
      ...ready,
      hits: [{ line: 2, path: "src/other.ts", text: "b" }],
      peekLines: null,
      peekPath: "src/other.ts",
    });
    expect(state.hits[0].context).toBeUndefined();
  });

  it("carries the phase and the truncation flag onto the pane state", () => {
    const state = buildRepoState({
      ...ready,
      hits: [],
      peekLines: null,
      peekPath: null,
      store: { detail: "", state: "cloning" },
      truncated: true,
    });
    expect(state.status).toBe("preparing");
    expect(state.truncated).toBe(true);
    expect(state.hits).toEqual([]);
  });

  it("keeps the anchored-first order the pane renders", () => {
    const state = buildRepoState({
      ...ready,
      hits: [
        { line: 1, path: "src/z.ts", text: "z" },
        { line: 10, path: "src/a.ts", text: "const a = 1;" },
      ],
      peekLines: null,
      peekPath: null,
    });
    expect(state.hits.map((h) => h.path)).toEqual(["src/a.ts", "src/z.ts"]);
  });
});

describe("repoSearchPhase", () => {
  const idle = { grepError: null, grepFetching: false };

  it("prepares while the store is cloning, fetching or unknown", () => {
    expect(
      repoSearchPhase({
        ...idle,
        store: { detail: "", state: "cloning" },
        storeError: null,
      })
    ).toEqual({ status: "preparing" });
    expect(
      repoSearchPhase({
        ...idle,
        store: { detail: "", state: "fetching" },
        storeError: null,
      })
    ).toEqual({ status: "preparing" });
    expect(
      repoSearchPhase({ ...idle, store: undefined, storeError: null })
    ).toEqual({ status: "preparing" });
  });

  it("fails with the clone or fetch error's detail, or without one", () => {
    expect(
      repoSearchPhase({
        ...idle,
        store: {
          detail: "git clone failed: no route to host",
          state: "failed",
        },
        storeError: null,
      })
    ).toEqual({
      reason: "git clone failed: no route to host",
      status: "failed",
    });
    expect(
      repoSearchPhase({
        ...idle,
        store: { detail: "", state: "failed" },
        storeError: null,
      })
    ).toEqual({ reason: undefined, status: "failed" });
  });

  it("fails when the status invoke itself rejects", () => {
    expect(
      repoSearchPhase({
        ...idle,
        store: undefined,
        storeError: "no cache directory",
      })
    ).toEqual({ reason: "no cache directory", status: "failed" });
  });

  it("passes ready and loading through once the store is ready", () => {
    const ready = {
      store: { detail: "", state: "ready" } as const,
      storeError: null,
    };
    expect(repoSearchPhase({ ...idle, ...ready })).toEqual({
      status: "ready",
    });
    expect(
      repoSearchPhase({ ...ready, grepError: null, grepFetching: true })
    ).toEqual({ status: "loading" });
    expect(
      repoSearchPhase({
        ...ready,
        grepError: "search failed: boom",
        grepFetching: false,
      })
    ).toEqual({ reason: "search failed: boom", status: "failed" });
  });
});
