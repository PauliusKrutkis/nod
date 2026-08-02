/**
 * The cache-first miniature is a pure-CSS loop: the pane paints instantly
 * from the local cache, then the sync tick arrives quietly. Assertions are
 * structural — the fc- animations exist under default motion, and reduced
 * motion disables them and freezes on the composed frame — never reads of
 * mid-animation opacity, which would race the timeline.
 */

import { expect, type Locator, type Page, test } from "@playwright/test";

const FC_ANIMATION_PATTERN = /^fc-/;

function cacheRow(page: Page): Locator {
  return page.locator(".feat").filter({ hasText: "Cache-first" });
}

function computedAnimation(part: Locator) {
  return part.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      delay: style.animationDelay,
      name: style.animationName,
      opacity: style.opacity,
    };
  });
}

test("animates the pane with fc- keyframes under default motion", async ({
  page,
}) => {
  await page.goto("/");
  const row = cacheRow(page);

  for (const part of [".pane__hit", ".pane__syncing", ".pane__sync"]) {
    const { name } = await computedAnimation(row.locator(part));
    expect(name).toMatch(FC_ANIMATION_PATTERN);
  }
});

test("paints all code lines in one shared slot, with no stagger", async ({
  page,
}) => {
  await page.goto("/");
  const lines = cacheRow(page).locator(".pane__line");

  await expect(lines).toHaveCount(4);
  for (const line of await lines.all()) {
    const { name, delay } = await computedAnimation(line);
    expect(name).toBe("fc-paint");
    expect(delay).toBe("0s");
  }
});

test("freezes on the composed frame under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const row = cacheRow(page);

  for (const part of [".pane__line--add", ".pane__hit", ".pane__sync"]) {
    const { name, opacity } = await computedAnimation(row.locator(part));
    expect(name).toBe("none");
    expect(opacity).toBe("1");
  }
  const syncing = await computedAnimation(row.locator(".pane__syncing"));
  expect(syncing.name).toBe("none");
  expect(syncing.opacity).toBe("0");

  await expect(row.locator(".pane__sync")).toHaveText("synced ✓");
  await expect(row.locator(".pane__add-text")).toHaveText("queue.refresh(id)");
});
