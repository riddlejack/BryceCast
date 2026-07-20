import type { LiveReadinessPayload } from './analyticsContracts.ts';
import { liveSourceCheckedAtOf, type LiveSessionHistory } from './liveHistoryModel.ts';
import { livePosition, numberOrNull, stableDriverId, type LiveMotionRow } from './liveMotionModel.ts';

/** The live race page shell (Brief R-c). One URL — /races/<sessionId> — from
 * green flag to family archive: during a live (or per-client replayed) race the
 * page exists as a shell whose modules appear as their data becomes honest, and
 * at roll-forward it becomes the ordinary debrief page with zero URL change.
 * This module is the shell's pure decision-and-synthesis layer: node-testable,
 * no React, no vite-only imports (which is why the canonical-id regex is
 * restated here instead of imported from replayAvailable.ts — that file pulls
 * the vite-glob package chain).
 */

type Row = Record<string, unknown>;

const recordOf = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};

/** Empty/whitespace is ABSENT, never present (the '' RaceTools lesson). */
const stringOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

/** Canonical race sessionIds are `session_indy_nxt_<year>_<eventSessionId>`
 * (same rule as replayAvailable.eventSessionIdFromCanonical). */
export const trailingNumericId = (value: string | null | undefined): string | null =>
  String(value ?? '').match(/_(\d+)$/)?.[1] ?? null;

export const isCautionFlagValue = (flag: string | null | undefined): boolean => {
  const value = (flag ?? '').toUpperCase();
  return value.includes('YELLOW') || value.includes('CAUTION') || value === 'FCY';
};

/* ---------- the live session, read once ---------- */

export interface LiveRaceSessionRef {
  eventId: string | null;
  eventSessionId: string | null;
  seasonYear: number | null;
  isRace: boolean;
  eventName: string | null;
  trackName: string | null;
  sessionName: string | null;
  lap: number | null;
  totalLaps: number | null;
  flag: string | null;
  simulated: boolean;
}

const heartbeatOf = (payload: LiveReadinessPayload): Row => recordOf(recordOf(payload.liveTiming).heartbeat);

export const liveRaceSessionRefOf = (payload: LiveReadinessPayload | null): LiveRaceSessionRef | null => {
  if (!payload) return null;
  const heartbeat = heartbeatOf(payload);
  const weekend = recordOf(payload.raceWeekend);
  const eventSessionId = stringOrNull(heartbeat.eventSessionId ?? weekend.eventSessionId);
  if (!eventSessionId) return null;
  const sessionType = stringOrNull(heartbeat.sessionType ?? weekend.sessionType);
  const sessionName = stringOrNull(heartbeat.sessionName ?? weekend.sessionName);
  // Races only: the shell never claims a practice or qualifying session (the
  // Live page's session-aware mode covers those; they get no session page).
  // Race Control abbreviates the live sessionType to 'R'; fixtures and the
  // sessionName spell it out — accept either form, and only that.
  const isRaceType = (value: string | null): boolean => value !== null && (/^race/i.test(value) || value.toUpperCase() === 'R');
  const isRace = isRaceType(sessionType) || isRaceType(sessionName);
  // The season is the year the race ran: the archived record time for a replay
  // (never the wall clock), the capture time live.
  const sourceCheckedAt = liveSourceCheckedAtOf(payload);
  const sourceMs = Date.parse(sourceCheckedAt);
  const seasonYear = Number.isFinite(sourceMs) ? new Date(sourceMs).getUTCFullYear() : null;
  return {
    eventId: stringOrNull(heartbeat.eventId ?? weekend.eventId),
    eventSessionId,
    seasonYear,
    isRace,
    eventName: stringOrNull(weekend.eventName ?? heartbeat.eventName),
    trackName: stringOrNull(heartbeat.trackName ?? weekend.trackName),
    sessionName,
    lap: numberOrNull(heartbeat.lap ?? heartbeat.lapNumber ?? weekend.lap),
    totalLaps: numberOrNull(heartbeat.totalLaps ?? weekend.totalLaps),
    flag: stringOrNull(heartbeat.currentFlag ?? heartbeat.flag ?? weekend.flag),
    simulated: recordOf(recordOf(payload.replay).simulation).active === true
  };
};

export const canonicalLiveRaceSessionId = (payload: LiveReadinessPayload | null): string | null => {
  const ref = liveRaceSessionRefOf(payload);
  if (!ref || !ref.isRace || !ref.eventSessionId || ref.seasonYear === null) return null;
  return `session_indy_nxt_${ref.seasonYear}_${ref.eventSessionId}`;
};

/** True once the session has run its distance and gone cold: the flag is no
 * longer green or caution and the lap counter has reached the total. Same rule
 * the Live page applies post-checkered; presentation-layer only. */
export const isPostCheckeredRef = (ref: LiveRaceSessionRef | null): boolean =>
  Boolean(
    ref &&
      ref.lap !== null &&
      ref.totalLaps !== null &&
      ref.totalLaps > 0 &&
      ref.lap >= ref.totalLaps &&
      !isCautionFlagValue(ref.flag) &&
      (ref.flag ?? '').toUpperCase() !== 'GREEN'
  );

/* ---------- shell vs debrief: the routing decision ---------- */

/** States in which the shell may hold the page. `pre_session` because the shell
 * appears pre-green; `stale` because a paused feed holds its last honest state
 * (never blank). `wrong_series` never matches — its heartbeat names another
 * series' session, so the eventSessionId comparison below fails first. */
const SHELL_STATES = new Set(['pre_session', 'ready', 'degraded', 'stale']);

/** Does the live feed currently claim this canonical race page? True only when
 * the payload is live-ish, names a RACE session, and that session's
 * eventSessionId is the requested page's trailing id. */
export const payloadClaimsRacePage = (
  payload: LiveReadinessPayload | null,
  requestedSessionId: string
): boolean => {
  if (!payload || !SHELL_STATES.has(payload.state)) return false;
  const ref = liveRaceSessionRefOf(payload);
  if (!ref || !ref.isRace || !ref.eventSessionId) return false;
  const requested = trailingNumericId(requestedSessionId);
  return requested !== null && requested === ref.eventSessionId;
};

export type DebriefPresence = 'loading' | 'present' | 'absent';
export type RaceSurface = 'detail' | 'shell' | 'pending';

/**
 * The one routing decision, in order of precedence:
 * 1. A per-client replay engaged for THIS race renders the shell — a replayed
 *    race gets a replayed race page, even when its debrief already exists
 *    (that is the time machine, and the QA path).
 * 2. No live/replay claim on this page → the ordinary RaceDetailScreen,
 *    untouched (completed races are byte-identical to today — the hard gate).
 * 3. A live claim with a debrief pack present → the debrief (roll-forward has
 *    happened; same URL, no ceremony).
 * 4. A live claim while the debrief check is in flight → hold the skeleton.
 * 5. A live claim with no debrief yet → the shell.
 */
export const raceSurfaceFor = ({
  requestedSessionId,
  debrief,
  payload,
  replayCanonicalSessionId
}: {
  requestedSessionId: string;
  debrief: DebriefPresence;
  payload: LiveReadinessPayload | null;
  /** Canonical sessionId of an ENGAGED per-client replay, or null. */
  replayCanonicalSessionId: string | null;
}): RaceSurface => {
  const requested = requestedSessionId.trim();
  if (!requested) return 'detail';
  if (replayCanonicalSessionId !== null && replayCanonicalSessionId === requested) return 'shell';
  if (!payloadClaimsRacePage(payload, requested)) return 'detail';
  if (debrief === 'present') return 'detail';
  if (debrief === 'loading') return 'pending';
  return 'shell';
};

/* ---------- the lap chart, building (module 2) ---------- */

/** Structural twin of RaceStoryLapDriver — the fields the debrief LapChart
 * reads. Kept structural so this file stays free of the pack loader chain. */
export interface BuildingLapDriver {
  driverId: string;
  driverName: string;
  carNumber: string | null;
  isBryce: boolean;
  isTeammate: boolean;
  finishPosition: number | null;
  status: string | null;
  laps: Array<[number, number]>;
}

export interface BuildingCautionSpan {
  fromLap: number;
  toLap: number;
  /** The span reaches the newest charted lap and the flag is still out. */
  ongoing: boolean;
}

export interface BuildingLapChart {
  lapChart: {
    totalLaps: number;
    fieldSize: number;
    sourceState: string;
    drivers: BuildingLapDriver[];
  };
  inflections: never[];
  cautionSpans: BuildingCautionSpan[];
  /** Newest charted lap — the chart's right edge (the startup-window law:
   * no reserved empty span; the newest point touches now). */
  latestLap: number;
  lapsCharted: number;
}

const driverNameOf = (row: LiveMotionRow): string => {
  const first = String(row.firstName ?? '').trim();
  const last = String(row.lastName ?? '').trim();
  const joined = `${first} ${last}`.trim();
  if (joined) return joined;
  const name = String(row.name ?? '').trim();
  if (name) return name;
  const carNo = String(row.no ?? '').trim();
  return carNo ? `Car ${carNo}` : 'Unknown';
};

/**
 * Fold the session's accumulated running-order window into the debrief lap
 * chart's exact shape, one point per completed lap per driver: for each lap the
 * LAST sample observed on that lap is the lap's running order (samples arrive
 * chronologically sorted from the history reducer). A driver who leaves the
 * feed simply stops — the chart's existing early-end mark tells that story.
 * Facts only: no finish positions, no inflection verdicts, no team labels
 * (the live feed carries no sourced team membership).
 */
export const buildingLapChartFrom = (history: LiveSessionHistory | null): BuildingLapChart | null => {
  if (!history || history.samples.length === 0) return null;
  const lapSamples = new Map<number, { rows: LiveMotionRow[]; bryceId: string }>();
  const cautionLaps = new Set<number>();
  for (const sample of history.samples) {
    const lap = sample.lap;
    if (lap === null || !Number.isFinite(lap) || lap < 1) continue;
    lapSamples.set(lap, { rows: sample.rows, bryceId: sample.bryceId });
    if (isCautionFlagValue(sample.flag)) cautionLaps.add(lap);
  }
  if (lapSamples.size === 0) return null;
  const laps = [...lapSamples.keys()].sort((left, right) => left - right);
  const latestLap = laps[laps.length - 1];
  const latestBryceId = lapSamples.get(latestLap)?.bryceId ?? '';

  const drivers = new Map<string, BuildingLapDriver>();
  let fieldSize = 0;
  for (const lap of laps) {
    const { rows } = lapSamples.get(lap)!;
    for (const row of rows) {
      const id = stableDriverId(row);
      const position = livePosition(row);
      if (!id || position === null) continue;
      fieldSize = Math.max(fieldSize, position);
      let driver = drivers.get(id);
      if (!driver) {
        driver = {
          driverId: id,
          driverName: driverNameOf(row),
          carNumber: stringOrNull(row.no),
          isBryce: false,
          isTeammate: false,
          finishPosition: null,
          status: null,
          laps: []
        };
        drivers.set(id, driver);
      }
      driver.laps.push([lap, position]);
    }
  }
  const bryce = latestBryceId ? drivers.get(latestBryceId) : undefined;
  if (bryce) bryce.isBryce = true;

  const cautionSpans: BuildingCautionSpan[] = [];
  for (const lap of laps) {
    if (!cautionLaps.has(lap)) continue;
    const last = cautionSpans[cautionSpans.length - 1];
    if (last && lap - last.toLap <= 1) last.toLap = lap;
    else cautionSpans.push({ fromLap: lap, toLap: lap, ongoing: false });
  }
  const lastSpan = cautionSpans[cautionSpans.length - 1];
  if (lastSpan && lastSpan.toLap >= latestLap) lastSpan.ongoing = true;

  return {
    lapChart: {
      totalLaps: latestLap,
      fieldSize: Math.max(fieldSize, 2),
      sourceState: 'live_building',
      drivers: [...drivers.values()]
    },
    inflections: [],
    cautionSpans,
    latestLap,
    lapsCharted: laps.length
  };
};

/* ---------- battles so far (module 3) ---------- */

export interface LiveBattleSoFar {
  driverId: string;
  driverName: string;
  carNumber: string | null;
  lapsAdjacent: number;
  swaps: number;
}

/** How many charted laps must exist before the module appears (the spec's
 * "once ≥10 laps exist"). */
export const BATTLES_MIN_LAPS = 10;

/**
 * The debrief's adjacency read, run over the accumulated laps: for each rival,
 * the laps spent within one running-order spot of Bryce, and how many times the
 * pair traded places between shared laps. Facts only — no projection, no
 * verdicts. Empty until {@link BATTLES_MIN_LAPS} laps are charted.
 */
export const battlesSoFarFrom = (chart: BuildingLapChart | null, minLaps = BATTLES_MIN_LAPS): LiveBattleSoFar[] => {
  if (!chart || chart.lapsCharted < minLaps) return [];
  const bryce = chart.lapChart.drivers.find((driver) => driver.isBryce);
  if (!bryce) return [];
  const brycePositionAt = new Map(bryce.laps);
  const battles: LiveBattleSoFar[] = [];
  for (const driver of chart.lapChart.drivers) {
    if (driver.isBryce) continue;
    let lapsAdjacent = 0;
    let swaps = 0;
    let previousSign = 0;
    for (const [lap, position] of driver.laps) {
      const brycePosition = brycePositionAt.get(lap);
      if (brycePosition === undefined) continue;
      const delta = position - brycePosition;
      if (Math.abs(delta) === 1) lapsAdjacent += 1;
      const sign = Math.sign(delta);
      if (sign !== 0 && previousSign !== 0 && sign !== previousSign) swaps += 1;
      if (sign !== 0) previousSign = sign;
    }
    if (lapsAdjacent >= 3) {
      battles.push({
        driverId: driver.driverId,
        driverName: driver.driverName,
        carNumber: driver.carNumber,
        lapsAdjacent,
        swaps
      });
    }
  }
  return battles.sort((left, right) => right.lapsAdjacent - left.lapsAdjacent || left.driverName.localeCompare(right.driverName)).slice(0, 3);
};

/* ---------- replay continuity across pages ---------- */

/**
 * Turn a live poll's replay params (`?replay=<key>&rt=<iso>&speed=<n>`) into a
 * NAVIGABLE deep link (`?replay=<key>&t0=<iso>&speed=<n>`): `rt` is a per-poll
 * clock reading the router never consumes, while `t0` seeds a fresh clock at
 * that same archived moment — so following a cross-link mid-replay resumes the
 * race where you were instead of restarting at green.
 */
export const replayDeepLinkQuery = (replayParams: string): string => {
  if (!replayParams) return '';
  const params = new URLSearchParams(replayParams.startsWith('?') ? replayParams.slice(1) : replayParams);
  const key = params.get('replay');
  if (!key) return '';
  const out = new URLSearchParams({ replay: key });
  const rt = params.get('rt');
  if (rt) out.set('t0', rt);
  const speed = params.get('speed');
  if (speed) out.set('speed', speed);
  return `?${out.toString()}`;
};

/* ---------- the archive LIVE dot ---------- */

export interface LiveArchiveUpgrade {
  /** The shell URL the upgraded row links to. */
  sessionId: string;
}

/**
 * Does the live feed upgrade this Races-archive placeholder row in place?
 * Placeholder rounds carry package eventIds (`event_indy_nxt_2026_5547`); the
 * live heartbeat carries the raw Race Control eventId (`5547`) — they join on
 * the trailing numeric id. Only a RACE session with a resolvable canonical id
 * upgrades a row, the moment the shell exists (pre-green included).
 */
export const liveArchiveUpgradeFor = (
  roundEventId: string,
  payload: LiveReadinessPayload | null
): LiveArchiveUpgrade | null => {
  if (!payload || !SHELL_STATES.has(payload.state)) return null;
  const ref = liveRaceSessionRefOf(payload);
  if (!ref || !ref.isRace || !ref.eventId) return null;
  const roundId = trailingNumericId(roundEventId);
  if (roundId === null || roundId !== ref.eventId) return null;
  const sessionId = canonicalLiveRaceSessionId(payload);
  return sessionId ? { sessionId } : null;
};
