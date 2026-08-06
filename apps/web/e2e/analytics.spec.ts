/**
 * The analytics beacon is opt-in per build, and this suite pins the "off"
 * half of that. CI builds without PUBLIC_CF_ANALYTICS_TOKEN, so a beacon
 * appearing here means the conditional in Base.astro has been lost and every
 * local and preview build has started loading a third-party script — the one
 * thing /about's privacy copy promises does not happen off production.
 *
 * The "on" half is not testable here: it would need a second build carrying
 * the token, and the suite runs one. `analyticsBeaconToken` covers the
 * decision itself in src/lib/site.test.ts; this covers the wiring.
 */

import { expect, test } from "@playwright/test";

const BEACON_SELECTOR = 'script[src*="cloudflareinsights.com"]';

const PAGES_WITH_LAYOUT = ["/", "/about/", "/downloads/", "/buy/"];

for (const path of PAGES_WITH_LAYOUT) {
  test(`ships no analytics beacon on ${path} without a token`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.locator(BEACON_SELECTOR)).toHaveCount(0);
  });
}

test("renders no beacon element carrying an empty token", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("script[data-cf-beacon]")).toHaveCount(0);
});
