/**
 * What jsdom can prove about the gallery: the rail mirrors the catalog, the
 * hash names the visible cell (deep links land, interactions write back),
 * keys drive it without a pointer, and the matrix renders one frame per
 * fixture × theme. What the specimens look like is the screenshot suite's
 * job, not this file's.
 */
import { catalog } from "@nod/ui/catalog";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PENDING } from "./coverage.ts";
import { Gallery } from "./gallery.tsx";
import { captureName, formatGalleryHash, parseGalleryHash } from "./route.ts";

afterEach(cleanup);

beforeEach(() => {
  window.location.hash = "#/gallery";
});

const componentNames = Object.keys(catalog);
const first = componentNames[0];
const firstFixtures = Object.keys(catalog[first].fixtures);
const firstPending = PENDING[0];

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

  it("switches the whole view's theme on t", () => {
    const { container } = render(<Gallery />);
    fireEvent.keyDown(window, { key: "t" });
    expect(window.location.hash).toContain("/day/");
    expect(container.querySelector(".qg-root.qg-stage-day")).not.toBeNull();
  });

  it("renders one frame per fixture × theme in matrix view", () => {
    window.location.hash = `#/gallery/${first}/${firstFixtures[0]}/quiet/420/matrix`;
    const { container } = render(<Gallery />);
    expect(container.querySelectorAll("[data-frame]").length).toBe(
      firstFixtures.length * 2
    );
  });

  it("find selects the highlighted match on Enter", () => {
    render(<Gallery />);
    const find = screen.getByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "badge" } });
    fireEvent.keyDown(find, { key: "Enter" });
    expect(window.location.hash).toContain("/badge/");
    expect((find as HTMLInputElement).value).toBe("");
  });

  it("find walks matches with the arrows", () => {
    render(<Gallery />);
    const find = screen.getByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "b" } });
    fireEvent.keyDown(find, { key: "ArrowDown" });
    fireEvent.keyDown(find, { key: "Enter" });
    expect(window.location.hash).toContain("/button/");
  });

  it("shows the retrofit notice for an uncatalogued component", () => {
    window.location.hash = `#/gallery/${firstPending}`;
    render(<Gallery />);
    expect(screen.getByText("Not catalogued yet")).toBeDefined();
  });

  it("renders dialog entries inline, inside the capture frame", () => {
    window.location.hash = "#/gallery/search-pane/typical/quiet/420/specimen";
    const { container } = render(<Gallery />);
    expect(
      container.querySelector("[data-frame] dialog.qsp-inline")
    ).not.toBeNull();
  });

  it("opens the real modal on demand and closes it on Escape", () => {
    window.location.hash = "#/gallery/search-pane/typical/quiet/420/specimen";
    render(<Gallery />);
    fireEvent.click(screen.getByRole("button", { name: "Open as modal" }));
    expect(screen.getAllByRole("dialog").length).toBe(2);
    const modal = screen
      .getAllByRole("dialog")
      .find((d) => !d.classList.contains("qsp-inline")) as HTMLElement;
    fireEvent(modal, new Event("cancel", { cancelable: true }));
    expect(screen.getAllByRole("dialog").length).toBe(1);
  });

  it("renders the matrix for dialog entries as inline frames", () => {
    window.location.hash = "#/gallery/search-pane/typical/quiet/420/matrix";
    const { container } = render(<Gallery />);
    expect(container.querySelectorAll("[data-frame]").length).toBe(
      Object.keys(catalog["search-pane"].fixtures).length * 2
    );
  });

  it("switches components with Tab and the arrows", () => {
    const [, second, third] = componentNames;
    render(<Gallery />);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(window.location.hash).toContain(`/${second}/`);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(window.location.hash).toContain(`/${third}/`);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(window.location.hash).toContain(`/${second}/`);
  });
});
