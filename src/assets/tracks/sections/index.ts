import type { TrackSectionAnchor, TrackSectionAnchorSet } from './types';
import { nashvilleSuperspeedwaySections, nashvilleSuperspeedwayMeasuredSections } from './nashville-superspeedway';
import { worldWideTechnologyRacewaySections } from './world-wide-technology-raceway';
import { iowaSpeedwaySections } from './iowa-speedway';
import { theMilwaukeeMileSections } from './the-milwaukee-mile';
import { roadAmericaSections } from './road-america';
import { barberMotorsportsParkSections } from './barber-motorsports-park';
import { portlandInternationalRacewaySections } from './portland-international-raceway';
import { weathertechRacewayLagunaSecaSections } from './weathertech-raceway-laguna-seca';
import { midOhioSportsCarCourseSections } from './mid-ohio-sports-car-course';

/** Curated section anchors, keyed to the OSM track outlines in the parent
 *  directory. Ovals first (Brief E sequencing), then the road courses (Phase 3):
 *  Road America, Barber, Portland, Laguna Seca — loop-to-loop families anchored
 *  from the data lake map catalog's decoded LapDistance; Mid-Ohio chain-fitted
 *  with no lake loop distances. See ./types.ts for the adapter-contract note on
 *  measured loop locations superseding this curation. */

export type { TrackSectionAnchor, TrackSectionAnchorSet } from './types';

const sets: TrackSectionAnchorSet[] = [
  nashvilleSuperspeedwaySections,
  worldWideTechnologyRacewaySections,
  iowaSpeedwaySections,
  theMilwaukeeMileSections,
  roadAmericaSections,
  barberMotorsportsParkSections,
  portlandInternationalRacewaySections,
  weathertechRacewayLagunaSecaSections,
  midOhioSportsCarCourseSections
];

/* DELIBERATE HONEST MISSES — Streets of St. Petersburg and Streets of Arlington
 * are intentionally NOT registered (trackSectionsFor returns null, so their race
 * pages keep the honest SectionStory fallback with no heat layer). Both carry
 * official section families, but their outlines are preliminary image traces
 * with NO geometry to anchor to: startFinish is null, drivingDirection is null,
 * cornerArcs is empty — the measured-length chain-fit has nothing to pin a span
 * to. The outlines' own lengths disagree with the measured lap totals (St. Pete
 * asset 1.12 vs 1.80 mi; Arlington asset 1.70 vs 2.73 mi), so even the scale is
 * untrusted. An honest miss beats a wrong map. UNLOCK: an S/F tick + driving
 * direction + corner arcs on a corrected outline, or (best) a richer RaceTools/
 * CGR map package with real intermediate timing-loop distances — same data-only
 * swap as everywhere else. (tests/sectionObservations.test.ts pins St. Pete null.) */

const bySlug = new Map(sets.map((set) => [set.slug, set]));

const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const byVenue = new Map(sets.map((set) => [normalized(set.venueName), set]));

/** Analytics packs sometimes name venues differently than the outlines; keep in
 *  step with `aliasSlugs` in ../index.ts. */
const aliasSlugs: Record<string, string> = {
  gateway: 'world-wide-technology-raceway'
};

/** Look up curated section anchors by the outline slug. */
export const trackSectionsForSlug = (slug: string | null | undefined): TrackSectionAnchorSet | null => {
  if (!slug) return null;
  return bySlug.get(slug) ?? null;
};

/** Anchors that are real measured timing-loop sections (excludes the derived
 *  untimed-remainder anchor, which is not a loop). */
const measuredAnchors = (set: TrackSectionAnchorSet) =>
  set.sections.filter((section) => section.kind !== 'derived_remainder');

/** Count of real timed sections (excludes the derived remainder). */
export const measuredSectionCount = (set: TrackSectionAnchorSet): number => measuredAnchors(set).length;

/** Whether a venue ships a derived untimed-remainder anchor (a genuine gap). */
export const hasDerivedRemainder = (set: TrackSectionAnchorSet): boolean =>
  set.sections.some((section) => section.kind === 'derived_remainder');

/** Share of the lap covered by TIMED sections, [0,1], excluding the derived
 *  remainder. When the set carries measured section lengths (miles) and a known
 *  lap length, coverage is REAL DISTANCE — Σ(measuredLengthMi)/lapLengthMi. This
 *  is the honest figure on venues whose retraced outline arc-length is not
 *  proportional to real track distance: pure t-share understates them (WWTR read
 *  65% by t-share, 74.3% by real distance). It falls back to the span t-lengths
 *  (wrap-seam safe) only when measured lengths are absent — Nashville's curated
 *  set reads 0.43, the measured 8-section set tiles ~1.0. */
export const timedShareOf = (set: TrackSectionAnchorSet): number => {
  const measured = measuredAnchors(set);
  if (
    set.lapLengthMi &&
    set.lapLengthMi > 0 &&
    measured.length > 0 &&
    measured.every((section) => typeof section.measuredLengthMi === 'number')
  ) {
    const timedMiles = measured.reduce((sum, section) => sum + (section.measuredLengthMi ?? 0), 0);
    return timedMiles / set.lapLengthMi;
  }
  return measured.reduce((sum, section) => {
    const length = (section.endT - section.startT + 1) % 1;
    return sum + (length === 0 ? 0 : length);
  }, 0);
};

/** Look up curated section anchors by venue/track name (as the packs name it).
 *  Returns null when the venue has no curated anchors yet — callers must fall
 *  back to the plain outline with an honest note. */
export const trackSectionsFor = (trackName: string | null | undefined): TrackSectionAnchorSet | null => {
  if (!trackName) return null;
  const target = normalized(trackName);
  const aliasSlug = aliasSlugs[target];
  if (aliasSlug) return bySlug.get(aliasSlug) ?? null;
  return byVenue.get(target) ?? null;
};

/** MEASURED loop-crossing anchor sets, keyed by venue — the finer, whole-lap
 *  tiling that supersedes the curated-PDF set on pages carrying lake loop data.
 *  Only venues wired for the lake appear here (Nashville, this slice). */
const measuredSets: TrackSectionAnchorSet[] = [nashvilleSuperspeedwayMeasuredSections];
const measuredByVenue = new Map(measuredSets.map((set) => [normalized(set.venueName), set]));

/** The measured anchor set for a venue, or null if none is wired. A race page
 *  uses this ONLY when its loaded section pack is `lake_loop_crossings`; every
 *  other race keeps the curated-PDF `trackSectionsFor` set as the fallback. */
export const measuredTrackSectionsFor = (trackName: string | null | undefined): TrackSectionAnchorSet | null => {
  if (!trackName) return null;
  return measuredByVenue.get(normalized(trackName)) ?? null;
};

/** Resolve a pass's bracketed loop interval `[fromLoop → toLoop]` to the anchor
 *  span it happened on, for the active section set. Matches either an explicit
 *  loop-tagged measured anchor (`startLoop`/`endLoop`) or a curated chain whose
 *  section name reads "<from> to <to>" (Milwaukee/Iowa). Returns null when the
 *  interval doesn't correspond to a drawn span (it draws no mark). */
export const passSpanAnchor = (
  set: TrackSectionAnchorSet,
  fromLoop: string,
  toLoop: string
): TrackSectionAnchor | null => {
  const from = fromLoop.trim().toUpperCase();
  const to = toLoop.trim().toUpperCase();
  return (
    set.sections.find(
      (section) =>
        section.startLoop?.toUpperCase() === from && section.endLoop?.toUpperCase() === to
    ) ??
    set.sections.find((section) => normalized(section.sectionName) === normalized(`${from} to ${to}`)) ??
    null
  );
};
