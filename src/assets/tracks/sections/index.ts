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

/** Share of the lap covered by timed sections, [0,1] — from the measured span
 *  lengths (wrap-seam safe). Nashville: 0.43; the rest of the lap carries no
 *  timing loops and the UI says so. */
export const timedShareOf = (set: TrackSectionAnchorSet): number =>
  set.sections.reduce((sum, section) => {
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
