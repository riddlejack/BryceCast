import type { TrackSectionAnchorSet } from './types';

/** Barber Motorsports Park — 2.38-mi, 17-turn road course, clockwise.
 *  Road-course section-heat venue (Phase 3, Group A).
 *
 *  Barber's official PDF section families are turn-named ("Turns 1-3", "Turn 4",
 *  … "Turn 17"). Each maps to ONE timing-loop section in the data lake track-map
 *  catalog's 30-section Barber package (INI Track.Name "Barber Motorsports Park",
 *  control line SF, SHA 809f49c3…; joined by INI name + SHA, never filename) — the
 *  join is proven by the map section's decoded `length` reproducing the measured
 *  PDF family length to 4 decimals (e.g. "Turn 7" = map S4 I3→I4 = 0.2883 mi).
 *  Each loop's LapDistance, re-referenced to the S/F line, gives the span in real
 *  metres; the map lap closes at 3701.49 m = 2.30 mi (the timing lap; the OSM
 *  outline draws the 2.38-mi official length — a scale offset that does not move
 *  the relative anchor positions).
 *
 *  Distance→t maps to the outline's [0,1] arc-length param anchored at the S/F
 *  line (OSM arc-length is not proportional to real distance — Nashville lesson).
 *  Verified faithful on the debug overlay (scripts/roadcourse-anchor-lab.mjs):
 *  corner apex a2 lands on loop I2 (0.003 t) and a8 on I8 at the Turn 17 entry —
 *  no control points needed. The official report now exposes the previously
 *  concatenated final sector as separate fields: Turns 12-13 is I6→I7 and Turns
 *  14-16 is I7→I8. FS-PO is the measured SF→I1 span. Together the eleven fields
 *  tile the timing lap. */
export const barberMotorsportsParkSections: TrackSectionAnchorSet = {
  slug: 'barber-motorsports-park',
  venueName: 'Barber Motorsports Park',
  drivingDirection: 'clockwise',
  lapLengthMi: 2.30,
  confidence: 'anchored',
  note: 'Eleven official timing sections anchored from the data lake map package. The newly separated FS-PO, Turns 12-13, and Turns 14-16 fields match SF→I1, I6→I7, and I7→I8 respectively by time × speed length and tile the timing lap with the other turn sections.',
  sections: [
    { familyId: 'bmp-fs-po', sectionName: 'FS-PO', label: 'S/F → pit out', startLoop: 'SF', endLoop: 'I1', startT: 0.9630, endT: 0.0070, measuredLengthMi: 0.0845 },
    { familyId: 'bmp-turns-1-3', sectionName: 'Turns 1-3', label: 'Turns 1–3', startLoop: 'I1', endLoop: 'I2', startT: 0.007, endT: 0.1323, measuredLengthMi: 0.2883 },
    { familyId: 'bmp-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startLoop: 'I2', endLoop: 'I3A', startT: 0.1323, endT: 0.2483, measuredLengthMi: 0.2667 },
    { familyId: 'bmp-turns-5-6', sectionName: 'Turns 5-6', label: 'Turns 5–6', startLoop: 'I3A', endLoop: 'I3', startT: 0.2483, endT: 0.2966, measuredLengthMi: 0.1112 },
    { familyId: 'bmp-turn-7', sectionName: 'Turn 7', label: 'Turn 7', startLoop: 'I3', endLoop: 'I4', startT: 0.2966, endT: 0.4219, measuredLengthMi: 0.2883 },
    { familyId: 'bmp-turns-8-9', sectionName: 'Turns 8-9', label: 'Turns 8–9', startLoop: 'I4', endLoop: 'I5A', startT: 0.4219, endT: 0.5004, measuredLengthMi: 0.1805 },
    { familyId: 'bmp-turn-10', sectionName: 'Turn 10', label: 'Turn 10', startLoop: 'I5A', endLoop: 'I5', startT: 0.5004, endT: 0.5663, measuredLengthMi: 0.1515 },
    { familyId: 'bmp-turn-11', sectionName: 'Turn 11', label: 'Turn 11', startLoop: 'I5', endLoop: 'I6', startT: 0.5663, endT: 0.6752, measuredLengthMi: 0.2506 },
    { familyId: 'bmp-turns-12-13', sectionName: 'Turns 12-13', label: 'Turns 12–13', startLoop: 'I6', endLoop: 'I7', startT: 0.6752, endT: 0.7617, measuredLengthMi: 0.1989 },
    { familyId: 'bmp-turns-14-16', sectionName: 'Turns 14-16', label: 'Turns 14–16', startLoop: 'I7', endLoop: 'I8', startT: 0.7617, endT: 0.8344, measuredLengthMi: 0.1672 },
    { familyId: 'bmp-turn-17', sectionName: 'Turn 17', label: 'Turn 17', startLoop: 'I8', endLoop: 'SF', startT: 0.8344, endT: 0.963, measuredLengthMi: 0.2958 }
  ]
};
