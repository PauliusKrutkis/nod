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
 */
import type { Env } from "../../lib/env";
import {
  clearedStateCookie,
  fetchGitHubUserId,
  readStateCookie,
} from "../../lib/github-oauth";
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
    const checkoutUrl = await createCheckout(
      env,
      `github:github.com:${userId}`,
      url.origin
    );

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
