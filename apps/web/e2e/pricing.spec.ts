/**
 * The pricing card must be honest about the current state of the world: the
 * price and the intro terms are always stated, but a buy button only exists
 * when a checkout URL was baked in at build time — the CI build has none, so
 * the card says purchasing isn't open yet. A dead buy button on a live site
 * would be worse than no button.
 *
 * With no checkout it carries no button at all, not even a download one: the
 * install band immediately above is the free path, and repeating it here
 * would put two identical asks back to back.
 */
import { expect, test } from "@playwright/test";

test("pricing states the price and the evaluation terms", async ({ page }) => {
  await page.goto("/");

  const pricing = page.locator("#pricing");
  await expect(pricing).toBeVisible();
  await expect(pricing).toContainText("$39");
  await expect(pricing).toContainText("a year of updates");
  await expect(pricing).toContainText("free to evaluate");
});

test("without a checkout the card states the terms and carries no button", async ({
  page,
}) => {
  await page.goto("/");

  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("link")).toHaveCount(0);
  await expect(pricing).toContainText("Purchasing opens soon");
});

test("the free path sits in the install band above pricing", async ({
  page,
}) => {
  await page.goto("/");

  const download = page
    .locator(".install")
    .getByRole("link", { name: "Download Nod" });
  await expect(download).toHaveAttribute("href", "/downloads");

  const bandBottom = await page
    .locator(".install")
    .evaluate((band) => band.getBoundingClientRect().bottom);
  const pricingTop = await page
    .locator("#pricing")
    .evaluate((pricing) => pricing.getBoundingClientRect().top);
  expect(bandBottom).toBeLessThanOrEqual(pricingTop);
});
