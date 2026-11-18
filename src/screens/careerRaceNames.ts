/* Clean names for the light career race sheet (final pass, November 17, 2026).
 *
 * The conversion table's labels are the source's event strings ("Castle Combe
 * Racing Club FF1600 2020 - 2020-07-04", "Hoosier SCCA Super Tour 2019 -
 * Sebring (Central Florida Region, Winter Vacation)"). The sheet's kicker
 * already says the series and season, so the title is the place or the named
 * meeting, then which race of the meeting it was: "Castle Combe · Race 2",
 * "Walter Hayes Trophy · Grand Final", "Sebring · Race 1". Nothing here
 * invents a fact: the place comes from the event string (or the track name
 * where the event string carries only a date), the race from the session id,
 * or, for GB3 2022 whose ids carry no race number, from the race's place in
 * its round in the season campaign. INDY NXT event names already carry
 * "Race N" where a weekend ran two ("Grand Prix of Monterey Race 1"), so that
 * becomes the race, said once: "Grand Prix of Monterey · Race 1". A race that
 * was the only one of its round in the season campaign is the plain event:
 * "Music City Grand Prix". The functions are pure apart from that one
 * lookup in the package, so every row can be checked in one pass. */

import { uiDataPackage } from '../data/uiDataPackage';

/** Long venue names cut to the name people use. Everything else stays as the source spells it. */
const shortPlaces: Record<string, string> = {
  'mid ohio sports car course': 'Mid-Ohio',
  'mid-ohio sports car course': 'Mid-Ohio',
  'watkins glen international': 'Watkins Glen',
  'michelin raceway road atlanta': 'Road Atlanta',
  'euromarque motorsport park': 'Euromarque',
  'highlands motorsport park': 'Highlands',
  'castle combe circuit': 'Castle Combe',
  'cadwell park circuit': 'Cadwell Park',
  'brands hatch circuit': 'Brands Hatch',
  'silverstone circuit': 'Silverstone',
  'snetterton circuit': 'Snetterton',
  'lucas oil indianapolis raceway park': 'Indianapolis Raceway Park'
};

const shortPlace = (name: string): string => shortPlaces[name.trim().toLowerCase()] ?? name.trim();

export interface RaceNameInput {
  eventName: string;
  sessionId: string;
  trackName: string;
  /** The race's place within its round (1-based), where the session id carries no number. */
  raceInRound?: number | null;
  /** How many races its round held. Read from the season campaigns when not given;
   *  a round of one race is the plain event. */
  racesInRound?: number | null;
}

export interface RaceName {
  /** The place or the named meeting: "Castle Combe", "Walter Hayes Trophy". */
  event: string;
  /** Which race of the meeting: "Race 2", "Grand Final", "Saturday race"; null when it ran one. */
  race: string | null;
  /** The championship round, where the event string numbers it. */
  round: number | null;
  /** event · race */
  title: string;
}

/** How many races each session's round held, from the season campaigns (built once). */
let roundSizes: Map<string, number> | null = null;
const racesInRoundOf = (sessionId: string): number | null => {
  if (!roundSizes) {
    roundSizes = new Map();
    for (const campaign of uiDataPackage.screens.careerLab.seasonCampaigns?.campaigns ?? []) {
      const byRound = new Map<number, string[]>();
      for (const race of campaign.races) {
        if (race.roundIndex == null) continue;
        byRound.set(race.roundIndex, [...(byRound.get(race.roundIndex) ?? []), race.sessionId]);
      }
      for (const ids of byRound.values()) for (const id of ids) roundSizes.set(id, ids.length);
    }
  }
  return roundSizes.get(sessionId) ?? null;
};

/** Which race of the meeting, read from the session id (the source's own race naming). */
const raceOf = (sessionId: string, raceInRound: number | null | undefined): string | null => {
  const id = sessionId.toLowerCase();
  const semi = id.match(/semi_final_(\d+)/);
  if (semi) return `Semi-final ${Number(semi[1])}`;
  if (id.includes('grand_final')) return 'Grand Final';
  if (id.includes('last_chance')) return 'Last Chance Race';
  if (/_saturday_race/.test(id)) return 'Saturday race';
  if (/_sunday_race/.test(id)) return 'Sunday race';
  const numbered = id.match(/race[_-]?(\d+)/);
  if (numbered) return `Race ${Number(numbered[1])}`;
  if (raceInRound != null) return `Race ${raceInRound}`;
  return null;
};

export const raceName = ({ eventName, sessionId, trackName, raceInRound, racesInRound }: RaceNameInput): RaceName => {
  /* A trailing parenthesis is the organiser's note: "(Central Florida Region, Winter Vacation)". */
  let event0 = eventName.trim().replace(/\s*\([^)]*\)\s*$/, '');
  /* "INDY NXT by Firestone at the Milwaukee Mile": the series' sponsor prefix, spelt three ways
   *  across seasons. The Races page and the race cards drop it; so does every chart. */
  event0 = event0.replace(/^INDY NXT by Firestone at (the )?/i, '').trim() || event0;
  /* "Grand Prix of Monterey Race 1": the event name already says which race. */
  const named = event0.match(/^(.*\S)\s+Race\s+(\d+)$/i);
  if (named) event0 = named[1];
  let round: number | null = null;
  let event: string;
  /* "<series> <season>[ Round <n>] - <rest>" */
  const parts = event0.match(/^(.*?)\s+(?:19|20)\d{2}(?:\s+Round\s+(\d+))?\s+-\s+(.+)$/);
  if (parts) {
    const [, prefix, roundText, rest0] = parts;
    round = roundText ? Number(roundText) : null;
    const rest = rest0.trim().replace(/^Race Weekend \d+,\s*/i, '');
    if (/^(the\s+)?champion of /i.test(prefix)) event = prefix.replace(/^the\s+/i, '');
    else if (/^\d{4}-\d{2}-\d{2}$/.test(rest)) event = shortPlace(trackName);
    else event = shortPlace(rest.split(/,\s*/)[0]);
  } else {
    /* "BRSCC Formula Ford Festival 2019", "The Champion of Cadwell for FF1600 2020", "Rolex 24 at Daytona" */
    event = event0
      .replace(/\s+(?:19|20)\d{2}\b/, '')
      .replace(/^(the|brscc)\s+/i, '')
      .replace(/\s+for FF1600$/i, '')
      .trim();
  }
  if (!event) event = shortPlace(trackName);
  const inRound = (racesInRound ?? racesInRoundOf(sessionId)) === 1 ? null : raceInRound;
  const race = named ? `Race ${Number(named[2])}` : raceOf(sessionId, inRound);
  return { event, race, round, title: race ? `${event} · ${race}` : event };
};
