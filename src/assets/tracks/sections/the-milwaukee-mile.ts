import type { TrackSectionAnchorSet } from './types';

/** The Milwaukee Mile — 1.015-mi flat oval, counterclockwise. Official section
 *  results report NINE loop-to-loop sections chaining the FULL lap:
 *  SF → T1 → SS1 → T2 → BS → T3 → SS2 → T4 → FS → SF. The SF-crossing
 *  frontstretch sections ('SF to T1', 'FS to SF') are racing line measured
 *  loop-to-loop — an earlier classification regex filed them as pit splits,
 *  which is why the first curation showed only seven sections and 79.6%
 *  coverage.
 *
 *  Span LENGTHS are MEASURED from official time x speed (constant per family;
 *  the nine sections reproduce 1.0150 mi to 0.00%). The seven-section chain
 *  offset (0.9495) passed the original debug-overlay gate and is PRESERVED;
 *  the two rescued spans close the loop with their measured lengths (closure
 *  error 0.0001). Closing the chain locates the SF loop at t 0.8233 —
 *  mid-frontstretch between the T4 exit and the T1 loop. The outline's
 *  hand-placed S/F tick sat 0.12 later along the lap (39 ft before the T1
 *  loop, implausible for a start/finish line) and has been corrected to the
 *  measured loop position (the-milwaukee-mile.json). Verified against the
 *  regenerated debug overlay. Loop positions may later be superseded by
 *  measured timing-loop locations arriving through the same contract. */
export const theMilwaukeeMileSections: TrackSectionAnchorSet = {
  slug: 'the-milwaukee-mile',
  venueName: 'The Milwaukee Mile',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Nine official loop-to-loop sections tiling the full lap; lengths measured from official time x speed, chain offset fitted to the corner arcs, S/F position derived from chain closure. Every stretch of the lap is loop-timed.',
  sections: [
    { familyId: 'mil-sf-t1', sectionName: 'SF to T1', label: 'S/F → T1', startT: 0.8233, endT: 0.9495 },
    { familyId: 'mil-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.9495, endT: 0.0738 },
    { familyId: 'mil-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.0738, endT: 0.2165 },
    { familyId: 'mil-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.2165, endT: 0.3124 },
    { familyId: 'mil-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.3124, endT: 0.3861 },
    { familyId: 'mil-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.3861, endT: 0.5005 },
    { familyId: 'mil-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.5005, endT: 0.6153 },
    { familyId: 'mil-t4-fs', sectionName: 'T4 to FS', label: 'T4 → frontstretch', startT: 0.6153, endT: 0.7457 },
    { familyId: 'mil-fs-sf', sectionName: 'FS to SF', label: 'Frontstretch → S/F', startT: 0.7457, endT: 0.8233 }
  ]
};
