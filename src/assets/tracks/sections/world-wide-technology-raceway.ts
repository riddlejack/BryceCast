import type { TrackSectionAnchorSet } from './types';

/** World Wide Technology Raceway (Gateway) — 1.25-mi egg-shaped oval,
 *  counterclockwise. Official section results report SIX timing sections
 *  ("Turn 1"–"Turn 4" plus back-straight sections "BS - T2" and "BS - T3").
 *
 *  The egg-shaped geometry confused the outline's automatic arc detector
 *  (spurious turn magnitudes), so these spans are placed proportionally from
 *  the start/finish anchor (t≈0.195) through the tight turns 1–2 (arc t≈0.24)
 *  and the sweeping turns 3–4 (arc t≈0.66). LEAST CERTAIN of the four ovals —
 *  flagged for the measured loop locations from the data lake's timing-map
 *  archives, which should replace this curation venue-first. */
export const worldWideTechnologyRacewaySections: TrackSectionAnchorSet = {
  slug: 'world-wide-technology-raceway',
  venueName: 'World Wide Technology Raceway',
  drivingDirection: 'counterclockwise',
  confidence: 'approximate',
  note: 'Six official timing sections placed proportionally; the egg-shaped outline defeated automatic arc detection, so span boundaries are provisional and should be replaced first by measured loop locations.',
  sections: [
    { familyId: 'wwt-turn-1', sectionName: 'Turn 1', label: 'Turn 1', startT: 0.2147, endT: 0.2691 },
    { familyId: 'wwt-turn-2', sectionName: 'Turn 2', label: 'Turn 2', startT: 0.2691, endT: 0.33 },
    { familyId: 'wwt-bs-t2', sectionName: 'BS - T2', label: 'BS – T2', startT: 0.33, endT: 0.44 },
    { familyId: 'wwt-bs-t3', sectionName: 'BS - T3', label: 'BS – T3', startT: 0.44, endT: 0.59 },
    { familyId: 'wwt-turn-3', sectionName: 'Turn 3', label: 'Turn 3', startT: 0.59, endT: 0.655 },
    { familyId: 'wwt-turn-4', sectionName: 'Turn 4', label: 'Turn 4', startT: 0.655, endT: 0.7185 }
  ]
};
