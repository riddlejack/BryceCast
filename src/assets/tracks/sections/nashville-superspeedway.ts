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
    }
  ]
};
