import type { LiveReadinessPayload } from './analyticsContracts.ts';
import {
  buildCumulativeLiveBattleFrame,
  driverSurname,
  livePosition,
  numberOrNull,
  positiveGapSeconds,
  sortRowsForLiveDisplay,
  stableDriverId,
  type LiveBattleFrame,
  type LiveMotionRow
} from './liveMotionModel.ts';

type Row = Record<string, unknown>;

export type LiveHistoryRole = 'bryce' | 'initially_ahead' | 'initially_behind';

export interface LiveHistoryDriver {
  id: string;
  carNo: string;
  name: string;
  role: LiveHistoryRole;
}

export interface LiveHistorySample {
  sessionKey: string;
  checkedAt: string;
  checkedAtMs: number;
  arrivalCheckedAt: string;
  lap: number | null;
  flag: string;
  rows: LiveMotionRow[];
  bryceId: string;
  signature: string;
}

export interface LiveHistoryStats {
  arrivals: number;
  valueChanges: number;
  unchangedValues: number;
  duplicateTimestamps: number;
  outOfOrderArrivals: number;
}

export interface LiveSessionHistory {
  sessionKey: string;
  samples: LiveHistorySample[];
  selectedDrivers: LiveHistoryDriver[];
  stats: LiveHistoryStats;
}

export interface LiveHistoryState {
  activeSessionKey: string | null;
  sessions: Record<string, LiveSessionHistory>;
}

export interface LiveHistoryPoint {
  checkedAt: string;
  checkedAtMs: number;
  value: number | null;
  rank: number | null;
}

export interface LiveHistorySeries extends LiveHistoryDriver {
  points: LiveHistoryPoint[];
}

export interface AxisDomain {
  startMs: number;
  endMs: number;
}

const emptyStats = (): LiveHistoryStats => ({
  arrivals: 0,
  valueChanges: 0,
  unchangedValues: 0,
  duplicateTimestamps: 0,
  outOfOrderArrivals: 0
});

export const createLiveHistoryState = (): LiveHistoryState => ({ activeSessionKey: null, sessions: {} });

const recordOf = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};

const stringOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

export const liveSessionKeyOf = (payload: LiveReadinessPayload | null): string | null => {
  if (!payload) return null;
  const timing = recordOf(payload.liveTiming);
  const heartbeat = recordOf(timing.heartbeat);
  const weekend = recordOf(payload.raceWeekend);
  const eventId = stringOrNull(heartbeat.eventId ?? weekend.eventId);
  const eventSessionId = stringOrNull(heartbeat.eventSessionId ?? weekend.eventSessionId);
  // The eventSessionId is globally unique in Race Control and alone identifies a
  // session. Live feeds carry both ids, but the RaceTools lake replays omit the
  // eventId — requiring both left every lake replay session-key-less, so history
  // never accumulated and the running order never crossed its two-sample gate.
  // Fall back to a replay's own canonical session key as a last resort.
  if (eventSessionId) return eventId ? `${eventId}-${eventSessionId}` : eventSessionId;
  const simulation = recordOf(recordOf(payload.replay).simulation);
  return simulation.active === true ? stringOrNull(simulation.sessionKey) : null;
};

/** Replay shifts payload.checkedAt to wall time for freshness. History must use
 * the archived record identity or the same record would be appended on every
 * poll and look like fabricated motion. */
export const liveSourceCheckedAtOf = (payload: LiveReadinessPayload): string => {
  const replay = recordOf(payload.replay);
  const simulation = recordOf(replay.simulation);
  const archiveCheckedAt = simulation.active === true ? stringOrNull(simulation.archiveCheckedAt) : null;
  return archiveCheckedAt && Number.isFinite(Date.parse(archiveCheckedAt)) ? archiveCheckedAt : payload.checkedAt;
};

const liveRowsOf = (payload: LiveReadinessPayload): LiveMotionRow[] => {
  const timing = recordOf(payload.liveTiming);
  return Array.isArray(timing.rows) ? (timing.rows as LiveMotionRow[]) : [];
};

const canonicalRows = (payload: LiveReadinessPayload): LiveMotionRow[] => {
  const byId = new Map<string, LiveMotionRow>();
  for (const row of liveRowsOf(payload)) {
    const id = stableDriverId(row);
    if (id) byId.set(id, row);
  }
  return sortRowsForLiveDisplay([...byId.values()]);
};

export const liveSampleSignature = (sample: Pick<LiveHistorySample, 'lap' | 'flag' | 'rows'>): string =>
  JSON.stringify([
    sample.lap,
    sample.flag,
    ...sample.rows.map((row) => [
      stableDriverId(row),
      livePosition(row),
      numberOrNull(row.rank),
      row.diff ?? '',
      row.liveGap ?? '',
      row.status ?? '',
      row.comment ?? '',
      row.laps ?? ''
    ])
  ]);

export const liveHistorySampleFromPayload = (payload: LiveReadinessPayload): LiveHistorySample | null => {
  if (!['ready', 'degraded'].includes(payload.state)) return null;
  const sessionKey = liveSessionKeyOf(payload);
  const checkedAt = liveSourceCheckedAtOf(payload);
  const checkedAtMs = Date.parse(checkedAt);
  const rows = canonicalRows(payload);
  const bryce = rows.find((row) => row.bryce === true);
  const bryceId = bryce ? stableDriverId(bryce) : '';
  if (!sessionKey || !Number.isFinite(checkedAtMs) || rows.length === 0 || !bryceId) return null;
  const heartbeat = recordOf(recordOf(payload.liveTiming).heartbeat);
  const sample = {
    sessionKey,
    checkedAt,
    checkedAtMs,
    arrivalCheckedAt: payload.checkedAt,
    lap: numberOrNull(heartbeat.lapNumber ?? heartbeat.lap),
    flag: String(heartbeat.currentFlag ?? heartbeat.flag ?? ''),
    rows,
    bryceId,
    signature: ''
  } satisfies LiveHistorySample;
  sample.signature = liveSampleSignature(sample);
  return sample;
};

const selectedDriversFrom = (sample: LiveHistorySample): LiveHistoryDriver[] => {
  const bryceIndex = sample.rows.findIndex((row) => stableDriverId(row) === sample.bryceId);
  if (bryceIndex < 0) return [];
  const identity = (row: LiveMotionRow, role: LiveHistoryRole): LiveHistoryDriver => ({
    id: stableDriverId(row),
    carNo: String(row.no ?? '').trim(),
    name: driverSurname(row),
    role
  });
  return [
    identity(sample.rows[bryceIndex], 'bryce'),
    ...(bryceIndex > 0 ? [identity(sample.rows[bryceIndex - 1], 'initially_ahead')] : []),
    ...(bryceIndex + 1 < sample.rows.length ? [identity(sample.rows[bryceIndex + 1], 'initially_behind')] : [])
  ];
};

/** One bounded reducer owns both live charts. Samples are session-isolated,
 * timestamp-unique, and chronologically sorted even if an API response arrives
 * late. The selected comparison identities are captured once per session. */
export const appendLiveHistoryPayload = (
  state: LiveHistoryState,
  payload: LiveReadinessPayload,
  maxSamples = 300,
  maxSessions = 4
): LiveHistoryState => {
  const sample = liveHistorySampleFromPayload(payload);
  if (!sample) return state;
  const previousSession = state.sessions[sample.sessionKey];
  const previousSamples = previousSession?.samples ?? [];
  const latest = previousSamples.at(-1) ?? null;
  const duplicateIndex = previousSamples.findIndex((candidate) => candidate.checkedAt === sample.checkedAt);
  const duplicate = duplicateIndex >= 0;
  const outOfOrder = Boolean(latest && sample.checkedAtMs < latest.checkedAtMs);
  const changed = Boolean(latest && latest.signature !== sample.signature);
  const samples = previousSamples.slice();
  if (duplicate) {
    if (samples[duplicateIndex].signature !== sample.signature) samples[duplicateIndex] = sample;
  } else {
    samples.push(sample);
  }
  samples.sort((left, right) => left.checkedAtMs - right.checkedAtMs);
  const boundedSamples = samples.slice(-Math.max(2, maxSamples));
  const stats = previousSession?.stats ?? emptyStats();
  const nextSession: LiveSessionHistory = {
    sessionKey: sample.sessionKey,
    samples: boundedSamples,
    selectedDrivers:
      previousSession?.selectedDrivers.length ? previousSession.selectedDrivers : selectedDriversFrom(sample),
    stats: {
      arrivals: stats.arrivals + 1,
      valueChanges: stats.valueChanges + (latest && changed ? 1 : 0),
      unchangedValues: stats.unchangedValues + (latest && !changed ? 1 : 0),
      duplicateTimestamps: stats.duplicateTimestamps + (duplicate ? 1 : 0),
      outOfOrderArrivals: stats.outOfOrderArrivals + (outOfOrder ? 1 : 0)
    }
  };
  const sessions = { ...state.sessions, [sample.sessionKey]: nextSession };
  const sessionKeys = Object.keys(sessions);
  if (sessionKeys.length > maxSessions) {
    sessionKeys
      .filter((key) => key !== sample.sessionKey)
      .sort((left, right) => (sessions[left].samples.at(-1)?.checkedAtMs ?? 0) - (sessions[right].samples.at(-1)?.checkedAtMs ?? 0))
      .slice(0, sessionKeys.length - maxSessions)
      .forEach((key) => delete sessions[key]);
  }
  return { activeSessionKey: sample.sessionKey, sessions };
};

export const activeLiveSessionHistory = (state: LiveHistoryState): LiveSessionHistory | null =>
  state.activeSessionKey ? state.sessions[state.activeSessionKey] ?? null : null;

/** Select through the current payload identity, not the reducer's prior active
 * key. React effects append after render; this gate prevents one mixed-session
 * frame while an event change is being committed. */
export const liveSessionHistoryForPayload = (
  state: LiveHistoryState,
  payload: LiveReadinessPayload | null
): LiveSessionHistory | null => {
  const sessionKey = liveSessionKeyOf(payload);
  return sessionKey ? state.sessions[sessionKey] ?? null : null;
};

export const buildBattleFrameForSample = (sample: LiveHistorySample): LiveBattleFrame | null =>
  buildCumulativeLiveBattleFrame(sample.rows, sample.rows.find((row) => stableDriverId(row) === sample.bryceId) ?? null);

const isRunningRow = (row: LiveMotionRow): boolean => {
  const status = String(row.status ?? '').trim().toLowerCase();
  return !status || ['active', 'running', 'run'].includes(status);
};

/** Race Control uses a numeric zero while some non-leader gap-to-leader rows
 * are not populated. That contradicts the same row's rank and must render as
 * missing. A zero for the actual leader remains a valid sourced coordinate. */
export const sourcedGapToLeaderSeconds = (row: LiveMotionRow): number | null => {
  const value = positiveGapSeconds(row.diff);
  const rank = livePosition(row);
  if (value === null || rank === null) return null;
  return value === 0 && rank !== 1 ? null : value;
};

export const sharedLeaderGapSeries = (history: LiveSessionHistory | null): LiveHistorySeries[] => {
  if (!history) return [];
  return history.selectedDrivers.map((driver) => ({
    ...driver,
    points: history.samples.map((sample) => {
      const cumulativeByDriver = new Map<string, number | null>();
      let cumulative = 0;
      let chainAvailable = true;
      sample.rows.forEach((row, index) => {
        const id = stableDriverId(row);
        if (!id) return;
        if (index === 0) {
          cumulativeByDriver.set(id, 0);
          return;
        }
        const interval = isRunningRow(row) ? positiveGapSeconds(row.liveGap) : null;
        if (interval === null) chainAvailable = false;
        if (chainAvailable) cumulative += interval!;
        cumulativeByDriver.set(id, chainAvailable ? cumulative : null);
      });
      const row = sample.rows.find((candidate) => stableDriverId(candidate) === driver.id);
      return {
        checkedAt: sample.checkedAt,
        checkedAtMs: sample.checkedAtMs,
        value: row ? cumulativeByDriver.get(driver.id) ?? null : null,
        rank: row ? livePosition(row) : null
      };
    })
  }));
};

export const contiguousValueSegments = <T extends { value: number | null }>(points: T[]): T[][] => {
  const segments: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
};

const niceStep = (raw: number): number => {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
};

export const dataDrivenGapDomain = (values: Array<number | null>): [number, number] | null => {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  if (finite.length === 0) return null;
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  const span = maximum - minimum;
  const padding = span === 0 ? Math.max(0.5, maximum * 0.05) : Math.max(0.25, span * 0.12);
  const lower = Math.max(0, minimum - padding);
  const upper = Math.max(lower + 0.5, maximum + padding);
  return [Math.floor(lower * 10) / 10, Math.ceil(upper * 10) / 10];
};

export const adaptiveNumericTicks = (domain: [number, number], pixelSpan: number, minimumSpacing = 42): number[] => {
  const targetIntervals = Math.max(2, Math.min(6, Math.floor(Math.max(pixelSpan, minimumSpacing * 2) / minimumSpacing)));
  const step = niceStep((domain[1] - domain[0]) / targetIntervals);
  const first = Math.ceil(domain[0] / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= domain[1] + step * 0.001; value += step) ticks.push(Number(value.toFixed(6)));
  if (ticks.length < 2) return [domain[0], domain[1]];
  return ticks;
};

const timeBucketsMs = [60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 2_700_000, 3_600_000, 5_400_000, 7_200_000];

/** Session charts grow through explicit duration buckets instead of rescaling
 * every second or wasting an unconditional hour of horizontal space. */
export const stableSessionTimeDomain = (timestamps: string[]): AxisDomain | null => {
  const parsed = timestamps.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (parsed.length === 0) return null;
  const startMs = Math.min(...parsed);
  const latestMs = Math.max(...parsed);
  const elapsed = Math.max(1, latestMs - startMs);
  const span = timeBucketsMs.find((candidate) => candidate >= elapsed) ?? Math.ceil(elapsed / 3_600_000) * 3_600_000;
  return { startMs, endMs: startMs + span };
};

export const adaptiveTimeTicks = (domain: AxisDomain, pixelSpan: number, minimumSpacing = 82): number[] => {
  const count = Math.max(2, Math.min(8, Math.floor(Math.max(pixelSpan, minimumSpacing) / minimumSpacing) + 1));
  return Array.from({ length: count }, (_, index) =>
    domain.startMs + ((domain.endMs - domain.startMs) * index) / (count - 1)
  );
};

export interface BattleConnectorGeometry {
  y1: number;
  y2: number;
}

export const battleConnectorGeometry = (
  labelY: number,
  axisY: number,
  labelHeight = 10,
  dotRadius = 6.5,
  clearance = 3
): BattleConnectorGeometry =>
  labelY < axisY
    ? { y1: labelY + labelHeight / 2 + clearance, y2: axisY - dotRadius - clearance }
    : { y1: labelY - labelHeight / 2 - clearance, y2: axisY + dotRadius + clearance };

export const shouldAnimateSampleTransition = (
  previous: LiveHistorySample | null,
  current: LiveHistorySample | null,
  reducedMotion: boolean
): boolean =>
  Boolean(
    !reducedMotion &&
      previous &&
      current &&
      previous.sessionKey === current.sessionKey &&
      current.checkedAtMs > previous.checkedAtMs &&
      current.signature !== previous.signature
  );
