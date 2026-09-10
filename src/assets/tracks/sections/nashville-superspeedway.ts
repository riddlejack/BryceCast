import type { TrackSectionAnchorSet } from './types';

/** Nashville Superspeedway — 1.33-mi D-shaped concrete oval, counterclockwise.
 * The corrected official-report parser preserves all eight timing columns.
 * Their order and time x speed length shares match the semantic RaceTools loop
 * chain one-for-one: SF→T1, T1→SS1, SS1→T2, T2→BS, BS→T3, T3→SS2,
 * SS2→T4, and T4→SF. The loop positions below were already calibrated to the
 * visually verified outline, so the official names can use the same measured
 * boundaries without grouping several source columns into one false family. */
export const nashvilleSuperspeedwaySections: TrackSectionAnchorSet = {
  slug: 'nashville-superspeedway',
  venueName: 'Nashville Superspeedway',
  drivingDirection: 'counterclockwise',
  lapLengthMi: 1.325,
  confidence: 'anchored',
  note: 'Eight official timing sections tile the full lap. The corrected source columns map one-for-one to the semantic RaceTools loop chain, whose boundaries are calibrated to the visually verified outline.',
  sections: [
    {
      familyId: 'nsh-official-t1-entry',
      sectionName: 'Turn 1 Entry',
      label: 'Turn 1 entry',
      startT: 0.8584,
      endT: 0.0174,
      startLoop: 'SF',
      endLoop: 'T1',
      measuredLengthMi: 0.157386
    },
    {
      familyId: 'nsh-official-t1-exit',
      sectionName: 'Turn 1 Exit',
      label: 'Turn 1 exit',
      startT: 0.0174,
      endT: 0.1998,
      startLoop: 'T1',
      endLoop: 'SS1',
      measuredLengthMi: 0.180492
    },
    {
      familyId: 'nsh-official-t2-entry',
      sectionName: 'Turn 2 Entry',
      label: 'Turn 2 entry',
      startT: 0.1998,
      endT: 0.3415,
      startLoop: 'SS1',
      endLoop: 'T2',
      measuredLengthMi: 0.188447
    },
    {
      familyId: 'nsh-official-back-entry',
      sectionName: 'BackStretch Entry',
      label: 'Backstretch entry',
      startT: 0.3415,
      endT: 0.4602,
      startLoop: 'T2',
      endLoop: 'BS',
      measuredLengthMi: 0.136174
    },
    {
      familyId: 'nsh-official-back-exit',
      sectionName: 'BackStretch Exit',
      label: 'Backstretch exit',
      startT: 0.4602,
      endT: 0.5693,
      startLoop: 'BS',
      endLoop: 'T3',
      measuredLengthMi: 0.125189
    },
    {
      familyId: 'nsh-official-t3',
      sectionName: 'Turn 3',
      label: 'Turn 3',
      startT: 0.5693,
      endT: 0.7203,
      startLoop: 'T3',
      endLoop: 'SS2',
      measuredLengthMi: 0.200758
    },
    {
      familyId: 'nsh-official-t4-entry',
      sectionName: 'Turn 4 Entry',
      label: 'Turn 4 entry',
      startT: 0.7203,
      endT: 0.8189,
      startLoop: 'SS2',
      endLoop: 'T4',
      measuredLengthMi: 0.183712
    },
    {
      familyId: 'nsh-official-t4-exit',
      sectionName: 'Turn 4 Exit',
      label: 'Turn 4 exit',
      startT: 0.8189,
      endT: 0.8584,
      startLoop: 'T4',
      endLoop: 'SF',
      measuredLengthMi: 0.152841
    }
  ]
};

/** Nashville Superspeedway — MEASURED 8-section set (lake_loop_crossings).
 *
 *  The RaceTools race-weekend capture carries the full physical timing-loop set
 *  (SF, T1, SS1, T2, BS, T3, SS2, T4), tiling the ENTIRE lap into 8 fine
 *  sub-sections. This set uses capture-native station codes for lake packs; the
 *  official set above uses the report's eight public labels at the same physical
 *  boundaries.
 *
 *  Span geometry: each boundary is a physical loop. Boundaries are anchored on
 *  the outline by REAL loop distance (the semantic layer's decoded loop
 *  LapDistance geometry — `analysis/semantic-layer/output/nashville/
 *  loop-inventory.json`) interpolated between the visually-verified control
 *  points the 3-section curation already carries: SS1=0.1998, T2=0.3415,
 *  T3=0.5693, SS2=0.7203 (the published-section boundaries, verified on the
 *  debug overlay) plus S/F=0.8584 and the Turn 4 arc exit (0.8189). The two
 *  intermediate loops (T1, BS) sit on straights, where the outline is least
 *  distorted, so real-distance interpolation is faithful there. The compound
 *  (S2B), Turn 3 (S4A), and Turn 4 (S4B) spans reproduce the published-section
 *  positions exactly — the same numbers the PDF set draws, at a finer grain.
 *  (Pure distance-proportional tiling misplaces the corners on this outline
 *  because its OSM arc-length is non-proportional to real track distance; the
 *  arc-calibrated interpolation is the honest fix — see the wiring report.)
 *
 *  `startLoop`/`endLoop` carry each span's physical loop pair — the join key
 *  for pass placement (a pass bracketed to `[A → B]` renders at that span). */
export const nashvilleSuperspeedwayMeasuredSections: TrackSectionAnchorSet = {
  slug: 'nashville-superspeedway',
  venueName: 'Nashville Superspeedway',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Eight measured timing-loop sub-sections tiling the whole lap, from the RaceTools race-weekend capture. Boundaries are physical loops anchored on the outline by decoded loop distance, calibrated to the visually-verified published-section positions.',
  sections: [
    { familyId: 'nsh-s1', sectionName: 'S1', label: 'S/F→T1', startLoop: 'SF', endLoop: 'T1', startT: 0.8584, endT: 0.0174 },
    { familyId: 'nsh-s2a', sectionName: 'S2A', label: 'T1→SS1', startLoop: 'T1', endLoop: 'SS1', startT: 0.0174, endT: 0.1998 },
    { familyId: 'nsh-s2b', sectionName: 'S2B', label: 'Turns 1–2', startLoop: 'SS1', endLoop: 'T2', startT: 0.1998, endT: 0.3415 },
    { familyId: 'nsh-s3a', sectionName: 'S3A', label: 'T2→Back', startLoop: 'T2', endLoop: 'BS', startT: 0.3415, endT: 0.4602 },
    { familyId: 'nsh-s3b', sectionName: 'S3B', label: 'Back→T3', startLoop: 'BS', endLoop: 'T3', startT: 0.4602, endT: 0.5693 },
    { familyId: 'nsh-s4a', sectionName: 'S4A', label: 'Turn 3', startLoop: 'T3', endLoop: 'SS2', startT: 0.5693, endT: 0.7203 },
    { familyId: 'nsh-s4b', sectionName: 'S4B', label: 'Turn 4', startLoop: 'SS2', endLoop: 'T4', startT: 0.7203, endT: 0.8189 },
    { familyId: 'nsh-s5', sectionName: 'S5', label: 'T4→S/F', startLoop: 'T4', endLoop: 'SF', startT: 0.8189, endT: 0.8584 }
  ]
};
