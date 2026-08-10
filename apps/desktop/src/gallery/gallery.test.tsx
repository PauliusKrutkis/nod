/**
 * What jsdom can prove about the gallery: the rail mirrors the catalog, the
 * hash names the visible cell (deep links land, interactions write back),
 * keys drive it without a pointer, and the matrix renders one frame per
 * fixture × theme. What the specimens look like is the screenshot suite's
 * job, not this file's.
 */
import { catalog } from "@nod/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gallery } from "./gallery.tsx";
import { captureName, formatGalleryHash, parseGalleryHash } from "./route.ts";

afterEach(cleanup);

beforeEach(() => {
  window.location.hash = "#/gallery";
});

const componentNames = Object.keys(catalog);
const first = componentNames[0];
const firstFixtures = Object.keys(catalog[first].fixtures);

describe("route", () => {
  it("round-trips every catalog cell through the hash", () => {
    for (const component of componentNames) {
      for (const fixture of Object.keys(catalog[component].fixtures)) {
        const route = {
          component,
          fixture,
          mode: "specimen" as const,
          theme: "day" as const,
          width: 280 as const,
        };
        expect(
          parseGalleryHash(formatGalleryHash(route), componentNames, (c) =>
            Object.keys(catalog[c]?.fixtures ?? {})
          )
        ).toEqual(route);
      }
    }
  });

  it("falls back field-by-field on a stale link", () => {
    const route = parseGalleryHash(
      `#/gallery/${first}/renamed-fixture/neon/999/carousel`,
      componentNames,
      (c) => Object.keys(catalog[c]?.fixtures ?? {})
    );
    expect(route).toEqual({
      component: first,
      fixture: firstFixtures[0],
      mode: "specimen",
      theme: "quiet",
      width: 420,
    });
  });
});

describe("gallery", () => {
  it("lists every catalogued component in the rail", () => {
    render(<Gallery />);
    for (const name of componentNames) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${name}`) })
      ).toBeDefined();
    }
  });

  it("lands on a deep link and prints its capture name", () => {
    window.location.hash = `#/gallery/${first}/${firstFixtures[1]}/day/280/specimen`;
    render(<Gallery />);
    expect(
      screen.getByText(
        captureName({
          component: first,
          fixture: firstFixtures[1],
          mode: "specimen",
          theme: "day",
          width: 280,
        })
      )
    ).toBeDefined();
  });

  it("cycles fixtures on f and writes the hash back", () => {
    render(<Gallery />);
    fireEvent.keyDown(window, { key: "f" });
    expect(window.location.hash).toContain(`/${firstFixtures[1]}/`);
  });

  it("switches theme on t", () => {
    render(<Gallery />);
    fireEvent.keyDown(window, { key: "t" });
    expect(window.location.hash).toContain("/day/");
  });

  it("renders one frame per fixture × theme in matrix view", () => {
    window.location.hash = `#/gallery/${first}/${firstFixtures[0]}/quiet/420/matrix`;
    const { container } = render(<Gallery />);
    expect(container.querySelectorAll("[data-frame]").length).toBe(
      firstFixtures.length * 2
    );
  });

  it("shows the retrofit notice for an uncatalogued component", () => {
    window.location.hash = "#/gallery/ci-pill";
    render(<Gallery />);
    expect(screen.getByText("Not catalogued yet")).toBeDefined();
  });
});
