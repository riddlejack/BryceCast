import type { VenueRef } from '../app/venuePeek';
import { uiDataPackage } from '../data/uiDataPackage';

/* The track a stretch of the calendar was raced at (a weekend, a month), read
 * from the career's race rows by date: the weeks grid names events, not
 * tracks, so a mark that stands for a week or a month finds its track here
 * for the hover card's still. A stretch at more than one track, or one no
 * race row covers, has none (the card then reads as text). */
const time = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

const raceRows = (uiDataPackage.screens.careerLab.resultConversion ?? [])
  .map((row) => ({
    sessionId: String(row.sessionId ?? ''),
    trackName: String(row.trackName ?? ''),
    t: row.eventStartDate ? time(String(row.eventStartDate)) : NaN
  }))
  .filter((row) => row.sessionId && row.trackName && Number.isFinite(row.t));

/** [from, to) in UTC ms: the one track raced then, as a venue (plain model), or null. */
export const venueBetween = (from: number, to: number): VenueRef | null => {
  const inside = raceRows.filter((row) => row.t >= from && row.t < to);
  const tracks = new Set(inside.map((row) => row.trackName));
  return tracks.size === 1 ? { sessionId: inside[0].sessionId, trackName: inside[0].trackName, plain: true } : null;
};

/** The week from an ISO Monday. */
export const venueOfWeek = (monday: string): VenueRef | null => venueBetween(time(monday), time(monday) + 7 * 86_400_000);
