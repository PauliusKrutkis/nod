/**
 * GET /activate — post-checkout success page: look up the one-time order_id
 * index the webhook stored, sign an activation token, hand it to the app.
 *
 * Keyed by `?order_id=` (Polar's opaque order/checkout identifier), not
 * `?subject=` — a subject is public, so trusting it alone here would
 * let anyone mint a signed token for a known customer's account with no
 * proof of purchase. order_id is unguessable and single-use: the index is
 * deleted once a token has actually been signed, so replaying an old
 * activation link 404s while a failure part-way through leaves the link
 * usable. The exact query param Polar's checkout success URL templates in
 * is still an assumption pending a real account — see docs/RELEASING.md.
 *
 * The token travels by two paths, covering both ways a purchase starts.
 * App-initiated (trial prompt opened checkout): the app is already listening
 * on the OAuth loopback port (127.0.0.1:8765, see src-tauri/src/auth.rs), so
 * an inline script posts the token there and activation completes with zero
 * clicks. Web-initiated (nothing listening): the fetch fails silently and the
 * visible "Open Nod" button carries the same token as a prflow:// deep link.
 * The response is no-store because the token is baked into the markup — a
 * cached copy would outlive the single-use order index that guards it.
 */
import type { Env } from "./lib/env";
import { deleteOrderIndex, getLicense, getOrderIndex } from "./lib/kv";
import { signLicenseToken } from "./lib/license-token";

const LOOPBACK_CALLBACK_BASE = "http://127.0.0.1:8765/callback";
const DEEP_LINK_BASE = "prflow://purchase";

function activationPage(token: string): string {
  const deepLink = `${DEEP_LINK_BASE}?token=${encodeURIComponent(token)}`;
  const loopbackUrl = `${LOOPBACK_CALLBACK_BASE}?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nod — payment received</title>
<style>
  body { margin: 0; display: grid; place-items: center; min-height: 100vh;
    background: #101014; color: #e6e6eb;
    font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  p { margin: 0.5rem 0 1.5rem; color: #9a9aa5; }
  a.open { display: inline-block; padding: 0.65rem 1.6rem; border-radius: 8px;
    background: #e6e6eb; color: #101014; text-decoration: none;
    font-weight: 600; }
  p.alt { margin-top: 1.5rem; font-size: 0.85rem; }
  p.alt a { color: #9a9aa5; }
</style>
</head>
<body>
<main>
  <h1 id="headline">Payment received</h1>
  <p id="detail">Thanks for buying Nod. One click finishes activation.</p>
  <a class="open" href="${deepLink}">Open Nod</a>
  <p class="alt">Nothing happening? <a href="/downloads">Download Nod</a>,
  then press Open Nod again — keep this tab open.</p>
</main>
<script>
  fetch(${JSON.stringify(loopbackUrl)}, { mode: "no-cors" })
    .then(() => {
      document.getElementById("headline").textContent = "You're all set";
      document.getElementById("detail").textContent =
        "Nod picked up your license — you can close this tab.";
    })
    .catch(() => {});
</script>
</body>
</html>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const orderId = new URL(context.request.url).searchParams.get("order_id");
  if (!orderId) {
    return new Response("missing order_id", { status: 400 });
  }

  const subject = await getOrderIndex(context.env.LICENSES, orderId);
  if (subject === null) {
    return new Response("activation link is invalid or already used", {
      status: 404,
    });
  }

  const record = await getLicense(context.env.LICENSES, subject);
  if (record === null) {
    return new Response("no license found for this account", { status: 404 });
  }

  const token = await signLicenseToken(
    { orderId: record.orderId, subject, updatesUntil: record.updatesUntil },
    context.env.LICENSE_SIGNING_SEED
  );
  await deleteOrderIndex(context.env.LICENSES, orderId);

  return new Response(activationPage(token), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
};
