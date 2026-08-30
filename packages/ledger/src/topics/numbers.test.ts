import { describe, expect, it } from "vitest";
import type { Fact } from "../facts/schema.ts";
import { nextNumber, numbersFrom } from "./numbers.ts";

const claim = (topic: string, number: number, atTime: string): Fact => ({
  actor: { id: "me", kind: "human" },
  atSha: "t1p0000000000000000000000000000000000000",
  atTime,
  body: String(number),
  subject: { id: topic, kind: "topic" },
  v: 1,
  verdict: "numbered",
});

describe("topic numbers", () => {
  it("maps each topic to its claimed number", () => {
    const numbers = numbersFrom([
      claim("ledger", 1, "2026-08-01T00:00:00Z"),
      claim("repo-store", 2, "2026-08-02T00:00:00Z"),
    ]);
    expect(numbers.get("ledger")).toBe(1);
    expect(numbers.get("repo-store")).toBe(2);
    expect(nextNumber([claim("ledger", 1, "2026-08-01T00:00:00Z")])).toBe(2);
  });

  it("resolves a concurrent double-claim: earliest wins, loser unnumbered", () => {
    const numbers = numbersFrom([
      claim("late-topic", 3, "2026-08-05T00:00:00Z"),
      claim("early-topic", 3, "2026-08-04T00:00:00Z"),
    ]);
    expect(numbers.get("early-topic")).toBe(3);
    expect(numbers.has("late-topic")).toBe(false);
    // The lost number is still burned — the next mint never reuses it.
    expect(
      nextNumber([
        claim("late-topic", 3, "2026-08-05T00:00:00Z"),
        claim("early-topic", 3, "2026-08-04T00:00:00Z"),
      ])
    ).toBe(4);
  });

  it("keeps a topic's first number when a newer claim disagrees", () => {
    const numbers = numbersFrom([
      claim("ledger", 5, "2026-08-06T00:00:00Z"),
      claim("ledger", 1, "2026-08-01T00:00:00Z"),
    ]);
    expect(numbers.get("ledger")).toBe(1);
  });

  it("ignores facts that are not well-formed claims", () => {
    const junk: Fact = {
      ...claim("ledger", 1, "2026-08-01T00:00:00Z"),
      body: "not-a-number",
    };
    expect(numbersFrom([junk]).size).toBe(0);
    expect(nextNumber([junk])).toBe(1);
  });
});
