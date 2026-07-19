import type { TrackSectionAnchorSet } from './types';

/** Streets of St. Petersburg — 1.800-mi / 2897-m airport-and-waterfront street
 *  circuit, clockwise. Rebuilt from the RaceTools "StPetersburg" map package
 *  polyline (SHA-256 275f7046…), which is SECTIONLESS (no timing loops) but
 *  carries the centreline at ~1-m resolution with the S/F at distance 0, so the
 *  outline geometry, S/F, and 1.8-mi length are exact — a full correction of the
 *  old image trace (null S/F, wrong 1.12-mi length).
 *
 *  The official Section Results give EIGHT corner families covering 72.5% of the
 *  lap (Turn 1 → Turns 2/3 → Turn 4 → Turns 5-8 → Turn 9 → Turn 9a → Turn 10 →
 *  Turns 11/12 13/14). Span LENGTHS are MEASURED from official time × speed; the
 *  chain is placed by a single fitted offset (like Iowa/WWTR) that puts S/F in
 *  the untimed gap and lands 9 of the 10 detected corner arcs inside their
 *  sections. Because the package has no loop distances, the 27.5% untimed lap
 *  (the airport back straight + the S/F straight) is APPROXIMATED as one derived
 *  remainder rather than pinned per stretch — so this set is honestly
 *  'approximate', not 'anchored'. It will be superseded exactly when measured
 *  loop distances arrive through the same contract. Verified against the debug
 *  overlay for corner alignment only. */
export const streetsOfStPetersburgSections: TrackSectionAnchorSet = {
  slug: 'streets-of-st-petersburg',
  venueName: 'Streets of St. Petersburg',
  drivingDirection: 'clockwise',
  confidence: 'approximate',
  note: 'Eight official corner families (72.5% of the lap) with lengths measured from official time × speed, placed by a single fitted offset that seats S/F in the untimed gap and most corner arcs inside their sections. The map package is sectionless, so the 27.5% untimed lap is approximated as one derived remainder, not pinned per stretch — approximate until measured loop distances arrive.',
  sections: [
    { familyId: 'stp-t1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.068, endT: 0.1553 },
    { familyId: 'stp-t23', sectionName: 'Turns 2/3', label: 'Turns 2–3', startT: 0.1553, endT: 0.2852 },
    { familyId: 'stp-t4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.2852, endT: 0.3487 },
    { familyId: 'stp-t58', sectionName: 'Turns 5-8', label: 'Turns 5–8', startT: 0.3487, endT: 0.4464 },
    { familyId: 'stp-t9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.4464, endT: 0.4857 },
    { familyId: 'stp-t9a', sectionName: 'Turn 9a', label: 'Turn 9a', startT: 0.4857, endT: 0.6086 },
    { familyId: 'stp-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.6086, endT: 0.6937 },
    { familyId: 'stp-t1114', sectionName: 'Turns 11/12 Turns 13/14', label: 'Turns 11–14', startT: 0.6937, endT: 0.7966 },
    { familyId: 'stp-remainder', sectionName: 'Untimed (back straight + S/F)', label: 'Untimed stretches', startT: 0.7966, endT: 0.068, kind: 'derived_remainder' }
  ]
};
