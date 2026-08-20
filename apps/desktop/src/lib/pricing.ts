/**
 * The price the purchase and update prompts quote. The site's /price.json is
 * the display truth (it resolves Polar at build time), so a launch price can
 * reach installed builds without a release; the baked "$59" is what renders
 * while the fetch is in flight, when it fails, and in any build that can't
 * reach the site. The queryFn folds errors into null rather than letting
 * react-query retry-storm an offline machine, and one day of staleness is
 * fine for a number that changes a few times a year. The prompt cards take
 * the price as a plain prop, so the fallback paints immediately and the
 * fetched value swaps in whenever it lands.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";
import { queryKeys } from "./query-client.ts";

const FALLBACK_PRICE = "$59";
const STALE_MS = 24 * 60 * 60 * 1000;

function formatPrice(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function useEffectivePrice(): string {
  const { data } = useQuery({
    queryFn: () => api.fetchSitePricing().catch(() => null),
    queryKey: queryKeys.sitePricing,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_MS,
  });
  if (!data) {
    return FALLBACK_PRICE;
  }
  return formatPrice(data.launchPrice ?? data.price);
}
