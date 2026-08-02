/**
 * The landing page's job in the install flow: hand the visitor to /downloads,
 * where platform resolution happens. Its call to action is deliberately
 * platform-neutral — it navigates rather than downloading, so naming an OS on
 * it would both misdescribe the control and contradict the page it opens.
 */

import { expect, type Page, test } from "@playwright/test";

const DOWNLOADS_URL_PATTERN = /\/downloads\/?$/;

const HOMEBREW_URL_PATTERN = /\/downloads#homebrew$/;

const DOWNLOAD_LINK_PATTERN = /^Download/;

const PLATFORM_NAME_PATTERN = /macOS|Windows|Linux/;

const STABLE_FRAMES = 3;

/**
 * Resolves once the scroll position has stopped moving. `scroll-behavior` is
 * smooth, so an anchor jump animates; any geometry read mid-flight describes a
 * position the page is only passing through. Waiting on a value range instead
 * of on the animation ending is not enough — the range is one the animation
 * travels through, so the read still lands on a transient position.
 */
async function waitForScrollToSettle(page: Page) {
  await page.evaluate(
    (stableFrames) =>
      new Promise<void>((resolve) => {
        let lastY = Number.NaN;
        let stable = 0;
        const tick = () => {
          const y = Math.round(window.scrollY);
          stable = y === lastY ? stable + 1 : 0;
          lastY = y;
          if (stable >= stableFrames) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    STABLE_FRAMES
  );
}

test("leads with the inbox thesis in the hero", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Review PRs like an inbox, not a website."
  );
});

test("shows each feature in action instead of static cards", async ({
  page,
}) => {
  await page.goto("/");

  const rows = page.locator(".feat");
  await expect(rows).toHaveCount(3);
  for (const [i, title] of [
    "Keyboard-first",
    "Cache-first",
    "Resume instantly",
  ].entries()) {
    await expect(rows.nth(i).getByRole("heading", { level: 2 })).toHaveText(
      title
    );
    await expect(rows.nth(i).locator(".mini__window")).toBeVisible();
  }
  await expect(page.getByText("demo — coming soon")).toHaveCount(0);
});

test("sends the call to action to the downloads page", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByRole("link", { name: "Download Nod" });
  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(DOWNLOADS_URL_PATTERN);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Install Nod"
  );
});

test("sends the nav download link straight to the downloads page", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".nav").getByRole("link", { name: "Download" }).click();

  await expect(page).toHaveURL(DOWNLOADS_URL_PATTERN);
});

test("does not name a platform on the call to action", async ({ page }) => {
  await page.goto("/");

  const cta = page
    .locator(".get")
    .getByRole("link", { name: DOWNLOAD_LINK_PATTERN });
  await expect(cta).toHaveCount(1);
  await expect(cta).not.toContainText(PLATFORM_NAME_PATTERN);
});

test("lands on the Homebrew section from the hero", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Homebrew" }).click();

  await expect(page).toHaveURL(HOMEBREW_URL_PATTERN);

  const brew = page.locator("#homebrew");
  await expect(brew).toBeInViewport();
  await expect(brew.locator(".cmd__line").first()).toContainText(
    "brew install"
  );
});

test("clears the sticky nav when jumping to Homebrew", async ({ page }) => {
  await page.goto("/downloads#homebrew");

  await waitForScrollToSettle(page);

  const navHeight = await page
    .locator(".nav")
    .evaluate((nav) => nav.getBoundingClientRect().height);
  const settledTop = await page
    .locator("#homebrew")
    .evaluate((brew) => brew.getBoundingClientRect().top);

  expect(settledTop).toBeGreaterThanOrEqual(navHeight);
});

test("offers the downloads page from the footer of both pages", async ({
  page,
}) => {
  for (const path of ["/", "/downloads"]) {
    await page.goto(path);
    await expect(
      page.locator(".foot").getByRole("link", { name: "Downloads" })
    ).toHaveAttribute("href", "/downloads");
  }
});
