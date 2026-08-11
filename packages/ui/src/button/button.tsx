/**
 * The Quiet button. Until this existed every call site hand-assembled
 * `q-btn q-btn-<variant>` on a raw element and had to remember `q-focus`
 * separately — half of them didn't, so focusability varied button by button.
 * Here the ring is part of being a button, `type` defaults to "button" so
 * forms don't submit by accident, and `busy` both shows the spinner and
 * disables the control, because a button that is working must not fire twice.
 * `combo` renders the shortcut cap the app's dialogs put on primary actions.
 */
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import "./button.css";

type ButtonVariant = "primary" | "quiet" | "ghost" | "danger";

export function Button({
  variant = "quiet",
  combo,
  busy = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  combo?: string;
  busy?: boolean;
}) {
  return (
    <button
      className={cn("q-btn", `q-btn-${variant}`, "q-focus", className)}
      disabled={busy || disabled}
      type={type}
      {...rest}
    >
      {busy ? <span aria-hidden className="q-btn-spin" /> : null}
      <span className="q-btn-label">{children}</span>
      {combo ? <Kbd combo={combo} /> : null}
    </button>
  );
}
