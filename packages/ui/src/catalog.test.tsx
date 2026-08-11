/**
 * Derived from the catalog, never written per component: every fixture of
 * every entry gets the same universal assertions, so adding a fixture adds
 * test cases with no new test code. What this layer proves is logic under
 * hostile data — no throw, emptiness only where the fixture declares it,
 * markup-looking strings staying text. Layout (truncation, overflow, z-order)
 * is invisible to jsdom and belongs to the webkit screenshot suite over the
 * gallery, not here.
 *
 * The coverage block is the enforcement half of the package's rule 2: with
 * no barrel, the .tsx files ARE the export surface (each is a subpath in
 * package.json), so any component file missing from the catalog fails the
 * suite by name — catalog keys equal file basenames by convention.
 */
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { catalog } from "./catalog.ts";

afterEach(cleanup);

const componentFiles = Object.keys(import.meta.glob("./*.tsx"))
  .filter((path) => !path.endsWith(".test.tsx"))
  .map((path) => path.replace("./", "").replace(".tsx", ""));

describe("catalog coverage", () => {
  it.each(componentFiles)(
    "component file %s is catalogued with fixtures",
    (name) => {
      const entry = catalog[name];
      expect(entry).toBeDefined();
      expect(Object.keys(entry.fixtures).length).toBeGreaterThan(0);
    }
  );
});

const cases = Object.entries(catalog).flatMap(([componentName, entry]) =>
  Object.entries(entry.fixtures).map(([fixtureName, fixture]) => ({
    component: entry.component,
    componentName,
    fixture,
    fixtureName,
  }))
);

describe("every fixture renders", () => {
  it.each(cases)("$componentName/$fixtureName", (c) => {
    const { container } = render(createElement(c.component, c.fixture.props));
    if (c.fixture.rendersNothing) {
      expect(container.innerHTML).toBe("");
    } else {
      expect(container.innerHTML).not.toBe("");
    }
  });
});

describe("markup-looking payloads stay text", () => {
  const markupCases = cases.filter(({ fixture }) =>
    JSON.stringify(fixture.props).includes("<img")
  );

  it.each(markupCases)("$componentName/$fixtureName", (c) => {
    const { container } = render(createElement(c.component, c.fixture.props));
    expect(container.querySelector("img[src='x']")).toBeNull();
  });
});
