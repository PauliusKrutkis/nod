/**
 * The purchase card, and the only licensing surface an evaluator ever sees.
 * The deal it represents: the app is never gated and never locks, licensed or
 * not, so nothing licensing-related renders at all until the backend's 30-day
 * grace window ends, after which the host shows this card once per launch.
 * What a license actually buys is updates, which pause until one exists.
 * Only "trialExpired" paints; every other status — trial, licensed, or one
 * this build has never heard of — renders nothing, which is why `status` is a
 * plain string rather than a union: the host decides what it means to be
 * licensed, and an unknown status must fail closed (quiet).
 *
 * The model used to be called "Sublime-style" here, which described neither
 * Sublime nor this app: Sublime nags forever and never stops an unlicensed
 * copy updating, where Nod asks once per launch and stops updates the moment
 * the grace window closes. That stop is currently total, patch releases
 * included (`update.rs` refuses every release once the trial has expired, and
 * only a verified license brings `updatesUntil` into it); letting patches
 * through to unlicensed users is decided but unbuilt, so do not describe it
 * here until it is.
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
