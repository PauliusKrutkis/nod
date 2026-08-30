import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./cli-args.ts";

describe("parseCliArgs", () => {
  it("extracts value flags from any position", () => {
    const args = parseCliArgs([
      "status",
      "--repo",
      "/tmp/store.git",
      "--tip",
      "refs/remotes/origin/main",
      "--actor",
      "paulius",
    ]);
    expect(args.repo).toBe("/tmp/store.git");
    expect(args.tip).toBe("refs/remotes/origin/main");
    expect(args.actor).toBe("paulius");
    expect(args.positional).toEqual(["status"]);
  });

  it("extracts boolean flags and keeps unknown tokens positional", () => {
    const args = parseCliArgs(["queue", "--json", "--force", "--reply", "id"]);
    expect(args.json).toBe(true);
    expect(args.force).toBe(true);
    expect(args.positional).toEqual(["queue", "--reply", "id"]);
  });

  it("captures --out as the JSON payload destination", () => {
    const args = parseCliArgs(["status", "--json", "--out", "/tmp/out.json"]);
    expect(args.out).toBe("/tmp/out.json");
    expect(args.positional).toEqual(["status"]);
    const literal = parseCliArgs(["comment", "--", "--out"]);
    expect(literal.out).toBeUndefined();
    expect(literal.positional).toEqual(["comment", "--out"]);
  });

  it("stops flag parsing at --", () => {
    const args = parseCliArgs([
      "comment",
      "src/a.ts:3",
      "--",
      "--json is a flag, this body is not",
    ]);
    expect(args.json).toBe(false);
    expect(args.positional).toEqual([
      "comment",
      "src/a.ts:3",
      "--json is a flag, this body is not",
    ]);
  });

  it("rejects a value flag with nothing after it", () => {
    expect(() => parseCliArgs(["status", "--tip"])).toThrow("needs a value");
  });
});
