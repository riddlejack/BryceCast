import { useMemo } from 'react';
import { asNumber, asString } from '../app/format';
import { uiDataPackage, type UiUnclassifiedRace } from '../data/uiDataPackage';
import { raceHref, seriesShort, useCareerRows, type CareerRow } from './careerExplorer';
import { raceName } from './careerRaceNames';

/* ============================================================================
 * Every race of his career outside INDY NXT, in one list (career round 2,
 * November 17, 2026). The light race sheet (CareerRaceScreen) reads one race
 * from it; the Races page lists them all, year by year.
 *
 * Classified races are the conversion table's rows (uiDataPackage
 * resultConversion), the same rows the Career charts draw. The races he
 * entered with no classified finish (a DNS, DNF or DSQ) are the A2 miles
 * ledger's (careerLab.unclassifiedRaces): date, venue, series and status, no
 * finish. Two figures are read from elsewhere and say so where they show: the
 * race day (the season campaign's, else the meeting's first day) and the field
 * size (read back from the finishing percentile, as the Biggest climbs dive does).
 * ==========================================================================*/

type Conversion = Record<string, unknown>;

export interface SheetRace {
  row: CareerRow;
  seriesId: string;
  title: string;
  round: number | null;
  /** The day the race ran, where the season campaign gives it. */
  raceDay: string | null;
  /** The meeting's first day (the conversion table's date). */
  meetingDay: string;
  /** Sort key within a day: the programme's race number, else the race's place in its round. */
  order: number;
  team: string | null;
  points: number | null;
  /** Classified cars, read back from the finishing percentile; null where it can't be (a win). */
  field: number | null;
}

/** The site's percentile is (field − finish + 1) / field, so field = (finish − 1) / (1 − p).
 *  Accepted only when it lands on a whole number; a win (p = 1) gives none.
 *  The same rule as the Biggest climbs dive. */
export const fieldFromPercentile = (finish: number, percentile: number): number | null => {
  if (!(percentile < 1) || finish < 2) return null;
  const n = (finish - 1) / (1 - percentile);
  const whole = Math.round(n);
  return Math.abs(n - whole) < 0.05 && whole >= finish ? whole : null;
};

/** Heats and semi-finals run before a final on the same day. */
const stageRank = (sessionId: string): number => {
  const id = sessionId.toLowerCase();
  if (id.includes('grand_final')) return 3;
  if (id.includes('semi_final')) return 2;
  if (id.includes('last_chance')) return 1;
  return 0;
};

const programmeOrder = (sessionId: string, inRound: number | null | undefined): number => {
  const programme = sessionId.match(/race[_-]?(\d+)/i);
  return (programme ? Number(programme[1]) : inRound ?? 0) + stageRank(sessionId) * 1000;
};

let campaignCache: { inRound: Map<string, number>; day: Map<string, string> } | null = null;
const campaignIndex = () => {
  if (campaignCache) return campaignCache;
  const inRound = new Map<string, number>();
  const day = new Map<string, string>();
  for (const campaign of uiDataPackage.screens.careerLab.seasonCampaigns?.campaigns ?? []) {
    const seen = new Map<number, number>();
    for (const race of campaign.races) {
      if (race.roundIndex != null) {
        const n = (seen.get(race.roundIndex) ?? 0) + 1;
        seen.set(race.roundIndex, n);
        inRound.set(race.sessionId, n);
      }
      if (race.raceDate) day.set(race.sessionId, race.raceDate);
    }
  }
  campaignCache = { inRound, day };
  return campaignCache;
};

/** Every classified career race (INDY NXT included), chronological. */
export const useSheetRaces = (): SheetRace[] => {
  const rows = useCareerRows();
  return useMemo(() => {
    const raw = new Map<string, Conversion>();
    for (const entry of uiDataPackage.screens.careerLab.resultConversion ?? []) {
      const id = asString((entry as Conversion).sessionId);
      if (id) raw.set(id, entry as Conversion);
    }
    const { inRound, day } = campaignIndex();
    return rows
      .map((row): SheetRace => {
        const source = raw.get(row.sessionId) ?? {};
        const name = raceName({
          eventName: asString(source.eventName) ?? row.raceLabel,
          sessionId: row.sessionId,
          trackName: row.trackName,
          raceInRound: inRound.get(row.sessionId) ?? null
        });
        return {
          row,
          seriesId: asString(source.seriesId) ?? '',
          title: name.title,
          round: name.round,
          raceDay: day.get(row.sessionId) ?? null,
          meetingDay: row.date,
          order: programmeOrder(row.sessionId, inRound.get(row.sessionId)),
          team: asString(source.teamName),
          points: asNumber(source.points),
          field: fieldFromPercentile(row.finish, row.percentile)
        };
      })
      .sort((a, b) => (a.raceDay ?? a.meetingDay).localeCompare(b.raceDay ?? b.meetingDay) || a.order - b.order);
  }, [rows]);
};

/** Races entered per series, from the life-stats weeks grid: the count the
 *  Career page's chapter panels and series bar read ("23 classified of 26 entered"). */
export const enteredBySeries = (): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const week of uiDataPackage.screens.careerLab.lifeStats?.weeksGrid?.weeks ?? []) {
    for (const race of week.races) counts.set(race.seriesId, (counts.get(race.seriesId) ?? 0) + race.raceCount);
  }
  return counts;
};

/* ---------- one archive list: classified and unclassified ---------- */

export interface ArchiveRace {
  sessionId: string;
  seasonYear: number;
  /** The race day where the campaign gives it, else the meeting's first day. */
  day: string;
  /** True when `day` is the meeting's first day, not the race's own. */
  dayIsMeeting: boolean;
  seriesId: string;
  seriesName: string;
  seriesShort: string;
  trackName: string;
  trackId: string | null;
  title: string;
  round: number | null;
  /** Null: no classified finish (see status). */
  finish: number | null;
  start: number | null;
  field: number | null;
  percentile: number | null;
  /** The source's status: running, dnf, dns, dsq, mechanical… */
  status: string;
  wetDry: string | null;
  href: string;
  order: number;
}

const unclassifiedRows = (): UiUnclassifiedRace[] => uiDataPackage.screens.careerLab.unclassifiedRaces ?? [];

export const unclassifiedRaceFor = (sessionId: string): UiUnclassifiedRace | null =>
  unclassifiedRows().find((row) => row.sessionId === sessionId) ?? null;

/** The title of a race with no classified finish, in the sheet's own words. */
export const unclassifiedTitle = (race: UiUnclassifiedRace): { title: string; round: number | null } => {
  const { inRound } = campaignIndex();
  const name = raceName({
    eventName: race.eventName ?? race.trackName ?? '',
    sessionId: race.sessionId,
    trackName: race.trackName ?? '',
    raceInRound: inRound.get(race.sessionId) ?? null
  });
  return { title: name.title, round: name.round };
};

/** Every race outside INDY NXT, classified or not, chronological. */
export const useArchiveRaces = (): ArchiveRace[] => {
  const sheets = useSheetRaces();
  return useMemo(() => {
    const { inRound, day } = campaignIndex();
    const classified = sheets
      .filter((race) => race.row.seriesName !== 'INDY NXT')
      .map(
        (race): ArchiveRace => ({
          sessionId: race.row.sessionId,
          seasonYear: race.row.seasonYear ?? Number(race.meetingDay.slice(0, 4)),
          day: race.raceDay ?? race.meetingDay,
          dayIsMeeting: race.raceDay === null,
          seriesId: race.seriesId,
          seriesName: race.row.seriesName,
          seriesShort: race.row.seriesShort,
          trackName: race.row.trackName,
          trackId: null,
          title: race.title,
          round: race.round,
          finish: race.row.finish,
          start: race.row.start,
          field: race.field,
          percentile: race.row.percentile,
          status: race.row.status,
          wetDry: race.row.wetDry,
          href: raceHref(race.row.sessionId),
          order: race.order
        })
      );
    const unclassified = unclassifiedRows()
      .filter((race) => race.seriesName !== 'INDY NXT' && race.eventStartDate)
      .map((race): ArchiveRace => {
        const { title, round } = unclassifiedTitle(race);
        const raceDay = day.get(race.sessionId) ?? null;
        return {
          sessionId: race.sessionId,
          seasonYear: race.seasonYear ?? Number(race.eventStartDate!.slice(0, 4)),
          day: raceDay ?? race.eventStartDate!,
          dayIsMeeting: raceDay === null,
          seriesId: race.seriesId ?? '',
          seriesName: race.seriesName ?? '',
          seriesShort: seriesShort(race.seriesName ?? ''),
          trackName: race.trackName ?? '',
          trackId: race.trackId,
          title,
          round,
          finish: null,
          start: null,
          field: null,
          percentile: null,
          status: race.status ?? 'unknown',
          wetDry: null,
          href: raceHref(race.sessionId),
          order: programmeOrder(race.sessionId, inRound.get(race.sessionId))
        };
      });
    return [...classified, ...unclassified].sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order);
  }, [sheets]);
};

/** The short words for a race that ended without a classified finish. */
export const statusWords = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'dns') return 'Did not start';
  if (s === 'dnf') return 'Did not finish';
  if (s === 'dsq') return 'Disqualified';
  if (s === 'running' || s === 'unknown' || !s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const statusShort = (status: string): string => {
  const s = status.toLowerCase();
  return s === 'dns' || s === 'dnf' || s === 'dsq' ? s.toUpperCase() : '—';
};
