import type { TrackSectionAnchorSet } from './types';

/** Nashville Superspeedway — 1.33-mi D-shaped concrete oval, counterclockwise.
 *  Official section results report THREE timing sections (see
 *  analysis/indy-nxt-race-lap-section-enhancement). The long frontstretch that
 *  carries the start/finish line is NOT a reported section, so it stays the
 *  quiet base outline — an honest gap, not a coloured span.
 *
 *  Anchor t-values from scripts/compute-section-anchors.mjs (S/F t=0.8584;
 *  arc "1·2" entry 0.1998 / exit 0.2861; arc "3" entry 0.6859 / exit 0.7211;
 *  arc "4" entry 0.7653 / exit 0.8189) and verified against the debug overlay:
 *  the compound span covers T1–T2 and the back straight, Turn 3 and Turn 4 sit
 *  on their arcs, the S/F tick falls in the uncoloured frontstretch. */
export const nashvilleSuperspeedwaySections: TrackSectionAnchorSet = {
  slug: 'nashville-superspeedway',
  venueName: 'Nashville Superspeedway',
  drivingDirection: 'counterclockwise',
  confidence: 'anchored',
  note: 'Three official timing sections anchored to corner-arc geometry; the start/finish frontstretch is not a reported section and stays the base outline.',
  sections: [
    {
      familyId: 'nsh-t1-t2-backstretch',
      sectionName: 'Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch',
      label: 'Turns 1–2 · back straight',
      startT: 0.1998,
      endT: 0.6859
    },
    {
      familyId: 'nsh-turn-3',
      sectionName: 'Turn 3',
      label: 'Turn 3',
      startT: 0.6859,
      endT: 0.7432
    },
    {
      familyId: 'nsh-turn-4',
      sectionName: 'Turn 4 Entry Turn 4 Exit',
      label: 'Turn 4',
      startT: 0.7432,
      endT: 0.8189
    }
  ]
};
