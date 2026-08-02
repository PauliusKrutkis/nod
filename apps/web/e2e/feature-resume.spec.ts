/**
 * The resume miniature's animation contract: under default motion the quit /
 * relaunch loop runs as pure CSS (the fr-* keyframes are attached to the
 * shade and the chip), and under reduced motion every animation is disabled
 * so the component freezes on the composed frame — content, cursor row, and
 * the "resumed" chip all visible, the shade fully transparent. Assertions
 * are structural, never sampled mid-animation: computed animation-name and
 * the static base styles hold for the whole loop.
 */

import { expect, type Page, test } from "@playwright/test";

const CHIP_TEXT = "resumed · review.ts:128";

const FR_KEYFRAME_PATTERN = /^fr-/;

function resumeRow(page: Page) {
  return page.locator(".feat", {
    has: page.getByRole("heading", { level: 2, name: "Resume instantly" }),
  });
}

function animationName(row: ReturnType<typeof resumeRow>, selector: string) {
  return row
    .locator(selector)
    .evaluate((el) => getComputedStyle(el).animationName);
}

test("runs the relaunch loop as pure CSS under default motion", async ({
  page,
}) => {
  await page.goto("/");

  const row = resumeRow(page);
  await expect(row).toHaveCount(1);

  expect(await animationName(row, ".file__shade")).toMatch(FR_KEYFRAME_PATTERN);
  expect(await animationName(row, ".file__chip")).toMatch(FR_KEYFRAME_PATTERN);
});

test("freezes on the composed frame under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const row = resumeRow(page);

  expect(await animationName(row, ".file__shade")).toBe("none");
  expect(await animationName(row, ".file__chip")).toBe("none");

  const shadeOpacity = await row
    .locator(".file__shade")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(shadeOpacity).toBe("0");

  await expect(row.locator(".file__chip")).toBeVisible();
  await expect(row.locator(".file__chip")).toHaveText(CHIP_TEXT);
  await expect(row.locator(".file__line--cursor")).toContainText("128");
  await expect(row.locator(".file__thumb")).toBeVisible();
});
