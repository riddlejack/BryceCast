import { uiDataPackage } from '../data/uiDataPackage';
import { beatLine, placeLine } from '../app/raceFacts';
import { raceName } from './careerRaceNames';

/* ============================================================================
 * What every race card says about a race (career round 2 fix pass, Nov 17 2026).
 *
 * One grammar for every card: the series' short name and the year once, over
 * the race's clean name (careerRaceNames, the race sheet's own title: "Castle
 * Combe · Race 8", "Walter Hayes Trophy · Grand Final"), then the finish as
 * raceFacts says it ("P5 → P8 of 23 · ahead of 15 of the other 22").
 *
 * The title and field are read per session from the conversion table
 * (eventName, trackName, fieldSize) and the no-finish ledger; the race of its
 * round where the session id carries no number (GB3 2022) from the season
 * campaign, as the race sheet reads it. No import of careerExplorer, so any
 * chart file (careerExplorer included) can use it.
 * ==========================================================================*/

interface Facts {
  title: string;
  event: string;
  field: number | null;
}

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

let cache: { bySession: Map<string, Facts>; trackOfEvent: Map<string, string> } | null = null;

const index = () => {
  if (cache) return cache;
  const lab = uiDataPackage.screens.careerLab;
  const inRound = new Map<string, number>();
  for (const campaign of lab.seasonCampaigns?.campaigns ?? []) {
    const seen = new Map<number, number>();
    for (const race of campaign.races) {
      if (race.roundIndex == null) continue;
      const n = (seen.get(race.roundIndex) ?? 0) + 1;
      seen.set(race.roundIndex, n);
      inRound.set(race.sessionId, n);
    }
  }
  const bySession = new Map<string, Facts>();
  const trackOfEvent = new Map<string, string>();
  const add = (sessionId: string, eventName: string, trackName: string, field: number | null) => {
    if (!sessionId) return;
    const clean = field !== null && field > 0 ? Math.round(field) : null;
    const name = raceName({ eventName: eventName || trackName, sessionId, trackName, raceInRound: inRound.get(sessionId) ?? null });
    bySession.set(sessionId, { title: name.title, event: name.event, field: clean });
  };
  for (const row of lab.resultConversion ?? []) {
    const eventName = str(row.eventName);
    const trackName = str(row.trackName);
    add(str(row.sessionId), eventName, trackName, num(row.fieldSize));
    if (eventName && trackName && !trackOfEvent.has(eventName)) trackOfEvent.set(eventName, trackName);
  }
  for (const race of lab.unclassifiedRaces ?? []) {
    if (!bySession.has(race.sessionId)) add(race.sessionId, race.eventName ?? '', race.trackName ?? '', race.fieldSize ?? null);
    if (race.eventName && race.trackName && !trackOfEvent.has(race.eventName)) trackOfEvent.set(race.eventName, race.trackName);
  }
  cache = { bySession, trackOfEvent };
  return cache;
};

/** The race's clean name, the race sheet's title; `fallback` where the session is unknown. */
export const raceTitleOf = (sessionId: string | null | undefined, fallback: string): string =>
  (sessionId && index().bySession.get(sessionId)?.title) || fallback;

/** Classified cars in the race (the conversion table's field size), or null. */
export const raceFieldOf = (sessionId: string | null | undefined): number | null =>
  (sessionId && index().bySession.get(sessionId)?.field) || null;

/** A meeting's clean name from its event string alone ("Road Atlanta", "Champion of Brands",
 *  "Grand Prix at Road America"): a programme's "Race 1" / "Race 2" are one meeting. */
export const meetingNameOf = (eventName: string): string => {
  const trackName = index().trackOfEvent.get(eventName) ?? '';
  const bare = eventName.replace(/^INDY NXT by Firestone at (the )?/i, '');
  const { event } = raceName({ eventName: bare, sessionId: '', trackName });
  return event.replace(/[,\s]+Race\s+\d+$/i, '').trim() || eventName;
};

/** A track's short name, as the race sheets say it ("Mid-Ohio", "Road Atlanta"). */
export const placeNameOf = (trackName: string): string => raceName({ eventName: '', sessionId: '', trackName }).event || trackName;

/** "P5 → P8 of 23 · ahead of 15 of the other 22"; "P8 of 23"; "P1 of 18 · ahead of all 17 others". */
export const finishLine = (start: unknown, finish: unknown, field: number | null | undefined): string | null => {
  const place = placeLine(finish, field);
  if (!place) return null;
  const grid = num(start);
  const head = grid !== null && grid > 0 ? `P${Math.round(grid)} → ${place}` : place;
  return [head, beatLine(finish, field)].filter(Boolean).join(' · ');
};
