import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../pages/price.json.ts";

describe("price.json", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("POLAR_ACCESS_TOKEN", "");
    vi.stubEnv("POLAR_PRODUCT_ID", "");
  });

  it("serves the resolved pricing as JSON", async () => {
    const response = await GET();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      price: 59,
      launchPrice: null,
      currency: "USD",
      formattedPrice: "$59",
      formattedLaunchPrice: null,
      source: "fallback",
    });
  });
});
