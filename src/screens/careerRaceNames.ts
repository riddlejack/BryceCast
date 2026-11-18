/* Clean names for the light career race sheet (final pass, November 17, 2026).
 *
 * The conversion table's labels are the source's event strings ("Castle Combe
 * Racing Club FF1600 2020 - 2020-07-04", "Hoosier SCCA Super Tour 2019 -
 * Sebring (Central Florida Region, Winter Vacation)"). The sheet's kicker
 * already says the series and season, so the title is the place or the named
 * meeting, then which race of the meeting it was: "Castle Combe · Race 2",
 * "Walter Hayes Trophy · Grand Final", "Sebring · Race 1". Nothing here
 * invents a fact: the place comes from the event string (or the track name
 * where the event string carries only a date); the race is his Nth race of the
 * meeting (same event, same season, counted from the package's race list,
 * never from a championship round, since INDY NXT gives every race its own
 * round), in the order the session ids number them, or by day where they carry
 * no number (GB3 2022, the SCCA's Saturday and Sunday races). A club meeting's
 * id carries the day's programme number (Castle Combe's races 1 to 8), so it
 * orders the races but never names one. Named stages keep their names: heats,
 * semi-finals, the Last Chance Race, the Grand Final. A meeting of one race is
 * the plain event: "Music City Grand Prix", "Champion of Brands". INDY NXT event
 * names already carry "Race N" where a weekend ran two ("Grand Prix of Monterey
 * Race 1"), said once: "Grand Prix of Monterey · Race 1". Where one season went
 * to a place for two meetings whose race names would read the same, each says
 * its month after the place ("Silverstone, June · Race 1"), or its day and month
 * where two fell in one month ("Castle Combe, 1 August · Race 1"). The
 * functions are pure apart from that one
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
  'autodromo internacional do algarve': 'Portimão',
  /* GB3 2022's sheets say "Spa", 2021's and Euroformula's "Spa-Francorchamps"; the chapters say Spa. */
  'spa-francorchamps': 'Spa',
  'circuit de spa-francorchamps': 'Spa'
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
  /** Which race of the meeting: "Race 2", "Grand Final", "Semi-final 1"; null when it ran one. */
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

/** A named stage of a meeting, read from the session id: heats, semi-finals, the Last Chance Race
 *  and the Grand Final keep their names wherever they ran. */
const stageOf = (sessionId: string): string | null => {
  const id = sessionId.toLowerCase();
  const semi = id.match(/semi_final_(\d+)/);
  if (semi) return `Semi-final ${Number(semi[1])}`;
  if (id.includes('grand_final')) return 'Grand Final';
  if (id.includes('last_chance')) return 'Last Chance Race';
  const heat = id.match(/heat_(\d+)/);
  if (heat) return `Heat ${Number(heat[1])}`;
  return null;
};

/** The number in a session id ("…_race_6", "…-race-2"). For the club meetings it is the day's
 *  programme number (Castle Combe ran races 1 to 8), not his race of the meeting, so it orders
 *  the races and never names one. */
const idNumber = (sessionId: string): number | null => {
  const found = sessionId.match(/race[_-]?(\d+)/i);
  return found ? Number(found[1]) : null;
};

/** The place and series the event string names, with its championship round; INDY NXT's
 *  "Race N" suffix comes back as `named`. */
const eventOf = (eventName: string, trackName: string): { event: string; named: number | null; round: number | null } => {
  /* A trailing parenthesis is the organiser's note: "(Central Florida Region, Winter Vacation)". */
  let event0 = eventName.trim().replace(/\s*\([^)]*\)\s*$/, '');
  /* "INDY NXT by Firestone at the Milwaukee Mile": the series' sponsor prefix, spelt three ways
   *  across seasons. The Races page and the race cards drop it; so does every chart. */
  event0 = event0.replace(/^INDY NXT by Firestone at (the )?/i, '').trim() || event0;
  /* "Grand Prix of Monterey Race 1": the event name already says which race. */
  const namedRace = event0.match(/^(.*\S)\s+Race\s+(\d+)$/i);
  if (namedRace) event0 = namedRace[1];
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
  return { event, named: namedRace ? Number(namedRace[2]) : null, round };
};

interface Meeting {
  /** How many of his races the meeting held. */
  size: number;
  /** This race's place among the meeting's numbered races (1-based), in the order they ran. */
  place: number;
  /** "June", "1 August": said after the place where one season went there for two meetings whose
   *  race names would otherwise read the same ("Silverstone, June · Race 1"). Null otherwise. */
  when: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Every race he ran or started, by session, with its meeting (built once from the package). */
let meetings: Map<string, Meeting> | null = null;
const meetingOf = (sessionId: string): Meeting | null => {
  if (!sessionId) return null;
  if (!meetings) {
    meetings = new Map();
    const lab = uiDataPackage.screens.careerLab;
    const text = (value: unknown): string => (typeof value === 'string' ? value : '');
    const rows = [...(lab.resultConversion ?? []), ...(lab.unclassifiedRaces ?? [])] as Array<Record<string, unknown>>;
    interface Entry { id: string; day: string; n: number; stage: string | null }
    const byMeeting = new Map<string, { season: string; event: string; races: Entry[] }>();
    const seen = new Set<string>();
    for (const row of rows) {
      const id = text(row.sessionId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const eventName = text(row.eventName) || text(row.trackName);
      const key = meetingKey(row.seasonYear, eventName);
      const parsed = eventOf(eventName, text(row.trackName));
      const n = idNumber(id) ?? parsed.named ?? 0;
      const meeting = byMeeting.get(key) ?? { season: String(row.seasonYear ?? ''), event: parsed.event, races: [] };
      meeting.races.push({ id, day: text(row.raceDate) || text(row.eventStartDate), n, stage: stageOf(id) });
      byMeeting.set(key, meeting);
    }
    /* Race names, meeting by meeting: a race the source numbers is his Nth numbered race of the
     *  meeting, counted in programme order (the id's number runs with the day), else by day. */
    const labels = new Map<string, Set<string>>();
    for (const [key, meeting] of byMeeting) {
      const numbered = meeting.races.every((race) => race.n > 0);
      meeting.races.sort((a, b) => (numbered ? a.n - b.n : a.day.localeCompare(b.day) || a.n - b.n));
      const plain = meeting.races.filter((race) => !race.stage);
      const size = meeting.races.length;
      meeting.races.forEach((race) => meetings!.set(race.id, { size, place: plain.indexOf(race) + 1, when: null }));
      labels.set(key, new Set(meeting.races.map((race) => race.stage ?? (size === 1 ? '' : `Race ${plain.indexOf(race) + 1}`))));
    }
    /* One season, one place, two meetings on different days whose race names overlap: each of that
     *  place's meetings that season says its month, or its day and month where two share a month. */
    const byPlace = new Map<string, string[]>();
    for (const [key, meeting] of byMeeting) {
      const place = `${meeting.season}|${meeting.event}`;
      byPlace.set(place, [...(byPlace.get(place) ?? []), key]);
    }
    const firstDay = (key: string): string => byMeeting.get(key)!.races.map((race) => race.day).filter(Boolean).sort()[0] ?? '';
    for (const keys of byPlace.values()) {
      if (keys.length < 2) continue;
      const clash = keys.some((a, i) =>
        keys.slice(i + 1).some((b) => firstDay(a) !== firstDay(b) && [...labels.get(a)!].some((label) => labels.get(b)!.has(label)))
      );
      if (!clash) continue;
      const months = keys.map((key) => firstDay(key).slice(0, 7));
      const sameMonth = new Set(months).size < months.length;
      for (const key of keys) {
        const day = firstDay(key);
        if (!/^\d{4}-\d{2}-\d{2}/.test(day)) continue;
        const month = MONTHS[Number(day.slice(5, 7)) - 1];
        const when = sameMonth ? `${Number(day.slice(8, 10))} ${month}` : month;
        for (const race of byMeeting.get(key)!.races) meetings.set(race.id, { ...meetings.get(race.id)!, when });
      }
    }
  }
  return meetings.get(sessionId) ?? null;
};

export const raceName = ({ eventName, sessionId, trackName, raceInRound, racesInRound }: RaceNameInput): RaceName => {
  const { event, named, round } = eventOf(eventName, trackName);
  /* The meeting decides: a meeting of one race is the plain event, unless the race was a named
   *  stage; otherwise his Nth race of the meeting. */
  const meeting = meetingOf(sessionId);
  const size = meeting?.size ?? racesInRound ?? null;
  const stage = stageOf(sessionId);
  let race: string | null;
  if (stage) race = stage;
  else if (named !== null) race = `Race ${named}`;
  else if (size === 1) race = null;
  else if (meeting && idNumber(sessionId) !== null) race = `Race ${meeting.place}`;
  else {
    const n = raceInRound ?? meeting?.place ?? null;
    race = n ? `Race ${n}` : null;
  }
  const place = meeting?.when ? `${event}, ${meeting.when}` : event;
  return { event, race, round, title: race ? `${place} · ${race}` : place };
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
