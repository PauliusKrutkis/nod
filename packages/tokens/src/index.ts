/**
 * The Quiet palette, declared once. Until this package existed the same
 * hexes lived in three places with nothing linking them — the desktop app's
 * @theme block, the site's global.css, and hexes inlined into the Worker's
 * purchase pages — and nothing would catch them drifting.
 *
 * Three consumers, three shapes, which is why this is a package and not a
 * stylesheet: vite apps import ./tokens.css like any file; the Worker-rendered
 * purchase pages cannot link a build-hashed stylesheet, so they interpolate
 * `palette` values (or `tokensCss`) straight into their HTML strings; and the
 * desktop app's @theme block must stay literal for Tailwind to read, so it is
 * held to this palette by a parity test instead of an import.
 *
 * tokens.css at the package root is authored, not generated — a build step
 * would make every consumer's dev server depend on it. The parity test in
 * index.test.ts fails the moment the file and `tokensCss` disagree, which
 * keeps "authored" honest. Fonts are deliberately absent: the site loads
 * variable fonts, the app static ones, so a shared font token would lie to
 * one of them.
 *
 * `cssVars` carries the short Quiet names the ported q-/qf- CSS consumes in
 * both apps. The translucent washes are derived with color-mix rather than
 * baked rgba so they follow a palette change — the same recipes as the
 * desktop :root block.
 *
 * `syntax` is a second palette, named by grammatical role rather than by
 * surface, because a theme picks its code colours independently of its
 * chrome. It lives here rather than in the desktop app because the code
 * surfaces in @nod/ui (the .hljs-* retheme in styles.css, and the markdown
 * bodies that follow it) have no other source for them. The comment slot is
 * deliberately the chrome's `faint` — a comment is furniture, not a token —
 * and `variable` happens to equal `fgBright` today without being tied to it:
 * one is the shade of an identifier, the other the shade of prose.
 *
 * `avatarFg` stands outside both because it does not vary with the theme:
 * initials sit on a disc coloured from the name, so their ink is white under
 * any palette. Keeping it out of `palette` keeps that promise honest — and
 * keeps the site's "never respell a Quiet colour" test from claiming plain
 * white as one.
 */

export const palette = {
  bg: "#0f0f17",
  surface: "#15151f",
  surface2: "#191924",
  elevated: "#1c1c2a",
  line: "#232334",
  lineStrong: "#2c2c40",
  fg: "#e8e8f3",
  fgBright: "#d6d6e6",
  muted: "#9a9ab2",
  faint: "#5f5f78",
  accent: "#8b80ff",
  accentInk: "#14111f",
  success: "#5fd08a",
  danger: "#ff7088",
  warning: "#e7c56a",
} as const;

export type Palette = typeof palette;

export const syntax = {
  keyword: "#c4b6ff",
  string: "#8fe3b0",
  number: "#ffc48a",
  func: "#7fc8ff",
  type: "#ffd9a0",
  variable: "#d6d6e6",
  punct: "#b6b6cf",
  comment: palette.faint,
} as const;

export type Syntax = typeof syntax;

export const avatarFg = "#ffffff";

export const radii = {
  xs: "2px",
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "10px",
  "2xl": "12px",
  pill: "999px",
} as const;

const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export const cssVars: ReadonlyArray<readonly [string, string]> = [
  ["--bg", palette.bg],
  ["--surface", palette.surface],
  ["--surface-2", palette.surface2],
  ["--surface-hi", palette.elevated],
  ["--line", palette.line],
  ["--line-2", palette.lineStrong],
  ["--fg", palette.fg],
  ["--fg-bright", palette.fgBright],
  ["--muted", palette.muted],
  ["--faint", palette.faint],
  ["--avatar-fg", avatarFg],
  ["--accent", palette.accent],
  ["--accent-ink", palette.accentInk],
  ["--accent-soft", mix(palette.accent, 16)],
  ["--accent-line", mix(palette.accent, 40)],
  ["--add", palette.success],
  ["--del", palette.danger],
  ["--warn", palette.warning],
  ["--add-bg", mix(palette.success, 10)],
  ["--del-bg", mix(palette.danger, 10)],
  ["--warn-bg", mix(palette.warning, 12)],
  ["--add-num", mix(palette.success, 55)],
  ["--del-num", mix(palette.danger, 55)],
  ...Object.entries(syntax).map(
    ([role, value]) => [`--syn-${role}`, value] as const
  ),
  ...Object.entries(radii).map(
    ([step, value]) => [`--r-${step}`, value] as const
  ),
];

export const tokensCss = `:root {
${cssVars.map(([name, value]) => `  ${name}: ${value};`).join("\n")}
}
`;
