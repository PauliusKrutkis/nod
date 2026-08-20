import { describe, expect, it } from "vitest";
import { GET } from "../pages/price.json.ts";

describe("price.json", () => {
  it("serves the shared pricing source as JSON", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      price: 59,
      launchPrice: 39,
      currency: "USD",
    });
  });
});
