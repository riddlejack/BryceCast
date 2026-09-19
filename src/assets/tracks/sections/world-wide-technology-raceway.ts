import type { TrackSectionAnchorSet } from './types';

/** World Wide Technology Raceway (Gateway) — 1.25-mi egg-shaped oval,
 *  counterclockwise. Official Section Results publish EIGHT loop-to-loop track
 *  sections (Turn 1 → Turn 2 → backstretch halves → Turn 3 → Turn 4 → the two
 *  frontstretch halves) covering 100.0% of the lap.
 *
 *  FRONT-STRAIGHT CLOSURE (2026-09-19). The 2026-07-19 curation had already
 *  identified the missing pair below — "the untimed pair S5 (T4→SF) + S1
 *  (SF→T1)" — but believed the report did not publish them. It does: `FS - PI`
 *  and `FS - PO` run on every lap at 164 and 172 mph, and the race lane was
 *  discarding both as pit splits on the name alone. They are exactly S5 and S1.
 *  Their official time × speed lengths land on the map's own loop distances to
 *  the foot: FS - PI = 0.160417 mi = 10,164 feed units = SF(79,200) - T4(69,036);
 *  FS - PO = 0.161173 mi = 10,212 units = T1 on the nose. All eight families sum
 *  to 1.249999 mi — the 1.25-mi lap. Because the retraced outline's arc-length
 *  is badly non-proportional across the frontstretch, these two draw as very
 *  unequal t-spans either side of the S/F tick although they are near-equal in
 *  real distance; `measuredLengthMi` (not the t-span) carries coverage, the
 *  same way it already does for the two backstretch halves.
 *
 *  WIRED FROM THE LAKE MAP (2026-07-19). The six turn/backstretch families are
 *  six of the eight physical timing-loop sections in the RaceTools Gateway_2018
 *  map package (SHA d23ad2bc…, INI Track.Name "Gateway Motorsports Park", 26
 *  timing rows, correct St.-Louis [GPS] origin 38.65/-90.14 — joined by
 *  Track.Name + SHA-256, never filename; a second copy of the same package hides
 *  inside IndyCarMaps.zip/Portland_2018.zip carrying a wrong-venue Portland
 *  origin). The map's S-section loop chain SF→T1→SS1→T2→BS→T3→SS2→T4→SF and its
 *  measured per-loop LapDistances reproduce the six family lengths to 4 decimals:
 *    Turn 1 = T1→SS1, Turn 2 = SS1→T2, BS-T2 = T2→BS, BS-T3 = BS→T3,
 *    Turn 3 = T3→SS2, Turn 4 = SS2→T4; the frontstretch pair S5 (T4→SF) + S1
 *    (SF→T1) is FS - PI and FS - PO, the remaining 25.7%.
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
  lapLengthMi: 1.25,
  confidence: 'anchored',
  note: 'Eight official loop-to-loop sections covering 100.0% of the lap. FS - PI (T4→S/F) and FS - PO (S/F→T1) are the measured frontstretch halves, splitting at the verified S/F tick. Span positions are anchored to the RaceTools Gateway_2018 map package’s measured timing-loop distances, arc-calibrated onto the retraced outline; span lengths reproduce the official time × speed lengths exactly. Coverage is computed from those measured lengths, not the distorted outline t-spans.',
  sections: [
    { familyId: 'wwt-fs-po', sectionName: 'FS - PO', label: 'S/F → Turn 1', startLoop: 'SF', endLoop: 'T1', startT: 0.2568, endT: 0.3053, measuredLengthMi: 0.1612 },
    { familyId: 'wwt-turn-1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.3053, endT: 0.3315, measuredLengthMi: 0.1205 },
    { familyId: 'wwt-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.3315, endT: 0.365, measuredLengthMi: 0.1447 },
    { familyId: 'wwt-bs-t2', sectionName: 'BS - T2', label: 'T2 → back straight', startT: 0.365, endT: 0.5802, measuredLengthMi: 0.1581 },
    { familyId: 'wwt-bs-t3', sectionName: 'BS - T3', label: 'Back straight → T3', startT: 0.5802, endT: 0.7957, measuredLengthMi: 0.1583 },
    { familyId: 'wwt-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.7957, endT: 0.8633, measuredLengthMi: 0.1835 },
    { familyId: 'wwt-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.8633, endT: 0.9567, measuredLengthMi: 0.1633 },
    { familyId: 'wwt-fs-pi', sectionName: 'FS - PI', label: 'Turn 4 → S/F', startLoop: 'T4', endLoop: 'SF', startT: 0.9567, endT: 0.2568, measuredLengthMi: 0.1604 }
  ]
};
