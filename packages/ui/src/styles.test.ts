// @vitest-environment node

/**
 * The browser's focus outline is removed once, in the system layer, and every
 * component in the package inherits that. A component that ships its own
 * `outline: none` is harmless the day it lands and wrong the day the reset
 * changes — two owners for one decision, and the component's copy is the one
 * nobody remembers to update. A component that ships an `outline` it paints is
 * worse: it puts a second focus cursor on a screen whose affordance is the
 * armed state or the .q-focus ring. So the only outline declaration allowed in
 * the package is the reset itself.
 *
 * The second rule here is about scaled images. A `max-height` on an `<img>`
 * only clamps the height, so an element carrying a real width — a `width`
 * attribute, or a `width` declaration — keeps that width and renders the
 * picture flattened. Auto on both axes is what makes the limits resolve
 * against the image's own ratio, and the pairing is easy to lose in a diff
 * that only touches the limit, so it is asserted rather than remembered.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url);
const OUTLINE = /^\s*outline(-[a-z]+)?\s*:/;
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;
const IMG_SELECTOR = /(^|[\s>+~])img\b/;
const MAX_HEIGHT = /(^|[\s;])max-height\s*:/;
const AUTO_HEIGHT = /(^|[\s;])height\s*:\s*auto\b/;
const AUTO_WIDTH = /(^|[\s;])width\s*:\s*auto\b/;

function stylesheets(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
    (name) => name.endsWith(".css")
  );
}

function cappedImageRules(css: string): { body: string; selector: string }[] {
  return [...css.matchAll(CSS_RULE)]
    .map(([, selector, body]) => ({
      body: body ?? "",
      selector: (selector ?? "").trim(),
    }))
    .filter(
      (rule) => IMG_SELECTOR.test(rule.selector) && MAX_HEIGHT.test(rule.body)
    );
}

describe("the outline reset", () => {
  it("is the package's only outline declaration", () => {
    const offenders = stylesheets()
      .filter((name) => name !== "styles.css")
      .flatMap((name) =>
        readFileSync(new URL(name, SRC), "utf8")
          .split("\n")
          .map((line, index) => ({
            line: line.trim(),
            name,
            number: index + 1,
          }))
          .filter(({ line }) => OUTLINE.test(line))
      );
    expect(offenders).toEqual([]);
  });

  it("sits in the system layer, unscoped", () => {
    const css = readFileSync(new URL("styles.css", SRC), "utf8");
    expect(css).toContain(":focus,\n:focus-visible {\n  outline: none;\n}");
  });
});

describe("an image bounded by a max-height", () => {
  it("is auto on both axes", () => {
    const offenders = stylesheets().flatMap((name) =>
      cappedImageRules(readFileSync(new URL(name, SRC), "utf8"))
        .filter(
          (rule) => !(AUTO_HEIGHT.test(rule.body) && AUTO_WIDTH.test(rule.body))
        )
        .map((rule) => ({ name, selector: rule.selector }))
    );
    expect(offenders).toEqual([]);
  });
});
