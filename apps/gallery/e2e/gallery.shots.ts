/**
 * One screenshot per catalog cell, enumerated from the same fixtures export
 * the gallery and the derived unit tests consume — adding a fixture adds a
 * screenshot with no new test code. Every cell shoots at the 420px panel
 * width in both themes; fixtures whose names promise layout stress
 * (overflow, crowd, chord) also shoot at the 280px sidebar width, because
 * data bugs are usually data × width bugs.
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
import { catalogManifest } from "@nod/ui/manifest";
import { expect, test } from "@playwright/test";
import {
  captureName,
  formatGalleryHash,
  GALLERY_THEMES,
  type GalleryRoute,
} from "../src/route.ts";

const NARROW_WORTHY = /overflow|crowd|chord/;
const CAPTURE_INSTANT = new Date("2026-01-01T00:00:00Z");

const cells: GalleryRoute[] = [];
for (const [component, entry] of Object.entries(catalogManifest)) {
  for (const fixture of entry.fixtures) {
    for (const theme of GALLERY_THEMES) {
      cells.push({ component, fixture, mode: "specimen", theme, width: 420 });
      if (NARROW_WORTHY.test(fixture)) {
        cells.push({ component, fixture, mode: "specimen", theme, width: 280 });
      }
    }
  }
}

for (const cell of cells) {
  test(captureName(cell), async ({ page }) => {
    await page.clock.setFixedTime(CAPTURE_INSTANT);
    await page.goto(`/?capture${formatGalleryHash(cell)}`);
    await page.locator("[data-frame]").first().waitFor();
    await expect(page.locator("[data-frame]")).toHaveScreenshot(
      captureName(cell),
      { animations: "disabled" }
    );
  });
}
