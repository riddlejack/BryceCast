import type { TrackSectionAnchorSet } from './types';

/** Mid-Ohio Sports Car Course — 2.26-mi, 13-section road course, clockwise.
 *  Official Section Results publish SIXTEEN loop-to-loop families that chain the
 *  driving order Turn 1 → 1A → 1B → Turn 2 → Turn 3 → Back Stretch → Turn 4 → 5
 *  → 6/7 → 8 → 9 → 10 → 11 → 12 → 12C → 13, covering 93.7% of the lap; the
 *  remaining 6.3% is the untimed pit/front straight around S/F, which stays the
 *  quiet base outline (an honest gap, not a coloured span).
 *
 *  NO LAKE LOOP DISTANCES. The RaceTools map package for Mid-Ohio carries only
 *  the start/finish control line and one whole-lap section (S01, I6→I6) — no
 *  intermediate timing loops — and its [GPS] origin is a wrong-venue Pennsylvania
 *  point (untrusted, unused). So span POSITIONS cannot come from measured loop
 *  distances; they are chain-fitted like Iowa/Milwaukee: the sixteen families are
 *  laid in driving order by their MEASURED time × speed lengths (which reproduce
 *  the 2.258-mi lap), with the single untimed gap placed on the S/F straight.
 *
 *  VERIFIED on the debug overlay (reports/anchors-c/midohio-overlay): three hard
 *  anchors line up — the untimed gap sits on the front straight around the S/F
 *  tick; the first corner after S/F (arc#0, gentle) is Turn 1; the sharp hairpin
 *  (arc#1, the Keyhole) is Turn 2, in the correct order — and the outline
 *  arc-length from S/F to the Keyhole exit matches the measured chain length to
 *  0.0002. The four remaining corner arcs (Turn 4, ~Turn 8, ~Turn 11, ~Turn 12)
 *  land in their plausibly-named spans. The FINE boundaries through the twisty
 *  middle third rest on proportional length-tiling with only soft arc
 *  corroboration (no intermediate loop distances exist to pin them exactly); a
 *  richer RaceTools/CGR map with real intermediate loops would supersede these
 *  positions the same data-only way as everywhere else. */
export const midOhioSportsCarCourseSections: TrackSectionAnchorSet = {
  slug: 'mid-ohio-sports-car-course',
  venueName: 'Mid-Ohio Sports Car Course',
  drivingDirection: 'clockwise',
  lapLengthMi: 2.258,
  confidence: 'anchored',
  note: 'Sixteen official loop-to-loop sections (93.7% of the lap); the pit/front straight around S/F is untimed and stays the base outline. Span lengths are measured from official time × speed; positions are chain-fitted in driving order anchored at S/F, with Turn 1 and the Turn 2 Keyhole confirmed on the outline’s corner arcs. No intermediate map loops exist for Mid-Ohio, so the mid-lap boundaries are proportional (would be superseded by measured loop locations).',
  sections: [
    { familyId: 'mid-t1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.7762, endT: 0.8325, measuredLengthMi: 0.1271 },
    { familyId: 'mid-t1a', sectionName: 'Turn 1A', label: 'Turn 1A', startT: 0.8325, endT: 0.8972, measuredLengthMi: 0.1462 },
    { familyId: 'mid-t1b', sectionName: 'Turn 1B', label: 'Turn 1B', startT: 0.8972, endT: 0.9464, measuredLengthMi: 0.1110 },
    { familyId: 'mid-t2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.9464, endT: 0.0236, measuredLengthMi: 0.1742 },
    { familyId: 'mid-t3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.0236, endT: 0.1417, measuredLengthMi: 0.2667 },
    { familyId: 'mid-bs', sectionName: 'Back Stretch', label: 'Back stretch', startT: 0.1417, endT: 0.2333, measuredLengthMi: 0.2068 },
    { familyId: 'mid-t4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.2333, endT: 0.2907, measuredLengthMi: 0.1297 },
    { familyId: 'mid-t5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.2907, endT: 0.3374, measuredLengthMi: 0.1055 },
    { familyId: 'mid-t67', sectionName: 'Turn 6/7', label: 'Turns 6/7', startT: 0.3374, endT: 0.3999, measuredLengthMi: 0.1411 },
    { familyId: 'mid-t8', sectionName: 'Turn 8', label: 'Turn 8', startT: 0.3999, endT: 0.4269, measuredLengthMi: 0.0610 },
    { familyId: 'mid-t9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.4269, endT: 0.4948, measuredLengthMi: 0.1532 },
    { familyId: 'mid-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.4948, endT: 0.5625, measuredLengthMi: 0.1528 },
    { familyId: 'mid-t11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.5625, endT: 0.6213, measuredLengthMi: 0.1328 },
    { familyId: 'mid-t12', sectionName: 'Turn 12', label: 'Turn 12', startT: 0.6213, endT: 0.6622, measuredLengthMi: 0.0924 },
    { familyId: 'mid-t12c', sectionName: 'Turn 12C', label: 'Turn 12C', startT: 0.6622, endT: 0.6776, measuredLengthMi: 0.0348 },
    { familyId: 'mid-t13', sectionName: 'Turn 13', label: 'Turn 13', startT: 0.6776, endT: 0.7135, measuredLengthMi: 0.0811 }
  ]
};
