/**
 * Configure issue-tracker linking: paste the tracker's browse URL (e.g.
 * https://yourco.atlassian.net/browse/) and ticket IDs in PR titles become
 * links. `{id}` anywhere in the URL is substituted instead of appended; empty
 * turns linking off. The stored value belongs to the host — it arrives as
 * `value` and leaves through `onSave` — so this dialog holds no account state.
 *
 * Validation lives here rather than in the host because it is what the field
 * means, not where it is stored: anything that is not an http(s) URL can never
 * be opened, so Save stays disabled and the hint slot becomes the error. That
 * also makes the rejected state a fixture — seeding `value` with a bad URL
 * renders the error on first paint, with no interaction to script.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) and
 * `.qit-inline` returns the panel to normal flow for embedding hosts. Initial
 * focus goes to the input only when modal: an inline specimen that grabs focus
 * would paint its focus ring into every capture of the field.
 */
import { Ticket } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./issue-tracker-dialog.css";

function trackerUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "That isn't a URL. Paste the full browse address, starting with https://";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Nod can only open http and https links, not ${parsed.protocol.replace(":", "")}.`;
  }
  return null;
}

export function IssueTrackerDialog({
  open,
  onOpenChange,
  value = "",
  onSave,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value?: string;
  onSave: (url: string) => void;
  inline?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <IssueTrackerDialogContent
      inline={inline}
      onOpenChange={onOpenChange}
      onSave={onSave}
      value={value}
    />
  );
}

function IssueTrackerDialogContent({
  onOpenChange,
  value,
  onSave,
  inline,
}: {
  onOpenChange: (v: boolean) => void;
  value: string;
  onSave: (url: string) => void;
  inline?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [url, setUrl] = useState(value);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    inline ? undefined : inputRef,
    { modal: !inline }
  );

  const error = trackerUrlError(url);

  const close = () => {
    onOpenChange(false);
  };

  const save = () => {
    if (error) {
      return;
    }
    onSave(url.trim());
    onOpenChange(false);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <dialog
      aria-label="Issue tracker"
      className={cn("q-dialog q-dialog-top qit-panel", inline && "qit-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qit-head">
        <h2 className="qit-title">
          <Ticket aria-hidden size={14} />
          Issue tracker links
        </h2>
        <p className="qit-sub">
          Ticket IDs in PR titles (SCR-2891, ABC-42, …) become links to this
          URL. Set once per account.
        </p>
      </div>

      <div className="qit-body">
        <input
          aria-describedby={hintId}
          aria-invalid={error !== null}
          aria-label="Issue tracker URL"
          autoComplete="off"
          className="qit-input"
          onChange={onChange}
          onKeyDown={onInputKeyDown}
          placeholder="https://yourco.atlassian.net/browse/"
          ref={inputRef}
          spellCheck={false}
          value={url}
        />
        {error === null ? (
          <p className="qit-hint" id={hintId}>
            The ticket ID is appended, or use {"{id}"} anywhere in the URL.
            Leave empty to turn linking off.
          </p>
        ) : (
          <p className="qit-error" id={hintId}>
            {error}
          </p>
        )}
      </div>

      <div className="qit-foot">
        <Button onClick={close} variant="ghost">
          Cancel
        </Button>
        <Button disabled={error !== null} onClick={save} variant="primary">
          Save
        </Button>
      </div>
    </dialog>
  );
}
