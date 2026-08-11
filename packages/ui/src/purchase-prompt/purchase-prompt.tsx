/**
 * The purchase card, and the only licensing surface an evaluator ever sees:
 * evaluation is free and time-unlimited (Sublime-style — no countdown, no
 * lock), so nothing licensing-related renders at all until the backend's
 * grace window ends. Only "trialExpired" paints; every other status — trial,
 * licensed, or one this build has never heard of — renders nothing, which is
 * why `status` is a plain string rather than a union: the host decides what
 * it means to be licensed, and an unknown status must fail closed (quiet).
 *
 * One button covers buying and re-activating, because the server treats them
 * as one flow: signing in as a subject that already holds a license returns
 * the activation screen rather than a checkout. The note under the actions
 * exists because the button is labelled with a price, and someone who has
 * already paid will not press a price without being told what it does — that
 * sentence is the card's contract, not decoration.
 *
 * `busy` is the wait on the browser, which can run for many minutes;
 * dismissing must stay possible throughout, so Later is never disabled here.
 */
import { KeyRound } from "lucide-react";
import { Button } from "../button/button.tsx";
import "../notice-card/notice-card.css";
import "./purchase-prompt.css";

export function PurchasePrompt({
  busy,
  error,
  onBuy,
  onDismiss,
  price,
  status,
}: {
  busy: boolean;
  error: string | null;
  onBuy: () => void;
  onDismiss: () => void;
  price: string;
  status: string;
}) {
  if (status !== "trialExpired") {
    return null;
  }
  return (
    <div className="qb-update" role="status">
      <span className="qb-update-icon">
        <KeyRound aria-hidden size={16} />
      </span>
      <div className="qb-update-body">
        <div className="qb-update-head">
          <span className="qb-update-title">Enjoying Nod?</span>
        </div>
        <p className="qb-update-text">
          Nod is free to evaluate. A license is {price}, which funds development
          and keeps a year of updates coming.
        </p>
        {error ? <p className="qb-update-err">{error}</p> : null}
        <div className="qb-update-actions">
          <Button
            className="qb-update-primary"
            disabled={busy}
            onClick={onBuy}
            variant="primary"
          >
            {busy ? "Waiting for the browser…" : `Buy Nod · ${price}`}
          </Button>
          <button className="qb-update-later" onClick={onDismiss} type="button">
            Later
          </button>
        </div>
        <p className="qb-update-note">
          Already bought Nod? Press the same button. Signing in restores your
          license instead of charging you.
        </p>
      </div>
    </div>
  );
}
