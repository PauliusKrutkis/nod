/**
 * The file band at the top of the review is a claim that a file starts here,
 * so two of them on screen at once make that claim false. These tests walk the
 * scroll across a file boundary a few pixels at a time and assert the pinned
 * band is always shoved out by the incoming one rather than sitting under it.
 *
 * The bands are allowed to share the incoming header's top border: the strip
 * the push measures against hangs off the header's padding box, so the last
 * pixels the outgoing band gives up are the ones the incoming border paints
 * over anyway. Everything is measured relative to `.qf-scrollhost`, and each
 * step polls, because the push lands on the frame after the scroll.
 */
import { setupApp } from "./bridge.ts";
import { makeBigDetail } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const BIG_DETAIL = makeBigDetail(
  5,
  14,
  (f, i) => `const value_${f}_${i} = compute(${i} + ${f});`
);

const SHARED_EDGE_PX = 2;

const STEP_PX = 6;

const TOP_LIST = '[data-testid="virtuoso-top-item-list"] .qf-fsec-head';

function bandGeometry(page: Page) {
  return page.evaluate((topList) => {
    const host = document.querySelector(".qf-scrollhost");
    const pinned = document.querySelector(topList);
    if (!(host && pinned)) {
      return null;
    }
    const hostTop = host.getBoundingClientRect().top;
    const pin = pinned.getBoundingClientRect();
    let overlap: number | null = null;
    for (const head of document.querySelectorAll(".qf-fsec-head")) {
      if (head === pinned) {
        continue;
      }
      const top = head.getBoundingClientRect().top - hostTop;
      if (top > 240) {
        continue;
      }
      overlap = Math.max(
        overlap ?? Number.NEGATIVE_INFINITY,
        pin.bottom - hostTop - top
      );
    }
    return { overlap, pinnedTop: pin.top - hostTop };
  }, TOP_LIST);
}

function scrollBy(page: Page, px: number) {
  return page.evaluate((by) => {
    const host = document.querySelector(".qf-scrollhost");
    if (!host) {
      return false;
    }
    host.scrollTop += by;
    return host.scrollTop + host.clientHeight < host.scrollHeight - 4;
  }, px);
}

test.beforeEach(async ({ page }) => {
  await setupApp(page, { detailByLoad: [BIG_DETAIL] });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-diff").first()).toBeVisible();
});

test("the incoming file band pushes the pinned one out instead of covering it", async ({
  page,
}) => {
  const bandPx = await page
    .locator(".qf-fsec-head")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);

  let handoffs = 0;
  let more = true;
  for (let step = 0; step < 400 && more; step += 1) {
    more = await scrollBy(page, STEP_PX);
    await expect
      .poll(async () => (await bandGeometry(page))?.overlap ?? -1)
      .toBeLessThanOrEqual(SHARED_EDGE_PX);
    const geo = await bandGeometry(page);
    if (geo && geo.pinnedTop < -1 && geo.pinnedTop > -bandPx) {
      handoffs += 1;
    }
  }

  expect(handoffs, "no file handoff was ever caught mid-push").toBeGreaterThan(
    2
  );
});

test("the pinned file band sits flush at the top away from a boundary", async ({
  page,
}) => {
  await scrollBy(page, 600);
  await expect.poll(async () => (await bandGeometry(page))?.overlap).toBeNull();
  const geo = await bandGeometry(page);
  expect(geo?.pinnedTop).toBeCloseTo(0, 0);
});
