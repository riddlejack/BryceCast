/**
 * Where a replay's clock starts and what it skips, found from the archive.
 *
 * The rule (Jack, November 15, 2026): every replay starts at the real green
 * flag, the race start. "I don't want someone to click on one of the races and
 * then nothing happens for 30 seconds." So a caution thrown in the opening laps
 * is jumped, not played: the replay runs the green up to the caution and the
 * moment it is thrown, then goes straight to the restart, says what it skipped
 * and offers to play it instead. Later cautions play at the chosen speed.
 *
 * Why only the opening caution (the official caution summaries of the 44
 * watchable replays, November 15, 2026): 18 races have a caution thrown on laps
 * 1-3, and in those the caution is the first thing a visitor would see, often
 * within seconds of the click (Monterey 2026 Race 2: 8 s of green, then ten
 * minutes of yellow). A later caution comes after several laps of racing the
 * visitor is already watching; it is part of the race, the field still laps
 * and closes up, and the speed buttons are there.
 *
 * The capture index's `firstGreenAt` is the race start on every capture checked
 * (the session goes WARM → GREEN at lap 0). Lake replays can open after it; the
 * clock then starts at their first frame.
 *
 * The searches here are pure: the caller injects how to read the flag (or the
 * field's movement) at a virtual moment, so they run unchanged against a local
 * API, the production API through the dev proxy, or a test double. Each is a
 * bounded number of requests, issued in small parallel batches.
 */

/** The flag and leader lap the archive reports at one virtual moment. `flag`
 *  is upper-case, or null when the archive has no heartbeat there (a source
 *  gap, or a lake feed that begins mid-lap). `lap` is the archive's lap
 *  counter, which reads 0 on the opening lap (laps completed by the leader). */
export interface FlagSample {
  flag: string | null;
  lap: number | null;
}

export type FlagAt = (atMs: number) => Promise<FlagSample>;

const isGreen = (sample: FlagSample | null | undefined) => sample?.flag === 'GREEN';

/** A full-course caution or a red flag: the field is neutralised. */
export const isNeutralisedFlag = (flag: string | null | undefined): boolean => {
  const value = (flag ?? '').toUpperCase();
  // "CHECKERED" spells RED inside it: a red flag is the word, not the letters.
  return value.includes('YELLOW') || value.includes('CAUTION') || value === 'FCY' || /(^|[^A-Z])RED([^A-Z]|$)/.test(value);
};
const isNeutralised = (sample: FlagSample | null | undefined) => isNeutralisedFlag(sample?.flag);

const unknownSample: FlagSample = { flag: null, lap: null };

/** A caution counts as the opening one when it is thrown while the leader is
 *  on lap 1, 2 or 3 (archive lap counter 0-2). */
export const OPENING_CAUTION_LAPS = 3;

/** Where the opening search looks, in seconds of race time after the green.
 *  A caution lasts minutes (a lap at caution pace is 40 s on the shortest oval
 *  and nearer two minutes on a road course), so one-minute spacing cannot step
 *  over one, and seven minutes covers three green laps at Road America. The
 *  read at 0 is the clock's first frame: a Timing71 feed can open after the
 *  green with the caution already out. */
const OPENING_PROBE_SECONDS = [0, 6, 20, 40, 60, 120, 180, 240, 300, 360, 420];

/** The opening caution a default replay jumps. */
export interface OpeningCaution {
  /** First archived moment the field reads neutralised, to ~2 s. */
  thrownMs: number;
  /** First archived moment it reads green again, to ~2 s. */
  restartMs: number;
  /** The archive's lap counter at each end (0 on the opening lap). Null at
   *  the throw when the caution was already out at the replay's first frame
   *  (the feed began after it was thrown). */
  thrownLap: number | null;
  restartLap: number | null;
  /** `red` when any read inside it was a red flag. */
  kind: 'caution' | 'red';
  /** Already out at the replay's first readable frame (a Timing71 feed that
   *  opens after the green): there is no throw to show, so it is jumped at
   *  once. */
  outAtStart: boolean;
  /** Archive reads the search made. */
  requests: number;
}

/** The racing laps a skipped caution covered, in the official caution
 *  summaries' terms: from the lap the leader was on when it was thrown to the
 *  lap the restart came at the end of. Monterey 2026 Race 2 reads lap counter
 *  0 at the throw and 4 at the restart; its official summary says laps 1 to 4.
 *  Checked against the official summaries of all 17 opening cautions the
 *  search finds in the archive (November 15, 2026): the RaceTools and Race
 *  Control feeds match at both ends; Timing71 feeds open with the caution
 *  already out, so only the end is known (`from: null`). */
export const cautionLapSpan = (
  caution: Pick<OpeningCaution, 'thrownLap' | 'restartLap'>
): { from: number | null; to: number } | null => {
  if (caution.restartLap === null) return null;
  if (caution.thrownLap === null) return { from: null, to: Math.max(1, caution.restartLap) };
  const from = caution.thrownLap + 1;
  const to = Math.max(from, caution.restartLap);
  return { from, to };
};

/** At most this many archive reads are in flight at once: the replay API
 *  runs on one small host, and a click must never land on it as a burst. */
export const SEARCH_BATCH = 3;

/** Read `points` in order, `batch` at a time, and stop at the first batch
 *  holding a sample `hit` accepts. Returns every sample read (in order) and
 *  the index of the first hit, or -1. Unreadable reads count as unknown. */
const scanUntil = async (
  points: number[],
  hit: (sample: FlagSample) => boolean,
  flagAt: FlagAt,
  counter: { requests: number },
  batch: number
): Promise<{ samples: FlagSample[]; first: number }> => {
  const samples: FlagSample[] = [];
  for (let start = 0; start < points.length; start += batch) {
    const chunk = points.slice(start, start + batch);
    counter.requests += chunk.length;
    samples.push(...(await Promise.all(chunk.map((at) => flagAt(at).catch(() => unknownSample)))));
    const first = samples.findIndex(hit);
    if (first >= 0) return { samples, first };
  }
  return { samples, first: -1 };
};

/** Narrow (`loMs`, `hiMs`] to the first moment `hit` holds, to `resolutionMs`,
 *  `batch` evenly spaced reads per pass. `hiMs` must already satisfy `hit`. */
const narrow = async (
  loMs: number,
  hiMs: number,
  hiSample: FlagSample,
  hit: (sample: FlagSample) => boolean,
  flagAt: FlagAt,
  counter: { requests: number },
  resolutionMs: number,
  batch: number
): Promise<{ atMs: number; sample: FlagSample }> => {
  let lo = loMs;
  let hi = hiMs;
  let sample = hiSample;
  while (hi - lo > resolutionMs) {
    const step = (hi - lo) / (batch + 1);
    const points = Array.from({ length: batch }, (_, index) => Math.round(lo + step * (index + 1)));
    counter.requests += points.length;
    const samples = await Promise.all(points.map((at) => flagAt(at).catch(() => unknownSample)));
    const first = samples.findIndex(hit);
    // Only a read that answered moves the low end: an unreadable one could
    // be the moment itself.
    const known = (index: number) => samples[index].flag !== null;
    if (first < 0) {
      let last = points.length - 1;
      while (last >= 0 && !known(last)) last -= 1;
      if (last < 0) break;
      lo = points[last];
    } else {
      hi = points[first];
      sample = samples[first];
      let before = first - 1;
      while (before >= 0 && !known(before)) before -= 1;
      if (before >= 0) lo = points[before];
    }
  }
  return { atMs: hi, sample };
};

/**
 * The caution thrown in the opening laps, with its restart, or null when the
 * start ran green past lap `openingLaps`, the caution never ended inside the
 * archive, or the archive could not be read.
 *
 * Reads go {@link SEARCH_BATCH} at a time and every scan stops at its first
 * hit. A clean start costs four batches (twelve seconds… seven minutes of race
 * time); Monterey 2026 Race 2 costs 27 reads in nine round trips: the opening
 * scan stops at its first batch, the throw takes one pass, the restart ten
 * minutes on takes four batches a minute apart and three passes to ~2 s.
 * The replay client calls this only for a race whose official caution summary
 * has a caution starting on laps 1-3, or one the summaries don't cover yet.
 */
export const findOpeningCaution = async ({
  greenMs,
  lastMs,
  flagAt,
  openingLaps = OPENING_CAUTION_LAPS,
  resolutionMs = 2_000,
  batch = SEARCH_BATCH
}: {
  greenMs: number;
  lastMs: number;
  flagAt: FlagAt;
  openingLaps?: number;
  resolutionMs?: number;
  batch?: number;
}): Promise<OpeningCaution | null> => {
  if (!Number.isFinite(greenMs) || !Number.isFinite(lastMs)) return null;
  const counter = { requests: 0 };
  const points = OPENING_PROBE_SECONDS.map((seconds) => greenMs + seconds * 1000).filter((at) => at <= lastMs);
  if (points.length === 0) return null;
  const { samples, first } = await scanUntil(points, isNeutralised, flagAt, counter, batch);
  if (first < 0) return null;
  // A caution first seen with the leader well past the opening laps is a
  // later one; don't spend reads narrowing it.
  const firstLap = samples[first].lap;
  if (firstLap !== null && firstLap > openingLaps + 1) return null;
  // Narrow from the last read that was green (an unreadable read in between
  // could hide the throw).
  let lastGreen = first - 1;
  while (lastGreen >= 0 && !isGreen(samples[lastGreen])) lastGreen -= 1;
  const loMs = lastGreen < 0 ? greenMs : points[lastGreen];
  const hiMs = points[first];
  const thrown = await narrow(loMs, hiMs, samples[first], isNeutralised, flagAt, counter, resolutionMs, batch);
  // No green read before it: the feed began after the throw, so the lap it was
  // thrown on is not in the archive (Timing71 feeds open after the green with
  // no flag for their first seconds, then read yellow on lap 1).
  const outAtStart = lastGreen < 0;
  const thrownLap = outAtStart ? null : thrown.sample.lap;
  // The archive's counter reads 0 on lap 1: lap counter < openingLaps is a
  // throw on laps 1 to openingLaps. A caution already out at the first frame,
  // or one with no lap, counts when it is seen inside the first minute.
  const opening = thrownLap !== null ? thrownLap < openingLaps : thrown.atMs - greenMs <= 60_000;
  if (!opening) return null;
  // The restart: a minute apart for twelve minutes, then four minutes apart
  // for 24 more (Iowa 2024 ran 26 laps under yellow), then narrowed.
  const restartPoints: number[] = [];
  for (let index = 1; index <= 12; index += 1) restartPoints.push(hiMs + 60_000 * index);
  for (let index = 1; index <= 6; index += 1) restartPoints.push(hiMs + 12 * 60_000 + 240_000 * index);
  const inArchive = restartPoints.filter((at) => at <= lastMs);
  const scan = await scanUntil(inArchive, isGreen, flagAt, counter, batch);
  if (scan.first < 0) return null;
  const restart = await narrow(
    scan.first === 0 ? hiMs : inArchive[scan.first - 1],
    inArchive[scan.first],
    scan.samples[scan.first],
    isGreen,
    flagAt,
    counter,
    resolutionMs,
    batch
  );
  const inside = [thrown.sample, ...scan.samples.slice(0, scan.first)];
  return {
    thrownMs: thrown.atMs,
    restartMs: restart.atMs,
    thrownLap,
    restartLap: restart.sample.lap,
    outAtStart,
    kind: inside.some((sample) => (sample.flag ?? '').includes('RED')) ? 'red' : 'caution',
    requests: counter.requests
  };
};

/** Seconds of archive a capture needs before its start for the formation
 *  option to mean anything. RaceTools replays begin at the green flag and
 *  Timing71 replays after it; only BryceCast's own captures open earlier. */
export const FORMATION_MIN_LEAD_SECONDS = 60;

/**
 * When the field rolls out for the formation lap: the last moment before the
 * start at which no car has registered on the timing loops yet.
 *
 * Race Control captures open 10-14 minutes before the green flag, with the field
 * still on the grid. Every car's `liveGap` reads zero until the cars start
 * crossing the timing loops, which on the five 2026 captures happened 3 to 6
 * minutes before the green (the pace and formation laps). `movingAt` answers
 * whether any car has registered at a moment (null when unreadable, counted as
 * not moving). Three passes of three reads narrow a 10-14 minute window
 * to 10-13 seconds; with nothing found it returns `openMs` (session open).
 */
export const findFormationStart = async ({
  openMs,
  startMs,
  movingAt,
  pointsPerPass = SEARCH_BATCH,
  passes = 3
}: {
  openMs: number;
  startMs: number;
  movingAt: (atMs: number) => Promise<boolean | null>;
  pointsPerPass?: number;
  passes?: number;
}): Promise<{ atMs: number; requests: number }> => {
  let loMs = openMs;
  let hiMs = startMs;
  let requests = 0;
  for (let pass = 0; pass < passes && hiMs - loMs > 2_000; pass += 1) {
    const step = (hiMs - loMs) / (pointsPerPass + 1);
    const points = Array.from({ length: pointsPerPass }, (_, index) => Math.round(loMs + step * (index + 1)));
    requests += points.length;
    const moving = await Promise.all(points.map((at) => movingAt(at).catch(() => null)));
    const first = moving.findIndex((value) => value === true);
    if (first < 0) {
      loMs = points[points.length - 1];
    } else {
      hiMs = points[first];
      loMs = first === 0 ? loMs : points[first - 1];
    }
  }
  return { atMs: loMs, requests };
};

/* ---------- the clock's phases: skims and the opening-caution jump ---------- */

/** The rate a caution the visitor chose to watch plays at. */
export const SKIM_SPEED = 16;

/** The formation laps take at most this much wall time from the click to the
 *  green flag. */
export const FORMATION_TARGET_WALL_MS = 8_000;

/** The rates the formation laps may skim at: the lowest that fits the
 *  formation into {@link FORMATION_TARGET_WALL_MS}. Round numbers, so the bar
 *  can say them. */
export const FORMATION_SKIM_SPEEDS = [16, 32, 64, 128] as const;

/** The formation skim for a stretch of `spanMs` race time before the green. */
export const formationSkimSpeed = (spanMs: number): number =>
  FORMATION_SKIM_SPEEDS.find((rate) => spanMs / rate <= FORMATION_TARGET_WALL_MS) ??
  FORMATION_SKIM_SPEEDS[FORMATION_SKIM_SPEEDS.length - 1];

/** Wall time the replay stays on a thrown caution before it jumps to the
 *  restart: long enough for the yellow to show on screen, short enough that
 *  nothing sits still. */
export const CAUTION_BEAT_WALL_MS = 3_000;

/** A stretch of the replay clock with its own rate. `speed: null` plays at the
 *  visitor's chosen speed. Phases run in order from the clock's start; after
 *  the last one the clock runs at the chosen speed. A phase with `jumpToMs`
 *  ends in a jump: when the clock reaches `untilMs` it continues from
 *  `jumpToMs` (the opening caution's restart). */
export interface ReplayPhase {
  untilMs: number;
  speed: number | null;
  kind: 'formation' | 'start' | 'caution';
  jumpToMs?: number;
}

/**
 * The phases for a clock started at `fromMs`: the formation laps at their skim
 * rate up to the green flag; then, with an opening caution, the start at the
 * visitor's speed up to a short beat after the caution is thrown, and a jump to
 * the restart. `watchCaution` plays the caution instead, at {@link SKIM_SPEED}
 * (or the visitor's speed when that is faster).
 */
export const replayPhases = ({
  fromMs,
  greenMs,
  caution,
  speed,
  watchCaution = false,
  beatWallMs = CAUTION_BEAT_WALL_MS
}: {
  fromMs: number;
  greenMs: number | null;
  caution: (Pick<OpeningCaution, 'thrownMs' | 'restartMs'> & { outAtStart?: boolean }) | null;
  speed: number;
  watchCaution?: boolean;
  beatWallMs?: number;
}): ReplayPhase[] => {
  const phases: ReplayPhase[] = [];
  if (greenMs !== null && Number.isFinite(greenMs) && fromMs < greenMs) {
    const rate = formationSkimSpeed(greenMs - fromMs);
    phases.push({ untilMs: greenMs, speed: rate > speed ? rate : null, kind: 'formation' });
  }
  if (caution && fromMs < caution.restartMs) {
    if (watchCaution) {
      phases.push({ untilMs: caution.restartMs, speed: SKIM_SPEED > speed ? SKIM_SPEED : null, kind: 'caution' });
    } else {
      phases.push({
        // A caution already out when the feed begins has no throw to show:
        // jump as soon as the clock reaches it.
        untilMs: caution.outAtStart ? caution.thrownMs : caution.thrownMs + beatWallMs * speed,
        speed: null,
        kind: 'start',
        jumpToMs: caution.restartMs
      });
    }
  }
  return phases;
};

/** Where a phased clock is after `elapsedWallMs` of wall time: its virtual
 *  time, the phase it is in (null once the visitor's speed has taken over),
 *  the rate it runs at, the wall ms to the next phase boundary (null with no
 *  boundary ahead), and whether it has made a phase's jump. */
export const phasedClockPosition = ({
  virtualStartMs,
  elapsedWallMs,
  speed,
  phases
}: {
  virtualStartMs: number;
  elapsedWallMs: number;
  speed: number;
  phases: ReplayPhase[];
}): { atMs: number; phase: ReplayPhase | null; rate: number; wallToNextMs: number | null; jumped: boolean } => {
  let left = Math.max(0, elapsedWallMs);
  let at = virtualStartMs;
  let jumped = false;
  for (const phase of phases) {
    if (at >= phase.untilMs) {
      // A clock placed past a jump's start but before its landing (the
      // caution's restart was found after the clock had reached the throw)
      // makes the jump at once.
      if (phase.jumpToMs !== undefined && at < phase.jumpToMs) {
        at = phase.jumpToMs;
        jumped = true;
      }
      continue;
    }
    const rate = phase.speed ?? speed;
    const span = (phase.untilMs - at) / rate;
    if (left < span) return { atMs: at + left * rate, phase, rate, wallToNextMs: span - left, jumped };
    at = phase.untilMs;
    left -= span;
    if (phase.jumpToMs !== undefined && at < phase.jumpToMs) {
      at = phase.jumpToMs;
      jumped = true;
    }
  }
  return { atMs: at + left * speed, phase: null, rate: speed, wallToNextMs: null, jumped };
};
