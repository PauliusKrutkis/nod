/**
 * Signs and verifies the activation token embedded in the /activate redirect
 * URL. Ed25519 via @noble/ed25519 — a separate keypair from the updater's
 * minisign chain (see docs/RELEASING.md). The signing seed is a Worker
 * secret; the public key ships embedded in the desktop app once that slice
 * lands.
 *
 * verifyLicenseToken takes attacker-controlled input and never throws — every
 * malformed shape (bad base64, non-object JSON, a signature that isn't 64
 * bytes of hex) returns null. Tokens are base64url over UTF-8 bytes rather
 * than btoa(string), which throws on any code point above U+00FF.
 *
 * It also rebuilds its return value from the three signed fields instead of
 * passing the decoded object through. Only those three go into
 * canonicalBytes, so any other key an attacker appends to a genuinely signed
 * token verifies fine and would otherwise be handed to the caller as though
 * the signature vouched for it.
 *
 * signLicenseToken rejects a seed that isn't 32 bytes of hex rather than
 * letting hexToBytes zero-fill it: parseInt yields NaN for non-hex, which a
 * Uint8Array stores as 0, so a typo'd secret would silently sign with the
 * wrong key and produce tokens that fail only inside the desktop app.
 */
import { signAsync, verifyAsync } from "@noble/ed25519";

const SEED_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export interface LicensePayload {
  orderId: string;
  subject: string;
  updatesUntil: string;
}

interface SignedLicenseToken extends LicensePayload {
  signature: string;
}

function canonicalBytes(payload: LicensePayload): Uint8Array {
  const canonical = JSON.stringify({
    orderId: payload.orderId,
    subject: payload.subject,
    updatesUntil: payload.updatesUntil,
  });
  return new TextEncoder().encode(canonical);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    ""
  );
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function signLicenseToken(
  payload: LicensePayload,
  signingSeedHex: string
): Promise<string> {
  if (!SEED_HEX_PATTERN.test(signingSeedHex)) {
    throw new Error(
      "LICENSE_SIGNING_SEED must be 64 hex characters (a 32-byte Ed25519 seed)"
    );
  }
  const signature = await signAsync(
    canonicalBytes(payload),
    hexToBytes(signingSeedHex)
  );
  const token: SignedLicenseToken = {
    ...payload,
    signature: bytesToHex(signature),
  };
  return base64UrlEncode(JSON.stringify(token));
}

export async function verifyLicenseToken(
  encodedToken: string,
  publicKeyHex: string
): Promise<LicensePayload | null> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(base64UrlDecode(encodedToken));
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) {
    return null;
  }
  const { signature, ...payload } = decoded as SignedLicenseToken;
  if (!signature) {
    return null;
  }
  try {
    const valid = await verifyAsync(
      hexToBytes(signature),
      canonicalBytes(payload),
      hexToBytes(publicKeyHex)
    );
    return valid
      ? {
          orderId: payload.orderId,
          subject: payload.subject,
          updatesUntil: payload.updatesUntil,
        }
      : null;
  } catch {
    return null;
  }
}
