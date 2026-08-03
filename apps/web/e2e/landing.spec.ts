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

const START_DEMO_PATTERN = /try the real app/i;

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

test("the hero starts as a poster, with no demo bundle loaded", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator(".hd__poster")).toBeVisible();
  await expect(
    page.getByRole("button", { name: START_DEMO_PATTERN })
  ).toBeVisible();
  await expect(page.locator(".hd__iframe")).toHaveCount(0);
});

/**
 * The embedded app selects the row under the mouse (its hover behavior), and
 * after the click the pointer rests over the queue where the start button
 * was. The test parks the pointer off the frame and asserts relative
 * selection movement instead of a fixed starting row.
 */
test("starting the hero embeds the real app and hands it the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: START_DEMO_PATTERN }).click();
  await page.mouse.move(0, 0);

  const demo = page.frameLocator(".hd__iframe");
  const options = demo.getByRole("option");
  await expect(options.first()).toBeVisible();
  const selected = demo.locator('[role="option"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const startRow = await options.evaluateAll((rows) =>
    rows.findIndex((row) => row.getAttribute("aria-selected") === "true")
  );

  await page.keyboard.press("j");
  await expect(options.nth(startRow + 1)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("pressing j anywhere starts the demo, as the button promises", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hd__iframe")).toHaveCount(0);

  await page.keyboard.press("j");

  const demo = page.frameLocator(".hd__iframe");
  await expect(demo.getByRole("option").first()).toBeVisible();
});

test("a modified j does not hijack browser shortcuts into the demo", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("ControlOrMeta+j");

  await expect(page.locator(".hd__iframe")).toHaveCount(0);
});

test("shows each capability as real footage with a poster", async ({
  page,
}) => {
  await page.goto("/");

  const shows = page.locator(".show");
  await expect(shows).toHaveCount(3);
  for (const [i, scene] of ["loop", "comments", "scan"].entries()) {
    const video = shows.nth(i).locator("video");
    await expect(video).toHaveAttribute("poster", `/landing/${scene}.png`);
    await expect(video).toHaveAttribute("src", `/landing/${scene}.webm`);
  }
});

test("plays footage only in view, never under reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  const firstVideo = page.locator(".show video").first();

  await firstVideo.scrollIntoViewIfNeeded();
  await expect
    .poll(() => firstVideo.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => firstVideo.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
});

test("states the local-first qualities plainly", async ({ page }) => {
  await page.goto("/");

  const strip = page.locator(".locals");
  await expect(strip.getByRole("heading", { level: 2 })).toHaveText(
    "Feels local, because it is"
  );
  for (const term of ["cache-first", "resume", "notify", "private"]) {
    await expect(
      strip.locator(".locals__term", { hasText: term })
    ).toBeVisible();
  }
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
