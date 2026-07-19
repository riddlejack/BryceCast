import type { TrackSectionAnchorSet } from './types';

/** The Milwaukee Mile — 1.015-mi flat oval, counterclockwise. Official section
 *  results report SEVEN loop-to-loop sections chaining T1 → SS1 → T2 → BS →
 *  T3 → SS2 → T4 → FS and covering 79.6% of the lap; the S/F stretch
 *  (FS loop → S/F → T1 loop) is untimed and stays the base outline.
 *
 *  Span LENGTHS are MEASURED from official time x speed (constant per family;
 *  lap total reproduces 1.0150 mi exactly). The chain's start offset was fitted
 *  so the T1 arc sits inside the T1 section, the T2 arc inside the SS1→BS
 *  sections, the turns 3-4 arc inside the BS→T4 sections, and the S/F tick in
 *  the untimed gap (offset 0.9495, min margin 0.0070 —
 *  scripts/compute-section-anchors.mjs), then verified against the debug
 *  overlay. Loop positions may later be superseded by measured timing-loop
 *  locations arriving through the same contract. */
export const theMilwaukeeMileSections: TrackSectionAnchorSet = {
  slug: 'the-milwaukee-mile',
  venueName: 'The Milwaukee Mile',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Seven official loop-to-loop sections; lengths measured from official time x speed, chain offset fitted to the corner arcs. The start/finish stretch is untimed and stays the base outline.',
  sections: [
    { familyId: 'mil-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.9495, endT: 0.0738 },
    { familyId: 'mil-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.0738, endT: 0.2165 },
    { familyId: 'mil-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.2165, endT: 0.3124 },
    { familyId: 'mil-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.3124, endT: 0.3861 },
    { familyId: 'mil-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.3861, endT: 0.5005 },
    { familyId: 'mil-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.5005, endT: 0.6153 },
    { familyId: 'mil-t4-fs', sectionName: 'T4 to FS', label: 'T4 → frontstretch', startT: 0.6153, endT: 0.7457 }
  ]
};
