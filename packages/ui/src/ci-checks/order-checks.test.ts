import { describe, expect, it } from "vitest";
import type { CiCheck } from "../ci-pill/ci-pill.tsx";
import { checksVerdict, orderChecks } from "./order-checks.ts";

const check = (
  name: string,
  state: CiCheck["state"],
  url = `https://x/${name}`
): CiCheck => ({ name, state, url });

describe("orderChecks", () => {
  it("puts failures first, then running, then passes", () => {
    const ordered = orderChecks([
      check("lint", "success"),
      check("e2e", "failure"),
      check("shots", "pending"),
      check("deploy", "failure"),
    ]);

    expect(ordered.map((row) => row.check.name)).toEqual([
      "e2e",
      "deploy",
      "shots",
      "lint",
    ]);
  });

  it("keeps the host's order within one state", () => {
    const ordered = orderChecks([
      check("b", "failure"),
      check("a", "failure"),
      check("c", "failure"),
    ]);

    expect(ordered.map((row) => row.check.name)).toEqual(["b", "a", "c"]);
  });

  it("carries the host index so a re-sorted row keeps its key", () => {
    const ordered = orderChecks([
      check("lint", "success"),
      check("e2e", "failure"),
    ]);

    expect(ordered.map((row) => row.hostOrder)).toEqual([1, 0]);
  });

  it("falls back to the checks page for a check with no url of its own", () => {
    const ordered = orderChecks(
      [check("lint", "failure", "")],
      "https://x/pull/1/checks"
    );

    expect(ordered[0].url).toBe("https://x/pull/1/checks");
  });

  it("prefers the check's own url over the fallback", () => {
    const ordered = orderChecks(
      [check("lint", "failure", "https://x/lint")],
      "https://x/pull/1/checks"
    );

    expect(ordered[0].url).toBe("https://x/lint");
  });

  it("leaves the url empty when neither the check nor the host has one", () => {
    expect(orderChecks([check("lint", "failure", "")])[0].url).toBe("");
  });

  it("does not mutate the array it was given", () => {
    const checks = [check("lint", "success"), check("e2e", "failure")];
    orderChecks(checks);

    expect(checks.map((row) => row.name)).toEqual(["lint", "e2e"]);
  });

  it("has nothing to order for an absent or empty list", () => {
    expect(orderChecks(undefined)).toEqual([]);
    expect(orderChecks([])).toEqual([]);
  });
});

describe("checksVerdict", () => {
  it("reads failure when anything failed", () => {
    expect(
      checksVerdict([
        check("lint", "success"),
        check("shots", "pending"),
        check("e2e", "failure"),
      ])
    ).toBe("failure");
  });

  it("reads running when nothing failed but something is still going", () => {
    expect(
      checksVerdict([check("lint", "success"), check("shots", "pending")])
    ).toBe("pending");
  });

  it("reads passing only when every check passed", () => {
    expect(
      checksVerdict([check("lint", "success"), check("deploy", "success")])
    ).toBe("success");
  });

  it("has no verdict without rows", () => {
    expect(checksVerdict(undefined)).toBeNull();
    expect(checksVerdict([])).toBeNull();
  });
});
