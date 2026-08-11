/**
 * The empty inbox — a quiet full-bleed moment instead of an empty two-pane
 * layout. The return-key mark nods back at the app icon.
 *
 * Every word is the host's: which bucket is empty, whether "empty" is good
 * news or a prompt, and whether there is anything to do about it. The single
 * optional action carries its own key hint because the same button is also
 * reachable by that key from anywhere in the inbox — the hint is a statement
 * about the app, not decoration on a button.
 */
import { Button } from "../button/button.tsx";
import "./inbox-zero.css";

export function InboxZero({
  title,
  hint,
  action,
}: {
  action?: { kbd: string; label: string; onClick: () => void };
  hint: string;
  title: string;
}) {
  return (
    <div className="qz-wrap">
      <div aria-hidden className="qz-glyph">
        <svg
          aria-label="Inbox zero"
          fill="none"
          height="26"
          role="img"
          viewBox="0 0 48 48"
          width="26"
        >
          <title>Inbox zero</title>
          <path
            d="M34 12 v10 a5 5 0 0 1 -5 5 H14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path
            d="M20 19 L12 27 L20 35"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
        </svg>
      </div>
      <p className="qz-title">{title}</p>
      <p className="qz-hint">{hint}</p>
      {action ? (
        <Button
          className="qz-action"
          combo={action.kbd}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
