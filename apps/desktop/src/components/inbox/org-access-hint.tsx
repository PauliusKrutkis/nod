/**
 * The quiet answer to "why is a repository missing?". An org with OAuth App
 * restrictions makes GitHub omit its private repos from every response with
 * no error attached, so the app cannot detect the state and must never alert
 * on it — most short inboxes are simply short. The sentence therefore sits
 * where the confusion happens (the end of a short inbox, and the watch
 * dialog's empty search via the same docs opener in lib/org-approval-docs),
 * always and subdued, phrased from the reader's question rather than as a
 * diagnosis nobody can confirm.
 */
import { openOrgApprovalDocs } from "../../lib/org-approval-docs.ts";

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
