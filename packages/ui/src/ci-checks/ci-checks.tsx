/**
 * The per-check list inside the PR info drawer: one row per check-run or
 * commit status, each opening that check's own log through the host. The
 * pill in the summary answers "is CI green"; this section answers the next
 * question, which check failed, so rows sort failures first, then running,
 * then passes. Passing checks stay listed rather than hidden, because
 * "everything else is green" is itself information.
 *
 * With no checks the section renders nothing rather than an empty heading,
 * which keeps repos without CI (and hosts that only report a rollup) exactly
 * as quiet as they are today. Rows arrive in host order; the sort is this
 * component's own promise, so an unsorted host still renders failures first.
 */
import { Check, Loader, X } from "lucide-react";
import type { MouseEvent } from "react";
import type { CiCheck } from "../ci-pill/ci-pill.tsx";
import { cn } from "../cn/cn.ts";
import "./ci-checks.css";

const ORDER: Record<CiCheck["state"], number> = {
  failure: 0,
  pending: 1,
  success: 2,
};

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
  onOpen,
}: {
  checks: readonly CiCheck[] | undefined;
  onOpen: (url: string) => void;
}) {
  if (!checks || checks.length === 0) {
    return null;
  }

  const sorted = checks
    .map((check, hostOrder) => ({ check, hostOrder }))
    .sort((a, b) => ORDER[a.check.state] - ORDER[b.check.state]);

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
        <span className="qf-cichecks-count">{checks.length}</span>
      </h3>
      <div className="qf-cichecks-list">
        {sorted.map(({ check, hostOrder }) => {
          const meta = ROW[check.state];
          return (
            <button
              aria-label={`${check.name} · ${meta.label}`}
              className={cn("qf-cicheck-row q-focus", meta.className)}
              data-check-url={check.url}
              key={hostOrder}
              onClick={handleClick}
              title="Open the full log"
              type="button"
            >
              <span className="qf-cicheck-state">{meta.icon}</span>
              <span className="qf-cicheck-name">{check.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
