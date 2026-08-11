/**
 * Two axes decide what this renders: the tracker base (absent, plain, with a
 * trailing slash, with an {id} template) and what the title's text does under
 * the ticket pattern (none, one, several, and the near misses — a bare prefix,
 * a lowercase key, a number that is not a ticket). Plain text is a normal
 * result here, not an empty render, so no fixture claims rendersNothing.
 *
 * The overflow case is a title with no break opportunity around the ticket:
 * the segment spans are inline, so the ellipsis is the host row's job, and
 * this cell is what proves it when a row forgets.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { TicketTitle } from "./ticket-title.tsx";

const noop = () => {
  return;
};

const BASE = "https://tracker.example.com/browse";
const UNBREAKABLE = `SCR-2891 ${"RefactorTheInbox".repeat(40)}`;

export const ticketTitleEntry = defineEntry(TicketTitle, {
  "id-template": {
    props: {
      onOpenTicket: noop,
      title: "SCR-2891 Retry the poller",
      trackerBase: "https://tracker.example.com/issue/{id}?from=nod",
    },
  },
  "markup-as-text": {
    props: {
      onOpenTicket: noop,
      title: 'ABC-42 <img src=x onerror="alert(1)">',
      trackerBase: BASE,
    },
  },
  "multiple-tickets": {
    props: {
      onOpenTicket: noop,
      title: "SCR-2891, SCR-2892 and ABC-7: drop the legacy poller",
      trackerBase: BASE,
    },
  },
  "near-miss": {
    props: {
      onOpenTicket: noop,
      title: "ABC- and abc-42 and 42-ABC are not tickets",
      trackerBase: BASE,
    },
  },
  "no-ticket": {
    props: {
      onOpenTicket: noop,
      title: "Make the gallery the source of truth",
      trackerBase: BASE,
    },
  },
  "no-tracker": {
    props: { onOpenTicket: noop, title: "SCR-2891 Retry the poller" },
  },
  overflow: {
    props: { onOpenTicket: noop, title: UNBREAKABLE, trackerBase: BASE },
  },
  "one-ticket": {
    props: {
      onOpenTicket: noop,
      title: "SCR-2891 Retry the poller",
      trackerBase: BASE,
    },
  },
  "repeated-separator": {
    props: {
      onOpenTicket: noop,
      title: "ABC-1 and ABC-2 and ABC-3 all land together",
      trackerBase: BASE,
    },
    provenance:
      "identical text runs between tickets used to key the spans by their text, so React saw duplicate siblings and warned it may drop one",
  },
  "trailing-slash": {
    props: {
      onOpenTicket: noop,
      title: "SCR-2891 Retry the poller",
      trackerBase: `${BASE}/`,
    },
  },
  unicode: {
    props: {
      onOpenTicket: noop,
      title: "SCR-2891 藤本 さくら · محمد الأمين · 👩‍👩‍👧‍👦",
      trackerBase: BASE,
    },
  },
});
