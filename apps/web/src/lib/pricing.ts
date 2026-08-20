/**
 * Resolves the display price from Polar at build time, so the site shows
 * what the checkout will actually charge instead of a constant that can
 * drift from it. POLAR_ACCESS_TOKEN and POLAR_PRODUCT_ID are Cloudflare
 * Pages build secrets (absent locally); POLAR_DISCOUNT_ID is set only while
 * a launch promotion runs. Any gap — missing env, non-200, thrown fetch, a
 * response shaped differently than expected — falls back to the baked
 * @nod/pricing constants with one build-log warning, because a stale price
 * page beats a failed deploy.
 *
 * A discount that exists but is not currently redeemable (not started,
 * ended, or out of redemptions) is not an error: the standing price is
 * still live, only launchPrice collapses to null. The resolution is
 * memoized at module level so the three pages and /price.json share one
 * pair of Polar requests per build.
 */

import {
  formatPrice,
  formattedLaunchPrice,
  formattedPrice,
  pricing,
} from "@nod/pricing";

const POLAR_API = "https://api.polar.sh/v1";

interface ResolvedPricing {
  price: number;
  launchPrice: number | null;
  currency: string;
  formattedPrice: string;
  formattedLaunchPrice: string | null;
  source: "polar" | "fallback";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEnv(name: string): string | undefined {
  const value: unknown = import.meta.env[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

async function polarJson(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${POLAR_API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} responded ${response.status}`);
  }
  return response.json();
}

function oneTimeCents(product: unknown): { cents: number; currency: string } {
  if (!(isRecord(product) && Array.isArray(product.prices))) {
    throw new Error("product carried no prices array");
  }
  for (const price of product.prices) {
    if (
      isRecord(price) &&
      price.amount_type === "fixed" &&
      typeof price.price_amount === "number"
    ) {
      const currency =
        typeof price.price_currency === "string"
          ? price.price_currency.toUpperCase()
          : pricing.currency;
      return { cents: price.price_amount, currency };
    }
  }
  throw new Error("product carried no fixed-amount price");
}

function discountedCents(
  discount: unknown,
  cents: number,
  now: Date
): number | null {
  if (!isRecord(discount)) {
    throw new Error("discount response is not an object");
  }
  if (
    typeof discount.starts_at === "string" &&
    new Date(discount.starts_at) > now
  ) {
    return null;
  }
  if (
    typeof discount.ends_at === "string" &&
    new Date(discount.ends_at) < now
  ) {
    return null;
  }
  if (
    typeof discount.max_redemptions === "number" &&
    typeof discount.redemptions_count === "number" &&
    discount.redemptions_count >= discount.max_redemptions
  ) {
    return null;
  }
  if (discount.type === "fixed" && typeof discount.amount === "number") {
    return Math.max(cents - discount.amount, 0);
  }
  if (
    discount.type === "percentage" &&
    typeof discount.basis_points === "number"
  ) {
    return Math.round(cents * (1 - discount.basis_points / 10_000));
  }
  throw new Error("discount is neither fixed-amount nor percentage");
}

async function resolveFromPolar(
  token: string,
  productId: string,
  discountId: string | undefined
): Promise<ResolvedPricing> {
  const { cents, currency } = oneTimeCents(
    await polarJson(`/products/${productId}`, token)
  );
  const price = cents / 100;
  let launchPrice: number | null = null;
  if (discountId) {
    const discounted = discountedCents(
      await polarJson(`/discounts/${discountId}`, token),
      cents,
      new Date()
    );
    if (discounted !== null && discounted < cents) {
      launchPrice = discounted / 100;
    }
  }
  return {
    price,
    launchPrice,
    currency,
    formattedPrice: formatPrice(price),
    formattedLaunchPrice:
      launchPrice === null ? null : formatPrice(launchPrice),
    source: "polar",
  };
}

function fallback(reason: string): ResolvedPricing {
  console.warn(`pricing: using baked @nod/pricing constants (${reason})`);
  return {
    price: pricing.price,
    launchPrice: pricing.launchPrice,
    currency: pricing.currency,
    formattedPrice,
    formattedLaunchPrice,
    source: "fallback",
  };
}

async function resolve(): Promise<ResolvedPricing> {
  const token = readEnv("POLAR_ACCESS_TOKEN");
  const productId = readEnv("POLAR_PRODUCT_ID");
  if (!(token && productId)) {
    return fallback("POLAR_ACCESS_TOKEN or POLAR_PRODUCT_ID is not set");
  }
  try {
    return await resolveFromPolar(
      token,
      productId,
      readEnv("POLAR_DISCOUNT_ID")
    );
  } catch (error) {
    return fallback(String(error));
  }
}

let resolved: Promise<ResolvedPricing> | null = null;

export function resolvePricing(): Promise<ResolvedPricing> {
  resolved ??= resolve();
  return resolved;
}
