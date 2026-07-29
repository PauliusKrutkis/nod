/**
 * Verifies Polar webhook requests (Standard Webhooks spec: webhook-id /
 * webhook-timestamp / webhook-signature headers, HMAC-SHA256). The
 * order.paid payload shape below — especially `metadata.subject` — is an
 * assumption pending a real Polar account; confirm against Polar's API
 * reference before wiring live secrets. Checkout is responsible for putting
 * an already-namespaced subject there (`<provider>:<host>:<id>`, see
 * functions/lib/kv.ts); this only reads whatever it is given.
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
  const webhook = new Webhook(secret);
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
