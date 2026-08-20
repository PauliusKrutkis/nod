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

  it("formats the launch price exactly when a promotion sets one", () => {
    expect(formattedLaunchPrice).toBe(
      pricing.launchPrice === null ? null : formatPrice(pricing.launchPrice)
    );
  });

  it("quotes the launch price as effective when set, standing otherwise", () => {
    expect(formattedEffectivePrice).toBe(
      formattedLaunchPrice ?? formattedPrice
    );
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
