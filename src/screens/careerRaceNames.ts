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
 * was the only one of its meeting (same event, same season, counted from the
 * package's race list, never from a championship round, since INDY NXT gives
 * every race its own round) is the plain event: "Music City Grand Prix". The functions are pure apart from that one
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
  'lucas oil indianapolis raceway park': 'Indianapolis Raceway Park',
  /* The sources spell it without the tilde; the town is Portimão. */
  portimao: 'Portimão',
  'autodromo internacional do algarve': 'Portimão'
};

const shortPlace = (name: string): string => shortPlaces[name.trim().toLowerCase()] ?? name.trim();

export interface RaceNameInput {
  eventName: string;
  sessionId: string;
  trackName: string;
  /** The race's place within its round (1-based), where the session id carries no number. */
  raceInRound?: number | null;
  /** How many races its meeting held, for a race the package doesn't list. A race it lists is
   *  counted from its meeting (same event, same season); a meeting of one race is the plain event. */
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

/** The meeting a race belonged to: its season and its event, said the way raceName says it
 *  (no organiser's note, no series sponsor, no "Race N"). INDY NXT numbers every race as its own
 *  round, so a round is not a meeting; the event and season are. */
const meetingKey = (seasonYear: unknown, eventName: string): string =>
  `${seasonYear ?? ''}|${eventName
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^INDY NXT by Firestone at (the )?/i, '')
    .replace(/[,\s]+Race\s+\d+$/i, '')
    .trim()
    .toLowerCase()}`;

interface Meeting {
  /** How many of his races the meeting held. */
  size: number;
  /** This race's place in it (1-based), in the order they ran. */
  place: number;
}

/** Every race he ran or started, by session, with its meeting (built once from the package). */
let meetings: Map<string, Meeting> | null = null;
const meetingOf = (sessionId: string): Meeting | null => {
  if (!sessionId) return null;
  if (!meetings) {
    meetings = new Map();
    const lab = uiDataPackage.screens.careerLab;
    const text = (value: unknown): string => (typeof value === 'string' ? value : '');
    const rows = [...(lab.resultConversion ?? []), ...(lab.unclassifiedRaces ?? [])] as Array<Record<string, unknown>>;
    const byMeeting = new Map<string, Array<{ id: string; day: string; n: number }>>();
    const seen = new Set<string>();
    for (const row of rows) {
      const id = text(row.sessionId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const key = meetingKey(row.seasonYear, text(row.eventName) || text(row.trackName));
      const n = Number(id.match(/race[_-]?(\d+)/i)?.[1] ?? text(row.eventName).match(/Race\s+(\d+)$/i)?.[1] ?? 0);
      byMeeting.set(key, [...(byMeeting.get(key) ?? []), { id, day: text(row.raceDate) || text(row.eventStartDate), n }]);
    }
    for (const races of byMeeting.values()) {
      races.sort((a, b) => a.day.localeCompare(b.day) || a.n - b.n);
      races.forEach((race, i) => meetings!.set(race.id, { size: races.length, place: i + 1 }));
    }
  }
  return meetings.get(sessionId) ?? null;
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
  /* The meeting decides: a meeting of one race is the plain event; otherwise the race says which. */
  const meeting = meetingOf(sessionId);
  const size = meeting?.size ?? racesInRound ?? null;
  const inRound = size === 1 ? null : raceInRound ?? meeting?.place ?? null;
  const race = named ? `Race ${Number(named[2])}` : raceOf(sessionId, inRound);
  return { event, race, round, title: race ? `${event} · ${race}` : event };
};

/** A race named from a season-index or race-pack label ("2026 Grand Prix of Monterey Race 2 R2",
 *  "INDY NXT by Firestone at the Milwaukee Mile", "Indianapolis Grand Prix, Race 1"): the year,
 *  the trailing "R2" and the sponsor prefix go, a trailing race number becomes the race, and
 *  raceName says it. Every INDY NXT title on the site (races list, race page, home page) comes
 *  through here, so each reads "<event> · Race N" or the plain event. */
export const labelledRaceTitle = ({ raceLabel, sessionId, trackName }: { raceLabel: string; sessionId: string; trackName?: string | null }): string => {
  const bare = raceLabel
    .trim()
    .replace(/^\d{4}\s+/, '')
    .replace(/\s+R\d+$/, '')
    .replace(/^INDY NXT by Firestone at (the )?/i, '')
    .trim();
  const double = bare.match(/^(.*?)[,\s]+Race\s+(\d+)$/i);
  return raceName({
    eventName: double ? double[1] : bare,
    sessionId,
    trackName: trackName ?? '',
    raceInRound: double ? Number(double[2]) : null
  }).title;
};
