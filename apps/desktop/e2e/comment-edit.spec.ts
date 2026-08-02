import { setupApp } from "./bridge.ts";
import {
  DETAIL_OWN_REPLY_THEN_OTHERS,
  DETAIL_WITH_OWN_COMMENT,
} from "./fixtures.ts";
import { expect, test } from "./test.ts";

test.beforeEach(async ({ page }) => {
  await setupApp(page, { detail: DETAIL_WITH_OWN_COMMENT });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
});

test("edit shows only on your own comments", async ({ page }) => {
  const mine = page.locator('[data-comment-root="150"]');
  const theirs = page.locator('[data-comment-root="100"]');
  await expect(
    mine.getByRole("button", { name: "Edit comment" })
  ).toBeVisible();
  await expect(
    theirs.getByRole("button", { name: "Edit comment" })
  ).toHaveCount(0);
});

test("editing prefills the raw markdown and saves the new body", async ({
  page,
}) => {
  const mine = page.locator('[data-comment-root="150"]');
  await mine.getByRole("button", { name: "Edit comment" }).click();

  const box = page.getByRole("textbox", { name: "Edit your comment…" });
  await expect(box).toBeFocused();
  await expect(box).toContainText("I will tighten this loop tomorrow.");
  await expect(box.locator("strong")).toHaveText("loop");

  await page.keyboard.type(" Actually, tonight.");
  await mine.getByRole("button", { name: "Save" }).click();

  await expect(box).toHaveCount(0);
  await expect(mine.getByText("Actually, tonight.")).toBeVisible();

  const sent = JSON.parse(
    await page.evaluate(
      () => localStorage.getItem("e2e:lastCommentEdit") ?? "null"
    )
  );
  expect(sent.commentId).toBe(150);
  expect(sent.body).toContain("**loop**");
  expect(sent.body).toContain("Actually, tonight.");
});

test("shift+e edits your comment in the active thread; Esc backs out", async ({
  page,
}) => {
  const mine = page.locator('[data-comment-root="150"]');
  await mine.hover();
  await page.keyboard.press("Shift+E");

  const box = page.getByRole("textbox", { name: "Edit your comment…" });
  await expect(box).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await expect(
    mine.getByText("I will tighten this loop tomorrow.")
  ).toBeVisible();
});

test("shift+e is inert on a thread with none of your comments", async ({
  page,
}) => {
  const theirs = page.locator('[data-comment-root="100"]');
  await theirs.hover();
  await page.keyboard.press("Shift+E");
  await expect(
    page.getByRole("textbox", { name: "Edit your comment…" })
  ).toHaveCount(0);
});

test("the shift+e hint hides once someone else replies after your comment, but the key still edits it", async ({
  page,
}) => {
  await setupApp(page, { detail: DETAIL_OWN_REPLY_THEN_OTHERS });
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  const thread = page.locator('[data-comment-root="100"]');
  await thread.hover();

  await expect(thread.getByText("I'll take a look.")).toBeVisible();
  await expect(thread.getByText("Any update on this?")).toBeVisible();
  await expect(
    thread.getByRole("button", { name: "Edit comment" })
  ).toBeVisible();
  await expect(thread.locator(".q-kbd", { hasText: "E" })).toHaveCount(0);

  await page.keyboard.press("Shift+E");
  const box = page.getByRole("textbox", { name: "Edit your comment…" });
  await expect(box).toContainText("I'll take a look.");
});

test("opening the reply composer hides Edit/Delete on the thread's other comments", async ({
  page,
}) => {
  const mine = page.locator('[data-comment-root="150"]');
  await mine.hover();
  await expect(
    mine.getByRole("button", { name: "Edit comment" })
  ).toBeVisible();

  await page.keyboard.press("r");
  await expect(page.getByRole("textbox", { name: "Reply…" })).toBeFocused();
  await expect(mine.getByRole("button", { name: "Edit comment" })).toHaveCount(
    0
  );
  await expect(
    mine.getByRole("button", { name: "Delete comment" })
  ).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(
    mine.getByRole("button", { name: "Edit comment" })
  ).toBeVisible();
});

test("the keyboard cursor reveals Edit/Delete the same way hover does", async ({
  page,
}) => {
  const mine = page.locator('[data-comment-root="150"]');
  const tools = mine.locator(".qf-comment-tools");
  await expect(tools).toHaveCSS("opacity", "0");

  await page.keyboard.press("q");
  await page.keyboard.press("q");
  await expect(page.locator(".qf-comment-wrap.qf-thread-active")).toHaveCount(
    1
  );
  await expect(tools).toHaveCSS("opacity", "1");
});
