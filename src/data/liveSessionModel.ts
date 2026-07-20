import type { LiveReadinessPayload } from './analyticsContracts.ts';
import { driverSurname, stableDriverId, type LiveMotionRow } from './liveMotionModel.ts';
import type { LiveRow } from './livePageModel.ts';

/** The three live-session shapes BryceCast renders. Race is the default: the
 *  live page has always been race-shaped, so any session whose type the payload
 *  does not clearly mark as practice or qualifying renders EXACTLY as a race.
 *  Practice and qualifying are the only two that reshape the page. */
export type LiveSessionKind = 'race' | 'practice' | 'qualifying';

const heartbeatOf = (payload: LiveReadinessPayload): Record<string, unknown> =>
  ((payload.liveTiming as Record<string, unknown>)?.heartbeat as Record<string, unknown>) ?? {};

const raceWeekendOf = (payload: LiveReadinessPayload): Record<string, unknown> =>
  (payload.raceWeekend as Record<string, unknown>) ?? {};

/** Resolve the session kind from the SOURCED payload only — never the time of
 *  day. Race Control's `SessionType` ("R" / "P" / "Q" / "W") surfaces on the
 *  compact heartbeat as `sessionType`; it is authoritative. Only when it is
 *  absent do we consult the session name. Anything not clearly practice or
 *  qualifying stays race, so an unknown or missing type can never strip a real
 *  race of its race modules. */
export const resolveLiveSessionKind = (payload: LiveReadinessPayload | null): LiveSessionKind => {
  if (!payload) return 'race';
  const heartbeat = heartbeatOf(payload);
  const weekend = raceWeekendOf(payload);
  const type = String(heartbeat.sessionType ?? weekend.sessionType ?? '').trim().toUpperCase();
  if (type) {
    // Warm-up runs to a practice grammar (best-lap order, no championship math).
    if (type === 'P' || type === 'W' || type.startsWith('PRAC') || type.startsWith('WARM')) return 'practice';
    if (type === 'Q' || type.startsWith('QUAL')) return 'qualifying';
    return 'race';
  }
  const name = String(heartbeat.sessionName ?? weekend.sessionName ?? '').trim().toLowerCase();
  if (!name) return 'race';
  if (name.includes('qualif')) return 'qualifying';
  if (name.includes('practice') || name.includes('warm') || name.includes('warmup') || name.includes('warm-up')) return 'practice';
  return 'race';
};

export const isRaceSession = (kind: LiveSessionKind): boolean => kind === 'race';

/** Human label for the rank the hero shows. In practice and qualifying the rank
 *  is timing order by best lap, never a running position. */
export const sessionRankCaption = (kind: LiveSessionKind): string =>
  kind === 'race' ? 'running position' : 'best-lap order';

/** Parse a Race Control lap-time string ("1:05.139", "58.421", "1:02:03.4")
 *  into seconds. Empty / non-numeric / non-positive → null (never zero-filled).
 *  Best-lap deltas are computed only from values that parse cleanly. */
export const parseLapTimeSeconds = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    const component = Number(part);
    if (!Number.isFinite(component) || component < 0) return null;
    seconds = seconds * 60 + component;
  }
  return seconds > 0 ? seconds : null;
};

export interface BestLapEntry {
  id: string;
  carNo: string;
  driverName: string;
  surname: string;
  team: string;
  isBryce: boolean;
  /** The sourced string exactly as published, for display. */
  bestLapTime: string;
  bestLapSeconds: number;
}

export interface TeammateBestLap {
  entry: BestLapEntry;
  /** Signed, Bryce-first: positive means Bryce's best lap is that many seconds
   *  ahead of this teammate's; negative means behind. */
  bryceAheadSeconds: number;
}

export interface BestLapDeltas {
  /** The fastest best lap in the field — the lap to beat. */
  leader: BestLapEntry;
  bryce: BestLapEntry | null;
  bryceIsFastest: boolean;
  /** Bryce's best lap minus the leader's, in seconds (>= 0). Null when Bryce is
   *  the leader or has no sourced best lap. */
  offSessionBestSeconds: number | null;
  teammates: TeammateBestLap[];
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const normalizedTeam = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const driverNameOf = (row: LiveMotionRow): string => {
  const first = String(row.firstName ?? '').trim();
  const last = String(row.lastName ?? '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const name = String(row.name ?? '').trim();
  if (name) return name;
  const carNo = String(row.no ?? '').trim();
  return carNo ? `Car ${carNo}` : '—';
};

const toBestLapEntry = (row: LiveMotionRow): BestLapEntry | null => {
  const bestLapSeconds = parseLapTimeSeconds(row.bestLapTime);
  if (bestLapSeconds === null) return null;
  const id = stableDriverId(row);
  if (!id) return null;
  return {
    id,
    carNo: String(row.no ?? '').trim(),
    driverName: driverNameOf(row),
    surname: driverSurname(row),
    team: String(row.team ?? '').trim(),
    isBryce: row.bryce === true,
    bestLapTime: String(row.bestLapTime ?? '').trim(),
    bestLapSeconds
  };
};

/** Best-lap comparison model for practice and qualifying: the session best, and
 *  Bryce measured against it and against his same-team cars. Reads each car's
 *  sourced `bestLapTime`; cars without a parseable best lap simply do not vote,
 *  and no gap is ever invented. This is a best-lap gap, never an on-track
 *  interval — practice cars run different cycles, so the timing order is not a
 *  race order and this model never implies one. */
export const buildBestLapDeltas = (rows: LiveRow[]): BestLapDeltas | null => {
  const entries = (rows ?? [])
    .map((row) => toBestLapEntry(row as LiveMotionRow))
    .filter((entry): entry is BestLapEntry => entry !== null);
  if (entries.length === 0) return null;

  const ranked = entries.slice().sort((left, right) => left.bestLapSeconds - right.bestLapSeconds);
  const leader = ranked[0];
  const bryce = entries.find((entry) => entry.isBryce) ?? null;
  const bryceIsFastest = bryce !== null && bryce.id === leader.id;
  const offSessionBestSeconds = bryce && !bryceIsFastest ? round3(bryce.bestLapSeconds - leader.bestLapSeconds) : null;

  const bryceTeam = normalizedTeam(bryce?.team);
  const teammates: TeammateBestLap[] = bryce && bryceTeam
    ? entries
        .filter((entry) => !entry.isBryce && normalizedTeam(entry.team) === bryceTeam)
        .sort((left, right) => left.bestLapSeconds - right.bestLapSeconds)
        .map((entry) => ({ entry, bryceAheadSeconds: round3(entry.bestLapSeconds - bryce.bestLapSeconds) }))
    : [];

  return { leader, bryce, bryceIsFastest, offSessionBestSeconds, teammates };
};

/** Bryce-first spatial words for a best-lap delta (editorial law: never a bare
 *  signed number where "ahead / behind" reads). `aheadSeconds` positive → Bryce
 *  is faster. */
export const bestLapDeltaWords = (aheadSeconds: number): string => {
  const magnitude = Math.abs(aheadSeconds);
  if (magnitude < 0.005) return 'level';
  const rounded = magnitude.toFixed(magnitude < 10 ? 2 : 1);
  return `${rounded}s ${aheadSeconds > 0 ? 'ahead' : 'behind'}`;
};
