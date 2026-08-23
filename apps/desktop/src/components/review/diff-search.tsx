/**
 * Diff wiring for the in-PR search pane; the view is pr-search, catalogued in
 * @nod/ui. It parses the PR's patches into the rows the pane searches and
 * lends it the app's syntax highlighter, so the pane itself stays renderable
 * from a fixture.
 *
 * Rows keep their hunk grouping because the pane's context snippet must stop
 * at a hunk boundary — rows either side of one are not adjacent in the file —
 * and they are built only while the pane is open (`mode === null` is closed),
 * since parsing every patch of a large PR is wasted work the rest of the time.
 *
 * Repo scope is fetched here and handed to the pane as data, and owns its
 * snapshot: widening the scope fires `ensureRepoSnapshot` (idempotent in the
 * backend) and polls it until the snapshot settles, so the download starts
 * before the first keystroke and never depends on another surface having
 * wanted the same snapshot. A settled failure or a too-large refusal
 * surfaces as the pane's failed state with the backend's reason; the grep
 * only runs once the snapshot is ready. Peek context decodes one blob per
 * requested path (immutable at a sha, so it caches indefinitely) and slices
 * a few lines around each hit in that file. Scope, query and peek reset when
 * the pane closes: reopening always starts back at the PR, widening is a
 * deliberate gesture.
 */

import {
  PrSearch,
  type PrSearchFile,
  type PrSearchLine,
  type PrSearchMode,
  type PrSearchScope,
  type RepoSearchHit,
  type RepoSearchState,
} from "@nod/ui/pr-search";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDebouncedValue } from "../../hooks/use-debounced-value.ts";
import { api } from "../../lib/api.ts";
import { type DiffRow, parsePatch } from "../../lib/diff.ts";
import { highlightLineWithMatch } from "../../lib/highlight.ts";
import {
  blobLines,
  buildRepoState,
  isSnapshotNotReady,
  SNAPSHOT_SETTLED,
} from "../../lib/repo-search.ts";
import type { ChangedFile } from "../../types.ts";

const PEEK_RADIUS = 4;
const MIN_REPO_QUERY = 2;
const SNAPSHOT_POLL_MS = 1500;

function rowAnchor(row: DiffRow): string | null {
  if (row.type === "del") {
    return row.oldLine === null ? null : `LEFT:${row.oldLine}`;
  }
  return row.newLine === null ? null : `RIGHT:${row.newLine}`;
}

function toSearchFiles(files: ChangedFile[]): PrSearchFile[] {
  return files.map((f) => ({
    filename: f.filename,
    hunks: parsePatch(f.patch).map((hunk) => {
      const lines: PrSearchLine[] = [];
      for (const row of hunk.rows) {
        if (row.type === "hunk") {
          continue;
        }
        lines.push({
          anchor: rowAnchor(row),
          num: row.newLine ?? row.oldLine,
          text: row.content,
        });
      }
      return lines;
    }),
  }));
}

export function DiffSearch({
  mode,
  files,
  pr,
  onClose,
  onSelectFile,
  onSelectLine,
}: {
  mode: PrSearchMode | null;
  files: ChangedFile[];
  pr: { headSha: string; name: string; owner: string };
  onClose: () => void;
  onSelectFile: (index: number) => void;
  onSelectLine: (index: number, anchor: string) => void;
}) {
  const open = mode !== null;
  const [scope, setScope] = useState<PrSearchScope>("pr");
  const [repoQuery, setRepoQuery] = useState("");
  const [peekPath, setPeekPath] = useState<string | null>(null);
  const pattern = useDebouncedValue(repoQuery.trim(), 250);
  const repoActive = open && mode === "text" && scope === "repo";

  const searchFiles = open ? toSearchFiles(files) : [];

  const snapshot = useQuery({
    enabled: repoActive,
    queryFn: () => api.ensureRepoSnapshot(pr.owner, pr.name, pr.headSha),
    queryKey: ["repoSnapshot", pr.owner, pr.name, pr.headSha],
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state !== undefined && SNAPSHOT_SETTLED.has(state)
        ? false
        : SNAPSHOT_POLL_MS;
    },
    retry: false,
  });
  const snapshotReady = snapshot.data?.state === "ready";

  const grep = useQuery({
    enabled: repoActive && snapshotReady && pattern.length >= MIN_REPO_QUERY,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        return await api.searchRepoContent(
          pr.owner,
          pr.name,
          pr.headSha,
          pattern
        );
      } catch (error) {
        if (isSnapshotNotReady(error)) {
          api
            .ensureRepoSnapshot(pr.owner, pr.name, pr.headSha)
            .catch(() => undefined);
        }
        throw error;
      }
    },
    queryKey: ["repoGrep", pr.owner, pr.name, pr.headSha, pattern],
    refetchInterval: (query) =>
      isSnapshotNotReady(query.state.error) ? SNAPSHOT_POLL_MS : false,
    retry: false,
  });

  const blob = useQuery({
    enabled: repoActive && peekPath !== null,
    queryFn: () =>
      peekPath === null
        ? null
        : api.getFileBlob(pr.owner, pr.name, peekPath, pr.headSha),
    queryKey: ["repoPeek", pr.owner, pr.name, pr.headSha, peekPath],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const peekLines = blob.data ? blobLines(blob.data.base64) : null;
  const filePreview =
    peekPath !== null && peekLines !== null
      ? { lines: peekLines, path: peekPath }
      : null;

  const repo: RepoSearchState = buildRepoState({
    files: searchFiles,
    grepError: grep.isError ? grep.error : null,
    grepFetching: grep.isFetching,
    hits: grep.data?.hits ?? [],
    peekLines,
    peekPath,
    peekRadius: PEEK_RADIUS,
    snapshot: snapshot.data,
    snapshotError: snapshot.isError ? snapshot.error : null,
    truncated: grep.data?.truncated ?? false,
  });

  const onNeedRepoContext = (hit: RepoSearchHit) => {
    setPeekPath(hit.path);
  };

  const onSelectRepoHit = (hit: RepoSearchHit) => {
    if (hit.fileIndex !== null && hit.anchor !== null) {
      onSelectLine(hit.fileIndex, hit.anchor);
    }
  };

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setScope("pr");
      setRepoQuery("");
      setPeekPath(null);
      onClose();
    }
  };

  return (
    <PrSearch
      filePreview={filePreview}
      files={searchFiles}
      highlightLine={highlightLineWithMatch}
      mode={mode ?? "files"}
      onNeedRepoContext={onNeedRepoContext}
      onOpenChange={onOpenChange}
      onQueryChange={setRepoQuery}
      onScopeChange={setScope}
      onSelectFile={onSelectFile}
      onSelectLine={onSelectLine}
      onSelectRepoHit={onSelectRepoHit}
      open={open}
      repo={mode === "text" ? repo : undefined}
      scope={scope}
    />
  );
}
