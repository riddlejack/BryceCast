import type { TrackSectionAnchorSet } from './types';

/** The Milwaukee Mile — 1.015-mi flat oval, counterclockwise. Official section
 *  results report NINE loop-to-loop sections chaining the FULL lap:
 *  SF → T1 → SS1 → T2 → BS → T3 → SS2 → T4 → FS → SF. The SF-crossing
 *  frontstretch sections ('SF to T1', 'FS to SF') are racing line measured
 *  loop-to-loop — an earlier classification regex filed them as pit splits,
 *  which is why the first curation showed only seven sections and 79.6%
 *  coverage.
 *
 *  PINNED FROM THE FEED LOOP DISTANCES (2026-07-19, scripts/derive-section-
 *  anchors.mjs). There is no venue-named RaceTools MAP package for Milwaukee
 *  (MilwaukeeMile_2024.zip decodes to no track name and zero timing sections),
 *  so the earlier curation measured the span lengths from official time × speed
 *  and fitted the chain offset by hand. The sanctioning FEED, however, carries
 *  the full decoded loop inventory: the semantic layer's per-session
 *  geometry.loopDistances places every loop (T1, SS1, T2, BS, T3, SS2, T4, FS)
 *  by cumulative distance around the lap in feed units (1/12 ft; S/F at 0). The
 *  nine section lengths that inventory yields reproduce the 1.0150-mi lap to the
 *  inch and match the official time × speed lengths that were curated by hand;
 *  the boundary POSITIONS are these measured loop distances laid on the outline
 *  from the visually-verified S/F datum (t=0.8233, mid-frontstretch between the
 *  T4 exit and the T1 loop — the outline's original hand-placed tick sat 0.12
 *  later, an implausible 39 ft before the T1 loop, and was corrected). The
 *  feed-derived positions reproduce the hand-fitted chain to within 0.0001 t, so
 *  the debug-overlay gate the chain passed still holds. `startLoop`/`endLoop`
 *  now name the physical loops each span runs between (the pass-placement join).
 *  This is racetools_capture geometry; the map [GPS] origin stays untrusted and
 *  is unused. Field lengths are now carried as `measuredLengthMi`, so coverage
 *  is real distance (the nine sections tile 100% of the lap). Loop positions may
 *  later be superseded by finer measured loop-crossing locations on the same
 *  contract. */
export const theMilwaukeeMileSections: TrackSectionAnchorSet = {
  slug: 'the-milwaukee-mile',
  venueName: 'The Milwaukee Mile',
  drivingDirection: 'counterclockwise',
  lapLengthMi: 1.015,
  confidence: 'anchored',
  note: 'Nine official loop-to-loop sections tiling the full lap. Lengths and boundary positions are pinned to the feed’s decoded timing-loop distances (semantic-layer geometry.loopDistances), which reproduce the 1.015-mi lap to the inch; positions are laid on the outline from the S/F datum. Every stretch of the lap is loop-timed. Coverage is real distance, from the measured section lengths.',
  sections: [
    { familyId: 'mil-sf-t1', sectionName: 'SF to T1', label: 'S/F → T1', startT: 0.8233, endT: 0.9494, measuredLengthMi: 0.128, startLoop: 'SF', endLoop: 'T1' },
    { familyId: 'mil-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.9494, endT: 0.0737, measuredLengthMi: 0.1261, startLoop: 'T1', endLoop: 'SS1' },
    { familyId: 'mil-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.0737, endT: 0.2165, measuredLengthMi: 0.1449, startLoop: 'SS1', endLoop: 'T2' },
    { familyId: 'mil-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.2165, endT: 0.3124, measuredLengthMi: 0.0973, startLoop: 'T2', endLoop: 'BS' },
    { familyId: 'mil-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.3124, endT: 0.3861, measuredLengthMi: 0.0748, startLoop: 'BS', endLoop: 'T3' },
    { familyId: 'mil-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.3861, endT: 0.5005, measuredLengthMi: 0.1161, startLoop: 'T3', endLoop: 'SS2' },
    { familyId: 'mil-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.5005, endT: 0.6152, measuredLengthMi: 0.1165, startLoop: 'SS2', endLoop: 'T4' },
    { familyId: 'mil-t4-fs', sectionName: 'T4 to FS', label: 'T4 → frontstretch', startT: 0.6152, endT: 0.7457, measuredLengthMi: 0.1324, startLoop: 'T4', endLoop: 'FS' },
    { familyId: 'mil-fs-sf', sectionName: 'FS to SF', label: 'Frontstretch → S/F', startT: 0.7457, endT: 0.8233, measuredLengthMi: 0.0788, startLoop: 'FS', endLoop: 'SF' }
  ]
};
