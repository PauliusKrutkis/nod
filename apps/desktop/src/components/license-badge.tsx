import { useLicenseState } from "../hooks/use-license-state.ts";

/**
 * Quiet trial indicator in the alert stack. Licensed builds render nothing;
 * a running trial shows the days left and an ended trial says so. Deliberately
 * inert — the purchase call to action is its own surface, this is just the
 * ambient countdown.
 */

export function LicenseBadge() {
  const license = useLicenseState();

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
