import assert from 'node:assert/strict';
import type { RaceStoryPack } from '../src/data/raceStory';
import {
  resolveHeatSections,
  sectionObservationsFromRaceStory
} from '../src/data/sectionObservations';
import { trackSectionsFor } from '../src/assets/tracks/sections';

/** Guards the Section Intelligence adapter-contract (Brief H). The v1 producer
 *  transforms a race-story pack; a future lake producer must fill the same
 *  shape, so these assertions pin the contract, the geometry join, the top-2
 *  gold-dot logic, and wrap-seam resolution. */

const nashvilleStory = {
  sessionId: 'session_indy_nxt_2024_6323',
  seasonYear: 2024,
  track: { name: 'Nashville Superspeedway', type: 'oval' },
  sections: {
    comparisonRows: 57,
    medianPercentile: 0.47,
    best: [
      { name: 'Turn 4 Entry Turn 4 Exit', percentile: 0.51 },
      { name: 'Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch', percentile: 0.5 },
      { name: 'Turn 3', percentile: 0.45 }
    ],
    weakest: [
      { name: 'Turn 3', percentile: 0.45 },
      { name: 'Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch', percentile: 0.5 },
      { name: 'Turn 4 Entry Turn 4 Exit', percentile: 0.51 }
    ],
    sourceState: 'official_section_results',
    caveat: 'low-denominator comparisons suppressed'
  }
} as unknown as RaceStoryPack;

// 1. v1 producer shape
const set = sectionObservationsFromRaceStory(nashvilleStory);
assert.ok(set, 'set produced');
assert.equal(set!.scope.kind, 'full_race');
assert.equal(set!.sourceTier, 'parsed_pdf_aggregate');
assert.equal(set!.comparisonRows, 57);
assert.equal(set!.sections.length, 3, 'union recovers all three families');
assert.ok(
  set!.sections.every((s) => s.observationCount === null),
  'per-section counts null in v1 (lake fills them)'
);

// 2. null-safe
assert.equal(sectionObservationsFromRaceStory({ sections: null } as unknown as RaceStoryPack), null);

// 3. geometry join + top-2 gold dots
const anchors = trackSectionsFor('Nashville Superspeedway');
assert.ok(anchors, 'Nashville anchors resolve');
assert.equal(anchors!.confidence, 'anchored');
const resolved = resolveHeatSections(anchors!, set!);
assert.equal(resolved.length, 3, 'all three anchored sections join to observations');
const top = resolved.filter((r) => r.isTopSection).map((r) => r.sectionName).sort();
assert.deepEqual(
  top,
  ['Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch', 'Turn 4 Entry Turn 4 Exit'].sort(),
  'top-2 by percentile (0.51, 0.50) get gold dots, not Turn 3 (0.45)'
);
const turn3 = resolved.find((r) => r.sectionName === 'Turn 3');
assert.equal(turn3!.isTopSection, false);
assert.equal(turn3!.label, 'Turn 3');

// 4. wrap-seam section resolves (Milwaukee mil-t1-ss1 spans 0.979 -> 0.054)
const mil = trackSectionsFor('The Milwaukee Mile');
assert.ok(mil);
const wrap = mil!.sections.find((s) => s.startT > s.endT);
assert.ok(wrap, 'Milwaukee has a wrap-seam section');
const milSet = sectionObservationsFromRaceStory({
  sessionId: 's',
  seasonYear: 2024,
  track: { name: 'The Milwaukee Mile', type: 'oval' },
  sections: {
    comparisonRows: 100,
    medianPercentile: 0.5,
    best: mil!.sections.map((s, i) => ({ name: s.sectionName, percentile: 0.4 + i * 0.05 })),
    weakest: [],
    sourceState: 'official_section_results',
    caveat: 'x'
  }
} as unknown as RaceStoryPack);
const milResolved = resolveHeatSections(mil!, milSet!);
assert.ok(
  milResolved.some((r) => r.startT > r.endT),
  'wrap-seam section survives the join'
);

// 5. lookup + alias + unknown
assert.equal(trackSectionsFor('Gateway')!.slug, 'world-wide-technology-raceway', 'Gateway alias');
assert.equal(trackSectionsFor('Streets of St. Petersburg'), null, 'no anchors for road/street venues yet');

console.log('section observations contract tests passed');
