import { describe, expect, it } from "vitest";
import {
  formatSize,
  isVersionTag,
  parseNotes,
  pickDownloads,
  toReleases,
} from "./releases";

function asset(name: string, size = 12_300_000) {
  return {
    name,
    browser_download_url: `https://example.test/${name}`,
    size,
  };
}

const V040_ASSETS = [
  "latest.json",
  "Nod-0.4.0-1.x86_64.rpm",
  "Nod-0.4.0-1.x86_64.rpm.sig",
  "Nod_0.4.0_aarch64.dmg",
  "Nod_0.4.0_amd64.AppImage",
  "Nod_0.4.0_amd64.AppImage.sig",
  "Nod_0.4.0_amd64.deb",
  "Nod_0.4.0_amd64.deb.sig",
  "Nod_0.4.0_x64-setup.exe",
  "Nod_0.4.0_x64-setup.exe.sig",
  "Nod_0.4.0_x64.dmg",
  "Nod_0.4.0_x64_en-US.msi",
  "Nod_0.4.0_x64_en-US.msi.sig",
  "Nod_aarch64.app.tar.gz",
  "Nod_aarch64.app.tar.gz.sig",
  "Nod_x64.app.tar.gz",
  "Nod_x64.app.tar.gz.sig",
].map((name) => asset(name));

describe("isVersionTag", () => {
  it("accepts semver release tags", () => {
    expect(isVersionTag("v0.4.0")).toBe(true);
    expect(isVersionTag("v10.2.31")).toBe(true);
  });

  it("rejects the repo's non-version releases", () => {
    expect(isVersionTag("pr-evidence")).toBe(false);
    expect(isVersionTag("v0.4")).toBe(false);
    expect(isVersionTag("0.4.0")).toBe(false);
  });
});

describe("pickDownloads", () => {
  it("picks one installer per target from a real asset list", () => {
    const downloads = pickDownloads(V040_ASSETS);

    expect(downloads.map((d) => `${d.platform} ${d.detail}`)).toEqual([
      "macOS Apple silicon",
      "macOS Intel",
      "Windows x64 installer",
      "Linux Debian / Ubuntu",
      "Linux AppImage",
      "Linux Fedora / RHEL",
    ]);
  });

  it("never offers a signature, manifest, or updater bundle as a download", () => {
    const urls = pickDownloads(V040_ASSETS).map((d) => d.url);

    expect(urls.some((url) => url.endsWith(".sig"))).toBe(false);
    expect(urls.some((url) => url.endsWith("latest.json"))).toBe(false);
    expect(urls.some((url) => url.endsWith(".app.tar.gz"))).toBe(false);
  });

  it("omits targets the release didn't build", () => {
    const downloads = pickDownloads([asset("Nod_0.4.0_aarch64.dmg")]);

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.detail).toBe("Apple silicon");
  });
});

describe("parseNotes", () => {
  it("strips bullet markers and the workflow's sign-off", () => {
    const body = [
      "- Press shift+c to open the composer",
      "- Fixed: GitLab full-file view expands correctly",
      "",
      "See the assets below to install this version. The app auto-updates from here on.",
    ].join("\n");

    expect(parseNotes(body)).toEqual([
      "Press shift+c to open the composer",
      "Fixed: GitLab full-file view expands correctly",
    ]);
  });

  it("returns nothing for a body that is only the sign-off", () => {
    expect(
      parseNotes(
        "See the assets below to install this version. The app auto-updates from here on."
      )
    ).toEqual([]);
  });
});

describe("toReleases", () => {
  it("drops non-version, draft, and prerelease entries", () => {
    const releases = toReleases([
      {
        tag_name: "v0.4.0",
        published_at: "2026-07-23T07:16:34Z",
        body: "- Real note",
        draft: false,
        prerelease: false,
        assets: V040_ASSETS,
      },
      {
        tag_name: "pr-evidence",
        published_at: "2026-07-11T09:04:07Z",
        body: "not a release",
        draft: false,
        prerelease: false,
        assets: [],
      },
      {
        tag_name: "v0.5.0",
        published_at: "2026-07-25T00:00:00Z",
        body: "- Unreleased",
        draft: true,
        prerelease: false,
        assets: [],
      },
    ]);

    expect(releases.map((r) => r.tag)).toEqual(["v0.4.0"]);
    expect(releases[0]?.version).toBe("0.4.0");
    expect(releases[0]?.notes).toEqual(["Real note"]);
  });

  it("tolerates a release with a null body", () => {
    const releases = toReleases([
      {
        tag_name: "v0.1.0",
        published_at: "2026-07-02T00:00:00Z",
        body: null,
        draft: false,
        prerelease: false,
        assets: [],
      },
    ]);

    expect(releases[0]?.notes).toEqual([]);
  });
});

describe("formatSize", () => {
  it("reports megabytes to one decimal", () => {
    expect(formatSize(12_300_000)).toBe("12.3 MB");
  });
});
