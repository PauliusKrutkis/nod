/**
 * The blog is the only content collection. `thumbnail` is a path under
 * /public and doubles as the post's og:image, so the same picture fronts the
 * post card, the social embed, and the daily.dev card; posts without one fall
 * back to the site-wide og.png in Base.astro. `draft` keeps a post out of the
 * index, the RSS feed, and the build's static paths in production, while dev
 * still renders it for writing.
 */

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    thumbnail: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
