/**
 * The purchase card is the trial's only call to action, and it must follow
 * the no-DRM contract: it appears solely in the trialExpired state, the app
 * stays fully usable behind it, Later dismisses it for the launch, and a
 * completed browser activation flips both the card and the trial badge
 * without a reload. A backend failure surfaces as copy inside the card, not
 * a broken boot.
 */
import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

const BUY_BUTTON = /Buy Nod/;

const card = (page: import("./types.ts").Page) =>
  page.getByRole("status").filter({ hasText: "Your trial has ended" });

test("an expired trial shows the purchase card over a working app", async ({
  page,
}) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText("Buy Nod — $29");
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("trial and licensed states show no purchase card", async ({ page }) => {
  await setupApp(page, { licenseState: { daysLeft: 3, status: "trial" } });
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("Later dismisses the card for the launch", async ({ page }) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await card(page).getByRole("button", { name: "Later" }).click();
  await expect(card(page)).toHaveCount(0);
});

test("a completed activation clears the card and the badge", async ({
  page,
}) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await card(page).getByRole("button", { name: BUY_BUTTON }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Trial" })
  ).toHaveCount(0);
});

test("waiting on the browser disables the actions", async ({ page }) => {
  await setupApp(page, {
    activateLicense: "hang",
    licenseState: { status: "trialExpired" },
  });

  await card(page).getByRole("button", { name: BUY_BUTTON }).click();
  await expect(
    card(page).getByRole("button", { name: "Waiting for the browser…" })
  ).toBeDisabled();
  await expect(
    card(page).getByRole("button", { name: "Later" })
  ).toBeDisabled();
});

test("an activation failure reads inside the card", async ({ page }) => {
  await setupApp(page, {
    activateLicense: "error",
    licenseState: { status: "trialExpired" },
  });

  await card(page).getByRole("button", { name: BUY_BUTTON }).click();
  await expect(card(page)).toContainText("Purchasing isn't configured");
  await expect(
    card(page).getByRole("button", { name: BUY_BUTTON })
  ).toBeEnabled();
});
