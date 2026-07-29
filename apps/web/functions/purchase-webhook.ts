/**
 * POST /purchase-webhook — Polar order.paid → verify signature → store a
 * license keyed by subject. See functions/lib/polar.ts for the
 * metadata.subject assumption this depends on.
 */
import type { Env } from "./lib/env";
import { putLicense, putOrderIndex } from "./lib/kv";
import {
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
  const updatesUntil = new Date(Date.now() + LICENSE_DURATION_MS).toISOString();
  await putLicense(context.env.LICENSES, subject, { orderId, updatesUntil });
  await putOrderIndex(context.env.LICENSES, orderId, subject);

  return new Response(null, { status: 200 });
};
