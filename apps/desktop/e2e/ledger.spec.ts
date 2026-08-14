import { setupApp } from "./bridge.ts";
import { LEDGER, LEDGER_AFTER_REVIEW } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The ledger view derives everything from the mocked ledger_status command;
 * signing flips the bridge to the after-review fixture, which is how the
 * spec asserts the r keystroke both records the fact (command args in
 * localStorage) and re-derives the number rather than mutating UI state.
 * The clone-path map (nod:repoPaths:v1) is seeded for the returning-user
 * tests and built through the form in the first-visit test.
 */

const openLedger = (page: Page) =>
  page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+l" : "Control+Shift+l"
  );

const seedKnownClone = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem(
      "nod:repoPaths:v1",
      JSON.stringify({ "me/nod": "/repo/nod" })
    );
    localStorage.setItem("nod:ledgerLastRepo:v1", "me/nod");
  });

test("the queue lists regions and r signs the selected one", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    ledgerAfterReview: LEDGER_AFTER_REVIEW,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.locator('[data-route="ledger"]')).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);
  await expect(page.getByText("0.0%")).toBeVisible();
  await expect(page.getByText("#321", { exact: true })).toBeVisible();
  await expect(page.getByText("d1eec70")).toBeVisible();

  await page.keyboard.press("r");
  await expect(page.getByText("87.0%")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
  const review = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerReview")
  );
  expect(JSON.parse(review ?? "{}")).toMatchObject({
    repoPath: "/repo/nod",
    target: "src/anchors/resolve.ts:1-40",
  });
});

test("j moves the selection before signing", async ({ page }) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    ledgerAfterReview: LEDGER_AFTER_REVIEW,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("j");
  await page.keyboard.press("r");
  const review = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerReview")
  );
  expect(JSON.parse(review ?? "{}")).toMatchObject({
    target: "src/facts/store.ts:7-12",
  });
});

test("first visit picks a watched repo and sets its clone path once", async ({
  page,
}) => {
  await setupApp(page, { watchedRepos: ["me/nod", "me/site"] });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(
    page.getByRole("listbox", { name: "Watched repositories" })
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.keyboard.press("Enter");
  await expect(page.getByText("Where is me/nod cloned?")).toBeVisible();
  await page.getByLabel("Repository path").fill("/repo/nod");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Queue is empty")).toBeVisible();

  const paths = await page.evaluate(() =>
    localStorage.getItem("nod:repoPaths:v1")
  );
  expect(JSON.parse(paths ?? "{}")).toMatchObject({ "me/nod": "/repo/nod" });
});

test("escape steps out of the queue to the picker, then to the inbox", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByText("0.0%")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("listbox", { name: "Watched repositories" })
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-route="inbox"]')).toBeVisible();
});
