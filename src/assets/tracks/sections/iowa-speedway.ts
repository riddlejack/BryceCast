import type { TrackSectionAnchorSet } from './types';

/** Iowa Speedway — 0.894-mi tri-oval short track, counterclockwise. Official
 *  section results report SIX timing sections named by their loop endpoints
 *  (T1→SS1→T2→BS→T3→SS2→T4). The frontstretch (T4→S/F→T1) is not a reported
 *  section and stays the base outline.
 *
 *  Anchored to the two banked-end arcs (turns 1–2 apex t≈0.307, turns 3–4 apex
 *  t≈0.753); the SS1/BS/SS2 split loops are distributed along the arcs and back
 *  straight between them. APPROXIMATE until measured loop locations arrive
 *  through the data lake's timing-map archives. */
export const iowaSpeedwaySections: TrackSectionAnchorSet = {
  slug: 'iowa-speedway',
  venueName: 'Iowa Speedway',
  drivingDirection: 'counterclockwise',
  confidence: 'approximate',
  note: 'Six official timing sections placed proportionally between the two banked-end arcs; split-loop (SS1/BS/SS2) boundaries are approximate pending measured loop locations.',
  sections: [
    { familyId: 'iow-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.2514, endT: 0.3068 },
    { familyId: 'iow-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.3068, endT: 0.3527 },
    { familyId: 'iow-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.3527, endT: 0.517 },
    { familyId: 'iow-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.517, endT: 0.6816 },
    { familyId: 'iow-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.6816, endT: 0.753 },
    { familyId: 'iow-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.753, endT: 0.8275 }
  ]
};
