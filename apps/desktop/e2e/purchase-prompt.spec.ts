/**
 * The purchase card is the only licensing surface, and it must follow the
 * evaluation contract: nothing licensing-related renders during the free
 * evaluation window or for licensed builds, the card appears only once the
 * grace window ends (trialExpired), the app stays fully usable behind it,
 * Later dismisses it for the launch — even mid-purchase, since checkout can
 * be abandoned — and a completed browser activation clears it without a
 * reload. A backend failure surfaces as copy inside the card, not a broken
 * boot.
 */
import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const BUY_BUTTON = /Buy Nod/;

const card = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Enjoying Nod?" });

test("an ended grace window shows the card over a working app", async ({
  page,
}) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText("free to evaluate");
  await expect(card(page)).toContainText("Buy Nod — $39");
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("evaluation and licensed builds show no licensing chrome", async ({
  page,
}) => {
  await setupApp(page, { licenseState: { daysLeft: 3, status: "trial" } });
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("a license backend failure never breaks boot", async ({ page }) => {
  await setupApp(page, { licenseState: "error" });

  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("Later dismisses the card for the launch, across routes", async ({
  page,
}) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await card(page).getByRole("button", { name: "Later" }).click();
  await expect(card(page)).toHaveCount(0);

  await page.getByRole("option").first().press("Enter");
  await expect(
    page.getByText("Add fuzzy matching to search").first()
  ).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("a completed activation clears the card", async ({ page }) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await card(page).getByRole("button", { name: BUY_BUTTON }).click();
  await expect(card(page)).toHaveCount(0);
});

test("waiting on the browser disables Buy but keeps Later usable", async ({
  page,
}) => {
  await setupApp(page, {
    activateLicense: "hang",
    licenseState: { status: "trialExpired" },
  });

  await card(page).getByRole("button", { name: BUY_BUTTON }).click();
  await expect(
    card(page).getByRole("button", { name: "Waiting for the browser…" })
  ).toBeDisabled();

  const calls = await page.evaluate(
    () =>
      (window as unknown as { __calls: Record<string, number> }).__calls
        .activate_license
  );
  expect(calls).toBe(1);

  await card(page).getByRole("button", { name: "Later" }).click();
  await expect(card(page)).toHaveCount(0);
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
