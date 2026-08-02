/**
 * GET /activate — post-checkout success page: look up the order_id index the
 * webhook stored, sign an activation token, render an "Open Nod" page whose
 * button carries the token as a prflow://purchase deep link.
 *
 * Keyed by `?order_id=` (Polar's opaque order/checkout identifier), not
 * `?subject=` — a subject is public, so trusting it alone here would let
 * anyone mint a signed token for a known customer's account with no proof of
 * purchase. order_id is unguessable, and once a token has been signed the
 * index is re-put with a 48-hour TTL: the link keeps working while the buyer
 * installs the app (strict delete-on-first-render stranded anyone who closed
 * the tab, with /restore still a stub), then expires. The exact query param
 * Polar's checkout success URL templates in is still an assumption pending a
 * real account — see docs/RELEASING.md.
 *
 * There is deliberately no automatic loopback handoff here yet. An earlier
 * draft fetched http://127.0.0.1:8765/callback from an inline script, but the
 * desktop app has no purchase listener on that port — only the OAuth code
 * catcher in src-tauri/src/auth.rs, which such a fetch would abort mid-sign-in
 * (its /callback handler treats a token-only query as a CSRF state mismatch)
 * while an opaque no-cors response flipped this page to a false "you're all
 * set". The zero-click fetch ships together with the app-side listener.
 * The response is no-store because the token is baked into the markup.
 */
import type { Env } from "./lib/env";
import { getLicense, getOrderIndex, putOrderIndex } from "./lib/kv";
import { signLicenseToken } from "./lib/license-token";

const DEEP_LINK_BASE = "prflow://purchase";
const ACTIVATION_WINDOW_SECONDS = 48 * 60 * 60;

function activationPage(token: string): string {
  const deepLink = `${DEEP_LINK_BASE}?token=${encodeURIComponent(token)}`;
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
  <h1>Payment received</h1>
  <p>Thanks for buying Nod. Press the button to finish activation.</p>
  <a class="open" href="${deepLink}">Open Nod</a>
  <p class="alt">Don't have it installed yet? <a href="/downloads">Download
  Nod</a>, then press Open Nod — this link works for 48 hours.</p>
</main>
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
  await putOrderIndex(
    context.env.LICENSES,
    orderId,
    subject,
    ACTIVATION_WINDOW_SECONDS
  );

  return new Response(activationPage(token), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
};
