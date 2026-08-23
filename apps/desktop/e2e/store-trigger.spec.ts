import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

/**
 * Opening a PR fires the fire-and-forget ensure_repo_store with the PR's
 * head SHA — deliberately deferred off the open-critical path, so the spec
 * polls the bridge's invocation log instead of racing the timer.
 */

const recordedEnsures = (page: Parameters<typeof setupApp>[0]) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("e2e:storeEnsures") ?? "[]") as Record<
        string,
        unknown
      >[]
  );

test("opening a PR ensures the repo store for its head SHA", async ({
  page,
}) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  await expect.poll(() => recordedEnsures(page)).toHaveLength(1);
  const [call] = await recordedEnsures(page);
  expect(call).toMatchObject({ sha: "headsha" });
});
