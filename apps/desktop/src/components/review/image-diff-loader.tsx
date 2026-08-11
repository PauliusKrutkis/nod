/**
 * Container for the catalogued ImageDiff view: it fetches both versions of an
 * image file and hands each side down as a resolved `data:` URL. Bytes come
 * through the backend so the host token never reaches the webview, and the
 * query is keyed by ref, which makes a version immutable — hence the infinite
 * staleTime.
 *
 * A side with no ref (the added or removed half of a diff) never queries; it
 * carries the reason as its error string instead, because the pane draws one
 * failure line either way.
 */

import { ImageDiff, type ImageVersion } from "@nod/ui/image-diff";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import { imageMimeFor } from "../../lib/mime.ts";
import type { ChangedFile } from "../../types.ts";

function useImageVersion(args: {
  gitRef: string;
  label: string;
  owner: string;
  path: string;
  repo: string;
}): ImageVersion {
  const { gitRef, label, owner, path, repo } = args;
  const { data, error, isError, isLoading } = useQuery({
    enabled: !!gitRef,
    queryFn: () => api.getFileBlob(owner, repo, path, gitRef),
    queryKey: ["fileBlob", owner, repo, path, gitRef],
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const mime = imageMimeFor(path) ?? "application/octet-stream";
  let failure: string | null = null;
  if (!gitRef) {
    failure = "No ref available for this side.";
  } else if (isError) {
    failure = `Couldn't load this version. ${String(error)}`;
  }

  return {
    alt: `${label}: ${path}`,
    bytes: data?.size ?? null,
    error: failure,
    label,
    loading: isLoading,
    src: data ? `data:${mime};base64,${data.base64}` : null,
  };
}

export function ImageDiffLoader({
  baseSha,
  file,
  headSha,
  owner,
  repo,
}: {
  baseSha: string;
  file: ChangedFile;
  headSha: string;
  owner: string;
  repo: string;
}) {
  const showOld = file.status !== "added";
  const showNew = file.status !== "removed";
  const oldPath = file.previousFilename ?? file.filename;

  const before = useImageVersion({
    gitRef: showOld ? baseSha : "",
    label: file.status === "removed" ? "Removed" : "Before",
    owner,
    path: oldPath,
    repo,
  });
  const after = useImageVersion({
    gitRef: showNew ? headSha : "",
    label: file.status === "added" ? "Added" : "After",
    owner,
    path: file.filename,
    repo,
  });

  return (
    <ImageDiff
      after={showNew ? after : null}
      before={showOld ? before : null}
    />
  );
}
