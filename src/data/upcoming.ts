import { uiDataPackage, type UiRoadAmericaPrepEvent } from './uiDataPackage';

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

/** Events whose start date is today or later (event-local dates, day precision). */
export const getUpcomingEvents = (now = new Date()): UpcomingPrepEvent[] => {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return getPrepScreen()
    .events.filter((event) => {
      const start = new Date(`${event.eventStartDate}T12:00:00`).getTime();
      return Number.isFinite(start) && start >= todayStart - dayMs / 2;
    })
    .sort((a, b) => a.eventStartDate.localeCompare(b.eventStartDate));
};

export const getNextEvent = (now = new Date()): UpcomingPrepEvent | null => getUpcomingEvents(now)[0] ?? null;

/** Days until the event (0 = today), or null. */
export const daysUntil = (event: UpcomingPrepEvent, now = new Date()): number | null => {
  const start = new Date(`${event.eventStartDate}T12:00:00`).getTime();
  if (!Number.isFinite(start)) return null;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((start - todayStart) / dayMs);
};
