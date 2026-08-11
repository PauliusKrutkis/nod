/**
 * The pricing card must be honest about the current state of the world: the
 * price and its terms are always stated, but a buy button only exists when a
 * checkout URL was baked in at build time — the CI build has none, so the
 * card says purchasing isn't open yet and that the free evaluation is the
 * full app. A dead buy button on a live site would be worse than no button.
 * The evaluation pitch itself lives in the install band above, not in the
 * card — #265 moved it so the price stands alone.
 *
 * With no checkout it carries no purchase or download call to action at all:
 * the install band immediately above is the free path, and repeating it here
 * would put two identical asks back to back. The team contact link is not one
 * of those asks — it routes a different kind of buyer and stays in both
 * states, so the absence check names the CTAs rather than counting anchors.
 */
import { expect, test } from "@playwright/test";

const PURCHASE_CTA_PATTERN = /Buy Nod|Download|Evaluate/;

const TEAM_CONTACT_HREF = "mailto:hello@nodreview.com";

test("pricing states the price and its terms", async ({ page }) => {
  await page.goto("/");

  const pricing = page.locator("#pricing");
  await expect(pricing).toBeVisible();
  await expect(pricing).toContainText("$59");
  await expect(pricing).toContainText("one-time");
  await expect(pricing).toContainText("a year of updates");
});

test("the evaluation pitch lives in the install band", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".install")).toContainText(
    "Free to evaluate, no time limit"
  );
});

test("without a checkout the card states the terms and carries no call to action", async ({
  page,
}) => {
  await page.goto("/");

  const pricing = page.locator("#pricing");
  await expect(
    pricing.getByRole("link", { name: PURCHASE_CTA_PATTERN })
  ).toHaveCount(0);
  await expect(pricing).toContainText("Purchasing opens soon");
  await expect(pricing).toContainText("free evaluation is the full app");
});

test("the team route is offered whether or not checkout is open", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.locator("#pricing").getByRole("link", { name: "Email me" })
  ).toHaveAttribute("href", TEAM_CONTACT_HREF);
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
