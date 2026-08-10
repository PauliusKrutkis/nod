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
 */

export const palette = {
  bg: "#0f0f17",
  surface: "#15151f",
  surface2: "#191924",
  elevated: "#1c1c2a",
  line: "#232334",
  lineStrong: "#2c2c40",
  fg: "#e8e8f3",
  muted: "#9a9ab2",
  faint: "#5f5f78",
  accent: "#8b80ff",
  accentInk: "#14111f",
  success: "#5fd08a",
  danger: "#ff7088",
  warning: "#e7c56a",
} as const;

export type Palette = typeof palette;

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
  ["--muted", palette.muted],
  ["--faint", palette.faint],
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
];

export const tokensCss = `:root {
${cssVars.map(([name, value]) => `  ${name}: ${value};`).join("\n")}
}
`;
