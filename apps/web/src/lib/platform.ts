/**
 * The platform names shared by the release targets and the browser-side
 * detection on /downloads, plus the detection itself.
 *
 * Both sides have to agree on the spelling: the page matches a detected name
 * against `data-platform` on each download option, and a mismatch fails
 * silently — every visitor would keep the first option (macOS) with no error
 * anywhere. Typing TARGETS against Platform turns that into a build failure.
 *
 * This module deliberately imports nothing: /downloads runs detectPlatform in
 * the browser, and importing it from releases.ts would drag the build-time
 * GitHub fetch into the client bundle.
 *
 * Mac CPU architecture is not detected and cannot be — browsers report
 * "Intel Mac OS X" on Apple silicon too — so /downloads defaults to the Apple
 * silicon build and keeps Intel as a visible link. The macOS pattern matches
 * `darwin` because some macOS webviews report it, and the Windows pattern is
 * anchored on the full word for the same reason: `/win/` also matches
 * "Darwin", which would offer a Mac user the .msi.
 */

export type Platform = "macOS" | "Windows" | "Linux";

const WINDOWS_PATTERN = /windows/i;

const LINUX_PATTERN = /linux|x11|android/i;

const MACOS_PATTERN = /mac|iphone|ipad|darwin/i;

export function detectPlatform(platformHint: string): Platform | null {
  if (WINDOWS_PATTERN.test(platformHint)) {
    return "Windows";
  }
  if (LINUX_PATTERN.test(platformHint)) {
    return "Linux";
  }
  if (MACOS_PATTERN.test(platformHint)) {
    return "macOS";
  }
  return null;
}
