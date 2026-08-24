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

**Home:** r/tauri, HN, r/webdev. Not r/rust: the post is 680 words of CSS
and WebKit with one mention of Tauri and none of Rust, so it is off topic
there and a removal costs the sub that idea 6 actually needs.

**Shipped** 2026-08-14 as `/blog/wkwebview-flex-collapse/`. Submitted to
r/tauri (2 points, no comments) and r/Playwright (3 points, 4 comments, and
a genuinely good exchange about running a macOS-native contract suite over
layout primitives). HN refuses the domain: "Sorry, your account isn't able
to submit this site", which is a site-level block on a domain registered
three weeks earlier with a pricing page on it. Emailed hn@ycombinator.com.

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

Confirmed live on 2026-08-23 by scraping Reddit for review-pain threads:
r/github "How do people usually handle reviewing very large PRs" (May 2026)
is the ledger problem stated verbatim, reviews across multiple sessions and
losing track of what was already read; r/ClaudeCode and r/ExperiencedDevs
both carry 2026 threads about spending longer reviewing AI code than writing
it. The demand side of this post is asking for it in public.

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

## 10. The 429 that means your JSON is wrong

**Hook:** the gateway said "All providers are rate limited". It was not a rate
limit. It was one unsupported parameter, and a parameter I invented proved it.

**Why it lands:** everyone routing through an OpenAI-compatible gateway
(Nexos, OpenRouter, LiteLLM, Portkey, Bedrock shims) eventually gets a status
that describes the pool rather than the request, and goes looking for quota
that is not the problem. The debugging is the post and it is short: the same
model answered 200 with no `reasoning_effort` and 429 with it at any level, in
about 100 ms, which is too fast to be a real limit, and a real limit does not
discriminate by parameter. The control is the part people will remember. Send
`banana_split: 3`, a parameter that cannot exist, and get the identical 429.
That is not quota, that is a router refusing a shape.

The second half is the unwritten bit: you cannot know in advance which models
take a thinking level. The model list carries no capability field, and the
platform does not predict it. Claude Sonnet 5 refuses where Gemini 3 Flash, on
the same Vertex platform, accepts, and Azure and Mistral refuse with a clean
400 instead. So the only honest design is to learn from the first refusal,
remember it against the model, and stop offering the control. Publish the
matrix; nobody else has.

Third beat, with teeth for anyone building on this: a rate limit misread as
"this provider has no tools" makes the retry drop the tools and answer
ungrounded, which looks exactly like a normal answer. Degrade on the statuses
that describe the request (400, 422), never on the ones that describe the
caller.

**Source:** `docs/AI.md` § Budgets and § Protocol, `ai_chat.rs`
(`route_refused`), probe transcripts from 2026-08-19.

**Home:** r/LocalLLaMA, r/LLMDevs, HN. Searchable in a way most of this list
is not: people paste the error string into a search box.

---

## 11. Cache-first, not local-first

**Hook:** open a PR in under 300 ms, switch files in under 16 ms, read on a
train. And it is deliberately not local-first: the host owns the data, and
pretending otherwise is how sync bugs are born.

**Why it lands:** local-first is a live conversation with a strong community
and almost no published cases of stopping halfway on purpose. The argument is
the post: a PR client's source of truth is GitHub, so a CRDT-grade sync
engine would own state it has no authority over. What the app actually needs
is a cache with honest semantics: paint everything from the local copy
instantly, reconcile in the background, and let writes ride the optimistic
path from idea 5. The perf budget numbers make it concrete, and `nod://`
links hydrating cache-first before the network answers is the demo.

Unlike most of this list, the product benefit is visible in the post itself:
the reader who clicks through sees the speed the architecture buys. This is
the craft post most likely to convert a reader into a user without ever
pitching them.

**Source:** `docs/ARCHITECTURE.md` § Caching, `docs/DESIGN.md` perf budgets,
the `nod://` hydration work.

**Home:** HN, lobste.rs, r/localfirst (as the friendly dissent), daily.dev.

---

## 12. The AI feature has no cloud on purpose

**Hook:** ask-about-code sends your diff to your provider, from your machine,
on your key. There is no middle server because a review tool that proxies
your private diffs has changed what it is.

**Why it lands:** every AI review product on the market is a cloud that reads
your code, and the 2026 threads about AI-generated PRs are full of people
uneasy about exactly that. The position is simple to state and rare to hold:
a $59 desktop app should not quietly become a data processor, so the app
ships the integration without shipping a service. BYOK is the whole
architecture: the webview never sees the key (idea 6), the Rust side talks to
the provider directly, and nothing is resold on top of the license.

The admissions carry it: BYOK onboarding is objectively worse (get a key,
paste it), capability differences between providers are a real tax (idea 10's
matrix), and there is no margin to subsidize anyone's tokens. Those costs are
the price of the trust boundary staying where it already was.

**Why it attracts users:** it is the differentiator post. Craft posts earn
reach; this one gives the reader who already wants AI-assisted review a
reason to pick this app over the clouds, without the post being a pitch.

**Source:** `docs/AI.md`, `ai_chat.rs`, the FAQ's bring-your-own-key answer.

**Home:** HN, r/LocalLLaMA, r/ExperiencedDevs (discussion framing, no link),
daily.dev.

---

## Sequencing

2 shipped on 2026-08-14. Then 1, the strongest pure-craft post, then 4, while
the competitive window is open. 10 sits beside 2 as the other post someone
finds by pasting an error into a search box.

For attracting users rather than readers, 12 then 11: 12 meets the
AI-review anxiety that is live in 2026 threads right now, and 11 is the
craft post whose payoff is the product's visible speed. Both stay honest to
the footnote rule; they just pick topics where the footnote is the answer
to the reader's actual question.

One post per week or so, each to a single primary home. Cross-posting the same
text to five subs the same day is the thing that gets a domain filtered.

## What post 2 actually did (measured 2026-08-19)

Writing was never the bottleneck. The reach was.

- Site, 30 days: 150 views, 120 visits, and Cloudflare samples in tens, so the
  raw beacon hits are nearer a tenth of that. By path: `/` 80, the post 50,
  `/downloads` 10, `/faq` 10.
- Referrers: `nodreview.com` 200 and blank 100. No third one. Reddit strips
  referrers from its app, so the blank bucket is where those readers landed,
  which is why the referrer table cannot be read as "nobody came".
- Reddit: 2 points on r/tauri, 3 points and 4 comments on r/Playwright. Both
  at a 1.0 upvote ratio, so nobody disliked it. Almost nobody saw it.
- Repo, 14 days: 350 views from 4 unique visitors. 0 stars, 0 forks, 0
  watchers since 2026-06-25. The 7,127 clones are Actions.
- 40 installer downloads across every release ever; 2 each for v0.6.0, v0.7.0
  and v0.8.0, which is what one person on two architectures looks like.

The venues with reach were never tried. HN has no submission of the domain at
all, and blocks it (see idea 2). r/programming and r/webdev are untried. The
next move is not the next post, it is getting this one in front of a room with
people in it, and watching for a referrer that is not our own domain.
