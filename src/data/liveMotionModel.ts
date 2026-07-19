export type LiveMotionRow = Record<string, unknown>;

export interface LiveBattleCar {
  id: string;
  carNo: string;
  surname: string;
  rank: number;
  /** Signed sourced interval relative to Bryce: positive is ahead, negative behind. */
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
  sourceField: 'liveGap';
}

export interface RankChange {
  id: string;
  from: number;
  to: number;
}

export const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const positiveGapSeconds = (value: unknown): number | null => {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

/** Stable for a session even while rank changes. The compact API exposes the
 * Race Control DriverID as driverId; car number is the guarded fallback. The
 * RaceTools lake feeds carry an EMPTY driverId for every rival (only Bryce's is
 * joined in), so the fallback must trip on an empty/whitespace string — not just
 * null/undefined — or every rival collapses to '' and is dropped from the field.
 * A car number of '0' is a real identity and must survive. */
export const stableDriverId = (row: LiveMotionRow): string => {
  for (const candidate of [row.driverId, row.DriverID, row.no, row.name]) {
    const text = String(candidate ?? '').trim();
    if (text) return text;
  }
  return '';
};

export const livePosition = (row: LiveMotionRow): number | null =>
  numberOrNull(row.liveRank) ?? numberOrNull(row.rank);

/** Battle and field views share this exact order. `liveRank` is the primary
 * display rank; published `rank` remains on every row for audit comparison. */
export const sortRowsForLiveDisplay = (rows: LiveMotionRow[]): LiveMotionRow[] =>
  rows
    .filter((row) => livePosition(row) !== null && stableDriverId(row))
    .slice()
    .sort(
      (left, right) =>
        livePosition(left)! - livePosition(right)! || stableDriverId(left).localeCompare(stableDriverId(right))
    );

export const driverSurname = (row: LiveMotionRow): string => {
  const lastName = String(row.lastName ?? '').trim();
  if (lastName) return lastName;
  const name = String(row.name ?? '').trim();
  return name.split(/\s+/).at(-1) || `Car ${String(row.no ?? '—')}`;
};

const asNeighbor = (row: LiveMotionRow, gapSeconds: number): LiveBattleNeighbor => ({
  id: stableDriverId(row),
  carNo: String(row.no ?? '').trim(),
  surname: driverSurname(row),
  gapSeconds
});

const asCar = (row: LiveMotionRow, offsetSeconds: number): LiveBattleCar | null => {
  const rank = livePosition(row);
  const id = stableDriverId(row);
  if (!id || rank === null) return null;
  return {
    id,
    carNo: String(row.no ?? '').trim(),
    surname: driverSurname(row),
    rank,
    offsetSeconds
  };
};

/** `liveGap` is the published interval from each row to the preceding live
 * ranked row. Walking those adjacent intervals in both directions creates a
 * Bryce-centered seconds frame. Missing/non-numeric values stop that side of
 * the chain; they are never replaced with zero or lap-line `diff` values. */
export const buildCumulativeLiveBattleFrame = (
  inputRows: LiveMotionRow[],
  bryce: LiveMotionRow | null
): LiveBattleFrame | null => {
  if (!bryce) return null;
  const bryceId = stableDriverId(bryce);
  const rows = sortRowsForLiveDisplay(inputRows);
  const bryceIndex = rows.findIndex((row) => row.bryce === true || stableDriverId(row) === bryceId);
  if (bryceIndex < 0) return null;

  const cars: LiveBattleCar[] = [];
  let ahead: LiveBattleNeighbor | null = null;
  let aheadOffset = 0;
  for (let index = bryceIndex; index > 0; index -= 1) {
    const interval = positiveGapSeconds(rows[index].liveGap);
    if (interval === null) break;
    aheadOffset += interval;
    const car = asCar(rows[index - 1], aheadOffset);
    if (!car) break;
    cars.push(car);
    if (index === bryceIndex) ahead = asNeighbor(rows[index - 1], interval);
  }

  let behind: LiveBattleNeighbor | null = null;
  let behindOffset = 0;
  for (let index = bryceIndex + 1; index < rows.length; index += 1) {
    const interval = positiveGapSeconds(rows[index].liveGap);
    if (interval === null) break;
    behindOffset += interval;
    const car = asCar(rows[index], -behindOffset);
    if (!car) break;
    cars.push(car);
    if (index === bryceIndex + 1) behind = asNeighbor(rows[index], interval);
  }

  return { cars, ahead, behind, sourceField: 'liveGap' };
};

/** Deterministic lane assignment prevents label swaps when offsets re-sort. */
export const stableLabelLane = (driverId: string, laneCount: number): number => {
  let hash = 2166136261;
  for (let index = 0; index < driverId.length; index += 1) {
    hash ^= driverId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, laneCount);
};

interface LabelLaneCandidate {
  id: string;
  surname: string;
  x: number;
}

/** Keep the identity-derived lane when it is clear, then walk the remaining
 * lanes only when two rendered labels would collide. Cars are processed by
 * stable identity, so a rank resort cannot reshuffle every label. */
export const resolveStableLabelLanes = (
  candidates: LabelLaneCandidate[],
  laneCount: number,
  characterWidthPx = 5.4,
  paddingPx = 7
): Map<string, number> => {
  const count = Math.max(1, laneCount);
  const occupied = Array.from({ length: count }, () => [] as Array<{ x: number; halfWidth: number }>);
  const result = new Map<string, number>();
  const sorted = candidates.slice().sort((left, right) => left.id.localeCompare(right.id));

  for (const candidate of sorted) {
    const halfWidth = Math.max(10, candidate.surname.length * characterWidthPx * 0.5);
    const preferred = stableLabelLane(candidate.id, count);
    let selected = preferred;
    let leastOverlap = Number.POSITIVE_INFINITY;
    for (let step = 0; step < count; step += 1) {
      const lane = (preferred + step) % count;
      const overlap = occupied[lane].reduce((total, label) => {
        const penetration = label.halfWidth + halfWidth + paddingPx - Math.abs(label.x - candidate.x);
        return total + Math.max(0, penetration);
      }, 0);
      if (overlap === 0) {
        selected = lane;
        leastOverlap = 0;
        break;
      }
      if (overlap < leastOverlap) {
        selected = lane;
        leastOverlap = overlap;
      }
    }
    occupied[selected].push({ x: candidate.x, halfWidth });
    result.set(candidate.id, selected);
  }

  return result;
};

export const rankChanges = (previous: LiveMotionRow[], current: LiveMotionRow[]): RankChange[] => {
  const previousRanks = new Map(previous.map((row) => [stableDriverId(row), livePosition(row)]));
  return current.flatMap((row) => {
    const id = stableDriverId(row);
    const from = previousRanks.get(id);
    const to = livePosition(row);
    return id && from !== undefined && from !== null && to !== null && from !== to ? [{ id, from, to }] : [];
  });
};

export const isFreshCheckedAt = (checkedAt: unknown, now = Date.now(), maxAgeMs = 10_000): boolean => {
  const parsed = Date.parse(String(checkedAt ?? ''));
  return Number.isFinite(parsed) && now - parsed >= 0 && now - parsed <= maxAgeMs;
};

/** Fixed five-minute timestamp domain. Before the first five minutes elapse,
 * appending a sample does not move earlier x positions; afterward it becomes
 * a true sliding window with a constant scale. */
export const timestampWindowDomain = (timestamps: string[], windowMs = 300_000): { startMs: number; endMs: number } | null => {
  const parsed = timestamps.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (parsed.length === 0) return null;
  const firstMs = Math.min(...parsed);
  const latestMs = Math.max(...parsed);
  const endMs = Math.max(firstMs + windowMs, latestMs);
  return { startMs: endMs - windowMs, endMs };
};
