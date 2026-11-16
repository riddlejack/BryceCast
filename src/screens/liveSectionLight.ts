/**
 * Which timing section Bryce is in, during a replay (round 2 of the site
 * refresh, November 14, 2026).
 *
 * Public timing has no GPS and no car position. What it has is the instant a
 * car crosses each timing loop. Neither the live feed nor the replay archive
 * carries those intermediate crossings (rows carry the lap count and the last
 * lap time; `lapDistance` is zero in every audited NXT record). Two sources do:
 *
 *  - the official Section Results for the race (the `section_laps` pack): for
 *    every lap, Bryce's time through each loop-to-loop section, which tile the
 *    lap exactly (their sum is the lap time to the millisecond on a clean lap);
 *  - the replay archive's lap line crossings: the archived moment Bryce's lap
 *    count steps up, to the archive's ~1 s cadence.
 *
 * Chaining the official lap times from the observed line crossings places
 * every lap's start to within the archive cadence, and the section times then
 * give the moment he crossed each loop inside it. That lights a section, never
 * a point: the page shows "between these two loops", which is what the loops
 * measure. Checked offline against Bryce's gap updates in the archive (which
 * Race Control and RaceTools refresh at each loop): the reconstructed
 * crossings land within one archive frame (median 0.4-0.5 s).
 *
 * Pure and node-testable: no React, no vite-only imports.
 */
import type { TrackOutline } from '../assets/tracks';
import type { TrackSectionAnchor, TrackSectionAnchorSet } from '../assets/tracks/sections/types';
import type { SectionLapsPack } from '../data/sectionLaps';

type Pt = { x: number; y: number };

/** A clean lap's sections must sum to its lap time within this (seconds). */
export const TILE_TOLERANCE_SECONDS = 0.05;
/** A race lights only when at least this share of its laps tile. */
export const MIN_TILED_LAP_SHARE = 0.5;
/** A lap-line crossing observed across a wider bracket than this is not used. */
export const MAX_BOUNDARY_BRACKET_MS = 3_000;

/* ---------- outline geometry ---------- */

export const parseOutlinePoints = (d: string): Pt[] => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

export interface OutlineGeometry {
  points: Pt[];
  /** Cumulative arc length at each vertex (closed: n + 1 entries). */
  cum: number[];
  total: number;
  pointAtT: (t: number) => Pt;
  /** Nearest arc-length fraction for a point. */
  tOfPoint: (p: Pt) => number;
}

export const outlineGeometry = (mainPath: string): OutlineGeometry => {
  const points = parseOutlinePoints(mainPath);
  const n = points.length;
  const cum = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cum[n] || 1;
  const pointAtT = (t: number): Pt => {
    const d = (((t % 1) + 1) % 1) * total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo % n];
    const b = points[(lo + 1) % n];
    const seg = cum[lo + 1] - cum[lo] || 1;
    const f = (d - cum[lo]) / seg;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const tOfPoint = (p: Pt): number => {
    let best = Infinity;
    let bestD = 0;
    for (let i = 0; i < n; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const x = a.x + dx * f;
      const y = a.y + dy * f;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < best) {
        best = dist;
        bestD = cum[i] + (cum[i + 1] - cum[i]) * f;
      }
    }
    return bestD / total;
  };
  return { points, cum, total, pointAtT, tOfPoint };
};

const circularGap = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 1) + 1) % 1);
  return Math.min(d, 1 - d);
};

/* ---------- the section chain, in driving order from the line ---------- */

/** The measured sections in driving order, starting with the one that leaves
 *  the start/finish line. Null when the anchors don't form one closed chain
 *  from the line (then the lap's phase is unknown and nothing lights). */
export const sectionChainFor = (set: TrackSectionAnchorSet, outline: TrackOutline | null): TrackSectionAnchor[] | null => {
  const measured = set.sections.filter((section) => section.kind !== 'derived_remainder');
  if (measured.length === 0) return null;
  let first = measured.find((section) => section.startLoop === 'SF') ?? null;
  if (!first && outline?.startFinish) {
    const sfT = outlineGeometry(outline.mainPath).tOfPoint(outline.startFinish);
    const nearest = [...measured].sort((a, b) => circularGap(a.startT, sfT) - circularGap(b.startT, sfT))[0];
    if (nearest && circularGap(nearest.startT, sfT) <= 0.02) first = nearest;
  }
  if (!first) return null;
  const chain = [first];
  while (chain.length < measured.length) {
    const tail = chain[chain.length - 1];
    const next = measured.find((section) => !chain.includes(section) && circularGap(section.startT, tail.endT) < 0.002);
    if (!next) return null;
    chain.push(next);
  }
  // Closed: the last section ends where the first begins.
  if (circularGap(chain[chain.length - 1].endT, first.startT) >= 0.002) return null;
  return chain;
};

/* ---------- the plan for one race ---------- */

export interface SectionLightLap {
  lap: number;
  lapSeconds: number;
  /** Section times in chain order, or null when this lap does not tile. */
  sectionSeconds: number[] | null;
}

export interface SectionLightPlan {
  usable: boolean;
  /** Why it is not usable (shown nowhere; reported in data attributes). */
  reason: string | null;
  chain: TrackSectionAnchor[];
  laps: Map<number, SectionLightLap>;
  /** Laps whose sections tile, over the race's laps. */
  tiledShare: number;
  /** Cumulative seconds to the end of each lap from its segment's base line
   *  crossing; a missing lap time starts a new segment. */
  segmentOf: Map<number, number>;
  cumulative: Map<number, number>;
}

const unusable = (reason: string, chain: TrackSectionAnchor[] = []): SectionLightPlan => ({
  usable: false,
  reason,
  chain,
  laps: new Map(),
  tiledShare: 0,
  segmentOf: new Map(),
  cumulative: new Map()
});

/** Pick the anchor set the pack's section names join, from the candidates in
 *  order (the pack's own tier first). */
export const anchorSetForPack = (
  pack: SectionLapsPack,
  candidates: Array<TrackSectionAnchorSet | null | undefined>
): TrackSectionAnchorSet | null => {
  const names = pack.sections.filter((section) => section.kind !== 'derived_remainder').map((section) => section.sectionName);
  for (const set of candidates) {
    if (!set) continue;
    const measured = new Set(set.sections.filter((section) => section.kind !== 'derived_remainder').map((section) => section.sectionName));
    if (names.length === measured.size && names.every((name) => measured.has(name))) return set;
  }
  return null;
};

/** Segments: runs of consecutive laps with a lap time. Segment k's base is
 *  the line crossing that starts its first lap. */
const segmentsOf = (laps: Map<number, SectionLightLap>, totalLaps: number) => {
  const segmentOf = new Map<number, number>();
  const cumulative = new Map<number, number>();
  let segment = 0;
  let running = 0;
  let open = false;
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const entry = laps.get(lap);
    if (!entry) {
      open = false;
      continue;
    }
    if (!open) {
      segment += 1;
      running = 0;
      open = true;
      // The base crossing itself: the end of the previous lap (lap - 1).
      segmentOf.set(-(lap - 1) - 1, segment);
    }
    running += entry.lapSeconds;
    segmentOf.set(lap, segment);
    cumulative.set(lap, running);
  }
  return { segmentOf, cumulative };
};

export const buildSectionLightPlan = (
  pack: SectionLapsPack,
  set: TrackSectionAnchorSet | null,
  outline: TrackOutline | null
): SectionLightPlan => {
  if (!set) return unusable('no anchor set joins this race’s section names');
  if (pack.derivedCoverage === 'genuine_gap') return unusable('the timed sections leave part of the lap untimed');
  const chain = sectionChainFor(set, outline);
  if (!chain) return unusable('the sections do not form one chain from the line');
  const lapTotal = new Map<number, number>();
  for (const tuple of pack.lapTotals) {
    const [lap, , , , , , seconds] = tuple;
    if (lap !== null && seconds !== null && seconds > 0) lapTotal.set(lap, seconds);
  }
  const byName = new Map(pack.sections.map((section) => [section.sectionName, section]));
  const laps = new Map<number, SectionLightLap>();
  let tiled = 0;
  for (let lap = 1; lap <= pack.totalLaps; lap += 1) {
    const lapSeconds = lapTotal.get(lap);
    if (lapSeconds === undefined) continue;
    let sectionSeconds: number[] | null = [];
    for (const anchor of chain) {
      const time = byName.get(anchor.sectionName)?.laps.find((tuple) => tuple[0] === lap)?.[6] ?? null;
      if (time === null || !(time > 0)) {
        sectionSeconds = null;
        break;
      }
      sectionSeconds.push(time);
    }
    if (sectionSeconds) {
      const sum = sectionSeconds.reduce((total, value) => total + value, 0);
      if (Math.abs(sum - lapSeconds) > TILE_TOLERANCE_SECONDS) sectionSeconds = null;
    }
    if (sectionSeconds) tiled += 1;
    laps.set(lap, { lap, lapSeconds, sectionSeconds });
  }
  const tiledShare = pack.totalLaps > 0 ? tiled / pack.totalLaps : 0;
  const { segmentOf, cumulative } = segmentsOf(laps, pack.totalLaps);
  if (tiledShare < MIN_TILED_LAP_SHARE) {
    return { ...unusable(`only ${tiled} of ${pack.totalLaps} laps have section times that add up to the lap`, chain), laps, tiledShare, segmentOf, cumulative };
  }
  return { usable: true, reason: null, chain, laps, tiledShare, segmentOf, cumulative };
};

/* ---------- the other cars (round 6, Jack's review of November 16) ----------
 *
 * The same pack carries the other cars lap by lap (`otherCarLaps`): one row per
 * car, one cell per lap of that car's own race, each its clean green-flag time
 * through the section or null. The rows carry no car number, so a row is joined
 * to a car the way the timing itself allows: the official section times of a
 * clean lap add up to that lap's time exactly, and the archive publishes every
 * car's lap time as it crosses the line. A row becomes car N when, on some lap,
 * exactly one car's lap time equals the row's sum for that lap and no other row
 * claims it (checked offline on every watchable 2024-2026 race with a pack: the
 * sums equal the feed's lap times to the millisecond, and 42 of 47 races join
 * every row). Then its loop crossings are placed exactly as Bryce's are: the
 * observed line crossing, plus the section times.
 *
 * Only clean green-flag laps carry the field's section times, so under caution,
 * on a pit lap or before a car's first clean lap there is nothing to place it
 * by, and that car has no dot. */

/** A row's lap must equal a car's lap time within this to join them (s). */
export const LAP_MATCH_TOLERANCE_SECONDS = 0.002;
/** A joined row is dropped if a later lap disagrees by more than this (s). */
export const LAP_MISMATCH_SECONDS = 0.02;

export interface FieldRowPlan extends SectionLightPlan {
  row: number;
  /** The row's lap time on each clean lap: the sum of its section times. */
  lapSum: Map<number, number>;
}

export interface FieldPlan {
  usable: boolean;
  reason: string | null;
  rows: FieldRowPlan[];
}

/** One plan per other-car row, in the chain's order. Unusable when the race
 *  carries no field rows, or the sections disagree on how many rows there are
 *  (a car left out of one section shifts every row after it, so no row could
 *  be trusted to be one car). */
export const buildFieldPlan = (pack: SectionLapsPack, bryce: SectionLightPlan): FieldPlan => {
  if (!bryce.usable || bryce.chain.length === 0) return { usable: false, reason: 'no section chain for this race', rows: [] };
  const byName = new Map(pack.sections.map((section) => [section.sectionName, section]));
  const columns = bryce.chain.map((anchor) => byName.get(anchor.sectionName)?.otherCarLaps ?? null);
  if (columns.some((column) => !column || column.length === 0)) {
    return { usable: false, reason: 'this race’s section times do not carry the other cars', rows: [] };
  }
  const counts = new Set(columns.map((column) => column!.length));
  if (counts.size !== 1) return { usable: false, reason: 'the sections disagree on how many other cars they carry', rows: [] };
  const rowCount = columns[0]!.length;
  const rows: FieldRowPlan[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const laps = new Map<number, SectionLightLap>();
    const lapSum = new Map<number, number>();
    for (let lap = 1; lap <= pack.totalLaps; lap += 1) {
      const sectionSeconds: number[] = [];
      for (const column of columns) {
        const time = column![row]?.[lap - 1] ?? null;
        if (time === null || !(time > 0)) break;
        sectionSeconds.push(time);
      }
      if (sectionSeconds.length !== columns.length) continue;
      const lapSeconds = sectionSeconds.reduce((total, value) => total + value, 0);
      laps.set(lap, { lap, lapSeconds, sectionSeconds });
      lapSum.set(lap, lapSeconds);
    }
    const { segmentOf, cumulative } = segmentsOf(laps, pack.totalLaps);
    rows.push({
      usable: laps.size > 0,
      reason: laps.size > 0 ? null : 'no clean lap',
      chain: bryce.chain,
      laps,
      tiledShare: pack.totalLaps > 0 ? laps.size / pack.totalLaps : 0,
      segmentOf,
      cumulative,
      row,
      lapSum
    });
  }
  return { usable: true, reason: null, rows };
};

/** "1:17.8725" or "77.8725" → seconds; null for anything else. */
export const lapTimeSeconds = (value: unknown): number | null => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const seconds = (match[1] ? Number(match[1]) * 60 : 0) + Number(match[2]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/** Every car's published lap time per lap, from the samples seen so far: the
 *  row's `lastLapTime` while its lap count reads that lap (the newest sample
 *  wins). Merged into `kept`, which outlives the trimmed history window.
 *  Returns whether anything new arrived. */
export const mergeObservedLapTimes = (
  kept: Map<string, Map<number, number>>,
  samples: CrossingSample[],
  idOf: (row: Record<string, unknown>) => string
): boolean => {
  let changed = false;
  for (const sample of samples) {
    for (const row of sample.rows) {
      const laps = lapsOf(row);
      const seconds = lapTimeSeconds(row.lastLapTime);
      if (laps === null || laps < 1 || seconds === null) continue;
      const id = idOf(row);
      if (!id) continue;
      let byLap = kept.get(id);
      if (!byLap) {
        byLap = new Map();
        kept.set(id, byLap);
      }
      if (byLap.get(laps) !== seconds) {
        byLap.set(laps, seconds);
        changed = true;
      }
    }
  }
  return changed;
};

/** Join rows to cars by lap time (see above). `current` is kept unless a
 *  later lap contradicts it. Bryce is never a candidate (the rows leave him
 *  out). Returns car id → row index. */
export const matchFieldRows = (
  field: FieldPlan,
  observed: Map<string, Map<number, number>>,
  current: Map<string, number>,
  bryceId: string
): Map<string, number> => {
  const matches = new Map<string, number>();
  if (!field.usable) return matches;
  const contradicts = (plan: FieldRowPlan, times: Map<number, number>) => {
    for (const [lap, seconds] of times) {
      const sum = plan.lapSum.get(lap);
      if (sum !== undefined && Math.abs(sum - seconds) > LAP_MISMATCH_SECONDS) return true;
    }
    return false;
  };
  for (const [id, row] of current) {
    const plan = field.rows[row];
    const times = observed.get(id);
    if (plan && times && !contradicts(plan, times)) matches.set(id, row);
  }
  const takenRows = new Set(matches.values());
  let progress = true;
  while (progress) {
    progress = false;
    for (const plan of field.rows) {
      if (takenRows.has(plan.row)) continue;
      for (const [lap, sum] of plan.lapSum) {
        const cars: string[] = [];
        for (const [id, times] of observed) {
          if (id === bryceId || matches.has(id)) continue;
          const seconds = times.get(lap);
          if (seconds !== undefined && Math.abs(seconds - sum) <= LAP_MATCH_TOLERANCE_SECONDS) cars.push(id);
        }
        if (cars.length !== 1 || contradicts(plan, observed.get(cars[0])!)) continue;
        const seconds = observed.get(cars[0])!.get(lap)!;
        const rivals = field.rows.filter(
          (other) => other.row !== plan.row && !takenRows.has(other.row) && Math.abs((other.lapSum.get(lap) ?? Infinity) - seconds) <= LAP_MATCH_TOLERANCE_SECONDS
        );
        if (rivals.length > 0) continue;
        matches.set(cars[0], plan.row);
        takenRows.add(plan.row);
        progress = true;
        break;
      }
    }
  }
  return matches;
};

/** Lap-line crossings for every car at once (as `lapLineCrossingsFrom` does
 *  for Bryce), merged into `kept` per car, tightest bracket per lap. Returns
 *  whether anything tightened. */
export const mergeFieldLapLineCrossings = (
  kept: Map<string, Map<number, LapLineCrossing>>,
  samples: CrossingSample[],
  idOf: (row: Record<string, unknown>) => string
): boolean => {
  let changed = false;
  const previous = new Map<string, { at: number; laps: number }>();
  for (const sample of samples) {
    const seen = new Set<string>();
    for (const row of sample.rows) {
      const id = idOf(row);
      if (!id) continue;
      seen.add(id);
      const laps = lapsOf(row);
      if (laps === null) {
        previous.delete(id);
        continue;
      }
      const before = previous.get(id);
      if (before && laps === before.laps + 1 && sample.checkedAtMs > before.at) {
        let byLap = kept.get(id);
        if (!byLap) {
          byLap = new Map();
          kept.set(id, byLap);
        }
        if (mergeLapLineCrossings(byLap, [{ lap: laps, afterMs: before.at, atOrBeforeMs: sample.checkedAtMs }])) changed = true;
      }
      previous.set(id, { at: sample.checkedAtMs, laps });
    }
    // A car missing from a sample breaks its bracket, as a null lap count does.
    for (const id of [...previous.keys()]) if (!seen.has(id)) previous.delete(id);
  }
  return changed;
};

/* ---------- where a dot goes ---------- */

/** How a car's dot is placed. `loops` (the default): at the last timing loop
 *  it crossed, moving loop to loop. `glide`: through its current section by
 *  time between its two crossings (an even pace assumed between two measured
 *  moments; behind `?dots=glide`). */
export type DotMode = 'loops' | 'glide';

/** The arc parameter of a dot in a section, for the mode. */
export const dotT = (lit: LitSection, atMs: number, mode: DotMode): number => {
  const { startT, endT } = lit.anchor;
  if (mode === 'loops') return startT;
  const span = lit.leavesAtMs - lit.enteredAtMs;
  const share = span > 0 ? Math.max(0, Math.min(1, (atMs - lit.enteredAtMs) / span)) : 0;
  return (startT + spanLength(startT, endT) * share) % 1;
};

const spanLength = (start: number, end: number) => (end >= start ? end - start : 1 - start + end);

/* ---------- placing the laps on the archive clock ---------- */

/** Bryce completed lap `lap` somewhere in (afterMs, atOrBeforeMs]. */
export interface LapLineCrossing {
  lap: number;
  afterMs: number;
  atOrBeforeMs: number;
}

/** Segment and cumulative seconds for the line crossing at the END of `lap`
 *  (lap 0 = the start). Null when that crossing has no place in a segment. */
const crossingOffset = (plan: SectionLightPlan, lap: number): { segment: number; seconds: number } | null => {
  const asEnd = plan.segmentOf.get(lap);
  if (asEnd !== undefined) return { segment: asEnd, seconds: plan.cumulative.get(lap) ?? 0 };
  const asBase = plan.segmentOf.get(-lap - 1);
  if (asBase !== undefined) return { segment: asBase, seconds: 0 };
  return null;
};

/** Each segment's base line crossing (epoch ms), from the observed lap-line
 *  crossings. The brackets are intersected; when they disagree (archive
 *  jitter), the median of their midpoints stands. */
export const segmentBases = (plan: SectionLightPlan, crossings: LapLineCrossing[]): Map<number, number> => {
  const bySegment = new Map<number, Array<{ lo: number; hi: number }>>();
  for (const crossing of crossings) {
    if (crossing.atOrBeforeMs - crossing.afterMs > MAX_BOUNDARY_BRACKET_MS || crossing.atOrBeforeMs <= crossing.afterMs) continue;
    const offset = crossingOffset(plan, crossing.lap);
    if (!offset) continue;
    const list = bySegment.get(offset.segment) ?? [];
    list.push({ lo: crossing.afterMs - offset.seconds * 1000, hi: crossing.atOrBeforeMs - offset.seconds * 1000 });
    bySegment.set(offset.segment, list);
  }
  const bases = new Map<number, number>();
  for (const [segment, list] of bySegment) {
    const lo = Math.max(...list.map((item) => item.lo));
    const hi = Math.min(...list.map((item) => item.hi));
    if (lo <= hi) {
      bases.set(segment, (lo + hi) / 2);
    } else {
      const mids = list.map((item) => (item.lo + item.hi) / 2).sort((a, b) => a - b);
      bases.set(segment, mids[mids.length >> 1]);
    }
  }
  return bases;
};

export interface LitSection {
  index: number;
  anchor: TrackSectionAnchor;
  lap: number;
  enteredAtMs: number;
  leavesAtMs: number;
}

/** The section Bryce is in at `atMs`, or null (no tiled lap there, or no
 *  observed line crossing to place it). */
export const sectionAt = (plan: SectionLightPlan, bases: Map<number, number>, atMs: number): LitSection | null => {
  if (!plan.usable) return null;
  for (const [lap, entry] of plan.laps) {
    const segment = plan.segmentOf.get(lap);
    if (segment === undefined) continue;
    const base = bases.get(segment);
    if (base === undefined) continue;
    const endMs = base + (plan.cumulative.get(lap) ?? 0) * 1000;
    const startMs = endMs - entry.lapSeconds * 1000;
    if (atMs < startMs || atMs >= endMs) continue;
    if (!entry.sectionSeconds) return null;
    let cursor = startMs;
    for (let index = 0; index < plan.chain.length; index += 1) {
      const next = cursor + entry.sectionSeconds[index] * 1000;
      if (atMs < next) return { index, anchor: plan.chain[index], lap, enteredAtMs: cursor, leavesAtMs: next };
      cursor = next;
    }
    return null;
  }
  return null;
};

/* ---------- reading line crossings from the session history ---------- */

interface CrossingSample {
  checkedAtMs: number;
  rows: Array<Record<string, unknown>>;
  bryceId: string;
}

const lapsOf = (row: Record<string, unknown> | undefined): number | null => {
  if (!row) return null;
  const value = Number(row.laps);
  return Number.isFinite(value) && String(row.laps ?? '').trim() !== '' ? value : null;
};

/** Lap-line crossings bracketed by consecutive samples where Bryce's lap
 *  count steps up by one. `idOf` resolves a row's stable driver id. */
export const lapLineCrossingsFrom = (
  samples: CrossingSample[],
  idOf: (row: Record<string, unknown>) => string
): LapLineCrossing[] => {
  const crossings: LapLineCrossing[] = [];
  let previous: { at: number; laps: number } | null = null;
  for (const sample of samples) {
    const bryce = sample.rows.find((row) => idOf(row) === sample.bryceId);
    const laps = lapsOf(bryce);
    if (laps === null) {
      previous = null;
      continue;
    }
    if (previous && laps === previous.laps + 1 && sample.checkedAtMs > previous.at) {
      crossings.push({ lap: laps, afterMs: previous.at, atOrBeforeMs: sample.checkedAtMs });
    }
    previous = { at: sample.checkedAtMs, laps };
  }
  return crossings;
};

/** Merge newly seen crossings into a kept set, keeping the tightest bracket
 *  per lap (the history window trims old samples; the kept set does not). */
export const mergeLapLineCrossings = (kept: Map<number, LapLineCrossing>, incoming: LapLineCrossing[]): boolean => {
  let changed = false;
  for (const crossing of incoming) {
    const current = kept.get(crossing.lap);
    if (!current || crossing.atOrBeforeMs - crossing.afterMs < current.atOrBeforeMs - current.afterMs) {
      kept.set(crossing.lap, crossing);
      changed = true;
    }
  }
  return changed;
};

/** A readable name for a section: its curated label when that names a corner
 *  or a straight, otherwise its place in the lap ("section 5 of 22"), never a
 *  bare loop code. */
export const isNamedSectionLabel = (label: string): boolean =>
  /^(turns?\b|corkscrew|back ?stretch|back straight|front ?stretch)/i.test(label.trim()) && !label.includes('→');

export const sectionDisplayName = (anchor: TrackSectionAnchor, index: number, count: number): string =>
  isNamedSectionLabel(anchor.label) ? anchor.label : `Section ${index + 1} of ${count}`;
