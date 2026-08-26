import { Spinner } from "@nod/ui/spinner";
import type { LedgerPrepUpdate } from "../../hooks/use-ledger-prep.ts";
import { cn } from "../../lib/cn.ts";

/**
 * The one-time cold open, shown as what it actually is: the app reading
 * the repository — clone, whole-history blame, derivation — with honest
 * counters instead of a percent bar (docs/LEDGER.md "Productionization"
 * item 5). Before the first progress event this stays a plain spinner:
 * the warm path resolves in under a second, and a flash of stages would
 * make the fast case look slow.
 */

const STEPS = [
  {
    label: "Fetching the repository",
    stages: ["cloning", "fetching"],
  },
  {
    label: "Reading history",
    stages: ["reading", "blame"],
  },
  {
    label: "Deriving coverage",
    stages: ["deriving"],
  },
] as const;

function stepIndexOf(stage: LedgerPrepUpdate["stage"]): number {
  const index = STEPS.findIndex((step) =>
    (step.stages as readonly string[]).includes(stage)
  );
  // Terminal stages light every row done; the view swaps out right after.
  return index === -1 ? STEPS.length : index;
}

export function LedgerPrep({
  others = 0,
  repoKey,
  update,
}: {
  /** Watched repos also preparing behind this one. */
  others?: number;
  repoKey: string;
  update: LedgerPrepUpdate | null;
}) {
  if (update === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner label="Deriving status from git…" />
      </div>
    );
  }
  const active = stepIndexOf(update.stage);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <p className="font-medium text-fg">Reading {repoKey}</p>
          <p className="text-muted text-sm">
            First open only — later opens are instant.
            {others > 0 &&
              ` ${others} more ${others === 1 ? "repository is" : "repositories are"} preparing behind it.`}
          </p>
        </div>
        <ol className="flex flex-col gap-1.5">
          {STEPS.map((step, i) => (
            <PrepRow
              counter={
                i === active &&
                update.stage === "blame" &&
                update.done !== null &&
                update.total !== null
                  ? `${update.done.toLocaleString()} of ${update.total.toLocaleString()} files`
                  : null
              }
              key={step.label}
              label={step.label}
              state={rowState(i, active)}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

type RowState = "done" | "active" | "pending";

function rowState(index: number, active: number): RowState {
  if (index < active) {
    return "done";
  }
  return index === active ? "active" : "pending";
}

const GLYPH: Record<RowState, string> = {
  active: "●",
  done: "✓",
  pending: "○",
};

function PrepRow({
  counter,
  label,
  state,
}: {
  counter: string | null;
  label: string;
  state: RowState;
}) {
  return (
    <li className="flex items-baseline gap-3 text-sm">
      <span
        className={cn(
          "w-3 text-center",
          state === "done" && "text-muted",
          state === "active" &&
            "text-accent motion-safe:animate-pulse motion-reduce:animate-none",
          state === "pending" && "text-faint"
        )}
      >
        {GLYPH[state]}
      </span>
      <span
        className={cn(
          state === "active" && "text-fg",
          state === "done" && "text-muted",
          state === "pending" && "text-faint"
        )}
      >
        {label}
      </span>
      {counter && (
        <span className="ml-auto text-faint text-xs tabular-nums">
          {counter}
        </span>
      )}
    </li>
  );
}
