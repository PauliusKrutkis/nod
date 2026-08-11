/**
 * The scrollbar-side minimap of matches: one tick per hit, positioned by the
 * fraction of the scrollable content it sits at. A negative fraction is an
 * unmeasured anchor (the host reports -1 for a match whose row has not been
 * measured yet) and is dropped rather than clamped to the top; a fraction
 * past 1 clamps to the track's end.
 *
 * Past MAX_TICKS the ruler reads as a solid bar rather than a distribution,
 * so ticks are sampled evenly instead — the current match always survives
 * sampling. Ticks sit inside the track at both ends: each is offset by
 * TICK_HEIGHT_PX times its fraction, so a hit at the very bottom of the
 * document stays visible instead of painting past the ruler's end. That is
 * the tallest a tick gets (the current find tick), used for every tick so
 * one does not shift when it becomes current.
 *
 * Rendering nothing when there is nothing to mark is the contract: an empty
 * ruler must not leave a rail floating over the diff.
 */
import { cn } from "../cn/cn.ts";
import "./overview-ruler.css";

const MAX_TICKS = 200;
const TICK_HEIGHT_PX = 3;

export function OverviewRuler({
  kind,
  fractions,
  currentIndex,
}: {
  currentIndex: number | null;
  fractions: readonly number[];
  kind: "find" | "occurrence";
}) {
  if (fractions.length === 0) {
    return null;
  }
  const stride = Math.max(1, Math.ceil(fractions.length / MAX_TICKS));
  const ticks: Array<{ frac: number; current: boolean; index: number }> = [];
  for (let i = 0; i < fractions.length; i += 1) {
    const current = i === currentIndex;
    if (i % stride !== 0 && !current) {
      continue;
    }
    const frac = fractions[i];
    if (frac < 0) {
      continue;
    }
    ticks.push({ current, frac: Math.min(frac, 1), index: i });
  }
  if (ticks.length === 0) {
    return null;
  }
  return (
    <div aria-hidden className="qf-ruler">
      {ticks.map((t) => (
        <div
          className={cn(
            "qf-ruler-tick",
            kind === "find" ? "qf-ruler-find" : "qf-ruler-occ",
            t.current && "qf-ruler-current"
          )}
          key={t.index}
          style={{
            top: `calc(${t.frac * 100}% - ${t.frac * TICK_HEIGHT_PX}px)`,
          }}
        />
      ))}
    </div>
  );
}
