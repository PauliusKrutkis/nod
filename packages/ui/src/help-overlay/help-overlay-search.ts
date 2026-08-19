/**
 * Filtering for the shortcut sheet. Pure so the view stays props-driven and
 * the behaviour is testable without mounting a dialog. A query keeps a row
 * when it fuzzy-matches the action label or the raw combo text ("shift" finds
 * mod+shift+a), and keeps a whole section when it matches the scope name or
 * note ("review" shows everything the review screen answers to). Sections are
 * re-ranked by their best hit so the group you meant floats up, but rows keep
 * their registry order inside a section — the sheet is a reference, and a
 * reference that reshuffles its lines under a query is harder to learn, not
 * easier. Label match indices ride along for highlighting; combo hits carry
 * none because key caps are drawn, not printed.
 */
import { fuzzyMatch, fuzzyMatchFields } from "../fuzzy/fuzzy.ts";

export interface HelpBinding {
  combo: string;
  description: string;
}

export interface HelpSection {
  active?: boolean;
  bindings: readonly HelpBinding[];
  note?: string;
  scope: string;
}

interface MatchedBinding extends HelpBinding {
  indices?: number[];
}

export interface MatchedSection {
  active?: boolean;
  bindings: readonly MatchedBinding[];
  note?: string;
  scope: string;
}

export interface HelpSearchResult {
  sections: MatchedSection[];
  shown: number;
  total: number;
}

function countBindings(sections: readonly { bindings: readonly unknown[] }[]) {
  return sections.reduce((n, s) => n + s.bindings.length, 0);
}

export function searchHelp(
  sections: readonly HelpSection[],
  query: string
): HelpSearchResult {
  const total = countBindings(sections);
  const q = query.trim();
  if (!q) {
    return { sections: [...sections], shown: total, total };
  }

  const kept: { score: number; section: MatchedSection }[] = [];
  for (const section of sections) {
    const scopeHit = fuzzyMatch(q, `${section.scope} ${section.note ?? ""}`);
    let best = scopeHit ? scopeHit.score : Number.NEGATIVE_INFINITY;
    const rows: MatchedBinding[] = [];
    for (const binding of section.bindings) {
      const hit = fuzzyMatchFields(q, {
        combo: binding.combo,
        description: binding.description,
      });
      if (hit) {
        best = Math.max(best, hit.score);
        rows.push(
          hit.indices.description
            ? { ...binding, indices: hit.indices.description }
            : { ...binding }
        );
      } else if (scopeHit) {
        rows.push({ ...binding });
      }
    }
    if (rows.length > 0) {
      kept.push({ score: best, section: { ...section, bindings: rows } });
    }
  }

  kept.sort((a, b) => b.score - a.score);
  const out = kept.map((k) => k.section);
  return { sections: out, shown: countBindings(out), total };
}
