/**
 * Line normalization is the tunable half of the moved-vs-rewritten boundary:
 * the looser the normalization, the more churn reads as "moved" (fewer
 * phantom re-reviews) and the more real change can hide (a formatter run and
 * an indentation-changing refactor look the same). The replay harness
 * measures survival under each level; the default is chosen from those
 * numbers, not from taste.
 */
export const NORMALIZATIONS = ["exact", "rtrim", "ws"] as const;

export type Normalization = (typeof NORMALIZATIONS)[number];

const TRAILING_WS = /\s+$/;
const WS_RUN = /\s+/g;

export const normalizeLine = (line: string, mode: Normalization): string => {
  if (mode === "exact") {
    return line;
  }
  if (mode === "rtrim") {
    return line.replace(TRAILING_WS, "");
  }
  return line.trim().replace(WS_RUN, " ");
};

export const normalizeLines = (
  lines: readonly string[],
  mode: Normalization
): string[] => lines.map((line) => normalizeLine(line, mode));
