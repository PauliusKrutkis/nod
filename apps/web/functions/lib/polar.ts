/**
 * Verifies Polar webhook requests (Standard Webhooks spec: webhook-id /
 * webhook-timestamp / webhook-signature headers, HMAC-SHA256). The order.paid
 * payload shape below is confirmed against Polar's OpenAPI spec (Aug 2026):
 * metadata set on a checkout is copied to the resulting order, so
 * `metadata.subject` arrives here, and the order carries `checkout_id`
 * alongside its own id. Checkout is responsible for putting an
 * already-namespaced subject there (`<provider>:<host>:<id>`, see
 * functions/lib/kv.ts); this only reads whatever it is given.
 *
 * The secret is base64-encoded before it reaches standardwebhooks, matching
 * Polar's own SDK: Polar's HMAC key is the raw UTF-8 bytes of the whole
 * secret string, `whsec_` prefix included, while the standardwebhooks
 * constructor base64-DECODES whatever it is given (after stripping a
 * `whsec_` prefix). Passing the secret straight through derives a different
 * key and rejects every genuine delivery — proven live on 2026-08-05, when
 * every sandbox order.paid bounced with a 401 against a correct stored
 * secret.
 *
 * verifyPolarWebhook returns a discriminated result rather than the event or
 * null: an unverified payload must never reach the handler body by way of a
 * forgotten null check, and `unknown | null` collapses to `unknown`, so the
 * type system cannot enforce that check on a bare return value.
 */
import { Webhook, WebhookVerificationError } from "standardwebhooks";

export interface PolarOrderPaidEvent {
  type: "order.paid";
  data: {
    id: string;
    checkout_id?: string | null;
    metadata?: Record<string, unknown>;
  };
}

export type PolarWebhookResult =
  | { verified: true; event: unknown }
  | { verified: false };

export function verifyPolarWebhook(
  payload: string,
  headers: Record<string, string>,
  secret: string
): PolarWebhookResult {
  const webhook = new Webhook(btoa(secret));
  try {
    return { verified: true, event: webhook.verify(payload, headers) };
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return { verified: false };
    }
    throw error;
  }
}

export function isOrderPaidEvent(event: unknown): event is PolarOrderPaidEvent {
  if (typeof event !== "object" || event === null) {
    return false;
  }
  const candidate = event as { type?: unknown; data?: unknown };
  return (
    candidate.type === "order.paid" &&
    typeof candidate.data === "object" &&
    candidate.data !== null
  );
}

export function extractSubject(event: PolarOrderPaidEvent): string | null {
  const subject = event.data.metadata?.subject;
  return typeof subject === "string" || typeof subject === "number"
    ? String(subject)
    : null;
}

/**
 * Null for an order with no originating checkout — Polar can raise order.paid
 * for one created outside a checkout session (a manual or imported order), and
 * those have no activation link to key.
 */
export function extractCheckoutId(event: PolarOrderPaidEvent): string | null {
  const checkoutId = event.data.checkout_id;
  return typeof checkoutId === "string" && checkoutId !== ""
    ? checkoutId
    : null;
}
