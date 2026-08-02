import { keygenAsync } from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import { signLicenseToken, verifyLicenseToken } from "./license-token";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function fromBase64Url(token: string): string {
  const padded = token.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  const binary = atob(padded + "=".repeat(padLength));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0))
  );
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    ""
  );
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const SEED_ERROR_PATTERN = /64 hex characters/;

const payload = {
  orderId: "order_1",
  subject: "gitlab:git.acme.internal:42",
  updatesUntil: "2027-07-18",
};

describe("license token", () => {
  it("round-trips a signed payload", async () => {
    const { secretKey, publicKey } = await keygenAsync();
    const token = await signLicenseToken(payload, toHex(secretKey));
    expect(await verifyLicenseToken(token, toHex(publicKey))).toEqual(payload);
  });

  it("rejects a tampered token", async () => {
    const { secretKey, publicKey } = await keygenAsync();
    const token = await signLicenseToken(payload, toHex(secretKey));
    const midpoint = Math.floor(token.length / 2);
    const flippedChar = token[midpoint] === "a" ? "b" : "a";
    const tampered =
      token.slice(0, midpoint) + flippedChar + token.slice(midpoint + 1);
    expect(await verifyLicenseToken(tampered, toHex(publicKey))).toBeNull();
  });

  it("rejects verification with the wrong public key", async () => {
    const { secretKey } = await keygenAsync();
    const { publicKey: wrongPublicKey } = await keygenAsync();
    const token = await signLicenseToken(payload, toHex(secretKey));
    expect(await verifyLicenseToken(token, toHex(wrongPublicKey))).toBeNull();
  });

  it("rejects garbage input instead of throwing", async () => {
    const { publicKey } = await keygenAsync();
    expect(
      await verifyLicenseToken("not-a-real-token", toHex(publicKey))
    ).toBeNull();
  });

  it("rejects a token that decodes to non-object JSON instead of throwing", async () => {
    const { publicKey } = await keygenAsync();
    const encodedNull = btoa("null")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const encodedNumber = btoa("42")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    await expect(
      verifyLicenseToken(encodedNull, toHex(publicKey))
    ).resolves.toBeNull();
    await expect(
      verifyLicenseToken(encodedNumber, toHex(publicKey))
    ).resolves.toBeNull();
  });

  it("rejects a signature that is not 64 bytes instead of throwing", async () => {
    const { publicKey } = await keygenAsync();
    const encode = (value: string) =>
      btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const withSignature = (signature: string) =>
      encode(JSON.stringify({ ...payload, signature }));

    await expect(
      verifyLicenseToken(withSignature("zz"), toHex(publicKey))
    ).resolves.toBeNull();
    await expect(
      verifyLicenseToken(withSignature("ab".repeat(100)), toHex(publicKey))
    ).resolves.toBeNull();
  });

  it("round-trips a payload containing non-ASCII characters", async () => {
    const { secretKey, publicKey } = await keygenAsync();
    const unicodePayload = { ...payload, subject: "café-日本" };
    const token = await signLicenseToken(unicodePayload, toHex(secretKey));
    expect(await verifyLicenseToken(token, toHex(publicKey))).toEqual(
      unicodePayload
    );
  });

  it("drops fields the signature never covered", async () => {
    const { secretKey, publicKey } = await keygenAsync();
    const token = await signLicenseToken(payload, toHex(secretKey));

    const decoded = JSON.parse(fromBase64Url(token));
    decoded.tier = "enterprise";
    decoded.updatesUntil2 = "2999-01-01";
    const injected = toBase64Url(JSON.stringify(decoded));

    const verified = await verifyLicenseToken(injected, toHex(publicKey));

    expect(verified).toEqual(payload);
    expect(verified).not.toHaveProperty("tier");
    expect(verified).not.toHaveProperty("updatesUntil2");
  });

  it("refuses to sign with a seed that is not 32 bytes of hex", async () => {
    const { publicKey } = await keygenAsync();
    for (const badSeed of ["", "not-hex", "ab".repeat(31), "ab".repeat(33)]) {
      await expect(signLicenseToken(payload, badSeed)).rejects.toThrow(
        SEED_ERROR_PATTERN
      );
    }
    expect(toHex(publicKey)).toHaveLength(64);
  });
});
