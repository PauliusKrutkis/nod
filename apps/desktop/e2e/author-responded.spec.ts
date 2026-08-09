import { setupApp } from "./bridge.ts";
import { INBOX, inboxWithReply } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The bridge serves `inboxByCall[n]` for the nth list_inbox call and clamps on
 * the last entry, so a stage lasts until a later entry replaces it. Polls are
 * driven by window focus rather than the 15s interval; each one can consume
 * more than one call, so stages are advanced by call count, never by counting
 * dispatches.
 */

const REPLY = inboxWithReply("alice", "2026-07-02T12:00:00Z");
const SECOND_REPLY = inboxWithReply("alice", "2026-07-02T13:00:00Z");
const OWN_REPLY = inboxWithReply("me", "2026-07-02T12:30:00Z");

const inboxCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __calls?: Record<string, number> }).__calls
        ?.list_inbox ?? 0
  );

async function pollUntilCall(page: Page, target: number) {
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      return await inboxCalls(page);
    })
    .toBeGreaterThanOrEqual(target);
}

test("the author answering a review is announced once, not on every poll", async ({
  page,
}) => {
  await setupApp(page, { inboxByCall: [INBOX, REPLY] });
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(page.locator(".q-toast")).toHaveCount(0);

  await pollUntilCall(page, 2);
  await expect(page.locator(".q-toast")).toContainText("alice replied on");
  await expect(page.locator(".q-toast")).toContainText(
    "Tighten the retry backoff"
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: "evidence/author-replied-toast.png" });

  const seen = await inboxCalls(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".q-toast")).toHaveCount(0);

  await pollUntilCall(page, seen + 3);
  await expect(page.locator(".q-toast")).toHaveCount(0);
});

test("a second reply on the same PR is announced again", async ({ page }) => {
  await setupApp(page, {
    inboxByCall: [INBOX, REPLY, REPLY, REPLY, SECOND_REPLY],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await pollUntilCall(page, 2);
  await expect(page.locator(".q-toast")).toContainText("alice replied on");
  await page.keyboard.press("Escape");
  await expect(page.locator(".q-toast")).toHaveCount(0);

  await pollUntilCall(page, 5);
  await expect(page.locator(".q-toast")).toContainText("alice replied on");
});

test("your own comment on someone else's PR announces nothing", async ({
  page,
}) => {
  await setupApp(page, { inboxByCall: [INBOX, OWN_REPLY] });
  await expect(page.getByRole("option").first()).toBeVisible();

  await pollUntilCall(page, 4);
  await expect(page.locator(".q-toast")).toHaveCount(0);
});
