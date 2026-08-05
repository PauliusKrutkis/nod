/**
 * Ask-about-code evidence stills (docs/AI.md): drives the real app through
 * the mocked bridge — exactly like the ai-setup/ai-ask specs — and
 * screenshots each user-visible state of the feature: `a` with no key
 * (setup dialog is the onboarding), the model picker after a key validates,
 * the saved-key state, palette discoverability, the inline AI note over the
 * whole PR and under a cursor line, the pending spinner, a rendered answer,
 * promote-to-comment, and the provider-error state. Output:
 * capture-out/ai/*.png. Run just this file:
 *
 *   pnpm exec playwright test --config playwright.capture.config.ts ai.capture.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setupApp } from "../bridge.ts";
import { expect, test } from "../test.ts";
import type { Page } from "../types.ts";

const OUT = join("capture-out", "ai");

const FUZZY_LINE_CHIP = /fuzzy\.ts:\d+/;

const CONFIGURED = {
  aiInfo: {
    baseUrl: "https://api.nexos.ai",
    configured: true,
    model: "anthropic.claude-sonnet-4-5",
  },
};

const ANSWER = [
  "The retry knob is renamed, not re-tuned. `maxRetries` becomes `retryBudget` so the option reads as a budget shared across the whole request, matching how `src/retry.ts:2` now consumes it.",
  "- Call sites in `src/search/fuzzy.ts:14` pass the same value as before — behaviour is unchanged.\n- The old name is still accepted and mapped with a deprecation note.",
].join("\n\n");

function shot(page: Page, name: string) {
  return page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function openReview(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

function askPanel(page: Page) {
  return page.getByRole("complementary", { name: "Ask about code" });
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test("no key: `a` lands in setup, then the model picker loads", async ({
  page,
}) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: "Ask about code" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Provider base URL")).toHaveValue(
    "https://api.nexos.ai"
  );
  await shot(page, "01-no-key-setup");

  await dialog.getByLabel("API key").fill("nexos-…paste-your-key…");
  await page.keyboard.press("Enter");
  const picker = dialog.getByLabel("Model");
  await expect(picker).toBeVisible();
  await picker.selectOption("gpt-4o");
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await shot(page, "02-setup-models-loaded");
});

test("configured: dialog shows the saved-key hint and remove action", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("ai");
  await expect(page.locator(".qc-opt").first()).toBeVisible();
  await shot(page, "03-palette-entries");

  await page.getByPlaceholder("Run a command…").fill("ai settings");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Ask about code" });
  await expect(dialog.getByLabel("API key")).toHaveAttribute(
    "placeholder",
    "Key saved — paste to replace"
  );
  await expect(
    dialog.getByRole("button", { name: "Remove key" })
  ).toBeVisible();
  // Let the dialog's open transition settle before the still.
  await page.waitForTimeout(400);
  await shot(page, "04-setup-key-saved");
});

test("configured: `a` opens Ask over the whole PR, then a cursor line", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("a");
  const panel = askPanel(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("Whole pull request", { exact: true })
  ).toBeVisible();
  await shot(page, "05-ask-whole-pr");

  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await page.keyboard.press("a");
  await expect(panel.getByText(FUZZY_LINE_CHIP)).toBeVisible();
  await shot(page, "06-ask-cursor-line");
});

test("asking: pending spinner, then the rendered answer", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiAnswer: ANSWER });
  await openReview(page);

  await page.keyboard.press("j");
  await page.keyboard.press("a");
  const panel = askPanel(page);
  const input = panel.getByLabel("Question");

  // Hold ai_ask open so the pending state is capturable, then release it
  // with the answer for the final still — one exchange, both states.
  await page.evaluate(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __releaseAsk?: (answer: string) => void;
    };
    const original = w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
    w.__TAURI_INTERNALS__.invoke = (cmd, args) => {
      if (cmd === "ai_ask" && !w.__releaseAsk) {
        return new Promise((resolve) => {
          w.__releaseAsk = resolve;
        });
      }
      return original(cmd, args);
    };
  });
  await input.fill("Why was the retry option renamed?");
  await page.keyboard.press("Enter");
  await expect(
    panel.getByText("Why was the retry option renamed?")
  ).toBeVisible();
  await expect(panel.locator(".animate-spin")).toBeVisible();
  await shot(page, "07-ask-pending");

  await page.evaluate((answer) => {
    (window as unknown as { __releaseAsk: (a: string) => void }).__releaseAsk(
      answer
    );
  }, ANSWER);
  await expect(panel.getByText("deprecation note")).toBeVisible();
  await shot(page, "08-ask-answer");

  await panel.getByRole("button", { name: "Start comment from this" }).click();
  const editor = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("retry knob");
  await shot(page, "10-promote-composer");
});

test("provider errors surface inline, never a dead end", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiAnswer: "error" as const });
  await openReview(page);

  await page.keyboard.press("a");
  const panel = askPanel(page);
  await panel.getByLabel("Question").fill("Will this fail?");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("out of credits");
  await shot(page, "09-ask-error");
});
