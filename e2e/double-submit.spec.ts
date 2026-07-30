import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

/**
 * Mutations that hang: the composer must refuse a second submit while the
 * first is still in flight, or a slow network turns one ⌘↵ into two comments
 * on someone's PR. The bridge counts create_review_comment calls.
 */
test("a second Cmd+Enter cannot post the same comment twice", async ({
  page,
}) => {
  await setupApp(page, { hangReviewComment: true });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("c");
  const box = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(box).toBeFocused();

  await page.keyboard.type("only once");
  await page.getByText("Comment now").click();
  await box.click();
  await expect(box).toBeFocused();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForTimeout(400);

  const calls = await page.evaluate(
    () =>
      (window as unknown as { __calls?: Record<string, number> }).__calls
        ?.create_review_comment ?? 0
  );
  expect(calls).toBe(1);
});
