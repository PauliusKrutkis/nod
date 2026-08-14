import { describe, expect, it } from "vitest";
import { formatPostDate, visiblePosts } from "./blog";

interface Entry {
  id: string;
  data: { pubDate: Date; draft: boolean };
}

function entry(id: string, iso: string, draft = false): Entry {
  return { id, data: { pubDate: new Date(iso), draft } };
}

describe("formatPostDate", () => {
  it("formats in UTC regardless of build timezone", () => {
    expect(formatPostDate(new Date("2026-08-14T00:00:00Z"))).toBe(
      "14 Aug 2026"
    );
    expect(formatPostDate(new Date("2026-08-14T23:59:59Z"))).toBe(
      "14 Aug 2026"
    );
  });

  it("covers year and month boundaries", () => {
    expect(formatPostDate(new Date("2025-12-31T12:00:00Z"))).toBe(
      "31 Dec 2025"
    );
    expect(formatPostDate(new Date("2026-01-01T00:00:00Z"))).toBe("1 Jan 2026");
  });
});

describe("visiblePosts", () => {
  const posts = [
    entry("old", "2026-06-01T00:00:00Z"),
    entry("draft", "2026-08-01T00:00:00Z", true),
    entry("new", "2026-08-14T00:00:00Z"),
  ];

  it("hides drafts in production and sorts newest first", () => {
    expect(visiblePosts(posts, false).map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("shows drafts in dev, still sorted", () => {
    expect(visiblePosts(posts, true).map((p) => p.id)).toEqual([
      "new",
      "draft",
      "old",
    ]);
  });

  it("handles an empty collection", () => {
    expect(visiblePosts([], false)).toEqual([]);
  });
});
