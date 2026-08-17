import { describe, expect, it } from "vitest";
import type { ChangedFile } from "../types.ts";
import { locatePastedCode } from "./locate-code.ts";

const PATCH = `@@ -1,4 +1,6 @@
 export function retry(times: number) {
-  let left = times;
+  let attempts = times;
+  const backoff = 200;
   while (left > 0) {
     left -= 1;
   }
 }`;

const FILES: ChangedFile[] = [
  {
    additions: 2,
    changes: 3,
    deletions: 1,
    filename: "src/lib/retry.ts",
    patch: PATCH,
    status: "modified",
  } as ChangedFile,
];

describe("locatePastedCode", () => {
  it("finds a single pasted line on the right", () => {
    expect(locatePastedCode(FILES, "  const backoff = 200;")).toEqual({
      filePath: "src/lib/retry.ts",
      lineRange: "3",
      side: "RIGHT",
    });
  });

  it("finds a run of lines and reports the span", () => {
    const found = locatePastedCode(
      FILES,
      "  let attempts = times;\n  const backoff = 200;"
    );
    expect(found).toEqual({
      filePath: "src/lib/retry.ts",
      lineRange: "2–3",
      side: "RIGHT",
    });
  });

  it("ignores the indentation a copy picked up on the way", () => {
    expect(
      locatePastedCode(FILES, "        const backoff = 200;   ")?.lineRange
    ).toBe("3");
  });

  it("matches a paste lifted out of a diff view, markers and all", () => {
    expect(locatePastedCode(FILES, "+  const backoff = 200;")?.lineRange).toBe(
      "3"
    );
  });

  it("finds deleted code on the left", () => {
    expect(locatePastedCode(FILES, "  let left = times;")).toEqual({
      filePath: "src/lib/retry.ts",
      lineRange: "2",
      side: "LEFT",
    });
  });

  it("returns null when the code is not in this pull request", () => {
    expect(locatePastedCode(FILES, "const nothing = true;")).toBeNull();
  });

  it("returns null for a paste with nothing to match on", () => {
    expect(locatePastedCode(FILES, "   \n\n  ")).toBeNull();
  });
});
