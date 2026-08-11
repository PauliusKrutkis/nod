import { WhatsNew as WhatsNewCard } from "@nod/ui/whats-new";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api.ts";
import {
  compareVersions,
  releasesQuery,
  releasesSince,
} from "../lib/releases.ts";
import { Markdown } from "./markdown-loader.tsx";

const LAST_RUN_KEY = "nod:lastRunVersion";

function readLastRun(): string | null {
  try {
    return localStorage.getItem(LAST_RUN_KEY);
  } catch {
    return null;
  }
}

function rememberVersion(version: string) {
  try {
    localStorage.setItem(LAST_RUN_KEY, version);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

interface Gate {
  lastRun: string | null;
  version: string;
}

function renderNotes(notes: string) {
  return <Markdown>{notes}</Markdown>;
}

/**
 * Container for the what's-new card: it decides whether there is anything to
 * announce and which releases the reader skipped, then hands the card a list.
 * We compare the running version to the last one we saw; on a change we pull
 * the release notes for every version in between — an update that skipped
 * versions shows them all. The version is remembered on "Got it", not on
 * render, so the card returns until it's actually acknowledged. The first run
 * ever (no prior version) and downgrades show nothing — there's no "new" yet.
 *
 * Markdown rendering is passed down rather than lifted: the card is in
 * @nod/ui and the pipeline (react-markdown, sanitizer, Tauri link opener)
 * stays app-side.
 */
export function WhatsNewLoader({
  onShowHistory,
}: {
  onShowHistory: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  const { data: gate } = useQuery<Gate>({
    queryFn: async () => {
      const version = await api.getAppVersion();
      const lastRun = readLastRun();
      if (!lastRun || compareVersions(lastRun, version) >= 0) {
        rememberVersion(version);
        return { lastRun: null, version };
      }
      return { lastRun, version };
    },
    queryKey: ["whats-new"],
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: releases } = useQuery({
    ...releasesQuery,
    enabled: Boolean(gate?.lastRun),
  });

  if (!gate?.lastRun || dismissed || releases === undefined) {
    return null;
  }

  const dismiss = () => {
    rememberVersion(gate.version);
    setDismissed(true);
  };

  return (
    <WhatsNewCard
      onDismiss={dismiss}
      onShowHistory={onShowHistory}
      releases={
        releases ? releasesSince(releases, gate.lastRun, gate.version) : []
      }
      renderNotes={renderNotes}
      version={gate.version}
    />
  );
}
