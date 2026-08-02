/**
 * The inbox miniature animates as a pure-CSS loop: two `j` flashes step the
 * cursor down the queue and `o` pulses the open. Assertions here are
 * structural — the loop exists under default motion, and reduced motion
 * disables it and freezes on the composed frame — never timing-dependent,
 * because a mid-animation position is one the loop is only passing through.
 */

import { expect, test } from "@playwright/test";

const CURSOR_ANIMATION_PATTERN = /fk-cursor/;

const KEY_FLASH_PATTERN = /fk-key-/;

const COMPOSED_CURSOR_TRANSFORM = "matrix(1, 0, 0, 1, 0, 74)";

const COMPOSED_ACTIVE_TITLE = "Handle empty cache on open";

test("runs the inbox loop under default motion", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".inbox__cursor")).toHaveCSS(
    "animation-name",
    CURSOR_ANIMATION_PATTERN
  );
  for (const key of ["j", "o"]) {
    await expect(page.locator(`.mini__key[data-k="${key}"]`)).toHaveCSS(
      "animation-name",
      KEY_FLASH_PATTERN
    );
  }
});

test("freezes on the composed frame under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const cursor = page.locator(".inbox__cursor");
  await expect(cursor).toHaveCSS("animation-name", "none");
  await expect(cursor).toHaveCSS("transform", COMPOSED_CURSOR_TRANSFORM);

  const active = page.locator(".inbox__row--active");
  await expect(active).toContainText(COMPOSED_ACTIVE_TITLE);

  const activeColor = await active.evaluate(
    (row) => getComputedStyle(row).color
  );
  const restingColor = await page
    .locator(".inbox__row")
    .first()
    .evaluate((row) => getComputedStyle(row).color);
  expect(activeColor).not.toBe(restingColor);
});
