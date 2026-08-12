import { setupApp } from "./bridge.ts";
import { INBOX, inboxWithReply } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The list is a view over the same log the toast fires from, so these cases
 * are about what the log remembers rather than what pops: the opening inbox is
 * seeded read (no unread badge on a fresh profile), a later arrival is unread,
 * and reading it is what clears the count.
 *
 * Stages advance by list_inbox call count for the same reason as the notifier
 * spec — one focus event can consume more than one call.
 */

const REPLY = inboxWithReply("alice", "2026-07-02T12:00:00Z");

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

const openCenter = (page: Page) =>
  page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+n" : "Control+Shift+n"
  );

test("the opening inbox is recorded but nothing in it counts as unread", async ({
  page,
}) => {
  await setupApp(page, { inbox: INBOX });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openCenter(page);
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Review requested").first()).toBeVisible();
  await expect(panel.locator(".qnc-badge")).toHaveCount(0);
  await expect(panel.locator(".qnc-item-unread")).toHaveCount(0);
});

test("a reply that arrives later is listed unread until it is read", async ({
  page,
}) => {
  await setupApp(page, { inboxByCall: [INBOX, REPLY] });
  await expect(page.getByRole("option").first()).toBeVisible();

  await pollUntilCall(page, 2);
  await expect(page.locator(".q-toast")).toContainText("alice replied on");
  await page.keyboard.press("Escape");

  await openCenter(page);
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.locator(".qnc-badge")).toHaveText("1");
  await expect(
    panel.getByText("Tighten the retry backoff").first()
  ).toBeVisible();

  await panel.getByRole("button", { name: "Mark all read" }).click();
  await expect(panel.locator(".qnc-badge")).toHaveCount(0);
  await expect(panel.locator(".qnc-item-unread")).toHaveCount(0);
});

test("a channel choice survives closing and reopening the panel", async ({
  page,
}) => {
  await setupApp(page, { inbox: INBOX });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openCenter(page);
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel
    .getByRole("group", { name: "Author replied notifications" })
    .getByText("Off", { exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await openCenter(page);
  await expect(
    page
      .getByRole("dialog", { name: "Notifications" })
      .getByRole("group", { name: "Author replied notifications" })
      .getByRole("radio", { name: "Off" })
  ).toBeChecked();
});
