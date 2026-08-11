/**
 * global.css used to retype the desktop palette, and nothing caught the two
 * copies drifting. The palette now arrives from @nod/tokens/tokens.css
 * (imported in Base.astro), so any Quiet colour reappearing here as a
 * literal is a regression to the copy — including the rgba() spellings the
 * old copy used for the accent washes.
 */
import { readFileSync } from "node:fs";
import { palette } from "@nod/tokens";
import { describe, expect, it } from "vitest";

const ACCENT_AS_RGBA = /rgba\(\s*139\s*,\s*128\s*,\s*255/;

describe("global.css", () => {
  const css = readFileSync(new URL("./global.css", import.meta.url), "utf8");

  it.each(Object.entries(palette))(
    "does not redeclare the %s token literally",
    (_name, hex) => {
      expect(css.toLowerCase()).not.toContain(hex);
    }
  );

  it("does not respell the accent as rgba", () => {
    expect(css).not.toMatch(ACCENT_AS_RGBA);
  });
});
