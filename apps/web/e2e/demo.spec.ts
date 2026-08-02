/**
 * /demo/ is the real desktop frontend built against the mocked bridge (see
 * apps/desktop/demo/) and shipped as a static bundle by the site build.
 * These tests prove the bundle actually boots and answers the keyboard from
 * the built site — not just that the files were copied: the inbox renders
 * the staged queue and j moves the selection.
 */

import { expect, test } from "@playwright/test";

test("boots the real app from the static bundle", async ({ page }) => {
  await page.goto("/demo/");

  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(
    page.getByRole("listbox").getByText("Add fuzzy matching to search")
  ).toBeVisible();
});

test("answers the keyboard", async ({ page }) => {
  await page.goto("/demo/");
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();

  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("j");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("k");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
});
