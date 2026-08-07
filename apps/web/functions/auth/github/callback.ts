/**
 * GET /auth/github/callback — finish the purchase sign-in: verify the state
 * nonce against the /buy cookie, trade the code for the visitor's numeric
 * GitHub id, and redirect into a Polar checkout carrying
 * `metadata.subject = github:github.com:<id>` — the identity the webhook
 * will key the license to.
 *
 * The state check compares the query parameter to the cookie before
 * anything touches GitHub: a mismatch means the flow didn't start at /buy
 * in this browser (CSRF, a replay, or an expired cookie), and the answer to
 * all three is to start over. The cookie is cleared on success so the nonce
 * is single-use.
 *
 * A subject that already owns a license never reaches Polar: it gets the
 * activation screen instead. That is what makes buying and re-activating the
 * same door, which matters because the app only knows how to open one — the
 * purchase prompt sends everyone to /buy, including the buyer who paid on
 * the website before installing and has no local license to show for it.
 * Without this, that buyer's only route back is a second charge.
 */
import {
  activationHtmlResponse,
  activationPage,
} from "../../lib/activation-page";
import type { Env } from "../../lib/env";
import {
  clearedStateCookie,
  fetchGitHubUserId,
  readStateCookie,
} from "../../lib/github-oauth";
import { getLicense } from "../../lib/kv";
import { signLicenseToken } from "../../lib/license-token";
import { createCheckout } from "../../lib/polar";
import { withErrorReporting } from "../../lib/report";

export const onRequestGet: PagesFunction<Env> = withErrorReporting(
  async (context) => {
    const { env } = context;
    if (!(env.GH_WEB_CLIENT_ID && env.GH_WEB_CLIENT_SECRET)) {
      return new Response("purchasing is not open yet", { status: 503 });
    }

    const url = new URL(context.request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readStateCookie(
      context.request.headers.get("cookie")
    );
    if (!(code && state) || expectedState !== state) {
      return new Response(
        "sign-in state mismatch or expired; start again at /buy",
        { status: 400 }
      );
    }

    const userId = await fetchGitHubUserId(
      env.GH_WEB_CLIENT_ID,
      env.GH_WEB_CLIENT_SECRET,
      code,
      `${url.origin}/auth/github/callback`
    );
    const subject = `github:github.com:${userId}`;

    // Signing in is proof enough to re-activate: the sign-in just established
    // that this visitor holds the GitHub account the license is keyed to,
    // which is the same claim /activate needs a checkout_id to make about an
    // anonymous visitor. So an owner who reaches here never sees a second
    // checkout — they get their existing license back.
    const existing = await getLicense(env.LICENSES, subject);
    if (existing !== null) {
      const token = await signLicenseToken(
        {
          orderId: existing.orderId,
          subject,
          updatesUntil: existing.updatesUntil,
        },
        env.LICENSE_SIGNING_SEED
      );
      return activationHtmlResponse(activationPage(token), {
        "set-cookie": clearedStateCookie(),
      });
    }

    const checkoutUrl = await createCheckout(env, subject, url.origin);

    return new Response(null, {
      status: 302,
      headers: {
        location: checkoutUrl,
        "set-cookie": clearedStateCookie(),
        "cache-control": "no-store",
      },
    });
  }
);
