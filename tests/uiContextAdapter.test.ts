import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBryceCastUiContext } from '../src/data/uiContextAdapter';
import { buildLiveBattleFrame, buildOfficialPointsWindow, headToHeadForCar, headToHeadForLiveDriver } from '../src/data/livePageModel';
import { causeClause, causeFacts, causeMajority } from '../src/data/cautionCause';

/* Venue-agnostic hydration invariants: counts come from the package itself,
   never from a hardcoded event slice, so schedule roll-forwards don't break CI. */

const context = await buildBryceCastUiContext();

const parseCsv = (text: string): Array<Record<string, string>> => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      record.push(field);
      field = '';
    } else if (!quoted && char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const [headers = [], ...rows] = records;
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
};

const [canonicalDataset, raceMileageRows, physicalSessionRows, travelLegRows] = await Promise.all([
  readFile('data/career/career.dataset.json', 'utf8').then((text) => JSON.parse(text)),
  readFile('analysis/career-life-stats/output/tables/miles_raced.csv', 'utf8').then(parseCsv),
  readFile('analysis/career-life-stats/output/tables/session_mileage_ledger.csv', 'utf8').then(parseCsv),
  readFile('analysis/career-life-stats/output/tables/travel_legs.csv', 'utf8').then(parseCsv)
]);
const canonicalRaceSessionIds = new Set(
  (canonicalDataset.sessions ?? [])
    .filter((session: { sessionType?: string }) => session.sessionType === 'race')
    .map((session: { id: string }) => session.id)
);
const canonicalBryceRaceSessionIds = new Set<string>(
  (canonicalDataset.results ?? [])
    .filter(
      (result: { driverId?: string; sessionId: string }) =>
        result.driverId === 'driver_bryce_aron' && canonicalRaceSessionIds.has(result.sessionId)
    )
    .map((result: { sessionId: string }) => result.sessionId)
);
const raceMileageSessionIds = new Set(raceMileageRows.map((row) => row.sessionId));
assert.deepEqual(
  [...raceMileageSessionIds].sort(),
  [...canonicalBryceRaceSessionIds].sort(),
  'validated personal-race ledger must cover the canonical Bryce race set exactly'
);
const roundedTenth = (value: number) => Math.round(value * 10) / 10;
const expectedPersonalRaceLaps = raceMileageRows.reduce((sum, row) => sum + Number(row.personalLaps), 0);
const expectedPersonalRaceMiles = roundedTenth(raceMileageRows.reduce((sum, row) => sum + Number(row.personalMiles), 0));
const expectedTravelMinimumMiles = roundedTenth(travelLegRows.reduce((sum, row) => sum + Number(row.greatCircleMiles), 0));
const expectedResourceKeys = new Set(physicalSessionRows.map((row) => `${row.seriesId}|${row.seasonYear}`));

assert.equal(context.dataPackage.schemaVersion, 'brycecast.uiDataPackage.v1');

const manifest = context.contextPackManifest;
assert.equal(manifest.packs.filter((pack) => pack.type === 'upcoming_event').length, manifest.packCounts.upcoming_event);
assert.equal(manifest.packs.filter((pack) => pack.type === 'race_debrief').length, manifest.packCounts.race_debrief);
assert.equal(manifest.packCounts.career_lab, 1);
assert.equal(manifest.packCounts.live_race_day, 1);

assert.equal(context.contextPackIntegrity.algorithm, 'sha256');
assert.ok(context.contextPackIntegrity.checkedRefs >= 4, 'live, career, prep, and debrief packs must be integrity-checked');
assert.equal(new Set(context.contextPackIntegrity.checkedPaths).size, context.contextPackIntegrity.checkedPaths.length, 'checked paths must be unique');

assert.deepEqual(
  context.upcomingPrep.events.map((event) => event.eventId),
  context.dataPackage.screens.upcomingPrep.events.map((event) => event.eventId),
  'every packaged upcoming event must hydrate, including an empty completed-season schedule'
);
for (const event of context.upcomingPrep.events) {
  assert.ok(event.predictionBand?.finishPercentileBand, `${event.eventName} must expose predictionBand`);
  assert.ok(event.top10Path.length >= 1, `${event.eventName} must expose top10Path`);
  assert.ok(event.contextPackRef.path, `${event.eventName} must expose contextPackRef`);
  assert.equal(event.contextPack.eventId, event.eventId);
  assert.equal(event.contextPack.id, event.contextPackRef.id);
  assert.equal(event.contextPack.predictionBand.claimStrength, 'source_bounded_historical_prior_band');
}

assert.ok(context.raceDebrief.featuredDebriefs.length >= 1, 'featured debriefs must hydrate');
for (const debrief of context.raceDebrief.featuredDebriefs) {
  assert.equal(debrief.contextPack.sessionId, debrief.sessionId);
  assert.ok(debrief.contextPack.sourceRefs.length > 0, `${debrief.raceLabel} must carry sourceRefs`);
}

const debriefWithRaceContext = context.raceDebrief.featuredDebriefs.find((debrief) => {
  const incidents = debrief.contextPack.raceContext.sessionIncidentCount ?? 0;
  const penalties = debrief.contextPack.raceContext.sessionPenaltyCount ?? 0;
  return incidents + penalties > 0;
});
assert.ok(debriefWithRaceContext, 'at least one hydrated race debrief must expose incident or penalty race context');

/* Race Week prep modules ride inside the package; invariants stay
   venue-agnostic so schedule roll-forwards don't break CI. */
const upcomingScreen = context.dataPackage.screens.upcomingPrep;
if (context.upcomingPrep.events.length > 0) {
  const nextEventPrep = upcomingScreen.nextEventPrep;
  assert.ok(nextEventPrep, 'nextEventPrep must exist while future events exist');
  assert.equal(nextEventPrep.eventId, context.upcomingPrep.events[0].eventId);
  assert.ok(nextEventPrep.races.length >= 1, 'nextEventPrep must carry track-type history rows');
  for (const row of nextEventPrep.races) {
    assert.ok('officialStatus' in row, `${row.raceLabel} must carry officialStatus`);
  }
  assert.equal(
    nextEventPrep.raceSummary.cleanRaceCount,
    nextEventPrep.races.filter((row) => row.officialStatus === 'running').length,
    'clean-race summary must count only official running results'
  );
} else {
  assert.equal(upcomingScreen.nextEventPrep, null, 'a completed season must not retain a stale next-event preview');
}
const standings = upcomingScreen.standingsSnapshot;
assert.ok(standings && typeof standings.available === 'boolean', 'standingsSnapshot must carry an explicit available flag');
if (standings.available) {
  assert.equal(standings.seriesGuard.ok, true, 'standings must sit behind a passing series guard');
  assert.equal(standings.entries.filter((entry) => entry.isBryce).length, 1, 'exactly one guarded Bryce standings entry');
  assert.ok(standings.caveats.length >= 1, 'standings must state source and points caveats');
}

/* Live page: every trust state remains renderable, and the jumbotron only
   orders Race Control point fields (no local point arithmetic). */
const liveFixtures = context.liveCompanion.fixtures;
assert.deepEqual(
  [...new Set(liveFixtures.map((fixture) => fixture.state))].sort(),
  ['blocked', 'degraded', 'pre_session', 'ready', 'stale', 'wrong_series'].sort(),
  'live fixtures must preserve every product trust state'
);
for (const fixture of liveFixtures) {
  assert.equal(fixture.schemaVersion, 'live-readiness.v1');
  assert.ok(fixture.reason, `${fixture.state} fixture must explain its state`);
  assert.ok(fixture.liveTiming && fixture.points && fixture.sources, `${fixture.state} fixture must carry runtime-shaped modules`);
}

const pointsWindow = buildOfficialPointsWindow([
  { no: '10', firstName: 'Niels', lastName: 'Koolen', runningDriverPoints: 166, totalDriverPoints: 0 },
  { no: '9', firstName: 'Bryce', lastName: 'Aron', bryce: true, runningDriverPoints: 159, totalDriverPoints: 0 },
  { no: '17', firstName: 'Salvador', lastName: 'de Alba', runningDriverPoints: 158, totalDriverPoints: 0 }
]);
assert.ok(pointsWindow, 'source-backed running points should produce a projected window');
assert.equal(pointsWindow.bryce.runningDriverPoints, 159, 'Bryce points must match runningDriverPoints exactly');

const battleFrame = buildLiveBattleFrame({
  liveTiming: {
    rows: [
      { driverId: '10', no: '10', lastName: 'Koolen', rank: 10, liveRank: 10, liveGap: '1.0281' },
      { driverId: '2143', no: '9', lastName: 'Aron', rank: 11, liveRank: 11, liveGap: '0.8667', bryce: true },
      { driverId: '17', no: '17', lastName: 'de Alba', rank: 12, liveRank: 12, liveGap: '0.8140' }
    ]
  },
  bryce: { bryce: { driverId: '2143', no: '9', lastName: 'Aron', rank: 11, liveRank: 11, liveGap: '0.8667', bryce: true } }
} as never);
assert.ok(battleFrame, 'sourced live intervals should create a Bryce-centered battle frame');
assert.equal(battleFrame.ahead?.surname, 'Koolen');
assert.equal(battleFrame.ahead?.gapSeconds, 0.8667);
assert.equal(battleFrame.behind?.surname, 'de Alba');
assert.ok(Math.abs((battleFrame.cars.find((row) => row.carNo === '10')?.offsetSeconds ?? 0) - 0.8667) < 1e-6);
assert.equal(pointsWindow.bryce.totalDriverPoints, 0, 'source-present zero totalDriverPoints must stay zero');
assert.equal(pointsWindow.bryce.projectedStanding, 2, 'standing is the order of Race Control runningDriverPoints');
assert.equal(pointsWindow.above?.driverName, 'Niels Koolen');
assert.equal(pointsWindow.below?.driverName, 'Salvador de Alba');
if (standings.available) {
  assert.deepEqual(headToHeadForCar('10', standings), standings.entries.find((entry) => entry.carNo === '10')?.headToHead ?? null);
}
const koolenRival = context.dataPackage.screens.careerLab.headToHead.find((rival) => rival.driverName === 'Niels Koolen');
assert.ok(koolenRival, 'career package must carry Niels Koolen head-to-head context');
assert.deepEqual(
  headToHeadForLiveDriver('10', 'Koolen', standings, context.dataPackage.screens.careerLab.headToHead),
  {
    racesTogether: koolenRival.racesTogether,
    bryceAhead: koolenRival.bryceAhead,
    bryceBehind: koolenRival.bryceBehind
  },
  'live tower should fall back to the package-native career join when a captured standings join is unavailable'
);

/* Race-story packs: one per debrief, integrity-loadable, honest Bryce state. */
const storyRefs = context.dataPackage.screens.raceDebrief.raceStoryRefs;
const debriefRefs = context.contextPackManifest.packs.filter((pack) => pack.type === 'race_debrief');
assert.equal(storyRefs.length, debriefRefs.length, 'every race debrief must have a race-story pack');
{
  const { loadRaceStory } = await import('../src/data/raceStory');
  const sample = await loadRaceStory(storyRefs[0].sessionId);
  assert.ok(sample, 'race-story pack must load with integrity');
  assert.ok(sample.lapChart.drivers.length >= 2, 'race-story lap chart must include the field');
  assert.equal(
    sample.bryce.inLapChart,
    sample.lapChart.drivers.some((driver) => driver.isBryce && driver.laps.length > 0),
    'bryce.inLapChart must match the chart contents'
  );

  /* Restart Report Card: the per-race block, hand-verified against the official
   * caution summaries for the 2024 Indianapolis GP Race 1. */
  const indy = await loadRaceStory('session_indy_nxt_2024_6315');
  assert.ok(indy?.restarts, 'race-story restart block must load');
  assert.equal(indy!.restarts!.precision, 'lap-chart', 'v1 restart precision is lap-chart');
  assert.equal(indy!.restarts!.detected, 2, 'Indy GP R1 had two restarts');
  assert.equal(indy!.restarts!.events.length, 2, 'restart events must equal detected');
  const [first, second] = indy!.restarts!.events;
  assert.equal(first.restartLap, 26, 'first restart lap matches the by-hand check');
  assert.equal(first.baselineLap, 25, 'baseline is the last caution lap');
  assert.equal(first.bryce?.net, 1, 'Bryce gained one across the first restart');
  assert.equal(first.bryce!.net, first.bryce!.baselinePosition! - first.bryce!.endPosition!, 'net equals baseline minus end');
  assert.equal(second.restartLap, 32, 'second restart lap matches the by-hand check');
  assert.equal(second.bryce?.net, 0, 'Bryce held station on the second restart');
  assert.equal(indy!.restarts!.bryce.net, 1, 'race net equals the summed event nets');
  assert.ok(indy!.restarts!.events.every((event) => event.field.classified >= 2), 'every restart carries a field denominator');

  /* An end-of-race caution must never become a restart: Barber 2024's second
   * caution ran to the flag, so only one restart is detected. */
  const barber = await loadRaceStory('session_indy_nxt_2024_6314');
  assert.equal(barber?.restarts?.detected, 1, 'Barber 2024 caution to the flag yields one restart, not two');
}

/* Section-lap packs (Brief H): integrity-loadable, venue-indexed, scoped honestly. */
const sectionLapRefs = context.dataPackage.screens.raceDebrief.sectionLapRefs;
assert.ok(Array.isArray(sectionLapRefs) && sectionLapRefs.length > 0, 'sectionLapRefs must exist');
assert.ok(
  sectionLapRefs.every((ref) => storyRefs.some((storyRef) => storyRef.sessionId === ref.sessionId)),
  'every section-lap pack belongs to a race-debrief session'
);
{
  const { loadSectionLaps, sectionLapVisitsFor } = await import('../src/data/sectionLaps');
  const { sectionObservationsFromLaps, MIN_CLEAN_LAPS } = await import('../src/data/sectionObservations');
  const nashvilleVisits = sectionLapVisitsFor('Nashville Superspeedway');
  assert.ok(nashvilleVisits.length >= 2, 'Nashville must carry at least two section-lap visits (2024, 2025)');
  /* Heat-map v2: Nashville 2024/2025 now load the MEASURED loop-crossing pack —
     eight fine sub-sections tiling the whole lap, sourceTier lake_loop_crossings,
     the derived remainder retired here. The PDF path stays the fallback. */
  const nashville = await loadSectionLaps('session_indy_nxt_2024_6323');
  assert.ok(nashville, 'Nashville 2024 section-lap pack must load with integrity');
  assert.equal(nashville!.sourceTier, 'lake_loop_crossings', 'Nashville 2024 is fed by the measured lake pack');
  const measured = nashville!.sections.filter((section) => section.kind !== 'derived_remainder');
  const derived = nashville!.sections.filter((section) => section.kind === 'derived_remainder');
  assert.equal(measured.length, 8, 'Nashville reports eight measured timing-loop sub-sections');
  assert.equal(derived.length, 0, 'the derived remainder retires where the loops tile the whole lap');
  assert.equal(nashville!.derivedCoverage, 'fully_timed', 'Nashville measured coverage is fully timed');
  assert.ok(
    measured.every((section) => (section.fieldSeconds ?? []).length >= 8),
    'every measured section carries a real full-field distribution'
  );
  const fullRace = sectionObservationsFromLaps(nashville, { kind: 'full_race' }, 'median');
  assert.equal(fullRace.sourceTier, 'lake_loop_crossings', 'the emitted set names the measured tier');
  for (const observation of fullRace.sections) {
    assert.ok((observation.observationCount ?? 0) >= MIN_CLEAN_LAPS, 'full-race scopes must clear the clean-lap floor');
    assert.ok(
      observation.percentile !== null && observation.percentile >= 0 && observation.percentile <= 1,
      'full-race percentiles must be well-formed'
    );
  }
  const singleLap = sectionObservationsFromLaps(nashville, { kind: 'single_lap', lap: 1 }, 'median');
  assert.ok(
    singleLap.sections.every((observation) => observation.cautionState !== undefined || observation.observationCount === 0),
    'single-lap observations must carry their caution context'
  );
}

/* Pass marks (heat-map v2 item 7): GO races carry a pack; each green Bryce pass
   resolves to a drawn span on the venue's anchors; CONDITIONAL races carry none. */
{
  const { loadPassMarks, resolvePassMarks } = await import('../src/data/passMarks');
  const { measuredTrackSectionsFor } = await import('../src/assets/tracks/sections');
  const passMarkRefs = context.dataPackage.screens.raceDebrief.passMarkRefs;
  assert.ok(Array.isArray(passMarkRefs) && passMarkRefs.length === 26, 'exactly 26 GO races carry a pass-mark pack');
  assert.ok(
    passMarkRefs.every((ref) => storyRefs.some((storyRef) => storyRef.sessionId === ref.sessionId)),
    'every pass-mark pack belongs to a race-debrief session'
  );
  const nashPasses = await loadPassMarks('session_indy_nxt_2025_6447');
  assert.ok(nashPasses, 'Nashville 2025 pass-mark pack loads with integrity');
  assert.equal(nashPasses!.verdict, 'GO', 'only GO races ship pass marks');
  assert.ok(nashPasses!.pairwiseConcordancePct >= 96, 'the pack carries the lap-chart concordance for the drawer');
  assert.ok(nashPasses!.greenPasses.length > 0, 'Nashville 2025 has green Bryce passes to draw');
  assert.ok(
    nashPasses!.greenPasses.every((pass) => (pass.direction === 'gain' || pass.direction === 'loss') && pass.otherName.length > 0),
    'every pass carries a direction and a named other car'
  );
  const measuredNash = measuredTrackSectionsFor('Nashville Superspeedway')!;
  const resolved = resolvePassMarks(measuredNash, nashPasses!);
  assert.ok(resolved.length > 0, 'green passes resolve to drawn spans on the measured anchors');
  assert.ok(
    resolved.every((mark) => mark.startT >= 0 && mark.startT < 1 && mark.endT >= 0 && mark.endT < 1),
    'each pass mark lands on a well-formed span'
  );
  // A CONDITIONAL race (Iowa 2024) is excluded — no pack, no marks, no mention.
  const iowa = await loadPassMarks('session_indy_nxt_2024_6319');
  assert.equal(iowa, null, 'CONDITIONAL races carry no pass-mark pack');
}

/* GB3 deep-dive pack: inventory-registered, hash-verified, fails closed on
   tamper (the raceStory integrity contract). */
{
  const { loadGb3DeepDive, gb3DeepDiveRef } = await import('../src/data/gb3DeepDive');
  const { packRawModules } = await import('../src/data/packModules');
  const ref = gb3DeepDiveRef();
  assert.ok(ref, 'the GB3 pack is registered in the package source inventory');
  assert.equal(ref!.id, 'gb3-deep-dive-context');
  assert.ok(/^[0-9a-f]{64}$/.test(ref!.sha256), 'the inventory ref carries a real sha256');
  const key = `../../${ref!.path}`;
  const originalRaw = packRawModules[key];
  assert.ok(originalRaw, 'the GB3 pack resolves through the context-pack glob');
  // Tamper: one flipped byte in the raw pack must fail the load CLOSED.
  packRawModules[key] = async () => {
    const text = (await originalRaw()) as string;
    return text.replace('"raceRows"', '"raceRowsX"');
  };
  await assert.rejects(loadGb3DeepDive(), /integrity mismatch/, 'a tampered GB3 pack is rejected, never rendered');
  // Restore: the failed load was not cached, so a clean load verifies again.
  packRawModules[key] = originalRaw;
  const gb3 = await loadGb3DeepDive();
  assert.ok(gb3, 'the untampered GB3 pack loads');
  assert.equal(gb3!.id, ref!.id, 'the loaded pack id matches the inventory ref');
  assert.ok(gb3!.raceResults.length >= 40, 'the pack carries the two GB3 seasons of races');
}

/* Formula Ford lap-shape pack: same centralized fail-closed loader, same
   inventory-ref contract, rejects a tampered pack. */
{
  const { loadFormulaFordLapShape, formulaFordLapShapeRef } = await import('../src/data/formulaFordLapShape');
  const { packRawModules } = await import('../src/data/packModules');
  const ref = formulaFordLapShapeRef();
  assert.ok(ref, 'the Formula Ford pack is registered in the package source inventory');
  assert.equal(ref!.id, 'formula-ford-lap-shape-context');
  assert.ok(/^[0-9a-f]{64}$/.test(ref!.sha256), 'the inventory ref carries a real sha256');
  const key = `../../${ref!.path}`;
  const originalRaw = packRawModules[key];
  assert.ok(originalRaw, 'the Formula Ford pack resolves through the context-pack glob');
  packRawModules[key] = async () => {
    const text = (await originalRaw()) as string;
    return text.replace('"displayRules"', '"displayRulesX"');
  };
  await assert.rejects(loadFormulaFordLapShape(), /integrity mismatch/, 'a tampered Formula Ford pack is rejected, never rendered');
  packRawModules[key] = originalRaw;
  const ff = await loadFormulaFordLapShape();
  assert.ok(ff, 'the untampered Formula Ford pack loads');
  assert.equal(ff!.id, ref!.id, 'the loaded pack id matches the inventory ref');
  assert.ok(ff!.conditionContext.length >= 1, 'the pack carries condition-split lap shape');
}

/* IMSA Daytona stint pack: closes the audit-flagged unchecked direct import —
   same centralized fail-closed loader, rejects a tampered pack. */
{
  const { loadImsaDaytonaStint, imsaStintRef } = await import('../src/data/imsaDaytonaStint');
  const { packRawModules } = await import('../src/data/packModules');
  const ref = imsaStintRef();
  assert.ok(ref, 'the IMSA pack is registered in the package source inventory');
  assert.equal(ref!.id, 'imsa-daytona-stint-class-context');
  assert.ok(/^[0-9a-f]{64}$/.test(ref!.sha256), 'the inventory ref carries a real sha256');
  const key = `../../${ref!.path}`;
  const originalRaw = packRawModules[key];
  assert.ok(originalRaw, 'the IMSA pack resolves through the context-pack glob');
  packRawModules[key] = async () => {
    const text = (await originalRaw()) as string;
    return text.replace('"displayRules"', '"displayRulesX"');
  };
  await assert.rejects(loadImsaDaytonaStint(), /integrity mismatch/, 'a tampered IMSA pack is rejected, never rendered');
  packRawModules[key] = originalRaw;
  const imsa = await loadImsaDaytonaStint();
  assert.ok(imsa, 'the untampered IMSA pack loads');
  assert.equal(imsa!.id, ref!.id, 'the loaded pack id matches the inventory ref');
  assert.ok(imsa!.bryceStintContext.length >= 1, 'the pack carries Bryce stint context');
}

assert.ok(context.careerLab.contextPack.resultConversionRows >= 100);
assert.ok(context.careerLab.contextPack.metricFamilyParity.length > 0);
assert.ok(context.careerLab.deepContextPacks.careerDimension, 'career dimension deep pack must load');
// IMSA and Formula Ford are no longer soft-loaded through the adapter — they
// load only via their verified screen loaders, proven fail-closed above.

/* Career Lab v2 modules: rivals, weather joins, lap texture. */
const careerScreen = context.dataPackage.screens.careerLab;
const careerMoments = careerScreen.moments;
assert.deepEqual(
  careerMoments.map((moment) => moment.kind),
  ['first_car_win', 'first_indy_nxt_race', 'best_indy_nxt_finish', 'daytona_24', 'wwtr_mechanical'],
  'named climb moments must stay in deterministic career chronology'
);
assert.equal(new Set(careerMoments.map((moment) => moment.kind)).size, careerMoments.length, 'moment kinds must be unique');
assert.ok(
  careerMoments.every(
    (moment) =>
      Array.from(moment.shortLabel).length <= 22 &&
      careerScreen.resultConversion.some((row) => row.sessionId === moment.sessionId)
  ),
  'every named moment must fit the label contract and resolve to a conversion row'
);
assert.equal(
  careerMoments.find((moment) => moment.kind === 'wwtr_mechanical')?.shortLabel,
  'WWTR · mechanical'
);
assert.ok(careerScreen.headToHead.length >= 40, 'career head-to-head must carry the full rival table');
for (const rival of careerScreen.headToHead) {
  assert.ok(rival.driverName, 'every rival row carries a name');
  assert.ok(
    (rival.bryceAhead ?? 0) + (rival.bryceBehind ?? 0) <= (rival.racesTogether ?? 0),
    `${rival.driverName} record must fit racesTogether`
  );
}
const conversionWithWeather = careerScreen.resultConversion.filter((row) => row.wetDry);
assert.ok(conversionWithWeather.length > 0, 'weather joins must reach the conversion rows');
assert.ok(
  conversionWithWeather.every((row) => ['dry', 'wet', 'damp', 'drying'].includes(String(row.wetDry)) && row.weatherConfidence),
  'joined weather rows carry a known condition and a confidence label'
);
assert.ok(careerScreen.lapPositionMix.length >= 2, 'lap position mix must carry the INDY NXT seasons');
for (const season of careerScreen.lapPositionMix) {
  const summed = season.positions.reduce((sum, entry) => sum + entry.laps, 0);
  assert.equal(summed, season.totalLaps, `lap mix ${season.seasonYear} position counts must sum to totalLaps`);
}

/* The campaigns: every championship season as a points arc. Arcs accumulate the
   sourced race points in order; a season whose earned points differ from its
   official total must say so; latest/current stays distinct from in-progress. */
const seasonCampaigns = careerScreen.seasonCampaigns;
assert.equal(seasonCampaigns.schemaVersion, 'brycecast.careerSeasonCampaigns.v1');
const arcCampaigns = seasonCampaigns.campaigns.filter((campaign) => campaign.renderMode === 'arc');
assert.ok(arcCampaigns.length >= 2, 'at least two real points arcs must render');
for (const campaign of arcCampaigns) {
  let running = 0;
  for (const race of campaign.races) {
    running += race.racePoints;
    assert.equal(race.cumulativePoints, running, `${campaign.seriesShort} ${campaign.seasonYear} cumulative points must be the running sum`);
    if (race.hasRacePage) {
      assert.ok(
        careerScreen.resultConversion.some((row) => row.sessionId === race.sessionId),
        `${campaign.seriesShort} ${campaign.seasonYear} clickable race ${race.sessionId} must resolve to a race page`
      );
    }
  }
  assert.equal(campaign.earnedPoints, running, `${campaign.seriesShort} ${campaign.seasonYear} earned points equal the final cumulative`);
  if (campaign.reconciles === false) {
    assert.ok(
      typeof campaign.reconciliationNote === 'string' && campaign.reconciliationNote.length > 0,
      `${campaign.seriesShort} ${campaign.seasonYear} must reconcile earned vs official points in words`
    );
  }
}
const f1600 = arcCampaigns.find((campaign) => campaign.seasonYear === 2019);
assert.ok(f1600 && f1600.reconciles === false && f1600.earnedPoints === 656 && f1600.officialSeasonPoints === 639, 'F1600 2019 surfaces both the 656 earned and the official 639');
const currentCampaigns = seasonCampaigns.campaigns.filter((campaign) => campaign.isCurrent);
assert.equal(currentCampaigns.length, 1, 'exactly one current campaign');
const currentCampaign = currentCampaigns[0];
const currentSeasonEvents = (canonicalDataset.events ?? []).filter(
  (event: { seriesId?: string; seasonYear?: number }) =>
    event.seriesId === currentCampaign.seriesId && Number(event.seasonYear) === currentCampaign.seasonYear
);
const currentSeasonEndDate = currentSeasonEvents
  .map((event: { eventEndDate?: string; eventStartDate?: string }) => event.eventEndDate ?? event.eventStartDate ?? '')
  .sort()
  .at(-1);
assert.equal(currentCampaign.renderMode, 'arc', 'the latest INDY NXT campaign is a sourced points arc');
assert.equal(
  currentCampaign.inProgress,
  Boolean(currentSeasonEndDate && context.dataPackage.asOfDate <= currentSeasonEndDate),
  'campaign progress state must follow the canonical season boundary'
);
assert.ok(seasonCampaigns.excluded.every((row) => row.reason.length > 0), 'every excluded season names its reason');

/* Small-series stories: the three Career-chapter modules the points arc can't
   tell — F1600 events, FROC's guest campaign, and the sourced origin timeline.
   Each is honest to its denominators and sources. */
const conversionSessionIds = new Set(careerScreen.resultConversion.map((row) => row.sessionId));
const smallSeries = careerScreen.smallSeriesStories;
assert.equal(smallSeries.schemaVersion, 'brycecast.smallSeriesStories.v1');

const f1600Story = smallSeries.f1600!;
assert.ok(f1600Story && f1600Story.events.length === 7, 'F1600 season carries all seven event rounds');
assert.equal(f1600Story.totals.raceCount, 21, 'F1600 covers the full 21-race season');
assert.equal(f1600Story.totals.podiums, 8, 'F1600 season records eight sourced podiums');
assert.equal(f1600Story.totals.startsSourced, 0, 'F1600 never claims a grid it does not source');
assert.ok(f1600Story.totals.roundsWithQualifying <= f1600Story.totals.roundCount, 'F1600 qualifying rounds cannot exceed the rounds');
const f1600Races = f1600Story.events.flatMap((event) => event.races);
assert.equal(f1600Races.length, f1600Story.totals.raceCount, 'F1600 event races equal the season race count');
for (const race of f1600Races) {
  if (race.hasRacePage) {
    assert.ok(conversionSessionIds.has(race.sessionId), `F1600 clickable race ${race.sessionId} must resolve to a race page`);
  }
}

const frocStory = smallSeries.froc!;
assert.ok(frocStory && frocStory.events.length === 2, 'FROC surfaces the two rounds Bryce contested');
assert.equal(frocStory.coverage.roundsInSeries, 5, 'FROC championship had five rounds');
assert.equal(frocStory.coverage.roundsRun, 2, 'Bryce ran two of the five rounds');
assert.equal(frocStory.coverage.racesRun, 6, 'FROC guest campaign is six races');
assert.ok(frocStory.coverage.roundsRun < frocStory.coverage.roundsInSeries, 'FROC rounds-run must be an honest partial');
assert.equal(frocStory.absentRounds.length, frocStory.coverage.roundsInSeries - frocStory.coverage.roundsRun, 'every uncontested round is named');
assert.equal(frocStory.totals.wins, 1, 'FROC records the Highlands win');
const frocRaces = frocStory.events.flatMap((event) => event.races);
assert.equal(frocRaces.length, frocStory.coverage.racesRun, 'FROC event races equal the races-run denominator');
for (const race of frocRaces) {
  if (race.hasRacePage) {
    assert.ok(conversionSessionIds.has(race.sessionId), `FROC clickable race ${race.sessionId} must resolve to a race page`);
  }
}

const origin = smallSeries.origin;
assert.equal(origin.schemaVersion, 'brycecast.originMilestones.v1');
assert.equal(origin.recordStartsYear, 2019, 'the origin knows where the sourced record begins');
assert.ok(origin.items.length === 5, 'the origin timeline carries the five pre-record karting milestones (2016–2018)');
assert.ok(!origin.items.some((item) => item.year === 2019), 'the origin never duplicates the 2019 F1600 chapter');
assert.ok(
  !origin.items.some((item) => item.year !== null && item.year >= 2019),
  'the pre-record karting timeline ends in 2018 — the 2020 scholarship is not here'
);
for (const item of origin.items) {
  assert.ok(item.sourceId && item.sourceName && item.sourceUrl, `origin milestone ${item.id} must carry a named, linked source`);
}
const originYears = origin.items.map((item) => item.year ?? 0);
assert.deepEqual(originYears, [...originYears].sort((a, b) => a - b), 'the origin timeline is chronological');
// Per-source provenance: only web-archive captures read as archived, so the UI
// never mislabels a direct official page (e.g. the Team USA blog) as an archive.
for (const source of origin.sources) {
  assert.equal(
    source.archived,
    (source.sourceUrl ?? '').includes('web.archive.org'),
    `origin source ${source.sourceId} carries honest archived provenance`
  );
}

// The Formula Ford bridge: the 2020 Team USA Scholarship is told on its own
// chapter, not the pre-record karting timeline, and cites a direct official page.
const bridge = smallSeries.formulaFordBridge;
assert.ok(bridge, 'the Formula Ford bridge is present');
assert.equal(bridge!.schemaVersion, 'brycecast.formulaFordBridge.v1');
assert.equal(bridge!.year, 2020, 'the scholarship funded the 2020 Formula Ford move');
assert.equal(bridge!.scholarship.kind, 'career_award', 'the bridge carries the scholarship award, not a race result');
assert.ok(bridge!.sources.length >= 1 && bridge!.sources.every((source) => !source.archived), 'the scholarship cites a direct official page, not an archive');

/* The odometer: package-only React consumption with personal attribution,
   confidence-preserving physical mileage, and bounded travel semantics. */
const lifeStats = careerScreen.lifeStats;
assert.equal(lifeStats.schemaVersion, 'brycecast.careerLifeStats.v2');
assert.equal(lifeStats.personalRaceMileage.raceRows, canonicalBryceRaceSessionIds.size, 'life-stats must use all canonical Bryce race rows');
assert.equal(lifeStats.personalRaceMileage.coveredRaceRows, raceMileageRows.length, 'every canonical Bryce race row has sourced attribution');
assert.equal(lifeStats.personalRaceMileage.laps, expectedPersonalRaceLaps, 'personal race laps must reconcile to the driver-race ledger');
assert.equal(lifeStats.personalRaceMileage.miles, expectedPersonalRaceMiles, 'personal race mileage must reconcile to the driver-race ledger');
assert.deepEqual(
  [...new Set(lifeStats.coveredSessionIds)].sort(),
  [...canonicalBryceRaceSessionIds].sort(),
  'the packaged odometer dedup set must match the canonical Bryce race set'
);
assert.equal(lifeStats.physicalSessionMileage.floor.confidenceClass, 'observed_lower_bound');
assert.equal(lifeStats.physicalSessionMileage.exact.confidenceClass, 'observed_exact');
assert.equal(lifeStats.physicalSessionMileage.unknown.confidenceClass, 'unknown');
assert.equal(lifeStats.travel.greatCircleMinimum.miles, expectedTravelMinimumMiles, 'minimum displacement must reconcile to the travel-leg ledger');
assert.equal(lifeStats.travel.routeAdjustedMinimum.confidenceClass, 'modeled_range');
assert.deepEqual(lifeStats.travel.actualTravel.blockedBy, ['seasonBase', 'returnHomeFrequency']);
assert.deepEqual(
  new Set(lifeStats.mileageBreakdowns.map((row) => row.dimensionType)),
  new Set(['season', 'series', 'session_type', 'venue', 'country', 'confidence_class']),
  'life-stats package must carry every requested visualization breakdown'
);
assert.ok(lifeStats.travelModeBreakdown.length >= 2, 'travel-mode proxy breakdown must be packaged');
assert.deepEqual(
  new Set(lifeStats.fuelEstimateRanges.map((row) => `${row.seriesId}|${row.seasonYear}`)),
  expectedResourceKeys,
  'fuel ranges must cover every represented physical-session series/year'
);
assert.deepEqual(
  new Set(lifeStats.tireEstimateRanges.map((row) => `${row.seriesId}|${row.seasonYear}`)),
  expectedResourceKeys,
  'tire ranges must cover every represented physical-session series/year'
);
assert.ok(!JSON.stringify(lifeStats).includes('9137.7'), 'shared-car odometer value must never reach the UI contract');
assert.equal(lifeStats.venueSources.length, lifeStats.venues, 'SourcePill data must list every physical venue');
for (const venue of lifeStats.venueSources) {
  assert.ok(venue.trackName && venue.trackIds.length > 0, 'every venue source row needs an identity');
  assert.ok(venue.lengthSources.every((source) => source.includes(' | https://')), `${venue.trackName} needs named length sources`);
  assert.ok(venue.coordsSources.every((source) => source.includes(' | https://')), `${venue.trackName} needs named coordinate sources`);
}

/* The career atlas: geometry and every venue arrive package-fed, with canonical
   race semantics and click targets already resolved. */
const atlas = careerScreen.atlas;
assert.equal(atlas.schemaVersion, 'brycecast.careerAtlas.v3');
const expectedPhysicalVenueNames = new Set(lifeStats.venueSources.map((venue) => venue.trackName));
assert.equal(atlas.venueCount, expectedPhysicalVenueNames.size, 'atlas must carry every sourced physical venue after canonical track aliases merge');
assert.deepEqual(
  new Set(atlas.venues.map((venue) => venue.trackName)),
  expectedPhysicalVenueNames,
  'atlas venue identities must match the validated physical-venue source set'
);
assert.equal(atlas.raceCount, canonicalBryceRaceSessionIds.size, 'atlas race counts must use all canonical Bryce race rows');
assert.equal(atlas.venues.length, atlas.venueCount);
assert.equal(atlas.venues.reduce((sum, venue) => sum + venue.raceCount, 0), canonicalBryceRaceSessionIds.size);
assert.equal(atlas.naturalEarth.license, 'public_domain');
assert.equal(atlas.geometry.projection, 'equirectangular_wrapped');
assert.ok(atlas.geometry.landPath.startsWith('M') && atlas.geometry.ringCount >= 20, 'atlas land path must be built and clipped');
assert.equal(atlas.globe.projection, 'orthographic');
assert.equal(atlas.globe.texture.path, 'analysis/career-atlas/output/world_land_texture.png');
assert.equal(atlas.globe.texture.sourceFeatureCount, 127);
assert.deepEqual(atlas.globe.zoom, { min: 1, max: 32 });
assert.deepEqual(atlas.confidenceClasses, ['observed_exact', 'observed_lower_bound', 'modeled_range', 'unknown']);
for (const venue of atlas.venues) {
  assert.equal(venue.confidence.coordinates, 'observed_exact');
  assert.equal(venue.confidence.raceCount, 'observed_exact');
  assert.ok(venue.trackName && venue.country && venue.region && venue.raceCount > 0 && venue.seriesSpans.length > 0);
  assert.ok(venue.coordinateSources.every((source) => source.includes(' | https://')), `${venue.trackName} needs coordinate lineage`);
  assert.ok(/^\/(races|career\/race)\//.test(venue.latestRace.raceHref), `${venue.trackName} needs a latest race page`);
  assert.ok(venue.projected.x >= 0 && venue.projected.x <= atlas.geometry.canvas.width);
  assert.ok(venue.projected.y >= 0 && venue.projected.y <= atlas.geometry.canvas.height);
  for (const span of venue.seriesSpans) {
    assert.ok(span.raceCount > 0 && span.seriesShort && span.latestRace.sessionId);
    assert.ok(/^\/(races|career\/race)\//.test(span.latestRace.raceHref), `${venue.trackName} / ${span.seriesShort} needs a filtered race page`);
  }
}
assert.deepEqual(new Set(atlas.venues.map((venue) => venue.region)), new Set(['North America', 'Europe', 'Oceania']));
assert.ok(!JSON.stringify(atlas).includes('travelMiles'), 'travel displacement must not leak into the venue-only atlas');

/* The venue dossier: this place, other years. Bryce's most explicit ask —
   year-over-year conditions + results per venue, wind only where the shape is
   geo-registered, and every condition honestly non-official. */
const venueDossier = context.dataPackage.screens.venueDossier;
assert.equal(venueDossier.schemaVersion, 'brycecast.venueDossier.v1');
assert.ok(venueDossier.venues.length >= 1, 'venue dossier must carry venues');
assert.equal(venueDossier.venueCount, venueDossier.venues.length);
assert.ok(
  venueDossier.venues.filter((venue) => venue.upcoming).length <= 1,
  'at most one venue may be flagged as the upcoming race-week venue'
);
let dossierWeatherVisits = 0;
let dossierOrientedVenues = 0;
for (const venue of venueDossier.venues) {
  assert.ok(venue.venueId && venue.trackName, 'every dossier venue carries an identity');
  assert.equal(typeof venue.geo.oriented, 'boolean');
  if (venue.geo.oriented) {
    dossierOrientedVenues += 1;
    assert.ok(
      typeof venue.geo.northOffsetDeg === 'number' && venue.geo.northOffsetDeg >= 0 && venue.geo.northOffsetDeg < 360,
      `${venue.trackName} oriented venue must carry a real north offset for the wind bearing`
    );
    assert.ok(venue.trackSlug, `${venue.trackName} oriented venue must carry a trackSlug`);
  } else {
    assert.equal(venue.geo.northOffsetDeg, null, `${venue.trackName} un-oriented venue must never guess a bearing`);
  }
  assert.ok(venue.visits.length >= 1, `${venue.trackName} must carry at least one visit`);
  assert.deepEqual(
    venue.visitYears,
    [...new Set(venue.visits.map((visit) => visit.seasonYear))].sort((a, b) => a - b),
    `${venue.trackName} visitYears must be the sorted unique visit seasons`
  );
  for (const visit of venue.visits) {
    assert.equal(visit.raceHref, `/races/${visit.sessionId}`, 'every visit clicks through to its race page');
    if (visit.conditions) {
      dossierWeatherVisits += 1;
      assert.equal(visit.conditions.official, false, 'dossier conditions are never official');
      assert.ok(visit.conditions.source, 'dossier conditions name their source');
    }
    if (visit.deltaVsPrior) {
      assert.ok(
        venue.visits.some((candidate) => candidate.sessionId === visit.deltaVsPrior?.priorSessionId),
        'a visit delta compares against a prior visit at the same venue'
      );
    }
  }
}
assert.ok(dossierOrientedVenues >= 1, 'at least one OSM-traced venue must be geo-oriented for wind-on-shape');
assert.ok(dossierWeatherVisits >= 1, 'near-track conditions must join at least one visit');
const multiVisitVenue = venueDossier.venues.find((venue) => venue.visits.length >= 2 && venue.visits.some((visit) => visit.deltaVsPrior));
assert.ok(multiVisitVenue, 'at least one venue must carry a year-over-year delta');

/* Restart Report Card: the career through-line + per-venue prior contract. */
const restarts = careerScreen.restarts;
assert.equal(restarts.schemaVersion, 'brycecast.restartReport.v1');
assert.equal(restarts.precision, 'lap-chart', 'v1 is fed by the lap-chart derivation');
assert.equal(restarts.windowLaps, 2, 'the measured window is the two green laps after each restart');
assert.ok(restarts.career.totalRestarts > 0, 'career restart total must be populated');
assert.equal(
  restarts.byRace.reduce((sum, row) => sum + (row.restartCount ?? 0), 0),
  restarts.career.totalRestarts,
  'per-race restart counts must sum to the career total'
);
assert.ok(
  restarts.byRace.every((row) => row.sessionId.includes('indy_nxt')),
  'the through-line clicks through to INDY NXT race pages'
);
assert.ok(
  restarts.byRace.every((row) => (row.restartCount ?? 0) > 0),
  'the through-line only carries races that had a restart'
);
assert.ok(restarts.byVenue.length > 0, 'a per-venue prior must exist for Race Week');
assert.equal(
  restarts.byVenue.reduce((sum, row) => sum + row.restarts, 0),
  restarts.career.totalRestarts,
  'per-venue rollup must reconcile to the career total'
);
const nashville = restarts.byVenue.find((row) => row.venueSlug === 'nashville_superspeedway');
assert.ok(nashville && nashville.races > 0, 'Nashville prior must be available for the upcoming Race Week');
assert.ok(
  restarts.career.bryceGained + restarts.career.bryceHeld + restarts.career.bryceSlipped === restarts.career.bryceRestartsCounted,
  'every counted restart is gained, held, or slipped'
);
/* The gold-day flag (career chart color budget) is computed in the lane, never
 * in the UI: gold requires the day net to strictly beat the field's median. */
for (const row of restarts.byRace) {
  assert.equal(typeof row.bryceBeatFieldTypical, 'boolean', `${row.sessionId} must carry the gold-day flag`);
  if (row.bryceBeatFieldTypical) {
    assert.ok(
      row.fieldMedianNet !== null && (row.bryceNet ?? -99) > row.fieldMedianNet,
      `${row.sessionId} gold-day flag must mean net above the field median`
    );
  }
}
assert.ok(
  restarts.byRace.some((row) => row.bryceBeatFieldTypical),
  'at least one gold day exists for the career chart key'
);
assert.ok(
  restarts.sourceRefs.some((ref) => ref.path === 'analysis/restart-report/output/summary.json'),
  'restart report must cite its validated summary'
);

/* The qualifying layer: one qualifying model across every series, with the
   source-family discipline preserved on the wire and every conversion figure
   carrying a labeled denominator. */
const qualifying = careerScreen.qualifyingLayer;
assert.equal(qualifying.schemaVersion, 'brycecast.qualifyingLayer.v1');
assert.ok(qualifying.career.qualifyingAppearances > 0, 'career qualifying appearances must be populated');
assert.equal(
  qualifying.career.finishedAhead + qualifying.career.held + qualifying.career.finishedBehind,
  qualifying.career.conversionRaces,
  'conversion outcomes must partition the conversion races (a labeled denominator)'
);
assert.ok(
  qualifying.bySeries.length > 0 && qualifying.bySeries.length <= 7,
  'a per-series rollup must exist and cover at most the seven canonical chapters'
);
for (const family of qualifying.bySeries.flatMap((row) => row.sourceFamilies)) {
  assert.ok(
    family === 'official_qualifying' || family === 'qualifying_session_result',
    'every series must carry one of the two known source families'
  );
}
assert.equal(
  qualifying.bySeries.reduce((sum, row) => sum + row.conversionRaces, 0),
  qualifying.career.conversionRaces,
  'per-series conversion races must sum to the career total'
);
/* Source-family exclusivity survives to the UI: no season straddles both
   families in the shipped map — the audit's core discipline. */
for (const entry of qualifying.sourceFamilyMap) {
  assert.equal(
    Object.keys(entry.families).length,
    1,
    `season ${entry.seriesId} ${entry.seasonYear} must resolve to exactly one source family`
  );
}
/* GB3 2021 carries both families in the raw data but must resolve to the
   dedicated qualifyingResults family in the layer. */
const gb32021 = qualifying.sourceFamilyMap.find(
  (entry) => entry.seriesId === 'series_gb3' && entry.seasonYear === 2021
);
assert.equal(gb32021?.primaryFamily, 'official_qualifying', 'GB3 2021 must read from the dedicated qualifying source');
assert.ok(
  qualifying.sourceRefs.some((ref) => ref.path === 'analysis/qualifying-layer/output/summary.json'),
  'qualifying layer must cite its validated summary'
);

/* GB3 depth pack: the source-bounded contracts the chapter depth layer relies
   on. Loads through the same pack-module glob the UI uses. */
{
  const { loadGb3DeepDive } = await import('../src/data/gb3DeepDive');
  const gb3 = await loadGb3DeepDive();
  assert.ok(gb3, 'GB3 deep-dive pack must load through the context-pack glob');

  /* No pace substrate: the UI must never build lap-trace/section modules. */
  assert.equal(gb3.lapShapeAvailable, false, 'GB3 has no lap shape');
  assert.equal(gb3.sectionPaceAvailable, false, 'GB3 has no section pace');
  assert.equal(gb3.counts.lapSampleRows, 0, 'GB3 exposes zero lap samples');
  assert.equal(gb3.counts.sectionMetricRows, 0, 'GB3 exposes zero section metrics');

  /* Two source families, and every result carries a family tag. */
  assert.deepEqual(
    new Set(gb3.sourceFamilies),
    new Set(['2021 TSL official PDFs', '2022 GB3 official JSON']),
    'GB3 must stay split across its two source families'
  );
  assert.equal(gb3.raceResults.length, 44, 'GB3 carries all 44 Bryce race rows');
  assert.equal(gb3.teamContext.length, 44, 'team context spans every GB3 race');
  assert.equal(gb3.trackProfile.length, 6, 'GB3 profiles six venues');

  /* Grid-to-finish is 2021-only: 2021 rows carry a start, 2022 rows never do. */
  const r2021 = gb3.raceResults.filter((row) => row.seasonYear === 2021);
  const r2022 = gb3.raceResults.filter((row) => row.seasonYear === 2022);
  assert.ok(r2021.length > 0 && r2022.length > 0, 'GB3 spans both seasons');
  assert.ok(
    r2021.every((row) => row.startPosition !== null),
    'every 2021 race must carry a source-backed grid start'
  );
  assert.ok(
    r2022.every((row) => row.startPosition === null),
    '2022 must never expose an inferred start — grid data is 2021-only'
  );

  /* Two races have no classified result; they render open, never invented. */
  const unclassified = gb3.raceResults.filter((row) => row.finishPosition === null);
  assert.equal(unclassified.length, 2, 'GB3 has exactly two unclassified races');
  assert.ok(
    gb3.raceResults
      .filter((row) => row.finishPosition !== null)
      .every((row) => row.finishPercentile !== null),
    'every classified GB3 finish carries a field-share percentile'
  );

  /* Conditions are 2021-only official labels. */
  assert.ok(gb3.weatherContext.length > 0, 'GB3 carries 2021 condition context');
  assert.ok(
    gb3.weatherContext.every((row) => row.seasonYear === 2021),
    'GB3 conditions are 2021-only'
  );

  /* Team context is finishing order in {1,2,3} or null (unclassified). */
  assert.ok(
    gb3.teamContext.every(
      (row) => row.bryceWithinTeamRank === null || [1, 2, 3].includes(row.bryceWithinTeamRank)
    ),
    'within-team rank is a small result-order integer or absent'
  );
}

/* Caution cause copy (design-review law): render counted facts, and say "most"
   ONLY when a single category is strictly more than half. Both cases asserted. */
{
  // Tie — never a verdict. Nashville 2026: one contact, one debris.
  const tie = [
    { category: 'Contact', count: 1 },
    { category: 'Debris', count: 1 }
  ];
  assert.equal(causeMajority(tie), null, 'a 1–1 tie has no majority cause');
  assert.equal(causeFacts(tie), '1 contact · 1 debris', 'tie renders counted facts');
  assert.equal(causeClause(tie, ', '), '1 contact, 1 debris', 'tile clause joins ties with a comma');

  // Bare plurality — also not a majority. Mid-Ohio: 2 contact, 2 mechanical, 1 off course.
  const plurality = [
    { category: 'Off course', count: 1 },
    { category: 'Mechanical', count: 2 },
    { category: 'Contact', count: 2 }
  ];
  assert.equal(causeMajority(plurality), null, 'a 2–2 lead is not strictly over half');
  assert.equal(
    causeFacts(plurality),
    '2 contact · 2 mechanical · 1 off course',
    'plurality renders counted facts, ordered by count then name'
  );

  // Strict majority — the one case "most" is earned. 3 of 4 is over half.
  const majority = [
    { category: 'Contact', count: 3 },
    { category: 'Debris', count: 1 }
  ];
  assert.deepEqual(causeMajority(majority), { category: 'Contact', count: 3 }, '3 of 4 is a strict majority');
  assert.equal(causeClause(majority), 'mostly contact', 'a strict majority earns "mostly"');

  // Single category renders bare, never "mostly".
  assert.equal(causeClause([{ category: 'Contact', count: 2 }]), 'contact', 'a lone cause renders bare');
}

console.log('ui context adapter hydration tests passed');
