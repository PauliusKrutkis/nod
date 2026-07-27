/**
 * KV access for the license server. Two key spaces: `license:<github_id>`
 * holds the record itself, and `order:<order_id>` is a single-use index the
 * purchase webhook writes so /activate can be keyed off Polar's opaque order
 * id instead of the public github_id (see functions/activate.ts).
 *
 * Reading the index and deleting it are separate calls on purpose. /activate
 * has fallible work to do between the two — a KV read and a signature — and
 * deleting up front would burn the customer's one activation link on any
 * failure, with no way to reissue it (/restore is still a stub).
 */
export interface LicenseRecord {
  orderId: string;
  updatesUntil: string;
}

function licenseKey(githubId: string): string {
  return `license:${githubId}`;
}

function orderIndexKey(orderId: string): string {
  return `order:${orderId}`;
}

export function getLicense(
  kv: KVNamespace,
  githubId: string
): Promise<LicenseRecord | null> {
  return kv.get<LicenseRecord>(licenseKey(githubId), "json");
}

export async function putLicense(
  kv: KVNamespace,
  githubId: string,
  record: LicenseRecord
): Promise<void> {
  await kv.put(licenseKey(githubId), JSON.stringify(record));
}

export async function putOrderIndex(
  kv: KVNamespace,
  orderId: string,
  githubId: string
): Promise<void> {
  await kv.put(orderIndexKey(orderId), githubId);
}

export function getOrderIndex(
  kv: KVNamespace,
  orderId: string
): Promise<string | null> {
  return kv.get(orderIndexKey(orderId));
}

export async function deleteOrderIndex(
  kv: KVNamespace,
  orderId: string
): Promise<void> {
  await kv.delete(orderIndexKey(orderId));
}
