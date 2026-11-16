/**
 * Where Bryce's marker goes on the replay's track, and where the cars around
 * him go (round 7, Jack's review of November 16, 2026).
 *
 * His words: a dot with Bryce's number "going around the track", placed within
 * a section "even if it's not 100% accurate", the section "getting filled with
 * orange as he moves through it". Timing measures only the moments he crosses
 * a loop. Between two crossings this places him by time:
 *
 *  - The crossings themselves come from his official section times, chained
 *    from the moment he crossed the line to start the lap. That moment (the
 *    lap's "base") is read off the replay's own frames: every frame says how
 *    many laps he has completed, which pins the line crossing between two
 *    bounds; the bounds from all the frames seen so far are intersected. This
 *    works at any replay speed (the old rule kept only crossings bracketed by
 *    frames under 3 s apart, and at 16x the frames are 4-16 s apart, so his
 *    marker did not appear until lap 7 of Monterey Race 2).
 *  - Inside a section he moves at the pace he is expected to hold there: his
 *    median clean time for that section so far in the race, else his history
 *    at the venue, else the field's median here. Under caution it is scaled by
 *    how much slower his last lap was than his green-flag lap.
 *  - He never passes a loop before the timing says he crossed it: a late
 *    crossing leaves him waiting just short of the loop (97%). When the
 *    crossing comes, early or late, he catches up over at most half a second
 *    of replay time, and he never moves backwards.
 *
 * The other cars are placed by their gap to him, turned into distance at his
 * own expected pace: a car 1.2 s ahead is drawn where he would be 1.2 s from
 * now. The order on the track is the running order by construction, and the
 * spacing follows the gaps. None of this is GPS; the page says so.
 *
 * Pure and node-testable: no React.
 */
import type { TrackSectionAnchor } from '../assets/tracks/sections/types';
import type { SectionLightPlan } from './liveSectionLight';

/** He waits this far into a section when the timing has not yet said he left it. */
export const HOLD_SHARE = 0.97;
/** Replay ms over which he catches up after a crossing. */
export const CATCH_UP_MS = 500;
/** How much slower than green a caution lap runs when no caution lap has been
 *  timed yet (Monterey 2026 Race 2: 124.5 s against 76-77 s green). */
export const DEFAULT_CAUTION_SCALE = 1.55;
/** Seconds after the green flag a car in grid slot N crosses the line, per
 *  slot (Monterey 2026 Race 2: P10 crossed 3.3 s after the green). A prior
 *  only; the frames correct it within a lap or two. */
export const START_SECONDS_PER_SLOT = 0.37;
/** A base is trusted for drawing once its bounds are this tight (ms), or when
 *  it rests on the green-flag prior. */
export const BASE_TRUST_MS = 25_000;

/* ---------- the chain's geometry ---------- */

const spanLength = (start: number, end: number) => (end >= start ? end - start : 1 - start + end);

export interface ChainGeometry {
  chain: TrackSectionAnchor[];
  /** Each section's share of the lap (sums to 1 for a closed chain). */
  share: number[];
  /** Where each section starts, as a share of the lap from the line. */
  startShare: number[];
}

export const chainGeometry = (chain: TrackSectionAnchor[]): ChainGeometry => {
  const raw = chain.map((anchor) => spanLength(anchor.startT, anchor.endT));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  const share = raw.map((value) => value / total);
  const startShare: number[] = [];
  let running = 0;
  for (const value of share) {
    startShare.push(running);
    running += value;
  }
  return { chain, share, startShare };
};

/** The arc parameter of a point `fraction` of the way through section `index`. */
export const tOfSection = (geometry: ChainGeometry, index: number, fraction: number): number => {
  const anchor = geometry.chain[index];
  return (anchor.startT + spanLength(anchor.startT, anchor.endT) * Math.max(0, Math.min(1, fraction))) % 1;
};

/** Section and fraction for a share of the lap from the line (0 ≤ share < 1). */
export const sectionOfShare = (geometry: ChainGeometry, share: number): { index: number; fraction: number } => {
  const s = ((share % 1) + 1) % 1;
  for (let index = geometry.share.length - 1; index >= 0; index -= 1) {
    if (s >= geometry.startShare[index]) {
      return { index, fraction: geometry.share[index] > 0 ? (s - geometry.startShare[index]) / geometry.share[index] : 0 };
    }
  }
  return { index: 0, fraction: 0 };
};

/* ---------- the lap base, from the frames ---------- */

/** A frame of the replay: when, and how many laps Bryce had completed. */
export interface LapSample {
  atMs: number;
  laps: number;
  /** The count may be stale (low): the server's list of breakpoints keeps a
   *  frame at each change of the order or the flag and can carry a lap count
   *  from before it (Monterey 2026 Race 2, 16:58:09: "9" in the breakpoints,
   *  11 in the full frame). A low count still bounds the crossing from above;
   *  it says nothing about the next one. */
  upperOnly?: boolean;
}

/** The bounds on one segment's base (the line crossing its first lap starts
 *  from): it is after `lo` and at or before `hi`. */
export interface BaseBounds {
  lo: number;
  hi: number;
}

/** Segment and seconds from its base for the crossing at the END of `lap`
 *  (lap 0 = the start). */
export const crossingOffset = (plan: SectionLightPlan, lap: number): { segment: number; seconds: number } | null => {
  const asEnd = plan.segmentOf.get(lap);
  if (asEnd !== undefined) return { segment: asEnd, seconds: plan.cumulative.get(lap) ?? 0 };
  const asBase = plan.segmentOf.get(-lap - 1);
  if (asBase !== undefined) return { segment: asBase, seconds: 0 };
  return null;
};

/** Tighten `bounds` with the samples: a frame reading `laps` completed at
 *  `atMs` means the crossing ending lap `laps` came at or before it, and the
 *  one ending lap `laps + 1` after it. Returns whether anything tightened. */
export const tightenBases = (plan: SectionLightPlan, bounds: Map<number, BaseBounds>, samples: LapSample[]): boolean => {
  let changed = false;
  const bound = (segment: number) => {
    let entry = bounds.get(segment);
    if (!entry) {
      entry = { lo: -Infinity, hi: Infinity };
      bounds.set(segment, entry);
    }
    return entry;
  };
  for (const sample of samples) {
    if (!Number.isFinite(sample.atMs) || !Number.isFinite(sample.laps) || sample.laps < 0) continue;
    // Laps completed: the crossing that ended that lap came at or before the
    // frame. A frame reading 0 says nothing of the start itself (the formation
    // laps read 0 too), only that lap 1 is still running.
    const done = sample.laps > 0 ? crossingOffset(plan, sample.laps) : null;
    if (done) {
      const entry = bound(done.segment);
      const hi = sample.atMs - done.seconds * 1000;
      if (hi < entry.hi) {
        entry.hi = hi;
        changed = true;
      }
    }
    const next = sample.upperOnly ? null : crossingOffset(plan, sample.laps + 1);
    if (next && plan.segmentOf.get(sample.laps + 1) === next.segment) {
      const entry = bound(next.segment);
      const lo = sample.atMs - next.seconds * 1000;
      if (lo > entry.lo) {
        entry.lo = lo;
        changed = true;
      }
    }
  }
  return changed;
};

export interface BaseEstimate {
  base: number;
  /** Width of the bounds it rests on (ms); 0 when they are exact. */
  spreadMs: number;
  /** Rests on the green-flag prior (bounds still wide). */
  fromPrior: boolean;
}

/** Each segment's base: the middle of its bounds once they are tight, the
 *  prior (clamped into the bounds) while they are wide. Bounds that cross
 *  (archive jitter) give their middle. */
export const estimateBases = (
  bounds: Map<number, BaseBounds>,
  priors: Map<number, number> = new Map()
): Map<number, BaseEstimate> => {
  const out = new Map<number, BaseEstimate>();
  const segments = new Set([...bounds.keys(), ...priors.keys()]);
  for (const segment of segments) {
    const entry = bounds.get(segment) ?? { lo: -Infinity, hi: Infinity };
    const prior = priors.get(segment);
    const { lo, hi } = entry;
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      const spread = Math.abs(hi - lo);
      if (lo > hi || spread <= 6_000 || prior === undefined) {
        out.set(segment, { base: (lo + hi) / 2, spreadMs: spread, fromPrior: false });
      } else {
        out.set(segment, { base: Math.max(lo, Math.min(hi, prior)), spreadMs: spread, fromPrior: true });
      }
    } else if (prior !== undefined) {
      out.set(segment, { base: Math.max(lo, Math.min(hi, prior)), spreadMs: Infinity, fromPrior: true });
    }
  }
  return out;
};

/** The green-flag prior for the first segment: the green plus a beat per grid
 *  slot ahead of him. */
export const startPrior = (greenMs: number | null, startPosition: number | null): number | null =>
  greenMs === null || !Number.isFinite(greenMs) ? null : greenMs + Math.max(0, Math.min(10, ((startPosition ?? 1) - 1) * START_SECONDS_PER_SLOT)) * 1000;

/* ---------- his expected pace ---------- */

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** What a lap of the plan says about pace: its section times, whether it was a
 *  clean green-flag lap. */
export interface PaceLap {
  lap: number;
  lapSeconds: number;
  sectionSeconds: number[] | null;
  clean: boolean;
}

export interface PaceModel {
  /** Expected green-flag section seconds before each lap (index by lap). */
  byLap: Map<number, number[]>;
  /** Expected green-flag lap, before each lap. */
  lapByLap: Map<number, number>;
  /** The fallback (venue history, then the field), used before he has a
   *  clean lap of his own. */
  fallback: number[];
  /** Where the fallback came from, for the "how" note. */
  fallbackBasis: 'venue' | 'field' | 'race';
}

/**
 * His expected section times before each lap: the median of his clean laps so
 * far in this race, section by section. Before his first clean lap: his
 * median at the venue in earlier races, then the field's median here, then
 * the median of his own laps in this race (always available, never shown as
 * anything but a pace).
 */
export const buildPaceModel = (
  laps: PaceLap[],
  count: number,
  { venue = null, field = null }: { venue?: Array<number | null> | null; field?: Array<number | null> | null } = {}
): PaceModel => {
  const own = Array.from({ length: count }, (_, index) =>
    median(laps.flatMap((lap) => (lap.sectionSeconds && lap.sectionSeconds[index] > 0 ? [lap.sectionSeconds[index]] : [])))
  );
  const pick = (source: Array<number | null> | null) =>
    source && source.length === count && source.every((value) => value !== null && value > 0) ? (source as number[]) : null;
  const venueTimes = pick(venue);
  const fieldTimes = pick(field);
  const fallback = venueTimes ?? fieldTimes ?? own.map((value) => value ?? 1);
  const fallbackBasis: PaceModel['fallbackBasis'] = venueTimes ? 'venue' : fieldTimes ? 'field' : 'race';
  const byLap = new Map<number, number[]>();
  const lapByLap = new Map<number, number>();
  const clean: number[][] = Array.from({ length: count }, () => []);
  const sorted = [...laps].sort((a, b) => a.lap - b.lap);
  const lastLap = sorted.at(-1)?.lap ?? 0;
  let cursor = 0;
  for (let lap = 1; lap <= lastLap + 1; lap += 1) {
    while (cursor < sorted.length && sorted[cursor].lap < lap) {
      const entry = sorted[cursor];
      if (entry.clean && entry.sectionSeconds) entry.sectionSeconds.forEach((value, index) => clean[index].push(value));
      cursor += 1;
    }
    const times = clean.map((values, index) => median(values) ?? fallback[index]);
    byLap.set(lap, times);
    lapByLap.set(lap, times.reduce((sum, value) => sum + value, 0));
  }
  return { byLap, lapByLap, fallback, fallbackBasis };
};

/* ---------- the race placed on the clock ---------- */

export interface RaceClockModel {
  geometry: ChainGeometry;
  plan: SectionLightPlan;
  bases: Map<number, BaseEstimate>;
  pace: PaceModel;
  /** Is the field neutralised at this moment (the flag the page shows). */
  neutralisedAt: (atMs: number) => boolean;
  /** The green flag. From it until he first crosses the line he is drawn on
   *  the run to the line, by the time left to his crossing. */
  greenMs?: number | null;
}

/** One lap placed on the clock: its crossings, line to line. */
export interface PlacedLap {
  lap: number;
  startMs: number;
  endMs: number;
  /** crossings[k] is the moment he entered section k; crossings[n] the end. */
  crossings: number[];
  /** Section times measured, or split from the lap time (no section times). */
  measuredSections: boolean;
}

const lapEntry = (plan: SectionLightPlan, lap: number) => plan.laps.get(lap) ?? null;

/** The lap's crossings: base + the cumulative lap times, then the section
 *  times inside it (a lap with no section times is split by his expected
 *  section shares). Null when the lap has no time or its segment no base. */
export const placeLap = (model: RaceClockModel, lap: number): PlacedLap | null => {
  const entry = lapEntry(model.plan, lap);
  if (!entry) return null;
  const segment = model.plan.segmentOf.get(lap);
  if (segment === undefined) return null;
  const base = model.bases.get(segment);
  if (!base) return null;
  const endMs = base.base + (model.plan.cumulative.get(lap) ?? 0) * 1000;
  const startMs = endMs - entry.lapSeconds * 1000;
  const expected = model.pace.byLap.get(lap) ?? model.pace.fallback;
  const total = expected.reduce((sum, value) => sum + value, 0) || 1;
  const seconds = entry.sectionSeconds ?? expected.map((value) => (value / total) * entry.lapSeconds);
  const crossings = [startMs];
  let cursor = startMs;
  for (const value of seconds) {
    cursor += value * 1000;
    crossings.push(cursor);
  }
  crossings[crossings.length - 1] = endMs;
  return { lap, startMs, endMs, crossings, measuredSections: Boolean(entry.sectionSeconds) };
};

/** The lap he is on at `atMs` (by his own line crossings), or null. */
export const lapAt = (model: RaceClockModel, atMs: number): PlacedLap | null => {
  // A race has at most a hundred-odd laps: a straight scan.
  for (const lap of model.plan.laps.keys()) {
    const placed = placeLap(model, lap);
    if (placed && atMs >= placed.startMs && atMs < placed.endMs) return placed;
  }
  return null;
};

/** How much slower than green he is running now: 1 on green; under caution,
 *  his last lap against his green-flag lap when that lap was a caution lap,
 *  otherwise the usual caution ratio. */
export const paceScale = (model: RaceClockModel, lap: number, atMs: number): number => {
  if (!model.neutralisedAt(atMs)) return 1;
  const previous = lapEntry(model.plan, lap - 1);
  const green = model.pace.lapByLap.get(lap) ?? null;
  if (previous && green && previous.lapSeconds > green * 1.15) return Math.min(3, previous.lapSeconds / green);
  return DEFAULT_CAUTION_SCALE;
};

export interface MarkerPlace {
  lap: number;
  /** The section he is in (by the timing). */
  index: number;
  /** How far through it he is drawn (0-1). */
  fraction: number;
  /** Arc parameter on the outline. */
  t: number;
  /** Laps from his first line crossing: lap - 1 + share of the lap. Grows
   *  with time; the page holds it so he never moves backwards. */
  distance: number;
  /** When he entered this section and is next timed (the measured crossings). */
  enteredAtMs: number;
  leavesAtMs: number;
  /** Seconds he is expected to take through this section now. */
  expectedSeconds: number;
  /** He has reached the hold point and is waiting for the loop. */
  holding: boolean;
}

const distanceOf = (geometry: ChainGeometry, lap: number, index: number, fraction: number) =>
  lap - 1 + geometry.startShare[index] + geometry.share[index] * fraction;

/** Expected seconds for section `index` of `lap` at `atMs`. */
const expectedFor = (model: RaceClockModel, lap: number, index: number, atMs: number) =>
  (model.pace.byLap.get(lap) ?? model.pace.fallback)[index] * paceScale(model, lap, atMs);

/** The rule, without the catch-up: where he is drawn at `atMs` in section
 *  `index` of a placed lap. */
const heldFraction = (model: RaceClockModel, placed: PlacedLap, index: number, atMs: number) => {
  const expected = expectedFor(model, placed.lap, index, atMs);
  const elapsed = (atMs - placed.crossings[index]) / 1000;
  return { fraction: Math.min(HOLD_SHARE, expected > 0 ? elapsed / expected : 0), expected };
};

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Where his marker goes at `atMs`, or null when the timing cannot place him
 *  (before his first lap, a lap with no time, a segment with no base). */
/** Between the green flag and his first line crossing (a rolling start: the
 *  cars behind the leader cross seconds after the flag), walk back from the
 *  line by the time still to go at his expected lap-1 pace. Null outside it. */
const placeBeforeLine = (model: RaceClockModel, atMs: number): MarkerPlace | null => {
  const greenMs = model.greenMs;
  if (greenMs === null || greenMs === undefined || !Number.isFinite(greenMs) || atMs < greenMs) return null;
  const first = placeLap(model, 1);
  if (!first || atMs >= first.startMs) return null;
  const geometry = model.geometry;
  const n = geometry.chain.length;
  let left = (first.startMs - atMs) / 1000;
  for (let index = n - 1; index >= 0; index -= 1) {
    const expected = expectedFor(model, 1, index, atMs);
    if (!(expected > 0)) return null;
    if (left <= expected) {
      const fraction = 1 - left / expected;
      return {
        lap: 0,
        index,
        fraction,
        t: tOfSection(geometry, index, fraction),
        distance: distanceOf(geometry, 0, index, fraction),
        enteredAtMs: first.startMs - expected * 1000,
        leavesAtMs: first.startMs,
        expectedSeconds: expected,
        holding: false
      };
    }
    left -= expected;
  }
  return null;
};

export const placeBryce = (model: RaceClockModel, atMs: number): MarkerPlace | null => {
  const placed = lapAt(model, atMs);
  if (!placed) return placeBeforeLine(model, atMs);
  const n = model.geometry.chain.length;
  let index = 0;
  while (index < n - 1 && atMs >= placed.crossings[index + 1]) index += 1;
  const { fraction: target, expected } = heldFraction(model, placed, index, atMs);
  let distance = distanceOf(model.geometry, placed.lap, index, target);
  // Just after a crossing: catch up from where the rule held him before it.
  const since = atMs - placed.crossings[index];
  if (since < CATCH_UP_MS) {
    const crossingMs = placed.crossings[index];
    let before: number | null = null;
    if (index > 0) {
      before = distanceOf(model.geometry, placed.lap, index - 1, heldFraction(model, placed, index - 1, crossingMs - 1).fraction);
    } else {
      const previous = placeLap(model, placed.lap - 1);
      if (previous && Math.abs(previous.endMs - crossingMs) < 1) {
        before = distanceOf(model.geometry, previous.lap, n - 1, heldFraction(model, previous, n - 1, crossingMs - 1).fraction);
      }
    }
    if (before !== null && before < distance) distance = before + (distance - before) * ease(since / CATCH_UP_MS);
  }
  const lapShare = distance - (placed.lap - 1);
  const at = sectionOfShare(model.geometry, Math.min(0.999999, Math.max(0, lapShare)));
  return {
    lap: placed.lap,
    index,
    fraction: at.index === index ? at.fraction : target,
    t: tOfSection(model.geometry, at.index, at.fraction),
    distance,
    enteredAtMs: placed.crossings[index],
    leavesAtMs: placed.crossings[index + 1],
    expectedSeconds: expected,
    holding: target >= HOLD_SHARE
  };
};

/** The distance (laps) a car `seconds` ahead of him (negative: behind) is
 *  drawn at: where he would be that long from his drawn place, at his
 *  expected pace through each section. */
export const distanceAhead = (model: RaceClockModel, from: MarkerPlace, seconds: number, atMs: number): number => {
  const geometry = model.geometry;
  const n = geometry.chain.length;
  const scale = paceScale(model, from.lap, atMs);
  const expected = (model.pace.byLap.get(from.lap) ?? model.pace.fallback).map((value) => value * scale);
  const lapShare = from.distance - Math.floor(from.distance);
  let { index, fraction } = sectionOfShare(geometry, lapShare);
  let distance = from.distance;
  let left = seconds;
  let guard = 0;
  while (Math.abs(left) > 1e-6 && guard < n * 8) {
    guard += 1;
    const span = expected[index] > 0 ? expected[index] : 1;
    if (left > 0) {
      const room = (1 - fraction) * span;
      if (left < room) {
        distance += geometry.share[index] * (left / span);
        left = 0;
      } else {
        distance += geometry.share[index] * (1 - fraction);
        left -= room;
        index = (index + 1) % n;
        fraction = 0;
      }
    } else {
      const room = fraction * span;
      if (-left < room) {
        distance -= geometry.share[index] * (-left / span);
        left = 0;
      } else {
        distance -= geometry.share[index] * fraction;
        left += room;
        index = (index - 1 + n) % n;
        fraction = 1;
      }
    }
  }
  return distance;
};

/** The arc parameter of a distance (laps from his first crossing). */
export const tOfDistance = (geometry: ChainGeometry, distance: number): number => {
  const at = sectionOfShare(geometry, distance - Math.floor(distance));
  return tOfSection(geometry, at.index, at.fraction);
};

/* ---------- the race bar's axis: laps, by his own line crossings ---------- */

/** Laps from the start (0 at his first crossing, N at the end of lap N), by
 *  time within each lap. Null before the first placed lap. */
export const lapPositionAt = (model: RaceClockModel, atMs: number, totalLaps: number): number | null => {
  const placed = lapAt(model, atMs);
  if (placed) return placed.lap - 1 + (atMs - placed.startMs) / Math.max(1, placed.endMs - placed.startMs);
  const first = placeLap(model, 1);
  if (first && atMs < first.startMs) return 0;
  const last = placeLap(model, totalLaps);
  if (last && atMs >= last.endMs) return totalLaps;
  return null;
};

/** The replay moment for a lap position on the bar. */
export const timeAtLapPosition = (model: RaceClockModel, position: number, totalLaps: number): number | null => {
  const clamped = Math.max(0, Math.min(totalLaps, position));
  const lap = Math.min(totalLaps, Math.floor(clamped) + 1);
  const placed = placeLap(model, lap);
  if (!placed) return null;
  return placed.startMs + (clamped - (lap - 1)) * (placed.endMs - placed.startMs);
};
