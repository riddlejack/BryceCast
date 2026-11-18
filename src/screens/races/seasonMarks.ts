import { formatDate } from '../../app/format';
import { beatLine, placeLine } from '../../app/raceFacts';
import { displayRaceLabelText } from '../../data/debriefArchive';
import type { UiSeasonIndexRow } from '../../data/uiDataPackage';
import type { VenueRef } from '../../app/venuePeek';
import { chapterTint } from '../careerExplorer';
import { fieldSizeFor, statusWords, type ArchiveRace } from '../careerRaceList';
import { raceName } from '../careerRaceNames';
import { wetFor } from '../raceWet';
import { switchValue } from '../../review/switches';

/* ============================================================================
 * The Races page's season charts, as one kind of mark (career round 3,
 * Nov 18 2026). Jack: the season graphs "look like boring basic Excel graphs".
 * Every season, INDY NXT or before, now draws the same picture
 * (races/fieldSeason.tsx): each race its field as a thin line, front at the
 * top, his dot where he finished in it, races grouped by the weekend with the
 * venue named under them. This file turns both sources into that mark.
 * ==========================================================================*/

export interface SeasonMark {
  id: string;
  href: string;
  /** The venue's short name, under the weekend's races. */
  venueShort: string;
  /** The race day (YYYY-MM-DD), for grouping a weekend's races. */
  day: string;
  finish: number | null;
  /** Cars classified, where the source gives it. */
  field: number | null;
  /** Ran to the flag. False: the day ended early (contact, a mechanical). */
  clean: boolean;
  tint: string;
  /** Ringed: a win (earlier seasons) or a top 5 (INDY NXT). */
  ring: boolean;
  /** Championship standing after the round (INDY NXT only). */
  standing: number | null;
  /** A named moment, labelled over the dot on a wide screen. */
  moment: string | null;
  card: { venue: VenueRef; meta: string; title: string; nums: string | null; note: string | null; action?: string };
}

/* ---------- venue names short enough to sit under a weekend ---------- */

const SHORT: Record<string, string> = {
  'homestead-miami speedway': 'Homestead',
  'circuit of the americas': 'COTA',
  'virginia international raceway': 'VIR',
  'pittsburgh international race complex': 'Pittsburgh',
  'new jersey motorsports park': 'NJMP',
  'formula ford festival': 'FF Festival',
  'walter hayes trophy': 'Walter Hayes',
  'silverstone international': 'Silverstone',
  'champion of brands': 'Brands Hatch',
  'champion of cadwell': 'Cadwell Park',
  'spa-francorchamps': 'Spa',
  'streets of st. petersburg': 'St. Pete',
  'barber motorsports park': 'Barber',
  'indianapolis motor speedway road course': 'Indy GP',
  'detroit downtown street circuit': 'Detroit',
  'weathertech raceway laguna seca': 'Laguna Seca',
  'mid-ohio sports car course': 'Mid-Ohio',
  'iowa speedway': 'Iowa',
  'world wide technology raceway': 'Gateway',
  'portland international raceway': 'Portland',
  'the milwaukee mile': 'Milwaukee',
  'nashville superspeedway': 'Nashville',
  'grand prix of arlington street circuit': 'Arlington'
};

export const venueShortOf = (name: string): string => {
  const key = name.trim().toLowerCase();
  if (SHORT[key]) return SHORT[key];
  return name
    .replace(/\b(International|Motorsports?|Race Complex|Raceway|Speedway|Circuit|Park)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || name;
};

/* ---------- INDY NXT rounds ---------- */

/** Archive labels drop the series prefix (everything here is INDY NXT) and
 *  write a doubleheader the way the rest of the site does: "Grand Prix of
 *  Monterey, Race 2". */
export const archiveLabel = (raceLabel: string): string =>
  displayRaceLabelText(raceLabel)
    .replace(/^INDY NXT by Firestone at (the )?/i, '')
    .replace(/[,\s]+(Race\s+\d+)$/i, ', $1');

/** An INDY NXT race's name in the site's one race-name grammar (careerRaceNames,
 *  proxy review 2): "Grand Prix of Monterey · Race 2", a single-race weekend
 *  plain "Iowa Speedway". The meeting and the race of a doubleheader are read
 *  from the source label, then named by raceName like every other race. */
export const indyTitle = ({ raceLabel, sessionId, trackName }: { raceLabel: string; sessionId: string; trackName: string | null }): string => {
  const bare = archiveLabel(raceLabel);
  const double = bare.match(/^(.*?),\s*Race\s+(\d+)$/i);
  return raceName({
    eventName: double ? double[1] : bare,
    sessionId,
    trackName: trackName ?? '',
    raceInRound: double ? Number(double[2]) : null
  }).title;
};

export const indyMarks = (rows: UiSeasonIndexRow[]): SeasonMark[] => {
  const tint = chapterTint('INDY NXT');
  return rows.map((row) => {
    const clean = row.officialStatus === 'running';
    const day = row.raceDate ?? row.eventStartDate ?? '';
    const field = fieldSizeFor(row.sessionId);
    return {
      id: row.sessionId,
      href: `/races/${encodeURIComponent(row.sessionId)}`,
      venueShort: venueShortOf(row.trackName ?? ''),
      day,
      finish: row.finishPosition,
      field,
      clean,
      tint,
      ring: clean && row.finishPosition !== null && row.finishPosition <= 5,
      standing: row.standingRank,
      moment: null,
      card: {
        venue: { sessionId: row.sessionId, trackName: row.trackName },
        meta: [`INDY NXT · Round ${row.roundIndex ?? '—'}`, day ? formatDate(day, { month: 'short', day: 'numeric' }) : null].filter(Boolean).join(' · '),
        title: indyTitle(row),
        nums: [placeLine(row.finishPosition, field), beatLine(row.finishPosition, field)].filter(Boolean).join(' · ') || null,
        note:
          [
            row.startPosition !== null && row.finishPosition !== null && row.startPosition !== row.finishPosition ? `started P${row.startPosition}` : null,
            row.points !== null ? `${row.points} pts` : null,
            row.standingRank !== null ? `P${row.standingRank} in points` : null,
            !clean && row.officialStatus && row.officialStatus !== 'unknown' ? `ended early: ${row.officialStatus}` : null,
            wetFor(row.sessionId)?.words ?? null
          ]
            .filter(Boolean)
            .join(' · ') || null,
        action: 'open the race page'
      }
    };
  });
};

/* ---------- the seasons before INDY NXT ---------- */

/** The meeting's name, the race title before its " · Race N". */
const meetingOf = (race: ArchiveRace): string => race.title.split(' · ')[0] || race.trackName;

/** "Feb 9", or "Weekend of Feb 8" where only the meeting's first day is known. */
export const dayWords = (race: ArchiveRace, year = false): string => {
  const date = formatDate(race.day, year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  return race.dayIsMeeting ? `Weekend of ${date}` : date;
};

/* One finish grammar site-wide (raceFacts): "P8 of 23 · ahead of 15 of the
 * other 22", the place alone where the field isn't known. */
export const archiveNums = (race: ArchiveRace): string => {
  if (race.finish === null) return statusWords(race.status) || 'No classified finish';
  return [placeLine(race.finish, race.field), beatLine(race.finish, race.field)].filter(Boolean).join(' · ');
};

export const archiveNote = (race: ArchiveRace): string | null => {
  const ended = race.finish !== null && race.status !== 'running' ? statusWords(race.status) : '';
  return (
    [
      race.start !== null && race.finish !== null && race.start !== race.finish ? `started P${race.start}` : null,
      ended ? `ended early: ${ended.toLowerCase()}` : null,
      switchValue('rainmarks') === 'off' ? (race.wetDry && race.wetDry !== 'dry' ? `${race.wetDry} track` : null) : (wetFor(race.sessionId)?.words ?? null)
    ]
      .filter(Boolean)
      .join(' · ') || null
  );
};

/** The first win in each series across the whole archive: "First GB3 win". */
export const firstWinsOf = (archive: ArchiveRace[]): Map<string, string> => {
  const seen = new Set<string>();
  const out = new Map<string, string>();
  for (const race of archive) {
    if (race.finish !== 1 || seen.has(race.seriesName)) continue;
    seen.add(race.seriesName);
    out.set(race.sessionId, `First ${race.seriesShort} win`);
  }
  return out;
};

export const archiveMarks = (races: ArchiveRace[], firstWins: Map<string, string>): SeasonMark[] => {
  /* A year with no win names its best finish once, at its first time. */
  const finishes = races.map((race) => race.finish).filter((value): value is number => value !== null);
  const best = finishes.length ? Math.min(...finishes) : null;
  const bestAt = best !== null && best > 1 ? races.find((race) => race.finish === best)?.sessionId ?? null : null;
  return races.map((race) => {
    const short = venueShortOf(meetingOf(race));
    return {
      id: race.sessionId,
      href: race.href,
      venueShort: short,
      day: race.day,
      finish: race.finish,
      field: race.field,
      clean: race.finish !== null && race.status === 'running',
      tint: chapterTint(race.seriesName),
      ring: race.finish === 1,
      standing: null,
      moment: firstWins.get(race.sessionId) ?? (race.sessionId === bestAt ? `Best of the year · P${best} at ${short}` : null),
      card: {
        venue: { sessionId: race.sessionId, trackName: race.trackName, trackId: race.trackId },
        meta: `${race.seriesShort} · ${dayWords(race, true)}`,
        title: race.title,
        nums: archiveNums(race),
        note: archiveNote(race) ?? race.trackName
      }
    };
  });
};
