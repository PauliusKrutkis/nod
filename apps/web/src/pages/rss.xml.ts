/**
 * The feed is the syndication surface (daily.dev, feed readers), so items
 * carry the description and a link, not the full body: the post page is the
 * canonical read and the one with the product around it. Drafts never enter
 * the feed; visiblePosts is the same gate the index and static paths use.
 */

import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { visiblePosts } from "../lib/blog";

export async function GET(context: APIContext) {
  const posts = visiblePosts(await getCollection("blog"), false);
  return rss({
    title: "Nod blog",
    description:
      "Notes from building Nod: keyboard-first PR review, Tauri, WebKit, and the craft of a small desktop app.",
    site: context.site ?? "https://nodreview.com",
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id}/`,
    })),
  });
}
