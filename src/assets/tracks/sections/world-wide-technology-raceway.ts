import type { TrackSectionAnchorSet } from './types';

/** World Wide Technology Raceway (Gateway) — 1.25-mi egg-shaped oval,
 *  counterclockwise. Official Section Results publish SIX loop-to-loop track
 *  sections (Turn 1 → Turn 2 → backstretch halves → Turn 3 → Turn 4) covering
 *  74.3% of the lap; the frontstretch around the S/F line is untimed and stays
 *  the quiet base outline — an honest gap, not a coloured span.
 *
 *  WIRED FROM THE LAKE MAP (2026-07-19). The six published families are exactly
 *  six of the eight physical timing-loop sections in the RaceTools Gateway_2018
 *  map package (SHA d23ad2bc…, INI Track.Name "Gateway Motorsports Park", 26
 *  timing rows, correct St.-Louis [GPS] origin 38.65/-90.14 — joined by
 *  Track.Name + SHA-256, never filename; a second copy of the same package hides
 *  inside IndyCarMaps.zip/Portland_2018.zip carrying a wrong-venue Portland
 *  origin). The map's S-section loop chain SF→T1→SS1→T2→BS→T3→SS2→T4→SF and its
 *  measured per-loop LapDistances reproduce the six family lengths to 4 decimals:
 *    Turn 1 = T1→SS1, Turn 2 = SS1→T2, BS-T2 = T2→BS, BS-T3 = BS→T3,
 *    Turn 3 = T3→SS2, Turn 4 = SS2→T4; the untimed pair S5 (T4→SF) + S1 (SF→T1)
 *    is the 25.7% frontstretch gap.
 *
 *  Span POSITIONS are anchored on the retraced outline by mapping each loop's
 *  real LapDistance to outline-t through the visually-verified control points
 *  the outline already carries (the retraced outline's OSM arc-length is badly
 *  non-proportional to real track distance — pure distance tiling misplaces the
 *  corners, so this uses the same arc-calibrated interpolation as the Nashville
 *  measured set): SF tick t=0.2568; the tight end (Turns 1-2) arc entry/apex/exit
 *  0.3053/0.3315/0.3650 pins T1/SS1/T2; the wide end (Turns 3-4) arc
 *  entry/apex/exit 0.7957/0.8633/0.9567 pins T3/SS2/T4; the BS loop is
 *  interpolated by real distance along the backstretch (mid-backstretch, 0.5802).
 *  Verified against the regenerated debug overlay (reports/anchors-c). This
 *  supersedes the 2026-07-18 fitted-offset curation and its NON-RENDERING hold:
 *  the lake-map loop locations the hold was waiting for are now wired, so the
 *  venue is promoted to 'anchored' and renders (director gates the overlay). */
export const worldWideTechnologyRacewaySections: TrackSectionAnchorSet = {
  slug: 'world-wide-technology-raceway',
  venueName: 'World Wide Technology Raceway',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Six official loop-to-loop sections (74.3% of the lap); the frontstretch around S/F is untimed and stays the base outline. Span positions are anchored to the RaceTools Gateway_2018 map package’s measured timing-loop distances, arc-calibrated onto the retraced outline; span lengths reproduce the official time × speed lengths exactly.',
  sections: [
    { familyId: 'wwt-turn-1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.3053, endT: 0.3315 },
    { familyId: 'wwt-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.3315, endT: 0.365 },
    { familyId: 'wwt-bs-t2', sectionName: 'BS - T2', label: 'T2 → back straight', startT: 0.365, endT: 0.5802 },
    { familyId: 'wwt-bs-t3', sectionName: 'BS - T3', label: 'Back straight → T3', startT: 0.5802, endT: 0.7957 },
    { familyId: 'wwt-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.7957, endT: 0.8633 },
    { familyId: 'wwt-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.8633, endT: 0.9567 }
  ]
};
