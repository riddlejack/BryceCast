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
 * give the moment he crossed each loop inside it (round 7: liveMarker.ts places
 * him between those crossings by time, never as a measured position). Checked offline against Bryce's gap updates in the archive (which
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
  /** A clean green-flag lap in the official timing (the pace basis). */
  clean: boolean;
  /** The official flag state of the lap: green, caution, restart, unknown. */
  flag: 'g' | 'c' | 'r' | 'u';
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
  const lapState = new Map<number, { clean: boolean; flag: SectionLightLap['flag'] }>();
  for (const tuple of pack.lapTotals) {
    const [lap, , , , clean, flag, seconds] = tuple;
    if (lap !== null && seconds !== null && seconds > 0) {
      lapTotal.set(lap, seconds);
      lapState.set(lap, { clean: clean === 1, flag: flag ?? 'u' });
    }
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
    const state = lapState.get(lap) ?? { clean: false, flag: 'u' as const };
    laps.set(lap, { lap, lapSeconds, sectionSeconds, clean: state.clean && Boolean(sectionSeconds), flag: state.flag });
  }
  const tiledShare = pack.totalLaps > 0 ? tiled / pack.totalLaps : 0;
  const { segmentOf, cumulative } = segmentsOf(laps, pack.totalLaps);
  if (tiledShare < MIN_TILED_LAP_SHARE) {
    return { ...unusable(`only ${tiled} of ${pack.totalLaps} laps have section times that add up to the lap`, chain), laps, tiledShare, segmentOf, cumulative };
  }
  return { usable: true, reason: null, chain, laps, tiledShare, segmentOf, cumulative };
};

/** "1:17.8725" or "77.8725" → seconds; null for anything else. */
export const lapTimeSeconds = (value: unknown): number | null => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const seconds = (match[1] ? Number(match[1]) * 60 : 0) + Number(match[2]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/** A readable name for a section: its curated label when that names a corner
 *  or a straight, otherwise its place in the lap ("section 5 of 22"), never a
 *  bare loop code. */
export const isNamedSectionLabel = (label: string): boolean =>
  /^(turns?\b|corkscrew|back ?stretch|back straight|front ?stretch)/i.test(label.trim()) && !label.includes('→');

export const sectionDisplayName = (anchor: TrackSectionAnchor, index: number, count: number): string =>
  isNamedSectionLabel(anchor.label) ? anchor.label : `Section ${index + 1} of ${count}`;
