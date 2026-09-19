import type { TrackSectionAnchorSet } from './types';

/** Mid-Ohio Sports Car Course — 2.26-mi, 13-section road course, clockwise.
 *  Official Section Results publish SEVENTEEN loop-to-loop families that chain
 *  the driving order FS - PO → Turn 1 → 1A → 1B → Turn 2 → Turn 3 → Back
 *  Stretch → Turn 4 → 5 → 6/7 → 8 → 9 → 10 → 11 → 12 → 12C → 13, covering
 *  100.0% of the lap.
 *
 *  FRONT-STRAIGHT CLOSURE (2026-09-19). The 2026-07-19 curation called the
 *  6.3% around S/F "the untimed pit/front straight (feed section SF → I1)" and
 *  left it the quiet base outline. The report does publish that span: `FS - PO`
 *  runs on every lap at a 135 mph median, and the race lane was discarding it
 *  as a pit split on the name alone. It IS feed section SF → I1 — its official
 *  time × speed length of 0.141667 mi is 8,976 feed units, loop I1 on the nose
 *  (the pit-out loop PO sits 48 units earlier, alongside the racing surface
 *  rather than in the pit lane). The seventeen families now sum to the lap.
 *
 *  PINNED FROM THE FEED LOOP DISTANCES (2026-07-19, scripts/derive-section-
 *  anchors.mjs). The RaceTools MAP package for Mid-Ohio is loop-poor — it
 *  carries only the start/finish control line and one whole-lap section (S01),
 *  no intermediate timing loops — and the archive that is filenamed "Mid-Ohio"
 *  actually contains a "Streets of Toronto" config (joined by INI Track.Name +
 *  SHA-256, never filename, so that wrong-config twin is refused). The FEED is a
 *  different, richer source: the semantic layer's decoded geometry.loopDistances
 *  carries all nineteen mainline loops (I1…I13, in feed units of 1/12 ft with
 *  S/F at 0). The sixteen family lengths that inventory yields reproduce the
 *  official time × speed lengths to the inch, and the whole-lap distance
 *  corroborates the map's single S01 section to 0.006% (feed 3634.13 m vs map
 *  3633.90 m). `startLoop`/`endLoop` now name the physical loops each span runs
 *  between (I1→I1A is Turn 1, and so on up to I13→SF for Turn 13), which is the
 *  pass-placement join key. This is racetools_capture geometry; the map [GPS]
 *  origin (a wrong-venue point) stays untrusted and is unused.
 *
 *  OUTLINE POSITIONS. The retraced road-course outline's arc-length is not
 *  proportional to real track distance, so the boundary distances are laid onto
 *  it from the visually-verified S/F datum (t=0.7135) and the confirmed corner
 *  anchors: the untimed gap sits on the front straight around S/F, Turn 1 is the
 *  first corner after S/F (arc#0), and the Turn 2 Keyhole is the sharp hairpin
 *  (arc#1), in driving order, with the S/F→Keyhole arc-length matching the
 *  measured chain to 0.0002. The feed-pinned positions reproduce the earlier
 *  chain-fit to within 0.0001 t (the outline spacing already tracked real
 *  distance through the anchors), so the debug-overlay gate still holds; the fine
 *  boundaries through the twisty middle third are now backed by measured loop
 *  distances rather than proportional tiling. Finer measured loop-crossing
 *  locations would supersede these positions the same data-only way. */
export const midOhioSportsCarCourseSections: TrackSectionAnchorSet = {
  slug: 'mid-ohio-sports-car-course',
  venueName: 'Mid-Ohio Sports Car Course',
  drivingDirection: 'clockwise',
  lapLengthMi: 2.258,
  confidence: 'anchored',
  note: 'Seventeen official loop-to-loop sections (100.0% of the lap); FS - PO is the measured S/F→I1 front-straight span (0.141667 mi = 8,976 feed units, loop I1 exactly). Section lengths and mid-lap boundaries are pinned to the feed’s decoded timing-loop distances (semantic-layer geometry.loopDistances, nineteen mainline loops I1…I13), which reproduce the official time × speed lengths to the inch and corroborate the whole-lap map section to 0.006%. Positions are laid on the distorted road-course outline from the S/F datum, with Turn 1 and the Turn 2 Keyhole confirmed on the corner arcs.',
  sections: [
    { familyId: 'mid-fs-po', sectionName: 'FS - PO', label: 'S/F → Turn 1', startT: 0.7135, endT: 0.7762, measuredLengthMi: 0.1417, startLoop: 'SF', endLoop: 'I1' },
    { familyId: 'mid-t1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.7762, endT: 0.8325, measuredLengthMi: 0.1271, startLoop: 'I1', endLoop: 'I1A' },
    { familyId: 'mid-t1a', sectionName: 'Turn 1A', label: 'Turn 1A', startT: 0.8325, endT: 0.8973, measuredLengthMi: 0.1462, startLoop: 'I1A', endLoop: 'I1B' },
    { familyId: 'mid-t1b', sectionName: 'Turn 1B', label: 'Turn 1B', startT: 0.8973, endT: 0.9464, measuredLengthMi: 0.111, startLoop: 'I1B', endLoop: 'I2' },
    { familyId: 'mid-t2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.9464, endT: 0.0236, measuredLengthMi: 0.1742, startLoop: 'I2', endLoop: 'I2A' },
    { familyId: 'mid-t3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.0236, endT: 0.1417, measuredLengthMi: 0.2667, startLoop: 'I2A', endLoop: 'I3' },
    { familyId: 'mid-bs', sectionName: 'Back Stretch', label: 'Back stretch', startT: 0.1417, endT: 0.2333, measuredLengthMi: 0.2068, startLoop: 'I3', endLoop: 'I4' },
    { familyId: 'mid-t4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.2333, endT: 0.2907, measuredLengthMi: 0.1297, startLoop: 'I4', endLoop: 'I5' },
    { familyId: 'mid-t5', sectionName: 'Turn 5', label: 'Turn 5', startT: 0.2907, endT: 0.3374, measuredLengthMi: 0.1055, startLoop: 'I5', endLoop: 'I6' },
    { familyId: 'mid-t67', sectionName: 'Turn 6/7', label: 'Turns 6/7', startT: 0.3374, endT: 0.3999, measuredLengthMi: 0.1411, startLoop: 'I6', endLoop: 'I8' },
    { familyId: 'mid-t8', sectionName: 'Turn 8', label: 'Turn 8', startT: 0.3999, endT: 0.4269, measuredLengthMi: 0.061, startLoop: 'I8', endLoop: 'I9' },
    { familyId: 'mid-t9', sectionName: 'Turn 9', label: 'Turn 9', startT: 0.4269, endT: 0.4948, measuredLengthMi: 0.1532, startLoop: 'I9', endLoop: 'I10' },
    { familyId: 'mid-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.4948, endT: 0.5624, measuredLengthMi: 0.1528, startLoop: 'I10', endLoop: 'I11' },
    { familyId: 'mid-t11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.5624, endT: 0.6212, measuredLengthMi: 0.1328, startLoop: 'I11', endLoop: 'I12' },
    { familyId: 'mid-t12', sectionName: 'Turn 12', label: 'Turn 12', startT: 0.6212, endT: 0.6622, measuredLengthMi: 0.0924, startLoop: 'I12', endLoop: 'I12C' },
    { familyId: 'mid-t12c', sectionName: 'Turn 12C', label: 'Turn 12C', startT: 0.6622, endT: 0.6776, measuredLengthMi: 0.0348, startLoop: 'I12C', endLoop: 'I13' },
    { familyId: 'mid-t13', sectionName: 'Turn 13', label: 'Turn 13', startT: 0.6776, endT: 0.7135, measuredLengthMi: 0.0811, startLoop: 'I13', endLoop: 'SF' }
  ]
};
