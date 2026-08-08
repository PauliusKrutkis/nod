/**
 * Evidence still for the typeable model picker: the list filtered by a typed
 * fragment, with the free-text row that keeps an unlisted model reachable.
 * Output: capture-out/combobox/*.png.
 */

import { join } from "node:path";
import { setupApp } from "../bridge.ts";
import { expect, test } from "../test.ts";

const OUT = join("capture-out", "combobox");

test("model combobox filtering", async ({ page }) => {
  await setupApp(page, {
    aiInfo: {
      baseUrl: "https://api.nexos.ai",
      configured: true,
      model: "gpt-4o",
    },
  });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("ai settings");
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Ask about code" });
  await expect(dialog).toBeVisible();
  await page.mouse.move(0, 0);
  await dialog.getByLabel("Model").fill("sonnet");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await dialog.screenshot({ path: join(OUT, "filtering.png") });
});
