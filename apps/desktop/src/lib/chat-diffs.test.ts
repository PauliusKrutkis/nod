import { describe, expect, it } from "vitest";
import type { ChangedFile } from "../types.ts";
import { buildChatDiffs } from "./chat-diffs.ts";

const file = (over: Partial<ChangedFile>): ChangedFile => ({
  additions: 1,
  changes: 1,
  deletions: 0,
  filename: "src/a.ts",
  patch: "@@ -1 +1 @@\n+alpha",
  sha: "abc",
  status: "modified",
  ...over,
});

describe("buildChatDiffs", () => {
  it("carries patches, skips patchless files", () => {
    const diffs = buildChatDiffs([
      file({}),
      file({ filename: "img.png", patch: null as unknown as string }),
    ]);
    expect(diffs).toEqual([{ patch: "@@ -1 +1 @@\n+alpha", path: "src/a.ts" }]);
  });

  it("truncates a huge file and omits past the total budget", () => {
    const huge = "x".repeat(50_000);
    const diffs = buildChatDiffs([
      file({ filename: "big.ts", patch: huge }),
      ...Array.from({ length: 12 }, (_, i) =>
        file({ filename: `f${i}.ts`, patch: "y".repeat(40_000) })
      ),
    ]);
    expect(
      diffs[0].patch.endsWith("[truncated — the diff for this file continues]")
    ).toBe(true);
    const omitted = diffs.filter((d) => d.patch.startsWith("[omitted"));
    expect(omitted.length).toBeGreaterThan(0);
    expect(diffs).toHaveLength(13);
  });
});
