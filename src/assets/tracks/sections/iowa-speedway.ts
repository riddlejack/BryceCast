import type { TrackSectionAnchorSet } from './types';

/** Iowa Speedway — 0.894-mi tri-oval short track, counterclockwise. Official
 *  section results report SIX loop-to-loop sections chaining T1 → SS1 → T2 →
 *  BS → T3 → SS2 → T4 and covering 70.7% of the lap; the frontstretch
 *  (T4 loop → S/F → T1 loop, including the tri-oval dogleg) is untimed and
 *  stays the base outline.
 *
 *  Span LENGTHS are MEASURED from official time x speed (constant per family;
 *  lap total reproduces 0.8940 mi exactly). The chain's single free parameter —
 *  its start offset — was fitted so the turns 1-2 arc sits inside the T1→T2
 *  sections, the turns 3-4 arc inside the BS→T4 sections, and the S/F tick in
 *  the untimed gap (offset 0.2270, min margin 0.0244 —
 *  scripts/compute-section-anchors.mjs), then verified against the debug
 *  overlay. Loop positions may later be superseded by measured timing-loop
 *  locations arriving through the same contract. */
export const iowaSpeedwaySections: TrackSectionAnchorSet = {
  slug: 'iowa-speedway',
  venueName: 'Iowa Speedway',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Six official loop-to-loop sections; lengths measured from official time x speed, chain offset fitted to the corner arcs. The frontstretch is untimed and stays the base outline.',
  sections: [
    { familyId: 'iow-t1-ss1', sectionName: 'T1 to SS1', label: 'T1 → SS1', startT: 0.227, endT: 0.3328 },
    { familyId: 'iow-ss1-t2', sectionName: 'SS1 to T2', label: 'SS1 → T2', startT: 0.3328, endT: 0.4622 },
    { familyId: 'iow-t2-bs', sectionName: 'T2 to BS', label: 'T2 → back straight', startT: 0.4622, endT: 0.5802 },
    { familyId: 'iow-bs-t3', sectionName: 'BS to T3', label: 'Back straight → T3', startT: 0.5802, endT: 0.6984 },
    { familyId: 'iow-t3-ss2', sectionName: 'T3 to SS2', label: 'T3 → SS2', startT: 0.6984, endT: 0.8291 },
    { familyId: 'iow-ss2-t4', sectionName: 'SS2 to T4', label: 'SS2 → T4', startT: 0.8291, endT: 0.9336 }
  ]
};
