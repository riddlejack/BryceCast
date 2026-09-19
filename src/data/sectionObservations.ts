import type { RaceStoryPack } from './raceStory';
import type { SectionLapsPack, SectionLapTuple } from './sectionLaps';
import type { TrackSectionAnchorSet } from '../assets/tracks/sections';

/** Section Intelligence contract (Brief H, adapter-contract law).
 *
 *  The UI reads section pace through THIS interface only. It is sized for the
 *  richest future source — the data lake's per-lap, per-car timing-loop
 *  crossings (millions of rows, real timestamps, selectable lap scopes) — while
 *  v1 is fed by today's parsed-PDF section aggregates surfaced on the
 *  race-story packs. A future source swap fills the same shape (more scopes,
 *  per-section observation counts, absolute section times) with NO UI rework:
 *  add a `sectionObservationsFromLake(...)` producer beside the v1 producer
 *  below; every consumer keeps working.
 *
 *  Editorial law: percentiles are framed as "the field beaten in this stretch",
 *  never as deficits. Nothing here implies more precision than section timing
 *  carries — these are time-based loop-to-loop comparisons, not car position.
 */

/** The window of laps a set summarises. v1 only produces `full_race`; the lake
 *  source will produce lap windows and single laps behind the same contract. */
export type SectionScope =
  | { kind: 'full_race' }
  | { kind: 'lap_window'; label: string; fromLap: number; toLap: number }
  | { kind: 'single_lap'; lap: number };

/** Where a set's numbers came from — surfaced in source drawers / YoY labels. */
export type SectionSourceTier = 'parsed_pdf_aggregate' | 'lake_loop_crossings';

/** How a set's per-section summary statistic is computed over its laps. */
export type SectionStat = 'median' | 'mean';

export interface SectionObservation {
  /** EXACT official section-family string — the join key to the curated track
   *  anchor and the label shown on the map. Never invented. */
  sectionName: string;
  /** 'measured' = a real timing-loop section; 'derived_remainder' = the untimed
   *  stretch(es) whose pace is lap time minus the timed sections (still a real
   *  full-field percentile, just derived rather than loop-measured). */
  kind?: 'measured' | 'derived_remainder';
  /** Bryce's percentile of the field beaten in this section for the scope,
   *  [0,1]. Null when the section exists but carries too few clean laps here
   *  (see observationCount) or no observation at all. */
  percentile: number | null;
  /** Clean-lap comparisons behind this section's percentile. Null when the
   *  source carries only a set-level count (race-story aggregate). */
  observationCount: number | null;
  /** Per-lap clean-lap percentiles inside the scope — the drawer's
   *  distribution strip (the percentile's meaning, shown not told). */
  lapPercentiles?: Array<{ lap: number; percentile: number }>;
  /** Bryce's representative section time in seconds for the scope, computed
   * with the set's `stat` (mean or median). */
  bryceSummarySeconds?: number | null;
  /** Legacy alias retained for aggregate race-story consumers. New per-lap
   * consumers should read `bryceSummarySeconds`. */
  bryceMedianSeconds?: number | null;
  /** Field-median section time, seconds, from the field distribution below. */
  fieldMedianSeconds?: number | null;
  /** Each field car's median clean-lap section time (seconds) across the race —
   *  the quiet field distribution the drawer draws behind Bryce's marker.
   *  Null when the source carries only Bryce's own times. */
  fieldSeconds?: number[] | null;
  /** single_lap scope only: that lap's race-control context. */
  cautionState?: 'green' | 'caution' | 'restart' | 'unknown';
  clean?: boolean;
  /** single_lap scope only: the official row's rank and denominator. */
  fieldRank?: number | null;
  fieldComparisonCount?: number | null;
}

export interface SectionObservationSet {
  sessionId: string;
  venueName: string;
  seasonYear: number | null;
  scope: SectionScope;
  /** The summary statistic behind each section's percentile. */
  stat: SectionStat;
  sections: SectionObservation[];
  /** Set-level count of clean-lap section comparisons (the denominator). */
  comparisonRows: number | null;
  medianPercentile: number | null;
  sourceState: string;
  sourceTier: SectionSourceTier;
  caveat: string;
}

/** v1 producer: transform a race-story pack's section aggregate into the
 *  contract. Ovals report their whole family set in both best+weakest, so the
 *  union recovers every section; road courses (later slice) may cover only the
 *  extremes until the lake lands — that is honest partial coverage, not a bug. */
export const sectionObservationsFromRaceStory = (story: RaceStoryPack): SectionObservationSet | null => {
  const s = story.sections;
  if (!s) return null;
  const byName = new Map<string, number>();
  for (const row of [...s.best, ...s.weakest]) {
    if (row && typeof row.percentile === 'number' && !byName.has(row.name)) {
      byName.set(row.name, row.percentile);
    }
  }
  if (byName.size === 0) return null;
  const sections: SectionObservation[] = [...byName.entries()].map(([sectionName, percentile]) => ({
    sectionName,
    percentile,
    observationCount: null
  }));
  return {
    sessionId: story.sessionId,
    venueName: story.track?.name ?? '',
    seasonYear: story.seasonYear,
    scope: { kind: 'full_race' },
    stat: 'median',
    sections,
    comparisonRows: s.comparisonRows,
    medianPercentile: s.medianPercentile,
    sourceState: s.sourceState,
    sourceTier: 'parsed_pdf_aggregate',
    caveat: s.caveat
  };
};

/* ---------- per-lap producer (the traceable substrate) ---------- */

/** Below this many clean laps a scoped section percentile is suppressed —
 *  shown as "too few clean laps", never as a confident colour. Labeled on
 *  screen wherever it bites. */
export const MIN_CLEAN_LAPS = 8;

/** Scope-aware clean-lap floor. A race-third window is ~1/3 the laps of the
 *  full race and can open under caution, so holding every scope to the
 *  full-race floor of MIN_CLEAN_LAPS left otherwise-real thirds blank (e.g. a
 *  10-15 lap opening third that never reaches 8 green-flag laps). Scale the
 *  floor down with the window instead, clamped to a still-meaningful sample:
 *  never below 4, never above MIN_CLEAN_LAPS. Full race and single-lap scopes
 *  are unaffected. */
export const minimumCleanLapsForScope = (scope: SectionScope): number => {
  if (scope.kind !== 'lap_window') return MIN_CLEAN_LAPS;
  const windowLaps = scope.toLap - scope.fromLap + 1;
  return Math.min(MIN_CLEAN_LAPS, Math.max(4, Math.ceil(windowLaps * 0.4)));
};

export interface SectionAggregationOptions {
  /** Race views require a stable eight-lap sample. A qualifying session is a
   * much shorter population and explicitly opts into one-or-more valid laps. */
  minimumObservations?: number;
  /** Source-appropriate denominator language carried into the source drawer. */
  observationLabel?: string;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const summarize = (values: number[], stat: SectionStat): number =>
  stat === 'mean' ? values.reduce((a, b) => a + b, 0) / values.length : median(values);

const CAUTION_LABEL: Record<string, 'green' | 'caution' | 'restart' | 'unknown'> = {
  g: 'green',
  c: 'caution',
  r: 'restart',
  u: 'unknown'
};

const lapWindowOf = (scope: SectionScope, totalLaps: number): [number, number] =>
  scope.kind === 'full_race'
    ? [1, totalLaps]
    : scope.kind === 'lap_window'
      ? [scope.fromLap, scope.toLap]
      : [scope.lap, scope.lap];

/** The standard scope menu for a race: full race + thirds by lap count.
 *  (The single-lap scrubber is a UI control, not a menu entry.) */
export const lapScopesFor = (totalLaps: number): SectionScope[] => {
  if (totalLaps < 9) return [{ kind: 'full_race' }];
  const firstEnd = Math.floor(totalLaps / 3);
  const middleEnd = Math.floor((2 * totalLaps) / 3);
  return [
    { kind: 'full_race' },
    { kind: 'lap_window', label: 'Opening third', fromLap: 1, toLap: firstEnd },
    { kind: 'lap_window', label: 'Middle third', fromLap: firstEnd + 1, toLap: middleEnd },
    { kind: 'lap_window', label: 'Closing third', fromLap: middleEnd + 1, toLap: totalLaps }
  ];
};

/** Session thirds based on the actual official lap indexes present. This keeps
 * qualifying filters useful when lap numbers have gaps and omits phases for a
 * two-lap oval run where thirds would be meaningless. */
export const lapScopesForObservedLaps = (lapIndexes: number[]): SectionScope[] => {
  const laps = [...new Set(lapIndexes)].sort((left, right) => left - right);
  if (laps.length < 3) return [{ kind: 'full_race' }];
  const firstEndIndex = Math.ceil(laps.length / 3) - 1;
  const middleEndIndex = Math.ceil((laps.length * 2) / 3) - 1;
  return [
    { kind: 'full_race' },
    { kind: 'lap_window', label: 'Opening third', fromLap: laps[0], toLap: laps[firstEndIndex] },
    { kind: 'lap_window', label: 'Middle third', fromLap: laps[firstEndIndex + 1], toLap: laps[middleEndIndex] },
    { kind: 'lap_window', label: 'Closing third', fromLap: laps[middleEndIndex + 1], toLap: laps.at(-1) as number }
  ];
};

/** Keep a lap selector on an actual source lap when a component changes race,
 * session, or source grain. Preferred is normally the official qualifying
 * fastest lap; the first observed lap is the deterministic fallback. */
export const selectableSectionLap = (
  requested: number,
  lapIndexes: number[],
  preferred: number | null = null
): number | null => {
  const laps = [...new Set(lapIndexes)].sort((left, right) => left - right);
  if (laps.includes(requested)) return requested;
  if (preferred !== null && laps.includes(preferred)) return preferred;
  return laps[0] ?? null;
};

/** Per-lap race-control context for the scrubber (caution ticks, clean flags),
 *  from the pack's lap-total rows. */
export const lapContextOf = (
  pack: SectionLapsPack
): Array<{ lap: number; caution: 'green' | 'caution' | 'restart' | 'unknown'; clean: boolean }> =>
  pack.lapTotals
    .filter((tuple): tuple is SectionLapTuple => Array.isArray(tuple) && tuple[0] !== null)
    .map((tuple) => ({
      lap: tuple[0] as number,
      caution: CAUTION_LABEL[tuple[5]] ?? 'unknown',
      clean: tuple[4] === 1
    }));

/** Produce the contract from a per-lap pack for a scope + statistic. Aggregate
 *  scopes use clean green-flag laps only and suppress below MIN_CLEAN_LAPS;
 *  the single-lap scope reports that lap as-is with its caution context. */
export const sectionObservationsFromLaps = (
  pack: SectionLapsPack,
  scope: SectionScope = { kind: 'full_race' },
  stat: SectionStat = 'median',
  options: SectionAggregationOptions = {}
): SectionObservationSet => {
  const minimumObservations = options.minimumObservations ?? minimumCleanLapsForScope(scope);
  const observationLabel = options.observationLabel ?? 'clean green-flag laps';
  const [fromLap, toLap] = lapWindowOf(scope, pack.totalLaps);
  const single = scope.kind === 'single_lap';
  const sections: SectionObservation[] = pack.sections.map(({ sectionName, laps, kind, fieldSeconds }) => {
    /* Field distribution is a whole-race per-car spread; it stays constant as
     * Bryce's scope tick moves across it. Absent for sources without it. */
    const fieldDistribution = fieldSeconds && fieldSeconds.length > 0 ? fieldSeconds : null;
    const fieldMedianSeconds = fieldDistribution ? median(fieldDistribution) : null;
    if (single) {
      const row = laps.find((tuple) => tuple[0] === fromLap) ?? null;
      return {
        sectionName,
        kind: kind ?? 'measured',
        percentile: row ? row[1] : null,
        observationCount: row ? 1 : 0,
        bryceSummarySeconds: row ? row[6] : null,
        bryceMedianSeconds: row ? row[6] : null,
        fieldMedianSeconds,
        fieldSeconds: fieldDistribution,
        cautionState: row ? CAUTION_LABEL[row[5]] ?? 'unknown' : undefined,
        clean: row ? row[4] === 1 : undefined,
        fieldRank: row ? row[2] : null,
        fieldComparisonCount: row ? row[3] : null
      };
    }
    const inWindow = laps.filter(
      (tuple) => tuple[0] !== null && tuple[0] >= fromLap && tuple[0] <= toLap && tuple[4] === 1 && tuple[1] !== null
    );
    const pcts = inWindow.map((tuple) => tuple[1] as number);
    const times = inWindow.map((tuple) => tuple[6]).filter((value): value is number => value !== null);
    return {
      sectionName,
      kind: kind ?? 'measured',
      percentile: pcts.length >= minimumObservations ? summarize(pcts, stat) : null,
      observationCount: pcts.length,
      lapPercentiles: inWindow.map((tuple) => ({ lap: tuple[0] as number, percentile: tuple[1] as number })),
      bryceSummarySeconds: times.length > 0 ? summarize(times, stat) : null,
      bryceMedianSeconds: times.length > 0 ? median(times) : null,
      fieldMedianSeconds,
      fieldSeconds: fieldDistribution
    };
  });
  const allPcts = sections.flatMap((section) => (section.lapPercentiles ?? []).map((point) => point.percentile));
  /* The pack's own source tier flows straight into the set (adapter-contract
   * law): a measured lake pack and a parsed-PDF pack fill this identical shape,
   * so every consumer keeps working — only the tier label and source copy
   * differ downstream. `parsed_pdf_aggregate` stays the default/fallback. */
  const tier: SectionSourceTier = pack.sourceTier ?? 'parsed_pdf_aggregate';
  const measured = tier === 'lake_loop_crossings';
  return {
    sessionId: pack.sessionId,
    venueName: pack.venueName,
    seasonYear: pack.seasonYear,
    scope,
    stat,
    sections,
    comparisonRows: single
      ? sections.reduce((count, section) => count + (section.observationCount ?? 0), 0)
      : allPcts.length,
    medianPercentile: allPcts.length > 0 ? summarize(allPcts, stat) : null,
    sourceState: measured ? 'racetools_capture_loop_crossings_per_lap' : 'official_section_results_per_lap',
    sourceTier: tier,
    caveat: single
      ? 'one lap is one lap — a snapshot, not a trend; caution laps are labeled'
      : `${observationLabel} only; sections under ${minimumObservations} observations in this scope are not compared`
  };
};

/** One curated section span joined to its observation, ready to draw. */
export interface ResolvedHeatSection {
  familyId: string;
  sectionName: string;
  label: string;
  /** Primary span (used for the label + dot midpoint). */
  startT: number;
  endT: number;
  /** Every span this section draws + hit-tests. One for a measured section; two
   *  or more for a derived remainder that spans disjoint untimed stretches. */
  renderSpans: Array<{ startT: number; endT: number }>;
  percentile: number;
  /** 'measured' draws a solid coloured span; 'derived_remainder' draws a
   *  visually distinct dotted span and reads as derived in the tooltip. */
  kind: 'measured' | 'derived_remainder';
  /** A derived remainder whose value combines two or more untimed stretches
   *  (the loops can't separate them yet). Drives the "combined" tooltip note. */
  combined: boolean;
  /** True for Bryce's top-2 MEASURED sections this scope — the gold dots. A
   *  derived remainder is never a top section. */
  isTopSection: boolean;
}

/** Join curated anchors with a set's observations for rendering. Anchors with
 *  no matching observation (or a null percentile) are dropped so the outline
 *  shows the honest base line there rather than a fabricated colour. */
export const resolveHeatSections = (
  anchors: TrackSectionAnchorSet,
  set: SectionObservationSet
): ResolvedHeatSection[] => {
  const byName = new Map(set.sections.map((observation) => [observation.sectionName, observation]));
  const joined = anchors.sections
    .map((anchor) => {
      const observation = byName.get(anchor.sectionName);
      if (!observation || observation.percentile === null) return null;
      const kind: 'measured' | 'derived_remainder' = anchor.kind ?? 'measured';
      const additional = anchor.additionalSpans ?? [];
      return {
        familyId: anchor.familyId,
        sectionName: anchor.sectionName,
        label: anchor.label,
        startT: anchor.startT,
        endT: anchor.endT,
        renderSpans: [{ startT: anchor.startT, endT: anchor.endT }, ...additional],
        percentile: observation.percentile,
        kind,
        combined: kind === 'derived_remainder' && additional.length > 0
      };
    })
    .filter((entry): entry is Omit<ResolvedHeatSection, 'isTopSection'> => entry !== null);

  /* Top-2 by percentile become the gold dots (Brief E) — MEASURED sections
   * only; the derived remainder is a different treatment and never gold. Ties
   * break by the stronger-then-earlier ordering implied by percentile + anchor. */
  const topFamilyIds = new Set(
    joined
      .filter((entry) => entry.kind === 'measured')
      .sort((a, b) => b.percentile - a.percentile)
      .slice(0, 2)
      .map((entry) => entry.familyId)
  );
  return joined.map((entry) => ({ ...entry, isTopSection: topFamilyIds.has(entry.familyId) }));
};
