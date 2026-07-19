import type { TrackSectionAnchorSet } from './types';

/** Streets of Detroit — 1.645-mi / 2647-m downtown street circuit (the 2023+
 *  layout), counterclockwise. Rebuilt from the RaceTools "Detroit Street
 *  Circuit" map package polyline (SHA-256 d96f8806…, joined by INI Track.Name),
 *  so the outline IS the racing line at ~1-m resolution and distance→path-t is
 *  exact (max drift 1 m vs the simplified path).
 *
 *  The official Section Results report EIGHTEEN loop-to-loop families that tile
 *  the FULL lap: SF → I1 → I2A → I2 → I3 → … → I16 → SF (the odd-one-out family
 *  "Back Str 2" is the I13→I14 back-straight link). Span LENGTHS are MEASURED
 *  from official time × speed (constant per family; the eighteen reproduce
 *  1.6445 mi = 99.97% of the 1.6450-mi measured lap). Because the chain tiles
 *  the whole lap it has ZERO free parameters: boundary 0 sits on the S/F line
 *  (the polyline datum, path-t 0) and every later boundary is the cumulative
 *  measured length converted through the outline's own distance table. Verified
 *  against the regenerated debug overlay. Loop positions may later be superseded
 *  by measured timing-loop locations arriving through the same contract. */
export const streetsOfDetroitSections: TrackSectionAnchorSet = {
  slug: 'streets-of-detroit',
  venueName: 'Streets of Detroit',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Eighteen official loop-to-loop sections tiling the full lap; lengths measured from official time × speed, anchored with zero free parameters at the S/F line (the map polyline datum) and converted through the outline distance table. Every stretch of the lap is loop-timed.',
  sections: [
    { familyId: 'det-sf-i1', sectionName: 'SF to I1', label: 'S/F → I1', startT: 0.0, endT: 0.0642 },
    { familyId: 'det-i1-i2a', sectionName: 'I1 to I2A', label: 'I1 → I2A', startT: 0.0642, endT: 0.0983 },
    { familyId: 'det-i2a-i2', sectionName: 'I2A to I2', label: 'I2A → I2', startT: 0.0983, endT: 0.124 },
    { familyId: 'det-i2-i3', sectionName: 'I2 to I3', label: 'I2 → I3', startT: 0.124, endT: 0.2113 },
    { familyId: 'det-i3-i4', sectionName: 'I3 to I4', label: 'I3 → I4', startT: 0.2113, endT: 0.3111 },
    { familyId: 'det-i4-i5', sectionName: 'I4 to I5', label: 'I4 → I5', startT: 0.3111, endT: 0.4348 },
    { familyId: 'det-i5-i6', sectionName: 'I5 to I6', label: 'I5 → I6', startT: 0.4348, endT: 0.5188 },
    { familyId: 'det-i6-i7', sectionName: 'I6 to I7', label: 'I6 → I7', startT: 0.5188, endT: 0.5794 },
    { familyId: 'det-i7-i8', sectionName: 'I7 to I8', label: 'I7 → I8', startT: 0.5794, endT: 0.6121 },
    { familyId: 'det-i8-i9', sectionName: 'I8 to I9', label: 'I8 → I9', startT: 0.6121, endT: 0.6429 },
    { familyId: 'det-i9-i10', sectionName: 'I9 to I10', label: 'I9 → I10', startT: 0.6429, endT: 0.6818 },
    { familyId: 'det-i10-i11', sectionName: 'I10 to I11', label: 'I10 → I11', startT: 0.6818, endT: 0.7259 },
    { familyId: 'det-i11-i12', sectionName: 'I11 to 12', label: 'I11 → I12', startT: 0.7259, endT: 0.7811 },
    { familyId: 'det-i12-i13', sectionName: 'I12 to I13', label: 'I12 → I13', startT: 0.7811, endT: 0.8379 },
    { familyId: 'det-backstr2', sectionName: 'Back Str 2', label: 'Back straight (I13 → I14)', startT: 0.8379, endT: 0.8781 },
    { familyId: 'det-i14-i15', sectionName: 'I14 to I15', label: 'I14 → I15', startT: 0.8781, endT: 0.92 },
    { familyId: 'det-i15-i16', sectionName: 'I15 to I16', label: 'I15 → I16', startT: 0.92, endT: 0.9507 },
    { familyId: 'det-i16-sf', sectionName: 'I16 to SF', label: 'I16 → S/F', startT: 0.9507, endT: 0.0 }
  ]
};
