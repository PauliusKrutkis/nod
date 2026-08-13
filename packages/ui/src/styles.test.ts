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
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url);
const OUTLINE = /^\s*outline(-[a-z]+)?\s*:/;

function stylesheets(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
    (name) => name.endsWith(".css")
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
