import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const ASK_ABOUT_CODE = "Ask about code";
const SAVE_AND_LOAD = /Save & load models/;

async function openReview(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

test("a opens AI setup with the Nexos preset prefilled", async ({ page }) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");

  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Provider base URL")).toHaveValue(
    "https://api.nexos.ai"
  );
  await expect(
    dialog.getByText("Nothing is sent until you ask.")
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("pasting a key saves config and loads the model picker", async ({
  page,
}) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await dialog.getByLabel("API key").fill("nexos-test-key");
  await page.keyboard.press("Enter");

  const picker = dialog.getByLabel("Model");
  await expect(picker).toBeVisible();
  await picker.selectOption("gpt-4o");

  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(picker).toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("e2e:aiConfig") ?? "null")
  );
  expect(saved).toMatchObject({
    baseUrl: "https://api.nexos.ai",
    model: "gpt-4o",
  });
  expect(saved.apiKey).toBe("");
});

test("preset chips rewrite the base URL", async ({ page }) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await dialog.getByRole("button", { name: "OpenRouter" }).click();
  await expect(dialog.getByLabel("Provider base URL")).toHaveValue(
    "https://openrouter.ai/api"
  );
});

test("configured state shows the saved-key hint and remove action", async ({
  page,
}) => {
  await setupApp(page, {
    aiInfo: {
      baseUrl: "https://api.nexos.ai",
      configured: true,
      model: "gpt-4o",
    },
  });
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await expect(dialog.getByLabel("API key")).toHaveAttribute(
    "placeholder",
    "Key saved — paste to replace"
  );
  await expect(
    dialog.getByRole("button", { name: "Remove key" })
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Remove key" }).click();
  await expect(dialog).not.toBeVisible();
});

test("command palette carries the AI settings entry everywhere", async ({
  page,
}) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("ask about");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("dialog", { name: ASK_ABOUT_CODE })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: SAVE_AND_LOAD })).toBeVisible();
});
