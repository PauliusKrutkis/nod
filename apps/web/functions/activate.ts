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
 * meta-refreshes with a retry counter, and only after the retry budget
 * (about two minutes) does the invalid-link 404 appear. A garbage
 * checkout_id costs an attacker nothing either way — the page carries no
 * token until the index resolves.
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

const ACTIVATION_WINDOW_SECONDS = 48 * 60 * 60;
const RETRY_INTERVAL_SECONDS = 5;
const MAX_RETRIES = 24;

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
        return activationHtmlResponse(preparingPage(checkoutId, retry));
      }
      return new Response("activation link is invalid or already used", {
        status: 404,
      });
    }

    const record = await getLicense(context.env.LICENSES, subject);
    if (record === null) {
      if (retry < MAX_RETRIES) {
        return activationHtmlResponse(preparingPage(checkoutId, retry));
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

    return activationHtmlResponse(activationPage(token));
  }
);
