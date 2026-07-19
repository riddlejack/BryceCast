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
  const nashville = await loadSectionLaps('session_indy_nxt_2024_6323');
  assert.ok(nashville, 'Nashville 2024 section-lap pack must load with integrity');
  assert.equal(nashville.sections.length, 3, 'Nashville reports three official section families');
  const fullRace = sectionObservationsFromLaps(nashville, { kind: 'full_race' }, 'median');
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
assert.equal(lifeStats.personalRaceMileage.raceRows, 145, 'life-stats must use all canonical Bryce race rows');
assert.equal(lifeStats.personalRaceMileage.coveredRaceRows, 145, 'every canonical Bryce race row has sourced attribution');
assert.equal(lifeStats.personalRaceMileage.laps, 3019, 'Daytona must use driver-stint laps, not shared-car laps');
assert.equal(lifeStats.personalRaceMileage.miles, 6924.4, 'personal race mileage must reconcile to the driver-race ledger');
assert.equal(lifeStats.physicalSessionMileage.floor.confidenceClass, 'observed_lower_bound');
assert.equal(lifeStats.physicalSessionMileage.exact.confidenceClass, 'observed_exact');
assert.equal(lifeStats.physicalSessionMileage.unknown.confidenceClass, 'unknown');
assert.equal(lifeStats.travel.greatCircleMinimum.miles, 54649.3, 'minimum displacement must stay venue-to-venue');
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
assert.equal(atlas.raceCount, 145, 'atlas race counts must use all canonical Bryce race rows');
assert.equal(atlas.venues.length, atlas.venueCount);
assert.equal(atlas.venues.reduce((sum, venue) => sum + venue.raceCount, 0), 145);
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
assert.ok(!JSON.stringify(atlas).includes('54649.3'), 'minimum displacement must not leak into the venue-only atlas');

console.log('ui context adapter hydration tests passed');
