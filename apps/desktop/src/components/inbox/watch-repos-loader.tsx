import {
  type RepoHit,
  WatchReposDialog as WatchReposDialogView,
} from "@nod/ui/watch-repos-dialog";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useCoalescedWrite } from "../../hooks/use-coalesced-write.ts";
import { useWatchedRepos } from "../../hooks/use-subscribed.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { openOrgApprovalDocs } from "../../lib/org-approval-docs.ts";
import { queryClient, queryKeys } from "../../lib/query-client.ts";

/**
 * Query, provider search and persistence for the watched-repository list; the
 * view is watch-repos-dialog, catalogued in @nod/ui.
 *
 * Saves are optimistic, and the write behind them is coalesced. The list is a
 * whole-array replace, so a burst of toggles produced a burst of writes that
 * each superseded the last, and each one also invalidated the subscribed
 * query and refetched an inbox nobody had finished editing. Only the final
 * list matters, so the write is debounced and the invalidation happens once
 * with it. The dialog flushes on unmount, because closing it straight after a
 * toggle must not be the one input that loses the edit. A write that rejects
 * used to be swallowed whole — the optimistic list simply reverted and the
 * only trace was an unhandled rejection — so the failure is caught here and
 * handed to the view as a sentence.
 *
 * Search is debounced and sequenced: replies that arrive after a newer
 * request are dropped, and `hits` stays null until the answer for the query
 * on screen exists, which is what keeps the results box from blinking open
 * empty mid-keystroke.
 */

const SEARCH_DEBOUNCE_MS = 250;
const WRITE_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

export function WatchReposLoader({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }
  return <WatchReposLoaderContent onClose={onClose} />;
}

function WatchReposLoaderContent({ onClose }: { onClose: () => void }) {
  const { data, isError } = useWatchedRepos();
  const [optimisticRepos, setOptimisticRepos] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    forQuery: string;
    hits: RepoHit[];
  } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  const repos = optimisticRepos ?? data ?? (isError ? null : undefined);
  const trimmedQuery = query.trim();
  const searchActive = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const answered = searchActive && searchResult?.forQuery === trimmedQuery;

  const syncWatchedRepos = useCoalescedWrite<string[]>({
    delayMs: WRITE_DEBOUNCE_MS,
    onSettled: () => {
      setOptimisticRepos(null);
      setSaving(false);
    },
    write: (updatedRepos) =>
      api
        .setWatchedRepos(updatedRepos)
        .then(() => {
          setWriteError(null);
          queryClient.setQueryData(queryKeys.watchedRepos, updatedRepos);
          queryClient.invalidateQueries({ queryKey: queryKeys.subscribed });
        })
        .catch((cause: unknown) => {
          setWriteError(String(cause));
        }),
  });

  const save = (next: string[]) => {
    setOptimisticRepos(next);
    setSaving(true);
    syncWatchedRepos(next);
  };

  const onStopWatching = (repo: string) => {
    save((optimisticRepos ?? data ?? []).filter((x) => x !== repo));
  };

  const onWatch = (fullName: string) => {
    save([...(optimisticRepos ?? data ?? []), fullName]);
  };

  // The per-repo Ledger toggle: an exclusion list, optimistic like the
  // watched list itself, invalidating the statuses so the tab and its
  // count follow the flip immediately.
  const excluded = useQuery({
    queryFn: () => api.getLedgerExcluded(),
    queryKey: queryKeys.ledgerExcluded,
  });
  const excludedList = excluded.data ?? [];
  const ledgerOn = (repo: string) => !excludedList.includes(repo);
  const onToggleLedger = (repo: string) => {
    const next = excludedList.includes(repo)
      ? excludedList.filter((x) => x !== repo)
      : [...excludedList, repo];
    queryClient.setQueryData(queryKeys.ledgerExcluded, next);
    api
      .setLedgerExcluded(next)
      .catch(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.ledgerExcluded })
      );
  };

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  useEffect(() => {
    if (!searchActive) {
      return;
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      requestSeq.current += 1;
      const seq = requestSeq.current;
      api
        .searchRepos(trimmedQuery)
        .then((res) => {
          if (seq === requestSeq.current) {
            setSearchResult({ forQuery: trimmedQuery, hits: res ?? [] });
          }
        })
        .catch(() => {
          if (seq === requestSeq.current) {
            setSearchResult({ forQuery: trimmedQuery, hits: [] });
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [searchActive, trimmedQuery]);

  useHotkeys(
    "watch-repos",
    [{ description: "Close", hidden: true, keys: "esc", run: onClose }],
    { enabled: true }
  );

  return (
    <WatchReposDialogView
      error={writeError}
      hits={answered ? (searchResult?.hits ?? null) : null}
      ledgerOn={ledgerOn}
      onOpenChange={onOpenChange}
      onOrgAccessHelp={openOrgApprovalDocs}
      onQueryChange={setQuery}
      onStopWatching={onStopWatching}
      onToggleLedger={onToggleLedger}
      onWatch={onWatch}
      open
      query={query}
      repos={repos}
      saving={saving}
      searching={searchActive && !answered}
    />
  );
}
