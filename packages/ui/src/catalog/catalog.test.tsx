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
import { isSequence, sequenceElement } from "../fixtures/fixtures.ts";
import { catalogManifest } from "../manifest/manifest.ts";
import { catalog } from "./catalog.ts";

afterEach(cleanup);

describe("manifest parity", () => {
  it("lists exactly the catalogued components", () => {
    expect(Object.keys(catalogManifest).sort()).toEqual(
      Object.keys(catalog).sort()
    );
  });

  it.each(Object.keys(catalog))("agrees on %s", (name) => {
    expect(catalogManifest[name].fixtures.sort()).toEqual(
      Object.keys(catalog[name].fixtures).sort()
    );
    expect(Boolean(catalogManifest[name].dialog)).toBe(
      Boolean(catalog[name].dialog)
    );
    expect(Boolean(catalogManifest[name].view)).toBe(
      Boolean(catalog[name].view)
    );
  });
});

const componentFiles = Object.keys(import.meta.glob("../*/*.tsx"))
  .filter((path) => !path.endsWith(".test.tsx"))
  .map((path) => path.split("/")[1] ?? "");

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

const elementOf = (c: (typeof cases)[number]) =>
  isSequence(c.fixture)
    ? sequenceElement(c.fixture)
    : createElement(c.component, c.fixture.props);

describe("every fixture renders", () => {
  it.each(cases)("$componentName/$fixtureName", (c) => {
    const { container } = render(elementOf(c));
    if (!isSequence(c.fixture) && c.fixture.rendersNothing) {
      expect(container.innerHTML).toBe("");
    } else {
      expect(container.innerHTML).not.toBe("");
    }
  });
});

describe("markup-looking payloads stay text", () => {
  const markupCases = cases.filter(({ fixture }) =>
    JSON.stringify(fixture).includes("<img")
  );

  it.each(markupCases)("$componentName/$fixtureName", (c) => {
    const { container } = render(elementOf(c));
    expect(container.querySelector("img[src='x']")).toBeNull();
  });
});
