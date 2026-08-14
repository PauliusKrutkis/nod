# Content — standalone technical posts

Post ideas mined from this repo, ranked by how well they stand on their own
without Nod being the point. Each one is something learned building the app
that is useful to someone who will never install it. Nod is the footnote, not
the pitch — that is what earns the reach.

The daily.dev launch post sits on a personal profile and gets little
distribution by design. These are the posts that travel: r/programming,
r/rust, r/tauri, r/reactjs, lobste.rs, Hacker News, and daily.dev Squads.

---

## 1. No browser focus ring, anywhere

**Hook:** we deleted the UA focus outline once, unscoped, and added a test
that fails the build if any component reintroduces `outline`.

**Why it lands:** almost every keyboard-heavy web app hits this and patches it
per-component with `outline: none`, which is a decision with as many owners as
there are components. The post has a concrete failure mode: a mouse click
silently focuses a list row, the next keypress promotes it to `:focus-visible`,
and a ring appears out of nowhere on some chrome button beside the list you are
actually looking at — a second cursor competing with the real one.

The strong part is the rule that replaces it: if `Tab` can reach a control it
carries the shared ring; if it cannot, it leaves the tab order entirely and the
keys stay with the keyboard layer. Never a control that `Tab` reaches and
nothing marks. Plus the accessibility answer — `aria-activedescendant` on the
container, rows never DOM-focusable — which is the part people get wrong.

**Source:** `docs/DESIGN.md` § Selection vs. focus. Already written, nearly
publishable as-is.

**Home:** r/programming, r/webdev, lobste.rs, HN.

---

## 2. Playwright will never reproduce your WKWebView layout bug

**Hook:** the gallery screenshots are green in Chromium and green in
Playwright's WebKit, and the panel still collapses in the real app.

**Why it lands:** this is a genuinely under-documented trap for anyone shipping
Tauri on macOS. Playwright's WebKit is not WKWebView, and the difference bites
exactly where it hurts — `flex: 1` resolves to a `0%` basis and collapses
column children of an auto-height dialog panel; `flex: 1 1 auto` is the fix.
Nobody has written this post, and people search for it after losing an evening.

Pair it with what actually catches these: one scroller per list, and screenshot
baselines that only prove the component renders, not that it lays out under a
real webview.

**Source:** the WebKit layout notes, `packages/ui`, recent dialog fixes
(`fix(ui): stop the watch dialog collapsing in WebKit`).

**Home:** r/tauri, r/rust, HN. Highest signal-to-effort ratio on this list.

---

## 3. We render code without an editor library, on purpose

**Hook:** no CodeMirror, no Monaco. highlight.js per line, one paint unit, one
matcher, one navigation model.

**Why it lands:** contrarian but fully argued, and the argument is specific
rather than NIH. The review pane is find-and-occurrences over a *lazily
mounted, multi-file patch stream* — matches computed from patch text, anchored
`SIDE:line`, coexisting with comment threads, intraline marks and an overview
ruler. Editor merge views diff two whole documents; nothing does host-style
patch hunks across a PR. So the diff stays custom no matter what, and adopting
an editor for secondary surfaces buys two find UIs, two mark styles, two
keyboard models and a theme synced by hand.

The credibility move is publishing the re-evaluation trigger too: if a feature
needs the document to restructure under the reader — folding, inline widgets
between arbitrary tokens — that is the point to reconsider, and we would say so.

**Source:** `docs/ARCHITECTURE.md` § Code view. Already argued in full.

**Home:** r/programming, lobste.rs, HN.

---

## 4. Nobody reviews merged code

**Hook:** git has no concept of review state. Once code merges, nothing tracks
whether a human ever read it — and AI now writes a large share of what merges.

**Why it lands:** it is a thesis post, not a feature post, and the timing is
live. The idea that "review coverage of main" should be a number teams can see
and ratchet is arguable in a good way, and the design choices are interesting
on their own: review attaches to content on tip, not to diffs in history; the
unit shown to a reviewer is the cumulative net diff since anyone last signed;
facts live in `refs/ledger/facts` and sync through the ordinary git remote,
with no new server.

**Caveat:** this is the closest to a product pitch, so it needs the most
discipline. Lead with the problem and the data model, ship the engine as
something people can run, and let Nod be the client mentioned at the end.

**Timing:** someone posted `nisi` to r/tauri five days ago — a Tauri code
review app whose headline feature is "re-review only what changed since you
last looked." Adjacent enough that being second to publish the idea costs
something. Worth moving on.

**Source:** `docs/LEDGER.md`, `packages/ledger`.

**Home:** HN (Show HN with the CLI), r/ExperiencedDevs (discussion framing
only, no link), daily.dev Squads.

---

## 5. No loading states — optimistic everywhere

**Hook:** buttons never enter a "Submitting…" mode. Full-screen spinners are a
design bug.

**Why it lands:** the principle is stated more sharply here than most teams
dare — the user's action is always right until the network proves otherwise;
comments, replies and review submissions apply instantly and reconcile in the
background; a failure rolls back and says so in a toast, it never blocks up
front. The only acceptable loading is a cold cache, and even then you paint the
shell from inbox metadata plus a quiet skeleton.

The corollary is the part worth writing: drafts survive navigation and
restarts, because optimistic UI without durable drafts is just a way to lose
someone's work. Ties into the cache-first architecture and the perf budget
(open < 300 ms, switch PR < 100 ms, switch file < 16 ms).

**Source:** `docs/DESIGN.md` § Design principles 2 and 6.

**Home:** r/reactjs, r/webdev, daily.dev.

---

## 6. Your API token should never reach the webview

**Hook:** in a Tauri app the frontend is still a browser. Treat it like one.

**Why it lands:** a clean, teachable layering story — the webview calls typed
`invoke()` wrappers, every network call runs in Rust, and the token lives in
the backend behind a platform seam with GitHub and GitLab implementations
underneath. Most Tauri tutorials wire `fetch` straight from React and hand the
webview a credential.

Be honest about what is not done yet: the token is plain JSON on disk today and
the OS keychain is still on the list. That admission is what makes the rest
credible.

**Source:** `docs/ARCHITECTURE.md` § Layering, `docs/RUST.md`.

**Home:** r/rust, r/tauri.

---

## 7. Fixtures that try to break the component

**Hook:** every component ships hostile fixtures — overflow, empty, markup-as-
text, minimal — and a screenshot coverage ratchet that will not let the number
go down.

**Why it lands:** concrete, copyable process writing. The gallery renders every
component across fixtures and themes, WebKit screenshots pin them, and any
data-shaped rendering bug becomes a permanent fixture rather than a one-off
fix. The ratchet is the interesting bit: coverage is enforced upward, so new
components cannot quietly ship unphotographed.

**Source:** `apps/gallery`, `packages/ui/**/*.fixtures.ts`, `docs/TESTING.md`.

**Home:** r/reactjs, r/webdev, daily.dev.

---

## 8. A scope-aware keyboard layer

**Hook:** bindings register per scope — inbox, review, palette, help, global —
and only the active scope's single-key bindings fire. `Tab` does not move
focus; it arms the next actionable element.

**Why it lands:** everyone who builds a keyboard-driven web app reinvents this
badly, usually as one giant `keydown` switch. The scope registry plus a help
overlay generated from the live bindings — so the cheatsheet cannot drift from
reality — is a design worth stealing.

**Source:** `apps/desktop/src/keyboard/`, `components/keyboard-help.tsx`.

**Home:** r/reactjs, r/javascript, lobste.rs.

---

## 9. Sold once, source available, Apache in two years

**Hook:** $59 once, not a seat you rent. FSL 1.1 with an Apache 2.0 future
license — read it, build it, change it, use it internally; just don't ship a
competing product. Every release turns Apache two years after it ships.

**Why it lands:** the anti-subscription position is well-trodden, but the
licensing mechanics are not, and FSL is new enough that a real adoption
write-up is useful. What is actually for sale is signed builds and updates,
not the code — that framing is the post.

**Caveat:** business-flavoured, so it belongs in founder-shaped rooms rather
than r/programming.

**Home:** r/SideProject, indiehackers, daily.dev.

---

## Sequencing

Ship 2 first — it is the smallest, the most searchable, and the least like
marketing. Then 1, which is the strongest pure-craft post. Then 4, because the
competitive window is open now.

One post per week or so, each to a single primary home. Cross-posting the same
text to five subs the same day is the thing that gets a domain filtered.
