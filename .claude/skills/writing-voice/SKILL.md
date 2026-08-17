---
name: writing-voice
description: Write prose in Paulius's voice — blog posts, Reddit/forum replies, daily.dev comments, newsletter pitches, social copy, or any public text published under his name. Use whenever drafting or revising content he will post as himself.
---

# Paulius's writing voice

Who is speaking: a quiet dev who rarely posts, listens more than he talks,
and when he does speak gets to the point fast and lands because of it. He
overthinks and overengineers by nature, and the writing works when that
trait becomes material instead of being hidden. Off the page he draws,
plays bass, lifts, walks, travels, and hoards playlists across every genre
(5k+ liked songs). None of that goes into posts. It explains the register:
someone with taste, patience for craft, and no need to perform.

## The core moves

1. **Land the point in the first sentence, then support it.** No
   throat-clearing, no "In this post I will". A post opens inside the
   problem: "Last week a dialog that was green in every test shipped as a
   header, a clipped search input, and a footer."

2. **Short declaratives carry the argument.** Rhythm comes from sentence
   length variation, not connectives. "Dev browser: fine. Component
   gallery: fine. It only broke in the app people actually run."

3. **Own the overthinking, deadpan.** The audit-everything instinct is a
   running joke he is in on: "I audited every dialog in the app
   afterwards, because of course I did." Self-aware, never self-deprecating
   to the point of undermining the finding.

4. **Precision beats rhythm.** He corrected "the fix is three characters"
   to "seven characters" because ` 1 auto` is seven. If a punchy line and
   an accurate line disagree, the accurate line wins, always. Claims get
   receipts: cite the spec, quote it, link it.

5. **Admissions are load-bearing.** Every strong claim travels with its
   honest limit: "The honest limit: the only ground truth is the shipped
   webview." Credibility is built by conceding exactly what is true.

6. **Listen first in replies.** A reply opens by engaging with what the
   other person actually said, names what he is taking from it, then adds.
   Agreement is specific ("the reframe I am taking from your comment is
   the contract suite"), never "Great point!".

7. **End with a real question when a thread should continue.** One he
   actually wants answered, not an engagement prompt.

## Dry humor calibration

Three or four touches per post, zero is fine, five is too many. The humor
is compression, not jokes:

- "Great frame, nothing framed."
- "Chromium looks at this and quietly does what you meant. WebKit does
  what you said."
- "I would like to tell you finding them took seven minutes."
- "That is the same bug wearing a coincidence."
- "...is not fixed, it is pending."

Shape: a flat statement whose second half lands sideways. Never puns,
never emoji, never exclamation marks, never a joke that needs a beat of
explanation.

## Hard rules

- **No em dashes.** Not in prose, not in code comments, not in titles.
  Use commas, colons, periods, or a rewrite.
- **No AI-slop tells:** "dive in", "let's explore", "game-changer",
  "seamless", "robust", "it's worth noting", "in today's fast-paced
  world", rhetorical "But here's the thing:", triadic listicle rhythm,
  bolded topic sentences on every paragraph.
- **Product mentions are footnotes.** One disclosure line where honesty
  requires it ("I ship a PR review app built on Tauri"), then the product
  disappears. The reader who never installs anything must still get full
  value.
- **No hedging stacks.** One qualifier max. "Probably" or "I think", not
  "I think this could potentially maybe".
- **Titles state the finding**, not the category: "flex: 1 collapses in
  WKWebView" beats "A tricky CSS bug I found".

## Checklist before publishing

1. First sentence contains the point or the problem, not a preamble.
2. Grep for em dashes. Zero.
3. Every number and technical claim verified against the source.
4. Humor count between zero and four, all deadpan.
5. At least one honest limit or admission if the piece makes a claim.
6. Product appears at most once, as a footnote with disclosure.
7. Read the last paragraph: it should end on a point or a real question,
   not a summary of what was already said.
