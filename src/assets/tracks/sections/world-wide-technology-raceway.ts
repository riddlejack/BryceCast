import type { TrackSectionAnchorSet } from './types';

/** World Wide Technology Raceway (Gateway) — 1.25-mi egg-shaped oval,
 *  counterclockwise. Official section results report SIX loop-to-loop sections
 *  chaining Turn 1 → Turn 2 → backstretch halves → Turn 3 → Turn 4 and
 *  covering 74.3% of the lap; the frontstretch around the S/F line is untimed.
 *
 *  Outline retraced 2026-07-18 (the old asset was assembled through
 *  road-course segments and carried a spur; the new trace uses the three
 *  Gateway International Raceway oval ways + the frontstretch pit road for the
 *  S/F anchor). Span LENGTHS are MEASURED from official time x speed; the
 *  chain offset was fitted to the two corner-complex arcs and the
 *  S/F-in-untimed-gap constraint (offset 0.2810, min margin 0.0242 —
 *  scripts/compute-section-anchors.mjs).
 *
 *  DELIBERATELY NON-RENDERING (director ruling, 2026-07-18): WWTR stays
 *  'approximate' regardless of fit quality — its anchors will come from the
 *  data lake's Gateway 2018 timing-map package (26 measured sections) through
 *  the sectionObservations sourceTier swap, not from this curation. */
export const worldWideTechnologyRacewaySections: TrackSectionAnchorSet = {
  slug: 'world-wide-technology-raceway',
  venueName: 'World Wide Technology Raceway',
  drivingDirection: 'counterclockwise',
  confidence: 'approximate',
  note: 'Six official loop-to-loop sections; lengths measured, chain offset fitted after the 2026-07-18 outline retrace. Held back from rendering until measured timing-loop locations arrive from the lake (Gateway 2018 map, 26 sections).',
  sections: [
    { familyId: 'wwt-turn-1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.281, endT: 0.3774 },
    { familyId: 'wwt-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.3774, endT: 0.4931 },
    { familyId: 'wwt-bs-t2', sectionName: 'BS - T2', label: 'T2 → back straight', startT: 0.4931, endT: 0.6196 },
    { familyId: 'wwt-bs-t3', sectionName: 'BS - T3', label: 'Back straight → T3', startT: 0.6196, endT: 0.7463 },
    { familyId: 'wwt-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.7463, endT: 0.8931 },
    { familyId: 'wwt-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.8931, endT: 0.0237 }
  ]
};
