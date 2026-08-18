import { describe, expect, it } from "vitest";
import { matchCanned } from "./match-canned.ts";

const SAVED = [
  "nit: naming",
  "Needs a test.",
  "Needs a changelog entry.",
  "Prefer an early return here.",
  "Not blocking, take it or leave it.",
];

describe("matchCanned", () => {
  it("offers nothing until a second character is typed", () => {
    expect(matchCanned("", SAVED)).toEqual([]);
    expect(matchCanned("n", SAVED)).toEqual([]);
    expect(matchCanned("ni", SAVED)).toEqual(["nit: naming"]);
  });

  it("is case-insensitive in both directions", () => {
    expect(matchCanned("NEEDS A T", SAVED)).toEqual(["Needs a test."]);
    expect(matchCanned("prefer", SAVED)).toEqual([
      "Prefer an early return here.",
    ]);
  });

  it("keeps the reviewer's order", () => {
    expect(matchCanned("needs a", SAVED)).toEqual([
      "Needs a test.",
      "Needs a changelog entry.",
    ]);
  });

  it("matches the line's opening, not any word inside it", () => {
    expect(matchCanned("test", SAVED)).toEqual([]);
    expect(matchCanned("early return", SAVED)).toEqual([]);
  });

  it("drops the line once it is typed out in full", () => {
    expect(matchCanned("Needs a test.", SAVED)).toEqual([]);
    expect(matchCanned("needs a test.", SAVED)).toEqual([]);
    expect(matchCanned("Needs a test", SAVED)).toEqual(["Needs a test."]);
  });

  it("ignores the indent a list or quote leaves in front of the caret", () => {
    expect(matchCanned("  ni", SAVED)).toEqual(["nit: naming"]);
  });

  it("stops at six so the panel cannot outgrow the composer", () => {
    const many = Array.from({ length: 20 }, (_, i) => `nit: number ${i}`);
    expect(matchCanned("nit", many)).toHaveLength(6);
  });

  it("survives a saved line that is only whitespace", () => {
    expect(matchCanned("ni", ["   ", "nit: naming"])).toEqual(["nit: naming"]);
  });

  it("treats a query of only spaces as nothing typed", () => {
    expect(matchCanned("    ", SAVED)).toEqual([]);
  });
});
