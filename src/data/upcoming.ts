import { uiDataPackage, type UiNextEventPrep, type UiRoadAmericaPrepEvent, type UiStandingsSnapshot } from './uiDataPackage';

/** Prep event accessor tolerant of the package screen rename
 *  (roadAmericaPrep → upcomingPrep during the Mid-Ohio roll-forward). */
export type UpcomingPrepEvent = UiRoadAmericaPrepEvent;

interface PrepScreenShape {
  title: string;
  readiness: string;
  events: UpcomingPrepEvent[];
  caveats: string[];
  sourceRefs: Array<{ key: string; path: string; note: string }>;
}

export const getPrepScreen = (): PrepScreenShape => {
  const screens = uiDataPackage.screens as Record<string, unknown>;
  const prep = (screens.upcomingPrep ?? screens.roadAmericaPrep) as PrepScreenShape | undefined;
  return (
    prep ?? {
      title: 'Upcoming races',
      readiness: 'unavailable',
      events: [],
      caveats: [],
      sourceRefs: []
    }
  );
};

const dayMs = 24 * 60 * 60 * 1000;

/** The event's RACE day — the race session's own local date from the canonical
 *  schedule when it carries one, the weekend start date otherwise. This is the
 *  date "Race day" copy and days-to-green mean: a Saturday-start weekend whose
 *  race runs Sunday must never read "race day" on Saturday (or "-1 days" on
 *  race morning). */
export const raceDayOf = (event: UpcomingPrepEvent): string => event.raceDate ?? event.eventStartDate;

/** Events still upcoming (event-local dates, day precision): a weekend stays
 *  here through its RACE day, not just its first day. */
export const getUpcomingEvents = (now = new Date()): UpcomingPrepEvent[] => {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return getPrepScreen()
    .events.filter((event) => {
      const raceDay = new Date(`${raceDayOf(event)}T12:00:00`).getTime();
      return Number.isFinite(raceDay) && raceDay >= todayStart - dayMs / 2;
    })
    .sort((a, b) => a.eventStartDate.localeCompare(b.eventStartDate));
};

export const getNextEvent = (now = new Date()): UpcomingPrepEvent | null => getUpcomingEvents(now)[0] ?? null;

/** Track-type conversion + Friday-signal rows for the next event, or null if
 *  the package predates the module or the event has no history rows. */
export const getNextEventPrep = (): UiNextEventPrep | null => {
  const screens = uiDataPackage.screens as Record<string, unknown>;
  const prep = (screens.upcomingPrep ?? screens.roadAmericaPrep) as { nextEventPrep?: UiNextEventPrep | null } | undefined;
  return prep?.nextEventPrep ?? null;
};

/** Full-field points from the last COLD race capture; explicit unavailable state. */
export const getStandingsSnapshot = (): UiStandingsSnapshot => {
  const screens = uiDataPackage.screens as Record<string, unknown>;
  const prep = (screens.upcomingPrep ?? screens.roadAmericaPrep) as { standingsSnapshot?: UiStandingsSnapshot } | undefined;
  return prep?.standingsSnapshot ?? { available: false, reason: 'standings snapshot not present in this package build' };
};

/** Days until the RACE (0 = race day), calendar-date difference, or null.
 *  Counts to raceDayOf — "days to green" means the race, not the weekend's
 *  first practice day. */
export const daysUntil = (event: UpcomingPrepEvent, now = new Date()): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raceDayOf(event) ?? '');
  if (!match) return null;
  const eventDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((eventDay - todayStart) / dayMs);
};
