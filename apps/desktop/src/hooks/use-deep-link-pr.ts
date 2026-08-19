/**
 * Link-open hydration (docs/BACKLOG.md §"Link-open hydration"): a
 * `nod://pr/{owner}/{repo}/{number}` link routes to the review screen the
 * same way a resume does — the on-disk detail cache is seeded into the query
 * cache *before* the route changes, so a previously seen PR paints its real
 * content on the first frame and only refreshes in the background. A cold PR
 * seeds nothing and lands on the pending shell's diff-shaped skeleton.
 *
 * Two arrival paths mirror the Rust side (activation.rs): a cold start
 * stashes the link before the webview exists, drained here once the token
 * check has decided the app can route at all; a link while running arrives
 * as a `deep-link-pr` event. The event handler ignores links while the app
 * is on the token gate or still booting — without a token the fetch behind
 * the route could only fail, and during boot the startup drain owns routing.
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
    listen<PrLinkTarget>("deep-link-pr", (event) => {
      const target = event.payload;
      seedFromDiskCache(target).then(() => {
        const { openReview, route } = useAppStore.getState();
        if (route.name === "token" || route.name === "loading") {
          return;
        }
        openReview(target.owner, target.repo, target.number);
      });
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
