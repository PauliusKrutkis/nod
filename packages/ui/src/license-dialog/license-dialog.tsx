/**
 * The answer to both license questions the palette can be asked. "Check my
 * license" is answered by the state line, which renders something honest in
 * every state — evaluation with time remaining, active with the updates
 * window, ended, or a status this build has never seen (shown verbatim, so a
 * grown backend enum degrades to a readable sentence instead of a blank).
 * "Activate my license" is the one action, labelled "I already bought this"
 * because that is what the person actually thinks — "Activate" assumes they
 * know there is something to activate. A licensed holder has nothing to
 * activate, so the action disappears rather than disabling.
 *
 * `busy` is the wait on the browser, which can run for many minutes; the
 * dialog stays closable throughout, and the host keeps the pending activation
 * alive after dismissal. `updatesUntil` is whatever the signed token carried,
 * so a value that does not parse is shown verbatim rather than rendered as
 * "Invalid Date".
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) and
 * `.qlic-inline` returns the panel to normal flow for embedding hosts.
 */
import { KeyRound } from "lucide-react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./license-dialog.css";

export interface LicenseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  status: string;
  daysLeft?: number;
  updatesUntil?: string;
  busy: boolean;
  error: string | null;
  onActivate: () => void;
  inline?: boolean;
}

function formatUpdatesUntil(updatesUntil: string): string {
  const parsed = new Date(updatesUntil);
  if (Number.isNaN(parsed.getTime())) {
    return updatesUntil;
  }
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function stateLines(
  status: string,
  daysLeft: number | undefined,
  updatesUntil: string | undefined
): { title: string; detail: string } {
  if (status === "licensed") {
    return {
      detail: `Updates until ${formatUpdatesUntil(updatesUntil ?? "")}.`,
      title: "License active",
    };
  }
  if (status === "trial") {
    const days = daysLeft ?? 0;
    return {
      detail: `${days} ${days === 1 ? "day" : "days"} left. Nod is free to evaluate.`,
      title: "Evaluation running",
    };
  }
  if (status === "trialExpired") {
    return {
      detail:
        "Nod keeps working, updates are paused. A license turns them back on.",
      title: "Evaluation ended",
    };
  }
  return {
    detail: `This build does not recognize the state "${status}".`,
    title: "License state unknown",
  };
}

export function LicenseDialog({ open, ...rest }: LicenseDialogProps) {
  if (!open) {
    return null;
  }
  return <LicenseDialogContent {...rest} />;
}

function LicenseDialogContent({
  onOpenChange,
  status,
  daysLeft,
  updatesUntil,
  busy,
  error,
  onActivate,
  inline = false,
}: Omit<LicenseDialogProps, "open">) {
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    undefined,
    { modal: !inline }
  );

  const { title, detail } = stateLines(status, daysLeft, updatesUntil);

  const close = () => {
    onOpenChange(false);
  };

  return (
    <dialog
      aria-label="License"
      className={cn(
        "q-dialog q-dialog-top qlic-panel",
        inline && "qlic-inline"
      )}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qlic-head">
        <h2 className="qlic-title">
          <KeyRound aria-hidden size={14} />
          License
        </h2>
        <p className="qlic-sub">
          Nod never locks. A license funds development and keeps a year of
          updates coming.
        </p>
      </div>

      <div className="qlic-body">
        <p className="qlic-state">{title}</p>
        <p className="qlic-detail">{detail}</p>
        {status === "licensed" ? null : (
          <p className="qlic-note">
            Bought Nod on the website? Signing in from the browser restores your
            license on this machine. It never charges you.
          </p>
        )}
        {error ? (
          <p className="qlic-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="qlic-foot">
        <Button onClick={close} variant="ghost">
          Close
        </Button>
        {status === "licensed" ? null : (
          <Button disabled={busy} onClick={onActivate} variant="primary">
            {busy ? "Waiting for the browser…" : "I already bought this"}
          </Button>
        )}
      </div>
    </dialog>
  );
}
