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
 * An inline script also pushes the token to the app's dedicated purchase
 * listener (127.0.0.1:8766, src-tauri/src/activation.rs — deliberately not
 * the OAuth port, whose code catcher a token fetch would abort mid-sign-in),
 * so an app-initiated purchase activates with zero clicks where the browser
 * allows it: Firefox fires plainly, Chromium preflights (answered by the
 * listener) or prompts under Local Network Access, Safari blocks
 * https→loopback mixed content and always needs the button. The page never
 * claims success from the fetch — a no-cors response is opaque and anything
 * on the port could have answered — so the copy stays non-committal and the
 * app's own window is the confirmation. The response is no-store because the
 * token is baked into the markup.
 *
 * A missing index is NOT immediately an invalid link: the buyer arrives here
 * seconds after paying, racing the webhook write through KV's eventual
 * consistency (writes can take up to a minute to reach the buyer's colo —
 * observed live 2026-08-05, when a stored license read as absent for
 * minutes). So a miss serves a 200 "preparing your activation" page that
 * meta-refreshes with a retry counter, and only after the retry budget
 * (about two minutes) does the invalid-link 404 appear. A garbage
 * checkout_id costs an attacker nothing either way — the page carries no
 * token until the index resolves.
 */
import type { Env } from "./lib/env";
import { getCheckoutIndex, getLicense, putCheckoutIndex } from "./lib/kv";
import { signLicenseToken } from "./lib/license-token";
import { withErrorReporting } from "./lib/report";

const DEEP_LINK_BASE = "nod://purchase";
const PURCHASE_LISTENER_BASE = "http://127.0.0.1:8766/callback";
const ACTIVATION_WINDOW_SECONDS = 48 * 60 * 60;
const RETRY_INTERVAL_SECONDS = 5;
const MAX_RETRIES = 24;

/**
 * The site's tokens, inlined. These pages are Worker-rendered strings, so
 * they cannot import src/styles/global.css (its filename is content-hashed
 * at build time) — but they are the last screens of a purchase, and a buyer
 * arriving from checkout should not feel handed to a different product.
 * Values copy :root in global.css; the font stack degrades to system-ui
 * because no @font-face travels with this page.
 */
const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; display: grid; place-items: center; min-height: 100vh;
    background: #0f0f17; color: #e8e8f3;
    font-family: "Inter Variable", Inter, system-ui, sans-serif;
    font-size: 16px; line-height: 1.6; letter-spacing: -0.006em;
    -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(1100px 560px at 50% -8%,
      rgba(139, 128, 255, 0.08), transparent 62%); }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.35rem; font-weight: 640; letter-spacing: -0.02em;
    margin: 0 0 0.5rem; }
  p { margin: 0.5rem 0 1.5rem; color: #9a9ab2; }
  a.open { display: inline-block; padding: 11px 18px; border-radius: 10px;
    background: #8b80ff; color: #14111f; text-decoration: none;
    font-weight: 500; font-size: 0.90625rem; }
  a.open:focus-visible { outline: 2px solid #8b80ff; outline-offset: 3px; }
  p.alt { margin-top: 1.5rem; margin-bottom: 0; font-size: 0.8125rem;
    color: #5f5f78; }
  p.alt a { color: #9a9ab2; text-underline-offset: 3px; }
`;

function preparingPage(checkoutId: string, retry: number): string {
  const nextUrl = `/activate?checkout_id=${encodeURIComponent(checkoutId)}&retry=${retry + 1}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="${RETRY_INTERVAL_SECONDS}; url=${nextUrl}">
<title>Nod · preparing your activation</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
  <h1>Payment received</h1>
  <p>Preparing your activation. This page refreshes by itself and usually
  takes a few seconds.</p>
</main>
</body>
</html>`;
}

function activationPage(token: string): string {
  const deepLink = `${DEEP_LINK_BASE}?token=${encodeURIComponent(token)}`;
  const listenerUrl = `${PURCHASE_LISTENER_BASE}?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nod · payment received</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
  <h1>Payment received</h1>
  <p>Thanks for buying Nod. Press the button to finish activation.</p>
  <a class="open" href="${deepLink}">Open Nod</a>
  <p class="alt">Don't have it installed yet? <a href="/downloads">Download
  Nod</a>, then press Open Nod. This link works for 48 hours.</p>
</main>
<script>
  fetch(${JSON.stringify(listenerUrl)}, { mode: "no-cors" }).catch(() => {});
</script>
</body>
</html>`;
}

export const onRequestGet: PagesFunction<Env> = withErrorReporting(
  async (context) => {
    const url = new URL(context.request.url);
    const checkoutId = url.searchParams.get("checkout_id");
    if (!checkoutId) {
      return new Response("missing checkout_id", { status: 400 });
    }
    const retry =
      Number.parseInt(url.searchParams.get("retry") ?? "0", 10) || 0;

    const subject = await getCheckoutIndex(context.env.LICENSES, checkoutId);
    if (subject === null) {
      if (retry < MAX_RETRIES) {
        return new Response(preparingPage(checkoutId, retry), {
          headers: {
            "cache-control": "no-store",
            "content-type": "text/html; charset=utf-8",
          },
        });
      }
      return new Response("activation link is invalid or already used", {
        status: 404,
      });
    }

    const record = await getLicense(context.env.LICENSES, subject);
    if (record === null) {
      if (retry < MAX_RETRIES) {
        return new Response(preparingPage(checkoutId, retry), {
          headers: {
            "cache-control": "no-store",
            "content-type": "text/html; charset=utf-8",
          },
        });
      }
      return new Response("no license found for this account", {
        status: 404,
      });
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

    return new Response(activationPage(token), {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    });
  }
);
