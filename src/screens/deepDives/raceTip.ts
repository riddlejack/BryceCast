import type { VenueTip } from '../../app/venueCard';
import { chapterTint, type CareerRow } from '../careerExplorer';
import { finishLine, raceFieldOf, raceTitleOf } from '../raceCardFacts';
import { wetPhraseFor } from '../../app/wetDry';

/* The race card's words for one career race, the same on every deep dive:
 * the series' short name and the year over the race's clean name (the race
 * sheet's title), grid to flag with the field and the cars he finished ahead
 * of (raceFacts: never a share that counts him), then how it ended where that
 * was not running, and a wet track in the source's words with who called it
 * (app/wetDry.ts). The still comes from the race's own session (venuePeek). */
export const raceTipOf = (row: CareerRow, extra: { detail?: string | null; note?: string | null; action?: string | null } = {}): Omit<VenueTip, 'x' | 'y'> => ({
  venue: { sessionId: row.sessionId, trackName: row.trackName },
  meta: [row.seriesShort, row.seasonYear !== null ? String(row.seasonYear) : null].filter(Boolean).join(' · '),
  tint: chapterTint(row.seriesName),
  title: raceTitleOf(row.sessionId, row.raceLabel),
  detail:
    extra.detail !== undefined
      ? extra.detail
      : finishLine(row.start, row.finish, raceFieldOf(row.sessionId)),
  note:
    extra.note !== undefined
      ? extra.note
      : [row.status !== 'running' ? `ended early: ${row.status}` : null, wetPhraseFor(row.sessionId, row.wetDry)]
          .filter(Boolean)
          .join(' · ') || null,
  action: extra.action !== undefined ? extra.action : 'open the race'
});

/** Every race's venue, for useVenuePreload. */
export const venuesOf = (rows: Iterable<CareerRow>) => [...rows].map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }));
