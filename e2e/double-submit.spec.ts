import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

/**
 * Two ⌘↵ dispatched in the SAME tick must post once, not twice. They are
 * dispatched via one page.evaluate on purpose: two keyboard.press calls are
 * separate round-trips, so React re-renders between them and the `pending`
 * prop alone would already block the second — which would let this test pass
 * without the synchronous lock it exists to prove. The bridge counts calls.
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
  await page.evaluate(() => {
    const el = document.activeElement ?? document.body;
    // ProseMirror resolves Mod-Enter per platform: Meta on macOS, Ctrl
    // elsewhere — a metaKey-only event is ignored on Linux CI.
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    for (let i = 0; i < 2; i += 1) {
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: !isMac,
          key: "Enter",
          metaKey: isMac,
        })
      );
    }
  });

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __calls?: Record<string, number> }).__calls
            ?.create_review_comment ?? 0
      )
    )
    .toBe(1);
});
