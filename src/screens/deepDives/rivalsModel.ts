import type { UiCareerRival } from '../../data/uiDataPackage';
import type { CareerRow } from '../careerExplorer';

/* The rivals' data, shared by every design behind ?ddrivals (career round 2,
 * November 17, 2026). Totals come from the head-to-head table; the races
 * behind them come from headToHead[].sharedRaces (head_to_head_races.py, which
 * refuses to write unless its totals equal the table's). */

export const TEAMMATE_FLOOR = 5; /* the old card's floor for naming teammates */

export interface RivalRace {
  sessionId: string;
  /** "Grand Prix of St. Petersburg", year stripped (the card shows the year). */
  label: string;
  year: number | null;
  trackName: string;
  date: string;
  bryceFinish: number | null;
  rivalFinish: number | null;
  /** Bryce classified ahead of this rival in this race. */
  ahead: boolean;
  sameTeam: boolean;
}

export interface Rival {
  name: string;
  races: number;
  ahead: number;
  behind: number;
  teammates: number;
  share: number;
  group: 'bryce' | 'level' | 'rival';
  /** Every race both cars were classified, oldest first; empty if the package predates sharedRaces. */
  list: RivalRace[];
}

type SharedRace = { sessionId: string; bryceFinish: number | null; rivalFinish: number | null; sameTeam: boolean };

export const toRival = (rival: UiCareerRival, rowsById: Map<string, CareerRow>): Rival => {
  const races = rival.racesTogether ?? 0;
  const ahead = rival.bryceAhead ?? 0;
  const behind = rival.bryceBehind ?? 0;
  const shared = ((rival as UiCareerRival & { sharedRaces?: SharedRace[] }).sharedRaces ?? []).map((race): RivalRace => {
    const row = rowsById.get(race.sessionId);
    return {
      sessionId: race.sessionId,
      label: row?.raceLabel ?? race.sessionId,
      year: row?.seasonYear ?? null,
      trackName: row?.trackName ?? '',
      date: row?.date ?? '',
      bryceFinish: race.bryceFinish,
      rivalFinish: race.rivalFinish,
      ahead: race.bryceFinish !== null && race.rivalFinish !== null && race.bryceFinish < race.rivalFinish,
      sameTeam: race.sameTeam
    };
  });
  /* Draw the races only when they agree with the totals; otherwise the
   * designs fall back to counts, never to a mismatched picture. */
  const agrees =
    shared.length === races && shared.filter((race) => race.ahead).length === ahead && shared.filter((race) => !race.ahead).length === behind;
  return {
    name: rival.driverName,
    races,
    ahead,
    behind,
    teammates: rival.sameTeamRaces ?? 0,
    share: races > 0 ? ahead / races : 0.5,
    group: ahead > behind ? 'bryce' : ahead < behind ? 'rival' : 'level',
    list: agrees ? shared : []
  };
};

export const teammateWords = (rival: Rival) =>
  rival.teammates >= TEAMMATE_FLOOR ? `teammates for ${rival.teammates} of ${rival.races}` : null;

export const recordDetail = (rival: Rival) =>
  [`Bryce ahead in ${rival.ahead} of ${rival.races} shared races`, rival.teammates >= TEAMMATE_FLOOR ? `teammates for ${rival.teammates} of them` : null]
    .filter(Boolean)
    .join(' · ');

export const GROUP_LABEL: Record<Rival['group'], string> = {
  bryce: 'Bryce leads the record',
  level: 'Level',
  rival: 'The rival leads'
};

/** "James Roe" → "Roe"; keeps particles ("de Alba", "d'Orlando"). */
export const surname = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length < 2) return name;
  const particles = new Set(['de', 'da', 'van', 'von', 'di', 'le', 'la']);
  let at = parts.length - 1;
  while (at > 1 && particles.has(parts[at - 1].toLowerCase())) at -= 1;
  return parts.slice(at).join(' ');
};
