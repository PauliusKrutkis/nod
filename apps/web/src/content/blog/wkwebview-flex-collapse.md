---
title: "flex: 1 collapses in WKWebView, and your tests will not tell you"
description: "A dialog shipped as a header and a footer with nothing in between. Chromium was fine, Playwright's WebKit was fine, the real webview was not. The whole bug is one flex shorthand."
pubDate: 2026-08-14
thumbnail: /blog/wkwebview-flex-collapse.png
---

Nod is a Tauri app, so on macOS the UI renders in WKWebView. Last week a
dialog that was green in every test shipped as a header, a clipped search
input, and a footer. The body, which is the part with the content,
contributed a height of zero. Great frame, nothing framed.

Dev browser: fine. Component gallery: fine. Playwright, including
Playwright's WebKit: fine. It only broke in the app people actually run.

## The one line

```css
.qw-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

`flex: 1` looks harmless because everyone types it daily. It expands to
`flex: 1 1 0%`, and that `0%` is the bug. A percentage basis has to resolve
against the parent's height. A dialog panel does not have a height. It has
`height: auto` capped by `max-height`, and a cap is not a definite height,
so the percentage has nothing to resolve against.

Chromium sizes the body from its content instead, which is not Chromium
being generous. It is what the
[spec](https://www.w3.org/TR/css-flexbox-1/#flex-basis-property) asks for:
percentages resolve against the flex container, "and if that containing
block's size is indefinite, the used value for `flex-basis` is `content`."
WebKit skips that fallback and keeps the zero. Nothing else supplies a
height, so the body gets exactly that.

Which is backwards from how this usually goes. The engine I test in is the
one following the spec. The engine I ship in is the other one.

The fix is seven characters:

```css
flex: 1 1 auto;
```

An `auto` basis starts from the content size, which exists whether or not
the parent's height is definite. Seven characters. I would like to tell you
finding them took seven minutes.

## Why every test was green

We screenshot every component across fixtures and themes, in CI, in WebKit.
Not one pixel moved, because Playwright's WebKit is not WKWebView. It is a
recent WebKit the Playwright team builds themselves. The webview you ship
is the system framework, a different build that disagrees at exactly this
kind of edge.

So the test layer that exists to catch layout bugs was structurally unable
to catch this one. Screenshot baselines prove the component renders. They
say nothing about how it lays out in the engine you actually ship.

## The other copies

I audited every dialog in the app afterwards, because of course I did.

One more body carried the same shorthand, broken the same way. More
interesting were the surfaces that worked: the command palette has the
identical `flex: 1` and survives only because its panel floors at a
`min-height` the zero-basis body can grow into. That is not working code.
That is the same bug wearing a coincidence.

House rule now: inside any auto-height panel, `flex: 1 1 auto`, never the
shorthand, with a comment saying why so nobody simplifies it back.

## What changed

More screenshots cannot fix this, so two other things did. The data shape
that triggered it, both lists long at once, is now a permanent fixture. And
two e2e tests assert geometry instead of pixels: body taller than zero,
last row reachable. Cruder than screenshots, but they encode the invariant
that broke, and they hold in any engine.

The honest limit: the only ground truth is the shipped webview. Some slice
of your checks has to run there, or you have a blind spot shaped like this
post.

## Takeaways

- `flex: 1` means `flex-basis: 0%`, and a percentage needs a definite
  parent height. `max-height` does not make one.
- The spec says an unresolvable percentage basis becomes `content`.
  Chromium does that. WebKit gives you zero.
- Playwright's WebKit is not WKWebView. Close is not the same engine.
- A surface that works because of an unrelated `min-height` is not fixed,
  it is pending.
