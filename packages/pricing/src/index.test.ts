import { describe, expect, it } from "vitest";
import {
  formatPrice,
  formattedEffectivePrice,
  formattedLaunchPrice,
  formattedPrice,
  pricing,
} from "./index.ts";

describe("pricing", () => {
  it("formats the standing price the way every surface renders it", () => {
    expect(formattedPrice).toBe("$59");
  });

  it("carries no launch price until a promotion sets one", () => {
    expect(pricing.launchPrice).toBeNull();
    expect(formattedLaunchPrice).toBeNull();
  });

  it("quotes the standing price as effective while no promotion runs", () => {
    expect(formattedEffectivePrice).toBe("$59");
  });

  it("formats whole dollars bare and fractional ones with cents", () => {
    expect(formatPrice(39)).toBe("$39");
    expect(formatPrice(29.5)).toBe("$29.50");
  });

  it("prices in dollars", () => {
    expect(pricing.currency).toBe("USD");
    expect(pricing.price).toBe(59);
  });
});
