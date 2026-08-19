/**
 * The quiet answer to "why is a repository missing?". An org with OAuth App
 * restrictions makes GitHub omit its private repos from every response with
 * no error attached, so the app cannot detect the state and must never alert
 * on it — most short inboxes are simply short. The sentence therefore sits
 * where the confusion happens (the end of a short inbox, and the watch
 * dialog's empty search via the same docs URL), always and subdued, phrased
 * from the reader's question rather than as a diagnosis nobody can confirm.
 */
import { openExternal } from "../../lib/open-external.ts";

export const ORG_APPROVAL_DOCS_URL =
  "https://docs.github.com/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization";

export function openOrgApprovalDocs(): void {
  openExternal(ORG_APPROVAL_DOCS_URL);
}

export function OrgAccessHint() {
  return (
    <p className="px-6 py-4 text-faint text-xs">
      Missing a repository? An organization may need to approve Nod first.{" "}
      <button
        className="cursor-pointer underline hover:text-muted"
        onClick={openOrgApprovalDocs}
        type="button"
      >
        Read more
      </button>
    </p>
  );
}
