/**
 * The card is a gate before it is a card, so the statuses that render nothing
 * are fixtures with rendersNothing rather than cases nobody looks at: a
 * running trial, a held license, and a status this build has never seen must
 * all stay silent, because failing open would sell to someone who has paid.
 *
 * `price` is the hostile axis. It reaches both the body copy and the button
 * label, and it is the one string here a server can grow without warning —
 * a plan name, a currency-converted amount, or (the fixture below) an
 * unbreakable token long enough to prove the card wraps instead of widening.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { PurchasePrompt } from "./purchase-prompt.tsx";

const noop = () => {
  return;
};

const base = {
  busy: false,
  error: null,
  onBuy: noop,
  onDismiss: noop,
  price: "$59",
  status: "trialExpired",
};

export const purchasePromptEntry = defineEntry(PurchasePrompt, {
  "already-licensed": {
    props: { ...base, status: "licensed" },
    rendersNothing: true,
  },
  error: {
    props: {
      ...base,
      error: "Purchasing isn't configured for this build (NOD_CHECKOUT_URL).",
    },
  },
  overflow: {
    props: {
      ...base,
      price: `$59-${"perpetual-team-seat".repeat(24)}`,
    },
  },
  "trial-active": { props: { ...base, status: "trial" }, rendersNothing: true },
  "trial-expired": { props: base },
  "unknown-status": {
    props: { ...base, status: "graceElapsed" },
    rendersNothing: true,
  },
  waiting: { props: { ...base, busy: true } },
});
