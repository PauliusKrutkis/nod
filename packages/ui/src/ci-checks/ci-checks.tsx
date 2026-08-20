/**
 * The Checks tab's content in the right dock: one row per check-run or
 * commit status, each opening that check's own log through the host. The
 * pill in the summary answers "is CI green"; this surface answers the next
 * question, which check failed, so rows sort failures first, then running,
 * then passes (orderChecks). Passing checks stay listed rather than hidden,
 * because "everything else is green" is itself information.
 *
 * With no checks it renders nothing rather than an empty heading — the host
 * gates the tab on the same fact, so repos without CI (and hosts that only
 * report a rollup) never see the surface at all. `fallbackUrl` is the PR's
 * checks page, standing in for hosts that name a check without linking it;
 * a row that ends up with no link at all is rendered plain rather than as a
 * button that would do nothing on press.
 */
import { Check, Loader, X } from "lucide-react";
import type { MouseEvent } from "react";
import type { CiCheck } from "../ci-pill/ci-pill.tsx";
import { cn } from "../cn/cn.ts";
import { orderChecks } from "./order-checks.ts";
import "./ci-checks.css";

const ROW: Record<
  CiCheck["state"],
  { className: string; icon: React.ReactNode; label: string }
> = {
  failure: {
    className: "qf-cicheck-failure",
    icon: <X aria-hidden size={12} strokeWidth={2.75} />,
    label: "failing",
  },
  pending: {
    className: "qf-cicheck-pending",
    icon: <Loader aria-hidden size={12} strokeWidth={2.5} />,
    label: "running",
  },
  success: {
    className: "qf-cicheck-success",
    icon: <Check aria-hidden size={12} strokeWidth={2.75} />,
    label: "passing",
  },
};

export function CiChecks({
  checks,
  fallbackUrl,
  onOpen,
}: {
  checks: readonly CiCheck[] | undefined;
  fallbackUrl?: string;
  onOpen: (url: string) => void;
}) {
  const rows = orderChecks(checks, fallbackUrl);
  if (rows.length === 0) {
    return null;
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const url = e.currentTarget.dataset.checkUrl;
    if (url) {
      onOpen(url);
    }
  };

  return (
    <section className="qf-cichecks">
      <h3 className="qf-cichecks-h">
        Checks
        <span className="qf-cichecks-count">{rows.length}</span>
      </h3>
      <div className="qf-cichecks-list">
        {rows.map(({ check, hostOrder, url }) => {
          const meta = ROW[check.state];
          const face = (
            <>
              <span className="qf-cicheck-state">{meta.icon}</span>
              <span className="qf-cicheck-name">{check.name}</span>
            </>
          );
          if (!url) {
            return (
              <div
                className={cn("qf-cicheck-row", meta.className)}
                key={hostOrder}
              >
                {face}
                <span className="qf-cicheck-state-label">{meta.label}</span>
              </div>
            );
          }
          return (
            <button
              aria-label={`${check.name} · ${meta.label}`}
              className={cn("qf-cicheck-row q-focus", meta.className)}
              data-check-url={url}
              key={hostOrder}
              onClick={handleClick}
              title="Open the full log"
              type="button"
            >
              {face}
            </button>
          );
        })}
      </div>
    </section>
  );
}
