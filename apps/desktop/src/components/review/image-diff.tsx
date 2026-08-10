import { Spinner } from "@nod/ui";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "../../lib/api.ts";
import { imageMimeFor } from "../../lib/mime.ts";
import type { ChangedFile } from "../../types.ts";

/**
 * Before/after panes for image files in a diff. Bytes come through the
 * backend (the token never reaches the webview) as base64 and render as
 * data: URLs.
 *
 * SVG is the reason every version goes through an `<img src="data:…">` and
 * never into the DOM as markup. An SVG in a pull request is untrusted input
 * that can carry `<script>`, event handlers, and references to remote files.
 * Loaded as an image, it is inert: the browser refuses to run script or
 * fetch external resources for it, so a hostile icon can neither reach the
 * window holding the reviewer's session nor tell a third party that this PR
 * was opened. Inlining the markup, or sanitising it by hand, would trade
 * that guarantee for a filter we would have to keep winning forever.
 */

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ImagePane({
  label,
  tone,
  owner,
  repo,
  path,
  gitRef,
}: {
  label: string;
  tone: "old" | "new";
  owner: string;
  repo: string;
  path: string;
  gitRef: string;
}) {
  const { data, isLoading, isError, error } = useQuery({
    enabled: !!gitRef,
    queryFn: () => api.getFileBlob(owner, repo, path, gitRef),
    queryKey: ["fileBlob", owner, repo, path, gitRef],
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const mime = imageMimeFor(path) ?? "application/octet-stream";
  const blobKey = data?.base64 ?? "";

  const bindImgRef = (img: HTMLImageElement | null) => {
    imgRef.current = img;
    if (!img) {
      return;
    }
    setDims(null);
    const syncDims = () => {
      if (img.naturalWidth > 0) {
        setDims({ h: img.naturalHeight, w: img.naturalWidth });
      }
    };
    if (img.complete) {
      syncDims();
    } else {
      img.addEventListener("load", syncDims, { once: true });
    }
  };

  const dimText = dims === null ? null : `${dims.w}×${dims.h}`;
  const sizeText = data === undefined ? null : formatBytes(data.size);
  const metaParts = [dimText, sizeText].filter(
    (part): part is string => part !== null
  );

  return (
    <figure className={`qf-img-pane qf-img-${tone}`}>
      <figcaption className="qf-img-cap">
        <span className="qf-img-label">{label}</span>
        <span className="qf-img-meta">
          {metaParts.length > 0 ? metaParts.join(" · ") : null}
        </span>
      </figcaption>
      <div className="qf-img-frame">
        {isLoading ? <Spinner label="Loading image…" /> : null}
        {isError ? (
          <span className="qf-img-err">
            Couldn't load this version. {String(error)}
          </span>
        ) : null}
        {gitRef ? null : (
          <span className="qf-img-err">No ref available for this side.</span>
        )}
        {data ? (
          <img
            alt={`${label}: ${path}`}
            height={dims?.h}
            key={blobKey}
            ref={bindImgRef}
            src={`data:${mime};base64,${data.base64}`}
            width={dims?.w}
          />
        ) : null}
      </div>
    </figure>
  );
}

export function ImageDiff({
  file,
  owner,
  repo,
  baseSha,
  headSha,
}: {
  file: ChangedFile;
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
}) {
  const showOld = file.status !== "added";
  const showNew = file.status !== "removed";
  const oldPath = file.previousFilename ?? file.filename;

  return (
    <div className="qf-imgdiff">
      {!!showOld && (
        <ImagePane
          gitRef={baseSha}
          label={file.status === "removed" ? "Removed" : "Before"}
          owner={owner}
          path={oldPath}
          repo={repo}
          tone="old"
        />
      )}
      {!!showNew && (
        <ImagePane
          gitRef={headSha}
          label={file.status === "added" ? "Added" : "After"}
          owner={owner}
          path={file.filename}
          repo={repo}
          tone="new"
        />
      )}
    </div>
  );
}
