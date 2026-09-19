import type { TrackSectionAnchorSet } from './types';

/** Streets of Arlington — 2.730-mi / 4394-m street circuit, clockwise. Rebuilt
 *  from the RaceTools "Arlington2026" map package polyline (SHA-256 ba60d0f4…),
 *  so the outline IS the racing line at ~1-m resolution and distance→path-t is
 *  exact (2730 outline units for 2.730 mi — one unit per 0.001 mi). The map
 *  package itself is sectionless (no timing loops), so span lengths come from
 *  the official Section Results (time × speed) and the chain order from the
 *  per-lap section sequence.
 *
 *  The report gives TWENTY-FIVE fine loop-to-loop segments in a single driving
 *  order that tiles the lap (2.730111 mi = 100.0%): FS-PO → T1 → T2 → T3 → T3/4
 *  → T4 → … → T9 → BS1..BS5 (the long back straight) → T10 → T11 → T11/12 → T12
 *  → T13 → T13/14 → T14 → FS PI. The chain runs a single sequence anchored at
 *  the S/F line (the polyline datum, path-t 0, which is the mainPath's own M
 *  point) and its early turn-segments land on the outline's detected corner
 *  arcs, so it anchors with zero free parameters. Verified against the debug
 *  overlay.
 *
 *  S/F DATUM CORRECTION (2026-09-19). The 2026-07-19 curation was missing the
 *  two front-straight families: the race lane filed `FS-PO` and `FS PI` as pit
 *  splits on their names although both run every lap (114 and 86 mph), so the
 *  chain had no way to start at S/F and was instead laid with Turn 1 at t=0.
 *  That put every span 0.030872 t — exactly FS-PO's 0.084280 mi — ahead of
 *  where it belongs, and left the 5.5% it could not place as a single derived
 *  remainder at the end of the lap. Both families are measured, not derived:
 *  FS-PO is the S/F→pit-out span and FS PI the pit-in→S/F span, the same
 *  S/F-straight pair the report publishes at St. Petersburg, Portland and
 *  Indianapolis, and they bracket the S/F line rather than sitting after Turn
 *  14. Every span below is shifted back by that 0.030872 and the derived
 *  remainder is retired — the lap is fully measured, so nothing here is
 *  shaded from lap-time arithmetic any more. */
export const streetsOfArlingtonSections: TrackSectionAnchorSet = {
  slug: 'streets-of-arlington',
  venueName: 'Streets of Arlington',
  drivingDirection: 'clockwise',
  confidence: 'anchored',
  note: 'Twenty-five official loop-to-loop segments in driving order covering 100.0% of the lap, anchored with zero free parameters at the S/F line (the map polyline datum) and converted through the outline distance table. FS-PO opens the lap at S/F and FS PI closes it; no stretch is derived. Lengths measured from official time × speed.',
  sections: [
    { familyId: 'arl-fs-po', sectionName: 'FS-PO', label: 'S/F → pit out', startT: 0.0, endT: 0.0309 },
    { familyId: 'arl-t1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.0309, endT: 0.0546 },
    { familyId: 'arl-t2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.0546, endT: 0.0747 },
    { familyId: 'arl-t3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.0747, endT: 0.1326 },
    { familyId: 'arl-t34', sectionName: 'Turns 3/4', label: 'Turns 3–4', startT: 0.1326, endT: 0.1782 },
    { familyId: 'arl-t4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.1782, endT: 0.2053 },
    { familyId: 'arl-t5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.2053, endT: 0.2338 },
    { familyId: 'arl-t6', sectionName: 'Turn 6', label: 'Turn 6', startT: 0.2338, endT: 0.2832 },
    { familyId: 'arl-t7', sectionName: 'Turn 7', label: 'Turn 7', startT: 0.2832, endT: 0.2969 },
    { familyId: 'arl-t8', sectionName: 'Turn 8', label: 'Turn 8', startT: 0.2969, endT: 0.3326 },
    { familyId: 'arl-t89', sectionName: 'Turns 8/9', label: 'Turns 8–9', startT: 0.3326, endT: 0.356 },
    { familyId: 'arl-t9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.356, endT: 0.3879 },
    { familyId: 'arl-bs1', sectionName: 'BS 1', label: 'Back straight 1', startT: 0.3879, endT: 0.4537 },
    { familyId: 'arl-bs2', sectionName: 'BS 2', label: 'Back straight 2', startT: 0.4537, endT: 0.5054 },
    { familyId: 'arl-bs3', sectionName: 'BS 3', label: 'Back straight 3', startT: 0.5054, endT: 0.5796 },
    { familyId: 'arl-bs4', sectionName: 'BS 4', label: 'Back straight 4', startT: 0.5796, endT: 0.6521 },
    { familyId: 'arl-bs5', sectionName: 'BS 5', label: 'Back straight 5', startT: 0.6521, endT: 0.6991 },
    { familyId: 'arl-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.6991, endT: 0.7485 },
    { familyId: 'arl-t11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.7485, endT: 0.7898 },
    { familyId: 'arl-t1112', sectionName: 'Turns 11/12', label: 'Turns 11–12', startT: 0.7898, endT: 0.8311 },
    { familyId: 'arl-t12', sectionName: 'Turn 12', label: 'Turn 12', startT: 0.8311, endT: 0.8647 },
    { familyId: 'arl-t13', sectionName: 'Turn 13', label: 'Turn 13', startT: 0.8647, endT: 0.9084 },
    { familyId: 'arl-t1314', sectionName: 'Turns 13/14', label: 'Turns 13–14', startT: 0.9084, endT: 0.957 },
    { familyId: 'arl-t14', sectionName: 'Turn 14', label: 'Turn 14', startT: 0.957, endT: 0.9756 },
    { familyId: 'arl-fs-pi', sectionName: 'FS PI', label: 'Pit in → S/F', startT: 0.9756, endT: 0.0 }
  ]
};
