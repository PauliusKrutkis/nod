/**
 * Two lists that arrive from different places, so the cases are their states
 * crossed: the watched list loading, unreadable, empty, one, and the long
 * tail that has to scroll inside its own 224px box; the search null (nothing
 * asked yet), in flight, answered with hits, and answered with none. Every
 * repo name is provider-supplied text, hence CJK/RTL/emoji and a name that is
 * one unbreakable token — `overflow` is the case that decides whether a row
 * ellipsizes or shoves the panel off screen.
 *
 * `saving` and `write-failed` are the halves of an optimistic write the app
 * used to render identically to a settled one: the list already shows the
 * edit, so the only honest difference is the status line and the alert.
 * `markup-as-text` is the security case — a repo named `<img …>` must show
 * the tag, never mount it.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import type { RepoHit } from "./watch-repos-dialog.tsx";
import { WatchReposDialog } from "./watch-repos-dialog.tsx";

const noop = () => {
  return;
};

const shared = {
  hits: null,
  onOpenChange: noop,
  onQueryChange: noop,
  onStopWatching: noop,
  onWatch: noop,
  open: true,
  query: "",
};

const TYPICAL = ["acme/rocket", "acme/comet", "nod-dev/nod"];

const MANY = Array.from(
  { length: 60 },
  (_, i) => `acme/service-${String(i).padStart(3, "0")}`
);

const LONG_NAME = `${"unbreakable-owner-segment-".repeat(12)}org/${"unbreakable-repo-segment-".repeat(12)}repo`;

const HITS: RepoHit[] = [
  { description: "The main product repo", fullName: "acme/rocket" },
  { description: "", fullName: "acme/comet" },
  {
    description:
      "A description long enough to need the ellipsis it was given, twice over",
    fullName: "acme/probe",
  },
];

export const watchReposDialogEntry = defineEntry(
  WatchReposDialog,
  {
    "crowd-60": { props: { ...shared, repos: MANY } },
    empty: { props: { ...shared, repos: [] } },
    failed: { props: { ...shared, repos: null } },
    loading: { props: { ...shared, repos: undefined } },
    "markup-as-text": {
      props: {
        ...shared,
        hits: [
          { description: '<img src=x onerror="alert(1)">', fullName: "evil/x" },
        ],
        query: "evil",
        repos: ['<img src=x onerror="alert(1)">/repo'],
      },
    },
    "no-matches": {
      props: {
        ...shared,
        hits: [],
        query: "acme/private-repo",
        repos: TYPICAL,
      },
    },
    "no-matches-plain": {
      props: { ...shared, hits: [], query: "zzzz", repos: TYPICAL },
    },
    overflow: {
      props: {
        ...shared,
        hits: [{ description: LONG_NAME, fullName: LONG_NAME }],
        query: LONG_NAME,
        repos: [LONG_NAME, "acme/rocket"],
      },
    },
    saving: { props: { ...shared, repos: TYPICAL, saving: true } },
    "search-results": {
      props: { ...shared, hits: HITS, query: "acme", repos: ["acme/rocket"] },
    },
    searching: {
      props: { ...shared, query: "acm", repos: TYPICAL, searching: true },
    },
    single: { props: { ...shared, repos: ["acme/rocket"] } },
    unicode: {
      props: {
        ...shared,
        hits: [
          { description: "الريبو الرئيسي", fullName: "محمد-الأمين/مستودع" },
        ],
        query: "藤本",
        repos: ["藤本-さくら/日本語-リポジトリ", "محمد-الأمين/مستودع", "🚀/🎉"],
      },
    },
    "write-failed": {
      props: {
        ...shared,
        error:
          "Couldn't save the list: 403 Forbidden (token missing repo scope)",
        repos: TYPICAL,
      },
    },
  },
  { dialog: true }
);
