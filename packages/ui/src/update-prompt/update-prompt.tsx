/**
 * The "update available" card, which has three faces on one frame. An eligible
 * release offers a one-click install that lands on the next restart, so
 * nothing interrupts a review in progress. A release outside the licence's
 * update window swaps that action for the purchase flow and says so plainly:
 * the app keeps working either way, and the card must never imply otherwise.
 *
 * Every face renders through UpdateCard, which owns the chrome, the version,
 * the release notes, the error line and "Later", so the card has one shape to
 * change. The packaged face — `selfInstallable` false, a build that cannot
 * put a release in place itself, today a Linux .deb or .rpm — wins over both
 * others, because no license or restart makes that install possible and the
 * swap is manual. Its install button is gone rather than disabled: pressing
 * it could only fail, and a dead control invites the press. Outside the
 * update window the license CTA stays primary even there, since entitlement
 * is the blocker to clear first and the downloads page is no use before it.
 *
 * Whether a release is eligible, and whether this card should defer to the
 * purchase card entirely, are the host's calls — by the time props arrive the
 * decision to show something has been made.
 *
 * Installing disables Later as well as the primary action: the install
 * relaunches the app, and dismissing a card whose work is already underway
 * would only hide what is about to happen.
 */
import {
  Download,
  ExternalLink,
  KeyRound,
  Package,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../button/button.tsx";
import "../notice-card/notice-card.css";
import "./update-prompt.css";

function UpdateCard({
  busy,
  children,
  error,
  icon,
  notes,
  onDismiss,
  primary,
  version,
}: {
  busy: boolean;
  children: ReactNode;
  error: string | null;
  icon: ReactNode;
  notes: string | null;
  onDismiss: () => void;
  primary: ReactNode;
  version: string;
}) {
  return (
    <div className="qb-update" role="status">
      <span className="qb-update-icon">{icon}</span>
      <div className="qb-update-body">
        <div className="qb-update-head">
          <span className="qb-update-title">Update available</span>
          <span className="q-mono qb-update-ver">{version}</span>
        </div>
        {children}
        {notes ? (
          <p className="qb-update-text qb-update-notes">{notes}</p>
        ) : null}
        {error ? <p className="qb-update-err">{error}</p> : null}
        <div className="qb-update-actions">
          {primary}
          <button
            className="qb-update-later"
            disabled={busy}
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
  const card = { busy: installing, error, notes, onDismiss, version };

  const licenseButton = (
    <Button
      className="qb-update-primary"
      disabled={purchasing}
      onClick={onBuyLicense}
      variant="primary"
    >
      {purchasing ? "Waiting for the browser…" : `Get a license · ${price}`}
    </Button>
  );

  if (!selfInstallable) {
    if (eligible) {
      return (
        <UpdateCard
          {...card}
          icon={<Package aria-hidden size={16} />}
          primary={
            <Button
              className="qb-update-primary qb-update-action"
              onClick={onOpenDownloads}
              variant="quiet"
            >
              <ExternalLink aria-hidden size={13} />
              <span>Open downloads</span>
            </Button>
          }
        >
          <p className="qb-update-text">
            You're on {currentVersion}. Nod can't replace a .deb or .rpm install
            on its own. Download the new package and install it over this one.
          </p>
        </UpdateCard>
      );
    }
    return (
      <UpdateCard
        {...card}
        icon={<KeyRound aria-hidden size={16} />}
        primary={licenseButton}
      >
        <p className="qb-update-text">
          {version} is outside your update window, and Nod can't replace a .deb
          or .rpm install on its own. A license unlocks another year of updates.
          The package itself comes from the downloads page.
        </p>
      </UpdateCard>
    );
  }

  if (!eligible) {
    return (
      <UpdateCard
        {...card}
        icon={<KeyRound aria-hidden size={16} />}
        primary={licenseButton}
      >
        <p className="qb-update-text">
          {version} is outside your update window. Nod keeps working, and a
          license unlocks another year of updates.
        </p>
      </UpdateCard>
    );
  }

  return (
    <UpdateCard
      {...card}
      icon={<Download aria-hidden size={16} />}
      primary={
        <Button
          className="qb-update-primary qb-update-action"
          disabled={installing}
          onClick={onInstall}
          variant="primary"
        >
          <RefreshCw aria-hidden size={13} />
          <span>{installing ? "Installing…" : "Restart & update"}</span>
        </Button>
      }
    >
      <p className="qb-update-text">
        You're on {currentVersion}. Installs on the next restart, so nothing
        interrupts your review.
      </p>
    </UpdateCard>
  );
}
