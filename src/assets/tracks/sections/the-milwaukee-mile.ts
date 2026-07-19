import type { TrackSectionAnchorSet } from './types';

/** The Milwaukee Mile — 1.015-mi flat oval, counterclockwise. Official section
 *  results report SEVEN timing sections named by their loop endpoints
 *  (T1→SS1→T2→BS→T3→SS2→T4→FS), tiling nearly the whole lap.
 *
 *  Anchored to the three detected corner arcs (T1 apex t≈0.979, T2 apex
 *  t≈0.128, turns 3–4 apex t≈0.504) with the SS1/BS/SS2/FS split loops
 *  distributed on the straights between them. APPROXIMATE until measured loop
 *  locations arrive through the data lake's timing-map archives. */
export const theMilwaukeeMileSections: TrackSectionAnchorSet = {
  slug: 'the-milwaukee-mile',
  venueName: 'The Milwaukee Mile',
  drivingDirection: 'counterclockwise',
  confidence: 'approximate',
  note: 'Seven official timing sections placed between the three detected corner arcs; split-loop boundaries are approximate pending measured loop locations.',
  sections: [
    { familyId: 'mil-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.9793, endT: 0.0537 },
    { familyId: 'mil-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.0537, endT: 0.1281 },
    { familyId: 'mil-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.1281, endT: 0.3 },
    { familyId: 'mil-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.3, endT: 0.4694 },
    { familyId: 'mil-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.4694, endT: 0.5036 },
    { familyId: 'mil-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.5036, endT: 0.5501 },
    { familyId: 'mil-t4-fs', sectionName: 'T4 to FS', label: 'T4 → frontstretch', startT: 0.5501, endT: 0.9421 }
  ]
};
