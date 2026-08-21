/**
 * The two comment surfaces that shift+z and the drawer's Discussion feed
 * introduced: hiding resolved threads in the diff without ever hiding the
 * fact that they exist, and the drawer staying the unfiltered index of
 * record. The fixture carries one resolved thread and one unresolved thread
 * in the same file, plus a PR-level comment older than both, so the feed's
 * chronological order and the per-file hidden count are both observable.
 */

import { setupApp } from "./bridge.ts";
import { DETAIL } from "./fixtures.ts";
import { expect, test } from "./test.ts";

const FUZZY = "src/lib/fuzzy.ts";

const DETAIL_MIXED_THREADS = {
  ...DETAIL,
  comments: [
    {
      body: "Is this constant right?",
      createdAt: "2026-07-02T09:30:00Z",
      diffHunk: "",
      id: 100,
      inReplyToId: null,
      line: 2,
      originalLine: null,
      path: FUZZY,
      resolved: true,
      side: "RIGHT",
      threadId: "T100",
      user: "bob",
      userAvatarUrl: "",
    },
    {
      body: "Agreed, fixed in 9de693c.",
      createdAt: "2026-07-02T09:45:00Z",
      diffHunk: "",
      id: 101,
      inReplyToId: 100,
      line: null,
      originalLine: null,
      path: FUZZY,
      resolved: true,
      side: "RIGHT",
      threadId: "T100",
      user: "carol",
      userAvatarUrl: "",
    },
    {
      body: "This branch still needs a test.",
      createdAt: "2026-07-02T09:50:00Z",
      diffHunk: "",
      id: 102,
      inReplyToId: null,
      line: 3,
      originalLine: null,
      path: FUZZY,
      resolved: false,
      side: "RIGHT",
      threadId: "T102",
      user: "dave",
      userAvatarUrl: "",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await setupApp(page, { detail: DETAIL_MIXED_THREADS });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
});

test("shift+z hides resolved threads only, and says so in the file header", async ({
  page,
}) => {
  const diff = page.getByTestId("virtuoso-item-list");
  const resolved = page.locator(".qf-thread-collapsed");
  const unresolved = diff.getByText("This branch still needs a test.");
  const chip = page.locator(".qf-hidden-resolved-chip");

  await expect(resolved).toBeVisible();
  await expect(unresolved).toBeVisible();
  await expect(chip).toHaveCount(0);

  await page.keyboard.press("Shift+Z");

  await expect(resolved).toHaveCount(0);
  await expect(unresolved).toBeVisible();
  await expect(chip).toHaveText("1 resolved hidden");

  await page.keyboard.press("Shift+Z");

  await expect(resolved).toBeVisible();
  await expect(chip).toHaveCount(0);
});

test("hiding resolved threads lasts the session, not the next launch", async ({
  page,
}) => {
  await page.keyboard.press("Shift+Z");
  await expect(page.locator(".qf-hidden-resolved-chip")).toBeVisible();

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  await expect(page.locator(".qf-hidden-resolved-chip")).toHaveCount(0);
  await expect(page.locator(".qf-thread-collapsed")).toBeVisible();
});

test("the drawer keeps listing a thread the diff is hiding", async ({
  page,
}) => {
  await page.keyboard.press("Shift+Z");
  await expect(page.locator(".qf-thread-collapsed")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+i");

  const rows = page.locator(".qf-thread-row");
  await expect(rows).toHaveCount(2);
  await expect(page.locator(".qf-thread-row .qf-thread-check")).toHaveCount(1);
});

test("the drawer reads as one feed, oldest first, and a thread row jumps", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+i");

  const feed = page.locator(".qf-convo");
  await expect(feed).toContainText("Nice direction overall.");
  await expect(feed).toContainText("Is this constant right?");

  const entries = feed.locator(".qf-convo-item, .qf-thread-row");
  await expect(entries).toHaveCount(4);
  await expect(entries.first()).toContainText("Nice direction overall.");
  await expect(entries.nth(1)).toContainText("LGTM, ship it.");
  await expect(entries.nth(2)).toContainText("Is this constant right?");
  await expect(entries.nth(3)).toContainText("This branch still needs a test.");

  await expect(entries.nth(2)).toContainText(FUZZY);

  await entries.nth(2).click();

  await expect(page.locator('[data-comment-root="100"]')).toBeVisible();
});
