/**
 * TEMPORARY probe, deleted immediately after use. Do not build on it.
 *
 * Sentry reporting cannot be proven by using the site: every handler wrapped
 * in withErrorReporting is payment plumbing, and each one answers its own
 * failure cases with a status rather than throwing, so no request a person
 * could make produces the thrown error the reporter listens for. Reporting is
 * also fire-and-forget by design — the response is byte-identical whether the
 * DSN is bound, wrong, or missing — so there is nothing to observe from
 * outside either.
 *
 * Two questions, two answers, neither of which leaks the DSN:
 *   ?check=binding — is SENTRY_DSN actually present at runtime? The Pages
 *     deployment record listing a variable has already proven misleading once
 *     (PUBLIC_CF_ANALYTICS_TOKEN was listed on a deployment whose build never
 *     saw it), so the binding is asked for directly rather than assumed.
 *   ?check=throw   — throws, so a real event travels the whole path: the
 *     wrapper, egress from a Cloudflare Function to Sentry's ingest host, and
 *     acceptance at the other end.
 *
 * The key gate exists only so a throwing public endpoint cannot be hammered
 * into burning the free tier's event quota while this is deployed.
 */

import type { Env } from "../lib/env";
import { withErrorReporting } from "../lib/report";

const PROBE_KEY = "d0f66740";

export const onRequestGet: PagesFunction<Env> = withErrorReporting(
  (context) => {
    const url = new URL(context.request.url);
    if (url.searchParams.get("key") !== PROBE_KEY) {
      return new Response("not found", { status: 404 });
    }

    if (url.searchParams.get("check") === "binding") {
      return Response.json({ dsnBound: Boolean(context.env.SENTRY_DSN) });
    }

    if (url.searchParams.get("check") === "throw") {
      throw new Error("nod sentry probe — deliberate, safe to ignore");
    }

    return new Response("not found", { status: 404 });
  }
);
