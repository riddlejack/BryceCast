import assert from 'node:assert/strict';
import { buildBryceCastUiContext } from '../src/data/uiContextAdapter';
import { buildOfficialPointsWindow, headToHeadForCar, headToHeadForLiveDriver } from '../src/data/livePageModel';

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

assert.ok(context.careerLab.contextPack.resultConversionRows >= 100);
assert.ok(context.careerLab.contextPack.metricFamilyParity.length > 0);
assert.ok(context.careerLab.deepContextPacks.careerDimension, 'career dimension deep pack must load');
assert.ok(context.careerLab.deepContextPacks.imsaDaytonaStint, 'IMSA deep pack must load');

/* Career Lab v2 modules: rivals, weather joins, lap texture. */
const careerScreen = context.dataPackage.screens.careerLab;
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

console.log('ui context adapter hydration tests passed');
