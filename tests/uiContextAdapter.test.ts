import assert from 'node:assert/strict';
import { buildBryceCastUiContext } from '../src/data/uiContextAdapter';
import { buildLiveBattleFrame, buildOfficialPointsWindow, headToHeadForCar, headToHeadForLiveDriver } from '../src/data/livePageModel';

/* Venue-agnostic hydration invariants: counts come from the package itself,
   never from a hardcoded event slice, so schedule roll-forwards don't break CI. */

const context = await buildBryceCastUiContext();

assert.equal(context.dataPackage.schemaVersion, 'brycecast.uiDataPackage.v1');

const manifest = context.contextPackManifest;
assert.equal(manifest.packs.filter((pack) => pack.type === 'upcoming_event').length, manifest.packCounts.upcoming_event);
assert.equal(manifest.packs.filter((pack) => pack.type === 'race_debrief').length, manifest.packCounts.race_debrief);
assert.equal(manifest.packCounts.career_lab, 1);
assert.equal(manifest.packCounts.live_race_day, 1);

assert.equal(context.contextPackIntegrity.algorithm, 'sha256');
assert.ok(context.contextPackIntegrity.checkedRefs >= 4, 'live, career, prep, and debrief packs must be integrity-checked');
assert.equal(new Set(context.contextPackIntegrity.checkedPaths).size, context.contextPackIntegrity.checkedPaths.length, 'checked paths must be unique');

assert.ok(context.upcomingPrep.events.length >= 1, 'at least one upcoming prep event must hydrate while future events exist');
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
}
const standings = upcomingScreen.standingsSnapshot;
assert.ok(standings && typeof standings.available === 'boolean', 'standingsSnapshot must carry an explicit available flag');
if (standings.available) {
  assert.equal(standings.seriesGuard.ok, true, 'standings must sit behind a passing series guard');
  assert.equal(standings.entries.filter((entry) => entry.isBryce).length, 1, 'exactly one guarded Bryce standings entry');
  assert.ok(standings.caveats.length >= 1, 'standings must state unofficial-points caveats');
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
  assert.ok(Array.isArray(passMarkRefs) && passMarkRefs.length === 25, 'exactly 25 GO races carry a pass-mark pack');
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

assert.ok(context.careerLab.contextPack.resultConversionRows >= 100);
assert.ok(context.careerLab.contextPack.metricFamilyParity.length > 0);
assert.ok(context.careerLab.deepContextPacks.careerDimension, 'career dimension deep pack must load');
assert.ok(context.careerLab.deepContextPacks.imsaDaytonaStint, 'IMSA deep pack must load');

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

/* The odometer: package-only React consumption with personal attribution,
   confidence-preserving physical mileage, and bounded travel semantics. */
const lifeStats = careerScreen.lifeStats;
assert.equal(lifeStats.schemaVersion, 'brycecast.careerLifeStats.v2');
assert.equal(lifeStats.personalRaceMileage.raceRows, 146, 'life-stats must use all canonical Bryce race rows');
assert.equal(lifeStats.personalRaceMileage.coveredRaceRows, 146, 'every canonical Bryce race row has sourced attribution');
assert.equal(lifeStats.personalRaceMileage.laps, 3084, 'Daytona must use driver-stint laps, not shared-car laps');
assert.equal(lifeStats.personalRaceMileage.miles, 7010.9, 'personal race mileage must reconcile to the driver-race ledger');
assert.equal(lifeStats.physicalSessionMileage.floor.confidenceClass, 'observed_lower_bound');
assert.equal(lifeStats.physicalSessionMileage.exact.confidenceClass, 'observed_exact');
assert.equal(lifeStats.physicalSessionMileage.unknown.confidenceClass, 'unknown');
assert.equal(lifeStats.travel.greatCircleMinimum.miles, 55029.6, 'minimum displacement must stay venue-to-venue');
assert.equal(lifeStats.travel.routeAdjustedMinimum.confidenceClass, 'modeled_range');
assert.deepEqual(lifeStats.travel.actualTravel.blockedBy, ['seasonBase', 'returnHomeFrequency']);
assert.deepEqual(
  new Set(lifeStats.mileageBreakdowns.map((row) => row.dimensionType)),
  new Set(['season', 'series', 'session_type', 'venue', 'country', 'confidence_class']),
  'life-stats package must carry every requested visualization breakdown'
);
assert.ok(lifeStats.travelModeBreakdown.length >= 2, 'travel-mode proxy breakdown must be packaged');
assert.equal(lifeStats.fuelEstimateRanges.length, 10, 'fuel ranges must be packaged by series/chassis/year');
assert.equal(lifeStats.tireEstimateRanges.length, 10, 'tire ranges must be packaged by series/year');
assert.ok(!JSON.stringify(lifeStats).includes('9137.7'), 'shared-car odometer value must never reach the UI contract');
assert.equal(lifeStats.venueSources.length, lifeStats.venues, 'SourcePill data must list every physical venue');
for (const venue of lifeStats.venueSources) {
  assert.ok(venue.trackName && venue.trackIds.length > 0, 'every venue source row needs an identity');
  assert.ok(venue.lengthSources.every((source) => source.includes(' | https://')), `${venue.trackName} needs named length sources`);
  assert.ok(venue.coordsSources.every((source) => source.includes(' | https://')), `${venue.trackName} needs named coordinate sources`);
}

/* The career atlas: geometry and every venue arrive package-fed, with A2's
   145-row semantics and click targets already resolved. */
const atlas = careerScreen.atlas;
assert.equal(atlas.schemaVersion, 'brycecast.careerAtlas.v3');
assert.equal(atlas.venueCount, 34, 'atlas must carry every physical A2 venue');
assert.equal(atlas.raceCount, 146, 'atlas race counts must use all canonical Bryce race rows');
assert.equal(atlas.venues.length, atlas.venueCount);
assert.equal(atlas.venues.reduce((sum, venue) => sum + venue.raceCount, 0), 146);
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
assert.ok(!JSON.stringify(atlas).includes('55029.6'), 'minimum displacement must not leak into the venue-only atlas');

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

console.log('ui context adapter hydration tests passed');
