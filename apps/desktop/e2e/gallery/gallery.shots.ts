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
 */
import { catalog } from "@nod/ui";
import { expect, test } from "@playwright/test";
import {
  captureName,
  formatGalleryHash,
  GALLERY_THEMES,
  type GalleryRoute,
} from "../../src/gallery/route.ts";

const NARROW_WORTHY = /overflow|crowd|chord/;

const cells: GalleryRoute[] = [];
for (const [component, entry] of Object.entries(catalog)) {
  for (const fixture of Object.keys(entry.fixtures)) {
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
    await page.goto(`/${formatGalleryHash(cell)}`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("[data-frame]")).toHaveScreenshot(
      captureName(cell),
      { animations: "disabled" }
    );
  });
}
