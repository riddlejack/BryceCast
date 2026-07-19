import assert from 'node:assert/strict';
import type { RaceStoryPack } from '../src/data/raceStory';
import type { SectionLapsPack, SectionLapTuple } from '../src/data/sectionLaps';
import {
  MIN_CLEAN_LAPS,
  lapContextOf,
  lapScopesFor,
  resolveHeatSections,
  sectionObservationsFromLaps,
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

// 6. per-lap producer: scopes, stat toggle, clean-lap floor, single-lap caution.
// Synthetic 30-lap race, one section: laps 1-20 clean at rising percentiles,
// laps 21-26 under caution (not clean), laps 27-30 clean at 0.9.
const lapsTuples: SectionLapTuple[] = [];
for (let lap = 1; lap <= 20; lap += 1) lapsTuples.push([lap, lap / 20, 5, 18, 1, 'g', 4 + lap / 100, 160]);
for (let lap = 21; lap <= 26; lap += 1) lapsTuples.push([lap, 0.1, 15, 18, 0, 'c', 6, 110]);
for (let lap = 27; lap <= 30; lap += 1) lapsTuples.push([lap, 0.9, 2, 18, 1, 'g', 4.1, 158]);
const syntheticPack = {
  schemaVersion: 'brycecast.sectionLaps.v1',
  type: 'section_laps',
  id: 'section_laps_test',
  sessionId: 'session_test',
  raceLabel: 'Test 30',
  seasonYear: 2026,
  venueName: 'Testville',
  trackType: 'oval',
  totalLaps: 30,
  tupleOrder: ['lap', 'fieldPercentile', 'fieldRank', 'fieldComparisonCount', 'clean', 'caution', 'timeSeconds', 'speedMph'],
  sections: [{ sectionName: 'Turn T', laps: lapsTuples }],
  lapTotals: lapsTuples,
  sourceStateCounts: {},
  sourceRefs: [],
  caveats: ['test']
} as SectionLapsPack;

const scopesMenu = lapScopesFor(30);
assert.equal(scopesMenu.length, 4, 'full race + three thirds');
assert.deepEqual(
  scopesMenu[1],
  { kind: 'lap_window', label: 'Opening third', fromLap: 1, toLap: 10 },
  'thirds are lap-count thirds'
);

const full = sectionObservationsFromLaps(syntheticPack, { kind: 'full_race' }, 'median');
assert.equal(full.sections[0].observationCount, 24, 'caution laps are excluded from clean counts');
// clean values sorted: 0.05..1.00 by 0.05 (20) + four extra 0.9s = 24 values; median = (12th+13th)/2 = (0.60+0.65)/2
assert.ok(Math.abs((full.sections[0].percentile ?? 0) - 0.625) < 1e-9, 'median over clean laps only');
assert.equal(full.stat, 'median');

const mean = sectionObservationsFromLaps(syntheticPack, { kind: 'full_race' }, 'mean');
assert.ok((mean.sections[0].percentile ?? 0) > 0.5 && mean.sections[0].percentile !== full.sections[0].percentile, 'mean differs from median');

const middle = sectionObservationsFromLaps(syntheticPack, scopesMenu[2], 'median');
// middle third = laps 11-20: 10 clean laps, percentiles 0.55..1.0
assert.equal(middle.sections[0].observationCount, 10);
assert.ok((middle.sections[0].percentile ?? 0) > 0.7, 'middle-third median reflects its window');

const closing = sectionObservationsFromLaps(syntheticPack, scopesMenu[3], 'median');
// closing third = laps 21-30: only 4 clean laps -> below MIN_CLEAN_LAPS, suppressed
assert.equal(closing.sections[0].observationCount, 4);
assert.ok(4 < MIN_CLEAN_LAPS, 'test premise: below the floor');
assert.equal(closing.sections[0].percentile, null, 'below-floor scopes suppress the percentile, never fake confidence');

const oneLap = sectionObservationsFromLaps(syntheticPack, { kind: 'single_lap', lap: 22 }, 'median');
assert.equal(oneLap.sections[0].percentile, 0.1, 'single lap reports the lap as timed');
assert.equal(oneLap.sections[0].cautionState, 'caution', 'single lap carries its flag context');
assert.equal(oneLap.sections[0].clean, false);

const context = lapContextOf(syntheticPack);
assert.equal(context.filter((entry) => entry.caution === 'caution').length, 6, 'lap context surfaces caution laps for the scrubber');

console.log('section observations contract tests passed');
