import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

/**
 * Repo scope in the code-search pane: mod+r opens the pane on the PR, a second
 * mod+r widens it to the whole revision, and the pane states which scope is
 * live. Hits whose exact line is on the new side of the diff carry an "in this
 * PR" chip and lead the list; a hit outside the diff peeks inline instead of
 * navigating, so the review never loses its place. A snapshot that is still
 * downloading shows the preparing notice, and one the backend refused reports
 * that refusal rather than preparing forever.
 *
 * The grep fixture matches on substring, so the queries here are the literal
 * text of the seeded hits. The query field is debounced by 250ms, which the
 * assertions absorb by polling rather than by waiting on the timer.
 */

const PR_SCOPE = /code in this PR/;
const REPO_SCOPE = /whole repo/;
const RETRY_HIT = { line: 2, path: "src/lib/retry.ts", text: "retryLimit = 3" };
const VENDOR_HIT = {
  line: 7,
  path: "src/vendor/backoff.ts",
  text: "retryLimit fallback",
};

async function openReview(page: Parameters<typeof setupApp>[0]) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

test("a second mod+r widens code search to the whole repo", async ({
  page,
}) => {
  await setupApp(page, {
    repoGrep: { hits: [RETRY_HIT], truncated: false },
    snapshotState: "ready",
  });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+r");
  await expect(page.locator(".qsp-foot-scope")).toHaveText(PR_SCOPE);

  await page.keyboard.press("ControlOrMeta+r");
  await expect(page.locator(".qsp-foot-scope")).toHaveText(REPO_SCOPE);
  await expect(page.getByText("Search the whole repo")).toBeVisible();
});

test("an in-PR hit is chipped and leads the repo results", async ({ page }) => {
  await setupApp(page, {
    repoGrep: { hits: [VENDOR_HIT, RETRY_HIT], truncated: false },
    snapshotState: "ready",
  });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.type("retryLimit");

  const rows = page.locator('[role="option"]');
  await expect.poll(() => rows.count()).toBe(2);
  await expect(rows.first()).toContainText("retry.ts");
  await expect(rows.first().locator(".qsp-chip")).toHaveText("in this PR");
  await expect(rows.nth(1).locator(".qsp-chip")).toHaveCount(0);
});

test("a repo-only hit peeks inline instead of leaving the review", async ({
  page,
}) => {
  await setupApp(page, {
    fileBlobs: {
      "src/vendor/backoff.ts": Array.from(
        { length: 12 },
        (_, i) => `line ${i + 1}`
      ).join("\n"),
    },
    repoGrep: { hits: [VENDOR_HIT], truncated: false },
    snapshotState: "ready",
  });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.type("retryLimit");

  await expect(page.locator('[role="option"]')).toHaveCount(1);
  await expect(page.locator(".qsp-snippet")).toBeVisible();
  await expect(page.locator("dialog.qsp-panel")).toBeVisible();
});

test("enter on a repo-only hit opens the whole file in place, esc steps back", async ({
  page,
}) => {
  await setupApp(page, {
    fileBlobs: {
      "src/vendor/backoff.ts": Array.from(
        { length: 12 },
        (_, i) => `line ${i + 1}`
      ).join("\n"),
    },
    repoGrep: { hits: [VENDOR_HIT], truncated: false },
    snapshotState: "ready",
  });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.type("retryLimit");
  await expect(page.locator('[role="option"]')).toHaveCount(1);

  await page.keyboard.press("Enter");
  await expect(page.locator(".qrfv-body")).toBeVisible();
  await expect(page.locator(".qrfv-path")).toHaveText("src/vendor/backoff.ts");
  await expect(page.locator(".qrfv-line-hit")).toContainText("line 7");
  await expect(page.getByText("line 12")).toBeVisible();
  await expect(page.getByText("back to results")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".qrfv-body")).toHaveCount(0);
  await expect(page.locator('[role="option"]')).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.qsp-panel")).toHaveCount(0);
});

test("a downloading snapshot says the repo is being prepared", async ({
  page,
}) => {
  await setupApp(page, { snapshotState: "downloading" });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.type("retryLimit");

  await expect(page.getByText("Getting the repo ready…")).toBeVisible();
  await expect(
    page.getByText("The first repo search downloads this revision once.")
  ).toBeVisible();
});

test("a refused snapshot names the refusal instead of preparing forever", async ({
  page,
}) => {
  await setupApp(page, { snapshotState: "skipped" });
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+r");
  await page.keyboard.press("ControlOrMeta+r");

  await expect(page.getByText("Repo search is unavailable.")).toBeVisible();
  await expect(
    page.getByText("This repository is too large for a local snapshot.")
  ).toBeVisible();
});
