/**
 * Telemetry-free adoption numbers from GitHub release asset download counts.
 * Installer counts approximate installs per release; the `latest.json`
 * count approximates update checks (the Tauri updater fetches it on every
 * check), which makes its growth rate a rough active-install signal. No
 * user data is involved: GitHub only exposes aggregate counters.
 *
 * Usage: node scripts/download-stats.mjs  (or `pnpm stats:downloads`)
 * GITHUB_TOKEN is optional and only matters for rate limits.
 */

const REPO_SLUG = "PauliusKrutkis/pr-flow";

const VERSION_TAG_PATTERN = /^v\d+\.\d+\.\d+$/;

const INSTALLER_SUFFIXES = [
  ".dmg",
  ".msi",
  "-setup.exe",
  ".deb",
  ".rpm",
  ".AppImage",
];

const isInstaller = (name) =>
  INSTALLER_SUFFIXES.some((suffix) => name.endsWith(suffix));

const token = process.env.GITHUB_TOKEN;
const response = await fetch(
  `https://api.github.com/repos/${REPO_SLUG}/releases?per_page=100`,
  {
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }
);
if (!response.ok) {
  console.error(`GitHub API: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const releases = (await response.json())
  .filter((release) => VERSION_TAG_PATTERN.test(release.tag_name))
  .sort((left, right) => left.published_at.localeCompare(right.published_at));

let totalInstallers = 0;
for (const release of releases) {
  const date = release.published_at.slice(0, 10);
  const installers = release.assets.filter((asset) => isInstaller(asset.name));
  const installerTotal = installers.reduce(
    (sum, asset) => sum + asset.download_count,
    0
  );
  totalInstallers += installerTotal;
  const updateChecks = release.assets.find(
    (asset) => asset.name === "latest.json"
  )?.download_count;

  console.log(
    `${release.tag_name}  ${date}  installers: ${installerTotal}` +
      (updateChecks === undefined ? "" : `  update checks: ${updateChecks}`)
  );
  for (const asset of installers.filter(
    (installer) => installer.download_count > 0
  )) {
    console.log(`    ${asset.name}: ${asset.download_count}`);
  }
}

console.log(`\ninstaller downloads, all releases: ${totalInstallers}`);
