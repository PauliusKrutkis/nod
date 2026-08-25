import { describe, expect, it } from "vitest";
import type { Fact } from "../facts/schema.ts";
import { assignmentsFrom } from "./assign.ts";

const fact = (
  verdict: "assigned" | "corrected",
  sha: string,
  topic: string,
  atTime: string
): Fact => ({
  actor:
    verdict === "assigned"
      ? { id: "agent:test", kind: "agent" }
      : { id: "tester", kind: "human" },
  atSha: "f".repeat(40),
  atTime,
  body: topic,
  subject: { id: sha, kind: "sha" },
  v: 1,
  verdict,
});

const SHA = "a".repeat(40);

describe("assignmentsFrom", () => {
  it("honors an agent proposal when nothing else names the sha", () => {
    const map = assignmentsFrom([
      fact("assigned", SHA, "checkout", "2026-08-25T10:00:00Z"),
    ]);
    expect(map.get(SHA)).toEqual({ corrected: false, topic: "checkout" });
  });

  it("lets a human correction beat a newer agent proposal", () => {
    const map = assignmentsFrom([
      fact("corrected", SHA, "billing", "2026-08-25T10:00:00Z"),
      fact("assigned", SHA, "checkout", "2026-08-25T11:00:00Z"),
    ]);
    expect(map.get(SHA)).toEqual({ corrected: true, topic: "billing" });
  });

  it("takes the newest fact within a class", () => {
    const map = assignmentsFrom([
      fact("corrected", SHA, "billing", "2026-08-25T10:00:00Z"),
      fact("corrected", SHA, "payments", "2026-08-25T12:00:00Z"),
    ]);
    expect(map.get(SHA)).toEqual({ corrected: true, topic: "payments" });
  });

  it("ignores facts that are not sha assignments", () => {
    const stray: Fact = {
      actor: { id: "tester", kind: "human" },
      atSha: "f".repeat(40),
      atTime: "2026-08-25T10:00:00Z",
      subject: { id: "checkout", kind: "topic" },
      v: 1,
      verdict: "approved",
    };
    const empty: Fact = {
      ...fact("assigned", SHA, "x", "2026-08-25T10:00:00Z"),
      body: "",
    };
    expect(assignmentsFrom([stray, empty]).size).toBe(0);
  });
});
