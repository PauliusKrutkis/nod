/**
 * The shortcut sheet (?) as a search surface: it opens with the query focused,
 * filtering narrows the sheet and reports how much of it survives, Escape
 * clears before it closes, and a query nothing answers to says so rather than
 * showing an empty panel. Scope awareness itself is covered in palette.spec.
 */
import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

const ARCHIVE_UNTIL_IT_UPDATES = /Archive until it updates/;
const MISSING_QUERY = /zzzznotakey/;
const NONE_OF_MANY = /^0\/\d+$/;

test.beforeEach(async ({ page }) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("the sheet opens with its search focused", async ({ page }) => {
  await page.keyboard.press("Shift+Slash");
  await expect(page.locator(".qh-panel")).toBeVisible();
  await expect(page.getByPlaceholder("Search shortcuts")).toBeFocused();
});

test("typing filters the sheet and counts what survives", async ({ page }) => {
  await page.keyboard.press("Shift+Slash");
  const input = page.getByPlaceholder("Search shortcuts");
  const count = page.locator(".qh-search-count");
  await expect(count).not.toBeVisible();

  await input.fill("archive");
  await expect(page.getByText(ARCHIVE_UNTIL_IT_UPDATES)).toBeVisible();
  await expect(count).toBeVisible();
  const [shown, total] = ((await count.textContent()) ?? "").split("/");
  expect(Number(shown)).toBeGreaterThan(0);
  expect(Number(shown)).toBeLessThan(Number(total));
});

test("a key name finds its binding", async ({ page }) => {
  await page.keyboard.press("Shift+Slash");
  await page.getByPlaceholder("Search shortcuts").fill("shift");
  await expect(page.locator(".qh-row").first()).toBeVisible();
  await expect(page.locator(".qh-blank")).not.toBeVisible();
});

test("a query nothing answers to names itself", async ({ page }) => {
  await page.keyboard.press("Shift+Slash");
  await page.getByPlaceholder("Search shortcuts").fill("zzzznotakey");
  await expect(page.locator(".qh-blank")).toBeVisible();
  await expect(page.getByText(MISSING_QUERY)).toBeVisible();
  await expect(page.locator(".qh-search-count")).toHaveText(NONE_OF_MANY);
});

test("escape clears the query, then closes the sheet", async ({ page }) => {
  await page.keyboard.press("Shift+Slash");
  const input = page.getByPlaceholder("Search shortcuts");
  await input.fill("archive");

  await page.keyboard.press("Escape");
  await expect(page.locator(".qh-panel")).toBeVisible();
  await expect(input).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(page.locator(".qh-panel")).not.toBeVisible();
});
