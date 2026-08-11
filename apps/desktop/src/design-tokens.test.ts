// @vitest-environment node
/**
 * The @theme block cannot import @nod/tokens — Tailwind reads it statically
 * and needs literals — so this test is the link instead: every colour the
 * package declares must appear in @theme under its documented name, with the
 * exact same hex. @theme may hold MORE colours than the package (app-local
 * tokens are fine — --color-accent-deep is one, used only by the gate
 * screen's logo); it may never disagree on a shared one.
 *
 * The syntax palette is checked the same way, with one asymmetry: its comment
 * slot has no @theme entry of its own, because a comment is deliberately the
 * chrome's --color-faint, which :root aliases as --syn-comment. Pointing the
 * map at --color-faint is what asserts that reuse rather than papering over
 * it — the day it becomes its own colour, this line is where it changes.
 */
import { readFileSync } from "node:fs";
import { avatarFg, palette, radii, syntax } from "@nod/tokens";
import { describe, expect, it } from "vitest";

const themeNameFor: Record<keyof typeof palette, string> = {
  accent: "--color-accent",
  accentInk: "--color-accent-fg",
  bg: "--color-bg",
  danger: "--color-danger",
  elevated: "--color-elevated",
  faint: "--color-faint",
  fg: "--color-fg",
  fgBright: "--color-fg-bright",
  line: "--color-line",
  lineStrong: "--color-line-strong",
  muted: "--color-muted",
  success: "--color-success",
  surface: "--color-surface",
  surface2: "--color-surface-2",
  warning: "--color-warning",
};

const themeNameForSyntax: Record<keyof typeof syntax, string> = {
  comment: "--color-faint",
  func: "--color-syn-func",
  keyword: "--color-syn-keyword",
  number: "--color-syn-number",
  punct: "--color-syn-punct",
  string: "--color-syn-string",
  type: "--color-syn-type",
  variable: "--color-syn-variable",
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

  it.each(Object.entries(themeNameForSyntax))(
    "agrees with @nod/tokens on syntax %s",
    (syntaxKey, themeName) => {
      const value = syntax[syntaxKey as keyof typeof syntax];
      expect(theme).toContain(`${themeName}: ${value};`);
    }
  );

  it("agrees with @nod/tokens on the avatar ink", () => {
    expect(theme).toContain(`--color-avatar-fg: ${avatarFg};`);
  });
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
