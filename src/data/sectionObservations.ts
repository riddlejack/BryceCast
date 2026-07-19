import type { RaceStoryPack } from './raceStory';
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

export interface SectionObservation {
  /** EXACT official section-family string — the join key to the curated track
   *  anchor and the label shown on the map. Never invented. */
  sectionName: string;
  /** Bryce's percentile of the field beaten in this section for the scope,
   *  [0,1]. Null when the section exists but carries no observation here. */
  percentile: number | null;
  /** Clean-lap comparisons behind this section's percentile. Null in v1 (the
   *  race-story pack carries only a set-level count); the lake fills it. */
  observationCount: number | null;
  /** Bryce's representative section time, seconds. Null in v1; lake fills it. */
  bryceMedianSeconds?: number | null;
  /** Field-median section time, seconds. Null in v1; lake fills it. */
  fieldMedianSeconds?: number | null;
}

export interface SectionObservationSet {
  sessionId: string;
  venueName: string;
  seasonYear: number | null;
  scope: SectionScope;
  sections: SectionObservation[];
  /** Set-level count of clean-lap section comparisons (the v1 denominator). */
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
    sections,
    comparisonRows: s.comparisonRows,
    medianPercentile: s.medianPercentile,
    sourceState: s.sourceState,
    sourceTier: 'parsed_pdf_aggregate',
    caveat: s.caveat
  };
};

/** One curated section span joined to its observation, ready to draw. */
export interface ResolvedHeatSection {
  familyId: string;
  sectionName: string;
  label: string;
  startT: number;
  endT: number;
  percentile: number;
  /** True for Bryce's top-2 sections this scope — the gold dots. */
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
      return {
        familyId: anchor.familyId,
        sectionName: anchor.sectionName,
        label: anchor.label,
        startT: anchor.startT,
        endT: anchor.endT,
        percentile: observation.percentile
      };
    })
    .filter((entry): entry is Omit<ResolvedHeatSection, 'isTopSection'> => entry !== null);

  /* Top-2 by percentile become the gold dots (Brief E). Ties break by the
   * stronger-then-earlier ordering already implied by percentile + anchor. */
  const topFamilyIds = new Set(
    [...joined]
      .sort((a, b) => b.percentile - a.percentile)
      .slice(0, 2)
      .map((entry) => entry.familyId)
  );
  return joined.map((entry) => ({ ...entry, isTopSection: topFamilyIds.has(entry.familyId) }));
};
