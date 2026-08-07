/**
 * Copy for the command palette's license entry.
 *
 * The label carries the whole answer to "check my license", because the
 * palette shows it before anything is run: a holder needs a status line, and
 * everyone else needs an action. Split out from app.tsx so both readings are
 * testable without mounting the palette.
 *
 * updatesUntil arrives as whatever the signed token carried, so a value that
 * does not parse is shown verbatim rather than rendered as "Invalid Date" —
 * a licence holder reading a date they cannot recognise is worse than one
 * reading the raw string the server sent.
 */
import type { LicenseState } from "../types.ts";

export function licenseCommandLabel(state: LicenseState | undefined): string {
  if (state?.status === "licensed") {
    return `License active. Updates until ${formatUpdatesUntil(state.updatesUntil)}`;
  }
  return "Activate my license";
}

function formatUpdatesUntil(updatesUntil: string): string {
  const parsed = new Date(updatesUntil);
  if (Number.isNaN(parsed.getTime())) {
    return updatesUntil;
  }
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
