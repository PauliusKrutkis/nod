import { describe, expect, it } from "vitest";
import { canonicalFactJson, type Fact, factId, parseFact } from "./schema.ts";

const fact: Fact = {
  v: 1,
  actor: { kind: "human", id: "paulius" },
  subject: { kind: "anchor", id: "a1" },
  verdict: "reviewed",
  atSha: "0123456789012345678901234567890123456789",
  atTime: "2026-08-13T00:00:00Z",
};

describe("factId", () => {
  it("is independent of key order", () => {
    const shuffled = {
      atTime: fact.atTime,
      verdict: fact.verdict,
      v: fact.v,
      subject: { id: "a1", kind: "anchor" },
      atSha: fact.atSha,
      actor: { id: "paulius", kind: "human" },
    } as Fact;
    expect(factId(shuffled)).toBe(factId(fact));
  });

  it("changes when content changes", () => {
    expect(factId({ ...fact, verdict: "flagged" })).not.toBe(factId(fact));
  });

  it("ignores explicit undefined optionals", () => {
    expect(factId({ ...fact, body: undefined })).toBe(factId(fact));
  });
});

describe("parseFact", () => {
  it("round-trips the canonical serialization", () => {
    expect(parseFact(canonicalFactJson(fact))).toEqual(fact);
  });

  it("rejects wrong shapes", () => {
    expect(() => parseFact("{}")).toThrow("not a valid ledger fact");
    expect(() =>
      parseFact(JSON.stringify({ ...fact, verdict: "loved" }))
    ).toThrow("not a valid ledger fact");
    expect(() =>
      parseFact(JSON.stringify({ ...fact, actor: { kind: "human" } }))
    ).toThrow("not a valid ledger fact");
  });
});
