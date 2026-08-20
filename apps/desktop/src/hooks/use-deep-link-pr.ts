/**
 * Link-open hydration (docs/BACKLOG.md §"Link-open hydration"): a
 * `nod://pr/{owner}/{repo}/{number}` link routes to the review screen the
 * same way a resume does — the on-disk detail cache is seeded into the query
 * cache *before* the route changes, so a previously seen PR paints its real
 * content on the first frame and only refreshes in the background. A cold PR
 * seeds nothing and lands on the pending shell's diff-shaped skeleton.
 *
 * The Rust stash (activation.rs) is the single source of a link: every
 * arrival is stashed and the `deep-link-pr` event is only a nudge to drain
 * it, so a link is consumed exactly once no matter which side sees it first.
 * A cold start stashes before the webview exists and the startup sequence
 * drains once the token check has decided the app can route at all; while
 * booting the event handler leaves the stash alone for that drain. On the
 * token gate the handler drains and drops — without a token the fetch behind
 * the route could only fail, and a stale link must not hijack a later
 * remount after sign-in.
 */
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { api } from "../lib/api.ts";
import { queryClient, queryKeys } from "../lib/query-client.ts";
import { useAppStore } from "../store/app-store.ts";
import type { PrLinkTarget, PullRequestDetail } from "../types.ts";

function seedFromDiskCache(target: PrLinkTarget): Promise<void> {
  const key = queryKeys.prDetail(target.owner, target.repo, target.number);
  return api
    .getCachedPullRequestDetail(target.owner, target.repo, target.number)
    .then((detail) => {
      if (!detail) {
        return;
      }
      queryClient.setQueryData<PullRequestDetail>(key, (cur) => cur ?? detail);
      return queryClient.invalidateQueries({ queryKey: key });
    })
    .catch(() => undefined);
}

export async function takeLaunchPrTarget(): Promise<PrLinkTarget | null> {
  const target = await api.takeDeepLinkPr().catch(() => null);
  if (!target) {
    return null;
  }
  await seedFromDiskCache(target);
  return target;
}

export function useDeepLinkPr(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen("deep-link-pr", () => {
      if (useAppStore.getState().route.name === "loading") {
        return;
      }
      api
        .takeDeepLinkPr()
        .then((target) => {
          if (!target || useAppStore.getState().route.name === "token") {
            return;
          }
          return seedFromDiskCache(target).then(() => {
            useAppStore
              .getState()
              .openReview(target.owner, target.repo, target.number);
          });
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
