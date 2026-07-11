import assert from 'node:assert/strict';
import { buildBryceCastUiContext } from '../src/data/uiContextAdapter';

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

assert.ok(context.careerLab.contextPack.resultConversionRows >= 100);
assert.ok(context.careerLab.contextPack.metricFamilyParity.length > 0);
assert.ok(context.careerLab.deepContextPacks.careerDimension, 'career dimension deep pack must load');
assert.ok(context.careerLab.deepContextPacks.imsaDaytonaStint, 'IMSA deep pack must load');

console.log('ui context adapter hydration tests passed');
