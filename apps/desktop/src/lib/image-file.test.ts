import { describe, expect, it } from "vitest";
import type { ChangedFile } from "../types.ts";
import { isImageFile } from "./image-file.ts";

const file = (filename: string, patch?: string): ChangedFile => ({
  additions: 1,
  changes: 1,
  deletions: 0,
  filename,
  patch: patch ?? null,
  sha: "s1",
  status: "modified",
});

describe("isImageFile", () => {
  it("previews bitmaps, which arrive without a patch", () => {
    expect(isImageFile(file("docs/shot.PNG"))).toBe(true);
    expect(isImageFile(file("icons/loop.gif"))).toBe(true);
  });

  it("previews an SVG even though it arrives with a patch", () => {
    expect(isImageFile(file("icons/logo.svg", "@@ -1 +1 @@\n-<svg/>"))).toBe(
      true
    );
  });

  it("leaves other text files to the diff", () => {
    expect(isImageFile(file("src/app.ts", "@@ -1 +1 @@\n-a"))).toBe(false);
    expect(isImageFile(file("src/svg.ts", "@@ -1 +1 @@\n-a"))).toBe(false);
    expect(isImageFile(file("clip.mov"))).toBe(false);
  });
});
