/**
 * Trails a changing value by `delayMs`, for callers that fan a keystroke out
 * to expensive work (a whole-repo grep) without re-firing per character. The
 * effect synchronizes with a timer, which is exactly what effects are for.
 */
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
