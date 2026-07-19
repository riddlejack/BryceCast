import type { TrackSectionAnchorSet } from './types';
import { nashvilleSuperspeedwaySections } from './nashville-superspeedway';
import { worldWideTechnologyRacewaySections } from './world-wide-technology-raceway';
import { iowaSpeedwaySections } from './iowa-speedway';
import { theMilwaukeeMileSections } from './the-milwaukee-mile';

/** Curated oval section anchors, keyed to the OSM track outlines in the parent
 *  directory. Ovals first (Brief E sequencing); road courses arrive in a later
 *  slice. See ./types.ts for the adapter-contract note on measured loop
 *  locations superseding this curation. */

export type { TrackSectionAnchor, TrackSectionAnchorSet } from './types';

const sets: TrackSectionAnchorSet[] = [
  nashvilleSuperspeedwaySections,
  worldWideTechnologyRacewaySections,
  iowaSpeedwaySections,
  theMilwaukeeMileSections
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
