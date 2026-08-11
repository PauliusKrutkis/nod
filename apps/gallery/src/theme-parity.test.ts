// @vitest-environment node
/**
 * gallery.css mirrors the Quiet palette as .qg-stage-quiet so matrix columns
 * can re-assert quiet under a day-themed root — a deliberate duplicate, and
 * this test is what keeps it honest: every mirrored var must carry exactly
 * the hex @nod/tokens declares.
 */
import { readFileSync } from "node:fs";
import { palette } from "@nod/tokens";
import { describe, expect, it } from "vitest";

const varFor: Record<keyof typeof palette, string> = {
  accent: "--accent",
  accentInk: "--accent-ink",
  bg: "--bg",
  danger: "--del",
  elevated: "--surface-hi",
  faint: "--faint",
  fg: "--fg",
  line: "--line",
  lineStrong: "--line-2",
  muted: "--muted",
  success: "--add",
  surface: "--surface",
  surface2: "--surface-2",
  warning: "--warn",
};

describe(".qg-stage-quiet", () => {
  const css = readFileSync(new URL("./gallery.css", import.meta.url), "utf8");
  const start = css.indexOf(".qg-stage-quiet {");
  const block = css.slice(start, css.indexOf("}", start));

  it.each(Object.entries(varFor))(
    "mirrors @nod/tokens for %s",
    (paletteKey, varName) => {
      const value = palette[paletteKey as keyof typeof palette];
      expect(block).toContain(`${varName}: ${value};`);
    }
  );
});
