/**
 * Header CI/pipeline pill: one glanceable icon + count, colour-matched to the
 * approvals verdict language (green pass, red fail, muted running). Renders
 * nothing when `state: "none"` so repos without CI stay quiet. Clicking asks
 * the host to open the checks page (or the first failing run) — onOpen keeps
 * this side of the boundary free of Tauri.
 *
 * CiStatus is the package's own minimal shape, not an import from the app:
 * the desktop's richer status satisfies it structurally.
 */
import { Check, Loader, X } from "lucide-react";
import { cn } from "../cn/cn.ts";
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./ci-pill.css";

export interface CiStatus {
  failed: number;
  state: "success" | "failure" | "pending" | "none";
  total: number;
  url: string;
}

const PILL: Record<
  Exclude<CiStatus["state"], "none">,
  { className: string; icon: React.ReactNode; label: string }
> = {
  failure: {
    className: "qf-ci-failure",
    icon: <X aria-hidden size={12} strokeWidth={2.75} />,
    label: "Checks failing",
  },
  pending: {
    className: "qf-ci-pending",
    icon: <Loader aria-hidden size={12} strokeWidth={2.5} />,
    label: "Checks running",
  },
  success: {
    className: "qf-ci-success",
    icon: <Check aria-hidden size={12} strokeWidth={2.75} />,
    label: "Checks passing",
  },
};

export function CiPill({
  ci,
  onOpen,
}: {
  ci: CiStatus | undefined;
  onOpen: (url: string) => void;
}) {
  if (!ci || ci.state === "none") {
    return null;
  }
  const meta = PILL[ci.state];
  const count = ci.state === "failure" ? `${ci.failed}/${ci.total}` : ci.total;
  const open = () => {
    if (ci.url) {
      onOpen(ci.url);
    }
  };
  return (
    <Tooltip
      label={`${meta.label} · ${ci.total} check${ci.total === 1 ? "" : "s"}`}
    >
      <button
        className={cn("qf-ci", meta.className)}
        onClick={open}
        type="button"
      >
        {meta.icon}
        <span className="qf-ci-count">{count}</span>
      </button>
    </Tooltip>
  );
}
