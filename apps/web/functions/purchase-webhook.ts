/**
 * POST /purchase-webhook — Polar order.paid → verify signature → store a
 * license keyed by subject, plus a checkout-id index /activate can reach from
 * the success URL. See functions/lib/polar.ts for both payload fields.
 *
 * An order with no originating checkout still gets its license record; only
 * the activation index is skipped, since there is no success URL to land on.
 * That keeps a manually-created order recoverable through /restore instead of
 * dropping it on the floor.
 *
 * A repeat purchase extends the running term — max(existing updatesUntil,
 * now) + 1 year — rather than resetting it: "buy early, lose the remainder"
 * would punish exactly the customers who renew before expiry. A lapsed or
 * unparseable stored term restarts from now. The read-modify-write is not
 * atomic (KV has no transactions), so near-simultaneous orders for one
 * subject could drop an extension — accepted at this scale.
 */
import type { Env } from "./lib/env";
import { getLicense, putCheckoutIndex, putLicense } from "./lib/kv";
import {
  extractCheckoutId,
  extractSubject,
  isOrderPaidEvent,
  verifyPolarWebhook,
} from "./lib/polar";

const LICENSE_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const payload = await context.request.text();
  const headers = Object.fromEntries(context.request.headers);

  const result = verifyPolarWebhook(
    payload,
    headers,
    context.env.POLAR_WEBHOOK_SECRET
  );
  if (!result.verified) {
    return new Response("invalid signature", { status: 401 });
  }

  if (!isOrderPaidEvent(result.event)) {
    return new Response(null, { status: 200 });
  }

  const subject = extractSubject(result.event);
  if (subject === null) {
    return new Response(null, { status: 200 });
  }

  const orderId = result.event.data.id;
  const checkoutId = extractCheckoutId(result.event);
  const existing = await getLicense(context.env.LICENSES, subject);
  const existingUntil = existing
    ? Date.parse(existing.updatesUntil)
    : Number.NaN;
  const extendFrom = Math.max(
    Number.isNaN(existingUntil) ? 0 : existingUntil,
    Date.now()
  );
  const updatesUntil = new Date(extendFrom + LICENSE_DURATION_MS).toISOString();
  await putLicense(context.env.LICENSES, subject, { orderId, updatesUntil });
  if (checkoutId !== null) {
    await putCheckoutIndex(context.env.LICENSES, checkoutId, subject);
  }

  return new Response(null, { status: 200 });
};
