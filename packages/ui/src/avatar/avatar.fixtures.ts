/**
 * Every case here probes the initials/tint fallback path: jsdom never loads
 * images, so url-bearing fixtures render the <img> branch and the rest
 * exercise what happens when GitHub gives us nothing usable — the surface
 * that actually breaks under real reviewer lists.
 */

import { defineEntry } from "../fixtures.ts";
import { Avatar } from "./avatar.tsx";

export const avatarEntry = defineEntry(Avatar, {
  "cjk-name": { props: { name: "藤本 さくら" } },
  "emoji-name": { props: { name: "🦊 Fox" } },
  "empty-name": { props: { name: "" } },
  image: {
    props: { name: "Paulius Krutkis", url: "https://example.test/a.png" },
  },
  initials: { props: { name: "Paulius Krutkis", url: null } },
  large: { props: { name: "Paulius Krutkis", size: 64 } },
  "rtl-name": { props: { name: "محمد الأمين" } },
  silent: { props: { name: "Paulius Krutkis", silent: true } },
  "single-name": { props: { name: "paulius" } },
  "whitespace-name": { props: { name: "   " } },
});
