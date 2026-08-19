/**
 * The dock's Checks tab: it exists only for a host that reports a per-check
 * breakdown, wears that breakdown's worst state as a dot, and answers "which
 * check failed" by sorting failures to the top. A check the host named without
 * linking still opens something, the PR's own checks page.
 */

import { setupApp } from "./bridge.ts";
import { DETAIL_CHECKS, DETAIL_NO_CI } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const openReview = async (page: Page) => {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
};

const tab = (page: Page) =>
  page.locator(".qf-dock-tab").filter({ hasText: "Checks" });

test("the Checks tab carries the breakdown's verdict as a dot", async ({
  page,
}) => {
  await setupApp(page, { detailByCall: [DETAIL_CHECKS] });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+i");

  await expect(tab(page)).toBeVisible();
  await expect(tab(page)).toHaveAttribute("aria-label", "Checks · failing");
  await expect(tab(page).locator(".qf-dock-tab-dot-failure")).toHaveCount(1);
});

test("mod+j opens the tab with failures sorted first", async ({ page }) => {
  await setupApp(page, { detailByCall: [DETAIL_CHECKS] });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
  await expect(tab(page)).toHaveAttribute("aria-pressed", "true");

  const names = page.locator(".qf-cicheck-name");
  await expect(names).toHaveText(["e2e", "shots", "lint", "deploy"]);
});

test("mod+j closes the tab it opened", async ({ page }) => {
  await setupApp(page, { detailByCall: [DETAIL_CHECKS] });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "true"
  );
});

test("every row opens a log, falling back to the PR's checks page", async ({
  page,
}) => {
  await setupApp(page, { detailByCall: [DETAIL_CHECKS] });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+j");

  const rows = page.locator(".qf-cicheck-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute(
    "data-check-url",
    "https://x/checks/e2e"
  );
  await expect(rows.nth(3)).toHaveAttribute(
    "data-check-url",
    "https://github.com/o/r/pull/1/checks"
  );
});

test("the CI pill opens the Checks tab instead of the browser", async ({
  page,
}) => {
  await setupApp(page, { detailByCall: [DETAIL_CHECKS] });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+i");

  await page.locator(".qf-ci-failure").click();
  await expect(tab(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".qf-cicheck-row").first()).toBeVisible();
});

test("a repo without CI has no Checks tab, and mod+j does nothing", async ({
  page,
}) => {
  await setupApp(page, { detailByCall: [DETAIL_NO_CI] });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "true"
  );
  await page.keyboard.press("ControlOrMeta+i");
  await expect(tab(page)).toHaveCount(0);
});
