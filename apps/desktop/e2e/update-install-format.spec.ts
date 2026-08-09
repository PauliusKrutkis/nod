/**
 * The update card must respect how the app was installed, not just whether
 * the license covers the release. Tauri's updater can only replace a build
 * that owns its own files: on Linux that is the AppImage, while a .deb or
 * .rpm belongs to the package manager and the install ends in "Failed to
 * install package". The backend reports that as `selfInstallable`; these
 * specs pin that a build without it loses the install button and points at
 * the downloads page instead, and that every build with it keeps the
 * one-click install.
 */
import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const UPDATE = {
  currentVersion: "1.0.0",
  eligible: true,
  notes: null,
  version: "2.0.0",
};

const updateCard = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Update available" });

test("a package install gets a notice instead of an install button", async ({
  page,
}) => {
  await setupApp(page, { update: { ...UPDATE, selfInstallable: false } });

  await expect(updateCard(page)).toContainText(
    "Your package manager installed Nod"
  );
  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toHaveCount(0);
  await updateCard(page).screenshot({
    path: "evidence/update-package-install.png",
  });

  await updateCard(page)
    .getByRole("button", { name: "Open downloads" })
    .click();

  const opened = await page.evaluate(() =>
    localStorage.getItem("e2e:lastOpenUrl")
  );
  expect(opened).toContain("https://nodreview.com/downloads");
});

test("a build that installs its own updates keeps the button", async ({
  page,
}) => {
  await setupApp(page, { update: { ...UPDATE, selfInstallable: true } });

  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toBeVisible();
  await expect(updateCard(page)).not.toContainText("package manager");
  await expect(
    updateCard(page).getByRole("button", { name: "Open downloads" })
  ).toHaveCount(0);
  await updateCard(page).screenshot({
    path: "evidence/update-self-installing.png",
  });
});
