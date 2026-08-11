/**
 * Push-out for the review's sticky file header: the incoming file's band shoves
 * the pinned one up and off the top, the way it would if it were not pinned at
 * all. Without it the pinned band stays put while the incoming one slides over
 * it, so the file name sits frozen while a border cuts through it, which reads
 * as a rendering fault rather than as one file ending and the next starting.
 *
 * react-virtuoso hoists the current group's header into its own sticky top
 * list, which means the pinned header and the incoming one live in different
 * subtrees and the CSS-only sentinel trick cannot move one with the other.
 * The push is driven instead by an IntersectionObserver watching a lead strip
 * that every header carries directly above itself. Each entry already carries
 * `boundingClientRect`, computed by the browser during its own layout pass, so
 * the scroll path never measures anything and never forces layout; headers
 * register once as they mount, which is once per file entering the rendered
 * range rather than once per frame.
 *
 * The list is virtualized, so the neighbouring file is usually not mounted at
 * all. The push therefore follows only the headers that are mounted AND belong
 * to a file after the pinned one, and ignores everything else. That ordering
 * rule is also what stops a header that has just been unmounted from dragging
 * the header that replaced it off the top of the list.
 *
 * The offset goes on as `translateY(min(0px, <top>px - 100%))`, where the
 * percentage resolves against the header's own height: the band's height stays
 * a CSS concern and nothing here has to measure it. The lead strip's own height
 * is set in quiet.css (`.qf-fsec-lead`) and only has to be taller than the
 * band, so that the push starts before the two headers can touch; LEAD_PX below
 * mirrors it to pick how finely the observer reports on the way in. The strip
 * hangs off its header's padding box, so the push settles with the incoming
 * band's top border resting on the outgoing band's last pixels instead of a
 * hairline gap, which is the join the two bands would draw anyway.
 */

const TOP_LIST_SELECTOR = '[data-testid="virtuoso-top-item-list"]';

const LEAD_PX = 72;

const LEAD_THRESHOLDS = Array.from(
  { length: LEAD_PX + 1 },
  (_, step) => step / LEAD_PX
);

interface LeadState {
  fileIndex: number;
  top: number;
}

export interface StickyHeaderPush {
  attach: (fileIndex: number, lead: HTMLElement) => void;
  detach: (lead: HTMLElement) => void;
  dispose: () => void;
  setScroller: (el: HTMLElement | null) => void;
}

export function createStickyHeaderPush(): StickyHeaderPush {
  const leads = new Map<HTMLElement, LeadState>();
  let pinned: {
    fileIndex: number;
    head: HTMLElement;
    lead: HTMLElement;
  } | null = null;
  let observer: IntersectionObserver | null = null;
  let offset: number | null = null;

  function write(top: number | null) {
    if (top === offset) {
      return;
    }
    offset = top;
    const head = pinned?.head;
    if (!head) {
      return;
    }
    if (top === null) {
      head.style.removeProperty("transform");
      return;
    }
    head.style.transform = `translateY(min(0px, ${top}px - 100%))`;
  }

  function apply() {
    if (!pinned) {
      return;
    }
    let nearest = Number.POSITIVE_INFINITY;
    for (const lead of leads.values()) {
      if (lead.fileIndex > pinned.fileIndex && lead.top < nearest) {
        nearest = lead.top;
      }
    }
    write(nearest < LEAD_PX ? Math.max(0, nearest) : null);
  }

  function onIntersect(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const lead = leads.get(entry.target as HTMLElement);
      if (lead) {
        lead.top =
          entry.boundingClientRect.bottom - (entry.rootBounds?.top ?? 0);
      }
    }
    apply();
  }

  return {
    attach(fileIndex, lead) {
      const head = lead.parentElement;
      if (!head) {
        return;
      }
      if (lead.closest(TOP_LIST_SELECTOR)) {
        pinned = { fileIndex, head, lead };
        offset = null;
        apply();
        return;
      }
      leads.set(lead, { fileIndex, top: Number.POSITIVE_INFINITY });
      observer?.observe(lead);
    },
    detach(lead) {
      if (pinned?.lead === lead) {
        pinned = null;
        offset = null;
        return;
      }
      leads.delete(lead);
      observer?.unobserve(lead);
    },
    dispose() {
      observer?.disconnect();
      observer = null;
      leads.clear();
      pinned = null;
    },
    setScroller(el) {
      observer?.disconnect();
      if (!el) {
        observer = null;
        return;
      }
      observer = new IntersectionObserver(onIntersect, {
        root: el,
        threshold: LEAD_THRESHOLDS,
      });
      for (const lead of leads.keys()) {
        observer.observe(lead);
      }
    },
  };
}
