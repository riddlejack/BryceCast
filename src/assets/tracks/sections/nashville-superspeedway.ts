import type { TrackSectionAnchorSet } from './types';

/** Nashville Superspeedway — 1.33-mi D-shaped concrete oval, counterclockwise.
 *  Official section results report THREE timing sections covering 43.1% of the
 *  lap (the corners); the long frontstretch and the backstretch carry no timing
 *  loops and stay the quiet base outline — honest gaps, not coloured spans.
 *
 *  Span LENGTHS are MEASURED: official section speeds are averages, so
 *  timeSeconds x speedMph is constant per family and equals the section length
 *  (compound 0.1884 mi, Turn 3 0.2008 mi, Turn 4 0.1837 mi; lap total
 *  reproduces 1.3300 mi exactly — scripts/compute-section-anchors.mjs).
 *  Span POSITIONS are arc-anchored: the compound section starts at the turns
 *  1-2 arc entry (t 0.1998); Turn 3 and Turn 4 chain back from the S/F line so
 *  both cover their arcs (T3 arc 0.686–0.721, T4 arc 0.765–0.819). Verified
 *  against the debug overlay. Positions may later be superseded by measured
 *  timing-loop locations arriving through the same contract. */
export const nashvilleSuperspeedwaySections: TrackSectionAnchorSet = {
  slug: 'nashville-superspeedway',
  venueName: 'Nashville Superspeedway',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Three official timing sections; lengths measured from official time x speed, positions arc-anchored. The frontstretch and backstretch are not timing sections and stay the base outline.',
  sections: [
    {
      familyId: 'nsh-t1-t2-backstretch',
      sectionName: 'Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch',
      label: 'Turns 1–2',
      startT: 0.1998,
      endT: 0.3415
    },
    {
      familyId: 'nsh-turn-3',
      sectionName: 'Turn 3',
      label: 'Turn 3',
      startT: 0.5693,
      endT: 0.7203
    },
    {
      familyId: 'nsh-turn-4',
      sectionName: 'Turn 4 Entry Turn 4 Exit',
      label: 'Turn 4',
      startT: 0.7203,
      endT: 0.8584
    },
    {
      /* The derived remainder: lap time minus the three timed corner sections
       * is the exact time on the two untimed straights, ranked against the
       * field the same way. It shades the complement of the measured spans —
       * the front straight (Turn 4 exit → S/F → Turn 1 entry, wrapping) and the
       * back straight (Turn 2 exit → Turn 3) — with one combined value on both.
       * sectionName matches the pack's synthesized 'Untimed remainder' section. */
      familyId: 'nsh-untimed-remainder',
      sectionName: 'Untimed remainder',
      label: 'The straights',
      kind: 'derived_remainder',
      startT: 0.8584,
      endT: 0.1998,
      additionalSpans: [{ startT: 0.3415, endT: 0.5693 }]
    }
  ]
};

/** Nashville Superspeedway — MEASURED 8-section set (lake_loop_crossings).
 *
 *  The RaceTools race-weekend capture carries the full physical timing-loop set
 *  (SF, T1, SS1, T2, BS, T3, SS2, T4), tiling the ENTIRE lap into 8 fine
 *  sub-sections — far more than the 3 officially-published track sections
 *  (which cover ~43.8% of the lap). This set replaces the 3-section + derived-
 *  remainder treatment ON the two Nashville race pages that carry loop data
 *  (2024, 2025); the PDF set above stays the fallback for races without it.
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
