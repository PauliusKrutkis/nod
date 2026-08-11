/**
 * Stills of the file-band handoff, for PR evidence: the top strip of the
 * review list at three points as the next file's band arrives, captured twice
 * over the same scroll positions. The "before" pass neutralises the push with
 * a stylesheet override instead of running old code, so both passes come from
 * one build and differ only in the behaviour under review. Output:
 * capture-out/sticky-header/*.png. Run just this file:
 *
 *   pnpm exec playwright test --config playwright.capture.config.ts sticky-header.capture.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setupApp } from "../bridge.ts";
import { makeBigDetail } from "../fixtures.ts";
import { expect, test } from "../test.ts";
import type { Page } from "../types.ts";

const OUT = join("capture-out", "sticky-header");

const STRIP_PX = 132;

const GAPS = [40, 26, 12];

const PUSH_OFF = `
[data-testid="virtuoso-top-item-list"] .qf-fsec-head { transform: none !important; }
`;

const DETAIL = makeBigDetail(
  6,
  40,
  (f, i) => `const value_${f}_${i} = compute(${i} + ${f});`
);

function parkIncomingBand(page: Page, gapPx: number) {
  return page.evaluate((gap) => {
    const host = document.querySelector(".qf-scrollhost");
    if (!host) {
      return;
    }
    const hostTop = host.getBoundingClientRect().top;
    for (const head of document.querySelectorAll(".qf-fsec-head")) {
      if (head.closest('[data-testid="virtuoso-top-item-list"]')) {
        continue;
      }
      const top = head.getBoundingClientRect().top - hostTop;
      if (top > -60) {
        host.scrollTop += top - gap;
        return;
      }
    }
  }, gapPx);
}

async function pass(page: Page, tag: string, pushOff: boolean) {
  await setupApp(page, { detailByLoad: [DETAIL] });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-diff").first()).toBeVisible();
  if (pushOff) {
    await page.addStyleTag({ content: PUSH_OFF });
  }
  await page.waitForTimeout(400);

  const box = await page.locator(".qf-scrollhost").boundingBox();
  if (!box) {
    throw new Error("scroll host has no box");
  }
  await page.evaluate(() => {
    const host = document.querySelector(".qf-scrollhost");
    if (host) {
      host.scrollTop = 900;
    }
  });
  await page.waitForTimeout(200);

  for (const gap of GAPS) {
    await parkIncomingBand(page, gap);
    await page.waitForTimeout(150);
    await page.screenshot({
      clip: { height: STRIP_PX, width: box.width, x: box.x, y: box.y },
      path: join(OUT, `${tag}-${gap}.png`),
    });
  }
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test("the bands overlap while the next file arrives", async ({ page }) => {
  test.setTimeout(120_000);
  await pass(page, "before", true);
});

test("the incoming band pushes the pinned one out", async ({ page }) => {
  test.setTimeout(120_000);
  await pass(page, "after", false);
});
