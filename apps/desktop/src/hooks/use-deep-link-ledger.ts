/**
 * The ledger twin of use-deep-link-pr: a `nod://ledger/{owner}/{repo}/{topic}`
 * link routes to the inbox's Ledger tab with the named group opened. The
 * Rust stash (activation.rs) is again the single source — the event only
 * nudges a drain, so a link is consumed exactly once — but the resolution
 * is two-staged on this side: the store's ledgerLinkTarget holds the name
 * until the ledger list has derived enough to find the group, because a
 * cold repo may still be running its first derivation when the link lands.
 */
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { api } from "../lib/api.ts";
import { useAppStore } from "../store/app-store.ts";
import type { LedgerLinkTarget } from "../types.ts";

function routeToLedger(target: LedgerLinkTarget): void {
  const store = useAppStore.getState();
  store.setLedgerLinkTarget({
    repoKey: `${target.owner}/${target.repo}`,
    topic: target.topic,
  });
  store.setInboxTab("ledger");
  store.goInbox();
}

export async function takeLaunchLedgerTarget(): Promise<boolean> {
  const target = await api.takeDeepLinkLedger().catch(() => null);
  if (!target) {
    return false;
  }
  routeToLedger(target);
  return true;
}

export function useDeepLinkLedger(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen("deep-link-ledger", () => {
      if (useAppStore.getState().route.name === "loading") {
        return;
      }
      api
        .takeDeepLinkLedger()
        .then((target) => {
          if (!target || useAppStore.getState().route.name === "token") {
            return;
          }
          routeToLedger(target);
        })
        .catch(() => undefined);
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
