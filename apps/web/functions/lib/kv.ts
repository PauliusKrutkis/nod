/**
 * KV access for the license server. Two key spaces: `license:<subject>`
 * holds the record itself, and `order:<order_id>` is a single-use index the
 * purchase webhook writes so /activate can be keyed off Polar's opaque order
 * id instead of the public subject (see functions/activate.ts).
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
 * The webhook writes the order index without an expiry; /activate re-puts it
 * with a short TTL once a token has actually been signed. Strict single-use
 * (delete after first render) was tried and rejected: it stranded any buyer
 * who closed the tab before installing the app, with /restore still a stub
 * and no way to reissue the link. Order ids are unguessable, so a bounded
 * activation window gives up little.
 */
export interface LicenseRecord {
  orderId: string;
  updatesUntil: string;
}

function licenseKey(subject: string): string {
  return `license:${subject}`;
}

function orderIndexKey(orderId: string): string {
  return `order:${orderId}`;
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

export async function putOrderIndex(
  kv: KVNamespace,
  orderId: string,
  subject: string,
  expirationTtlSeconds?: number
): Promise<void> {
  await kv.put(
    orderIndexKey(orderId),
    subject,
    expirationTtlSeconds === undefined
      ? undefined
      : { expirationTtl: expirationTtlSeconds }
  );
}

export function getOrderIndex(
  kv: KVNamespace,
  orderId: string
): Promise<string | null> {
  return kv.get(orderIndexKey(orderId));
}
