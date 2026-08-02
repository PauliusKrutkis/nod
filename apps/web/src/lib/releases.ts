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
 * dependency. A body line that isn't a bullet survives as its own line;
 * headings are dropped because the page supplies its own structure, and
 * inline code/bold are unwrapped so a hand-edited release can't leak literal
 * backticks or asterisks into the list.
 *
 * TARGETS order is load-bearing beyond display order: groupByPlatform takes
 * the first match per platform as that platform's recommended build, which is
 * what /downloads offers as the one-click download. Apple silicon before
 * Intel, .deb before AppImage and .rpm. The platform names come from
 * ./platform because the page's client script matches against them.
 *
 * Releases are sorted by publishedAt rather than trusting the API's order:
 * GitHub sorts by the tag's created_at, so a hotfix tagged off an older
 * commit would otherwise sort ahead of the release that actually shipped
 * last, and the page presents releases[0] as "latest".
 *
 * The page renders every note of every release it is handed, so the release
 * list is capped rather than rendered whole — the fetch returns up to a
 * hundred, and each one costs a few kilobytes of HTML that ships whether or
 * not its <details> is ever opened. limitHistory reports what was dropped so
 * the page can link out instead of silently truncating.
 *
 * A failed fetch throws rather than degrading to an empty page: Cloudflare
 * Pages keeps the previous deploy live when a build fails, which is a better
 * outcome than silently publishing a downloads page with no downloads. The
 * same applies to a latest release that matches no installer — pickDownloads
 * matches on filename suffix, so a change to Tauri's bundle naming would
 * otherwise build clean and publish an "Install Nod" page with an empty grid.
 */

import type { Platform } from "./platform";
import { REPO_SLUG } from "./site";

const RELEASES_API = `https://api.github.com/repos/${REPO_SLUG}/releases`;

const RELEASES_PER_PAGE = 100;

const SIGN_OFF = "See the assets below to install this version.";

const VERSION_TAG_PATTERN = /^v\d+\.\d+\.\d+$/;

const BULLET_MARKER_PATTERN = /^[-*]\s+/;

const HEADING_PATTERN = /^#{1,6}\s/;

const INLINE_CODE_PATTERN = /`([^`]+)`/g;

const INLINE_BOLD_PATTERN = /\*\*([^*]+)\*\*/g;

const TARGETS: {
  platform: Platform;
  detail: string;
  matches: (name: string) => boolean;
}[] = [
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
  platform: Platform;
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
  return VERSION_TAG_PATTERN.test(tag);
}

export function parseNotes(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith(SIGN_OFF) &&
        !HEADING_PATTERN.test(line)
    )
    .map((line) =>
      line
        .replace(BULLET_MARKER_PATTERN, "")
        .replace(INLINE_CODE_PATTERN, "$1")
        .replace(INLINE_BOLD_PATTERN, "$1")
    );
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

export interface ReleaseHistory {
  shown: Release[];
  hasMore: boolean;
}

export function limitHistory(older: Release[], limit: number): ReleaseHistory {
  return { shown: older.slice(0, limit), hasMore: older.length > limit };
}

export interface PlatformGroup {
  platform: Platform;
  primary: Download;
  alternates: Download[];
}

export function groupByPlatform(downloads: Download[]): PlatformGroup[] {
  const groups: PlatformGroup[] = [];
  for (const download of downloads) {
    const group = groups.find(
      (candidate) => candidate.platform === download.platform
    );
    if (group) {
      group.alternates.push(download);
    } else {
      groups.push({
        platform: download.platform,
        primary: download,
        alternates: [],
      });
    }
  }
  return groups;
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
    }))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export async function fetchReleases(): Promise<Release[]> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(
    `${RELEASES_API}?per_page=${RELEASES_PER_PAGE}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }
  );
  if (!response.ok) {
    throw new Error(
      `GitHub releases fetch failed: ${response.status} ${response.statusText}. ` +
        "Set GITHUB_TOKEN in the build environment if this is a rate limit."
    );
  }
  return assertInstallable(toReleases(await response.json()));
}

export function assertInstallable(releases: Release[]): Release[] {
  const [latest] = releases;
  if (!latest) {
    throw new Error(
      "No published version releases found — /downloads would render empty."
    );
  }
  if (latest.downloads.length === 0) {
    throw new Error(
      `Release ${latest.tag} matched no installer assets — /downloads would ` +
        "render with no download links. Check whether the bundle naming " +
        "changed (see TARGETS)."
    );
  }
  return releases;
}
