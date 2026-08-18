/**
 * The matcher behind the canned-comment and skill pickers, kept out of the
 * component file so that file exports components only — a module that mixes
 * the two loses Fast Refresh for everything in it.
 */

/** The smallest prefix worth completing on: one letter matches too much. */
const MIN_QUERY = 2;

/** How many completions the panel will show before it stops offering. */
const MAX_ITEMS = 6;

/**
 * The saved lines that continue `query`, in the order the reviewer keeps
 * them. A line the reviewer has already typed out in full is dropped: there
 * is nothing left to complete, and offering it would put a panel over the
 * text at the exact moment the line is finished. `minQuery` defaults to the
 * composer's two-letter threshold; a driver with its own opening gesture
 * (the chat's `/` skill picker) passes 0 to offer the whole list at once.
 */
export function matchCanned(
  query: string,
  items: string[],
  minQuery: number = MIN_QUERY
): string[] {
  const typed = query.trimStart();
  if (typed.length < minQuery) {
    return [];
  }
  const needle = typed.toLowerCase();
  const hits: string[] = [];
  for (const item of items) {
    const candidate = item.toLowerCase();
    if (candidate.startsWith(needle) && candidate !== needle) {
      hits.push(item);
    }
    if (hits.length === MAX_ITEMS) {
      break;
    }
  }
  return hits;
}
