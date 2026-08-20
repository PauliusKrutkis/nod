/**
 * Every license state the backend can report, plus the ones it can't yet:
 * `status` is a plain string on purpose, so `unknown-status` and
 * `markup-as-text` (the security case — a hostile status must render as
 * text, never mount) exercise the fallback line. `licensed-raw-date` is the
 * unparseable `updatesUntil` shown verbatim, `trial-last-day` the singular,
 * `busy` the minutes-long browser wait, and `activation-failed` /
 * `overflow-error` the failure sentence at its worst width.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { LicenseDialog } from "./license-dialog.tsx";

const noop = () => {
  return;
};

const shared = {
  busy: false,
  error: null,
  onActivate: noop,
  onOpenChange: noop,
  open: true,
};

export const licenseDialogEntry = defineEntry(
  LicenseDialog,
  {
    "activation-failed": {
      props: {
        ...shared,
        error: "Activation failed: the browser window was closed.",
        status: "trialExpired",
      },
    },
    busy: { props: { ...shared, busy: true, daysLeft: 12, status: "trial" } },
    expired: { props: { ...shared, status: "trialExpired" } },
    licensed: {
      props: { ...shared, status: "licensed", updatesUntil: "2027-03-12" },
    },
    "licensed-raw-date": {
      props: { ...shared, status: "licensed", updatesUntil: "whenever" },
    },
    "markup-as-text": {
      props: { ...shared, status: '<img src=x onerror="alert(1)">' },
    },
    "overflow-error": {
      props: {
        ...shared,
        error: `Activation failed: ${"unbreakable-token-".repeat(40)}end`,
        status: "trialExpired",
      },
    },
    trial: { props: { ...shared, daysLeft: 23, status: "trial" } },
    "trial-last-day": { props: { ...shared, daysLeft: 1, status: "trial" } },
    "unknown-status": { props: { ...shared, status: "teamSeat" } },
  },
  { dialog: true }
);
