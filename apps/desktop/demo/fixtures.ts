/**
 * The demo's staged queue: fuller than the e2e default so the first thing a
 * visitor drives feels like a real morning inbox, with titles drawn from the
 * same product world the landing page's copy and footage use.
 */

import type { InboxFixture } from "../e2e/fixtures.ts";
import { makePr } from "../e2e/fixtures.ts";

export const DEMO_INBOX: InboxFixture = {
  assigned: { count: 0, prs: [] },
  created: {
    count: 1,
    prs: [
      makePr(
        64,
        "Overview ruler for find matches",
        "me",
        "2026-07-02T11:00:00Z"
      ),
    ],
  },
  involved: { count: 0, prs: [] },
  reviewRequested: {
    count: 6,
    prs: [
      makePr(
        1,
        "Add fuzzy matching to search",
        "alice",
        "2026-07-02T10:00:00Z"
      ),
      makePr(
        62,
        "Fix cursor drift in diff viewer",
        "bob",
        "2026-07-02T09:00:00Z"
      ),
      makePr(60, "Rework the token gate", "carol", "2026-07-02T08:00:00Z"),
      makePr(
        57,
        "Restore scroll position on relaunch",
        "dave",
        "2026-07-01T18:00:00Z"
      ),
      makePr(55, "Quiet background refresh", "erin", "2026-07-01T12:00:00Z"),
      makePr(
        54,
        "Snapshot store for offline diffs",
        "frank",
        "2026-06-30T16:00:00Z"
      ),
    ],
  },
};
