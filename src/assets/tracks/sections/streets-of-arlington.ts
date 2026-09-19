import type { TrackSectionAnchorSet } from './types';

/** Streets of Arlington — 2.730-mi / 4394-m street circuit, clockwise. Rebuilt
 *  from the RaceTools "Arlington2026" map package polyline (SHA-256 ba60d0f4…),
 *  so the outline IS the racing line at ~1-m resolution and distance→path-t is
 *  exact. The map package itself is sectionless (no timing loops), so span
 *  lengths come from the official Section Results (time × speed) and the chain
 *  order from the per-lap section sequence.
 *
 *  The report gives TWENTY-THREE fine loop-to-loop segments in a single driving
 *  order that nearly tiles the lap (2.579 mi = 94.5%): T1 → T2 → T3 → T3/4 → T4
 *  → … → T9 → BS1..BS5 (the long back straight) → T10 → T11 → T11/12 → T12 → T13
 *  → T13/14 → T14. Because the chain runs a single sequence anchored at the S/F
 *  line (the polyline datum, path-t 0) and its early turn-segments land on the
 *  outline's detected corner arcs (T1–T4 arcs at t≈0.02–0.08), it anchors with
 *  zero free parameters; the ~5.5% untimed remainder is the final corner + S/F
 *  straight, drawn as a derived (dotted) span that never earns a top-section
 *  dot. Verified against the debug overlay. */
export const streetsOfArlingtonSections: TrackSectionAnchorSet = {
  slug: 'streets-of-arlington',
  venueName: 'Streets of Arlington',
  drivingDirection: 'clockwise',
  confidence: 'anchored',
  note: 'Twenty-three official loop-to-loop segments in driving order covering 94.5% of the lap, anchored with zero free parameters at the S/F line (the map polyline datum) and converted through the outline distance table; the ~5.5% untimed final-corner/S-F stretch is drawn as a derived remainder. Lengths measured from official time × speed.',
  sections: [
    { familyId: 'arl-t1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.0, endT: 0.0238 },
    { familyId: 'arl-t2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.0238, endT: 0.0438 },
    { familyId: 'arl-t3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.0438, endT: 0.1016 },
    { familyId: 'arl-t34', sectionName: 'Turns 3/4', label: 'Turns 3–4', startT: 0.1016, endT: 0.1472 },
    { familyId: 'arl-t4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.1472, endT: 0.1743 },
    { familyId: 'arl-t5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.1743, endT: 0.2027 },
    { familyId: 'arl-t6', sectionName: 'Turn 6', label: 'Turn 6', startT: 0.2027, endT: 0.252 },
    { familyId: 'arl-t7', sectionName: 'Turn 7', label: 'Turn 7', startT: 0.252, endT: 0.2655 },
    { familyId: 'arl-t8', sectionName: 'Turn 8', label: 'Turn 8', startT: 0.2655, endT: 0.3013 },
    { familyId: 'arl-t89', sectionName: 'Turns 8/9', label: 'Turns 8–9', startT: 0.3013, endT: 0.3248 },
    { familyId: 'arl-t9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.3248, endT: 0.3568 },
    { familyId: 'arl-bs1', sectionName: 'BS 1', label: 'Back straight 1', startT: 0.3568, endT: 0.4225 },
    { familyId: 'arl-bs2', sectionName: 'BS 2', label: 'Back straight 2', startT: 0.4225, endT: 0.4743 },
    { familyId: 'arl-bs3', sectionName: 'BS 3', label: 'Back straight 3', startT: 0.4743, endT: 0.5484 },
    { familyId: 'arl-bs4', sectionName: 'BS 4', label: 'Back straight 4', startT: 0.5484, endT: 0.621 },
    { familyId: 'arl-bs5', sectionName: 'BS 5', label: 'Back straight 5', startT: 0.621, endT: 0.6679 },
    { familyId: 'arl-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.6679, endT: 0.7173 },
    { familyId: 'arl-t11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.7173, endT: 0.7585 },
    { familyId: 'arl-t1112', sectionName: 'Turns 11/12', label: 'Turns 11–12', startT: 0.7585, endT: 0.7999 },
    { familyId: 'arl-t12', sectionName: 'Turn 12', label: 'Turn 12', startT: 0.7999, endT: 0.8336 },
    { familyId: 'arl-t13', sectionName: 'Turn 13', label: 'Turn 13', startT: 0.8336, endT: 0.8772 },
    { familyId: 'arl-t1314', sectionName: 'Turns 13/14', label: 'Turns 13–14', startT: 0.8772, endT: 0.9258 },
    { familyId: 'arl-t14', sectionName: 'Turn 14', label: 'Turn 14', startT: 0.9258, endT: 0.9445 },
    { familyId: 'arl-remainder', sectionName: 'Untimed remainder', label: 'Untimed final stretch', startT: 0.9445, endT: 0.0, kind: 'derived_remainder' }
  ]
};
