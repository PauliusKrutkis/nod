import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useSetLicenseState } from "../hooks/use-license-state.ts";
import { api } from "../lib/api.ts";

/**
 * "Update available" prompt. Checks the release feed on launch, then every few
 * hours and on window focus (best-effort — silent when the feed is
 * unreachable), so a long-running app still notices new releases. When a newer
 * signed build exists it offers a one-click install + relaunch — unless the
 * release falls outside the license's update window, in which case the same
 * card explains and offers the purchase flow instead: a completed activation
 * updates the shared license state and re-checks the feed, so the card flips
 * to installable on its own.
 */

const RECHECK_MS = 4 * 60 * 60 * 1000;
const FOCUS_STALE_MS = 30 * 60 * 1000;

export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLicenseState = useSetLicenseState();
  const queryClient = useQueryClient();

  const { data: available } = useQuery({
    queryFn: () => api.checkForUpdate().catch(() => null),
    queryKey: ["app-update"],
    refetchInterval: RECHECK_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: FOCUS_STALE_MS,
  });

  const update = dismissed ? null : (available ?? null);

  const dismiss = () => {
    setDismissed(true);
  };

  const install = async () => {
    setInstalling(true);
    setError(null);
    try {
      await api.installUpdate();
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  };

  const buyLicense = async () => {
    setPurchasing(true);
    setError(null);
    try {
      setLicenseState(await api.activateLicense());
      await queryClient.invalidateQueries({ queryKey: ["app-update"] });
    } catch (e) {
      setError(String(e));
    } finally {
      setPurchasing(false);
    }
  };

  if (!update) {
    return null;
  }

  return (
    <div className="qb-update" role="status">
      <span className="qb-update-icon">
        {update.eligible ? (
          <Download aria-hidden size={16} />
        ) : (
          <KeyRound aria-hidden size={16} />
        )}
      </span>
      <div className="qb-update-body">
        <div className="qb-update-head">
          <span className="qb-update-title">Update available</span>
          <span className="q-mono qb-update-ver">{update.version}</span>
        </div>
        {update.eligible ? (
          <p className="qb-update-text">
            You're on {update.currentVersion}. Installs on the next restart —
            nothing interrupts your review.
          </p>
        ) : (
          <p className="qb-update-text">
            {update.version} is outside your update window. Nod keeps working —
            a license unlocks another year of updates.
          </p>
        )}
        {update.notes ? (
          <p className="qb-update-text" style={{ marginTop: 6 }}>
            {update.notes}
          </p>
        ) : null}
        {error ? <p className="qb-update-err">{error}</p> : null}
        <div className="qb-update-actions">
          {update.eligible ? (
            <button
              className="q-btn q-btn-primary qb-update-primary"
              disabled={installing}
              onClick={install}
              type="button"
            >
              <RefreshCw aria-hidden size={13} />
              {installing ? "Installing…" : "Restart & update"}
            </button>
          ) : (
            <button
              className="q-btn q-btn-primary qb-update-primary"
              disabled={purchasing}
              onClick={buyLicense}
              type="button"
            >
              {purchasing ? "Waiting for the browser…" : "Get a license — $29"}
            </button>
          )}
          <button
            className="qb-update-later"
            disabled={installing}
            onClick={dismiss}
            type="button"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
