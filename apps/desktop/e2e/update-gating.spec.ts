/**
 * The update card must respect the license window: an eligible release keeps
 * the one-click install, an ineligible one swaps it for the purchase flow —
 * same card, honest copy, app untouched behind it. The gate itself lives in
 * Rust (update.rs re-checks on install); these specs pin the card's two
 * faces and that the license CTA drives the activation command.
 */
import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const LICENSE_CTA = /Get a license/;

const UPDATE = {
  currentVersion: "1.0.0",
  notes: null,
  version: "2.0.0",
};

const updateCard = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Update available" });

test("an eligible update offers the one-click install", async ({ page }) => {
  await setupApp(page, { update: { ...UPDATE, eligible: true } });

  await expect(updateCard(page)).toBeVisible();
  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toBeVisible();
  await expect(updateCard(page)).not.toContainText("update window");
});

test("an ineligible update offers a license instead of an install", async ({
  page,
}) => {
  await setupApp(page, { update: { ...UPDATE, eligible: false } });

  await expect(updateCard(page)).toContainText(
    "2.0.0 is outside your update window"
  );
  await expect(
    updateCard(page).getByRole("button", { name: LICENSE_CTA })
  ).toBeVisible();
  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toHaveCount(0);
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("the license CTA drives the activation command", async ({ page }) => {
  await setupApp(page, { update: { ...UPDATE, eligible: false } });

  await updateCard(page).getByRole("button", { name: LICENSE_CTA }).click();

  const calls = await page.evaluate(
    () =>
      (window as unknown as { __calls: Record<string, number> }).__calls
        .activate_license
  );
  expect(calls).toBe(1);
});
