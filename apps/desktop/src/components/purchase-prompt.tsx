import { KeyRound } from "lucide-react";
import { useState } from "react";
import {
  useLicenseState,
  useSetLicenseState,
} from "../hooks/use-license-state.ts";
import { api } from "../lib/api.ts";

/**
 * The purchase card, and the only licensing surface an evaluator ever sees:
 * evaluation is free and time-unlimited (Sublime-style — no countdown, no
 * lock), so nothing licensing-related renders at all until the backend's
 * 14-day grace window ends, after which this dismissable card asks once per
 * launch and updates pause until a license exists. Buy opens checkout in
 * the browser and the backend command stays pending until the activation
 * listener receives a verified token, so success lands here as the resolved
 * license state and is written straight into the shared license-state
 * query. Later stays enabled during the wait (checkout can take many
 * minutes, and abandoning it must not trap the card on screen); a dismissed
 * card's pending activation still resolves into the shared query.
 *
 * One button covers buying and re-activating, because the server treats them
 * as one flow: signing in as a subject that already holds a license returns
 * the activation screen rather than a checkout (functions/auth/github/
 * callback.ts). The note under the actions exists because the button is
 * labelled with a price, and someone who has already paid will not press a
 * price without being told what it does.
 */

export function PurchasePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const license = useLicenseState();
  const setLicenseState = useSetLicenseState();

  if (dismissed || license?.status !== "trialExpired") {
    return null;
  }

  const buy = async () => {
    setPurchasing(true);
    setError(null);
    try {
      setLicenseState(await api.activateLicense());
    } catch (e) {
      setError(String(e));
    } finally {
      setPurchasing(false);
    }
  };

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
          Nod is free to evaluate. A license is $59, which funds development and
          keeps a year of updates coming.
        </p>
        {error ? <p className="qb-update-err">{error}</p> : null}
        <div className="qb-update-actions">
          <button
            className="q-btn q-btn-primary qb-update-primary"
            disabled={purchasing}
            onClick={buy}
            type="button"
          >
            {purchasing ? "Waiting for the browser…" : "Buy Nod · $59"}
          </button>
          <button
            className="qb-update-later"
            onClick={() => setDismissed(true)}
            type="button"
          >
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
