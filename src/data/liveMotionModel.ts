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

/* ---------- Brief J stage 2: field compression (facts, not forecasts) ---------- */

/** The tight window that reads as "genuinely wheel-to-wheel" — one second, the
 * same threshold the field tower uses for its battle brackets. */
export const FIELD_COMPRESSION_TIGHT_GAP_SECONDS = 1;
/** A car within this of its neighbour is still "in Bryce's pack". Kept equal to
 * the tight window so the module speaks a single, explainable number. */
export const FIELD_COMPRESSION_PACK_GAP_SECONDS = 1;

export type FieldGapBasis = 'leader-cumulative' | 'preceding-interval';

export interface FieldCompression {
  /** Contiguous cars around Bryce (Bryce included) each within the pack gap. */
  packCars: number;
  /** Nose-to-tail span of that pack, in seconds. */
  packCoveredSeconds: number;
  /** Adjacent car-pairs across the whole running order within the tight gap. */
  pairsWithinTight: number;
  /** The tight threshold used, in seconds (surfaced in copy). */
  tightGapSeconds: number;
  /** The pack threshold used, in seconds. */
  packGapSeconds: number;
  /** Rows that carried a numeric gap this poll — the availability signal. */
  numericGapCount: number;
  /** Which reading of `liveGap` the field resolved to this poll. */
  gapBasis: FieldGapBasis;
}

/** The published `liveGap` field means one of two things depending on the feed:
 * the RaceTools/Timing71 lake (and the live feed's own `gap`) publish the
 * CUMULATIVE gap to the leader, which is monotonic non-decreasing by rank; some
 * paths carry the already-differenced interval to the preceding car. Adjacent
 * on-track intervals are the difference of consecutive leader gaps in the first
 * case and the value itself in the second. We detect the basis from the sourced
 * numbers alone — a non-decreasing run of ranked gaps is cumulative — so the
 * compression facts stay correct whichever way the current payload reads, with
 * no guess baked in. */
export const resolveFieldGapBasis = (rankedGaps: Array<number | null>): FieldGapBasis => {
  let comparable = 0;
  let decreasing = 0;
  for (let index = 1; index < rankedGaps.length; index += 1) {
    const previous = rankedGaps[index - 1];
    const current = rankedGaps[index];
    if (previous === null || current === null) continue;
    comparable += 1;
    // A hair of tolerance so a rounding wobble in a cumulative feed does not
    // read as a genuine decrease.
    if (current < previous - 0.02) decreasing += 1;
  }
  // Cumulative gap-to-leader never decreases; require a clear monotone run
  // before trusting the differenced reading, and fall back to the preceding-
  // interval convention when the evidence is thin or mixed.
  if (comparable >= 3 && decreasing === 0) return 'leader-cumulative';
  return 'preceding-interval';
};

/** Adjacent on-track interval seconds per rank transition: entry `i` is the gap
 * between the car at ranked index `i` and the car ahead of it (index `i-1`).
 * `null` where either side lacks a numeric gap (a lapped car, a break in the
 * feed) — those never fall back to zero and always break a chain. */
export const adjacentIntervalsSeconds = (
  rankedGaps: Array<number | null>,
  basis: FieldGapBasis
): Array<number | null> =>
  rankedGaps.map((gap, index) => {
    if (index === 0) return null;
    if (basis === 'preceding-interval') return gap;
    const previous = rankedGaps[index - 1];
    if (gap === null || previous === null) return null;
    const interval = gap - previous;
    return interval >= 0 ? interval : null;
  });

/** Descriptive field-compression facts around Bryce, computed from the sourced
 * gaps in the current payload — the same corridor data the battle uses. Facts
 * only: how many cars sit in Bryce's contiguous pack and the time that pack
 * covers, plus how many pairs across the field run within the tight window.
 * No probabilities, no forecasts. Returns null when the gaps cannot be read. */
export const buildFieldCompression = (
  inputRows: LiveMotionRow[],
  bryce: LiveMotionRow | null,
  options: { tightGapSeconds?: number; packGapSeconds?: number } = {}
): FieldCompression | null => {
  const tightGapSeconds = options.tightGapSeconds ?? FIELD_COMPRESSION_TIGHT_GAP_SECONDS;
  const packGapSeconds = options.packGapSeconds ?? FIELD_COMPRESSION_PACK_GAP_SECONDS;
  if (!bryce) return null;
  const rows = sortRowsForLiveDisplay(inputRows);
  if (rows.length < 2) return null;

  const rankedGaps = rows.map((row) => positiveGapSeconds(row.liveGap));
  const numericGapCount = rankedGaps.filter((gap) => gap !== null).length;
  // Fewer than two sourced gaps cannot form a single interval — the field read
  // is unavailable, so the module stays absent rather than inventing a fact.
  if (numericGapCount < 2) return null;

  const gapBasis = resolveFieldGapBasis(rankedGaps);
  const intervals = adjacentIntervalsSeconds(rankedGaps, gapBasis);

  let pairsWithinTight = 0;
  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval !== null && interval > 0 && interval <= tightGapSeconds) pairsWithinTight += 1;
  }

  const bryceId = stableDriverId(bryce);
  const bryceIndex = rows.findIndex((row) => row.bryce === true || stableDriverId(row) === bryceId);
  let packCars = 0;
  let packCoveredSeconds = 0;
  // Bryce must hold a numeric gap himself before he can anchor a pack — a
  // lapped Bryce ("+N L") has no on-track interval, so the pack collapses to
  // the field fact alone.
  if (bryceIndex >= 0 && rankedGaps[bryceIndex] !== null) {
    packCars = 1;
    for (let index = bryceIndex; index > 0; index -= 1) {
      const interval = intervals[index];
      if (interval === null || interval > packGapSeconds) break;
      packCoveredSeconds += interval;
      packCars += 1;
    }
    for (let index = bryceIndex + 1; index < rows.length; index += 1) {
      const interval = intervals[index];
      if (interval === null || interval > packGapSeconds) break;
      packCoveredSeconds += interval;
      packCars += 1;
    }
  }

  return {
    packCars,
    packCoveredSeconds,
    pairsWithinTight,
    tightGapSeconds,
    packGapSeconds,
    numericGapCount,
    gapBasis
  };
};

/* ---------- Brief P: the battle axis breathes ---------- */

/** Quantized half-frame widths for the corridor, in seconds. The axis only ever
 * shows ±1s, ±2s, ±4s, or ±8s — a ladder, not a continuous fit, so the frame
 * reads as a camera choosing a lens rather than a chart squirming. */
export const BATTLE_AXIS_LADDER: readonly number[] = [1, 2, 4, 8];
/** Rescale triggers. The frame rescales ONLY when the corridor content occupies
 * less than 55% or more than 90% of the half-frame (spec thresholds). */
export const BATTLE_AXIS_LOW_OCCUPANCY = 0.55;
export const BATTLE_AXIS_HIGH_OCCUPANCY = 0.9;
/** On a breach the ladder moves toward the smallest step that holds the content
 * at or under 80% — strictly inside the 90% up-trigger, so no step ever lands
 * in an immediately re-breaching state. This is the anti-wobble guard: content
 * sitting exactly on a trigger boundary re-breaches, retargets to the step it
 * is already on, and holds. */
export const BATTLE_AXIS_FIT_OCCUPANCY = 0.8;
/** The corridor frames the N nearest cars per side; further cars do not vote. */
export const BATTLE_AXIS_NEAREST_PER_SIDE = 2;
/** Before any content has voted (fresh mount, no comparable rivals yet). */
export const BATTLE_AXIS_DEFAULT_STEP = 4;

export interface BattleAxisDecision {
  /** The half-frame width in seconds after this evaluation. */
  step: number;
  /** Content extent ÷ the step held BEFORE this evaluation; null without content. */
  occupancy: number | null;
  /** Which spec threshold tripped, if any. A breach may still hold the step
   * when the current rung is already the best ladder fit. */
  breach: 'low' | 'high' | null;
  changed: boolean;
}

/** Content extent: the widest |offset| among the nearest cars per side that
 * could ever fit the ladder's top rung. Cars beyond the top rung can never
 * render, so they never vote — a lone 12s-away leader must not hold the frame
 * at ±8s while a 0.5s battle sits at Bryce's gearbox. */
export const battleAxisExtentSeconds = (
  cars: Array<{ offsetSeconds: number }>,
  perSide = BATTLE_AXIS_NEAREST_PER_SIDE,
  maxStep = BATTLE_AXIS_LADDER[BATTLE_AXIS_LADDER.length - 1]
): number | null => {
  const fittable = cars.filter((car) => Number.isFinite(car.offsetSeconds) && Math.abs(car.offsetSeconds) <= maxStep);
  const ahead = fittable.filter((car) => car.offsetSeconds > 0).sort((a, b) => a.offsetSeconds - b.offsetSeconds).slice(0, perSide);
  const behind = fittable.filter((car) => car.offsetSeconds < 0).sort((a, b) => b.offsetSeconds - a.offsetSeconds).slice(0, perSide);
  const voters = [...ahead, ...behind];
  if (voters.length === 0) return null;
  return Math.max(...voters.map((car) => Math.abs(car.offsetSeconds)));
};

/** The smallest ladder step holding the extent at or under the fit occupancy;
 * the top rung when nothing smaller fits. */
export const battleAxisFitStep = (extent: number | null): number => {
  if (extent === null) return BATTLE_AXIS_DEFAULT_STEP;
  return BATTLE_AXIS_LADDER.find((step) => extent <= step * BATTLE_AXIS_FIT_OCCUPANCY) ?? BATTLE_AXIS_LADDER[BATTLE_AXIS_LADDER.length - 1];
};

/** One ladder evaluation per sourced poll. Hysteresis: inside [55%, 90%]
 * occupancy the step NEVER moves. On a breach the step moves at most ONE rung
 * toward the fit target per evaluation, so a caution bunching walks the frame
 * down 8→4→2→1 across polls instead of lurching, and a restart walks it back
 * up. No content (extent null) holds the step — absence never rescales. */
export const nextBattleAxisStep = (currentStep: number, extent: number | null): BattleAxisDecision => {
  const ladder = BATTLE_AXIS_LADDER;
  const currentIndex = ladder.indexOf(currentStep);
  const safeIndex = currentIndex >= 0 ? currentIndex : ladder.indexOf(BATTLE_AXIS_DEFAULT_STEP);
  const step = ladder[safeIndex];
  if (extent === null) return { step, occupancy: null, breach: null, changed: false };
  const occupancy = extent / step;
  const breach = occupancy > BATTLE_AXIS_HIGH_OCCUPANCY ? 'high' : occupancy < BATTLE_AXIS_LOW_OCCUPANCY ? 'low' : null;
  if (!breach) return { step, occupancy, breach: null, changed: false };
  const targetIndex = ladder.indexOf(battleAxisFitStep(extent));
  if (targetIndex === safeIndex) return { step, occupancy, breach, changed: false };
  const nextIndex = safeIndex + Math.sign(targetIndex - safeIndex);
  return { step: ladder[nextIndex], occupancy, breach, changed: true };
};

/** Short median over the raw per-poll extents (the camera's rollingMedian
 * pattern at chart grain): a single noisy interval sample cannot move the
 * frame. Five sourced polls ≈ five seconds live. */
export const BATTLE_AXIS_EXTENT_MEDIAN_WINDOW = 5;
/** A breach must hold the SAME direction for this many consecutive sourced
 * polls before the ladder moves — time-domain hysteresis on top of the
 * occupancy bands. */
export const BATTLE_AXIS_BREACH_PERSISTENCE = 3;
/** Reversing the PREVIOUS move needs much longer evidence than continuing it.
 * Measured against all 40 lake race feeds: with this guard a rescale can never
 * undo itself across consecutive polls — the no-wobble property holds by
 * construction (a reversal needs 12 straight opposing polls). */
export const BATTLE_AXIS_REVERSAL_PERSISTENCE = 12;

export const battleAxisSmoothedExtent = (recentExtents: Array<number | null>): number | null => {
  const finite = recentExtents.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  return finite[Math.floor((finite.length - 1) / 2)];
};

export interface BattleAxisState {
  step: number;
  /** Raw extents of the last few sourced polls (median input). */
  recentExtents: Array<number | null>;
  /** Direction of the breach streak currently being accumulated. */
  pending: 'up' | 'down' | null;
  pendingCount: number;
  /** Direction of the last executed rescale, for the reversal guard. */
  lastMove: 'up' | 'down' | null;
}

export interface BattleAxisAdvance {
  state: BattleAxisState;
  decision: BattleAxisDecision;
  /** The smoothed extent this evaluation acted on. */
  extent: number | null;
}

/** A fresh axis snaps straight to the best ladder fit — no motion on mount. */
export const createBattleAxisState = (rawExtent: number | null = null): BattleAxisState => ({
  step: battleAxisFitStep(rawExtent),
  recentExtents: rawExtent === null ? [] : [rawExtent],
  pending: null,
  pendingCount: 0,
  lastMove: null
});

/** The per-poll reducer. Deterministic and side-effect free: feed it one raw
 * extent per sourced payload and it yields the next axis state plus the
 * decision that produced it (occupancy, breach, whether the step moved). */
export const advanceBattleAxis = (state: BattleAxisState, rawExtent: number | null): BattleAxisAdvance => {
  const recentExtents = [...state.recentExtents, rawExtent].slice(-BATTLE_AXIS_EXTENT_MEDIAN_WINDOW);
  const extent = battleAxisSmoothedExtent(recentExtents);
  const evaluation = nextBattleAxisStep(state.step, extent);
  const move = evaluation.changed ? (evaluation.step > state.step ? 'up' : 'down') : null;
  if (!move) {
    return {
      state: { ...state, recentExtents, pending: null, pendingCount: 0 },
      decision: { ...evaluation, step: state.step, changed: false },
      extent
    };
  }
  const pendingCount = move === state.pending ? state.pendingCount + 1 : 1;
  const needed = state.lastMove && move !== state.lastMove ? BATTLE_AXIS_REVERSAL_PERSISTENCE : BATTLE_AXIS_BREACH_PERSISTENCE;
  if (pendingCount < needed) {
    return {
      state: { ...state, recentExtents, pending: move, pendingCount },
      decision: { ...evaluation, step: state.step, changed: false },
      extent
    };
  }
  return {
    state: { step: evaluation.step, recentExtents, pending: null, pendingCount: 0, lastMove: move },
    decision: evaluation,
    extent
  };
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
