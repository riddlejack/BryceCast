import type { TrackSectionAnchorSet } from './types';

/** Iowa Speedway — 0.894-mi tri-oval short track, counterclockwise. Official
 *  section results report EIGHT loop-to-loop sections chaining the FULL lap:
 *  SF → T1 → SS1 → T2 → BS → T3 → SS2 → T4 → SF. The SF-crossing frontstretch
 *  sections ('SF to T1', 'T4 to SF') are racing line measured loop-to-loop —
 *  an earlier classification regex filed them as pit splits, which is why the
 *  first curation showed only six sections and 70.7% coverage.
 *
 *  Span LENGTHS are MEASURED from official time x speed (constant per family;
 *  the eight sections reproduce 0.8940 mi to 0.04%). The six-section chain
 *  offset (0.2270) passed the original debug-overlay gate and is PRESERVED;
 *  the two rescued spans close the loop with their measured lengths (closure
 *  error 0.0004). Closing the chain locates the SF loop at t 0.0794 — 0.01
 *  from the tri-oval dogleg apex (t 0.0694), exactly where a tri-oval's S/F
 *  line sits. The outline's hand-placed S/F tick sat 0.12 later along the lap
 *  and has been corrected to the measured loop position (iowa-speedway.json).
 *  Verified against the regenerated debug overlay. Loop positions may later be
 *  superseded by measured timing-loop locations arriving through the same
 *  contract. */
export const iowaSpeedwaySections: TrackSectionAnchorSet = {
  slug: 'iowa-speedway',
  venueName: 'Iowa Speedway',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Eight official loop-to-loop sections tiling the full lap; lengths measured from official time x speed, chain offset fitted to the corner arcs, S/F position derived from chain closure. Every stretch of the lap is loop-timed.',
  sections: [
    { familyId: 'iow-sf-t1', sectionName: 'SF to T1', label: 'S/F → T1', startT: 0.0794, endT: 0.227 },
    { familyId: 'iow-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.227, endT: 0.3328 },
    { familyId: 'iow-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.3328, endT: 0.4622 },
    { familyId: 'iow-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.4622, endT: 0.5802 },
    { familyId: 'iow-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.5802, endT: 0.6984 },
    { familyId: 'iow-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.6984, endT: 0.8291 },
    { familyId: 'iow-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.8291, endT: 0.9336 },
    { familyId: 'iow-t4-sf', sectionName: 'T4 to SF', label: 'T4 → S/F', startT: 0.9336, endT: 0.0794 }
  ]
};
