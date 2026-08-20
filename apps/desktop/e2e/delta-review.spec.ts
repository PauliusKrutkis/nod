import { setupApp } from "./bridge.ts";
import { DETAIL, DETAIL_CHANGED } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The changes-since-your-review mode (`d`). Its ground truth is a snapshot
 * saved when a review is submitted from the app, so these drive the whole
 * loop rather than seeding storage: submit against DETAIL, reload onto
 * DETAIL_CHANGED (the same PR with fuzzy.ts moved and the other two files
 * untouched), then read the diff back. `detailByLoad` advances on the
 * bridge's own per-load counter, so the reload is what serves the second
 * fixture.
 */

const SNAPSHOT_KEY = "nod:deltaSnapshots:v1";
const DIMMED_CLASS = /qf-row-dimmed/;

async function openReview(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

async function submitReview(page: Page) {
  await page.keyboard.press("j");
  await page.keyboard.press("c");
  const editor = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(editor).toBeFocused();
  await page.keyboard.type("worth a second look");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Pending")).toBeVisible();

  await page.keyboard.press("s");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect
    .poll(async () =>
      page.evaluate(
        (key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}")),
        SNAPSHOT_KEY
      )
    )
    .toContain("acme/rocket#1");
}

async function reopenAfterPush(page: Page) {
  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await openReview(page);
}

test("the mode dims what you reviewed and folds the files that did not move", async ({
  page,
}) => {
  await setupApp(page, { detailByLoad: [DETAIL, DETAIL_CHANGED] });
  await openReview(page);
  await submitReview(page);

  await reopenAfterPush(page);
  await expect(page.locator(".qf-row-dimmed")).toHaveCount(0);

  await page.keyboard.press("d");

  await expect(page.locator(".qf-delta-chip").first()).toHaveText(
    "since your review"
  );
  await expect(page.locator(".qf-delta-fold").first()).toContainText(
    "No changes since your review"
  );
  await expect(page.locator(".qf-row-dimmed").first()).toBeVisible();

  const newRow = page.locator('[data-anchor="RIGHT:2"]').first();
  await expect(newRow).toBeVisible();
  await expect(newRow).not.toHaveClass(DIMMED_CLASS);
});

test("a folded file opens again on demand", async ({ page }) => {
  await setupApp(page, { detailByLoad: [DETAIL, DETAIL_CHANGED] });
  await openReview(page);
  await submitReview(page);

  await reopenAfterPush(page);
  await page.keyboard.press("d");

  const folds = page.locator(".qf-delta-fold");
  const foldedFiles = await folds.count();
  expect(foldedFiles).toBeGreaterThan(0);

  await folds.first().click();
  await expect(folds).toHaveCount(foldedFiles - 1);
});

test("pressing d again puts the whole diff back", async ({ page }) => {
  await setupApp(page, { detailByLoad: [DETAIL, DETAIL_CHANGED] });
  await openReview(page);
  await submitReview(page);

  await reopenAfterPush(page);
  await page.keyboard.press("d");
  await expect(page.locator(".qf-delta-chip").first()).toBeVisible();

  await page.keyboard.press("d");
  await expect(page.locator(".qf-delta-chip")).toHaveCount(0);
  await expect(page.locator(".qf-delta-fold")).toHaveCount(0);
  await expect(page.locator(".qf-row-dimmed")).toHaveCount(0);
});

test("a pull request you never submitted a review on says so instead of guessing", async ({
  page,
}) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("d");

  await expect(page.locator(".qb-toast")).toContainText(
    "Nothing to compare against yet"
  );
  await expect(page.locator(".qf-delta-chip")).toHaveCount(0);
  await expect(page.locator(".qf-row-dimmed")).toHaveCount(0);
});
