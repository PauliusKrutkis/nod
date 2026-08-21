/**
 * The GitHub docs page an org admin needs when OAuth App restrictions keep
 * Nod out. One opener shared by both surfaces that answer "why is a
 * repository missing?" — the short-inbox hint and the watch dialog's empty
 * search — so the destination cannot drift between them. It lives here
 * rather than beside the hint because a component file exports components
 * only; the URL stays private so the opener is the one public shape.
 */
import { openExternal } from "./open-external.ts";

const ORG_APPROVAL_DOCS_URL =
  "https://docs.github.com/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization";

export function openOrgApprovalDocs(): void {
  openExternal(ORG_APPROVAL_DOCS_URL);
}
