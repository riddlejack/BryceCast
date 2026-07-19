import type { TrackSectionAnchorSet } from './types';

/** WeatherTech Raceway Laguna Seca — 2.24-mi, 11-turn road course.
 *  The official Section Results report FOURTEEN timing sections (Turn 1 … Turn
 *  11 with the 4A/5A/7A sub-loops and the Corkscrew standing in for Turn 8)
 *  covering 87.0% of the lap; the start/finish straight from the Turn 11 exit
 *  past the S/F line to Turn 1 carries no timing loop and stays the quiet base
 *  outline — an honest gap, not a coloured span.
 *
 *  Span LENGTHS are MEASURED: official section speeds are averages, so
 *  timeSeconds × speedMph is constant per family and equals the section length
 *  (scripts/compute-section-anchors.mjs; the 14 families sum to 1.946 mi =
 *  87.0% of the 2.238-mi lap). Span POSITIONS are arc-anchored: the chain runs
 *  in driving order (= increasing t, verified from the S/F tangent) with the
 *  untimed gap placed on the start/finish straight so the S/F line falls inside
 *  it. The offset is fitted to the two unmistakable control corners — the
 *  Andretti Hairpin (Turn 2, the 217° arc, apex t≈0.373) and the Corkscrew (the
 *  346° double, apex t≈0.930) — which agree to within 0.003; verified visually
 *  against the debug overlay, every detected corner arc lands inside its named
 *  span in sequence. Positions may later be superseded by measured timing-loop
 *  locations arriving through the same contract. */
export const weathertechRacewayLagunaSecaSections: TrackSectionAnchorSet = {
  slug: 'weathertech-raceway-laguna-seca',
  venueName: 'WeatherTech Raceway Laguna Seca',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Fourteen official timing sections covering 87.0% of the lap; lengths measured from official time × speed, positions arc-anchored to the Andretti Hairpin (Turn 2) and Corkscrew control corners. The start/finish straight past S/F is not a timing section and stays the base outline.',
  sections: [
    { familyId: 'wtls-turn-1', sectionName: 'Turn 1 Entry Turn 1 Exit', label: 'Turn 1', startT: 0.2864, endT: 0.3303 },
    { familyId: 'wtls-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.3303, endT: 0.4179 },
    { familyId: 'wtls-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.4179, endT: 0.4891 },
    { familyId: 'wtls-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.4891, endT: 0.5926 },
    { familyId: 'wtls-turn-4a', sectionName: 'Turn 4A', label: 'Turn 4A', startT: 0.5926, endT: 0.6283 },
    { familyId: 'wtls-turn-5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.6283, endT: 0.6978 },
    { familyId: 'wtls-turn-5a', sectionName: 'Turn 5A', label: 'Turn 5A', startT: 0.6978, endT: 0.7411 },
    { familyId: 'wtls-turn-6', sectionName: 'Turn 6', label: 'Turn 6', startT: 0.7411, endT: 0.8448 },
    { familyId: 'wtls-turn-7', sectionName: 'Turn 7', label: 'Turn 7', startT: 0.8448, endT: 0.8785 },
    { familyId: 'wtls-turn-7a', sectionName: 'Turn 7A', label: 'Turn 7A', startT: 0.8785, endT: 0.8972 },
    { familyId: 'wtls-corkscrew', sectionName: 'Corkscrew', label: 'Corkscrew', startT: 0.8972, endT: 0.9585 },
    { familyId: 'wtls-turn-9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.9585, endT: 0.0257 },
    { familyId: 'wtls-turn-10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.0257, endT: 0.1212 },
    { familyId: 'wtls-turn-11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.1212, endT: 0.1560 }
  ]
};
