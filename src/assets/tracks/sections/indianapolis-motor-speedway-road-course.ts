import type { TrackSectionAnchorSet } from './types';

/** Indianapolis Motor Speedway Road Course — official 2.439-mile INDYCAR
 * timing-map geometry. The former asset followed a 4.171-km OpenStreetMap way:
 * 6.26% longer than the official 3.925-km layout, with S/F on a curve and extra
 * bends. This outline instead traces the official section map embedded on page
 * 97 of the 2026 Indianapolis GP Section Data Report. Every boundary below is
 * placed at the matching cut drawn on that map and named by the semantic feed's
 * complete S/F-referenced loop chain (154,536 inches per lap). Measured lengths
 * are the official section-legend distances. The qualifying pack's `FS - PO`
 * and `FS - PI` fields are S1A and S10, so all thirteen segments tile the lap. */
export const indianapolisMotorSpeedwayRoadCourseSections: TrackSectionAnchorSet = {
  slug: 'indianapolis-motor-speedway-road-course',
  venueName: 'Indianapolis Motor Speedway Road Course',
  drivingDirection: 'clockwise',
  lapLengthMi: 2.439,
  confidence: 'anchored',
  note: 'Thirteen official qualifying sections tile the full lap. Each boundary is placed at its matching timing cut on the INDYCAR Timing & Scoring 2.439-mile section map and identified by the semantic feed’s measured loop chain.',
  sections: [
    { familyId: 'ims-fs-po', sectionName: 'FS - PO', label: 'S/F→I1B', startT: 0, endT: 0.1043671, startLoop: 'SF', endLoop: 'I1B', measuredLengthMi: 0.200379 },
    { familyId: 'ims-fs-po2', sectionName: 'FS - PO 2', label: 'I1B→I1', startT: 0.1043671, endT: 0.1264447, startLoop: 'I1B', endLoop: 'I1', measuredLengthMi: 0.053788 },
    { familyId: 'ims-t12', sectionName: 'Turn 1/2', label: 'Turns 1–2', startT: 0.1264447, endT: 0.1993009, startLoop: 'I1', endLoop: 'I2', measuredLengthMi: 0.25284 },
    { familyId: 'ims-t3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.1993009, endT: 0.2653332, startLoop: 'I2', endLoop: 'I3A', measuredLengthMi: 0.108523 },
    { familyId: 'ims-t456', sectionName: 'Turn 4/5/6', label: 'Turns 4–6', startT: 0.2653332, endT: 0.3189216, startLoop: 'I3A', endLoop: 'I3', measuredLengthMi: 0.232196 },
    { familyId: 'ims-backstretch', sectionName: 'Backstretch', label: 'Backstretch', startT: 0.3189216, endT: 0.4651359, startLoop: 'I3', endLoop: 'I4', measuredLengthMi: 0.341287 },
    { familyId: 'ims-t7', sectionName: 'Turn 7', label: 'Turn 7', startT: 0.4651359, endT: 0.5224374, startLoop: 'I4', endLoop: 'I5A', measuredLengthMi: 0.16572 },
    { familyId: 'ims-t89', sectionName: 'Turn 8/9', label: 'Turns 8–9', startT: 0.5224374, endT: 0.5782336, startLoop: 'I5A', endLoop: 'I5', measuredLengthMi: 0.129167 },
    { familyId: 'ims-t10', sectionName: 'Turn 10', label: 'Turn 10', startT: 0.5782336, endT: 0.6344313, startLoop: 'I5', endLoop: 'I6', measuredLengthMi: 0.205114 },
    { familyId: 'ims-t11', sectionName: 'Turn 11', label: 'Turn 11', startT: 0.6344313, endT: 0.7590696, startLoop: 'I6', endLoop: 'I7', measuredLengthMi: 0.195264 },
    { familyId: 'ims-t1213', sectionName: 'Turn 12/13', label: 'Turns 12–13', startT: 0.7590696, endT: 0.8445703, startLoop: 'I7', endLoop: 'I8', measuredLengthMi: 0.152462 },
    { familyId: 'ims-t14', sectionName: 'Turn 14', label: 'Turn 14', startT: 0.8445703, endT: 0.9156202, startLoop: 'I8', endLoop: 'I9', measuredLengthMi: 0.237878 },
    { familyId: 'ims-fs-pi', sectionName: 'FS - PI', label: 'I9→S/F', startT: 0.9156202, endT: 0, startLoop: 'I9', endLoop: 'SF', measuredLengthMi: 0.164394 }
  ]
};
