/**
 * Where a replay's clock starts, found from the archive itself.
 *
 * The capture index's `firstGreenAt` is the first archived frame whose flag is
 * GREEN. On every capture checked (November 14, 2026: the five 2026 Race Control
 * captures, the 2024-25 RaceTools replays, the 2026 Timing71 replays) that frame
 * is the race start: the session goes WARM → GREEN at lap 0. The trouble is a
 * start that a caution neutralises at once. Monterey 2026 Race 2 (`5541-6758`)
 * was green for about 8 seconds, then yellow until the lap-4 restart ten minutes
 * later: 150 seconds of a frozen running order at the default 4×.
 *
 * The rule: the replay begins at the first green flag that holds for
 * {@link RACE_GREEN_HOLD_SECONDS} seconds of race time. A clean start is kept
 * exactly as it was (one probe confirms it); a start that went to caution
 * inside that window is skipped to the restart. The formation option goes back
 * to before the start.
 *
 * Both searches here are pure: the caller injects how to read the flag (or the
 * field's movement) at a virtual moment, so they run unchanged against a local
 * API, the production API through the dev proxy, or a test double. Each is a
 * bounded number of requests, issued in small parallel batches.
 */

/** The flag and leader lap the archive reports at one virtual moment. `flag`
 *  is upper-case, or null when the archive has no heartbeat there (a source
 *  gap, or a lake feed that begins mid-lap). */
export interface FlagSample {
  flag: string | null;
  lap: number | null;
}

export type FlagAt = (atMs: number) => Promise<FlagSample>;

/** A start shorter than this, in seconds of race time, is treated as
 *  neutralised and the replay begins at the restart. Across the archive the
 *  opening green held 8 s at Monterey 2026 Race 2 and 15-30 s at Monterey 2025
 *  Race 2; every other start held 30 s or more, and those keep their start. */
export const RACE_GREEN_HOLD_SECONDS = 30;

export interface RaceStart {
  /** Epoch ms the clock should start at. */
  atMs: number;
  /** `start` — the race start (`firstGreenAt`) held; `restart` — it did not,
   *  and the clock begins at the first green after the opening caution. */
  kind: 'start' | 'restart';
  /** Leader lap at the restart (only for `restart`). */
  lap: number | null;
  /** Archive reads this search made. */
  requests: number;
}

const isGreen = (sample: FlagSample | null | undefined) => sample?.flag === 'GREEN';

/** The first sampled moment in (`fromMs`, `fromMs + step × count`] that reads
 *  GREEN, with the sampled moment before it. Unknown samples count as not
 *  green. Null when none of them is green. */
const scanForGreen = async (
  fromMs: number,
  stepMs: number,
  count: number,
  lastMs: number,
  flagAt: FlagAt,
  counter: { requests: number }
): Promise<{ loMs: number; hiMs: number; lap: number | null } | null> => {
  const points: number[] = [];
  for (let index = 1; index <= count; index += 1) {
    const at = fromMs + stepMs * index;
    if (at > lastMs) break;
    points.push(at);
  }
  if (points.length === 0) return null;
  counter.requests += points.length;
  const samples = await Promise.all(points.map((at) => flagAt(at).catch(() => ({ flag: null, lap: null }))));
  const first = samples.findIndex(isGreen);
  if (first < 0) return null;
  return { loMs: first === 0 ? fromMs : points[first - 1], hiMs: points[first], lap: samples[first].lap };
};

/**
 * The moment the replay clock should start: the race start when its green
 * held, otherwise the restart that ended the opening caution.
 *
 * Request budget: one read for a clean start; for a neutralised start at most
 * `1 + 12 + 6 + 3 × 5` reads per round (scan 12 min at 1 min, then 24 more at
 * 4 min, then narrow to ~2 s in parallel passes of five), and at most two
 * rounds (a restart that is itself neutralised gets one more). Monterey 2026
 * Race 2 costs 24 reads in four round trips. Any read failing, or no green
 * found, falls back to the race start, the behaviour before this search
 * existed.
 */
export const findRaceStart = async ({
  startMs,
  lastMs,
  flagAt,
  holdMs = RACE_GREEN_HOLD_SECONDS * 1000,
  maxRounds = 2,
  resolutionMs = 2_000
}: {
  startMs: number;
  lastMs: number;
  flagAt: FlagAt;
  holdMs?: number;
  maxRounds?: number;
  resolutionMs?: number;
}): Promise<RaceStart> => {
  const counter = { requests: 0 };
  let base = startMs;
  let baseLap: number | null = null;
  for (let round = 0; round < maxRounds; round += 1) {
    const probeAt = base + holdMs;
    if (!Number.isFinite(probeAt) || probeAt > lastMs) break;
    counter.requests += 1;
    const probe = await flagAt(probeAt).catch(() => null);
    // Green after the hold, or nothing readable: keep this start.
    if (!probe || probe.flag === null || isGreen(probe)) break;
    const found =
      (await scanForGreen(probeAt, 60_000, 12, lastMs, flagAt, counter)) ??
      (await scanForGreen(probeAt + 12 * 60_000, 240_000, 6, lastMs, flagAt, counter));
    if (!found) break;
    let { loMs, hiMs, lap } = found;
    // Narrow the flip to `resolutionMs`, five parallel reads per pass.
    while (hiMs - loMs > resolutionMs) {
      const step = (hiMs - loMs) / 6;
      const points = [1, 2, 3, 4, 5].map((index) => Math.round(loMs + step * index));
      counter.requests += points.length;
      const samples = await Promise.all(points.map((at) => flagAt(at).catch(() => ({ flag: null, lap: null }))));
      const first = samples.findIndex(isGreen);
      if (first < 0) {
        loMs = points[points.length - 1];
      } else {
        hiMs = points[first];
        lap = samples[first].lap ?? lap;
        loMs = first === 0 ? loMs : points[first - 1];
      }
    }
    base = hiMs;
    baseLap = lap;
  }
  return base === startMs
    ? { atMs: startMs, kind: 'start', lap: null, requests: counter.requests }
    : { atMs: base, kind: 'restart', lap: baseLap, requests: counter.requests };
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
 * not moving). Two passes of seven parallel reads narrow a 10-14 minute window
 * to about 15 seconds; with nothing found it returns `openMs` (session open).
 */
export const findFormationStart = async ({
  openMs,
  startMs,
  movingAt,
  pointsPerPass = 7,
  passes = 2
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
