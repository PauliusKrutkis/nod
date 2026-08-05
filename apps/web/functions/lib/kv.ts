/**
 * KV access for the license server. Two key spaces: `license:<subject>`
 * holds the record itself, and `checkout:<checkout_id>` is a single-use index
 * the purchase webhook writes so /activate can be keyed off Polar's opaque
 * checkout id instead of the public subject (see functions/activate.ts).
 *
 * The index is keyed by checkout id, not order id, because `{CHECKOUT_ID}` is
 * the only variable Polar templates into a checkout success URL — there is no
 * order-id variable, so an order-keyed index is unreachable from the page the
 * buyer actually lands on. The record still stores the order id: it is what
 * support and refunds are traced by, and it is what the signed token carries.
 *
 * A subject is `<provider>:<host>:<id>` — `github:github.com:583231`,
 * `gitlab:git.acme.internal:42`. Deliberately not a bare GitHub id: the app
 * signs in against GitHub, gitlab.com and self-hosted GitLab
 * (src-tauri/src/accounts.rs identifies an account by that same triple), so a
 * github-only key would leave paying GitLab users unrepresentable. Namespacing
 * from the start means a new provider is data, not a migration. `id` is the
 * provider's stable numeric id, never the login — logins get renamed, and this
 * value has to still resolve at restore time a year later.
 *
 * The webhook writes the checkout index without an expiry; /activate re-puts
 * it with a short TTL once a token has actually been signed. Strict single-use
 * (delete after first render) was tried and rejected: it stranded any buyer
 * who closed the tab before installing the app, with /restore still a stub
 * and no way to reissue the link. Checkout ids are unguessable, so a bounded
 * activation window gives up little.
 */
export interface LicenseRecord {
  orderId: string;
  updatesUntil: string;
}

function licenseKey(subject: string): string {
  return `license:${subject}`;
}

function checkoutIndexKey(checkoutId: string): string {
  return `checkout:${checkoutId}`;
}

export function getLicense(
  kv: KVNamespace,
  subject: string
): Promise<LicenseRecord | null> {
  return kv.get<LicenseRecord>(licenseKey(subject), "json");
}

export async function putLicense(
  kv: KVNamespace,
  subject: string,
  record: LicenseRecord
): Promise<void> {
  await kv.put(licenseKey(subject), JSON.stringify(record));
}

export async function putCheckoutIndex(
  kv: KVNamespace,
  checkoutId: string,
  subject: string,
  expirationTtlSeconds?: number
): Promise<void> {
  await kv.put(
    checkoutIndexKey(checkoutId),
    subject,
    expirationTtlSeconds === undefined
      ? undefined
      : { expirationTtl: expirationTtlSeconds }
  );
}

export function getCheckoutIndex(
  kv: KVNamespace,
  checkoutId: string
): Promise<string | null> {
  return kv.get(checkoutIndexKey(checkoutId));
}
