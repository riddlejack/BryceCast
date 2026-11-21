/**
 * The review registry for Jack's BryceCast switchboard (November 16, 2026; the
 * personal site's `site/src/review/` pattern). Every `registry/*.json` file is
 * read at build time: one file per round or lane, each a list of entries.
 *
 * An entry: { id, page, title, switch, values (default first; null = the bare
 * address), look, noswitch (when switch is null), with (address parameters the
 * change needs, e.g. a replay), anchor (CSS selector or #id the panel scrolls
 * to), added (YYYY-MM-DDTHH:MM), reviewed, ruling?, knob? }.
 *
 * Register an entry in the same commit as the change it shows.
 */

export interface Choice {
  value: string | null;
  label: string;
}

export interface Entry {
  id: string;
  lane: string;
  page: string | string[];
  title: string;
  switch: string | null;
  values?: Choice[];
  look: string;
  noswitch?: string;
  with?: Record<string, string>;
  anchor?: string;
  added: string;
  reviewed: boolean;
  ruling?: string;
  knob?: boolean;
  replacedBy?: string;
}

export interface SitePage {
  key: string;
  name: string;
  href: string;
  group: string;
}

/** The site's pages, in the nav's order; `/races/*` is any one race. */
export const PAGES: SitePage[] = [
  { key: '/', name: 'Home', href: '/', group: 'Pages' },
  { key: '/live', name: 'Live and replays', href: '/live?replay=5541-6758&from=session_indy_nxt_2026_6758', group: 'Pages' },
  { key: '/race-week', name: 'Race Week', href: '/race-week', group: 'Pages' },
  { key: '/races', name: 'Races', href: '/races', group: 'Pages' },
  { key: '/races/*', name: 'A race page', href: '/races/session_indy_nxt_2026_6758', group: 'Pages' },
  { key: '/tracks', name: 'Tracks', href: '/tracks', group: 'Pages' },
  { key: '/career', name: 'Career', href: '/career', group: 'Pages' },
  { key: '/data', name: 'Data', href: '/data', group: 'Pages' },
  { key: '/about', name: 'About', href: '/about', group: 'Pages' }
];

const files = import.meta.glob<{ lane: string; entries: Omit<Entry, 'lane'>[] }>('./registry/*.json', { eager: true, import: 'default' });

export const ENTRIES: Entry[] = Object.values(files)
  .flatMap((file) => file.entries.map((entry) => ({ ...entry, lane: file.lane }) as Entry))
  .sort((a, b) => b.added.localeCompare(a.added));

/** The page key for an address: the nav's pages, any race under `/races/*`. */
export const pageKey = (pathname: string): string | null => {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (/^\/races\/.+/.test(path)) return '/races/*';
  return PAGES.some((page) => page.key === path) ? path : null;
};

const pageList = (entry: Entry): string[] => (Array.isArray(entry.page) ? entry.page : [entry.page]);

export const onPage = (entry: Entry, key: string | null): boolean =>
  key !== null && pageList(entry).some((page) => page === '*' || page === key);

/** On more than one page (the footer, every page). */
export const isWide = (entry: Entry): boolean => pageList(entry).some((page) => page === '*') || pageList(entry).length > 1;

export const scopeOf = (entry: Entry): string => (pageList(entry).includes('*') ? 'every page' : pageList(entry).join(', '));

export const pagesOf = (entry: Entry): SitePage[] =>
  pageList(entry).includes('*') ? PAGES : PAGES.filter((page) => pageList(entry).includes(page.key));

/** New: not ruled on, not a knob, not replaced. */
export const isNew = (entry: Entry): boolean => !entry.reviewed && !entry.knob && !entry.replacedBy;

/** A page's entries: its own first, then those on every page. */
export const entriesFor = (key: string | null): Entry[] => [
  ...ENTRIES.filter((entry) => !isWide(entry) && onPage(entry, key)),
  ...ENTRIES.filter((entry) => isWide(entry) && onPage(entry, key))
];
