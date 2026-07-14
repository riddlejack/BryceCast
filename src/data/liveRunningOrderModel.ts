import { buildBattleFrameForSample, type LiveHistorySample, type LiveSessionHistory } from './liveHistoryModel.ts';
import { driverSurname, livePosition, stableDriverId } from './liveMotionModel.ts';

export const RUNNING_ORDER_WINDOW_MS = 300_000;
export const RUNNING_ORDER_LANE_COUNT = 7;
export const RUNNING_ORDER_HOVER_RADIUS_PX = 14;

export const RUNNING_ORDER_LINE_PATTERNS = [
  { name: 'solid', dashArray: null },
  { name: 'long-dash', dashArray: '10 4' },
  { name: 'short-dash', dashArray: '4 3' },
  { name: 'dotted', dashArray: '1 4' },
  { name: 'dash-dot', dashArray: '8 3 1 3' },
  { name: 'dash-two-dot', dashArray: '8 3 1 3 1 3' }
] as const;

export interface RunningOrderIdentityStyle {
  name: (typeof RUNNING_ORDER_LINE_PATTERNS)[number]['name'];
  dashArray: string | null;
}

export interface RunningOrderDomain {
  lower: number;
  upper: number;
  center: number;
}

export interface RunningOrderClockDomain {
  startMs: number;
  endMs: number;
  firstSampleMs: number;
  latestSampleMs: number;
  growing: boolean;
  waiting: boolean;
}

export interface RunningOrderFrameValue {
  id: string;
  carNo: string;
  name: string;
  bryce: boolean;
  rank: number;
  startPosition: number | null;
  status: string | null;
}

export interface RunningOrderPoint {
  checkedAt: string;
  checkedAtMs: number;
  rank: number | null;
  lap: number | null;
  flag: string;
  breakBefore: boolean;
  status: string | null;
}

export interface RunningOrderSeries {
  id: string;
  carNo: string;
  name: string;
  bryce: boolean;
  startPosition: number | null;
  points: RunningOrderPoint[];
}

export interface RunningOrderCrossing {
  id: string;
  rivalId: string;
  rivalName: string;
  checkedAt: string;
  checkedAtMs: number;
  rank: number;
  lap: number | null;
  direction: 'ahead_of' | 'behind';
}

export interface RunningOrderLastChange {
  text: string;
  lap: number | null;
}

export interface RunningOrderLadderEntry extends RunningOrderFrameValue {
  yOffset: number;
}

export interface RenderedRunningOrderSegment {
  driverId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  checkedAtMs: number;
  rank: number;
  kind: 'horizontal' | 'vertical';
}

export interface RunningOrderSegmentHit extends RenderedRunningOrderSegment {
  x: number;
  y: number;
  distance: number;
  distanceX: number;
  distanceY: number;
}

const statusText = (row: Record<string, unknown>): string | null => {
  const text = [row.status, row.comment]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  return text || null;
};

const officialRank = (row: Record<string, unknown>): number | null => {
  const rank = livePosition(row);
  return rank !== null && Number.isInteger(rank) && rank >= 1 ? rank : null;
};

const officialStartPosition = (row: Record<string, unknown>): number | null => {
  const startPosition = Number(row.startPosition);
  return Number.isInteger(startPosition) && startPosition >= 1 ? startPosition : null;
};

const stableStringSeed = (value: string): number => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

/** The visual identity is session-stable and independent of live rank. The
 * official starting position spreads neighboring cars across distinct neutral
 * rhythms; DriverID provides a deterministic fallback when it is unavailable. */
export const runningOrderIdentityStyle = (
  driverId: string,
  startPosition: number | null = null
): RunningOrderIdentityStyle => {
  const gridIndex = Number(startPosition) - 1;
  const seed = Number.isInteger(startPosition) && Number(startPosition) >= 1
    ? gridIndex + Math.floor(gridIndex / RUNNING_ORDER_LINE_PATTERNS.length) * 2
    : stableStringSeed(driverId);
  return RUNNING_ORDER_LINE_PATTERNS[seed % RUNNING_ORDER_LINE_PATTERNS.length];
};

/** Rank stays valid for lapped, pitted, or retired cars as long as Race
 * Control still publishes an official running position. Status never gates
 * this coordinate. */
export const runningOrderFrameForSample = (sample: LiveHistorySample): RunningOrderFrameValue[] =>
  sample.rows.flatMap((row) => {
    const id = stableDriverId(row);
    const rank = officialRank(row);
    if (!id || rank === null) return [];
    return [{
      id,
      carNo: String(row.no ?? '').trim(),
      name: driverSurname(row),
      bryce: id === sample.bryceId,
      rank,
      startPosition: officialStartPosition(row),
      status: statusText(row)
    }];
  }).sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));

export const runningOrderAvailableForSample = (sample: LiveHistorySample): boolean => {
  const frame = runningOrderFrameForSample(sample);
  return frame.length >= 2 && frame.some((entry) => entry.bryce);
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** A missing ordering poll is represented by a timestamp gap. Three normal
 * source cadences (with a three-second floor) separates a real gap from small
 * poll jitter without drawing through a feed outage. */
export const runningOrderGapThresholdMs = (history: LiveSessionHistory | null): number => {
  const deltas = (history?.samples ?? []).slice(1).map((sample, index) => sample.checkedAtMs - history!.samples[index].checkedAtMs)
    .filter((value) => value > 0 && value <= 10_000);
  return Math.max(3_000, (median(deltas) ?? 1_000) * 3);
};

export const fullFieldRunningOrderSeries = (history: LiveSessionHistory | null): RunningOrderSeries[] => {
  if (!history) return [];
  const frames = history.samples.map(runningOrderFrameForSample);
  const identities = new Map<string, Omit<RunningOrderSeries, 'points'>>();
  frames.forEach((frame) => frame.forEach((entry) => {
    const previous = identities.get(entry.id);
    identities.set(entry.id, {
      id: entry.id,
      carNo: entry.carNo,
      name: entry.name,
      bryce: entry.bryce,
      startPosition: previous?.startPosition ?? entry.startPosition ?? null
    });
  }));
  const threshold = runningOrderGapThresholdMs(history);

  return [...identities.values()].map((identity) => ({
    ...identity,
    points: history.samples.map((sample, index) => {
      const value = frames[index].find((entry) => entry.id === identity.id) ?? null;
      const previous = history.samples[index - 1] ?? null;
      return {
        checkedAt: sample.checkedAt,
        checkedAtMs: sample.checkedAtMs,
        rank: value?.rank ?? null,
        lap: sample.lap,
        flag: sample.flag,
        breakBefore: Boolean(index > 0 && (!runningOrderAvailableForSample(sample) || sample.checkedAtMs - previous.checkedAtMs > threshold)),
        status: value?.status ?? null
      };
    })
  })).sort((left, right) => left.bryce === right.bryce ? left.id.localeCompare(right.id) : left.bryce ? -1 : 1);
};

export const runningOrderTimeDomain = (
  history: LiveSessionHistory | null,
  clockCheckedAt?: string | null,
  windowMs = RUNNING_ORDER_WINDOW_MS
): RunningOrderClockDomain | null => {
  const samples = history?.samples ?? [];
  if (samples.length === 0) return null;
  const firstSampleMs = samples[0].checkedAtMs;
  const latestSampleMs = samples.at(-1)!.checkedAtMs;
  const parsedClock = Date.parse(String(clockCheckedAt ?? ''));
  const threshold = runningOrderGapThresholdMs(history);
  const waiting = Number.isFinite(parsedClock) && parsedClock - latestSampleMs > threshold;
  const endMs = waiting ? Math.max(parsedClock, latestSampleMs) : latestSampleMs;
  const startMs = Math.max(firstSampleMs, endMs - windowMs);
  return {
    startMs,
    endMs,
    firstSampleMs,
    latestSampleMs,
    growing: endMs - firstSampleMs < windowMs,
    waiting
  };
};

export const runningOrderDomainFor = (
  bryceRank: number,
  maximumRank = Number.POSITIVE_INFINITY,
  laneCount = RUNNING_ORDER_LANE_COUNT
): RunningOrderDomain => {
  const count = Math.max(3, Math.round(laneCount));
  const half = Math.floor(count / 2);
  const maxLower = Number.isFinite(maximumRank) ? Math.max(1, maximumRank - count + 1) : Number.POSITIVE_INFINITY;
  const lower = Math.max(1, Math.min(Math.round(bryceRank) - half, maxLower));
  const upper = lower + count - 1;
  return { lower, upper, center: lower + half };
};

export const runningOrderProximityStyle = (
  placesFromBryce: number,
  atEdge = false
): { strokeWidth: number; opacity: number } => {
  const distance = Math.abs(placesFromBryce);
  if (atEdge) return { strokeWidth: 1, opacity: 0.3 };
  if (distance <= 1) return { strokeWidth: 2, opacity: 0.85 };
  if (distance <= 3) return { strokeWidth: 1.5, opacity: 0.5 };
  return { strokeWidth: 1, opacity: 0.3 };
};

const compressSegment = (points: RunningOrderPoint[]): RunningOrderPoint[] => {
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.rank !== previous.rank) result.push(current);
  }
  const latest = points.at(-1)!;
  if (result.at(-1)?.checkedAtMs !== latest.checkedAtMs) result.push(latest);
  return result;
};

/** Split on missing ordering, retain the predecessor at the left clip edge,
 * and keep only rank changes plus the live endpoint inside each segment. */
export const runningOrderPointSegments = (
  points: RunningOrderPoint[],
  startMs = Number.NEGATIVE_INFINITY,
  endMs = Number.POSITIVE_INFINITY
): RunningOrderPoint[][] => {
  const before = points.filter((point) => point.checkedAtMs < startMs).at(-1) ?? null;
  const windowed = [
    ...(before ? [before] : []),
    ...points.filter((point) => point.checkedAtMs >= startMs && point.checkedAtMs <= endMs)
  ];
  const result: RunningOrderPoint[][] = [];
  let current: RunningOrderPoint[] = [];
  for (const point of windowed) {
    if (point.rank === null || !Number.isFinite(point.rank) || point.breakBefore) {
      if (current.length > 0) result.push(compressSegment(current));
      current = [];
      if (point.rank === null || !Number.isFinite(point.rank)) continue;
    }
    current.push(point);
  }
  if (current.length > 0) result.push(compressSegment(current));
  return result;
};

export const detectBryceRunningOrderCrossings = (history: LiveSessionHistory | null): RunningOrderCrossing[] => {
  if (!history) return [];
  const crossings: RunningOrderCrossing[] = [];
  for (let index = 1; index < history.samples.length; index += 1) {
    const previous = history.samples[index - 1];
    const current = history.samples[index];
    if (!runningOrderAvailableForSample(previous) || !runningOrderAvailableForSample(current)) continue;
    const previousFrame = new Map(runningOrderFrameForSample(previous).map((entry) => [entry.id, entry]));
    const currentFrame = new Map(runningOrderFrameForSample(current).map((entry) => [entry.id, entry]));
    const previousBryce = previousFrame.get(previous.bryceId);
    const currentBryce = currentFrame.get(current.bryceId);
    if (!previousBryce || !currentBryce) continue;
    currentFrame.forEach((rival, rivalId) => {
      if (rivalId === current.bryceId) return;
      const priorRival = previousFrame.get(rivalId);
      if (!priorRival) return;
      const wasBehind = previousBryce.rank > priorRival.rank;
      const isAhead = currentBryce.rank < rival.rank;
      const wasAhead = previousBryce.rank < priorRival.rank;
      const isBehind = currentBryce.rank > rival.rank;
      if (!((wasBehind && isAhead) || (wasAhead && isBehind))) return;
      crossings.push({
        id: `${current.checkedAt}-${rivalId}`,
        rivalId,
        rivalName: rival.name,
        checkedAt: current.checkedAt,
        checkedAtMs: current.checkedAtMs,
        rank: currentBryce.rank,
        lap: current.lap,
        direction: wasBehind && isAhead ? 'ahead_of' : 'behind'
      });
    });
  }
  return crossings;
};

export const runningOrderCautionSpans = (
  samples: LiveHistorySample[],
  endMs?: number
): Array<{ startMs: number; endMs: number }> => {
  const spans: Array<{ startMs: number; endMs: number }> = [];
  samples.forEach((sample, index) => {
    if (!/yellow|caution|fcy/i.test(sample.flag)) return;
    const spanEnd = samples[index + 1]?.checkedAtMs ?? endMs ?? sample.checkedAtMs;
    const latest = spans.at(-1);
    if (latest && latest.endMs === sample.checkedAtMs) latest.endMs = spanEnd;
    else spans.push({ startMs: sample.checkedAtMs, endMs: spanEnd });
  });
  return spans;
};

export const runningOrderGapToBryce = (
  sample: LiveHistorySample,
  driverId: string
): { seconds: number; direction: 'ahead' | 'behind' } | null => {
  if (driverId === sample.bryceId) return null;
  const frame = buildBattleFrameForSample(sample);
  const car = frame?.cars.find((entry) => entry.id === driverId) ?? null;
  if (!car) return null;
  return { seconds: Math.abs(car.offsetSeconds), direction: car.offsetSeconds > 0 ? 'ahead' : 'behind' };
};

export const runningOrderGapWords = (
  sample: LiveHistorySample,
  driverId: string,
  includeBryce = true
): string => {
  if (driverId === sample.bryceId) return 'Bryce';
  const gap = runningOrderGapToBryce(sample, driverId);
  if (!gap) return '—';
  const subject = includeBryce ? (gap.direction === 'ahead' ? ' of Bryce' : ' Bryce') : '';
  return `${gap.seconds.toFixed(1)}s ${gap.direction}${subject}`;
};

export const lastRunningOrderChange = (
  history: LiveSessionHistory,
  driverId: string,
  throughSampleIndex = history.samples.length - 1
): RunningOrderLastChange | null => {
  for (let index = Math.min(throughSampleIndex, history.samples.length - 1); index > 0; index -= 1) {
    const previous = new Map(runningOrderFrameForSample(history.samples[index - 1]).map((entry) => [entry.id, entry]));
    const current = new Map(runningOrderFrameForSample(history.samples[index]).map((entry) => [entry.id, entry]));
    const before = previous.get(driverId);
    const after = current.get(driverId);
    if (!before || !after || before.rank === after.rank) continue;
    const gained = after.rank < before.rank;
    const swapped = [...current.values()]
      .filter((entry) => entry.id !== driverId && previous.has(entry.id))
      .filter((entry) => {
        const prior = previous.get(entry.id)!;
        return gained
          ? before.rank > prior.rank && after.rank < entry.rank
          : before.rank < prior.rank && after.rank > entry.rank;
      })
      .sort((left, right) => Math.abs(left.rank - after.rank) - Math.abs(right.rank - after.rank) || left.id.localeCompare(right.id))[0] ?? null;
    const lap = history.samples[index].lap;
    const text = swapped
      ? `${gained ? 'passed' : 'passed by'} ${swapped.name}`
      : `${gained ? 'gained' : 'lost'} ${Math.abs(after.rank - before.rank)} place${Math.abs(after.rank - before.rank) === 1 ? '' : 's'}`;
    return { text, lap };
  }
  return null;
};

export const sampleIndexAtOrBefore = (history: LiveSessionHistory, checkedAtMs: number): number => {
  for (let index = history.samples.length - 1; index >= 0; index -= 1) {
    if (history.samples[index].checkedAtMs <= checkedAtMs) return index;
  }
  return 0;
};

export const resolveRunningOrderLadder = (
  entries: RunningOrderFrameValue[],
  domain: RunningOrderDomain
): RunningOrderLadderEntry[] => {
  const visible = entries.filter((entry) => entry.rank >= domain.lower && entry.rank <= domain.upper);
  const byRank = new Map<number, RunningOrderFrameValue[]>();
  visible.forEach((entry) => byRank.set(entry.rank, [...(byRank.get(entry.rank) ?? []), entry]));
  return [...byRank.entries()].sort((left, right) => left[0] - right[0]).flatMap(([, sameRank]) => {
    const sorted = sameRank.slice().sort((left, right) => left.id.localeCompare(right.id));
    const middle = (sorted.length - 1) / 2;
    return sorted.map((entry, index) => ({ ...entry, yOffset: (index - middle) * 8 }));
  });
};

const clampedPointOnSegment = (
  segment: RenderedRunningOrderSegment,
  cursorX: number,
  cursorY: number
): { x: number; y: number } => {
  if (segment.kind === 'horizontal') {
    return { x: Math.max(Math.min(segment.x1, segment.x2), Math.min(Math.max(segment.x1, segment.x2), cursorX)), y: segment.y1 };
  }
  return { x: segment.x1, y: Math.max(Math.min(segment.y1, segment.y2), Math.min(Math.max(segment.y1, segment.y2), cursorY)) };
};

/** Hit testing is performed against the painted step geometry, not a nearest
 * timestamp proxy. Empty plot space therefore has no subject. */
export const nearestRunningOrderSegment = (
  segments: RenderedRunningOrderSegment[],
  cursorX: number,
  cursorY: number,
  radius = RUNNING_ORDER_HOVER_RADIUS_PX
): RunningOrderSegmentHit | null => {
  let nearest: RunningOrderSegmentHit | null = null;
  for (const segment of segments) {
    const point = clampedPointOnSegment(segment, cursorX, cursorY);
    const distanceX = Math.abs(point.x - cursorX);
    const distanceY = Math.abs(point.y - cursorY);
    const distance = Math.hypot(distanceX, distanceY);
    if (distance > radius || distanceX > radius || distanceY > radius) continue;
    if (!nearest || distance < nearest.distance) nearest = { ...segment, ...point, distance, distanceX, distanceY };
  }
  return nearest;
};
