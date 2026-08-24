/**
 * One screenshot per catalog cell, enumerated from the same fixtures export
 * the gallery and the derived unit tests consume — adding a fixture adds a
 * screenshot with no new test code.
 *
 * Two tiers, because a part and a surface are true at different widths.
 * A part shoots at the 420px panel width in both themes, and fixtures whose
 * names promise layout stress (overflow, crowd, chord) also shoot at the
 * 280px sidebar width, because data bugs are usually data × width bugs. A
 * view — a whole screen or a dialog that owns the window — shoots at the
 * window's own widths instead: 1400 (the default in tauri.conf.json) and
 * 900 (its declared minimum), which is the only place cross-component
 * drift and responsive breakage are visible at all. Both widths for every
 * view fixture, since a surface that survives the default and folds at the
 * minimum is the exact bug this tier exists to catch.
 *
 * View cells carry their own viewport: the frame is laid out beside the
 * rail with 38px of well padding either side, so a 1400px frame does not
 * fit the 1280px viewport the part cells use. The wider viewport is scoped
 * to the view describe rather than raised globally — part frames are
 * width-fitted and would very likely render identically, but "very likely"
 * against 2700 committed baselines is not a bet worth taking for cells
 * that gain nothing from the room.
 *
 * The snapshot filename is captureName(route) — exactly the string the
 * gallery prints under the frame, so a red diff names the cell to open.
 *
 * Dialog entries render inline in the frame like everything else, so every
 * cell is a frame shot and the narrow rule applies uniformly; the modal
 * variant is a gallery interaction, not a capture target.
 *
 * Every goto carries the ?capture query flag (before the hash — the gallery
 * reads location.search, not the hash). At rest the gallery draws a faint
 * dot grid on the frame's ring around the specimen's solid mat, so a
 * specimen whose surface matches the frame still reads without the x-ray;
 * under the flag the grid is suppressed and the shot sees exactly the
 * pre-mat pixels. The mat itself stays in both modes — its background
 * matches the frame's, so it is invisible here, and its presence under the
 * flag is precisely what guarantees the mat cannot shift specimen layout:
 * these baselines would diff if it did.
 *
 * Waiting for the frame is the whole readiness contract: the app itself
 * mounts only once the webfonts have loaded (src/main.tsx), so a frame on
 * screen means the specimen already measured itself against final metrics.
 *
 * CAPTURE_INSTANT is the clock every capture runs against. Fixtures carry
 * fixed timestamps, but formatRelativeTime measures them against Date.now(),
 * so a cell reading "2y ago" silently becomes "3y ago" a few months later
 * and the baseline fails without a single line of code having changed. The
 * instant is arbitrary beyond two constraints: it sits after every past
 * fixture timestamp (the oldest is 2016) so those still read as elapsed
 * time, and well before the deliberately-future one (2099) that pins "just
 * now". It is installed before goto because the app mounts off
 * document.fonts.ready — by the time a frame exists, the fixtures have
 * already been formatted.
 */
import { catalogManifest, isView } from "@nod/ui/manifest";
import { expect, test } from "@playwright/test";
import {
  captureName,
  formatGalleryHash,
  GALLERY_THEMES,
  type GalleryRoute,
} from "../src/route.ts";

const NARROW_WORTHY = /overflow|crowd|chord/;
const CAPTURE_INSTANT = new Date("2026-01-01T00:00:00Z");

/** Room for a 1400px frame plus the rail and the well's padding. */
const VIEW_VIEWPORT = { height: 1000, width: 1800 };

const cells: GalleryRoute[] = [];
const viewCells: GalleryRoute[] = [];
for (const [component, entry] of Object.entries(catalogManifest)) {
  for (const fixture of entry.fixtures) {
    for (const theme of GALLERY_THEMES) {
      if (isView(entry)) {
        viewCells.push({
          component,
          fixture,
          mode: "specimen",
          theme,
          width: 1400,
        });
        if (NARROW_WORTHY.test(fixture)) {
          viewCells.push({
            component,
            fixture,
            mode: "specimen",
            theme,
            width: 900,
          });
        }
        continue;
      }
      cells.push({ component, fixture, mode: "specimen", theme, width: 420 });
      if (NARROW_WORTHY.test(fixture)) {
        cells.push({ component, fixture, mode: "specimen", theme, width: 280 });
      }
    }
  }
}

function shoot(cell: GalleryRoute) {
  test(captureName(cell), async ({ page }) => {
    await page.clock.setFixedTime(CAPTURE_INSTANT);
    await page.goto(`/?capture${formatGalleryHash(cell)}`);
    await page.locator("[data-frame]").first().waitFor();
    // The freeze must have taken or the capture lies: the linux bootstrap
    // wrote 45 baselines from pages where setFixedTime lost its race and
    // relative timestamps rendered off the real clock. A raced page gets
    // one salvage reload (the clock installer is already in place, so the
    // second load reliably wakes frozen); if even that misses, the
    // assertion fails the attempt rather than writing a polluted baseline.
    if ((await page.evaluate(() => Date.now())) !== CAPTURE_INSTANT.getTime()) {
      await page.reload();
      await page.locator("[data-frame]").first().waitFor();
    }
    expect(await page.evaluate(() => Date.now())).toBe(
      CAPTURE_INSTANT.getTime()
    );
    await expect(page.locator("[data-frame]")).toHaveScreenshot(
      captureName(cell),
      { animations: "disabled" }
    );
  });
}

for (const cell of cells) {
  shoot(cell);
}

test.describe("views", () => {
  test.use({ viewport: VIEW_VIEWPORT });
  for (const cell of viewCells) {
    shoot(cell);
  }
});
