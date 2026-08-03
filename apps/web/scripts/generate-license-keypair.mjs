/**
 * One-time generator for the Nod license signing keypair (docs/LAUNCH.md
 * step 3). Prints the seed and public key hex and nothing else — the seed
 * goes to a Cloudflare Pages secret and a backup, never to disk or the repo:
 *
 *   node scripts/generate-license-keypair.mjs
 *   wrangler pages secret put LICENSE_SIGNING_SEED   # paste the seed
 *   gh variable set NOD_LICENSE_PUBKEY --body <pubkey>
 *
 * Same library and seed format as functions/lib/license-token.ts, so what
 * this prints is exactly what signLicenseToken expects.
 */
import { getPublicKeyAsync, utils, etc } from "@noble/ed25519";

const seed = utils.randomSecretKey();
const publicKey = await getPublicKeyAsync(seed);

console.log(`LICENSE_SIGNING_SEED (secret — back this up):\n${etc.bytesToHex(seed)}\n`);
console.log(`NOD_LICENSE_PUBKEY (public):\n${etc.bytesToHex(publicKey)}`);
