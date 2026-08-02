import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";

/**
 * Quiet trial indicator in the alert stack. Licensed builds render nothing;
 * a running trial shows the days left and an ended trial says so. Deliberately
 * inert — the purchase call to action is its own surface, this is just the
 * ambient countdown. The state is offline (a config-dir read + signature
 * check), so one fetch per session is enough.
 */

export function LicenseBadge() {
  const { data: license } = useQuery({
    queryFn: () => api.getLicenseState().catch(() => null),
    queryKey: ["license-state"],
    staleTime: Number.POSITIVE_INFINITY,
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
