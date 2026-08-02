import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";

/**
 * Quiet trial indicator in the alert stack. Licensed builds render nothing;
 * a running trial shows the days left and an ended trial says so. Deliberately
 * inert — the purchase call to action is its own surface, this is just the
 * ambient countdown. The state is a cheap local read (config-dir file +
 * signature check) but it is clock-derived, so an app left running overnight
 * re-derives it hourly rather than showing yesterday's count all session.
 */

const RECHECK_MS = 60 * 60 * 1000;

export function LicenseBadge() {
  const { data: license } = useQuery({
    queryFn: () => api.getLicenseState(),
    queryKey: ["license-state"],
    refetchInterval: RECHECK_MS,
    staleTime: RECHECK_MS,
  });

  if (!license || license.status === "licensed") {
    return null;
  }

  const label =
    license.status === "trial"
      ? `Trial — ${license.daysLeft} ${license.daysLeft === 1 ? "day" : "days"} left`
      : "Trial ended";

  return (
    <div className="qb-trial" role="status">
      {label}
    </div>
  );
}
