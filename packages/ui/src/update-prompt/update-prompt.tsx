/**
 * The "update available" card, which has three faces on one frame. An eligible
 * release offers a one-click install that lands on the next restart, so
 * nothing interrupts a review in progress. A release outside the licence's
 * update window swaps that action for the purchase flow and says so plainly:
 * the app keeps working either way, and the card must never imply otherwise.
 *
 * Every face renders through UpdateCard, which owns the chrome, the version,
 * the release notes, the error line and "Later", so the card has one shape to
 * change. The packaged faces — `selfInstallable` false, a build that cannot
 * put a release in place itself — win over both others, because no license or
 * restart makes that install possible and the swap is manual. Their install
 * button is gone rather than disabled: pressing it could only fail, and a
 * dead control invites the press. When the host detected a package manager it
 * passes `updateCommand`, and the face shows that one command as a
 * click-to-copy row — copyable, never a button that runs it: executing a
 * privileged package command is a far larger promise than this app makes
 * anywhere else, and the obstacle was never the typing, it was not knowing
 * which command. Without a command the face falls back to the downloads
 * page. Outside the update window the license CTA stays primary even there,
 * since entitlement is the blocker to clear first and neither the command
 * nor the downloads page is any use before it.
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
  Check,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Package,
  RefreshCw,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import "../notice-card/notice-card.css";
import "./update-prompt.css";

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const onCopy = () => {
    navigator.clipboard?.writeText(command).catch(() => undefined);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      className={cn("qb-update-cmd", copied && "qb-update-cmd-copied")}
      onClick={onCopy}
      type="button"
    >
      <span className="q-mono qb-update-cmd-text">{command}</span>
      <span className="qb-update-cmd-hint">
        {copied ? (
          <Check aria-hidden size={12} />
        ) : (
          <Copy aria-hidden size={12} />
        )}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

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
  installedAs,
  installing,
  notes,
  onBuyLicense,
  onDismiss,
  onInstall,
  onOpenDownloads,
  price,
  purchasing,
  selfInstallable,
  updateCommand,
  version,
}: {
  currentVersion: string;
  eligible: boolean;
  error: string | null;
  installedAs: string;
  installing: boolean;
  notes: string | null;
  onBuyLicense: () => void;
  onDismiss: () => void;
  onInstall: () => void;
  onOpenDownloads: () => void;
  price: string;
  purchasing: boolean;
  selfInstallable: boolean;
  updateCommand: string | null;
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
    if (eligible && updateCommand) {
      return (
        <UpdateCard
          {...card}
          icon={<Package aria-hidden size={16} />}
          primary={null}
        >
          <p className="qb-update-text">
            You're on {currentVersion}, installed as {installedAs}. Run this to
            update:
          </p>
          <CopyCommand command={updateCommand} />
        </UpdateCard>
      );
    }
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
            You're on {currentVersion}, installed as {installedAs}. Nod can't
            replace this install on its own. Download the new build and install
            it over this one.
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
          {version} is outside your update window, and Nod can't replace this
          install on its own. A license unlocks another year of updates. The
          build itself comes from your package manager or the downloads page.
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
