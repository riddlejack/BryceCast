import type { TrackSectionAnchorSet } from './types';

/** Streets of St. Petersburg — 1.800-mi airport-and-waterfront street circuit,
 * clockwise. The outline is the RaceTools centreline at roughly one-metre
 * resolution with S/F at path t=0. The semantic race record independently
 * carries the complete S/F-referenced timing-loop distances (114,048 inches per
 * lap), so distance/lap maps each official section boundary directly to this
 * outline. This replaces the former fitted-offset approximation.
 *
 * Provenance: geometry record in
 * analysis/semantic-layer/output/sessions/
 * rt_2024_st-petersburg-street-circuit_r_2024-03-10_a.ndjson.gz.
 * The official time x speed section lengths reproduce every interval below:
 * FS-PO=S1, Turn 1=S2, Turns 2/3=S3, Turn 4=S4A, Turns 5-8=S4B,
 * Turn 9=S5A, Turn 9a=S5B, Turn 10=S6A, Turns 11/12=S6B,
 * Turns 13/14=S7, and FS-PI=S8. Together they tile the full lap. */
export const streetsOfStPetersburgSections: TrackSectionAnchorSet = {
  slug: 'streets-of-st-petersburg',
  venueName: 'Streets of St. Petersburg',
  drivingDirection: 'clockwise',
  lapLengthMi: 1.8,
  confidence: 'anchored',
  note: 'Eleven official timing sections tile the full lap. Boundaries use the semantic RaceTools record’s complete S/F-referenced loop distances on the matching centreline outline; official time x speed independently reproduces each section length.',
  sections: [
    { familyId: 'stp-fs-po', sectionName: 'FS-PO', label: 'S/F→PO', startT: 0, endT: 0.0722854, startLoop: 'SF', endLoop: 'I1', measuredLengthMi: 0.130114 },
    { familyId: 'stp-t1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.0722854, endT: 0.1541456, startLoop: 'I1', endLoop: 'I2', measuredLengthMi: 0.147348 },
    { familyId: 'stp-t23', sectionName: 'Turns 2/3', label: 'Turns 2–3', startT: 0.1541456, endT: 0.2897727, startLoop: 'I2', endLoop: 'I3', measuredLengthMi: 0.244129 },
    { familyId: 'stp-t4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.2897727, endT: 0.3595328, startLoop: 'I3', endLoop: 'I4A', measuredLengthMi: 0.125568 },
    { familyId: 'stp-t58', sectionName: 'Turns 5-8', label: 'Turns 5–8', startT: 0.3595328, endT: 0.453388, startLoop: 'I4A', endLoop: 'I4', measuredLengthMi: 0.168939 },
    { familyId: 'stp-t9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.453388, endT: 0.4912668, startLoop: 'I4', endLoop: 'I5A', measuredLengthMi: 0.068182 },
    { familyId: 'stp-t9a', sectionName: 'Turn 9a', label: 'Turn 9a', startT: 0.4912668, endT: 0.6280513, startLoop: 'I5A', endLoop: 'I5', measuredLengthMi: 0.246212 },
    { familyId: 'stp-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.6280513, endT: 0.6993897, startLoop: 'I5', endLoop: 'I6A', measuredLengthMi: 0.128409 },
    { familyId: 'stp-t1112', sectionName: 'Turns 11/12', label: 'Turns 11–12', startT: 0.6993897, endT: 0.7976641, startLoop: 'I6A', endLoop: 'I6', measuredLengthMi: 0.176894 },
    { familyId: 'stp-t1314', sectionName: 'Turns 13/14', label: 'Turns 13–14', startT: 0.7976641, endT: 0.9084596, startLoop: 'I6', endLoop: 'I7', measuredLengthMi: 0.199432 },
    { familyId: 'stp-fs-pi', sectionName: 'FS-PI', label: 'PI→S/F', startT: 0.9084596, endT: 0, startLoop: 'I7', endLoop: 'SF', measuredLengthMi: 0.164773 }
  ]
};
