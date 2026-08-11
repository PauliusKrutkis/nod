/**
 * A persist where only the last value matters. Queue as often as you like;
 * the write fires once the queue has been quiet for `delayMs`, carrying
 * whatever was queued last.
 *
 * For whole-value replaces (the watched-repositories list, not an append),
 * every write but the final one is wasted, and each one usually drags a cache
 * invalidation and a refetch behind it. Debouncing alone would be a trade
 * rather than a win, though, because it invents a window in which the value
 * can be lost: unmount inside it and the edit never lands. So the queue is
 * flushed on unmount, which is the part that makes this safe to use from a
 * dialog the user can close a keystroke after editing.
 *
 * `onSettled` runs after a write resolves and only when nothing newer is
 * waiting, which is what lets a caller drop optimistic state without racing
 * its own next keystroke. It never runs after unmount.
 */
import { useLatest } from "@nod/ui/use-latest";
import { useEffect, useRef } from "react";

export function useCoalescedWrite<T>({
  delayMs,
  onSettled,
  write,
}: {
  delayMs: number;
  onSettled?: () => void;
  write: (value: T) => Promise<unknown>;
}) {
  const pendingRef = useRef<{ value: T } | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const writeRef = useLatest(write);
  const onSettledRef = useLatest(onSettled);

  const flushRef = useRef(() => {
    const pending = pendingRef.current;
    if (pending === null) {
      return;
    }
    pendingRef.current = null;
    writeRef.current(pending.value).finally(() => {
      if (mountedRef.current && pendingRef.current === null) {
        onSettledRef.current?.();
      }
    });
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      flushRef.current();
    };
  }, []);

  return (value: T) => {
    pendingRef.current = { value };
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => flushRef.current(), delayMs);
  };
}
