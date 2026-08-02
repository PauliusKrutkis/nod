/**
 * The update card must respect the license window: an eligible release keeps
 * the one-click install, an ineligible one swaps it for the purchase flow —
 * same card, honest copy, app untouched behind it. The gate itself lives in
 * Rust (update.rs re-checks on install); these specs pin the card's two
 * faces, that the license CTA drives the activation command and the card
 * flips to installable once the license covers the release, and that in
 * trialExpired the card yields to PurchasePrompt instead of double-selling.
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

const LAPSED_LICENSE = {
  status: "licensed",
  updatesUntil: "2020-01-01",
} as const;

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

test("a lapsed license gets the purchase face instead of an install", async ({
  page,
}) => {
  await setupApp(page, {
    licenseState: LAPSED_LICENSE,
    update: { ...UPDATE, eligible: false },
  });

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

test("a completed activation flips the card to installable", async ({
  page,
}) => {
  await setupApp(page, {
    licenseState: LAPSED_LICENSE,
    update: { ...UPDATE, eligible: false },
    updateAfterActivation: { ...UPDATE, eligible: true },
  });

  await updateCard(page).getByRole("button", { name: LICENSE_CTA }).click();

  const calls = await page.evaluate(
    () =>
      (window as unknown as { __calls: Record<string, number> }).__calls
        .activate_license
  );
  expect(calls).toBe(1);

  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toBeVisible();
});

test("in trialExpired the update card yields to the purchase card", async ({
  page,
}) => {
  await setupApp(page, {
    licenseState: { status: "trialExpired" },
    update: { ...UPDATE, eligible: false },
  });

  await expect(
    page.getByRole("status").filter({ hasText: "Enjoying Nod?" })
  ).toBeVisible();
  await expect(updateCard(page)).toHaveCount(0);
});
