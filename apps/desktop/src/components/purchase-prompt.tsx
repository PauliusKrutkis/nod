import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";

/**
 * Trial-ended purchase card in the alert stack. Appears only in the
 * trialExpired state, and never blocks anything — the app stays fully usable
 * behind it, per the no-DRM stance; a license buys a year of updates. Buy
 * opens checkout in the browser and the backend command stays pending until
 * the activation listener receives a verified token, so success lands here
 * as the resolved license state and is written straight into the shared
 * license-state query — the card and the trial badge both flip without a
 * refetch. Dismissal is per-launch (plain state), matching UpdatePrompt.
 */

export function PurchasePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: license } = useQuery({
    queryFn: () => api.getLicenseState(),
    queryKey: ["license-state"],
  });

  if (dismissed || license?.status !== "trialExpired") {
    return null;
  }

  const buy = async () => {
    setPurchasing(true);
    setError(null);
    try {
      const activated = await api.activateLicense();
      queryClient.setQueryData(["license-state"], activated);
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
          <span className="qb-update-title">Your trial has ended</span>
        </div>
        <p className="qb-update-text">
          Nod keeps working — a license unlocks a year of updates.
        </p>
        {error ? <p className="qb-update-err">{error}</p> : null}
        <div className="qb-update-actions">
          <button
            className="q-btn q-btn-primary qb-update-primary"
            disabled={purchasing}
            onClick={buy}
            type="button"
          >
            {purchasing ? "Waiting for the browser…" : "Buy Nod — $29"}
          </button>
          <button
            className="qb-update-later"
            disabled={purchasing}
            onClick={() => setDismissed(true)}
            type="button"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
