/**
 * The pills front three faces and count the rest, so the fixtures walk the
 * roster sizes that change the shape: none at all (the silent contract), one
 * approval, both verdicts at once, and a crowd of twelve where the "+9" tail
 * appears. Names are the payload that breaks avatars — CJK, bidi, an email
 * with no spaces, one that looks like markup — and a reviewer with no avatar
 * URL proves the initials fallback still rings inside the pill.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { ReviewVerdicts } from "./review-verdicts.tsx";

const reviewer = (user: string) => ({ user, userAvatarUrl: null });

export const reviewVerdictsEntry = defineEntry(ReviewVerdicts, {
  "crowd-12": {
    props: {
      approved: Array.from({ length: 12 }, (_, i) =>
        reviewer(`reviewer-${i + 1}`)
      ),
      changesRequested: [],
    },
  },
  empty: {
    props: { approved: [], changesRequested: [] },
    rendersNothing: true,
  },
  "markup-as-text": {
    props: {
      approved: [reviewer("<img src=x onerror=alert(1)>")],
      changesRequested: [],
    },
  },
  mixed: {
    props: {
      approved: [reviewer("paulius"), reviewer("dave")],
      changesRequested: [reviewer("mira"), reviewer("tom"), reviewer("ana")],
    },
  },
  "no-avatar": {
    props: {
      approved: [{ user: "paulius" }],
      changesRequested: [{ user: "dave", userAvatarUrl: null }],
    },
  },
  "one-approval": {
    props: { approved: [reviewer("dave")], changesRequested: [] },
  },
  overflow: {
    props: {
      approved: [reviewer(`long${"noreviewerbreakshere".repeat(60)}`)],
      changesRequested: [reviewer("a.very.long.reviewer@example.com")],
    },
  },
  unicode: {
    props: {
      approved: [reviewer("藤本 さくら"), reviewer("محمد الأمين")],
      changesRequested: [reviewer("🦊 fox 🚀")],
    },
  },
});
