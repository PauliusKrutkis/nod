/**
 * The host as a person says it: no scheme. Lives beside the component
 * rather than in it so the component file exports components only.
 */

const HTTPS_PREFIX = /^https?:\/\//;

export function shortHost(host: string): string {
  return host.replace(HTTPS_PREFIX, "");
}
