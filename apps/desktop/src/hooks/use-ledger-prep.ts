import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * The staged progress of getting a repo's ledger on screen, streamed from
 * Rust while `ledger_status` clones, refreshes tips, and derives
 * (`ledger-prep` events). Null until the first event — the warm path
 * resolves before any stage fires, and showing stages for a sub-second
 * load would just flash.
 */
export interface LedgerPrepUpdate {
  repoKey: string;
  stage:
    | "cloning"
    | "fetching"
    | "reading"
    | "blame"
    | "deriving"
    | "ready"
    | "failed";
  done: number | null;
  total: number | null;
  detail: string;
}

export function useLedgerPrep(repoKey: string): LedgerPrepUpdate | null {
  const [update, setUpdate] = useState<LedgerPrepUpdate | null>(null);

  useEffect(() => {
    setUpdate(null);
    const unlisten = listen<LedgerPrepUpdate>("ledger-prep", (event) => {
      if (event.payload.repoKey === repoKey) {
        setUpdate(event.payload);
      }
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, [repoKey]);

  return update;
}
