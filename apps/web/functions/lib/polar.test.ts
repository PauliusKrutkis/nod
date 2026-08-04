import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import {
  extractCheckoutId,
  extractSubject,
  isOrderPaidEvent,
  verifyPolarWebhook,
} from "./polar";

const secret = `whsec_${btoa("test-webhook-secret")}`;

function sign(webhookSecret: string, msgId: string, payload: string) {
  const timestamp = new Date();
  const signature = new Webhook(webhookSecret).sign(msgId, timestamp, payload);
  return {
    "webhook-id": msgId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  };
}

describe("polar webhook verification", () => {
  it("accepts a validly signed order.paid event and extracts the subject", () => {
    const event = {
      type: "order.paid",
      data: {
        id: "order_1",
        metadata: { subject: "github:github.com:583231" },
      },
    };
    const payload = JSON.stringify(event);
    const headers = sign(secret, "msg_1", payload);

    const result = verifyPolarWebhook(payload, headers, secret);

    expect(result.verified).toBe(true);
    if (result.verified) {
      expect(isOrderPaidEvent(result.event)).toBe(true);
      if (isOrderPaidEvent(result.event)) {
        expect(extractSubject(result.event)).toBe("github:github.com:583231");
      }
    }
  });

  it("reads the checkout id an order.paid event was created from", () => {
    const event = {
      type: "order.paid",
      data: { id: "order_1", checkout_id: "checkout_1" },
    } as const;

    expect(extractCheckoutId(event)).toBe("checkout_1");
  });

  it("reports no checkout id for an order created outside a checkout", () => {
    expect(
      extractCheckoutId({ type: "order.paid", data: { id: "order_1" } })
    ).toBeNull();
    expect(
      extractCheckoutId({
        type: "order.paid",
        data: { id: "order_1", checkout_id: null },
      })
    ).toBeNull();
  });

  it("rejects a payload signed with a different secret", () => {
    const payload = JSON.stringify({
      type: "order.paid",
      data: { id: "order_1" },
    });
    const headers = sign(`whsec_${btoa("wrong-secret")}`, "msg_2", payload);

    expect(verifyPolarWebhook(payload, headers, secret)).toEqual({
      verified: false,
    });
  });

  it("rejects a payload tampered with after signing", () => {
    const original = JSON.stringify({
      type: "order.paid",
      data: { id: "order_1" },
    });
    const headers = sign(secret, "msg_3", original);
    const tampered = JSON.stringify({
      type: "order.paid",
      data: { id: "order_evil" },
    });

    expect(verifyPolarWebhook(tampered, headers, secret)).toEqual({
      verified: false,
    });
  });

  it("ignores event types other than order.paid", () => {
    expect(isOrderPaidEvent({ type: "checkout.updated", data: {} })).toBe(
      false
    );
  });
});
