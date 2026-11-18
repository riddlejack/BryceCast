import type { VenueTip } from '../../app/venueCard';
import { chapterTint, type CareerRow } from '../careerExplorer';

/* The race card's words for one career race, the same on every deep dive:
 * the series and season over the title, the race, grid to flag and the share
 * of the field beaten, then how it ended where that was not running. The
 * still comes from the race's own session (venuePeek). */
export const raceTipOf = (row: CareerRow, extra: { detail?: string | null; note?: string | null; action?: string | null } = {}): Omit<VenueTip, 'x' | 'y'> => ({
  venue: { sessionId: row.sessionId, trackName: row.trackName },
  meta: [row.seriesShort, row.seasonYear !== null ? String(row.seasonYear) : null].filter(Boolean).join(' · '),
  tint: chapterTint(row.seriesName),
  title: row.raceLabel,
  detail:
    extra.detail !== undefined
      ? extra.detail
      : `${row.start !== null ? `P${row.start} → P${row.finish}` : `finished P${row.finish}`} · beat ${Math.round(row.percentile * 100)}% of the field`,
  note:
    extra.note !== undefined
      ? extra.note
      : [row.status !== 'running' ? `ended early: ${row.status}` : null, row.wetDry && row.wetDry !== 'dry' ? `${row.wetDry} track` : null]
          .filter(Boolean)
          .join(' · ') || null,
  action: extra.action !== undefined ? extra.action : 'open the race'
});

/** Every race's venue, for useVenuePreload. */
export const venuesOf = (rows: Iterable<CareerRow>) => [...rows].map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }));
