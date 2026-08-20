/**
 * The palette's "Check for updates" entry: an explicit check that reports in
 * the existing toast slot, one toast per outcome. The passive loader polls
 * the same backend command and stays silent on failure, which is right for a
 * background check and wrong for an answer to a question you just asked — a
 * silent failure reads exactly like "you are up to date". So the failure
 * toast says the result is unknown rather than negative, and names the
 * version you are on either way.
 *
 * When a release is found, the format-aware next step rides along: the
 * detected package manager's own command where one owns the install, the
 * update card everywhere else. The check also invalidates the loader's
 * query, so the card itself refreshes without waiting for the next poll.
 */
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { Binding } from "../keyboard/types.ts";
import { api } from "../lib/api.ts";
import { useAppStore } from "../store/app-store.ts";

export function useCheckUpdatesCommand(): Binding {
  const setToast = useAppStore((s) => s.setToast);
  const queryClient = useQueryClient();

  const run = async () => {
    const current = await api.getAppVersion();
    try {
      const update = await api.checkForUpdate();
      await queryClient.invalidateQueries({ queryKey: ["app-update"] });
      if (!update) {
        setToast({
          message: `${current} is the latest release.`,
          title: "Up to date",
        });
        return;
      }
      setToast({
        message: update.updateCommand
          ? `${update.version} is available. Update with ${update.updateCommand}`
          : `${update.version} is available. The update card has the next step.`,
        title: "Update available",
      });
    } catch {
      setToast({
        message: `Couldn't reach the release feed. You're on ${current}; this says nothing about whether it is current.`,
        title: "Couldn't check",
      });
    }
  };

  return {
    description: "Check for updates",
    global: true,
    group: "General",
    icon: RefreshCw,
    keys: [],
    run,
  };
}
