import type { LiveReadinessPayload } from './analyticsContracts';
import type { UiCareerRival, UiStandingsSnapshot } from './uiDataPackage';

export type LiveRow = Record<string, unknown>;

export interface LiveBattleCar {
  id: string;
  carNo: string;
  surname: string;
  rank: number;
  /** Signed seconds relative to Bryce: positive is ahead, negative behind. */
  offsetSeconds: number;
}

export interface LiveBattleNeighbor {
  id: string;
  carNo: string;
  surname: string;
  gapSeconds: number;
}

export interface LiveBattleFrame {
  cars: LiveBattleCar[];
  ahead: LiveBattleNeighbor | null;
  behind: LiveBattleNeighbor | null;
}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const liveRowsOf = (payload: LiveReadinessPayload): LiveRow[] => {
  const rows = (payload.liveTiming as LiveRow)?.rows;
  return Array.isArray(rows) ? (rows as LiveRow[]) : [];
};

export const liveBryceRowOf = (payload: LiveReadinessPayload): LiveRow | null => {
  const bryce = (payload.bryce as LiveRow)?.bryce;
  return bryce && typeof bryce === 'object' ? (bryce as LiveRow) : null;
};

export const positiveGapSeconds = (value: unknown): number | null => {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

const driverIdOf = (row: LiveRow) =>
  String(row.DriverID ?? row.driverId ?? row.no ?? row.name ?? '').trim();

const surnameOf = (row: LiveRow) => {
  const lastName = String(row.lastName ?? '').trim();
  if (lastName) return lastName;
  const name = String(row.name ?? '').trim();
  return name.split(/\s+/).at(-1) || `Car ${String(row.no ?? '—')}`;
};

/** Race Control's `diff` is the field's sourced gap-to-leader. Subtracting
 * it from Bryce's `diff` creates a Bryce-centered reference frame without
 * using lap-distance/GPS-like fields. The leader's blank `diff` is 0s. */
const gapToLeaderSeconds = (row: LiveRow): number | null => {
  const rank = numberOrNull(row.rank);
  if (rank === 1) return 0;
  return positiveGapSeconds(row.diff);
};

export const buildLiveBattleFrame = (payload: LiveReadinessPayload): LiveBattleFrame | null => {
  const rows = liveRowsOf(payload);
  const bryce = liveBryceRowOf(payload);
  const bryceRank = numberOrNull(bryce?.rank);
  const bryceGap = bryce ? gapToLeaderSeconds(bryce) : null;
  if (!bryce || bryceRank === null || bryceGap === null) return null;

  const cars = rows.flatMap((row) => {
    if (row.bryce === true) return [];
    const rank = numberOrNull(row.rank);
    const gap = gapToLeaderSeconds(row);
    if (rank === null || gap === null) return [];
    return [{
      id: driverIdOf(row),
      carNo: String(row.no ?? '').trim(),
      surname: surnameOf(row),
      rank,
      offsetSeconds: bryceGap - gap
    } satisfies LiveBattleCar];
  });

  const neighbor = (rank: number, side: 'ahead' | 'behind'): LiveBattleNeighbor | null => {
    const row = rows.find((candidate) => numberOrNull(candidate.rank) === rank);
    if (!row) return null;
    const interval = side === 'ahead'
      ? positiveGapSeconds(bryce.gap)
      : positiveGapSeconds(row.gap);
    const fallbackGap = gapToLeaderSeconds(row);
    const signedFallback = fallbackGap === null ? null : Math.abs(bryceGap - fallbackGap);
    const gapSeconds = interval ?? signedFallback;
    if (gapSeconds === null) return null;
    return {
      id: driverIdOf(row),
      carNo: String(row.no ?? '').trim(),
      surname: surnameOf(row),
      gapSeconds
    };
  };

  return {
    cars,
    ahead: bryceRank > 1 ? neighbor(bryceRank - 1, 'ahead') : null,
    behind: neighbor(bryceRank + 1, 'behind')
  };
};

export interface OfficialPointsStandingRow {
  carNo: string;
  driverName: string;
  isBryce: boolean;
  runningDriverPoints: number;
  totalDriverPoints: number | null;
  projectedStanding: number;
}

export interface OfficialPointsWindow {
  field: 'runningDriverPoints';
  bryce: OfficialPointsStandingRow;
  above: OfficialPointsStandingRow | null;
  below: OfficialPointsStandingRow | null;
  rows: OfficialPointsStandingRow[];
}

/** Race Control's runningDriverPoints already contains its provisional points
 * projection. This helper only orders those source fields; it never calculates
 * points or applies a local scoring model. */
export const buildOfficialPointsWindow = (rows: LiveRow[]): OfficialPointsWindow | null => {
  const projected = rows
    .map((row) => {
      const runningDriverPoints = numberOrNull(row.runningDriverPoints);
      if (runningDriverPoints === null) return null;
      const first = String(row.firstName ?? '').trim();
      const last = String(row.lastName ?? '').trim();
      const carNo = String(row.no ?? '').trim();
      return {
        carNo,
        driverName: `${first} ${last}`.trim() || String(row.name ?? '').trim() || `Car ${carNo || '—'}`,
        isBryce: row.bryce === true,
        runningDriverPoints,
        totalDriverPoints: numberOrNull(row.totalDriverPoints),
        projectedStanding: 0
      } satisfies OfficialPointsStandingRow;
    })
    .filter((row): row is OfficialPointsStandingRow => row !== null)
    .sort((left, right) => right.runningDriverPoints - left.runningDriverPoints || left.carNo.localeCompare(right.carNo))
    .map((row, index) => ({ ...row, projectedStanding: index + 1 }));
  const bryceIndex = projected.findIndex((row) => row.isBryce);
  if (bryceIndex < 0) return null;
  return {
    field: 'runningDriverPoints',
    bryce: projected[bryceIndex],
    above: projected[bryceIndex - 1] ?? null,
    below: projected[bryceIndex + 1] ?? null,
    rows: projected
  };
};

export const headToHeadForCar = (carNo: unknown, standings: UiStandingsSnapshot) => {
  if (!standings.available) return null;
  const entry = standings.entries.find((candidate) => candidate.carNo === String(carNo ?? '').trim());
  return entry?.headToHead ?? null;
};

const normalizedDriverName = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** Prefer the captured car-number join, then fall back to the validated career
 * package when this worktree intentionally has no local live database. */
export const headToHeadForLiveDriver = (
  carNo: unknown,
  driverName: unknown,
  standings: UiStandingsSnapshot,
  rivals: UiCareerRival[]
) => {
  const captured = headToHeadForCar(carNo, standings);
  if (captured) return captured;
  const requested = normalizedDriverName(driverName);
  if (!requested) return null;
  const rival = rivals.find((candidate) => {
    const full = normalizedDriverName(candidate.driverName);
    const last = full.split(/\s+/).at(-1) ?? '';
    return full === requested || last === requested;
  });
  return rival
    ? {
        racesTogether: rival.racesTogether,
        bryceAhead: rival.bryceAhead,
        bryceBehind: rival.bryceBehind
      }
    : null;
};

export const captureAgeSeconds = (payload: LiveReadinessPayload, now = Date.now()): number | null => {
  const checkedAt = Date.parse(payload.checkedAt);
  return Number.isFinite(checkedAt) ? Math.max(0, Math.round((now - checkedAt) / 1000)) : null;
};
