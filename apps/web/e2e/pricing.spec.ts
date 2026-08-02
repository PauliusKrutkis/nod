/**
 * The pricing card must be honest about the current state of the world: the
 * price and the intro terms are always stated, but a buy button only exists
 * when a checkout URL was baked in at build time — the CI build has none, so
 * the card leads with the free intro and says purchasing isn't open yet. A
 * dead buy button on a live site would be worse than no button.
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

test("without a checkout the card leads with the free evaluation", async ({
  page,
}) => {
  await page.goto("/");

  const pricing = page.locator("#pricing");
  await expect(
    pricing.getByRole("link", { name: "Evaluate for free" })
  ).toHaveAttribute("href", "/downloads");
  await expect(pricing.getByRole("link", { name: "Buy Nod" })).toHaveCount(0);
  await expect(pricing).toContainText("Purchasing opens soon");
});
