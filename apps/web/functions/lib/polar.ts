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
 *
 * createCheckout is the write half (POST /v1/checkouts/, confirmed against
 * the same OpenAPI spec: `products` takes product IDs, the response carries
 * the hosted checkout `url`, and success_url may embed the literal
 * `{CHECKOUT_ID}` template). The API base defaults to the sandbox so a
 * misconfigured deploy can never charge a real card; production is an
 * explicit POLAR_API_BASE var. Missing purchase config throws rather than
 * degrading — /buy turns that into its "not configured" response instead of
 * sending a customer to a checkout that cannot exist.
 */
import { Webhook, WebhookVerificationError } from "standardwebhooks";

const SANDBOX_API_BASE = "https://sandbox-api.polar.sh";

interface CheckoutEnv {
  POLAR_API_KEY?: string;
  POLAR_API_BASE?: string;
  POLAR_PRODUCT_ID?: string;
}

export function polarApiBase(env: CheckoutEnv): string {
  return env.POLAR_API_BASE ?? SANDBOX_API_BASE;
}

export function isCheckoutConfigured(env: CheckoutEnv): boolean {
  return Boolean(env.POLAR_API_KEY && env.POLAR_PRODUCT_ID);
}

export async function createCheckout(
  env: CheckoutEnv,
  subject: string,
  origin: string
): Promise<string> {
  if (!(env.POLAR_API_KEY && env.POLAR_PRODUCT_ID)) {
    throw new Error("checkout is not configured");
  }
  const response = await fetch(`${polarApiBase(env)}/v1/checkouts/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.POLAR_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      products: [env.POLAR_PRODUCT_ID],
      success_url: `${origin}/activate?checkout_id={CHECKOUT_ID}`,
      metadata: { subject },
    }),
  });
  if (!response.ok) {
    throw new Error(`Polar checkout create failed: ${response.status}`);
  }
  const checkout = (await response.json()) as { url?: unknown };
  if (typeof checkout.url !== "string") {
    throw new Error("Polar checkout response carried no url");
  }
  return checkout.url;
}

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
