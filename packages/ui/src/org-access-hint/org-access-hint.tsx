/**
 * The quiet answer to "why is a repository missing?". An org with OAuth App
 * restrictions makes GitHub omit its private repos from every response with
 * no error attached, so the app cannot detect the state and must never alert
 * on it — most short inboxes are simply short. The sentence therefore sits
 * where the confusion happens, always and subdued, phrased from the reader's
 * question rather than as a diagnosis nobody can confirm.
 *
 * The host supplies the opener rather than the component reaching for it, the
 * same seam watch-repos-dialog uses for the identical sentence — which is
 * what lets both org-approval surfaces be catalogued instead of one of them
 * living in the app because it knew a URL.
 */
import "./org-access-hint.css";

export function OrgAccessHint({
  onOrgAccessHelp,
}: {
  onOrgAccessHelp: () => void;
}) {
  return (
    <p className="qoa">
      Missing a repository? An organization may need to approve Nod first.{" "}
      <button className="qoa-link" onClick={onOrgAccessHelp} type="button">
        Read more
      </button>
    </p>
  );
}
