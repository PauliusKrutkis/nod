/**
 * The landing page's job in the install flow: hand the visitor to /downloads,
 * where platform resolution happens. Its call to action is deliberately
 * platform-neutral — it navigates rather than downloading, so naming an OS on
 * it would both misdescribe the control and contradict the page it opens.
 *
 * That call to action lives in the install band after the argument, not in
 * the hero, where the live demo is the only thing asking for attention. The
 * sticky nav's download link is what covers a visitor who arrived already
 * decided, so it is asserted alongside the hero's emptiness.
 */

import { expect, type Page, test } from "@playwright/test";

declare global {
  interface Window {
    peakConcurrentLoops: number;
  }
}

const DOWNLOADS_URL_PATTERN = /\/downloads\/?$/;

const HOMEBREW_URL_PATTERN = /\/downloads#homebrew$/;

const DOWNLOAD_LINK_PATTERN = /^Download/;

const PLATFORM_NAME_PATTERN = /macOS|Windows|Linux/;

const STABLE_FRAMES = 3;

const SWEEP_STEP_PERCENT = 4;

const START_DEMO_PATTERN = /try the real app/i;

const MAXIMIZED_PATTERN = /hd__frame--max/;

/**
 * Resolves once the scroll position has stopped moving. `scroll-behavior` is
 * smooth, so an anchor jump animates; any geometry read mid-flight describes a
 * position the page is only passing through. Waiting on a value range instead
 * of on the animation ending is not enough — the range is one the animation
 * travels through, so the read still lands on a transient position.
 */
async function waitForScrollToSettle(page: Page) {
  await page.evaluate(
    (stableFrames) =>
      new Promise<void>((resolve) => {
        let lastY = Number.NaN;
        let stable = 0;
        const tick = () => {
          const y = Math.round(window.scrollY);
          stable = y === lastY ? stable + 1 : 0;
          lastY = y;
          if (stable >= stableFrames) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    STABLE_FRAMES
  );
}

test("leads with the inbox thesis in the hero", async ({ page }) => {
  await page.goto("/");

  // The visual headline is a diff (del/ins); the accessible name carries the
  // full thesis sentence.
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Review PRs like an inbox, not a website.",
    })
  ).toBeVisible();
  await expect(page.locator(".hero__del")).toHaveText("a website");
  await expect(page.locator(".hero__ins")).toHaveText("an inbox");
});

test("the hero starts as a poster, with no demo bundle loaded", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator(".hd__poster")).toBeVisible();
  await expect(
    page.getByRole("button", { name: START_DEMO_PATTERN })
  ).toBeVisible();
  await expect(page.locator(".hd__iframe")).toHaveCount(0);
});

test("starting the hero embeds the real app and hands it the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: START_DEMO_PATTERN }).click();
  // The app selects the row under the mouse (its hover behavior), and the
  // pointer rests over the queue where the start button was. Park it off the
  // frame and assert relative movement instead of a fixed starting row.
  await page.mouse.move(0, 0);

  const demo = page.frameLocator(".hd__iframe");
  const options = demo.getByRole("option");
  await expect(options.first()).toBeVisible();
  const selected = demo.locator('[role="option"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const start = await options.evaluateAll((rows) =>
    rows.findIndex((row) => row.getAttribute("aria-selected") === "true")
  );

  await page.keyboard.press("j");
  await expect(options.nth(start + 1)).toHaveAttribute("aria-selected", "true");
});

test("pressing j anywhere starts the demo, as the button promises", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hd__iframe")).toHaveCount(0);

  await page.keyboard.press("j");

  const demo = page.frameLocator(".hd__iframe");
  await expect(demo.getByRole("option").first()).toBeVisible();
});

test("a modified j does not hijack browser shortcuts into the demo", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("ControlOrMeta+j");

  await expect(page.locator(".hd__iframe")).toHaveCount(0);
});

test("shift+f toggles the demo to viewport size and back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: START_DEMO_PATTERN }).click();
  const demo = page.frameLocator(".hd__iframe");
  await expect(demo.getByRole("option").first()).toBeVisible();
  const frame = page.locator(".hd__frame");

  await page.keyboard.press("Shift+F");
  await expect(frame).toHaveClass(MAXIMIZED_PATTERN);
  const viewport = page.viewportSize();
  const box = await frame.boundingBox();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);

  await page.keyboard.press("Shift+F");
  await expect(frame).not.toHaveClass(MAXIMIZED_PATTERN);
});

test("esc walks back through the app before it leaves full screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: START_DEMO_PATTERN }).click();
  const demo = page.frameLocator(".hd__iframe");
  await expect(demo.getByRole("option").first()).toBeVisible();
  const frame = page.locator(".hd__frame");

  await page.keyboard.press("Enter");
  await expect(demo.locator(".qf-row").first()).toBeVisible();

  await page.keyboard.press("Shift+F");
  await expect(frame).toHaveClass(MAXIMIZED_PATTERN);

  await page.keyboard.press("Escape");
  await expect(demo.getByRole("option").first()).toBeVisible();
  await expect(frame).toHaveClass(MAXIMIZED_PATTERN);

  await page.keyboard.press("Escape");
  await expect(frame).not.toHaveClass(MAXIMIZED_PATTERN);
  await expect(demo.getByRole("option").first()).toBeVisible();
});

test("shows each capability as real footage with a poster", async ({
  page,
}) => {
  await page.goto("/");

  const shows = page.locator(".show");
  await expect(shows).toHaveCount(3);
  for (const [i, scene] of ["loop", "comments", "scan"].entries()) {
    const video = shows.nth(i).locator("video");
    await expect(video).toHaveAttribute("poster", `/landing/${scene}.webp`);
    await expect(video).toHaveAttribute("src", `/landing/${scene}.webm`);
  }
});

test("plays footage only in view, never under reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  const firstVideo = page.locator(".show video").first();

  await firstVideo.scrollIntoViewIfNeeded();
  await expect
    .poll(() => firstVideo.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => firstVideo.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
});

test("never runs more than one loop at a time down the whole page", async ({
  page,
}) => {
  // Before this was scoped to a single winner, a 1280x900 viewport ran two
  // decoders at once and a tall one ran all three. The overlap only exists
  // over part of the page, so sampling a handful of scroll offsets can only
  // ever report "not two just here". Recording the peak from a capture-phase
  // play listener watches every transition instead: overlap needs a second
  // frame to start while a first is running, and starting fires play. By the
  // time that event's task runs, the pause loop that ran alongside it has
  // already applied, so the count it reads is the settled one.
  await page.addInitScript(() => {
    window.peakConcurrentLoops = 0;
    document.addEventListener(
      "play",
      () => {
        const playing = [
          ...document.querySelectorAll<HTMLVideoElement>(".show video"),
        ].filter((video) => !video.paused).length;
        window.peakConcurrentLoops = Math.max(
          window.peakConcurrentLoops,
          playing
        );
      },
      true
    );
  });
  await page.goto("/");

  const playingCount = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLVideoElement>(".show video")].filter(
          (video) => !video.paused
        ).length
    );

  // Establish that playback happens at all before asserting a cap on it: a
  // cap is satisfied trivially by a page where nothing ever plays, which is
  // how the first version of this spec passed against the bug.
  await page.locator(".show video").first().scrollIntoViewIfNeeded();
  await expect.poll(playingCount).toBe(1);

  // `scroll-behavior: smooth` is set page-wide, so the two-argument scrollTo
  // animates: each step would be read mid-flight, hundreds of pixels short of
  // where the sweep claims to be, and reaching the foot of the page at all
  // would depend on the animation happening to outrun the loop. Scrolling
  // instantly and waiting for the observer to deliver — it reports after the
  // frame callbacks, and play/pause set `paused` synchronously from there —
  // parks each step exactly on the grid.
  for (let percent = 0; percent <= 100; percent += SWEEP_STEP_PERCENT) {
    await page.evaluate((p) => {
      scrollTo({
        behavior: "instant",
        top: (document.documentElement.scrollHeight - innerHeight) * (p / 100),
      });
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 0))
        );
      });
    }, percent);
  }

  expect(await page.evaluate(() => window.peakConcurrentLoops)).toBe(1);
});

test("states the local-first qualities plainly", async ({ page }) => {
  await page.goto("/");

  const strip = page.locator(".locals");
  await expect(strip.getByRole("heading", { level: 2 })).toHaveText(
    "Feels local, because it is"
  );
  for (const term of ["cache-first", "resume", "notify", "private"]) {
    await expect(
      strip.locator(".locals__term", { hasText: term })
    ).toBeVisible();
  }
});

test("sends the call to action to the downloads page", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByRole("link", { name: "Download Nod" });
  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(DOWNLOADS_URL_PATTERN);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Install Nod"
  );
});

test("sends the nav download link straight to the downloads page", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".nav").getByRole("link", { name: "Download" }).click();

  await expect(page).toHaveURL(DOWNLOADS_URL_PATTERN);
});

test("does not name a platform on the call to action", async ({ page }) => {
  await page.goto("/");

  const cta = page
    .locator(".install")
    .getByRole("link", { name: DOWNLOAD_LINK_PATTERN });
  await expect(cta).toHaveCount(1);
  await expect(cta).not.toContainText(PLATFORM_NAME_PATTERN);
});

test("keeps the fold for the demo, with no download button in the hero", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.locator(".hero").getByRole("link", { name: DOWNLOAD_LINK_PATTERN })
  ).toHaveCount(0);
  await expect(
    page.locator(".nav").getByRole("link", { name: "Download" })
  ).toBeVisible();
});

test("lands on the Homebrew section from the install band", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Homebrew" }).click();

  await expect(page).toHaveURL(HOMEBREW_URL_PATTERN);

  const brew = page.locator("#homebrew");
  await expect(brew).toBeInViewport();
  await expect(brew.locator(".cmd__line").first()).toContainText(
    "brew install"
  );
});

test("clears the sticky nav when jumping to Homebrew", async ({ page }) => {
  await page.goto("/downloads#homebrew");

  await waitForScrollToSettle(page);

  const navHeight = await page
    .locator(".nav")
    .evaluate((nav) => nav.getBoundingClientRect().height);
  const settledTop = await page
    .locator("#homebrew")
    .evaluate((brew) => brew.getBoundingClientRect().top);

  expect(settledTop).toBeGreaterThanOrEqual(navHeight);
});

test("offers the downloads page from the footer of both pages", async ({
  page,
}) => {
  for (const path of ["/", "/downloads"]) {
    await page.goto(path);
    await expect(
      page.locator(".foot").getByRole("link", { name: "Downloads" })
    ).toHaveAttribute("href", "/downloads");
  }
});
