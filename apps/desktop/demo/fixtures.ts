/**
 * The demo's staged world: a morning-inbox queue where every pull request
 * opens into its own review — real descriptions, themed multi-folder diffs,
 * and stats that agree between the list row and the detail pane. Patches and
 * full-file blobs derive from one prefixed-line source (`demoFile`), so the
 * viewer's full-file expansion always agrees with the patch by construction.
 * Four file-set themes rotate across the queue (search feature, diff-viewer
 * work, Rust backend, hotkeys/docs chore), each matched to its PR's title so
 * what a visitor opens is what the row promised.
 */

import type { InboxFixture } from "../e2e/fixtures.ts";
import { DETAIL, makePr } from "../e2e/fixtures.ts";

type PrFixture = ReturnType<typeof makePr>;

interface DemoFileSpec {
  path: string;
  status: "added" | "modified";
  diff: string[];
  tail?: string[];
}

interface DemoFile {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  patch: string;
  sha: string;
  status: string;
}

/**
 * Derives a unified patch and the matching new-side blob from one hunk of
 * prefixed lines starting at line 1. Added files carry only "+" lines;
 * modified files interleave " ", "-", and "+". `tail` lines exist only in
 * the blob — they are what full-file expansion reveals beyond the hunk.
 */
function demoFile(spec: DemoFileSpec): {
  blob: string;
  file: DemoFile;
} {
  const newLines = spec.diff
    .filter((l) => l.startsWith(" ") || l.startsWith("+"))
    .map((l) => l.slice(1));
  const oldLines = spec.diff
    .filter((l) => l.startsWith(" ") || l.startsWith("-"))
    .map((l) => l.slice(1));
  const additions = spec.diff.filter((l) => l.startsWith("+")).length;
  const deletions = spec.diff.filter((l) => l.startsWith("-")).length;
  const header =
    spec.status === "added"
      ? `@@ -0,0 +1,${newLines.length} @@`
      : `@@ -1,${oldLines.length} +1,${newLines.length} @@`;
  return {
    blob: [...newLines, ...(spec.tail ?? []), ""].join("\n"),
    file: {
      additions,
      changes: additions + deletions,
      deletions,
      filename: spec.path,
      patch: [header, ...spec.diff].join("\n"),
      sha: spec.path.replaceAll("/", "-"),
      status: spec.status,
    },
  };
}

const SEARCH_SET: DemoFileSpec[] = [
  {
    path: "src/lib/fuzzy.ts",
    status: "modified",
    diff: [
      " export interface Match {",
      "   score: number;",
      "   ranges: [number, number][];",
      " }",
      " ",
      "-export function fuzzyMatch(query: string, text: string): Match | null {",
      "-  return text.includes(query) ? { score: 1, ranges: [] } : null;",
      "+const GAP_PENALTY = 0.35;",
      "+const BOUNDARY_BONUS = 1.6;",
      "+",
      "+export function fuzzyMatch(query: string, text: string): Match | null {",
      "+  const q = query.toLowerCase();",
      "+  const t = text.toLowerCase();",
      "+  let score = 0;",
      "+  let last = -1;",
      "+  const ranges: [number, number][] = [];",
      "+  for (const ch of q) {",
      "+    const at = t.indexOf(ch, last + 1);",
      "+    if (at === -1) {",
      "+      return null;",
      "+    }",
      '+    const boundary = at === 0 || t[at - 1] === "/" || t[at - 1] === "-";',
      "+    score += boundary ? BOUNDARY_BONUS : 1;",
      "+    if (last >= 0 && at - last > 1) {",
      "+      score -= GAP_PENALTY * (at - last - 1);",
      "+    }",
      "+    extendRange(ranges, at);",
      "+    last = at;",
      "+  }",
      "+  return { score: score / q.length, ranges };",
      " }",
      "+",
      "+function extendRange(ranges: [number, number][], at: number) {",
      "+  const tail = ranges.at(-1);",
      "+  if (tail && tail[1] === at) {",
      "+    tail[1] = at + 1;",
      "+    return;",
      "+  }",
      "+  ranges.push([at, at + 1]);",
      "+}",
    ],
    tail: ["", "export const FUZZY_VERSION = 2;"],
  },
  {
    path: "src/lib/fuzzy.test.ts",
    status: "added",
    diff: [
      '+import { describe, expect, it } from "vitest";',
      "+",
      '+import { fuzzyMatch } from "./fuzzy.ts";',
      "+",
      '+describe("fuzzyMatch", () => {',
      '+  it("prefers boundary hits over mid-word hits", () => {',
      '+    const boundary = fuzzyMatch("sp", "search-pane");',
      '+    const buried = fuzzyMatch("sp", "response");',
      "+    expect(boundary?.score).toBeGreaterThan(buried?.score ?? 0);",
      "+  });",
      "+",
      '+  it("penalises gaps between matched characters", () => {',
      '+    const tight = fuzzyMatch("fuz", "fuzzy");',
      '+    const spread = fuzzyMatch("fuz", "fastuz");',
      "+    expect(tight?.score).toBeGreaterThan(spread?.score ?? 0);",
      "+  });",
      "+",
      '+  it("returns null when a character never appears", () => {',
      '+    expect(fuzzyMatch("xq", "search")).toBeNull();',
      "+  });",
      "+});",
    ],
  },
  {
    path: "src/components/search/search-pane.tsx",
    status: "added",
    diff: [
      '+import { useMemo, useState } from "react";',
      "+",
      '+import { fuzzyMatch } from "../../lib/fuzzy.ts";',
      '+import type { PullRequest } from "../../types.ts";',
      "+",
      "+interface SearchPaneProps {",
      "+  prs: PullRequest[];",
      "+  onOpen: (pr: PullRequest) => void;",
      "+}",
      "+",
      "+export function SearchPane({ prs, onOpen }: SearchPaneProps) {",
      '+  const [query, setQuery] = useState("");',
      "+  const hits = useMemo(() => {",
      "+    if (!query) {",
      "+      return prs;",
      "+    }",
      "+    return prs",
      "+      .map((pr) => ({ pr, match: fuzzyMatch(query, pr.title) }))",
      "+      .filter((hit) => hit.match !== null)",
      "+      .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))",
      "+      .map((hit) => hit.pr);",
      "+  }, [prs, query]);",
      "+",
      "+  return (",
      '+    <div className="search-pane">',
      "+      <input",
      "+        autoFocus",
      '+        placeholder="Jump to a pull request…"',
      "+        value={query}",
      "+        onChange={(e) => setQuery(e.target.value)}",
      "+      />",
      "+      {hits.map((pr) => (",
      "+        <button key={pr.id} onClick={() => onOpen(pr)} type=\"button\">",
      "+          {pr.title}",
      "+        </button>",
      "+      ))}",
      "+    </div>",
      "+  );",
      "+}",
    ],
  },
  {
    path: "docs/search.md",
    status: "added",
    diff: [
      "+# Search",
      "+",
      "+Fuzzy matching scores each query character against the candidate:",
      "+",
      "+- boundary hits (start of a word or after `/` and `-`) score highest",
      "+- gaps between matched characters are penalised per skipped character",
      "+- scores normalise by query length so short queries stay comparable",
      "+",
      "+The matcher returns the hit ranges so the UI can highlight them.",
    ],
  },
];

const VIEWER_SET: DemoFileSpec[] = [
  {
    path: "src/components/viewer/diff-row.tsx",
    status: "modified",
    diff: [
      ' import { cn } from "../../lib/cn.ts";',
      ' import type { DiffRow } from "../../types.ts";',
      " ",
      " interface DiffRowProps {",
      "   row: DiffRow;",
      "   cursor: boolean;",
      " }",
      " ",
      " export function DiffRowView({ row, cursor }: DiffRowProps) {",
      "-  const anchor = row.lineAfter ?? 0;",
      "+  const anchor = row.lineAfter ?? row.lineBefore ?? 0;",
      "   return (",
      "     <div",
      '       className={cn("diff-row", cursor && "diff-row--cursor")}',
      "-      data-line={anchor}",
      "+      data-anchor={anchor}",
      "+      data-side={row.lineAfter === null ? \"before\" : \"after\"}",
      "     >",
      "       <span>{row.text}</span>",
      "     </div>",
      "   );",
      " }",
    ],
    tail: ["", "export const ROW_HEIGHT = 26;"],
  },
  {
    path: "src/lib/scroll-anchor.ts",
    status: "added",
    diff: [
      "+export interface Anchor {",
      "+  line: number;",
      "+  offset: number;",
      "+}",
      "+",
      "+export function captureAnchor(container: HTMLElement): Anchor | null {",
      "+  const rows = container.querySelectorAll<HTMLElement>(\"[data-anchor]\");",
      "+  for (const row of rows) {",
      "+    const top = row.getBoundingClientRect().top;",
      "+    if (top >= 0) {",
      "+      return {",
      "+        line: Number(row.dataset.anchor),",
      "+        offset: top,",
      "+      };",
      "+    }",
      "+  }",
      "+  return null;",
      "+}",
      "+",
      "+export function restoreAnchor(container: HTMLElement, anchor: Anchor) {",
      "+  const row = container.querySelector<HTMLElement>(",
      "+    `[data-anchor=\"${anchor.line}\"]`",
      "+  );",
      "+  if (row) {",
      "+    container.scrollTop += row.getBoundingClientRect().top - anchor.offset;",
      "+  }",
      "+}",
    ],
  },
  {
    path: "styles/viewer.css",
    status: "modified",
    diff: [
      " .diff-row {",
      "   display: grid;",
      "   grid-template-columns: 48px 48px 1fr;",
      "-  scroll-margin-top: 0;",
      "+  scroll-margin-top: var(--sticky-header-height);",
      " }",
      " ",
      " .diff-row--cursor {",
      "   background: var(--accent-soft);",
      "+  box-shadow: inset 2px 0 0 var(--accent);",
      " }",
    ],
  },
];

const BACKEND_SET: DemoFileSpec[] = [
  {
    path: "src-tauri/src/snapshot.rs",
    status: "added",
    diff: [
      "+use std::path::PathBuf;",
      "+",
      "+use serde::Serialize;",
      "+",
      "+#[derive(Serialize)]",
      "+pub struct Snapshot {",
      "+    pub head_sha: String,",
      "+    pub fetched_at: i64,",
      "+    pub path: PathBuf,",
      "+}",
      "+",
      "+impl Snapshot {",
      "+    pub fn is_stale(&self, now: i64) -> bool {",
      "+        now - self.fetched_at > 60",
      "+    }",
      "+}",
      "+",
      "+pub fn prune(snapshots: Vec<Snapshot>, keep: usize) -> Vec<Snapshot> {",
      "+    let mut sorted = snapshots;",
      "+    sorted.sort_by_key(|s| std::cmp::Reverse(s.fetched_at));",
      "+    sorted.truncate(keep);",
      "+    sorted",
      "+}",
    ],
  },
  {
    path: "src-tauri/src/commands.rs",
    status: "modified",
    diff: [
      " #[tauri::command]",
      " pub async fn ensure_repo_snapshot(",
      "     state: tauri::State<'_, AppState>,",
      "     owner: String,",
      "     name: String,",
      " ) -> Result<SnapshotStatus, String> {",
      "-    let snapshot = state.cache.fetch(&owner, &name).await?;",
      "+    if let Some(fresh) = state.cache.fresh(&owner, &name) {",
      "+        return Ok(SnapshotStatus::Cached(fresh));",
      "+    }",
      "+    let snapshot = state.cache.refresh(&owner, &name).await?;",
      "     Ok(SnapshotStatus::Fetched(snapshot))",
      " }",
    ],
  },
  {
    path: "src/lib/api.ts",
    status: "modified",
    diff: [
      ' import { invoke } from "@tauri-apps/api/core";',
      " ",
      " export const api = {",
      "   ensureRepoSnapshot: (owner: string, name: string) =>",
      '-    invoke<SnapshotStatus>("ensure_repo_snapshot", { owner, name }),',
      '+    invoke<SnapshotStatus>("ensure_repo_snapshot", {',
      "+      name,",
      "+      owner,",
      "+    }),",
      " };",
    ],
  },
];

const CHORE_SET: DemoFileSpec[] = [
  {
    path: "src/hooks/use-hotkeys.ts",
    status: "modified",
    diff: [
      " const BINDINGS = [",
      '   { keys: "j", run: "cursorDown" },',
      '   { keys: "k", run: "cursorUp" },',
      '   { keys: "enter", run: "open" },',
      '-  { keys: "e", run: "archive" },',
      '+  { keys: "e", run: "archive", repeatable: false },',
      '+  { keys: "s", run: "submitReview" },',
      '+  { keys: "c", run: "comment" },',
      " ] as const;",
      " ",
      " export function useHotkeys(scope: HotkeyScope) {",
      "   useEffect(() => {",
      "     const onKeyDown = (e: KeyboardEvent) => {",
      "-      const binding = BINDINGS.find((b) => b.keys === e.key);",
      "+      const binding = BINDINGS.find((b) => b.keys === e.key);",
      "+      if (binding && e.repeat && binding.repeatable === false) {",
      "+        return;",
      "+      }",
      "       if (binding) {",
      "         scope.run(binding.run);",
      "       }",
      "     };",
      '     window.addEventListener("keydown", onKeyDown);',
      '     return () => window.removeEventListener("keydown", onKeyDown);',
      "   }, [scope]);",
      " }",
    ],
  },
  {
    path: "docs/KEYMAP.md",
    status: "added",
    diff: [
      "+# Keymap",
      "+",
      "+| Key | Action |",
      "+| --- | ------ |",
      "+| j / k | move the cursor |",
      "+| enter | open the selected pull request |",
      "+| e | archive (ignores key repeat) |",
      "+| c | comment on the cursor line |",
      "+| s | submit the review |",
      "+",
      "+Bindings live in `src/hooks/use-hotkeys.ts`; every action goes through",
      "+the same scope runner so the help overlay stays truthful.",
    ],
  },
];

interface DemoPrSpec {
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  body: string;
  set: DemoFileSpec[];
  commentsCount?: number;
  ciFailed?: boolean;
}

const DEMO_PR_SPECS: DemoPrSpec[] = [
  {
    author: "alice",
    body: [
      "Replaces the substring check with a proper scorer:",
      "",
      "- boundary hits (word starts, after `/` and `-`) outrank buried hits",
      "- gaps between matched characters cost `GAP_PENALTY` each",
      "- scores normalise by query length",
      "",
      "The search pane sorts by score and highlights the matched ranges.",
    ].join("\n"),
    commentsCount: 2,
    number: 1,
    set: SEARCH_SET,
    title: "Add fuzzy matching to search",
    updatedAt: "2026-07-02T10:00:00Z",
  },
  {
    author: "bob",
    body: "The cursor anchored to `lineAfter` only, so deleted rows resolved to line 0 and the cursor jumped whenever a hunk collapsed above it. Anchor to whichever side exists and keep the sticky header out of the scroll math.",
    commentsCount: 1,
    number: 62,
    set: VIEWER_SET,
    title: "Fix cursor drift in diff viewer",
    updatedAt: "2026-07-02T09:00:00Z",
  },
  {
    author: "carol",
    body: "Snapshot lookups now check freshness before hitting the network, and pruning keeps the newest N per repo instead of growing forever.",
    ciFailed: true,
    number: 60,
    set: BACKEND_SET,
    title: "Rework the token gate",
    updatedAt: "2026-07-02T08:00:00Z",
  },
  {
    author: "dave",
    body: "Capture the first visible row and its offset before relaunch, restore it after the diff paints — the same file and scroll position you left.",
    number: 57,
    set: VIEWER_SET,
    title: "Restore scroll position on relaunch",
    updatedAt: "2026-07-01T18:00:00Z",
  },
  {
    author: "erin",
    body: "Refresh answers from the snapshot cache when it is fresh and only then falls back to the network, so the quiet refresh never blocks paint.",
    number: 55,
    set: BACKEND_SET,
    title: "Quiet background refresh",
    updatedAt: "2026-07-01T12:00:00Z",
  },
  {
    author: "frank",
    body: "Diffs render from the pruned local snapshot store when offline; stale snapshots are refreshed lazily on focus.",
    number: 54,
    set: BACKEND_SET,
    title: "Snapshot store for offline diffs",
    updatedAt: "2026-06-30T16:00:00Z",
  },
  {
    author: "grace",
    body: "Comments queue into a pending review by default; `⌘↵` still sends one immediately.",
    number: 52,
    set: VIEWER_SET,
    title: "Batch pending comments into one review",
    updatedAt: "2026-06-30T11:00:00Z",
  },
  {
    author: "hank",
    body: "One table of bindings drives both the runtime and the help overlay, and archive now ignores key repeat.",
    number: 51,
    set: CHORE_SET,
    title: "Keyboard map for triage",
    updatedAt: "2026-06-30T09:00:00Z",
  },
  {
    author: "iris",
    body: "Focus-triggered refreshes collapse into one in-flight request per bucket.",
    number: 49,
    set: BACKEND_SET,
    title: "Debounce the inbox refresh",
    updatedAt: "2026-06-29T17:00:00Z",
  },
  {
    author: "jude",
    body: "Renamed tokens get intraline emphasis on both sides so a rename reads as one edit, not a delete plus an add.",
    number: 48,
    set: VIEWER_SET,
    title: "Intraline emphasis for renames",
    updatedAt: "2026-06-29T13:00:00Z",
  },
  {
    author: "kira",
    body: "The file tree renders only the visible window plus an overscan row, keeping thousand-file PRs smooth.",
    number: 46,
    set: VIEWER_SET,
    title: "Virtualize the file tree",
    updatedAt: "2026-06-28T15:00:00Z",
  },
  {
    author: "liam",
    body: "Viewed state keys on the file's content fingerprint, so it survives rebases that don't touch the file.",
    number: 45,
    set: BACKEND_SET,
    title: "Mark viewed files across sessions",
    updatedAt: "2026-06-28T10:00:00Z",
  },
  {
    author: "mona",
    body: "Lockfiles and generated bundles start collapsed with a one-keystroke expand.",
    number: 43,
    set: VIEWER_SET,
    title: "Collapse generated files by default",
    updatedAt: "2026-06-27T16:00:00Z",
  },
  {
    author: "nate",
    body: "A fresh review request pops a keyboard-dismissable toast; enter opens it.",
    number: 42,
    set: CHORE_SET,
    title: "Toast on new review requests",
    updatedAt: "2026-06-27T09:00:00Z",
  },
];

const CREATED_SPEC: DemoPrSpec = {
  author: "me",
  body: "Find-in-diff marks every match on an overview ruler beside the scrollbar; clicking a tick jumps to that match.",
  number: 64,
  set: VIEWER_SET,
  title: "Overview ruler for find matches",
  updatedAt: "2026-07-02T11:00:00Z",
};

function demoPr(spec: DemoPrSpec): PrFixture {
  const files = spec.set.map((f) => demoFile(f).file);
  return {
    ...makePr(spec.number, spec.title, spec.author, spec.updatedAt),
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    body: spec.body,
    changedFiles: files.length,
    commentsCount: spec.commentsCount ?? 0,
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    lastComment: undefined,
  };
}

function demoDetail(spec: DemoPrSpec) {
  const pr = demoPr(spec);
  const comments =
    spec.number === 1
      ? [
          {
            body: "Do we want the boundary bonus this strong? It dominates short queries.",
            createdAt: "2026-07-02T09:30:00Z",
            diffHunk: "",
            id: 100,
            inReplyToId: null,
            line: 9,
            originalLine: null,
            path: "src/lib/fuzzy.ts",
            resolved: false,
            side: "RIGHT",
            threadId: "T100",
            user: "bob",
            userAvatarUrl: "",
          },
          {
            body: "How about:\n```suggestion\nconst BOUNDARY_BONUS = 1.4;\n```",
            createdAt: "2026-07-02T09:45:00Z",
            diffHunk: "",
            id: 101,
            inReplyToId: 100,
            line: null,
            originalLine: null,
            path: "src/lib/fuzzy.ts",
            resolved: false,
            side: "RIGHT",
            threadId: "T100",
            user: "carol",
            userAvatarUrl: "",
          },
        ]
      : spec.number === 62
        ? [
            {
              body: "Anchoring to whichever side exists — nice. Does the ruler need the same fix?",
              createdAt: "2026-07-02T08:40:00Z",
              diffHunk: "",
              id: 110,
              inReplyToId: null,
              line: 11,
              originalLine: null,
              path: "src/components/viewer/diff-row.tsx",
              resolved: false,
              side: "RIGHT",
              threadId: "T110",
              user: "erin",
              userAvatarUrl: "",
            },
          ]
        : [];
  return {
    ...DETAIL,
    ciStatus: spec.ciFailed
      ? {
          failed: 1,
          state: "failure",
          total: 4,
          url: `https://github.com/acme/rocket/pull/${spec.number}/checks`,
        }
      : {
          failed: 0,
          state: "success",
          total: 4,
          url: `https://github.com/acme/rocket/pull/${spec.number}/checks`,
        },
    comments,
    files: spec.set.map((f) => demoFile(f).file),
    issueComments: [],
    pr,
    reviews: [],
  };
}

const ALL_SPECS = [...DEMO_PR_SPECS, CREATED_SPEC];

export const DEMO_DETAILS: Record<number, unknown> = Object.fromEntries(
  ALL_SPECS.map((spec) => [spec.number, demoDetail(spec)])
);

export const DEMO_FILE_BLOBS: Record<string, string> = Object.fromEntries(
  ALL_SPECS.flatMap((spec) =>
    spec.set.map((f) => [f.path, demoFile(f).blob])
  )
);

export const DEMO_INBOX: InboxFixture = {
  assigned: { count: 0, prs: [] },
  created: { count: 1, prs: [demoPr(CREATED_SPEC)] },
  involved: { count: 0, prs: [] },
  reviewRequested: {
    count: DEMO_PR_SPECS.length,
    prs: DEMO_PR_SPECS.map(demoPr),
  },
};
