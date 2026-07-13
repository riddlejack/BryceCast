import {
  driverSurname,
  livePosition,
  positiveGapSeconds,
  stableDriverId,
  type LiveMotionRow
} from './liveMotionModel.ts';
import type { LiveHistorySample, LiveSessionHistory } from './liveHistoryModel.ts';

export const CAMERA_WINDOW_SECONDS = 12;
export const CAMERA_MEDIAN_WINDOW_MS = 60_000;
export const CAMERA_EDGE_HYSTERESIS_SECONDS = 0.5;

export interface CameraDomain {
  lower: number;
  upper: number;
  center: number;
}

export interface CameraPoint {
  checkedAt: string;
  checkedAtMs: number;
  value: number | null;
  rank: number | null;
  lap: number | null;
  flag: string;
  leaderId: string | null;
  breakBefore: boolean;
  status: string | null;
}

export interface CameraSeries {
  id: string;
  carNo: string;
  name: string;
  bryce: boolean;
  points: CameraPoint[];
}

export interface CameraFrameValue {
  id: string;
  carNo: string;
  name: string;
  bryce: boolean;
  value: number | null;
  rank: number | null;
  status: string | null;
}

export interface CameraCrossing {
  id: string;
  rivalId: string;
  rivalName: string;
  checkedAt: string;
  checkedAtMs: number;
  value: number;
  lap: number | null;
  direction: 'ahead_of' | 'behind';
}

const statusText = (row: LiveMotionRow): string =>
  [row.status, row.comment].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');

const lapStatusText = (row: LiveMotionRow): string | null => {
  const value = [row.diff, row.gap].map((candidate) => String(candidate ?? '').trim()).find((candidate) => /\blaps?\b/i.test(candidate));
  return value || null;
};

export const comparableCameraRow = (row: LiveMotionRow): boolean => {
  const status = statusText(row).toLowerCase();
  if (row.onTrack === false) return false;
  if (lapStatusText(row)) return false;
  if (!status) return true;
  if (/retir|out|dnf|dns|garage|pit|stopp|lapped|lap down|withdraw/.test(status)) return false;
  return /active|running|on track|run/.test(status);
};

/** Absolute seconds behind the current live-ranked leader. The chain stops at
 * the first unavailable/non-comparable interval; no downstream coordinate is
 * recoverable without inventing data. */
export const cameraFrameForSample = (sample: LiveHistorySample): CameraFrameValue[] => {
  let cumulative = 0;
  let chainAvailable = true;
  return sample.rows.map((row, index) => {
    const lapStatus = lapStatusText(row);
    const comparable = comparableCameraRow(row);
    if (index === 0) chainAvailable = comparable;
    else {
      const interval = comparable ? positiveGapSeconds(row.liveGap) : null;
      if (interval === null) chainAvailable = false;
      else if (chainAvailable) cumulative += interval;
    }
    return {
      id: stableDriverId(row),
      carNo: String(row.no ?? '').trim(),
      name: driverSurname(row),
      bryce: stableDriverId(row) === sample.bryceId,
      value: chainAvailable ? cumulative : null,
      rank: livePosition(row),
      status: comparable ? null : lapStatus ? `${lapStatus} down` : statusText(row) || (row.onTrack === false ? 'off track' : 'not comparable')
    };
  }).filter((entry) => entry.id);
};

export const fullFieldCameraSeries = (history: LiveSessionHistory | null): CameraSeries[] => {
  if (!history) return [];
  const identities = new Map<string, Omit<CameraSeries, 'points'>>();
  const frames = history.samples.map((sample) => {
    const values = cameraFrameForSample(sample);
    values.forEach((value) => identities.set(value.id, {
      id: value.id,
      carNo: value.carNo,
      name: value.name,
      bryce: value.bryce
    }));
    return new Map(values.map((value) => [value.id, value]));
  });

  return [...identities.values()].map((identity) => {
    let previousLeaderId: string | null = null;
    const points = history.samples.map((sample, index): CameraPoint => {
      const frame = frames[index];
      const leaderId = sample.rows[0] ? stableDriverId(sample.rows[0]) : null;
      const value = frame.get(identity.id);
      const point = {
        checkedAt: sample.checkedAt,
        checkedAtMs: sample.checkedAtMs,
        value: value?.value ?? null,
        rank: value?.rank ?? null,
        lap: sample.lap,
        flag: sample.flag,
        leaderId,
        breakBefore: index > 0 && leaderId !== previousLeaderId,
        status: value?.status ?? (frame.has(identity.id) ? null : 'not classified')
      };
      previousLeaderId = leaderId;
      return point;
    });
    return { ...identity, points };
  }).sort((left, right) => (left.bryce === right.bryce ? left.id.localeCompare(right.id) : left.bryce ? -1 : 1));
};

export const rollingMedian = (
  points: Array<{ checkedAtMs: number; value: number | null }>,
  endMs: number,
  windowMs = CAMERA_MEDIAN_WINDOW_MS
): number | null => {
  const values = points
    .filter((point) => point.checkedAtMs > endMs - windowMs && point.checkedAtMs <= endMs && point.value !== null && Number.isFinite(point.value))
    .map((point) => point.value as number)
    .sort((left, right) => left - right);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
};

export const cameraDomainFor = (
  median: number,
  bryceValue: number,
  height = CAMERA_WINDOW_SECONDS,
  edge = CAMERA_EDGE_HYSTERESIS_SECONDS
): CameraDomain => {
  let lower = Math.max(0, median - height / 2);
  if (bryceValue < lower + edge) lower = Math.max(0, bryceValue - edge);
  if (bryceValue > lower + height - edge) lower = Math.max(0, bryceValue - height + edge);
  return { lower, upper: lower + height, center: lower + height / 2 };
};

/** Rendering-only camera easing. Reduced motion snaps to the correct target. */
export const easedCameraCenter = (previous: number | null, target: number, reducedMotion: boolean, factor = 0.16): number =>
  reducedMotion || previous === null ? target : previous + (target - previous) * factor;

export const easedCameraCenterForSession = (
  previousSessionKey: string | null,
  currentSessionKey: string | null,
  previous: number | null,
  target: number,
  reducedMotion: boolean,
  factor = 0.16
): number => previousSessionKey !== currentSessionKey ? target : easedCameraCenter(previous, target, reducedMotion, factor);

export const domainFromCenter = (center: number, height = CAMERA_WINDOW_SECONDS): CameraDomain => {
  const lower = Math.max(0, center - height / 2);
  return { lower, upper: lower + height, center: lower + height / 2 };
};

export const cameraMembership = (
  values: CameraFrameValue[],
  domain: CameraDomain,
  retained = new Set<string>(),
  hysteresis = CAMERA_EDGE_HYSTERESIS_SECONDS
): Set<string> => {
  const next = new Set<string>();
  values.forEach((entry) => {
    if (entry.value === null) return;
    const inside = entry.value >= domain.lower && entry.value <= domain.upper;
    const retainedInside = retained.has(entry.id) && entry.value >= domain.lower - hysteresis && entry.value <= domain.upper + hysteresis;
    if (inside || retainedInside) next.add(entry.id);
  });
  return next;
};

export const clipCameraSeries = (series: CameraSeries, startMs: number, endMs: number): CameraSeries => {
  const before = series.points.filter((point) => point.checkedAtMs < startMs).at(-1);
  const inside = series.points.filter((point) => point.checkedAtMs >= startMs && point.checkedAtMs <= endMs);
  return { ...series, points: before ? [before, ...inside] : inside };
};

export const cameraPointSegments = (points: CameraPoint[]): CameraPoint[][] => {
  const segments: CameraPoint[][] = [];
  let current: CameraPoint[] = [];
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value) || point.breakBefore) {
      if (current.length > 0) segments.push(current);
      current = [];
      if (point.value === null || !Number.isFinite(point.value)) continue;
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
};

export const proximityStyle = (gapToBryce: number): { strokeWidth: number; opacity: number } => {
  const distance = Math.abs(gapToBryce);
  if (distance <= 1.5) return { strokeWidth: 2, opacity: 0.9 };
  if (distance <= 3.5) return { strokeWidth: 1.5, opacity: 0.5 };
  return { strokeWidth: 1, opacity: 0.28 };
};

export const detectBryceCrossings = (history: LiveSessionHistory | null): CameraCrossing[] => {
  if (!history) return [];
  const crossings: CameraCrossing[] = [];
  for (let index = 1; index < history.samples.length; index += 1) {
    const previous = history.samples[index - 1];
    const current = history.samples[index];
    const previousFrame = new Map(cameraFrameForSample(previous).map((value) => [value.id, value]));
    const currentFrame = new Map(cameraFrameForSample(current).map((value) => [value.id, value]));
    const previousBryce = previousFrame.get(previous.bryceId);
    const currentBryce = currentFrame.get(current.bryceId);
    if (!previousBryce || !currentBryce || previousBryce.value === null || currentBryce.value === null) continue;
    const previousLeader = previous.rows[0] ? stableDriverId(previous.rows[0]) : null;
    const currentLeader = current.rows[0] ? stableDriverId(current.rows[0]) : null;
    if (!previousLeader || previousLeader !== currentLeader) continue;
    currentFrame.forEach((rival, rivalId) => {
      if (rivalId === current.bryceId || rival.value === null || rival.rank === null || currentBryce.rank === null) return;
      const priorRival = previousFrame.get(rivalId);
      if (!priorRival || priorRival.value === null || priorRival.rank === null || previousBryce.rank === null) return;
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
        value: currentBryce.value as number,
        lap: current.lap,
        direction: wasBehind && isAhead ? 'ahead_of' : 'behind'
      });
    });
  }
  return crossings;
};

export interface LadderLabel {
  id: string;
  desiredY: number;
  y: number;
}

export const resolveLadderCollisions = (
  labels: Array<{ id: string; desiredY: number }>,
  top: number,
  bottom: number,
  minimumSpacing = 18
): LadderLabel[] => {
  const sorted = labels.slice().sort((left, right) => left.desiredY - right.desiredY || left.id.localeCompare(right.id));
  const placed = sorted.map((label, index) => ({ ...label, y: Math.max(label.desiredY, index === 0 ? top : 0) }));
  for (let index = 0; index < placed.length; index += 1) {
    placed[index].y = Math.max(index === 0 ? top : placed[index - 1].y + minimumSpacing, placed[index].desiredY);
  }
  if (placed.length && placed.at(-1)!.y > bottom) {
    placed[placed.length - 1].y = bottom;
    for (let index = placed.length - 2; index >= 0; index -= 1) {
      placed[index].y = Math.min(placed[index].y, placed[index + 1].y - minimumSpacing);
    }
    if (placed[0].y < top) {
      const offset = top - placed[0].y;
      placed.forEach((label) => { label.y += offset; });
    }
  }
  return placed;
};

export const cautionSpans = (points: CameraPoint[]): Array<{ startMs: number; endMs: number }> => {
  const spans: Array<{ startMs: number; endMs: number }> = [];
  points.forEach((point, index) => {
    const caution = /yellow|caution|fcy/i.test(point.flag);
    if (!caution) return;
    const endMs = points[index + 1]?.checkedAtMs ?? point.checkedAtMs;
    const latest = spans.at(-1);
    if (latest && latest.endMs === point.checkedAtMs) latest.endMs = endMs;
    else spans.push({ startMs: point.checkedAtMs, endMs });
  });
  return spans;
};

export const threeLapTrend = (points: CameraPoint[], endIndex: number): number | null => {
  const latest = points[endIndex];
  if (!latest || latest.value === null || latest.lap === null) return null;
  const candidates = points.slice(0, endIndex + 1).filter((point) => point.value !== null && point.lap !== null && point.lap <= latest.lap! - 3);
  const start = candidates.at(-1);
  if (!start || start.value === null) return null;
  const supported = points.slice(points.indexOf(start), endIndex + 1).filter((point) => point.value !== null);
  return supported.length >= 10 ? latest.value - start.value : null;
};
