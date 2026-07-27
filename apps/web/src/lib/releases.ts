/**
 * Build-time GitHub Releases data for /downloads. This runs during `astro
 * build` and never in the browser, so the page ships as static HTML with no
 * runtime dependency on GitHub's API being reachable.
 *
 * Two kinds of noise have to come out of the raw API response: the repo
 * carries non-version releases (`pr-evidence`), and the release workflow
 * appends a fixed sign-off sentence to every body, which reads as filler on a
 * page that already shows download buttons.
 *
 * Notes are plain bullet lists by convention — the `release` skill writes
 * them — so they're parsed as such rather than pulling in a markdown
 * dependency. A body line that isn't a bullet survives as its own line.
 *
 * A failed fetch throws rather than degrading to an empty page: Cloudflare
 * Pages keeps the previous deploy live when a build fails, which is a better
 * outcome than silently publishing a downloads page with no downloads.
 */

const RELEASES_API =
  "https://api.github.com/repos/PauliusKrutkis/pr-flow/releases";

const SIGN_OFF = "See the assets below to install this version.";

const TARGETS = [
  {
    platform: "macOS",
    detail: "Apple silicon",
    matches: (name: string) => name.endsWith("aarch64.dmg"),
  },
  {
    platform: "macOS",
    detail: "Intel",
    matches: (name: string) => name.endsWith("x64.dmg"),
  },
  {
    platform: "Windows",
    detail: "x64 installer",
    matches: (name: string) => name.endsWith(".msi"),
  },
  {
    platform: "Linux",
    detail: "Debian / Ubuntu",
    matches: (name: string) => name.endsWith(".deb"),
  },
  {
    platform: "Linux",
    detail: "AppImage",
    matches: (name: string) => name.endsWith(".AppImage"),
  },
  {
    platform: "Linux",
    detail: "Fedora / RHEL",
    matches: (name: string) => name.endsWith(".rpm"),
  },
];

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Download {
  platform: string;
  detail: string;
  url: string;
  size: string;
}

export interface Release {
  tag: string;
  version: string;
  publishedAt: string;
  notes: string[];
  downloads: Download[];
}

export function isVersionTag(tag: string): boolean {
  return /^v\d+\.\d+\.\d+$/.test(tag);
}

export function parseNotes(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(SIGN_OFF))
    .map((line) => line.replace(/^[-*]\s+/, ""));
}

export function formatSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function pickDownloads(assets: ReleaseAsset[]): Download[] {
  const downloads: Download[] = [];
  for (const target of TARGETS) {
    const asset = assets.find((candidate) => target.matches(candidate.name));
    if (asset) {
      downloads.push({
        platform: target.platform,
        detail: target.detail,
        url: asset.browser_download_url,
        size: formatSize(asset.size),
      });
    }
  }
  return downloads;
}

interface ApiRelease {
  tag_name: string;
  published_at: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export function toReleases(apiReleases: ApiRelease[]): Release[] {
  return apiReleases
    .filter(
      (release) =>
        isVersionTag(release.tag_name) && !(release.draft || release.prerelease)
    )
    .map((release) => ({
      tag: release.tag_name,
      version: release.tag_name.slice(1),
      publishedAt: release.published_at,
      notes: parseNotes(release.body ?? ""),
      downloads: pickDownloads(release.assets),
    }));
}

export async function fetchReleases(): Promise<Release[]> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(RELEASES_API, {
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub releases fetch failed: ${response.status} ${response.statusText}. ` +
        "Set GITHUB_TOKEN in the build environment if this is a rate limit."
    );
  }
  return toReleases(await response.json());
}
