/* Caution cause copy — shared, testable, and honest about ties.
 *
 * The Race Week venue card and the Race Detail "day" tile both summarize the
 * official causes of a set of full-course cautions. The rule (design-review
 * law): render COUNTED FACTS ("1 contact · 1 debris"), and only ever say "most"
 * when a single category is STRICTLY more than half of all cautions. A tie
 * (2 contact · 2 mechanical) or a bare plurality is never turned into a verdict.
 *
 * These are pure functions with no rendering or Vite dependencies so the copy
 * rules can be asserted directly in tests (uiContextAdapter.test.ts). */

export interface CauseCount {
  category: string;
  count: number;
}

/** Order causes the way the atlas counts them: by count desc, then name asc, so
 *  "2 contact · 2 mechanical · 1 off course" is deterministic regardless of the
 *  upstream order. Zero-count entries are dropped. */
export const orderedCauses = (categories: CauseCount[]): CauseCount[] =>
  categories
    .filter((entry) => entry.count > 0)
    .slice()
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

/** The total number of cautions across every category. */
export const causeTotal = (categories: CauseCount[]): number =>
  categories.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);

/** Counted cause facts, one category per term: "1 contact · 1 debris".
 *  Pass separator ', ' where a middot already joins the surrounding clauses
 *  (the race tile: "… · 1 contact, 1 debris"). Returns null when there is
 *  nothing to count. Never a verdict — every category is stated with its count. */
export const causeFacts = (categories: CauseCount[], separator = ' · '): string | null => {
  const cats = orderedCauses(categories);
  if (cats.length === 0) return null;
  return cats.map((entry) => `${entry.count} ${entry.category.toLowerCase()}`).join(separator);
};

/** The sole majority cause — the ONE category strictly greater than half of all
 *  cautions — or null. A tie (2–2) or a bare plurality (2 of 5) returns null, so
 *  the caller falls back to counted facts rather than asserting a "most". */
export const causeMajority = (categories: CauseCount[]): CauseCount | null => {
  const cats = orderedCauses(categories);
  const total = causeTotal(cats);
  if (cats.length < 2 || total === 0) return null;
  const leaders = cats.filter((entry) => entry.count === cats[0].count);
  if (leaders.length !== 1) return null; // a tie for the lead is never a majority
  return cats[0].count * 2 > total ? cats[0] : null;
};

/** Compact cause clause for a tile note. Single category renders as the bare
 *  category ("contact"); a strict majority renders "mostly contact"; anything
 *  else (ties, pluralities) renders counted facts. */
export const causeClause = (categories: CauseCount[], separator = ', '): string | null => {
  const cats = orderedCauses(categories);
  if (cats.length === 0) return null;
  if (cats.length === 1) return cats[0].category.toLowerCase();
  const majority = causeMajority(cats);
  if (majority) return `mostly ${majority.category.toLowerCase()}`;
  return causeFacts(cats, separator);
};
