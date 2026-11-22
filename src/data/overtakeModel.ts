/**
 * Bryce's overtakes, and every other reason his place changed (round 10,
 * Jack's November 17 request: show overtakes again, keep the screen clean,
 * and never count a pit stop or a caution reshuffle as a pass).
 *
 * The site reads the timing about once a second. When Bryce and another car
 * swap places between one reading and the next, that is a candidate. It is an
 * overtake only when Race Control's own pass count agrees: Race Control keeps
 * a `passes` and a `passed` counter for every car, counted at its timing loops,
 * and it does not count a car leaving for the pits, a reshuffle under a
 * caution, or a car that only flickered ahead between two loops. Measured on
 * the 2026 races BryceCast recorded itself (Music City to Monterey):
 *
 *  - Monterey Race 1, lap 2: Correa takes P6 from Bryce at 22:40:13; Bryce's
 *    `passed` goes 1 -> 2 and Correa's `passes` 4 -> 5 in the next reading.
 *  - The same race, a minute later: Rowe, running second, heads for the pits
 *    and drops behind Bryce at 22:41:18. Neither counter moves, and Rowe's
 *    `pitStops` goes 0 -> 1 eleven seconds later. That is a pit stop, not a
 *    pass.
 *  - Monterey Race 2, lap 6: Garcia, running second, falls to 22nd and pits.
 *    Bryce "passes" him in the order; Race Control counts nothing.
 *
 * A candidate is classed, first match wins:
 *  - `caution`: either reading was under a yellow or red flag (or before the
 *    green): the field is neutralised, nobody is racing for the place.
 *  - `retired`: the other car stopped running (or Bryce did).
 *  - `pit`: either car's pit-stop count rises between the reading before the
 *    swap and two and a half minutes after it.
 *  - `incident`: three or more cars go by Bryce (or he by them) in one
 *    reading, about a second. That is a spin, a car off, contact: places
 *    changed, but nobody made an overtake. Portland 2026, lap 1: eight cars
 *    went by him in two seconds; Race Control counted them, then took seven
 *    back at the next caution.
 *  - `pass`: with Race Control's count in the recording, Bryce's matching
 *    counter rises within a minute of the swap (or at the next reading, the
 *    replay's breakpoints being sparse), one rise per pass; the car whose
 *    opposite counter rose with it is named first. Without the count (the
 *    lake-sourced replays of 2024, 2025 and early 2026, which carry only the
 *    order at the line) nothing is a pass: the order alone cannot tell a pass
 *    from a pit cycle or a flicker. Those replays show no passes until the
 *    real-pass filter (`classify()` in
 *    analysis/track-position/lib/pass-placement.mjs) is applied to them
 *    (Jack's call 2, November 17 2026).
 *  - `pending`: live, not yet confirmed and still inside the window.
 *  - `unconfirmed`: none of the above (a flicker of the live order, or any
 *    swap in a recording without the count).
 *
 * Pure: frames in, moves out, so it runs unchanged in node tests and on both
 * the replay's whole-race timeline and the live page's history.
 */

import { isNeutralisedFlag } from './replayStart.ts';

/** One car in one reading, reduced to what the classing needs. */
export interface PassCar {
  id: string;
  no: string;
  name: string;
  /** The live display order (`liveRank`, else `rank`). */
  rank: number | null;
  running: boolean;
  pitStops: number | null;
  passes: number | null;
  passed: number | null;
  /** Laps completed. */
  laps: number | null;
  bryce: boolean;
}

export interface PassFrame {
  atMs: number;
  /** Upper-case flag; '' when the reading carries none. */
  flag: string;
  cars: PassCar[];
}

export type MoveCause = 'pass' | 'pit' | 'caution' | 'retired' | 'incident' | 'pending' | 'unconfirmed';

export interface BryceMove {
  atMs: number;
  /** Bryce's own lap (his laps completed + 1) when it happened. */
  lap: number | null;
  /** He gained the place (`made`) or lost it (`lost`). */
  kind: 'made' | 'lost';
  rivalId: string;
  rivalNo: string;
  rivalName: string;
  /** Bryce's place after the reading. */
  place: number;
  cause: MoveCause;
  /** For a pit move, whose stop it was. */
  pitted?: 'rival' | 'bryce';
  /** How a pass is known: Race Control's pass count agreed. (A recording
   *  without that count names no passes.) */
  basis?: 'race-control';
}

export interface BryceMoves {
  moves: BryceMove[];
  /** Only the overtakes, oldest first. */
  passes: BryceMove[];
  /** The recording carries Race Control's pass count for Bryce. */
  counted: boolean;
}

/** A pass is confirmed by a counter rise this long after the swap. */
export const CONFIRM_WINDOW_MS = 60_000;
/** A pit-stop count rising this long after a swap makes it a pit move. */
export const PIT_LOOKAHEAD_MS = 150_000;
/** This many cars changing places with Bryce in one reading is an incident. */
export const INCIDENT_BURST = 3;
/** A counter rise can confirm a swap seen up to this long before the last
 *  reading that still showed the old count. */
const CONFIRM_LOOKBACK_MS = 60_000;

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const runningStatus = (row: Record<string, unknown>): boolean => {
  const status = String(row.status ?? '').trim().toLowerCase();
  return status === '' || status === 'active' || status === 'running' || status === 'on track';
};

/** A timing row (live, history or rank-series) reduced for the classing. */
export const passCarOf = (row: Record<string, unknown>): PassCar | null => {
  const id = [row.driverId, row.DriverID, row.no, row.name].map((value) => String(value ?? '').trim()).find(Boolean) ?? '';
  if (!id) return null;
  const lastName = String(row.lastName ?? '').trim();
  const name = lastName || String(row.name ?? '').trim().split(/\s+/).at(-1) || `Car ${String(row.no ?? '')}`;
  const rank = numberOrNull(row.liveRank) ?? numberOrNull(row.rank);
  return {
    id,
    no: String(row.no ?? '').trim(),
    name,
    rank: rank !== null && Number.isInteger(rank) && rank >= 1 ? rank : null,
    running: runningStatus(row),
    pitStops: numberOrNull(row.pitStops),
    passes: numberOrNull(row.passes ?? row.Passes),
    passed: numberOrNull(row.passed ?? row.Passed),
    laps: numberOrNull(row.laps),
    bryce: row.bryce === true
  };
};

export const passFrameOf = (atMs: number, flag: unknown, rows: Array<Record<string, unknown>> | undefined): PassFrame => ({
  atMs,
  flag: String(flag ?? '').trim().toUpperCase(),
  cars: (rows ?? []).map(passCarOf).filter((car): car is PassCar => car !== null)
});

/** Racing for the place: green, white, or the reading the checkered flag
 *  falls on (a last-lap pass at the line). Before the green, under yellow or
 *  red, and after the cool-down starts, nobody is. */
const offTrackFlag = (flag: string): boolean => flag === '' || flag === 'COLD' || flag === 'WARM' || flag.includes('PRE');
const racingFlag = (flag: string): boolean => !offTrackFlag(flag) && !isNeutralisedFlag(flag);

interface Candidate extends BryceMove {
  /** Index of the reading before the swap and of the swap itself. */
  before: number;
  index: number;
  /** Places the other car moved in that one reading (absolute). */
  rivalJump: number;
  bryceJump: number;
  /** Swaps of the same kind in the same reading. */
  burst: number;
}

const bryceOf = (frame: PassFrame) => frame.cars.find((car) => car.bryce) ?? null;
const carIn = (frame: PassFrame, id: string) => frame.cars.find((car) => car.id === id) ?? null;

/** Pit-stop count of a car at or before a moment, and the highest it reaches
 *  up to a later moment (null when the recording has no count). */
const pitRose = (frames: PassFrame[], id: string, fromIndex: number, untilMs: number): boolean | null => {
  const start = carIn(frames[fromIndex], id)?.pitStops ?? null;
  if (start === null) return null;
  for (let index = fromIndex + 1; index < frames.length && frames[index].atMs <= untilMs; index += 1) {
    const value = carIn(frames[index], id)?.pitStops ?? null;
    if (value !== null && value > start) return true;
  }
  return false;
};

/**
 * Every change in Bryce's place against another car, classed.
 *
 * `asOfMs` is how far the recording reaches (live: the newest reading). A
 * candidate still inside its confirmation window there is `pending`, not yet
 * `unconfirmed`; a pit stop it might still turn into is not looked for past it.
 */
export const bryceMovesOf = (frames: PassFrame[], asOfMs = frames.at(-1)?.atMs ?? 0): BryceMoves => {
  const ordered = frames.slice().sort((left, right) => left.atMs - right.atMs);
  const candidates: Candidate[] = [];
  const counted = ordered.some((frame) => {
    const bryce = bryceOf(frame);
    return bryce !== null && (bryce.passes !== null || bryce.passed !== null);
  });

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const bryceBefore = bryceOf(previous);
    const bryceNow = bryceOf(current);
    if (!bryceBefore || !bryceNow || bryceBefore.rank === null || bryceNow.rank === null) continue;
    // Before the green and after the cool-down starts the order is a grid or a
    // classification, not a race: nothing there is a move.
    if (offTrackFlag(previous.flag) || offTrackFlag(current.flag)) continue;
    for (const rival of current.cars) {
      if (rival.bryce || rival.rank === null) continue;
      const prior = carIn(previous, rival.id);
      if (!prior || prior.rank === null) continue;
      const wasAhead = prior.rank < bryceBefore.rank;
      const isAhead = rival.rank < bryceNow.rank;
      if (wasAhead === isAhead) continue;
      candidates.push({
        atMs: current.atMs,
        lap: bryceNow.laps !== null ? bryceNow.laps + 1 : null,
        kind: wasAhead ? 'made' : 'lost',
        rivalId: rival.id,
        rivalNo: rival.no,
        rivalName: rival.name,
        place: bryceNow.rank,
        cause: 'unconfirmed',
        before: index - 1,
        index,
        rivalJump: Math.abs(rival.rank - prior.rank),
        bryceJump: Math.abs(bryceNow.rank - bryceBefore.rank),
        burst: 0
      });
    }
  }
  for (const candidate of candidates) {
    candidate.burst = candidates.filter((other) => other.index === candidate.index && other.kind === candidate.kind).length;
  }

  // Neutralised, retired, pitted: settled before any counting.
  for (const candidate of candidates) {
    const previous = ordered[candidate.before];
    const current = ordered[candidate.index];
    const rival = carIn(current, candidate.rivalId);
    const bryce = bryceOf(current);
    if (!racingFlag(previous.flag) || !racingFlag(current.flag)) {
      candidate.cause = 'caution';
      continue;
    }
    if (!rival?.running || !bryce?.running) {
      candidate.cause = 'retired';
      continue;
    }
    const until = Math.min(candidate.atMs + PIT_LOOKAHEAD_MS, asOfMs);
    const rivalPit = pitRose(ordered, candidate.rivalId, candidate.before, until);
    const brycePit = bryce ? pitRose(ordered, bryce.id, candidate.before, until) : null;
    if (rivalPit || brycePit) {
      candidate.cause = 'pit';
      candidate.pitted = brycePit ? 'bryce' : 'rival';
      continue;
    }
    if (candidate.burst >= INCIDENT_BURST) candidate.cause = 'incident';
  }

  const open = (candidate: Candidate) => candidate.cause === 'unconfirmed';

  if (counted) {
    // Each rise of Bryce's counter confirms that many of the open swaps of its
    // kind seen since a minute before the last reading that showed the old
    // count. The car whose opposite counter rose with it goes first, then a
    // swap that still holds at the rise, then the most recent.
    for (const kind of ['made', 'lost'] as const) {
      const mine = kind === 'made' ? 'passes' : 'passed';
      const theirs = kind === 'made' ? 'passed' : 'passes';
      for (let index = 1; index < ordered.length; index += 1) {
        const before = bryceOf(ordered[index - 1])?.[mine] ?? null;
        const after = bryceOf(ordered[index])?.[mine] ?? null;
        if (before === null || after === null || after <= before) continue;
        let rise = after - before;
        const from = ordered[index - 1].atMs - CONFIRM_LOOKBACK_MS;
        const eligible = candidates
          .filter((candidate) => open(candidate) && candidate.kind === kind && candidate.atMs >= from && candidate.atMs <= ordered[index].atMs)
          .map((candidate) => {
            const startValue = carIn(ordered[candidate.before], candidate.rivalId)?.[theirs] ?? null;
            const endValue = carIn(ordered[index], candidate.rivalId)?.[theirs] ?? null;
            const theirsRose = startValue !== null && endValue !== null && endValue > startValue;
            const rival = carIn(ordered[index], candidate.rivalId);
            const bryce = bryceOf(ordered[index]);
            const holds = rival?.rank != null && bryce?.rank != null && (kind === 'made' ? rival.rank > bryce.rank : rival.rank < bryce.rank);
            return { candidate, score: (theirsRose ? 0 : 2) + (holds ? 0 : 1) };
          })
          .sort((left, right) => left.score - right.score || right.candidate.atMs - left.candidate.atMs);
        for (const { candidate } of eligible) {
          if (rise <= 0) break;
          candidate.cause = 'pass';
          candidate.basis = 'race-control';
          rise -= 1;
        }
      }
    }
  }
  // Without Race Control's count no swap is called a pass (call 2): the
  // order alone is not evidence of an overtake. Swaps stay `unconfirmed`.

  // Live: too new to have been confirmed yet.
  for (const candidate of candidates) {
    if (open(candidate) && asOfMs - candidate.atMs < (counted ? CONFIRM_WINDOW_MS : 5_000)) candidate.cause = 'pending';
  }

  const moves: BryceMove[] = candidates.map(({ before: _before, index: _index, rivalJump: _rivalJump, bryceJump: _bryceJump, burst: _burst, ...move }) => move);
  return { moves, passes: moves.filter((move) => move.cause === 'pass'), counted };
};

/** Race Control's own tally for Bryce in one reading, when it carries one. */
export const raceControlTally = (rows: Array<Record<string, unknown>>): { made: number; lost: number } | null => {
  const bryce = rows.find((row) => row.bryce === true);
  if (!bryce) return null;
  const made = numberOrNull(bryce.passes ?? bryce.Passes);
  const lost = numberOrNull(bryce.passed ?? bryce.Passed);
  return made === null && lost === null ? null : { made: made ?? 0, lost: lost ?? 0 };
};

const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

export interface MoveWords {
  text: string;
  tone: 'up' | 'down' | 'flat';
  /** An overtake (green or red), not a place that changed for another reason. */
  pass: boolean;
}

/**
 * One reading's changes as one phrase: the passes if there were any
 * ("passed Kucharczyk and Abel"), otherwise the net places and why. Null when
 * nothing at that reading is worth saying (only unconfirmed or pending swaps,
 * or a net of zero).
 */
export const readingWords = (reading: BryceMove[], { glyph = true }: { glyph?: boolean } = {}): MoveWords | null => {
  const said = reading.filter((move) => move.cause !== 'unconfirmed' && move.cause !== 'pending');
  if (said.length === 0) return null;
  const mark = (up: boolean) => (glyph ? (up ? '▲ ' : '▽ ') : '');
  const made = said.filter((move) => move.cause === 'pass' && move.kind === 'made');
  const lost = said.filter((move) => move.cause === 'pass' && move.kind === 'lost');
  if (made.length > 0 || lost.length > 0) {
    const parts = [
      made.length > 0 ? `passed ${joinNames(made.map((move) => move.rivalName))}` : null,
      lost.length > 0 ? `passed by ${joinNames(lost.map((move) => move.rivalName))}` : null
    ].filter(Boolean);
    const up = made.length >= lost.length;
    return { text: `${mark(up)}${parts.join('; ')}`, tone: up ? 'up' : 'down', pass: true };
  }
  const net = said.reduce((sum, move) => sum + (move.kind === 'made' ? 1 : -1), 0);
  if (net === 0) return null;
  const places = Math.abs(net);
  const updown = `${mark(net > 0)}${net > 0 ? 'up' : 'down'} ${places}`;
  const side = said.filter((move) => move.kind === (net > 0 ? 'made' : 'lost'));
  const others = joinNames(side.map((move) => move.rivalName));
  switch (side[0]?.cause) {
    case 'pit':
      return said.some((move) => move.pitted === 'bryce')
        ? { text: `${mark(false)}down ${places} in the pits`, tone: 'flat', pass: false }
        : { text: `${updown} as ${others} pitted`, tone: 'flat', pass: false };
    case 'retired':
      return { text: `${updown} as ${others} stopped`, tone: 'flat', pass: false };
    case 'caution':
      return { text: `${updown} under the caution`, tone: 'flat', pass: false };
    case 'incident':
      return { text: `${mark(net > 0)}${net > 0 ? 'gained' : 'lost'} ${places} places at once`, tone: 'flat', pass: false };
    default:
      return null;
  }
};

/**
 * The line under his position: the newest change in his last two laps, as
 * {@link readingWords} says it, with the lap.
 */
export const latestMoveWords = (moves: BryceMove[], nowMs: number, lapNow: number | null): MoveWords | null => {
  const shown = moves.filter((move) => move.atMs <= nowMs && move.cause !== 'unconfirmed' && move.cause !== 'pending');
  for (let index = shown.length - 1; index >= 0; ) {
    const atMs = shown[index].atMs;
    const reading = shown.filter((move) => move.atMs === atMs);
    const lap = reading[0].lap;
    if (lapNow !== null && lap !== null && lapNow - lap > 1) return null;
    const words = readingWords(reading);
    if (words) return { ...words, text: `${words.text}${lap !== null ? `, lap ${lap}` : ''}` };
    index -= reading.length;
  }
  return null;
};
