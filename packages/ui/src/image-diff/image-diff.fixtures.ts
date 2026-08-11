/**
 * Every version a review can hand these panes: both sides, either side alone
 * (added and deleted files), the aspect ratios that fight a fixed frame, and
 * the three ways a side can carry no picture — still loading, refused by the
 * host, or decoded to nothing. Sources are inline SVG data URLs so a capture
 * run never touches the network and the dimensions in the caption are the
 * ones the engine measured.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { ImageDiff } from "./image-diff.tsx";

function svgSrc(width: number, height: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

const LOGO_BEFORE = svgSrc(
  240,
  160,
  '<rect width="240" height="160" fill="slateblue"/><circle cx="120" cy="80" r="52" fill="gold"/>'
);
const LOGO_AFTER = svgSrc(
  240,
  160,
  '<rect width="240" height="160" fill="teal"/><circle cx="120" cy="80" r="52" fill="salmon"/>'
);
const BANNER = svgSrc(
  2000,
  40,
  '<rect width="2000" height="40" fill="darkslategray"/><rect x="0" y="16" width="2000" height="8" fill="orange"/>'
);
const TOWER = svgSrc(
  60,
  1200,
  '<rect width="60" height="1200" fill="indigo"/><rect x="24" y="0" width="12" height="1200" fill="aquamarine"/>'
);
const PIXEL = svgSrc(1, 1, '<rect width="1" height="1" fill="crimson"/>');
const UNDECODABLE = "data:image/png;base64,bm90LWEtcG5n";
const HOST_ERROR = `Couldn't load this version. https://api.example.com/repos/nod/nod/contents/${"deeply-nested-".repeat(
  12
)}icon.png?ref=0123456789abcdef`;

export const imageDiffEntry = defineEntry(ImageDiff, {
  "added-only": {
    props: {
      after: {
        alt: "Added: assets/logo.svg",
        bytes: 3184,
        label: "Added",
        src: LOGO_AFTER,
      },
      before: null,
    },
  },
  "both-sides": {
    props: {
      after: {
        alt: "After: assets/logo.svg",
        bytes: 3184,
        label: "After",
        src: LOGO_AFTER,
      },
      before: {
        alt: "Before: assets/logo.svg",
        bytes: 2971,
        label: "Before",
        src: LOGO_BEFORE,
      },
    },
  },
  broken: {
    props: {
      after: {
        alt: "After: assets/logo.png",
        bytes: 12,
        label: "After",
        src: UNDECODABLE,
      },
      before: {
        alt: "Before: assets/logo.png",
        bytes: 2971,
        label: "Before",
        src: LOGO_BEFORE,
      },
    },
  },
  "deleted-only": {
    props: {
      after: null,
      before: {
        alt: "Removed: assets/logo.svg",
        bytes: 2971,
        label: "Removed",
        src: LOGO_BEFORE,
      },
    },
  },
  loading: {
    props: {
      after: { alt: "After: assets/logo.svg", label: "After", loading: true },
      before: {
        alt: "Before: assets/logo.svg",
        label: "Before",
        loading: true,
      },
    },
  },
  "markup-as-text": {
    props: {
      after: {
        alt: "After: assets/logo.svg",
        error: 'Couldn\'t load this version. <img src=x onerror="alert(1)">',
        label: "After",
      },
      before: {
        alt: "Before: assets/logo.svg",
        bytes: 2971,
        label: "Before",
        src: LOGO_BEFORE,
      },
    },
  },
  "no-source": {
    props: {
      after: {
        alt: "After: assets/logo.svg",
        bytes: 3184,
        label: "After",
        src: LOGO_AFTER,
      },
      before: { alt: "Before: assets/logo.svg", label: "Before", src: null },
    },
  },
  overflow: {
    props: {
      after: {
        alt: "After: assets/logo.png",
        error: HOST_ERROR,
        label: "After",
      },
      before: {
        alt: "Before: assets/logo.png",
        error: HOST_ERROR,
        label: "Before",
      },
    },
  },
  tall: {
    props: {
      after: {
        alt: "After: assets/rail.svg",
        bytes: 1024 * 1024 * 2.5,
        label: "After",
        src: TOWER,
      },
      before: null,
    },
  },
  tiny: {
    props: {
      after: {
        alt: "After: assets/dot.svg",
        bytes: 71,
        label: "After",
        src: PIXEL,
      },
      before: null,
    },
  },
  wide: {
    props: {
      after: {
        alt: "After: assets/banner.svg",
        bytes: 148_003,
        label: "After",
        src: BANNER,
      },
      before: null,
    },
  },
});
