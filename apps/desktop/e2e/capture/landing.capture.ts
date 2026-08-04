/**
 * Landing-page footage: drives the real app (mocked bridge, like every spec)
 * through three staged scenes and captures them as deterministic frame
 * sequences instead of wall-clock video — each step screenshots once and
 * declares how long the frame holds, so the assembled loops contain no page
 * load flash, no timing jitter, and re-running produces the same film.
 * `scripts/capture-landing.sh` runs this file via playwright.capture.config.ts
 * and assembles capture-out/<scene>/ into apps/web/public/landing/ with
 * ffmpeg. Scenes: "loop" (inbox triage -> review -> viewed -> submit),
 * "comments" (inline composer -> add to review -> existing thread), "scan"
 * (occurrence marks -> find bar -> ruler ticks). The poster frame each scene
 * marks is the one the landing page shows under prefers-reduced-motion.
 * The "hero" scene is poster-only: one frame of the demo fixture queue at
 * the hero iframe's exact size, shown until the visitor starts the live
 * demo. Token double-clicks resolve the token's own box via a DOM Range,
 * because clicking the center of a code line lands on trailing blank space,
 * which deliberately clears marks instead of setting them.
 */

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_INBOX } from "../../demo/fixtures.ts";
import { setupApp } from "../bridge.ts";
import type { InboxFixture } from "../fixtures.ts";
import { makePr } from "../fixtures.ts";
import { expect, test } from "../test.ts";
import type { Page } from "../types.ts";

const OUT_ROOT = "capture-out";

const TYPING_SECONDS = 0.055;

const CAPTURE_INBOX: InboxFixture = {
  assigned: { count: 0, prs: [] },
  created: { count: 0, prs: [] },
  involved: { count: 0, prs: [] },
  reviewRequested: {
    count: 6,
    prs: [
      makePr(
        2,
        "Fix cursor drift in diff viewer",
        "bob",
        "2026-07-02T10:00:00Z"
      ),
      makePr(3, "Rework the token gate", "carol", "2026-07-02T09:00:00Z"),
      makePr(
        1,
        "Add fuzzy matching to search",
        "alice",
        "2026-07-02T08:00:00Z"
      ),
      makePr(
        5,
        "Restore scroll position on relaunch",
        "dave",
        "2026-07-01T18:00:00Z"
      ),
      makePr(6, "Quiet background refresh", "erin", "2026-07-01T12:00:00Z"),
      makePr(
        7,
        "Snapshot store for offline diffs",
        "frank",
        "2026-06-30T16:00:00Z"
      ),
    ],
  },
};

class SceneRecorder {
  private readonly dir: string;
  private readonly frames: { file: string; seconds: number }[] = [];
  private posterFile: string | null = null;

  constructor(scene: string) {
    this.dir = join(OUT_ROOT, scene);
    mkdirSync(this.dir, { recursive: true });
  }

  async hold(page: Page, seconds: number) {
    const file = `f${String(this.frames.length + 1).padStart(4, "0")}.png`;
    await page.screenshot({ path: join(this.dir, file) });
    this.frames.push({ file, seconds });
  }

  markPoster() {
    this.posterFile = this.frames.at(-1)?.file ?? null;
  }

  finish() {
    const last = this.frames.at(-1);
    if (!(last && this.posterFile)) {
      throw new Error("scene captured no frames or marked no poster");
    }
    const lines = ["ffconcat version 1.0"];
    for (const frame of this.frames) {
      lines.push(
        `file '${frame.file}'`,
        `duration ${frame.seconds.toFixed(2)}`
      );
    }
    lines.push(`file '${last.file}'`, "");
    writeFileSync(join(this.dir, "scene.ffconcat"), lines.join("\n"));
    copyFileSync(join(this.dir, this.posterFile), join(this.dir, "poster.png"));
  }
}

/**
 * Screenshots race CSS transitions: pressing a key and capturing immediately
 * catches animated surfaces (the submit-review dialog) mid-fade, and that
 * ghost frame then holds on screen for its full declared duration. Waiting
 * on every running animation's `finished` promise pins the frame to the
 * settled state.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) =>
        animation.finished.catch(() => {
          /* ignore */
        })
      )
    )
  );
}

async function typeInto(page: Page, rec: SceneRecorder, text: string) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await rec.hold(page, TYPING_SECONDS);
  }
}

async function dblclickToken(page: Page, rowText: string, token: string) {
  const box = await page.evaluate(
    ({ needleRow, needleToken }) => {
      for (const code of document.querySelectorAll(".qf-code")) {
        const row = code.closest(".qf-row");
        if (!row?.textContent?.includes(needleRow)) {
          continue;
        }
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const i = node.data.indexOf(needleToken);
          if (i === -1) {
            continue;
          }
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + needleToken.length);
          const r = range.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    },
    { needleRow: rowText, needleToken: token }
  );
  if (!box) {
    throw new Error(`token "${token}" not found in row "${rowText}"`);
  }
  await page.mouse.dblclick(box.x, box.y);
}

async function openFirstListedPr(page: Page) {
  await page.getByRole("option").first().waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".qf-row").first().waitFor();
}

test("loop: triage the inbox, review, mark viewed, submit", async ({
  page,
}) => {
  const rec = new SceneRecorder("loop");
  await setupApp(page, { inbox: CAPTURE_INBOX });
  await page.getByRole("option").first().waitFor();

  await rec.hold(page, 1.4);
  for (const seconds of [0.55, 0.75]) {
    await page.keyboard.press("j");
    await rec.hold(page, seconds);
  }
  await page.keyboard.press("Enter");
  await page.locator(".qf-row").first().waitFor();
  await rec.hold(page, 1.3);
  rec.markPoster();

  for (const _step of [0, 1, 2]) {
    await page.keyboard.press("j");
    await rec.hold(page, 0.35);
  }
  await page.keyboard.press("e");
  await rec.hold(page, 1.0);
  await page.keyboard.press("j");
  await rec.hold(page, 0.35);
  await page.keyboard.press("e");
  await rec.hold(page, 1.0);

  await page.keyboard.press("s");
  const submitReview = page.getByRole("dialog");
  await submitReview.waitFor();
  await settleAnimations(page);
  await rec.hold(page, 2.2);
  await page.keyboard.press("Escape");
  await submitReview.waitFor({ state: "hidden" });
  await settleAnimations(page);
  await rec.hold(page, 0.5);
  await page.keyboard.press("Escape");
  await page.getByRole("option").first().waitFor();
  await rec.hold(page, 1.0);
  rec.finish();
});

test("comments: inline composer, add to review, existing thread", async ({
  page,
}) => {
  const rec = new SceneRecorder("comments");
  await setupApp(page, { inbox: CAPTURE_INBOX });
  await openFirstListedPr(page);

  await rec.hold(page, 1.3);
  await page.keyboard.press("j");
  await rec.hold(page, 0.4);
  await page.keyboard.press("j");
  await rec.hold(page, 0.6);
  await page.keyboard.press("c");
  await rec.hold(page, 0.9);
  await typeInto(page, rec, "nice — matches the cache-first path");
  await rec.hold(page, 0.6);
  await page.keyboard.press("ControlOrMeta+Enter");
  await rec.hold(page, 1.6);
  rec.markPoster();

  await page.keyboard.press("q");
  await rec.hold(page, 2.4);
  rec.finish();
});

test("scan: occurrence marks, find bar, ruler ticks", async ({ page }) => {
  const rec = new SceneRecorder("scan");
  await setupApp(page, { inbox: CAPTURE_INBOX });
  await openFirstListedPr(page);

  await rec.hold(page, 1.0);
  await page.getByText("retry.ts").first().click();
  const anchorRow = page.locator(".qf-row", { hasText: "attempt += 1" });
  await expect(anchorRow).toBeInViewport();
  await rec.hold(page, 1.0);
  await dblclickToken(page, "attempt += 1", "attempt");
  await rec.hold(page, 2.0);
  rec.markPoster();

  await page.keyboard.press("ControlOrMeta+f");
  await rec.hold(page, 0.7);
  await typeInto(page, rec, "delay");
  await rec.hold(page, 1.4);
  for (const seconds of [0.7, 0.7, 1.0]) {
    await page.keyboard.press("Enter");
    await rec.hold(page, seconds);
  }
  await page.keyboard.press("Escape");
  await rec.hold(page, 1.2);
  rec.finish();
});

test.describe("hero poster", () => {
  test.use({ viewport: { height: 900, width: 1600 } });

  test("hero: the demo queue at the embed's size", async ({ page }) => {
    const rec = new SceneRecorder("hero");
    await setupApp(page, { inbox: DEMO_INBOX });
    await page.getByRole("option").first().waitFor();
    await page.keyboard.press("j");

    await rec.hold(page, 1.0);
    rec.markPoster();
    rec.finish();
  });
});
