import { describe, expect, it } from "vitest";
import type { ChangedFile } from "../types.ts";
import { buildCommentableRanges } from "./commentable-ranges.ts";

const PATCH = `@@ -1,4 +1,4 @@
 export function withRetry() {
-  const retryCount = 3;
+  const retryLimit = 3;
   let delay = 100;
 }
@@ -10,2 +10,3 @@
 function tail() {
+  return 1;
 }`;

const file = (over: Partial<ChangedFile>): ChangedFile => ({
  additions: 2,
  changes: 3,
  deletions: 1,
  filename: "src/retry.ts",
  patch: PATCH,
  sha: "abc123",
  status: "modified",
  ...over,
});

describe("buildCommentableRanges", () => {
  it("maps del rows LEFT, add and context rows RIGHT, merged per hunk", () => {
    const ranges = buildCommentableRanges([file({})]);
    expect(ranges).toEqual([
      { path: "src/retry.ts", ranges: [[2, 2]], side: "LEFT" },
      {
        path: "src/retry.ts",
        ranges: [
          [1, 4],
          [10, 12],
        ],
        side: "RIGHT",
      },
    ]);
  });

  it("skips sides with nothing to say and files without a patch", () => {
    const addOnly = `@@ -0,0 +1,2 @@
+alpha
+beta`;
    const ranges = buildCommentableRanges([
      file({ filename: "new.ts", patch: addOnly }),
      file({ filename: "binary.png", patch: null as unknown as string }),
    ]);
    expect(ranges).toEqual([
      { path: "new.ts", ranges: [[1, 2]], side: "RIGHT" },
    ]);
  });
});
