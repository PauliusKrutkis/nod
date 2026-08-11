/**
 * Before/after panes for image files in a diff. Both versions arrive already
 * resolved — the caller owns fetching bytes through the backend (the host
 * token never reaches the webview) and hands each side a `src`, which for
 * real diffs is a `data:` URL.
 *
 * SVG is the reason every version is an `<img src="…">` and never markup in
 * the DOM. An SVG in a pull request is untrusted input that can carry
 * `<script>`, event handlers, and references to remote files. Loaded as an
 * image, it is inert: the browser refuses to run script or fetch external
 * resources for it, so a hostile icon can neither reach the window holding
 * the reviewer's session nor tell a third party that this PR was opened.
 * Inlining the markup, or sanitising it by hand, would trade that guarantee
 * for a filter we would have to keep winning forever. A src the engine
 * refuses to decode is therefore expected, not exceptional, so the pane's
 * own load-failure fallback — not the browser's broken-image glyph — is the
 * contract.
 *
 * Dimensions are read off the decoded image rather than passed in: the
 * caption can only claim a size the engine actually produced. A new src
 * clears that measurement and the failure flag during render rather than
 * through a key on the pane: for a real diff src is a data: URL megabytes
 * long, and a key built from it costs a full string compare on every render
 * of the surrounding list. Measuring re-uses the previous state object when
 * the numbers are unchanged, and that is load-bearing: the ref callback is a
 * new function on every render, so React re-runs it on every render, and
 * storing an equal-but-fresh object there would re-render forever.
 */

import { useState } from "react";
import { Spinner } from "../spinner/spinner.tsx";
import "./image-diff.css";

export interface ImageVersion {
  alt: string;
  bytes?: number | null;
  error?: string | null;
  label: string;
  loading?: boolean;
  src?: string | null;
}

const KB = 1024;
const MB = 1024 * 1024;

function formatBytes(n: number): string {
  if (n < KB) {
    return `${n} B`;
  }
  if (n < MB) {
    return `${(n / KB).toFixed(1)} KB`;
  }
  return `${(n / MB).toFixed(1)} MB`;
}

function fallbackMessage(args: {
  broken: boolean;
  error: string | null | undefined;
  loading: boolean;
  src: string | null | undefined;
}): string | null {
  if (args.error) {
    return args.error;
  }
  if (args.broken) {
    return "This version couldn't be displayed.";
  }
  if (args.loading || args.src) {
    return null;
  }
  return "No image on this side.";
}

function ImagePane({
  tone,
  version,
}: {
  tone: "new" | "old";
  version: ImageVersion;
}) {
  const { alt, bytes, error, label, loading = false, src } = version;

  const [dims, setDims] = useState<{ h: number; w: number } | null>(null);
  const [broken, setBroken] = useState(false);
  const [measuredSrc, setMeasuredSrc] = useState(src);

  if (measuredSrc !== src) {
    setMeasuredSrc(src);
    setDims(null);
    setBroken(false);
  }

  const bindImgRef = (img: HTMLImageElement | null) => {
    if (!img) {
      return;
    }
    const syncDims = () => {
      if (img.naturalWidth === 0) {
        return;
      }
      const next = { h: img.naturalHeight, w: img.naturalWidth };
      setDims((prev) =>
        prev && prev.h === next.h && prev.w === next.w ? prev : next
      );
    };
    const markBroken = () => {
      setBroken(true);
    };
    if (img.complete) {
      if (img.naturalWidth > 0) {
        syncDims();
      } else {
        markBroken();
      }
      return;
    }
    img.addEventListener("load", syncDims, { once: true });
    img.addEventListener("error", markBroken, { once: true });
  };

  const dimText = dims === null ? null : `${dims.w}×${dims.h}`;
  const sizeText =
    bytes === null || bytes === undefined ? null : formatBytes(bytes);
  const metaParts = [dimText, sizeText].filter(
    (part): part is string => part !== null
  );
  const message = fallbackMessage({ broken, error, loading, src });

  return (
    <figure className={`qf-img-pane qf-img-${tone}`}>
      <figcaption className="qf-img-cap">
        <span className="qf-img-label">{label}</span>
        <span className="qf-img-meta">
          {metaParts.length > 0 ? metaParts.join(" · ") : null}
        </span>
      </figcaption>
      <div className="qf-img-frame">
        {loading ? <Spinner label="Loading image…" /> : null}
        {message ? <span className="qf-img-err">{message}</span> : null}
        {src && !broken ? (
          <img
            alt={alt}
            height={dims?.h}
            ref={bindImgRef}
            src={src}
            width={dims?.w}
          />
        ) : null}
      </div>
    </figure>
  );
}

export function ImageDiff({
  after,
  before,
}: {
  after?: ImageVersion | null;
  before?: ImageVersion | null;
}) {
  return (
    <div className="qf-imgdiff">
      {before ? <ImagePane tone="old" version={before} /> : null}
      {after ? <ImagePane tone="new" version={after} /> : null}
    </div>
  );
}
