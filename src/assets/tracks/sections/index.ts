import type { TrackSectionAnchor, TrackSectionAnchorSet } from './types';
import { nashvilleSuperspeedwaySections, nashvilleSuperspeedwayMeasuredSections } from './nashville-superspeedway';
import { worldWideTechnologyRacewaySections } from './world-wide-technology-raceway';
import { iowaSpeedwaySections } from './iowa-speedway';
import { theMilwaukeeMileSections } from './the-milwaukee-mile';
import { portlandInternationalRacewaySections } from './portland-international-raceway';
import { weathertechRacewayLagunaSecaSections } from './weathertech-raceway-laguna-seca';

/** Curated oval section anchors, keyed to the OSM track outlines in the parent
 *  directory. Ovals first (Brief E sequencing); road courses arrive in a later
 *  slice. See ./types.ts for the adapter-contract note on measured loop
 *  locations superseding this curation. */

export type { TrackSectionAnchor, TrackSectionAnchorSet } from './types';

const sets: TrackSectionAnchorSet[] = [
  nashvilleSuperspeedwaySections,
  worldWideTechnologyRacewaySections,
  iowaSpeedwaySections,
  theMilwaukeeMileSections,
  portlandInternationalRacewaySections,
  weathertechRacewayLagunaSecaSections
];

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

/** Share of the lap covered by TIMED sections, [0,1] — from the measured span
 *  lengths (wrap-seam safe), excluding the derived remainder. Nashville: 0.43;
 *  the rest of the lap carries no timing loops and is derived from lap time. */
export const timedShareOf = (set: TrackSectionAnchorSet): number =>
  measuredAnchors(set).reduce((sum, section) => {
    const length = (section.endT - section.startT + 1) % 1;
    return sum + (length === 0 ? 0 : length);
  }, 0);

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
