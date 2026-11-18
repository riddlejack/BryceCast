import { uiDataPackage } from '../../data/uiDataPackage';

/* The career record's headline figures for About and Data & sources, read the
 * way the Career page reads them (lifeStats.figures, lifeStats.span, and races
 * by series summed from the weeks grid), so the three pages cannot disagree. */

const lifeStats = uiDataPackage.screens.careerLab.lifeStats;

/** Career order, as on the Career page's chapters (careerAtlas.tsx chapterOrder). */
export const SERIES_ORDER = [
  'series_scca_super_tour',
  'series_frp_f1600',
  'series_rcffs',
  'series_formula_ford',
  'series_gb3',
  'series_euroformula_open',
  'series_froc',
  'series_usf_pro_2000',
  'series_imsa_weathertech',
  'series_indy_nxt'
] as const;

/* The Career page's chapter tints (careerExplorer.tsx chapterTints), by series id.
 * Kept here, not imported, so these light pages don't pull the Career modules in. */
const TINT: Record<string, string> = {
  series_scca_super_tour: 'var(--chapter-f1600)',
  series_frp_f1600: 'var(--chapter-f1600)',
  series_rcffs: 'var(--chapter-f1600)',
  series_formula_ford: 'var(--chapter-ff)',
  series_gb3: 'var(--chapter-gb3)',
  series_euroformula_open: 'var(--chapter-euro)',
  series_froc: 'var(--chapter-fro)',
  series_usf_pro_2000: 'var(--chapter-fro)',
  series_imsa_weathertech: 'var(--chapter-imsa)',
  series_indy_nxt: 'var(--chapter-indy)'
};

const names = new Map<string, { name: string; short: string }>();
for (const venue of uiDataPackage.screens.careerLab.atlas?.venues ?? []) {
  for (const span of venue.seriesSpans) {
    if (!names.has(span.seriesId)) names.set(span.seriesId, { name: span.seriesName, short: span.seriesShort });
  }
}

export const seriesInfo = (seriesId: string): { name: string; short: string; tint: string } => ({
  name: names.get(seriesId)?.name ?? seriesId.replace(/^series_/, ''),
  short: names.get(seriesId)?.short ?? seriesId.replace(/^series_/, ''),
  tint: TINT[seriesId] ?? 'var(--ink-primary)'
});

/** Races by series, counted from the weeks grid exactly as the Career odometer counts them. */
export const racesBySeries: Array<{ seriesId: string; races: number }> = (() => {
  const counts = new Map<string, number>();
  for (const week of lifeStats?.weeksGrid.weeks ?? []) {
    for (const race of week.races) counts.set(race.seriesId, (counts.get(race.seriesId) ?? 0) + race.raceCount);
  }
  const ordered: string[] = [...SERIES_ORDER, ...[...counts.keys()].filter((id) => !(SERIES_ORDER as readonly string[]).includes(id))];
  return ordered.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({ seriesId: id, races: counts.get(id) ?? 0 }));
})();

const figure = (id: string): string | null => lifeStats?.figures.find((item) => item.id === id)?.display ?? null;

export const monthYear = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const longDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const countWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const countWord = (value: number): string => countWords[value] ?? value.toLocaleString('en-US');

/** The record in one object. Null when the career lane is missing from the package. */
export const careerRecord = lifeStats
  ? {
      races: figure('races') ?? String(racesBySeries.reduce((sum, row) => sum + row.races, 0)),
      wins: figure('wins'),
      podiums: figure('podiums'),
      venues: figure('venues') ?? String(lifeStats.venues),
      countries: figure('countries') ?? String(lifeStats.countries),
      series: racesBySeries.length,
      from: monthYear(lifeStats.span.firstDay),
      to: monthYear(lifeStats.span.lastDay),
      firstYear: Number(lifeStats.span.firstDay.slice(0, 4)),
      lastYear: Number(lifeStats.span.lastDay.slice(0, 4)),
      weeks: lifeStats.weeksGrid.weeks,
      sourceRefs: lifeStats.sourceRefs,
      caveats: lifeStats.caveats
    }
  : null;

/** "FRP F1600 2019 Round 3 - Mid Ohio Sports Car Course" → "Mid Ohio Sports Car Course". */
export const eventPlace = (eventName: string): string => {
  const parts = eventName.split(' - ');
  const tail = parts.length > 1 ? parts[parts.length - 1] : '';
  const pick = tail && !/^\d{4}-\d{2}-\d{2}$/.test(tail.trim()) ? tail : parts[0];
  return pick.replace(/\s*\([^)]*\)/g, '').replace(/\s+\d{4}\b/, '').trim();
};
