/**
 * The update card must respect how the app was installed, not just whether
 * the license covers the release. Tauri's updater can only replace a build
 * that owns its own files: on Linux that is the AppImage, while a .deb or
 * .rpm belongs to the package manager and the install ends in "Failed to
 * install package". The backend reports that as `selfInstallable`, plus the
 * detected install format and its upgrade command; these specs pin that a
 * package-managed build swaps the install button for the copyable command,
 * that an unmanaged copy points at the downloads page instead, that a lapsed
 * license there still sells the license first while saying the swap stays
 * manual, and that every build with it keeps the one-click install.
 */
import { setupApp } from "./bridge.ts";
import { updateCard } from "./dom.ts";
import { LAPSED_LICENSE, UPDATE_AVAILABLE } from "./fixtures.ts";
import { expect, test } from "./test.ts";

const UPDATE = { ...UPDATE_AVAILABLE, eligible: true };
const LICENSE_CTA = /Get a license/;

test("a package install gets its manager's command instead of an install button", async ({
  page,
}) => {
  await setupApp(page, {
    update: {
      ...UPDATE,
      installedAs: "a Debian package",
      selfInstallable: false,
      updateCommand: "sudo apt upgrade nod",
    },
  });

  await expect(updateCard(page)).toContainText("installed as a Debian package");
  await expect(updateCard(page)).toContainText("sudo apt upgrade nod");
  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toHaveCount(0);
  await updateCard(page).screenshot({
    path: "evidence/update-package-install.png",
  });
});

test("an unmanaged copy points at the downloads page", async ({ page }) => {
  await setupApp(page, {
    update: {
      ...UPDATE,
      installedAs: "an unmanaged copy",
      selfInstallable: false,
    },
  });

  await expect(updateCard(page)).toContainText(
    "Nod can't replace this install on its own"
  );
  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toHaveCount(0);

  await updateCard(page)
    .getByRole("button", { name: "Open downloads" })
    .click();

  const opened = await page.evaluate(() =>
    localStorage.getItem("e2e:lastOpenUrl")
  );
  expect(opened).toContain("https://nodreview.com/downloads");
});

test("a lapsed license on a package install sells the license first", async ({
  page,
}) => {
  await setupApp(page, {
    licenseState: LAPSED_LICENSE,
    update: {
      ...UPDATE,
      eligible: false,
      installedAs: "a Debian package",
      selfInstallable: false,
      updateCommand: "sudo apt upgrade nod",
    },
  });

  await expect(updateCard(page)).toContainText(
    "2.0.0 is outside your update window"
  );
  await expect(updateCard(page)).toContainText(
    "Nod can't replace this install on its own"
  );
  await expect(
    updateCard(page).getByRole("button", { name: LICENSE_CTA })
  ).toBeVisible();
  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toHaveCount(0);
});

test("a build that installs its own updates keeps the button", async ({
  page,
}) => {
  await setupApp(page, { update: { ...UPDATE, selfInstallable: true } });

  await expect(
    updateCard(page).getByRole("button", { name: "Restart & update" })
  ).toBeVisible();
  await expect(updateCard(page)).not.toContainText(".deb");
  await expect(
    updateCard(page).getByRole("button", { name: "Open downloads" })
  ).toHaveCount(0);
  await updateCard(page).screenshot({
    path: "evidence/update-self-installing.png",
  });
});
