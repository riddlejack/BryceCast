import type { TrackSectionAnchorSet } from './types';

/** WeatherTech Raceway Laguna Seca — 2.24-mi, 11-turn road course.
 *  The official Section Results report FIFTEEN timing sections (Turn 1 … Turn
 *  11 with the 4A/5A/7A sub-loops and the Corkscrew standing in for Turn 8)
 *  covering 87.0% of the lap; the start/finish straight from the Turn 11 exit
 *  past the S/F line to Turn 1 carries no timing loop and stays the quiet base
 *  outline — an honest gap, not a coloured span.
 *
 *  Span LENGTHS are MEASURED: official section speeds are averages, so
 *  timeSeconds × speedMph is constant per family and equals the section length
 *  (scripts/compute-section-anchors.mjs; the 15 fields sum to 2.075 mi =
 *  92.7% of the 2.238-mi lap). Span POSITIONS are arc-anchored: the chain runs
 *  in driving order (= increasing t, verified from the S/F tangent) with the
 *  untimed gap placed on the start/finish straight so the S/F line falls inside
 *  it. Turn 1 Entry and Turn 1 Exit are separated at feed loop I1 between the
 *  outline's exact S/F datum and the established I2/Turn 2 boundary. The rest
 *  of the offset is fitted to the two unmistakable control corners — the
 *  Andretti Hairpin (Turn 2, the 217° arc, apex t≈0.373) and the Corkscrew (the
 *  346° double, apex t≈0.930) — which agree to within 0.003; verified visually
 *  against the debug overlay, every detected corner arc lands inside its named
 *  span in sequence. Positions may later be superseded by measured timing-loop
 *  locations arriving through the same contract. */
export const weathertechRacewayLagunaSecaSections: TrackSectionAnchorSet = {
  slug: 'weathertech-raceway-laguna-seca',
  venueName: 'WeatherTech Raceway Laguna Seca',
  drivingDirection: 'counterclockwise',
  lapLengthMi: 2.238,
  confidence: 'anchored',
  note: 'Fifteen official timing sections covering 92.7% of the lap. Turn 1 Entry and Exit are split at feed loop I1 between the exact outline S/F datum and the established Turn 2 boundary; the remaining positions are anchored to the Andretti Hairpin and Corkscrew.',
  sections: [
    { familyId: 'wtls-turn-1-entry', sectionName: 'Turn 1 Entry', label: 'Turn 1 entry', startLoop: 'SF', endLoop: 'I1', startT: 0.2818, endT: 0.3028, measuredLengthMi: 0.0983 },
    { familyId: 'wtls-turn-1-exit', sectionName: 'Turn 1 Exit', label: 'Turn 1 exit', startLoop: 'I1', endLoop: 'I2', startT: 0.3028, endT: 0.3303, measuredLengthMi: 0.1286 },
    { familyId: 'wtls-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.3303, endT: 0.4179, measuredLengthMi: 0.1960 },
    { familyId: 'wtls-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.4179, endT: 0.4891, measuredLengthMi: 0.1593 },
    { familyId: 'wtls-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.4891, endT: 0.5926, measuredLengthMi: 0.2316 },
    { familyId: 'wtls-turn-4a', sectionName: 'Turn 4A', label: 'Turn 4A', startT: 0.5926, endT: 0.6283, measuredLengthMi: 0.0799 },
    { familyId: 'wtls-turn-5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.6283, endT: 0.6978, measuredLengthMi: 0.1555 },
    { familyId: 'wtls-turn-5a', sectionName: 'Turn 5A', label: 'Turn 5A', startT: 0.6978, endT: 0.7411, measuredLengthMi: 0.0970 },
    { familyId: 'wtls-turn-6', sectionName: 'Turn 6', label: 'Turn 6', startT: 0.7411, endT: 0.8448, measuredLengthMi: 0.2320 },
    { familyId: 'wtls-turn-7', sectionName: 'Turn 7', label: 'Turn 7', startT: 0.8448, endT: 0.8785, measuredLengthMi: 0.0756 },
    { familyId: 'wtls-turn-7a', sectionName: 'Turn 7A', label: 'Turn 7A', startT: 0.8785, endT: 0.8972, measuredLengthMi: 0.0419 },
    { familyId: 'wtls-corkscrew', sectionName: 'Corkscrew', label: 'Corkscrew', startT: 0.8972, endT: 0.9585, measuredLengthMi: 0.1371 },
    { familyId: 'wtls-turn-9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.9585, endT: 0.0257, measuredLengthMi: 0.1504 },
    { familyId: 'wtls-turn-10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.0257, endT: 0.1212, measuredLengthMi: 0.2138 },
    { familyId: 'wtls-turn-11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.1212, endT: 0.1560, measuredLengthMi: 0.0778 }
  ]
};
