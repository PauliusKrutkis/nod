// @vitest-environment node

/**
 * quiet.css paints with tokens, never with hex. The palette lives once in
 * index.css's @theme block and reaches quiet.css through the short :root
 * aliases; a raw hex literal bypasses that chain, so when a theme swaps the
 * palette the literal keeps its old colour and nothing fails loudly — the
 * app just looks subtly wrong. This test is the loud failure: any hex
 * reintroduced into quiet.css (including the syntax palette, which is named
 * as --syn-* tokens) shows up here with its surrounding line.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;

describe("quiet.css tokens", () => {
  it("contains no raw hex colour literals", () => {
    const css = readFileSync(new URL("quiet.css", import.meta.url), "utf8");
    const offenders = css
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => HEX_LITERAL.test(line));
    expect(offenders).toEqual([]);
  });
});
