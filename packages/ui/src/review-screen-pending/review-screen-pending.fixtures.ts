/**
 * The shell has three shapes and they are all failure-adjacent, so all three
 * are fixtures: the cold open with nothing cached, the warm open where the
 * inbox already knew this PR, and the load that failed. The warm header is
 * the interesting one — its title, repo and author are arbitrary strings
 * arriving at a column that is only 300px narrower than the window, which is
 * where truncation either works or does not.
 *
 * The error string is a stringified backend error, i.e. whatever Rust or the
 * host API produced; the overflow case is the unbreakable-token version of
 * that, which is what a URL in a panic message actually looks like.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { ReviewScreenPending } from "./review-screen-pending.tsx";

const noop = () => {
  return;
};

const base = {
  error: "",
  isError: false,
  onBack: noop,
};

export const reviewScreenPendingEntry = defineEntry(ReviewScreenPending, {
  cached: {
    props: {
      ...base,
      pr: {
        author: "sam-reeves",
        authorAvatarUrl: null,
        number: 274,
        repo: "nod/nod",
        title: "Catalogue the launch cards and the pending review shell",
      },
    },
  },
  cold: { props: { ...base, pr: null } },
  error: {
    props: {
      ...base,
      error: "Error: pull request not found (404)",
      isError: true,
    },
  },
  "error-overflow": {
    props: {
      ...base,
      error: `Error: request failed — https://api.github.com/repos/${"a".repeat(400)}/pulls/274`,
      isError: true,
    },
  },
  overflow: {
    props: {
      ...base,
      pr: {
        author: `contributor-${"with-a-very-long-handle".repeat(8)}`,
        authorAvatarUrl: null,
        number: 1_048_576,
        repo: "an-organisation-with-a-long-name/a-repository-with-an-even-longer-name",
        title: `Refactor ${"everything".repeat(60)}`,
      },
    },
    provenance:
      "at the 280px capture width the fixed file column swallowed the frame and pushed the pane off screen",
  },
  unicode: {
    props: {
      ...base,
      pr: {
        author: "藤本 さくら",
        authorAvatarUrl: null,
        number: 42,
        repo: "組織/リポジトリ",
        title: "レビュー画面の骨組みを整える 🎏 — محمد الأمين",
      },
    },
  },
});
