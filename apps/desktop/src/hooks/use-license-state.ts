import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { queryKeys } from "../lib/query-client.ts";
import type { LicenseState } from "../types.ts";

/**
 * The one license-state subscription both the trial badge and the purchase
 * prompt share — a single key with a single cadence, so neither surface can
 * silently drift the other's refetch behavior. The state is a cheap local
 * read (config-dir file + signature check) but it is clock-derived, so an
 * app left running overnight re-derives it hourly rather than showing
 * yesterday's count all session. `setLicenseState` is for the activation
 * flow, whose backend response is already the authoritative persisted state
 * — writing it into the cache beats refetching the same file.
 */

const RECHECK_MS = 60 * 60 * 1000;

export function useLicenseState(): LicenseState | undefined {
  const { data } = useQuery({
    queryFn: () => api.getLicenseState(),
    queryKey: queryKeys.licenseState,
    refetchInterval: RECHECK_MS,
    staleTime: RECHECK_MS,
  });
  return data;
}

export function useSetLicenseState(): (state: LicenseState) => void {
  const queryClient = useQueryClient();
  return (state) => queryClient.setQueryData(queryKeys.licenseState, state);
}
