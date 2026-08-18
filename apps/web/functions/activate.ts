/**
 * GET /activate — post-checkout success page: look up the checkout_id index
 * the webhook stored, sign an activation token, render an "Open Nod" page
 * whose button carries the token as a nod://purchase deep link.
 *
 * Keyed by `?checkout_id=` (Polar's opaque checkout identifier), not
 * `?subject=` — a subject is public, so trusting it alone here would let
 * anyone mint a signed token for a known customer's account with no proof of
 * purchase. checkout_id is unguessable, and it is what Polar templates into
 * the success URL as `{CHECKOUT_ID}` — the only variable it offers, which is
 * why the index is keyed by it rather than by the order id. Once a token has
 * been signed the index is re-put with a 48-hour TTL: the link keeps working
 * while the buyer installs the app (strict delete-on-first-render stranded
 * anyone who closed the tab, with /restore still a stub), then expires.
 *
 * The screen itself, and why it both deep-links and pushes to the app's
 * loopback listener, is in lib/activation-page.ts — this route is only one
 * of the ways a visitor reaches it.
 *
 * A missing index is NOT immediately an invalid link: the buyer arrives here
 * seconds after paying, racing the webhook write through KV's eventual
 * consistency (writes can take up to a minute to reach the buyer's colo —
 * observed live 2026-08-05, when a stored license read as absent for
 * minutes). So a miss serves a 200 "preparing your activation" page that
 * waits for the write instead of failing.
 *
 * That page polls rather than reloading itself. It used to meta-refresh every
 * five seconds with a retry counter in the URL, which meant a buyer watched
 * their browser reload up to twenty-four times, each one repainting the page
 * and flickering the tab through a load. Now it renders once, shows a
 * spinner, and asks `?poll=1` for a small JSON answer in the background; only
 * when that answer says the license is ready does it navigate, once, to the
 * real activation screen. The retry budget moved with it, from the URL into
 * the page's own script. Without JavaScript a noscript meta-refresh keeps the
 * old reload behaviour, since the script is otherwise the only thing that
 * ever advances the page.
 *
 * The interval backs off from two seconds towards eight, because the common
 * case resolves almost immediately and the slow case can run for minutes; a
 * flat two-second poll would spend sixty round trips on the wait it is least
 * likely to shorten.
 *
 * `?poll=1` is deliberately read-only: it reports whether the license
 * resolves and nothing else. It signs no token and does not extend the
 * checkout index's TTL, both of which stay on the render path, so polling can
 * never hand out a credential or quietly lengthen the activation window. A
 * garbage checkout_id costs an attacker nothing either way — it just answers
 * "not ready" forever.
 */
import {
  activationHtmlResponse,
  activationPage,
  PAGE_STYLE,
} from "./lib/activation-page";
import type { Env } from "./lib/env";
import { getCheckoutIndex, getLicense, putCheckoutIndex } from "./lib/kv";
import { signLicenseToken } from "./lib/license-token";
import { withErrorReporting } from "./lib/report";
import { scriptJson } from "./lib/script-json";

const ACTIVATION_WINDOW_SECONDS = 48 * 60 * 60;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 8000;
const POLL_BUDGET_MS = 2 * 60 * 1000;

function preparingPage(checkoutId: string): string {
  const pollUrl = `/activate?checkout_id=${encodeURIComponent(checkoutId)}&poll=1`;
  const pageUrl = `/activate?checkout_id=${encodeURIComponent(checkoutId)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nod · preparing your activation</title>
<style>${PAGE_STYLE}</style>
<noscript><meta http-equiv="refresh" content="5"></noscript>
</head>
<body>
<main>
  <div class="spin" id="spin"></div>
  <h1>Payment received</h1>
  <p id="status">Preparing your activation. This usually takes a few
  seconds.</p>
  <p class="alt" id="slow" hidden>Still preparing. You can leave this page
  open, or <a href="/buy">sign in to activate</a> instead.</p>
</main>
<script>
(function () {
  var pollUrl = ${scriptJson(pollUrl)};
  var pageUrl = ${scriptJson(pageUrl)};
  var deadline = Date.now() + ${POLL_BUDGET_MS};
  var wait = ${POLL_INTERVAL_MS};

  function giveUp() {
    document.getElementById("spin").hidden = true;
    document.getElementById("status").textContent =
      "This is taking longer than it should. If your payment went through, nothing is lost.";
    document.getElementById("slow").hidden = false;
  }

  function poll() {
    fetch(pollUrl)
      .then(function (r) { return r.ok ? r.json() : { ready: false }; })
      .then(function (data) {
        if (data && data.ready) {
          location.replace(pageUrl);
          return;
        }
        schedule();
      })
      .catch(schedule);
  }

  function schedule() {
    if (Date.now() >= deadline) {
      giveUp();
      return;
    }
    setTimeout(poll, wait);
    wait = Math.min(Math.round(wait * 1.5), ${POLL_MAX_INTERVAL_MS});
  }

  poll();
})();
</script>
</body>
</html>`;
}

function readyJson(ready: boolean): Response {
  return new Response(JSON.stringify({ ready }), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  });
}

export const onRequestGet: PagesFunction<Env> = withErrorReporting(
  async (context) => {
    const url = new URL(context.request.url);
    const checkoutId = url.searchParams.get("checkout_id");
    if (!checkoutId) {
      return new Response("missing checkout_id", { status: 400 });
    }
    const polling = url.searchParams.get("poll") === "1";

    const subject = await getCheckoutIndex(context.env.LICENSES, checkoutId);
    const record =
      subject === null ? null : await getLicense(context.env.LICENSES, subject);

    if (subject === null || record === null) {
      return polling
        ? readyJson(false)
        : activationHtmlResponse(preparingPage(checkoutId));
    }
    if (polling) {
      return readyJson(true);
    }

    const token = await signLicenseToken(
      { orderId: record.orderId, subject, updatesUntil: record.updatesUntil },
      context.env.LICENSE_SIGNING_SEED
    );
    await putCheckoutIndex(
      context.env.LICENSES,
      checkoutId,
      subject,
      ACTIVATION_WINDOW_SECONDS
    );

    return activationHtmlResponse(activationPage(token));
  }
);
