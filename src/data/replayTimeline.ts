/**
 * A replay's whole race in one read (round 7, Jack's review of November 16).
 *
 * The replay used to find the opening caution with up to 27 archive reads,
 * three at a time, against an 8 s budget. On the production host each read
 * takes 0.35-0.66 s (measured November 16, serially), so the search ran out of
 * time and the replay played the caution instead of jumping it. It also knew
 * nothing about the rest of the race, so the visitor could not skip anything.
 *
 * The server already keeps every replayed race as a list of breakpoints: one
 * frame each time the running order or the flag changes (`/api/history/
 * rank-series`, memoised per session and shared by every viewer). Asked with
 * the clock at the end of the capture and no window, it returns all of them:
 * 108-147 frames for Monterey 2026 Race 2, 1.4 s and about 60 KB compressed
 * from production. One read gives the exact moment of every flag change (so
 * every caution and its restart), and Bryce's running position at every change
 * (the trace on the race bar). It runs once, after the first frame is up.
 *
 * Pure apart from `loadReplayTimeline`, which takes its fetcher, so the parsing
 * runs unchanged in node tests.
 */
import { isNeutralisedFlag, OPENING_CAUTION_LAPS, type OpeningCaution } from './replayStart.ts';
import { bryceMovesOf, passFrameOf, type BryceMoves, type PassCar } from './overtakeModel.ts';

/** One breakpoint, reduced to what the replay needs. */
export interface TimelineFrame {
  atMs: number;
  /** The archive's lap counter (laps completed by the leader). */
  lap: number | null;
  /** Upper-case flag, '' when the frame carries none. */
  flag: string;
  /** Bryce's running position and laps completed, when he has a row. */
  bryceRank: number | null;
  bryceLaps: number | null;
  /** Every car, reduced to what the overtake classing reads (round 10). */
  cars?: PassCar[];
}

/** A stretch with the field neutralised, from the first frame that reads
 *  yellow (or red) to the first that reads green again. */
export interface FlagPeriod {
  kind: 'caution' | 'red';
  fromMs: number;
  /** The restart; null when the race finished under it or the capture ended. */
  toMs: number | null;
  fromLap: number | null;
  toLap: number | null;
  /** The capture opened with it already out (no green frame before it). */
  outAtStart: boolean;
}

export interface ReplayTimeline {
  frames: TimelineFrame[];
  periods: FlagPeriod[];
  /** The first frame with a Bryce row (a Timing71 feed opens without one). */
  firstBryceMs: number | null;
  /** The first green frame. */
  firstGreenMs: number | null;
  /** The checkered flag, when the capture reaches it. */
  checkeredMs: number | null;
  /** The breakpoints reach back to the capture's first frame (the server keeps
   *  at most 400 per read; a longer list arrives in pieces). */
  complete: boolean;
  /** Every change in Bryce's place, classed: overtakes (Race Control's count
   *  agreeing), pit stops, caution reshuffles, incidents. The whole race is
   *  known, so nothing is pending. */
  moves: BryceMoves;
}

interface RankSeriesFrame {
  checkedAt?: unknown;
  lap?: unknown;
  flag?: unknown;
  rows?: Array<Record<string, unknown>>;
}

interface RankSeriesResponse {
  available?: boolean;
  frames?: RankSeriesFrame[];
}

const numberOf = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The frames of one rank-series response, oldest first. */
export const timelineFramesOf = (response: RankSeriesResponse | null | undefined): TimelineFrame[] => {
  const frames: TimelineFrame[] = [];
  for (const frame of response?.frames ?? []) {
    const atMs = Date.parse(String(frame?.checkedAt ?? ''));
    if (!Number.isFinite(atMs)) continue;
    const bryce = (frame.rows ?? []).find((row) => row?.bryce === true) ?? null;
    frames.push({
      atMs,
      lap: numberOf(frame.lap),
      flag: String(frame.flag ?? '').trim().toUpperCase(),
      bryceRank: bryce ? numberOf(bryce.liveRank) ?? numberOf(bryce.rank) : null,
      bryceLaps: bryce ? numberOf(bryce.laps) : null,
      cars: passFrameOf(atMs, frame.flag, frame.rows).cars
    });
  }
  return frames.sort((a, b) => a.atMs - b.atMs);
};

/** Every caution and red flag in the frames, in order. */
export const flagPeriodsOf = (frames: TimelineFrame[]): FlagPeriod[] => {
  const periods: FlagPeriod[] = [];
  let open: FlagPeriod | null = null;
  let sawGreen = false;
  for (const frame of frames) {
    if (!frame.flag) continue;
    if (isNeutralisedFlag(frame.flag)) {
      const red = /(^|[^A-Z])RED([^A-Z]|$)/.test(frame.flag);
      if (!open) {
        open = { kind: red ? 'red' : 'caution', fromMs: frame.atMs, toMs: null, fromLap: frame.lap, toLap: null, outAtStart: !sawGreen };
      } else if (red) {
        open.kind = 'red';
      }
      continue;
    }
    if (frame.flag === 'GREEN') {
      sawGreen = true;
      if (open) {
        open.toMs = frame.atMs;
        open.toLap = frame.lap;
        periods.push(open);
        open = null;
      }
      continue;
    }
    // Checkered, white, cold: a caution still open ends without a restart.
    if (open && (frame.flag.includes('CHECK') || frame.flag === 'COLD')) {
      periods.push(open);
      open = null;
    }
  }
  if (open) periods.push(open);
  return periods;
};

export const buildReplayTimeline = (frames: TimelineFrame[], complete: boolean): ReplayTimeline => ({
  frames,
  periods: flagPeriodsOf(frames),
  firstBryceMs: frames.find((frame) => frame.bryceRank !== null || frame.bryceLaps !== null)?.atMs ?? null,
  firstGreenMs: frames.find((frame) => frame.flag === 'GREEN')?.atMs ?? null,
  checkeredMs: frames.find((frame) => frame.flag.includes('CHECK'))?.atMs ?? null,
  complete,
  moves: bryceMovesOf(
    frames.filter((frame) => frame.cars).map((frame) => ({ atMs: frame.atMs, flag: frame.flag, cars: frame.cars! })),
    Number.POSITIVE_INFINITY
  )
});

/** The flag period the clock is inside, or null. */
export const periodAt = (timeline: ReplayTimeline | null, atMs: number): FlagPeriod | null =>
  timeline?.periods.find((period) => atMs >= period.fromMs && (period.toMs === null || atMs < period.toMs)) ?? null;

/**
 * The caution thrown in the opening laps, read from the timeline: the same
 * rule {@link findOpeningCaution} applies to its own reads (thrown while the
 * leader's counter reads below `openingLaps`, or already out when the feed
 * opens and seen inside its first minute), with exact times instead of ~2 s
 * narrowing. Null for a clean start or a caution with no restart in the capture.
 */
export const openingCautionFromTimeline = (
  timeline: ReplayTimeline,
  { greenMs, openingLaps = OPENING_CAUTION_LAPS }: { greenMs: number; openingLaps?: number }
): OpeningCaution | null => {
  const first = timeline.periods.find((period) => period.toMs !== null && period.toMs > greenMs);
  if (!first || first.toMs === null) return null;
  const outAtStart = first.outAtStart;
  const thrownLap = outAtStart ? null : first.fromLap;
  const opening = thrownLap !== null ? thrownLap < openingLaps : first.fromMs - greenMs <= 60_000;
  if (!opening) return null;
  return {
    thrownMs: Math.max(first.fromMs, greenMs),
    restartMs: first.toMs,
    thrownLap,
    restartLap: first.toLap,
    outAtStart,
    kind: first.kind,
    requests: 0
  };
};

/** The most reads one timeline may take (a race with more than ~1,200
 *  breakpoints keeps its newest 1,200: the bar then shades what it has). */
const MAX_TIMELINE_READS = 3;

/**
 * The whole race's breakpoints, read one request at a time: the clock at the
 * capture's last frame and no window. The server returns the newest 400; when
 * those stop short of the capture's first frame, the next read ends where the
 * last one began.
 */
export const loadReplayTimeline = async ({
  sessionKey,
  firstCheckedAt,
  lastCheckedAt,
  fetchJson
}: {
  sessionKey: string;
  firstCheckedAt: string;
  lastCheckedAt: string;
  fetchJson: (path: string) => Promise<unknown>;
}): Promise<ReplayTimeline | null> => {
  const firstMs = Date.parse(firstCheckedAt);
  let upper = lastCheckedAt;
  const byTime = new Map<number, TimelineFrame>();
  let complete = false;
  for (let read = 0; read < MAX_TIMELINE_READS; read += 1) {
    const response = (await fetchJson(
      `/api/history/rank-series?replay=${encodeURIComponent(sessionKey)}&rt=${encodeURIComponent(upper)}&speed=4`
    )) as RankSeriesResponse | null;
    if (!response || response.available === false) break;
    const frames = timelineFramesOf(response);
    if (frames.length === 0) break;
    for (const frame of frames) byTime.set(frame.atMs, frame);
    const oldest = frames[0].atMs;
    if (!Number.isFinite(firstMs) || oldest <= firstMs + 2_000 || frames.length < 400) {
      complete = true;
      break;
    }
    upper = new Date(oldest).toISOString();
  }
  if (byTime.size === 0) return null;
  return buildReplayTimeline([...byTime.values()].sort((a, b) => a.atMs - b.atMs), complete);
};
