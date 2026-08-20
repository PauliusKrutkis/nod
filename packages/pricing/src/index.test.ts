import { describe, expect, it } from "vitest";
import { formattedLaunchPrice, formattedPrice, pricing } from "./index.ts";

describe("pricing", () => {
  it("formats the standing price the way every surface renders it", () => {
    expect(formattedPrice).toBe("$59");
  });

  it("carries no launch price until a promotion sets one", () => {
    expect(pricing.launchPrice).toBeNull();
    expect(formattedLaunchPrice).toBeNull();
  });

  it("prices in dollars", () => {
    expect(pricing.currency).toBe("USD");
    expect(pricing.price).toBe(59);
  });
});
