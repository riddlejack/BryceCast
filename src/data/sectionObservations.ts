import type { RaceStoryPack } from './raceStory';
import type { SectionLapsPack, SectionLapTuple } from './sectionLaps';
import {
  measuredTrackSectionsFor,
  trackSectionsFor,
  type TrackSectionAnchorSet
} from '../assets/tracks/sections';

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

/** ONE floor, for every aggregate scope: below this many clean green-flag laps
 *  a section percentile is suppressed — shown as "too few clean laps", never as
 *  a confident colour. Labeled on screen wherever it bites.
 *
 *  Three is the smallest sample a median can honestly summarise, and it is
 *  exactly what the thirds menu below guarantees per third — so every scope the
 *  UI offers has something real to draw. The retired alternative was a
 *  scope-scaled floor, min(8, max(4, ceil(windowLaps * 0.4))): it was computed
 *  from the window's LAP COUNT rather than from the clean laps actually inside
 *  it, so a third that opened under caution was held to a floor its clean
 *  sample could never reach and rendered blank. The full-race floor of 8 had
 *  the same failure at the other end (a caution-heavy race with seven clean
 *  laps drew nothing at all), so both collapse into this single number. */
export const MIN_CLEAN_LAPS = 3;

/** Every third must clear the floor, so a race needs three floors' worth of
 *  clean laps before thirds are worth offering at all. */
export const MIN_CLEAN_LAPS_FOR_THIRDS = MIN_CLEAN_LAPS * 3;

export interface SectionAggregationOptions {
  /** Race views hold to MIN_CLEAN_LAPS. A qualifying session is a much shorter
   * population and explicitly opts into one-or-more valid laps. */
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

/** The laps that can actually carry colour: a lap where at least one section
 *  holds a clean green-flag row WITH a field percentile. This — not the raw lap
 *  count, and not race control's clean flag on its own — is the population the
 *  thirds below split, because it is precisely the evidence the map draws from
 *  (a lap can run green and still carry no section row at all).
 *
 *  Keyed on the pack's union rather than on any one section: across the shipped
 *  corpus no single section's clean-lap set differs from this union by more
 *  than two laps, so a union-balanced third is balanced for every section drawn
 *  inside it, and `lapScopesForPack` confirms that per section before offering
 *  the control. */
export const cleanSectionLapsOf = (pack: SectionLapsPack): number[] => {
  const laps = new Set<number>();
  for (const section of pack.sections) {
    for (const tuple of section.laps) {
      if (tuple[0] !== null && tuple[4] === 1 && tuple[1] !== null) laps.add(tuple[0]);
    }
  }
  return [...laps].sort((left, right) => left - right);
};

/** Count a section's clean, percentile-carrying laps inside a lap window. */
const cleanLapsInWindow = (
  laps: SectionLapTuple[],
  fromLap: number,
  toLap: number
): number =>
  laps.filter(
    (tuple) => tuple[0] !== null && tuple[0] >= fromLap && tuple[0] <= toLap && tuple[4] === 1 && tuple[1] !== null
  ).length;

/** Split clean laps into three contiguous groups whose sizes differ by at most
 *  one (the remainder goes to the earlier groups), then label each group by the
 *  lap range it actually spans.
 *
 *  Boundary rule — one rule, stated once: a third starts on its own first clean
 *  lap (the opening third starts at lap 1) and runs through the lap BEFORE the
 *  next third's first clean lap (the closing third runs to the final lap). The
 *  three ranges therefore tile [1, totalLaps] with no gap and no overlap, and
 *  each range contains exactly its own group's clean laps — the caution laps
 *  between two groups simply ride along with the earlier one. */
export const thirdLapWindows = (
  cleanLaps: number[],
  totalLaps: number
): Array<Extract<SectionScope, { kind: 'lap_window' }>> => {
  const laps = [...new Set(cleanLaps)].sort((left, right) => left - right);
  if (laps.length < 3) return [];
  const base = Math.floor(laps.length / 3);
  const remainder = laps.length % 3;
  const sizes = [base + (remainder > 0 ? 1 : 0), base + (remainder > 1 ? 1 : 0), base];
  const starts = [laps[0], laps[sizes[0]], laps[sizes[0] + sizes[1]]];
  /* The last range always reaches the end of the race, even in the (unseen)
   * case of a pack whose final clean lap sits past its stated total. */
  const lastLap = Math.max(totalLaps, laps[laps.length - 1]);
  return (['Opening third', 'Middle third', 'Closing third'] as const).map((label, index) => ({
    kind: 'lap_window' as const,
    label,
    fromLap: index === 0 ? 1 : starts[index],
    toLap: index === 2 ? lastLap : starts[index + 1] - 1
  }));
};

/** The standard scope menu for a race: all laps, plus thirds that are equal
 *  shares of the race's CLEAN laps rather than of its lap count. Splitting by
 *  raw lap index starved whichever window a caution cluster landed in (Laguna
 *  Seca 2026 R1 split 11/3/8 clean laps and its middle third drew nothing);
 *  splitting the clean laps themselves moves the boundaries instead.
 *
 *  A race that cannot fill three thirds is simply not offered the control — the
 *  card says so in one quiet line rather than handing the reader an empty map.
 *  (The single-lap scrubber is a UI control, not a menu entry.) */
export const lapScopesForPack = (pack: SectionLapsPack): SectionScope[] => {
  const cleanLaps = cleanSectionLapsOf(pack);
  if (cleanLaps.length < MIN_CLEAN_LAPS_FOR_THIRDS) return [{ kind: 'full_race' }];
  const windows = thirdLapWindows(cleanLaps, pack.totalLaps);
  /* Balance is measured on the union of clean laps; the floor bites per
   * section, so confirm at least one section can really shade in every third
   * before the control is offered. */
  const everyThirdDraws = windows.every((window) =>
    pack.sections.some((section) => cleanLapsInWindow(section.laps, window.fromLap, window.toLap) >= MIN_CLEAN_LAPS)
  );
  return everyThirdDraws ? [{ kind: 'full_race' }, ...windows] : [{ kind: 'full_race' }];
};

/** Lap-count thirds for a caller with no per-lap pack to read — every lap
 *  counted clean, which makes this the degenerate case of `lapScopesForPack`
 *  (identical output when a race runs green throughout). The production path
 *  for a race is `lapScopesForPack`. */
export const lapScopesFor = (totalLaps: number): SectionScope[] => {
  if (totalLaps < MIN_CLEAN_LAPS_FOR_THIRDS) return [{ kind: 'full_race' }];
  const everyLap = Array.from({ length: totalLaps }, (_, index) => index + 1);
  return [{ kind: 'full_race' }, ...thirdLapWindows(everyLap, totalLaps)];
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
  const minimumObservations = options.minimumObservations ?? MIN_CLEAN_LAPS;
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

/** The anchor set a PACK joins against, resolved from that pack's own source
 *  tier: a measured lake pack keeps the venue's finer measured tiling, a
 *  PDF-tier pack keeps the venue's curated PDF anchors, and anything else falls
 *  back to the caller's set. Anchors are a per-visit property, never a
 *  per-venue one — a venue-wide all-or-nothing choice is what joined
 *  Nashville's measured 2024/2025 packs against PDF anchor names and left the
 *  venue page blank at every scope. Every surface that draws a pack (race page,
 *  venue page, Tracks, the year-over-year shapes, the hero shading) resolves
 *  through here. */
export const anchorsForPack = (
  pack: SectionLapsPack,
  fallback: TrackSectionAnchorSet
): TrackSectionAnchorSet => {
  if (pack.sourceTier === 'lake_loop_crossings') return measuredTrackSectionsFor(pack.venueName) ?? fallback;
  const pdf = trackSectionsFor(pack.venueName);
  return pdf && pdf.confidence === 'anchored' ? pdf : fallback;
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
