import { setupApp } from "./bridge.ts";
import {
  DETAIL_LONG_CONVERSATION,
  DETAIL_WITH_OWN_COMMENT,
} from "./fixtures.ts";
import { expect, test } from "./test.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.beforeEach(async ({ page }) => {
  await setupApp(page, { detail: DETAIL_WITH_OWN_COMMENT });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+i");
  await expect(page.getByText("Deploying to staging first.")).toBeVisible();
});

test("edit and delete show only on your own conversation comments", async ({
  page,
}) => {
  const items = page.locator(".qf-convo-item");
  const mine = items.filter({ hasText: "Deploying to staging first." });
  const theirs = items.filter({ hasText: "Nice direction overall." });

  await expect(
    mine.getByRole("button", { name: "Edit comment" })
  ).toBeVisible();
  await expect(
    mine.getByRole("button", { name: "Delete comment" })
  ).toBeVisible();
  await expect(
    theirs.getByRole("button", { name: "Edit comment" })
  ).toHaveCount(0);
  await expect(
    theirs.getByRole("button", { name: "Delete comment" })
  ).toHaveCount(0);
});

test("editing a conversation comment prefills the markdown and saves", async ({
  page,
}) => {
  const mine = page
    .locator(".qf-convo-item")
    .filter({ hasText: "Deploying to staging first." });
  await mine.getByRole("button", { name: "Edit comment" }).click();

  const box = page.getByRole("textbox", { name: "Edit your comment…" });
  await expect(box).toBeFocused();
  await expect(box.locator("strong")).toHaveText("staging");

  await page.keyboard.type(" Then production.");
  await mine.getByRole("button", { name: "Save" }).click();

  await expect(box).toHaveCount(0);
  await expect(page.getByText("Then production.")).toBeVisible();

  const sent = JSON.parse(
    await page.evaluate(
      () => localStorage.getItem("e2e:lastConvoEdit") ?? "null"
    )
  );
  expect(sent.commentId).toBe(210);
  expect(sent.body).toContain("**staging**");
  expect(sent.body).toContain("Then production.");
});

test("the first click arms the confirm; leaving the button disarms it", async ({
  page,
}) => {
  const mine = page
    .locator(".qf-convo-item")
    .filter({ hasText: "Deploying to staging first." });
  const del = mine.getByRole("button", { name: "Delete comment" });

  await del.click();
  await expect(del).toHaveText("Delete?");

  await mine.getByText("Deploying to staging first.").hover();
  await expect(del).toHaveText("");
  await expect(page.getByText("Deploying to staging first.")).toBeVisible();
});

test("deleting a conversation comment takes the two-step confirm", async ({
  page,
}) => {
  const mine = page
    .locator(".qf-convo-item")
    .filter({ hasText: "Deploying to staging first." });
  const del = mine.getByRole("button", { name: "Delete comment" });

  await del.click();
  await expect(del).toHaveText("Delete?");
  await del.click();

  await expect(page.getByText("Deploying to staging first.")).toHaveCount(0);
  const sent = JSON.parse(
    await page.evaluate(
      () => localStorage.getItem("e2e:lastConvoDelete") ?? "null"
    )
  );
  expect(sent.commentId).toBe(210);
});

test("review verdicts never grow edit/delete tools", async ({ page }) => {
  const verdict = page
    .locator(".qf-convo-item")
    .filter({ hasText: "LGTM, ship it." });
  await expect(verdict).toBeVisible();
  await expect(
    verdict.getByRole("button", { name: "Edit comment" })
  ).toHaveCount(0);
  await expect(
    verdict.getByRole("button", { name: "Delete comment" })
  ).toHaveCount(0);
});

test("shift+c opens the composer focused, from the diff or the open drawer", async ({
  page,
}) => {
  await page.keyboard.press("Shift+c");
  const editor = page.getByRole("textbox", {
    name: "Comment on this pull request…",
  });
  await expect(editor).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Comment on this pull request…" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("aside.qf-drawer-open")).toHaveCount(0);

  await page.keyboard.press("Shift+c");
  await expect(page.locator("aside.qf-drawer-open")).toHaveCount(1);
  await expect(editor).toBeFocused();
});

test("a posted comment is scrolled into view, not left below the fold", async ({
  page,
}) => {
  await setupApp(page, {
    detail: DETAIL_LONG_CONVERSATION,
    hangIssueComment: true,
  });
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  await page.keyboard.press("Shift+c");
  const box = page.getByRole("textbox", {
    name: "Comment on this pull request…",
  });
  await expect(box).toBeFocused();

  const body = page.locator(".qf-drawer-body");
  await expect(body).toHaveJSProperty("scrollTop", 0);
  expect(
    await body.evaluate((el) => el.scrollHeight > el.clientHeight)
  ).toBeTruthy();

  await box.fill("Ship it once CI is green.");
  await page.keyboard.press("ControlOrMeta+Enter");

  const posted = page
    .locator(".qf-convo-item")
    .filter({ hasText: "Ship it once CI is green." });
  await expect(posted).toBeInViewport();

  const clippedPx = await posted.evaluate((el) => {
    const item = el.getBoundingClientRect();
    const host = (
      el.closest(".qf-drawer-body") as HTMLElement
    ).getBoundingClientRect();
    return (
      Math.max(0, item.bottom - host.bottom) + Math.max(0, host.top - item.top)
    );
  });
  expect(clippedPx).toBeLessThan(1);
});

test("copy is offered on every conversation comment, not just your own", async ({
  page,
}) => {
  const theirs = page
    .locator(".qf-convo-item")
    .filter({ hasText: "Nice direction overall." });

  await theirs.hover();
  await theirs.getByRole("button", { name: "Copy comment text" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Nice direction overall."
  );
});
