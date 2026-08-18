import { describe, expect, it } from "vitest";
import { blobLines, sliceContext, tagRepoHits } from "./repo-search.ts";

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
