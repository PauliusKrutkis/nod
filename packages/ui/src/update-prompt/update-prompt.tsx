/**
 * The "update available" card, which has three faces on one frame. An eligible
 * release offers a one-click install that lands on the next restart, so
 * nothing interrupts a review in progress. A release outside the licence's
 * update window swaps that action for the purchase flow and says so plainly:
 * the app keeps working either way, and the card must never imply otherwise.
 *
 * The third face is the packaged one. `selfInstallable` is false on a build
 * that cannot put a release in place itself — today a Linux .deb or .rpm,
 * which belongs to the package manager. There the card says who owns the
 * update and links the downloads page; the install button is gone rather than
 * disabled, because pressing it could only fail and a dead control invites
 * the press.
 *
 * Whether a release is eligible, and whether this card should defer to the
 * purchase card entirely, are the host's calls — by the time props arrive the
 * decision to show something has been made.
 *
 * Installing disables Later as well as the primary action: the install
 * relaunches the app, and dismissing a card whose work is already underway
 * would only hide what is about to happen.
 */
import { Download, ExternalLink, KeyRound, Package, RefreshCw } from "lucide-react";
import { Button } from "../button/button.tsx";
import "../notice-card/notice-card.css";
import "./update-prompt.css";

function PackagedNotice({
  currentVersion,
  notes,
  onDismiss,
  onOpenDownloads,
  version,
}: {
  currentVersion: string;
  notes: string | null;
  onDismiss: () => void;
  onOpenDownloads: () => void;
  version: string;
}) {
  return (
    <div className="qb-update" role="status">
      <span className="qb-update-icon">
        <Package aria-hidden size={16} />
      </span>
      <div className="qb-update-body">
        <div className="qb-update-head">
          <span className="qb-update-title">Update available</span>
          <span className="q-mono qb-update-ver">{version}</span>
        </div>
        <p className="qb-update-text">
          You're on {currentVersion}. Your package manager installed Nod, so it
          installs the update too. The downloads page has the new .deb and .rpm.
        </p>
        {notes ? (
          <p className="qb-update-text qb-update-notes">{notes}</p>
        ) : null}
        <div className="qb-update-actions">
          <Button
            className="qb-update-primary qb-update-install"
            onClick={onOpenDownloads}
            variant="quiet"
          >
            <ExternalLink aria-hidden size={13} />
            <span>Open downloads</span>
          </Button>
          <button
            className="qb-update-later"
            onClick={onDismiss}
            type="button"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpdatePrompt({
  currentVersion,
  eligible,
  error,
  installing,
  notes,
  onBuyLicense,
  onDismiss,
  onInstall,
  onOpenDownloads,
  price,
  purchasing,
  selfInstallable,
  version,
}: {
  currentVersion: string;
  eligible: boolean;
  error: string | null;
  installing: boolean;
  notes: string | null;
  onBuyLicense: () => void;
  onDismiss: () => void;
  onInstall: () => void;
  onOpenDownloads: () => void;
  price: string;
  purchasing: boolean;
  selfInstallable: boolean;
  version: string;
}) {
  if (eligible && !selfInstallable) {
    return (
      <PackagedNotice
        currentVersion={currentVersion}
        notes={notes}
        onDismiss={onDismiss}
        onOpenDownloads={onOpenDownloads}
        version={version}
      />
    );
  }

  return (
    <div className="qb-update" role="status">
      <span className="qb-update-icon">
        {eligible ? (
          <Download aria-hidden size={16} />
        ) : (
          <KeyRound aria-hidden size={16} />
        )}
      </span>
      <div className="qb-update-body">
        <div className="qb-update-head">
          <span className="qb-update-title">Update available</span>
          <span className="q-mono qb-update-ver">{version}</span>
        </div>
        {eligible ? (
          <p className="qb-update-text">
            You're on {currentVersion}. Installs on the next restart, so nothing
            interrupts your review.
          </p>
        ) : (
          <p className="qb-update-text">
            {version} is outside your update window. Nod keeps working, and a
            license unlocks another year of updates.
          </p>
        )}
        {notes ? (
          <p className="qb-update-text qb-update-notes">{notes}</p>
        ) : null}
        {error ? <p className="qb-update-err">{error}</p> : null}
        <div className="qb-update-actions">
          {eligible ? (
            <Button
              className="qb-update-primary qb-update-install"
              disabled={installing}
              onClick={onInstall}
              variant="primary"
            >
              <RefreshCw aria-hidden size={13} />
              <span>{installing ? "Installing…" : "Restart & update"}</span>
            </Button>
          ) : (
            <Button
              className="qb-update-primary"
              disabled={purchasing}
              onClick={onBuyLicense}
              variant="primary"
            >
              {purchasing
                ? "Waiting for the browser…"
                : `Get a license · ${price}`}
            </Button>
          )}
          <button
            className="qb-update-later"
            disabled={installing}
            onClick={onDismiss}
            type="button"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
