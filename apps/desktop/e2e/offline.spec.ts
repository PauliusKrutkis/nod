import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * Offline review: writes made while the host is unreachable queue instead of
 * failing, the bar names what is waiting by verb, and coming back online
 * replays everything except the staged review submission, which carries a
 * verdict and so waits for a press. A failed replay keeps the reviewer's text
 * and offers to place it again. `__setOnline` is the mocked bridge's
 * connectivity switch; the bar polls the flag, so assertions wait on the
 * poll rather than a reload.
 */

const POLL_WAIT = 20_000;

function bar(page: Page) {
  return page.locator(".qb-toast[role='status']");
}

function reconnect(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __setOnline: (v: boolean) => void }).__setOnline(
      true
    )
  );
}

async function openFirstPr(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

async function commentNow(page: Page, text: string) {
  await page.keyboard.press("j");
  await page.keyboard.press("c");
  const box = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(box).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Comment now" })
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ControlOrMeta+Enter");
}

test("offline, the bar says so before anything is written", async ({
  page,
}) => {
  await setupApp(page, { offline: true });
  await openFirstPr(page);
  await expect(bar(page)).toContainText("Offline");
  await expect(bar(page)).toContainText("Anything you write will queue");
});

test("a comment written offline queues and the bar counts it by verb", async ({
  page,
}) => {
  await setupApp(page, { offline: true });
  await openFirstPr(page);
  await commentNow(page, "this needs a guard");

  await expect(bar(page)).toContainText("Queued: 1 comment");
  await expect(bar(page)).toContainText("posts when the connection returns");
  expect(
    await page.evaluate(
      () => (window as unknown as { __calls: Record<string, number> }).__calls
    )
  ).toMatchObject({ queue_write: 1 });
});

test("coming back online replays the queue on its own", async ({ page }) => {
  test.slow();
  await setupApp(page, { offline: true });
  await openFirstPr(page);
  await commentNow(page, "this needs a guard");
  await expect(bar(page)).toContainText("Queued: 1 comment");

  await reconnect(page);

  await expect(bar(page)).toContainText("Back online", { timeout: POLL_WAIT });
  await expect(bar(page)).toContainText("1 queued write posted.");
});

test("a replay that fails keeps the text and offers to place it again", async ({
  page,
}) => {
  test.slow();
  await setupApp(page, {
    offline: true,
    replayFailure: "that line is no longer part of the diff on the host",
  });
  await openFirstPr(page);
  await commentNow(page, "this needs a guard");
  await expect(bar(page)).toContainText("Queued: 1 comment");

  await reconnect(page);

  await expect(bar(page)).toContainText("did not post", { timeout: POLL_WAIT });
  await expect(bar(page)).toContainText(
    "that line is no longer part of the diff on the host"
  );
  await expect(bar(page)).toContainText("this needs a guard");
  await expect(
    bar(page).getByRole("button", { name: "Place again" })
  ).toBeVisible();
  await expect(
    bar(page).getByRole("button", { name: "Discard" })
  ).toBeVisible();
});

test("a staged review waits for the send press instead of replaying itself", async ({
  page,
}) => {
  test.slow();
  await setupApp(page, { offline: true });
  await openFirstPr(page);
  await page.keyboard.press("s");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByRole("textbox", { name: "Review summary" }).fill("lgtm");
  await page.getByRole("button", { name: "Submit review" }).click();

  await expect(bar(page)).toContainText("review staged", {
    timeout: POLL_WAIT,
  });

  await reconnect(page);

  await expect(bar(page)).toContainText("It sends only when you press send.", {
    timeout: POLL_WAIT,
  });
  const send = bar(page).getByRole("button", { name: "Send review" });
  await expect(send).toBeVisible();

  await send.click();
  await expect(bar(page)).toContainText("1 queued write posted.");
});
