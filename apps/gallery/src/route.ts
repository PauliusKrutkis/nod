/**
 * Pure state for the gallery route: every view is addressable as
 * #/gallery/<component>/<fixture>/<theme>/<width>/<mode>, so a URL names one
 * capture cell and the screenshot suite can enumerate the catalog by
 * formatting hashes instead of clicking through chrome. captureName() is the
 * exact snapshot filename for a cell — the gallery prints it under each
 * frame so what you see is what the harness diffs.
 *
 * Unknown segments fall back field-by-field rather than resetting the whole
 * route: a stale link to a renamed fixture should still land on its
 * component.
 */
export const GALLERY_THEMES = ["quiet", "day"] as const;
export const GALLERY_WIDTHS = [280, 420, 720, 0] as const;
export const GALLERY_MODES = ["specimen", "matrix"] as const;

type GalleryTheme = (typeof GALLERY_THEMES)[number];
type GalleryWidth = (typeof GALLERY_WIDTHS)[number];
type GalleryMode = (typeof GALLERY_MODES)[number];

export interface GalleryRoute {
  component: string;
  fixture: string;
  theme: GalleryTheme;
  width: GalleryWidth;
  mode: GalleryMode;
}

const GALLERY_HASH_PREFIX = "#/gallery";

export function cycle<T>(list: readonly T[], current: T, step: 1 | -1): T {
  const at = list.indexOf(current);
  return list[(at + step + list.length) % list.length];
}

export function formatGalleryHash(route: GalleryRoute): string {
  const width = route.width === 0 ? "fluid" : String(route.width);
  return `${GALLERY_HASH_PREFIX}/${route.component}/${route.fixture}/${route.theme}/${width}/${route.mode}`;
}

export function captureName(route: GalleryRoute): string {
  const width = route.width === 0 ? "fluid" : `w${route.width}`;
  return `${route.component}--${route.fixture}--${route.theme}--${width}.png`;
}

export function parseGalleryHash(
  hash: string,
  components: readonly string[],
  fixturesOf: (component: string) => readonly string[]
): GalleryRoute {
  const fallbackComponent = components[0] ?? "";
  const parts = hash.replace(`${GALLERY_HASH_PREFIX}/`, "").split("/");
  const component = components.includes(parts[0] ?? "")
    ? (parts[0] as string)
    : fallbackComponent;
  const fixtures = fixturesOf(component);
  const fixture = fixtures.includes(parts[1] ?? "")
    ? (parts[1] as string)
    : (fixtures[0] ?? "");
  const theme = GALLERY_THEMES.includes(parts[2] as GalleryTheme)
    ? (parts[2] as GalleryTheme)
    : "quiet";
  const mode = GALLERY_MODES.includes(parts[4] as GalleryMode)
    ? (parts[4] as GalleryMode)
    : "specimen";
  return { component, fixture, mode, theme, width: parseWidth(parts[3]) };
}

function parseWidth(segment: string | undefined): GalleryWidth {
  if (segment === "fluid") {
    return 0;
  }
  const width = Number(segment) as GalleryWidth;
  return GALLERY_WIDTHS.includes(width) ? width : 420;
}
