/**
 * Pure helpers for the blog pages, kept out of the .astro files so they can
 * be unit-tested. Dates render as "14 Aug 2026" in UTC: the build runs in
 * one timezone and readers live in every other one, so a locale-dependent or
 * zone-dependent format would make the same post carry different dates
 * between builds. `visiblePosts` is the one definition of "published" shared
 * by the index, the RSS feed, and the static paths, so a draft cannot leak
 * through one surface while the others hide it.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatPostDate(date: Date): string {
  const month = MONTHS[date.getUTCMonth()];
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

export function visiblePosts<
  T extends { data: { pubDate: Date; draft: boolean } },
>(posts: T[], isDev: boolean): T[] {
  return posts
    .filter((post) => isDev || !post.data.draft)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}
