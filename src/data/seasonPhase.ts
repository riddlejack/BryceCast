import { trackOutlineFor } from '../assets/tracks';
import { getSeasonIndex } from './seasons';
import { getUpcomingEvents } from './upcoming';
import type { UiSeasonIndexRow } from './uiDataPackage';

/* ---------- where the calendar stands ----------
 * 'inSeason' whenever the package still carries an upcoming event; 'complete'
 * once it carries none. Home, Race Week and Live all key off this one read so
 * a finished season can never look like a quiet week between rounds. */

export type SeasonPhase = 'inSeason' | 'complete';

export const getSeasonPhase = (now = new Date()): SeasonPhase =>
  getUpcomingEvents(now).length > 0 ? 'inSeason' : 'complete';

/* ---------- the season in review (latest packaged season) ---------- */

const normalizedTrack = (name: string | null): string => (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The package names two street venues two ways; one venue, one key. */
const trackAliases: Record<string, string> = {
  'detroit downtown street circuit': 'streets of detroit',
  'grand prix of arlington street circuit': 'streets of arlington'
};

export const trackKey = (name: string | null): string => {
  const key = normalizedTrack(name);
  return trackAliases[key] ?? key;
};

const isClean = (row: UiSeasonIndexRow): boolean => row.officialStatus === 'running';

export interface SeasonStandout {
  row: UiSeasonIndexRow;
  label: string;
}

export interface SeasonVenue {
  trackName: string;
  rows: UiSeasonIndexRow[];
  bestFinish: number | null;
}

export interface SeasonReview {
  seasonYear: number;
  rows: UiSeasonIndexRow[];
  races: number;
  weekends: number;
  finalRank: number | null;
  points: number | null;
  top10s: number;
  bestFinish: number | null;
  /** Consecutive top-10 finishes to end the year (0 when the finale wasn't one). */
  closingTop10Run: number;
  /** Average finish, first half vs second half — only when the second half was stronger. */
  halves: { first: number; second: number } | null;
  standouts: SeasonStandout[];
  venues: SeasonVenue[];
}

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export const getSeasonReview = (): SeasonReview | null => {
  const all = getSeasonIndex();
  const years = all.map((row) => row.seasonYear).filter((year): year is number => year !== null);
  if (years.length === 0) return null;
  const seasonYear = Math.max(...years);
  const rows = all
    .filter((row) => row.seasonYear === seasonYear)
    .sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0));
  if (rows.length === 0) return null;

  const finishes = rows.map((row) => row.finishPosition).filter((finish): finish is number => finish !== null);
  const cleanRows = rows.filter((row) => isClean(row) && row.finishPosition !== null);
  const last = rows[rows.length - 1];

  let closingTop10Run = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const finish = rows[index].finishPosition;
    if (finish === null || finish > 10) break;
    closingTop10Run += 1;
  }

  const mid = Math.ceil(rows.length / 2);
  const firstHalf = rows.slice(0, mid).map((row) => row.finishPosition).filter((finish): finish is number => finish !== null);
  const secondHalf = rows.slice(mid).map((row) => row.finishPosition).filter((finish): finish is number => finish !== null);
  const halves =
    firstHalf.length > 1 && secondHalf.length > 1 && average(secondHalf) < average(firstHalf) - 0.5
      ? { first: average(firstHalf), second: average(secondHalf) }
      : null;

  /* Standouts: the season best, then the biggest charges through the field —
   * clean days only, one card per race. */
  const standouts: SeasonStandout[] = [];
  const best = [...cleanRows].sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99))[0];
  if (best) standouts.push({ row: best, label: 'Season best' });
  const charges = cleanRows
    .filter((row) => row.startPosition !== null && row.sessionId !== best?.sessionId)
    .map((row) => ({ row, gain: (row.startPosition as number) - (row.finishPosition as number) }))
    .filter((entry) => entry.gain >= 3)
    .sort((a, b) => b.gain - a.gain || (a.row.finishPosition ?? 99) - (b.row.finishPosition ?? 99))
    .slice(0, 2);
  for (const charge of charges) standouts.push({ row: charge.row, label: `Up ${charge.gain} places` });

  const venueMap = new Map<string, SeasonVenue>();
  for (const row of rows) {
    if (!row.trackName) continue;
    const key = trackKey(row.trackName);
    /* Canonical (outline) name: the section packs and the Tracks page key on it,
     * so the two aliased street venues keep their heat maps and deep links. */
    const venue = venueMap.get(key) ?? { trackName: trackOutlineFor(row.trackName)?.name ?? row.trackName, rows: [], bestFinish: null };
    venue.rows.push(row);
    if (row.finishPosition !== null && (venue.bestFinish === null || row.finishPosition < venue.bestFinish)) {
      venue.bestFinish = row.finishPosition;
    }
    venueMap.set(key, venue);
  }

  return {
    seasonYear,
    rows,
    races: rows.length,
    weekends: venueMap.size,
    finalRank: last.standingRank,
    points: last.cumulativePoints,
    top10s: finishes.filter((finish) => finish <= 10).length,
    bestFinish: finishes.length > 0 ? Math.min(...finishes) : null,
    closingTop10Run,
    halves,
    standouts,
    venues: [...venueMap.values()]
  };
};

/** Bryce's best INDY NXT finish at a venue across every packaged season. */
export const bestFinishAt = (trackName: string | null): { finish: number; seasonYear: number | null } | null => {
  if (!trackName) return null;
  const key = trackKey(trackName);
  let best: { finish: number; seasonYear: number | null } | null = null;
  for (const row of getSeasonIndex()) {
    if (trackKey(row.trackName) !== key || row.finishPosition === null) continue;
    if (!best || row.finishPosition < best.finish) best = { finish: row.finishPosition, seasonYear: row.seasonYear };
  }
  return best;
};

/** Every packaged INDY NXT race of his at a venue, oldest first. */
export const racesAt = (trackName: string | null): UiSeasonIndexRow[] => {
  if (!trackName) return [];
  const key = trackKey(trackName);
  return getSeasonIndex()
    .filter((row) => trackKey(row.trackName) === key)
    .sort((a, b) => (a.seasonYear ?? 0) - (b.seasonYear ?? 0) || (a.roundIndex ?? 0) - (b.roundIndex ?? 0));
};
