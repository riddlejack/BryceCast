import assert from 'node:assert/strict';
import type { RaceStoryPack } from '../src/data/raceStory';
import type { SectionLapsPack, SectionLapTuple } from '../src/data/sectionLaps';
import {
  MIN_CLEAN_LAPS,
  lapContextOf,
  lapScopesFor,
  lapScopesForObservedLaps,
  minimumCleanLapsForScope,
  resolveHeatSections,
  selectableSectionLap,
  sectionObservationsFromLaps,
  sectionObservationsFromRaceStory
} from '../src/data/sectionObservations';
import {
  measuredTrackSectionsFor,
  passSpanAnchor,
  timedShareOf,
  trackSectionsFor
} from '../src/assets/tracks/sections';

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
      { name: 'Turn 1 Entry', percentile: 0.3 },
      { name: 'Turn 1 Exit', percentile: 0.4 },
      { name: 'Turn 2 Entry', percentile: 0.5 },
      { name: 'BackStretch Entry', percentile: 0.45 },
      { name: 'BackStretch Exit', percentile: 0.55 },
      { name: 'Turn 3', percentile: 0.75 },
      { name: 'Turn 4 Entry', percentile: 0.6 },
      { name: 'Turn 4 Exit', percentile: 0.85 }
    ],
    weakest: [],
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
assert.equal(set!.sections.length, 8, 'union recovers all eight official sections');
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
assert.equal(resolved.length, 8, 'all eight anchored sections join to observations');
const top = resolved.filter((r) => r.isTopSection).map((r) => r.sectionName).sort();
assert.deepEqual(
  top,
  ['Turn 3', 'Turn 4 Exit'].sort(),
  'top-2 by percentile get gold dots'
);
const turn1Entry = resolved.find((r) => r.sectionName === 'Turn 1 Entry');
assert.equal(turn1Entry!.isTopSection, false);
assert.equal(turn1Entry!.label, 'Turn 1 entry');

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

// 5b. Street circuits rebuilt from RaceTools map polylines (phase3/outlines-from-maps).
//     All three tile from the S/F datum; St. Petersburg uses the semantic
//     session's complete loop-distance chain on its matching centreline.
const det = trackSectionsFor('Streets of Detroit');
assert.ok(det, 'Detroit anchors resolve');
assert.equal(det!.confidence, 'anchored');
assert.equal(det!.sections.length, 18, 'Detroit ships the 18 loop-to-loop families');
assert.ok(Math.abs(timedShareOf(det!) - 1) < 0.02, 'Detroit sections tile the full lap');
const stp = trackSectionsFor('Streets of St. Petersburg');
assert.ok(stp, 'St. Petersburg anchors resolve (rebuilt from the map polyline)');
assert.equal(stp!.confidence, 'anchored', 'St. Petersburg uses measured S/F-referenced loop distances');
assert.equal(stp!.sections.length, 11, 'St. Petersburg ships every official timing section');
assert.ok(Math.abs(timedShareOf(stp!) - 1) < 0.00001, 'St. Petersburg measured sections tile the full lap');
assert.equal(stp!.sections[0].sectionName, 'FS-PO', 'St. Petersburg starts at its S/F datum');
assert.equal(stp!.sections.at(-1)?.sectionName, 'FS-PI', 'St. Petersburg closes back to S/F');
assert.equal(
  trackSectionsFor('Detroit Downtown Street Circuit')!.slug,
  'streets-of-detroit',
  'Detroit pack-name alias resolves'
);
assert.equal(
  trackSectionsFor('Grand Prix of Arlington Street Circuit')!.slug,
  'streets-of-arlington',
  'Arlington pack-name alias resolves'
);

// 5c. The official section parser preserves individual report columns. Every
// verified road-course anchor must use those exact names; old concatenated
// labels would silently leave parts of the qualifying map uncoloured.
const splitSectionChecks: Array<[string, string[], number, number]> = [
  ['Barber Motorsports Park', ['FS-PO', 'Turns 12-13', 'Turns 14-16'], 11, 0.99],
  ['Road America', ['I10 to I11', 'I11 to I11B', 'I11B to I12', 'I12 to I13', 'I13 to I13A', 'I13A to I14', 'I14 to I15C', 'I15C to I15'], 22, 0.99],
  ['WeatherTech Raceway Laguna Seca', ['Turn 1 Entry', 'Turn 1 Exit'], 15, 0.92],
  ['Portland International Raceway', ['FS-PI', 'FS-PO'], 13, 0.99],
  ['Indianapolis Motor Speedway Road Course', ['FS - PO', 'FS - PO 2', 'Turn 1/2', 'Turn 12/13', 'FS - PI'], 13, 0.999]
];
for (const [venue, names, count, minimumTimedShare] of splitSectionChecks) {
  const anchors = trackSectionsFor(venue);
  assert.ok(anchors, `${venue} anchors resolve`);
  assert.equal(anchors!.sections.length, count, `${venue} preserves every official section column`);
  for (const name of names) {
    assert.ok(anchors!.sections.some((section) => section.sectionName === name), `${venue} maps ${name}`);
  }
  assert.ok(timedShareOf(anchors!) >= minimumTimedShare, `${venue} timed coverage reflects separated fields`);
}

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
const cleanTimes = lapsTuples.filter((tuple) => tuple[4] === 1).map((tuple) => tuple[6] as number);
const expectedMeanTime = cleanTimes.reduce((sum, seconds) => sum + seconds, 0) / cleanTimes.length;
assert.ok(
  Math.abs((mean.sections[0].bryceSummarySeconds ?? 0) - expectedMeanTime) < 1e-9,
  'mean mode uses the arithmetic mean of actual section times, not the median time'
);
assert.equal(full.sections[0].bryceSummarySeconds, full.sections[0].bryceMedianSeconds, 'median mode reports the median time');

const shortQualifyingPack = {
  ...syntheticPack,
  id: 'section_laps_short_qualifying',
  sessionId: 'qualifying_test',
  totalLaps: 5,
  comparisonScope: 'qualifying_group_best_sections',
  sections: [{ sectionName: 'Turn T', laps: lapsTuples.slice(0, 5), fieldSeconds: [4.0, 4.1, 4.2] }],
  lapTotals: lapsTuples.slice(0, 5)
} as SectionLapsPack;
const racePolicyShort = sectionObservationsFromLaps(shortQualifyingPack, { kind: 'full_race' }, 'mean');
assert.equal(racePolicyShort.sections[0].percentile, null, 'race floor still suppresses a five-lap aggregate');
const qualifyingAverage = sectionObservationsFromLaps(shortQualifyingPack, { kind: 'full_race' }, 'mean', {
  minimumObservations: 1,
  observationLabel: 'valid observed qualifying laps'
});
assert.equal(qualifyingAverage.sections[0].observationCount, 5, 'qualifying average exposes its actual observed-lap denominator');
assert.ok(qualifyingAverage.sections[0].percentile !== null, 'short qualifying sessions use their complete valid population');
assert.ok(
  Math.abs((qualifyingAverage.sections[0].bryceSummarySeconds ?? 0) - 4.03) < 1e-9,
  'qualifying session average is the arithmetic mean of the five observed section times'
);
assert.match(qualifyingAverage.caveat, /valid observed qualifying laps/, 'qualifying denominator language survives the adapter');

const qualifyingScopes = lapScopesForObservedLaps([1, 3, 4, 8, 9]);
assert.deepEqual(
  qualifyingScopes.slice(1),
  [
    { kind: 'lap_window', label: 'Opening third', fromLap: 1, toLap: 3 },
    { kind: 'lap_window', label: 'Middle third', fromLap: 4, toLap: 8 },
    { kind: 'lap_window', label: 'Closing third', fromLap: 9, toLap: 9 }
  ],
  'qualifying thirds follow actual official lap indexes, including gaps'
);
assert.deepEqual(lapScopesForObservedLaps([4, 7]), [{ kind: 'full_race' }], 'two-lap oval runs omit meaningless thirds');
assert.equal(selectableSectionLap(75, [2, 5, 8], 8), 8, 'a stale long-race lap resets to the preferred official qualifying lap');
assert.equal(selectableSectionLap(5, [2, 5, 8], 8), 5, 'an available lap remains selected within the same session');

const middle = sectionObservationsFromLaps(syntheticPack, scopesMenu[2], 'median');
// middle third = laps 11-20: 10 clean laps, percentiles 0.55..1.0
assert.equal(middle.sections[0].observationCount, 10);
assert.ok((middle.sections[0].percentile ?? 0) > 0.7, 'middle-third median reflects its window');

const closing = sectionObservationsFromLaps(syntheticPack, scopesMenu[3], 'median');
// closing third = laps 21-30 (a 10-lap window): the caution clears with 4
// clean laps left. Below the full-race floor (MIN_CLEAN_LAPS = 8) but the
// scope-aware floor for a 10-lap window is min(8, max(4, ceil(10*0.4))) = 4 —
// exactly the case that floor exists for: a third that opened under caution
// but still carries a real, if smaller, clean sample should shade, not
// suppress (see minimumCleanLapsForScope).
assert.equal(closing.sections[0].observationCount, 4);
assert.ok(4 < MIN_CLEAN_LAPS, 'still below the full-race floor');
assert.equal(minimumCleanLapsForScope(scopesMenu[3]), 4, 'a 10-lap third floors at 4, not the full-race 8');
assert.equal(closing.sections[0].percentile, 0.9, 'a scope right at its scaled floor still reports a real percentile');

// A window too thin even for the scaled-down floor still suppresses — the
// floor never drops below 4. Laps 26-28: lap 26 is caution, laps 27-28 are
// clean = 2 clean laps in a 3-lap window; floor = max(4, ceil(3*0.4)) = 4.
const tooThin = sectionObservationsFromLaps(
  syntheticPack,
  { kind: 'lap_window', label: 'Slice', fromLap: 26, toLap: 28 },
  'median'
);
assert.equal(tooThin.sections[0].observationCount, 2);
assert.equal(tooThin.sections[0].percentile, null, 'a window below even the scaled floor still suppresses the percentile');

const oneLap = sectionObservationsFromLaps(syntheticPack, { kind: 'single_lap', lap: 22 }, 'median');
assert.equal(oneLap.sections[0].percentile, 0.1, 'single lap reports the lap as timed');
assert.equal(oneLap.sections[0].cautionState, 'caution', 'single lap carries its flag context');
assert.equal(oneLap.sections[0].clean, false);
assert.equal(oneLap.sections[0].bryceSummarySeconds, 6, 'single lap carries its actual official section time');
assert.equal(oneLap.sections[0].fieldRank, 15, 'single lap carries its official comparison rank');
assert.equal(oneLap.sections[0].fieldComparisonCount, 18, 'single lap carries its official comparison denominator');

const context = lapContextOf(syntheticPack);
assert.equal(context.filter((entry) => entry.caution === 'caution').length, 6, 'lap context surfaces caution laps for the scrubber');

// 7. Derived remainder (Brief H coverage fix): a genuine-gap pack carries an
// untimed section that rides the same contract. Arlington's one remaining gap
// joins as derived and can never become a gold top section.
const arlingtonAnchors = trackSectionsFor('Streets of Arlington')!;
const remainderAnchor = arlingtonAnchors.sections.find((s) => s.kind === 'derived_remainder');
assert.ok(remainderAnchor, 'Arlington ships a derived_remainder anchor');
/* Must equal the name the pack builder gives the derived section, or the join never lands. */
assert.equal(remainderAnchor!.sectionName, 'Untimed remainder');

const cornerName = 'Turn 3';
const remainderName = 'Untimed remainder';
const buildLaps = (percentile: number, seconds: number): SectionLapTuple[] =>
  Array.from({ length: 20 }, (_, i) => [i + 1, percentile, 5, 18, 1, 'g', seconds, 150] as SectionLapTuple);
const derivedPack = {
  schemaVersion: 'brycecast.sectionLaps.v1',
  type: 'section_laps',
  id: 'section_laps_derived_test',
  sessionId: 'session_derived',
  raceLabel: 'Derived Test',
  seasonYear: 2026,
  venueName: 'Streets of Arlington',
  trackType: 'street',
  totalLaps: 20,
  tupleOrder: ['lap', 'fieldPercentile', 'fieldRank', 'fieldComparisonCount', 'clean', 'caution', 'timeSeconds', 'speedMph'],
  derivedCoverage: 'genuine_gap',
  sections: [
    { sectionName: cornerName, kind: 'measured', laps: buildLaps(0.8, 4.0), fieldSeconds: [3.9, 4.0, 4.1, 4.2] },
    { sectionName: 'Turn 1', kind: 'measured', laps: buildLaps(0.8, 4.0), fieldSeconds: [3.9, 4.0, 4.1, 4.2] },
    { sectionName: 'Turn 2', kind: 'measured', laps: buildLaps(0.9, 3.8), fieldSeconds: [3.8, 3.9] },
    { sectionName: remainderName, kind: 'derived_remainder', laps: buildLaps(0.4, 15.1), fieldSeconds: [14.9, 15.0, 15.2, 15.4] }
  ],
  lapTotals: buildLaps(0.5, 27.0),
  sourceStateCounts: {},
  sourceRefs: [],
  caveats: ['derived test']
} as unknown as SectionLapsPack;

const derivedSet = sectionObservationsFromLaps(derivedPack, { kind: 'full_race' }, 'median');
const remainderObs = derivedSet.sections.find((s) => s.sectionName === remainderName)!;
assert.equal(remainderObs.kind, 'derived_remainder', 'derived section keeps its kind through the contract');
assert.ok(Math.abs((remainderObs.percentile ?? 0) - 0.4) < 1e-9, 'derived section aggregates like any section');
assert.ok(Math.abs((remainderObs.fieldMedianSeconds ?? 0) - 15.1) < 1e-9, 'fieldMedianSeconds is the field distribution median');
assert.deepEqual(remainderObs.fieldSeconds, [14.9, 15.0, 15.2, 15.4], 'field distribution passes through for the drawer');

const derivedResolved = resolveHeatSections(arlingtonAnchors, derivedSet);
const remainderResolved = derivedResolved.find((r) => r.kind === 'derived_remainder')!;
assert.ok(remainderResolved, 'derived remainder joins the Arlington anchor');
assert.equal(remainderResolved.renderSpans.length, 1, 'single remainder draws its one untimed stretch');
assert.equal(remainderResolved.combined, false, 'one stretch is not described as combined');
assert.equal(remainderResolved.isTopSection, false, 'the derived remainder is never a gold top section');
const topNames = derivedResolved.filter((r) => r.isTopSection).map((r) => r.sectionName).sort();
assert.deepEqual(
  topNames,
  ['Turn 1', 'Turn 2'].sort(),
  'top-2 gold dots are the strongest MEASURED sections (0.9, 0.8), not the derived remainder'
);

// 8. Measured lake tier (heat-map v2): a pack tagged `lake_loop_crossings`
// flows through the SAME contract, but the emitted set names the measured tier.
// The v1 PDF path is untouched (default tier stays parsed_pdf_aggregate).
const pdfSet = sectionObservationsFromLaps(syntheticPack, { kind: 'full_race' }, 'median');
assert.equal(pdfSet.sourceTier, 'parsed_pdf_aggregate', 'PDF pack default tier unchanged');
assert.equal(pdfSet.sourceState, 'official_section_results_per_lap');
const lakePack = { ...syntheticPack, sourceTier: 'lake_loop_crossings' } as SectionLapsPack;
const lakeSet = sectionObservationsFromLaps(lakePack, { kind: 'full_race' }, 'median');
assert.equal(lakeSet.sourceTier, 'lake_loop_crossings', 'lake pack tier flows into the set');
assert.equal(lakeSet.sourceState, 'racetools_capture_loop_crossings_per_lap', 'measured source state names the capture');
assert.equal(lakeSet.sections[0].percentile, pdfSet.sections[0].percentile, 'same numbers — only the tier label differs');

// 9. Nashville ships parallel eight-section joins: official report labels for
// PDF packs and capture-native station codes for lake packs. Both use the same
// measured boundaries, tile the lap, and carry no invented remainder.
const measuredNash = measuredTrackSectionsFor('Nashville Superspeedway');
assert.ok(measuredNash, 'Nashville ships a measured 8-section set');
assert.equal(measuredNash!.sections.length, 8, 'eight measured sub-sections');
assert.ok(measuredNash!.sections.every((s) => s.kind !== 'derived_remainder'), 'no derived remainder in the measured set');
assert.ok(Math.abs(timedShareOf(measuredNash!) - 1) < 0.01, 'the eight sections tile ~100% of the lap');
const pdfNash = trackSectionsFor('Nashville Superspeedway')!;
assert.equal(pdfNash.sections.length, 8, 'the official-report set preserves all eight source columns');
assert.ok(pdfNash.sections.every((s) => s.kind !== 'derived_remainder'), 'official sections tile without a derived remainder');
assert.ok(Math.abs(timedShareOf(pdfNash) - 1) < 0.00001, 'official-label sections tile the measured lap');

const measuredLaps = (percentile: number): SectionLapTuple[] =>
  Array.from({ length: 12 }, (_, i) => [i + 1, percentile, 5, 18, 1, 'g', 4 + percentile, 150] as SectionLapTuple);
const measuredPack = {
  schemaVersion: 'brycecast.sectionLaps.v1',
  type: 'section_laps',
  id: 'section_laps_measured_test',
  sessionId: 'session_measured',
  raceLabel: 'Measured Test',
  seasonYear: 2025,
  venueName: 'Nashville Superspeedway',
  trackType: 'oval',
  totalLaps: 12,
  tupleOrder: ['lap', 'fieldPercentile', 'fieldRank', 'fieldComparisonCount', 'clean', 'caution', 'timeSeconds', 'speedMph'],
  sourceTier: 'lake_loop_crossings',
  derivedCoverage: 'fully_timed',
  sections: measuredNash!.sections.map((anchor, i) => ({
    sectionName: anchor.sectionName,
    kind: 'measured' as const,
    laps: measuredLaps(0.2 + i * 0.08)
  })),
  lapTotals: measuredLaps(0.5),
  sourceStateCounts: {},
  sourceRefs: [{ key: 'nashvilleIntervalPack', path: 'analysis/semantic-layer/output/nashville/x.intervals.ndjson.gz', note: 'x' }],
  caveats: ['measured test']
} as unknown as SectionLapsPack;
const measuredSet = sectionObservationsFromLaps(measuredPack, { kind: 'full_race' }, 'median');
const measuredResolved = resolveHeatSections(measuredNash!, measuredSet);
assert.equal(measuredResolved.length, 8, 'all eight measured sections join the anchors');
assert.equal(measuredResolved.filter((r) => r.isTopSection).length, 2, 'exactly two gold top sections among the eight');
assert.ok(measuredResolved.every((r) => r.kind === 'measured'), 'every drawn span is measured — no derived treatment');

// 10. Pass placement join: a bracketed loop interval resolves to its span.
const s2b = passSpanAnchor(measuredNash!, 'SS1', 'T2');
assert.ok(s2b, 'a pass between SS1 and T2 resolves to a span');
assert.equal(s2b!.sectionName, 'S2B', 'SS1->T2 is the compound (S2B) span');
assert.equal(passSpanAnchor(measuredNash!, 'SF', 'T4'), null, 'a non-adjacent/undrawn interval resolves to no mark');
// Milwaukee's curated chain resolves passes by its "A to B" section names.
const milPass = passSpanAnchor(trackSectionsFor('The Milwaukee Mile')!, 'SF', 'T1');
assert.ok(milPass, 'Milwaukee resolves a pass interval from its chain section names');

console.log('section observations contract tests passed');
