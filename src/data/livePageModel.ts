import type { LiveReadinessPayload } from './analyticsContracts';
import type { UiCareerRival, UiStandingsSnapshot } from './uiDataPackage';
import {
  buildCumulativeLiveBattleFrame,
  numberOrNull,
  positiveGapSeconds,
  type LiveBattleFrame,
  type LiveBattleNeighbor
} from './liveMotionModel';

export {
  advanceBattleAxis,
  battleAxisExtentSeconds,
  battleAxisFitStep,
  BATTLE_AXIS_LADDER,
  buildFieldCompression,
  createBattleAxisState,
  FIELD_COMPRESSION_PACK_GAP_SECONDS,
  FIELD_COMPRESSION_TIGHT_GAP_SECONDS,
  isFreshCheckedAt,
  livePosition,
  positiveGapSeconds,
  rankChanges,
  resolveStableLabelLanes,
  sortRowsForLiveDisplay,
  stableDriverId,
  stableLabelLane,
  timestampWindowDomain
} from './liveMotionModel';
export type { BattleAxisState, FieldCompression, LiveBattleCar, LiveBattleFrame, LiveBattleNeighbor, RankChange } from './liveMotionModel';

export type LiveRow = Record<string, unknown>;

export const liveRowsOf = (payload: LiveReadinessPayload): LiveRow[] => {
  const rows = (payload.liveTiming as LiveRow)?.rows;
  return Array.isArray(rows) ? (rows as LiveRow[]) : [];
};

export const liveBryceRowOf = (payload: LiveReadinessPayload): LiveRow | null => {
  const bryce = (payload.bryce as LiveRow)?.bryce;
  return bryce && typeof bryce === 'object' ? (bryce as LiveRow) : null;
};

export const buildLiveBattleFrame = (payload: LiveReadinessPayload): LiveBattleFrame | null => {
  const rows = liveRowsOf(payload);
  const bryce = liveBryceRowOf(payload);
  return buildCumulativeLiveBattleFrame(rows, bryce);
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
