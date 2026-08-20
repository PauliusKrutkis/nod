import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PRODUCT = {
  prices: [
    {
      type: "one_time",
      amount_type: "fixed",
      price_amount: 5900,
      price_currency: "usd",
    },
  ],
};

async function loadResolver() {
  vi.resetModules();
  return (await import("./pricing.ts")).resolvePricing;
}

function stubPolarEnv() {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_at_test");
  vi.stubEnv("POLAR_PRODUCT_ID", "prod_123");
}

function stubFetch(byPath: Record<string, Response>) {
  const mock = vi.fn((url: unknown) => {
    const match = Object.entries(byPath).find(([path]) =>
      String(url).includes(path)
    );
    if (!match) {
      return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
    }
    return Promise.resolve(match[1]);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("resolvePricing", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("POLAR_ACCESS_TOKEN", "");
    vi.stubEnv("POLAR_PRODUCT_ID", "");
    vi.stubEnv("POLAR_DISCOUNT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves the product price and a fixed-amount discount from Polar", async () => {
    stubPolarEnv();
    vi.stubEnv("POLAR_DISCOUNT_ID", "disc_fixed");
    const mock = stubFetch({
      "/products/prod_123": Response.json(PRODUCT),
      "/discounts/disc_fixed": Response.json({ type: "fixed", amount: 2000 }),
    });

    const resolvePricing = await loadResolver();
    await expect(resolvePricing()).resolves.toEqual({
      price: 59,
      launchPrice: 39,
      currency: "USD",
      formattedPrice: "$59",
      formattedLaunchPrice: "$39",
      source: "polar",
    });
    expect(mock).toHaveBeenCalledWith(
      "https://api.polar.sh/v1/products/prod_123",
      { headers: { authorization: "Bearer polar_at_test" } }
    );
  });

  it("applies a percentage discount in basis points", async () => {
    stubPolarEnv();
    vi.stubEnv("POLAR_DISCOUNT_ID", "disc_pct");
    stubFetch({
      "/products/prod_123": Response.json(PRODUCT),
      "/discounts/disc_pct": Response.json({
        type: "percentage",
        basis_points: 5000,
      }),
    });

    const resolvePricing = await loadResolver();
    const resolved = await resolvePricing();
    expect(resolved.launchPrice).toBe(29.5);
    expect(resolved.formattedLaunchPrice).toBe("$29.50");
    expect(resolved.source).toBe("polar");
  });

  it("drops the launch price when the discount is out of redemptions", async () => {
    stubPolarEnv();
    vi.stubEnv("POLAR_DISCOUNT_ID", "disc_gone");
    stubFetch({
      "/products/prod_123": Response.json(PRODUCT),
      "/discounts/disc_gone": Response.json({
        type: "fixed",
        amount: 2000,
        max_redemptions: 100,
        redemptions_count: 100,
      }),
    });

    const resolvePricing = await loadResolver();
    const resolved = await resolvePricing();
    expect(resolved.launchPrice).toBeNull();
    expect(resolved.formattedLaunchPrice).toBeNull();
    expect(resolved.source).toBe("polar");
  });

  it("falls back to the baked constants when the env is not set", async () => {
    const resolvePricing = await loadResolver();
    await expect(resolvePricing()).resolves.toEqual({
      price: 59,
      launchPrice: 39,
      currency: "USD",
      formattedPrice: "$59",
      formattedLaunchPrice: "$39",
      source: "fallback",
    });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("falls back when Polar answers with an error status", async () => {
    stubPolarEnv();
    stubFetch({
      "/products/prod_123": new Response(null, { status: 500 }),
    });

    const resolvePricing = await loadResolver();
    const resolved = await resolvePricing();
    expect(resolved.source).toBe("fallback");
    expect(resolved.price).toBe(59);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("responded 500")
    );
  });

  it("shares one resolution across callers", async () => {
    stubPolarEnv();
    const mock = stubFetch({
      "/products/prod_123": Response.json(PRODUCT),
    });

    const resolvePricing = await loadResolver();
    await resolvePricing();
    await resolvePricing();
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
