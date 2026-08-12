import type { ReactNode } from "react";
import { cn } from "../cn/cn.ts";
import "./badge.css";

type Tone = "default" | "accent" | "success" | "danger" | "warning" | "muted";

/** Map tones onto the shared Quiet pill variants. */
const toneClasses: Record<Tone, string> = {
  accent: "q-pill-commented",
  danger: "q-pill-changes",
  default: "q-pill-muted",
  muted: "q-pill-muted",
  success: "q-pill-open",
  warning: "q-pill-draft",
};

export function Badge({
  children,
  tone = "default",
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("q-pill", toneClasses[tone], className)}>
      {dot ? <span aria-hidden className="q-pill-dot" /> : null}
      <span className="q-pill-label">{children}</span>
    </span>
  );
}
