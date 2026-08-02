/**
 * The trial badge is ambient state, not a prompt: it must appear only for
 * unlicensed builds, read as a countdown while the trial runs, and flip to
 * "Trial ended" after — never blocking anything. Licensed builds show no
 * trace of licensing at all, which is the product promise.
 */
import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

test("a running trial shows the days left", async ({ page }) => {
  await setupApp(page, { licenseState: { daysLeft: 12, status: "trial" } });

  const badge = page.getByRole("status").filter({ hasText: "Trial" });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("Trial — 12 days left");
});

test("the last trial day reads singular", async ({ page }) => {
  await setupApp(page, { licenseState: { daysLeft: 1, status: "trial" } });

  await expect(
    page.getByRole("status").filter({ hasText: "Trial" })
  ).toHaveText("Trial — 1 day left");
});

test("an ended trial says so without blocking the app", async ({ page }) => {
  await setupApp(page, { licenseState: { status: "trialExpired" } });

  await expect(
    page.getByRole("status").filter({ hasText: "Trial" })
  ).toHaveText("Trial ended");
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("a licensed build shows no licensing chrome", async ({ page }) => {
  await setupApp(page);

  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Trial" })
  ).toHaveCount(0);
});
