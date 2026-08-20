/**
 * What jsdom can prove about the gallery: the rail mirrors the catalog, the
 * hash names the visible cell (deep links land, interactions write back),
 * keys drive it without a pointer, the matrix renders one frame per
 * fixture × theme, every frame mounts its specimen on the mat, and the
 * ?capture query flag lands as qg-capture on the root. What the specimens
 * look like is the screenshot suite's job, not this file's. The
 * retrofit-notice test only runs while something is PENDING: an empty
 * ratchet has no uncatalogued specimen to show.
 */
import { catalog } from "@nod/ui/catalog";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING } from "./coverage.ts";
import { Gallery } from "./gallery.tsx";
import { captureName, formatGalleryHash, parseGalleryHash } from "./route.ts";

afterEach(cleanup);
afterEach(() => {
  vi.restoreAllMocks();
});

function trackRailReveals(): string[] {
  const reveals: string[] = [];
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
    this: Element
  ) {
    if (this.classList.contains("qg-rail-item")) {
      reveals.push(this.querySelector(".qg-name")?.textContent ?? "");
    }
  });
  return reveals;
}

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
    const frames = container.querySelectorAll("[data-frame]");
    expect(frames.length).toBe(firstFixtures.length * 2);
    for (const frame of frames) {
      expect(frame.querySelector(":scope > .qg-mat")).not.toBeNull();
    }
  });

  it("mounts the specimen on a mat that is the frame's direct child", () => {
    window.location.hash = "#/gallery/search-pane/typical/quiet/420/specimen";
    const { container } = render(<Gallery />);
    const mat = container.querySelector("[data-frame] > .qg-mat");
    expect(mat).not.toBeNull();
    expect(mat?.querySelector("dialog.qsp-inline")).not.toBeNull();
  });

  it("wears qg-capture only when the query carries the capture flag", () => {
    history.replaceState(null, "", "/?capture#/gallery");
    const { container } = render(<Gallery />);
    expect(container.querySelector(".qg-root.qg-capture")).not.toBeNull();
    cleanup();
    history.replaceState(null, "", "/#/gallery");
    const { container: bare } = render(<Gallery />);
    expect(bare.querySelector(".qg-root.qg-capture")).toBeNull();
  });

  it("marks the mat's corners with four slot ticks outside the specimen", () => {
    render(<Gallery />);
    const frame = document.querySelector("[data-frame]");
    expect(frame?.querySelectorAll(".qg-slot-tick").length).toBe(4);
    expect(document.querySelector(".qg-viewport .qg-slot-tick")).toBeNull();
    expect(document.querySelector(".qg-mat .qg-slot-tick")).toBeNull();
  });

  it("find selects the highlighted match on Enter", () => {
    render(<Gallery />);
    const find = screen.getByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "badge" } });
    fireEvent.keyDown(find, { key: "Enter" });
    expect(window.location.hash).toContain("/badge/");
    expect((find as HTMLInputElement).value).toBe("");
  });

  it("reveals the rail item the keyboard walk lands on", () => {
    const reveals = trackRailReveals();
    render(<Gallery />);
    expect(reveals.at(-1)).toBe(first);
    fireEvent.keyDown(window, { key: "j" });
    expect(reveals.at(-1)).toBe([...componentNames, ...PENDING][1]);
  });

  it("reveals the selection when find's Enter restores the full list", () => {
    const reveals = trackRailReveals();
    render(<Gallery />);
    const find = screen.getByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "badge" } });
    expect(reveals.at(-1)).toBe("badge");
    const before = reveals.length;
    fireEvent.keyDown(find, { key: "Enter" });
    expect(reveals.length).toBeGreaterThan(before);
    expect(reveals.at(-1)).toBe("badge");
  });

  it("find walks matches with the arrows", () => {
    const { container } = render(<Gallery />);
    const find = screen.getByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "b" } });
    const third = container.querySelectorAll(".qg-rail-item .qg-name")[2];
    expect(third).toBeDefined();
    fireEvent.keyDown(find, { key: "ArrowDown" });
    fireEvent.keyDown(find, { key: "ArrowDown" });
    fireEvent.keyDown(find, { key: "Enter" });
    expect(window.location.hash).toContain(`/${third?.textContent}/`);
  });

  describe.runIf(firstPending !== undefined)("with a pending component", () => {
    it("shows the retrofit notice for an uncatalogued component", () => {
      window.location.hash = `#/gallery/${firstPending}`;
      render(<Gallery />);
      expect(screen.getByText("Not catalogued yet")).toBeDefined();
    });
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

  it("cycles fixtures backwards on shift+f", () => {
    render(<Gallery />);
    fireEvent.keyDown(window, { key: "F", shiftKey: true });
    expect(window.location.hash).toContain(`/${firstFixtures.at(-1)}/`);
  });

  it("toggles the x-ray outline on x, never on mount", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelector(".qg-xray")).toBeNull();
    fireEvent.keyDown(window, { key: "x" });
    expect(container.querySelector(".qg-xray")).not.toBeNull();
    fireEvent.keyDown(window, { key: "x" });
    expect(container.querySelector(".qg-xray")).toBeNull();
  });

  it("x-ray outlines the mat's child, never the corner ticks", () => {
    const { container } = render(<Gallery />);
    fireEvent.keyDown(window, { key: "x" });
    const stage = container.querySelector(".qg-xray");
    expect(stage).not.toBeNull();
    expect(stage?.querySelectorAll(".qg-mat > *").length).toBe(1);
    expect(stage?.querySelector(".qg-mat .qg-tick")).toBeNull();
  });

  it("blurs specimen focus unless clicked into, Escape hands it back", () => {
    window.location.hash = "#/gallery/search-pane/typical/quiet/420/specimen";
    const { container } = render(<Gallery />);
    const input = container.querySelector(
      "[data-frame] input"
    ) as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(document.body);
    fireEvent.pointerDown(input);
    input.focus();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(document.body);
  });

  it("never navigates on keys typed into a textarea or editable", () => {
    render(<Gallery />);
    const before = window.location.hash;
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    fireEvent.keyDown(textarea, { key: "f" });
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.appendChild(editable);
    fireEvent.keyDown(editable, { key: "f" });
    expect(window.location.hash).toBe(before);
    textarea.remove();
    editable.remove();
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
