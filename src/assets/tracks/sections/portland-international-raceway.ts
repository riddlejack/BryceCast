import type { TrackSectionAnchorSet } from './types';

/** Portland International Raceway — 1.96-mi, 12-turn road course, clockwise.
 *  The official Section Results report ELEVEN timing sections (Turn 1 … Turn 9,
 *  Turns 10/11, Turn 12) covering 85.4% of the lap; the long front straight from
 *  the Turn 12 exit past the S/F line to the Turn 1 braking zone carries no
 *  timing loop and stays the quiet base outline — an honest gap, not a coloured
 *  span.
 *
 *  Span LENGTHS are MEASURED: official section speeds are averages, so
 *  timeSeconds × speedMph is constant per family and equals the section length
 *  (scripts/compute-section-anchors.mjs; the 11 families sum to 1.678 mi =
 *  85.4% of the 1.964-mi lap). Span POSITIONS are arc-anchored: the chain runs
 *  in driving order (= increasing t, verified from the S/F tangent) with the
 *  untimed gap placed on the front straight so the S/F line falls inside it.
 *  The offset is fitted to the two unambiguous control corners bracketing the
 *  front straight — Turn 1 (the Festival Curves, the 250° arc first after S/F,
 *  apex t≈0.524) and Turn 12 (the 127° final arc before S/F, apex t≈0.233) —
 *  and verified visually against the debug overlay: every detected corner arc
 *  lands inside its named span. Positions may later be superseded by measured
 *  timing-loop locations arriving through the same contract. */
export const portlandInternationalRacewaySections: TrackSectionAnchorSet = {
  slug: 'portland-international-raceway',
  venueName: 'Portland International Raceway',
  drivingDirection: 'clockwise',
  confidence: 'anchored',
  note: 'Eleven official timing sections covering 85.4% of the lap; lengths measured from official time × speed, positions arc-anchored to the Turn 1 and Turn 12 control corners bracketing the front straight. The front straight past S/F is not a timing section and stays the base outline.',
  sections: [
    { familyId: 'por-turn-1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.4550, endT: 0.5299 },
    { familyId: 'por-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.5299, endT: 0.5552 },
    { familyId: 'por-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.5552, endT: 0.6434 },
    { familyId: 'por-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.6434, endT: 0.7064 },
    { familyId: 'por-turn-5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.7064, endT: 0.7660 },
    { familyId: 'por-turn-6', sectionName: 'Turn 6', label: 'Turn 6', startT: 0.7660, endT: 0.8557 },
    { familyId: 'por-turn-7', sectionName: 'Turn 7', label: 'Turn 7', startT: 0.8557, endT: 0.9079 },
    { familyId: 'por-turn-8', sectionName: 'Turn 8', label: 'Turn 8', startT: 0.9079, endT: 0.9769 },
    { familyId: 'por-turn-9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.9769, endT: 0.1186 },
    { familyId: 'por-turns-10-11', sectionName: 'Turns 10/11', label: 'Turns 10–11', startT: 0.1186, endT: 0.2190 },
    { familyId: 'por-turn-12', sectionName: 'Turn 12', label: 'Turn 12', startT: 0.2190, endT: 0.3093 }
  ]
};
