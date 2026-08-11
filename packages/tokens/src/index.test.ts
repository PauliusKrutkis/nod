/**
 * The whole value of this package is that its three shapes cannot drift:
 * tokens.css (imported by vite apps) must carry exactly what `tokensCss`
 * (inlined by the Worker pages) says, which is itself built from `palette`
 * and `syntax`.
 * The stylesheet is authored rather than generated, and this test is what
 * keeps "authored" honest — on failure, mirror src/index.ts into tokens.css.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avatarFg, cssVars, palette, syntax, tokensCss } from "./index.ts";

const SIX_DIGIT_LOWERCASE_HEX = /^#[0-9a-f]{6}$/;

describe("tokens.css", () => {
  it("byte-matches the tokensCss export after its header comment", () => {
    const file = readFileSync(
      new URL("../tokens.css", import.meta.url),
      "utf8"
    );
    expect(file.slice(file.indexOf(":root"))).toBe(tokensCss);
  });
});

describe.each([
  ["palette", palette],
  ["syntax", syntax],
  ["avatar ink", { avatarFg }],
])("%s", (_name, colours) => {
  it("holds normalized six-digit lowercase hexes", () => {
    for (const value of Object.values(colours)) {
      expect(value).toMatch(SIX_DIGIT_LOWERCASE_HEX);
    }
  });

  it("exposes every colour through at least one css var", () => {
    const emitted = cssVars.map(([, value]) => value).join(" ");
    for (const value of Object.values(colours)) {
      expect(emitted).toContain(value);
    }
  });
});
