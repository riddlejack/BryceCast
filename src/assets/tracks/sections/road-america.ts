import type { TrackSectionAnchorSet } from './types';

/** Road America — 4.05-mi, 14-turn natural-terrain road course, clockwise.
 *  FIRST road-course section-heat venue (Phase 3, Group A).
 *
 *  Unlike the ovals (turn-named families) Road America's official PDF section
 *  families ARE named by their bounding timing loops — "SF to I1B", "I1 to I2",
 *  … "I15 to SF". Those loop names (I1B, I3A, I11B, I13A, I15C, I15) live in the
 *  data lake track-map catalog's 45-section Road America package
 *  (INI Track.Name "Road America", control line I13A, SHA b54ec608…; joined by
 *  INI name + SHA, never filename — catalog consumerGuard). Each loop's decoded
 *  LapDistance, re-referenced to the S/F line, gives every family span in real
 *  metres; the map lap closes at 6459.91 m = 4.014 mi.
 *
 *  Distance→t: OSM outline arc-length is not proportional to real track distance
 *  (the Nashville wiring lesson), so spans map to the outline's [0,1] arc-length
 *  param anchored at the S/F line. Verified faithful on the debug overlay
 *  (scripts/roadcourse-anchor-lab.mjs): the corner apexes a0/a1/a2 land on loops
 *  I3/I5/I7 to within 0.003 t, and a6 on I13 to 0.003 — the proportional map is
 *  accurate to ~20 m across the anchored chain, so no control points are needed.
 *  Every single-loop family's measured PDF length (time × avg speed) reproduces
 *  its map loop-to-loop distance to sub-metre precision.
 *
 *  Two families carry CONCATENATED names ("I10 to I11 I11 to I11B" and
 *  "I11B to I12 … I15C to I15"). Their measured PDF length (0.2566 mi, 0.1085 mi)
 *  uniquely fingerprints ONE real timed sub-section inside the named loop range —
 *  I11→I11B and I13→I13A respectively (exact map-section length match) — with the
 *  remaining named span absorbed by the pack's `Untimed remainder`. They are
 *  anchored to that fingerprinted sub-span; `sectionName` stays the full pack
 *  string (the join key). The 16 measured families cover 72.7% of the lap; the
 *  untimed sweeps (Moraine, Kettle Bottoms, the S/F straight) stay the quiet base
 *  outline — honest gaps, not coloured spans. Positions may later be superseded
 *  by measured loop-crossing geometry arriving through the same contract. */
export const roadAmericaSections: TrackSectionAnchorSet = {
  slug: 'road-america',
  venueName: 'Road America',
  drivingDirection: 'clockwise',
  lapLengthMi: 4.014,
  confidence: 'anchored',
  note: 'Sixteen official loop-to-loop timing sections covering 72.7% of the lap, anchored from the data lake 45-section map package (loop LapDistance re-referenced to S/F). Two concatenated-name families are anchored to the single measured sub-section their PDF length fingerprints. The untimed sweeps stay the base outline.',
  sections: [
    { familyId: 'ra-sf-i1b', sectionName: 'SF to I1B', label: 'S/F→I1B', startLoop: 'SF', endLoop: 'I1B', startT: 0.0965, endT: 0.1551, measuredLengthMi: 0.2354 },
    { familyId: 'ra-i1b-i1', sectionName: 'I1B to I1', label: 'I1B→I1', startLoop: 'I1B', endLoop: 'I1', startT: 0.1551, endT: 0.1654, measuredLengthMi: 0.0411 },
    { familyId: 'ra-i1-i2', sectionName: 'I1 to I2', label: 'I1→I2', startLoop: 'I1', endLoop: 'I2', startT: 0.1654, endT: 0.2205, measuredLengthMi: 0.2212 },
    { familyId: 'ra-i2-i3', sectionName: 'I2 to I3', label: 'I2→I3', startLoop: 'I2', endLoop: 'I3', startT: 0.2205, endT: 0.26, measuredLengthMi: 0.1589 },
    { familyId: 'ra-i3-i3a', sectionName: 'I3 to I3A', label: 'I3→I3A', startLoop: 'I3', endLoop: 'I3A', startT: 0.26, endT: 0.3243, measuredLengthMi: 0.2578 },
    { familyId: 'ra-i3a-i4', sectionName: 'I3A to I4', label: 'I3A→I4', startLoop: 'I3A', endLoop: 'I4', startT: 0.3243, endT: 0.3719, measuredLengthMi: 0.1913 },
    { familyId: 'ra-i4-i4a', sectionName: 'I4 to I4A', label: 'I4→I4A', startLoop: 'I4', endLoop: 'I4A', startT: 0.3719, endT: 0.4151, measuredLengthMi: 0.1735 },
    { familyId: 'ra-i4a-i5', sectionName: 'I4A to I5', label: 'I4A→I5', startLoop: 'I4A', endLoop: 'I5', startT: 0.4151, endT: 0.4499, measuredLengthMi: 0.1396 },
    { familyId: 'ra-i5-i6', sectionName: 'I5 to I6', label: 'I5→I6', startLoop: 'I5', endLoop: 'I6', startT: 0.4499, endT: 0.4846, measuredLengthMi: 0.1394 },
    { familyId: 'ra-i6-i7', sectionName: 'I6 to I7', label: 'I6→I7', startLoop: 'I6', endLoop: 'I7', startT: 0.4846, endT: 0.532, measuredLengthMi: 0.1902 },
    { familyId: 'ra-i7-i8', sectionName: 'I7 to I8', label: 'I7→I8', startLoop: 'I7', endLoop: 'I8', startT: 0.532, endT: 0.5953, measuredLengthMi: 0.2542 },
    { familyId: 'ra-i8-i9', sectionName: 'I8 to I9', label: 'I8→I9', startLoop: 'I8', endLoop: 'I9', startT: 0.5953, endT: 0.6304, measuredLengthMi: 0.1407 },
    { familyId: 'ra-i9-i10', sectionName: 'I9 to I10', label: 'I9→I10', startLoop: 'I9', endLoop: 'I10', startT: 0.6304, endT: 0.6859, measuredLengthMi: 0.2227 },
    /* Concatenated-name family → drawn at fingerprinted sub-section I11→I11B; the
     * measuredLengthMi is the FULL official family length (what the loops measure). */
    { familyId: 'ra-i11-i11b', sectionName: 'I10 to I11 I11 to I11B', label: 'I11→I11B', startLoop: 'I11', endLoop: 'I11B', startT: 0.7569, endT: 0.8209, measuredLengthMi: 0.2566 },
    /* Concatenated-name family → drawn at fingerprinted sub-section I13→I13A; the
     * measuredLengthMi is the FULL official family length. */
    { familyId: 'ra-i13-i13a', sectionName: 'I11B to I12 I12 to I13 I13 to I13A I13A to I14 I14 to I15C I15C to I15', label: 'I13→I13A', startLoop: 'I13', endLoop: 'I13A', startT: 0.9365, endT: 0.9636, measuredLengthMi: 0.1085 },
    { familyId: 'ra-i15-sf', sectionName: 'I15 to SF', label: 'I15→S/F', startLoop: 'I15', endLoop: 'SF', startT: 0.05, endT: 0.0965, measuredLengthMi: 0.1864 }
  ]
};
