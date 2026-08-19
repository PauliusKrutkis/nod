import { describe, expect, it } from "vitest";
import { type HelpSection, searchHelp } from "./help-overlay-search.ts";

const sections: HelpSection[] = [
  {
    bindings: [
      { combo: "mod+k", description: "Command palette" },
      { combo: "mod+shift+a", description: "Switch account" },
    ],
    note: "Always available",
    scope: "global",
  },
  {
    bindings: [
      { combo: "j", description: "Next pull request" },
      { combo: "e", description: "Archive" },
    ],
    note: "On the home list",
    scope: "inbox",
  },
  {
    active: true,
    bindings: [
      { combo: "n", description: "Next changed file" },
      { combo: "mod+enter", description: "Submit the review" },
    ],
    note: "When reading a diff",
    scope: "review",
  },
];

describe("searchHelp", () => {
  it("empty and whitespace queries return everything in registry order", () => {
    for (const q of ["", "   "]) {
      const r = searchHelp(sections, q);
      expect(r.sections.map((s) => s.scope)).toEqual([
        "global",
        "inbox",
        "review",
      ]);
      expect(r.shown).toBe(6);
      expect(r.total).toBe(6);
    }
  });

  it("matches action labels and reports highlight indices", () => {
    const r = searchHelp(sections, "archive");
    expect(r.shown).toBe(1);
    const [section] = r.sections;
    expect(section.scope).toBe("inbox");
    expect(section.bindings[0].description).toBe("Archive");
    expect(section.bindings[0].indices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("matches the raw combo text so key names are searchable", () => {
    const r = searchHelp(sections, "shift");
    expect(
      r.sections.some((s) => s.bindings.some((b) => b.combo === "mod+shift+a"))
    ).toBe(true);
  });

  it("a scope-name match keeps the whole section", () => {
    const r = searchHelp(sections, "inbox");
    const inbox = r.sections.find((s) => s.scope === "inbox");
    expect(inbox?.bindings).toHaveLength(2);
  });

  it("floats the best-matching section to the top", () => {
    const r = searchHelp(sections, "submit");
    expect(r.sections[0].scope).toBe("review");
  });

  it("drops sections with no hits and counts what is shown", () => {
    const r = searchHelp(sections, "palette");
    expect(r.sections.map((s) => s.scope)).toEqual(["global"]);
    expect(r.shown).toBe(1);
    expect(r.total).toBe(6);
  });

  it("returns empty sections when nothing matches", () => {
    const r = searchHelp(sections, "zzzz");
    expect(r.sections).toEqual([]);
    expect(r.shown).toBe(0);
    expect(r.total).toBe(6);
  });

  it("ignores case, so a shouted query still finds its row", () => {
    const r = searchHelp(sections, "PALETTE");
    expect(r.sections.map((s) => s.scope)).toEqual(["global"]);
    expect(r.shown).toBe(1);
  });

  it("a scope-note match keeps the whole section", () => {
    const r = searchHelp(sections, "diff");
    expect(r.sections.map((s) => s.scope)).toEqual(["review"]);
    expect(r.sections[0].bindings).toHaveLength(2);
  });

  it("a combo-only hit carries no highlight indices", () => {
    const r = searchHelp(sections, "shift");
    const row = r.sections
      .flatMap((s) => s.bindings)
      .find((b) => b.combo === "mod+shift+a");
    expect(row?.indices).toBeUndefined();
  });

  it("keeps the active flag on a filtered section", () => {
    const r = searchHelp(sections, "submit");
    expect(r.sections[0].active).toBe(true);
  });

  it("keeps rows in registry order inside a matched section", () => {
    const r = searchHelp(sections, "next");
    for (const s of r.sections) {
      const originals = sections.find((o) => o.scope === s.scope);
      const order = s.bindings.map((b) => b.combo);
      const expected = originals?.bindings
        .map((b) => b.combo)
        .filter((c) => order.includes(c));
      expect(order).toEqual(expected);
    }
  });
});
