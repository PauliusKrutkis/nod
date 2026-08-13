import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * AI completion in the composer: grey text after the caret that Tab takes.
 * The gate is the point of the first two — it is off until asked for, and
 * asking for it is not enough on its own if no model is configured. The rest
 * pin that it never touches the keys the composer already owns.
 */

const CONFIGURED = {
  aiInfo: { baseUrl: "https://api.nexos.ai", configured: true, model: "gpt-5" },
};

function box(page: Page) {
  return page.getByRole("textbox", { name: "Add a review comment…" });
}

function ghost(page: Page) {
  return page.locator(".qgt-ghost");
}

async function openComposer(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("c");
  await expect(box(page)).toBeFocused();
}

async function turnOn(page: Page) {
  await page.keyboard.press("ControlOrMeta+Shift+u");
  await expect(page.getByText("AI completion on")).toBeVisible();
}

test("stays off until it is asked for", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: " an early return." });
  await openComposer(page);

  await page.keyboard.type("This would read better with");
  await page.waitForTimeout(1200);
  await expect(ghost(page)).toHaveCount(0);

  const asked = await page.evaluate(() =>
    localStorage.getItem("e2e:aiComplete")
  );
  expect(asked).toBeNull();
});

test("turned on with no model configured still asks for nothing", async ({
  page,
}) => {
  await setupApp(page, { aiCompletion: " an early return." });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("This would read better with");
  await page.waitForTimeout(1200);
  await expect(ghost(page)).toHaveCount(0);
});

test("offers a continuation once on, and Tab takes it", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: " an early return." });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("This would read better with");
  await expect(ghost(page)).toHaveText("an early return.");

  await page.keyboard.press("Tab");
  await expect(box(page)).toContainText(
    "This would read better with an early return."
  );
  await expect(ghost(page)).toHaveCount(0);
});

test("Escape sends the ghost away and leaves the typed text", async ({
  page,
}) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: " an early return." });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("This would read better with");
  await expect(ghost(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toContainText("This would read better with");
});

test("typing on invalidates an offer written for an older line", async ({
  page,
}) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: " an early return." });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("This would read better with");
  await expect(ghost(page)).toBeVisible();

  await page.keyboard.type(" a");
  await expect(ghost(page)).toHaveCount(0);
});

test("a provider error is silence, not a broken composer", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: "error" });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("This would read better with");
  await page.waitForTimeout(1200);
  await expect(ghost(page)).toHaveCount(0);

  await page.keyboard.type(" more text");
  await expect(box(page)).toContainText(
    "This would read better with more text"
  );
});

test("the canned panel wins the caret while it is up", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: " something else." });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("Can you pull this");
  await expect(page.locator(".qcs-panel")).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(ghost(page)).toHaveCount(0);
});

test("Tab still flips the comment's mode when nothing is offered", async ({
  page,
}) => {
  await setupApp(page, { ...CONFIGURED, aiCompletion: "" });
  await openComposer(page);
  await turnOn(page);

  await page.keyboard.type("no offer for this");
  await page.waitForTimeout(1000);
  await expect(ghost(page)).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Comment now" })).toBeVisible();
});
