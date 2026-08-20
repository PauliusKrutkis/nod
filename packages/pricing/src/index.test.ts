import { describe, expect, it } from "vitest";
import {
  formattedEffectivePrice,
  formattedLaunchPrice,
  formattedPrice,
  pricing,
} from "./index.ts";

describe("pricing", () => {
  it("formats the standing price the way every surface renders it", () => {
    expect(formattedPrice).toBe("$59");
  });

  it("carries the launch promotion, and the effective price follows it", () => {
    expect(pricing.launchPrice).toBe(39);
    expect(formattedLaunchPrice).toBe("$39");
    expect(formattedEffectivePrice).toBe("$39");
  });

  it("prices in dollars", () => {
    expect(pricing.currency).toBe("USD");
    expect(pricing.price).toBe(59);
  });
});
