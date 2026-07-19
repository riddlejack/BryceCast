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
 *  no control points needed. Nine measured turn families cover 88.3% of the lap;
 *  the S/F front stretch (SF→I1, the pit line "FS-PO") and the I7→I8 link stay
 *  the quiet base outline — honest gaps. Positions may later be superseded by
 *  measured loop-crossing geometry arriving through the same contract. */
export const barberMotorsportsParkSections: TrackSectionAnchorSet = {
  slug: 'barber-motorsports-park',
  venueName: 'Barber Motorsports Park',
  drivingDirection: 'clockwise',
  confidence: 'anchored',
  note: 'Nine official turn-named timing sections covering 88.3% of the lap, anchored from the data lake 30-section map package (loop LapDistance re-referenced to S/F; family↔loop join proven by the map length reproducing each measured PDF length). The S/F front stretch and the Turn 16→17 link are not timing sections and stay the base outline.',
  sections: [
    { familyId: 'bmp-turns-1-3', sectionName: 'Turns 1-3', label: 'Turns 1–3', startLoop: 'I1', endLoop: 'I2', startT: 0.007, endT: 0.1323 },
    { familyId: 'bmp-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startLoop: 'I2', endLoop: 'I3A', startT: 0.1323, endT: 0.2483 },
    { familyId: 'bmp-turns-5-6', sectionName: 'Turns 5-6', label: 'Turns 5–6', startLoop: 'I3A', endLoop: 'I3', startT: 0.2483, endT: 0.2966 },
    { familyId: 'bmp-turn-7', sectionName: 'Turn 7', label: 'Turn 7', startLoop: 'I3', endLoop: 'I4', startT: 0.2966, endT: 0.4219 },
    { familyId: 'bmp-turns-8-9', sectionName: 'Turns 8-9', label: 'Turns 8–9', startLoop: 'I4', endLoop: 'I5A', startT: 0.4219, endT: 0.5004 },
    { familyId: 'bmp-turn-10', sectionName: 'Turn 10', label: 'Turn 10', startLoop: 'I5A', endLoop: 'I5', startT: 0.5004, endT: 0.5663 },
    { familyId: 'bmp-turn-11', sectionName: 'Turn 11', label: 'Turn 11', startLoop: 'I5', endLoop: 'I6', startT: 0.5663, endT: 0.6752 },
    { familyId: 'bmp-turns-12-16', sectionName: 'Turns 12-13 Turns 14-16', label: 'T12–16', startLoop: 'I6', endLoop: 'I7', startT: 0.6752, endT: 0.7617 },
    { familyId: 'bmp-turn-17', sectionName: 'Turn 17', label: 'Turn 17', startLoop: 'I8', endLoop: 'SF', startT: 0.8344, endT: 0.963 }
  ]
};
