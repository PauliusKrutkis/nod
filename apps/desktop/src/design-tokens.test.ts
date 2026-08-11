// @vitest-environment node
/**
 * The @theme block cannot import @nod/tokens — Tailwind reads it statically
 * and needs literals — so this test is the link instead: every colour the
 * package declares must appear in @theme under its documented name, with the
 * exact same hex. @theme may hold MORE colours than the package (app-local
 * tokens are fine); it may never disagree on a shared one.
 */
import { readFileSync } from "node:fs";
import { palette, radii } from "@nod/tokens";
import { describe, expect, it } from "vitest";

const themeNameFor: Record<keyof typeof palette, string> = {
  accent: "--color-accent",
  accentInk: "--color-accent-fg",
  bg: "--color-bg",
  danger: "--color-danger",
  elevated: "--color-elevated",
  faint: "--color-faint",
  fg: "--color-fg",
  line: "--color-line",
  lineStrong: "--color-line-strong",
  muted: "--color-muted",
  success: "--color-success",
  surface: "--color-surface",
  surface2: "--color-surface-2",
  warning: "--color-warning",
};

describe("index.css @theme", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const start = css.indexOf("@theme {");
  const theme = css.slice(start, css.indexOf("}", start));

  it.each(Object.entries(themeNameFor))(
    "agrees with @nod/tokens on %s",
    (paletteKey, themeName) => {
      const value = palette[paletteKey as keyof typeof palette];
      expect(theme).toContain(`${themeName}: ${value};`);
    }
  );
});

describe("index.css radius scale", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

  it.each(Object.entries(radii))(
    "agrees with @nod/tokens on --r-%s",
    (step, value) => {
      expect(css).toContain(`--r-${step}: ${value};`);
    }
  );
});
