import { uiDataPackage } from '../../data/uiDataPackage';
import { raceName } from '../careerRaceNames';

/* Card titles for the Rain and explorer deep dives (round 3, proxy review 2):
 * every race named by careerRaceNames' raceName(...).title, the one formatter
 * r2-data owns, fed the conversion table's own eventName and trackName and,
 * where the session id carries no race number (GB3 2022), the race's place in
 * its round from the season campaigns, as the race sheet reads it. */

let cache: Map<string, string> | null = null;

const build = (): Map<string, string> => {
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
  const map = new Map<string, string>();
  for (const row of lab.resultConversion ?? []) {
    const sessionId = typeof row.sessionId === 'string' ? row.sessionId : '';
    if (!sessionId) continue;
    const trackName = typeof row.trackName === 'string' ? row.trackName : '';
    const eventName = typeof row.eventName === 'string' && row.eventName ? row.eventName : trackName;
    map.set(sessionId, raceName({ eventName, sessionId, trackName, raceInRound: inRound.get(sessionId) ?? null }).title);
  }
  return map;
};

/** raceName(...).title for a race, or `fallback` where the session is unknown. */
export const deepRaceTitle = (sessionId: string, fallback: string): string => {
  if (!cache) cache = build();
  return cache.get(sessionId) || fallback;
};
