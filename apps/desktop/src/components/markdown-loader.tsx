/**
 * Host wiring for the catalogued Markdown view in @nod/ui. Three things stay
 * on this side of the boundary because each one reaches the host:
 *
 * - Links open in the system browser through the Tauri opener; the view only
 *   knows it has a callback, which is what lets it render from a fixture.
 * - GitLab appends a kramdown attribute list to pasted images
 *   (`![alt](url){width=885}`); stripping it is provider knowledge, so the
 *   source is rewritten here and the view renders the markdown it is given.
 * - A GitLab upload path is not a public URL. `AuthenticatedUpload` pulls the
 *   bytes through the Uploads API — the bearer token never reaches the
 *   webview — and renders them as a data URL, picking <video> over <img> when
 *   the filename's extension is a video format. The view asks `renderImage`
 *   for every image and falls back to a plain one when it returns null.
 *
 * Applying it needs the owner/repo of the PR the body belongs to; without
 * them an upload path is left as a plain (and broken) image, which is what
 * happened before this seam existed too.
 */

import {
  type MarkdownImageProps,
  Markdown as MarkdownView,
} from "@nod/ui/markdown";
import { Spinner } from "@nod/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { api } from "../lib/api.ts";
import { imageMimeFor, videoMimeFor } from "../lib/mime.ts";
import { openExternal } from "../lib/open-external.ts";
import {
  parseGitlabUploadPath,
  stripImageAttributeLists,
} from "../lib/provider.ts";

interface CommonMediaProps {
  className?: string;
  id?: string;
  style?: CSSProperties;
  width?: number | string;
  height?: number | string;
}

function RawImg({
  alt,
  ...rest
}: CommonMediaProps & { alt?: string; src: string; title?: string }) {
  return (
    // biome-ignore lint/correctness/useImageSize: source markdown carries no dimensions
    <img alt={alt ?? ""} {...rest} />
  );
}

function AuthenticatedUpload({
  owner,
  repo,
  secret,
  filename,
  alt,
  title,
  className,
  id,
  style,
  width,
  height,
}: CommonMediaProps & {
  owner: string;
  repo: string;
  secret: string;
  filename: string;
  alt?: string;
  title?: string;
}) {
  const { data, error, isError, isLoading } = useQuery({
    queryFn: () => api.getUploadBlob(owner, repo, secret, filename),
    queryKey: ["uploadBlob", owner, repo, secret, filename],
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (isLoading) {
    return <Spinner label="Loading…" />;
  }
  if (isError || !data) {
    return (
      <span className="text-faint text-sm">
        Couldn't load {filename}. {String(error)}
      </span>
    );
  }
  const common: CommonMediaProps = { className, height, id, style, width };
  const videoMime = videoMimeFor(filename);
  if (videoMime) {
    return (
      <video
        controls
        preload="metadata"
        src={`data:${videoMime};base64,${data.base64}`}
        title={title}
        {...common}
      >
        <track kind="captions" />
      </video>
    );
  }
  const mime = imageMimeFor(filename) ?? "application/octet-stream";
  return (
    <RawImg
      alt={alt}
      src={`data:${mime};base64,${data.base64}`}
      title={title}
      {...common}
    />
  );
}

export function Markdown({
  children,
  className,
  owner,
  repo,
}: {
  children: string;
  className?: string;
  owner?: string;
  repo?: string;
}) {
  const renderImage = ({ src, ...rest }: MarkdownImageProps) => {
    const upload = parseGitlabUploadPath(src);
    if (!(upload && owner && repo)) {
      return null;
    }
    return (
      <AuthenticatedUpload
        filename={upload.filename}
        owner={owner}
        repo={repo}
        secret={upload.secret}
        {...rest}
      />
    );
  };

  return (
    <MarkdownView
      className={className}
      openExternal={openExternal}
      renderImage={renderImage}
    >
      {stripImageAttributeLists(children)}
    </MarkdownView>
  );
}
