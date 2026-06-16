import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const repoRoot = process.cwd();
const packagePath = path.join(repoRoot, 'analysis/ui-data-package/ui-data-package.json');

const fail = (message) => {
  throw new Error(message);
};

if (!fs.existsSync(packagePath)) {
  fail('UI data package is missing. Run npm run analytics:ui-data-package.');
}

const dataPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (dataPackage.schemaVersion !== 'brycecast.uiDataPackage.v1') {
  fail(`Unexpected UI data package schemaVersion: ${dataPackage.schemaVersion}`);
}

const requiredScreens = ['roadAmericaPrep', 'liveCompanionFixtures', 'raceDebrief', 'careerLab', 'sourceOps'];
const sourceInventory = dataPackage.sourceInventory ?? {};

if (Object.keys(sourceInventory).length === 0) {
  fail('UI data package sourceInventory is empty.');
}

for (const [key, source] of Object.entries(sourceInventory)) {
  if (!source?.path || typeof source.bytes !== 'number' || !source.sha256) {
    fail(`sourceInventory entry ${key} is missing path/bytes/sha256.`);
  }
  const sourcePath = path.join(repoRoot, source.path);
  if (!fs.existsSync(sourcePath)) {
    fail(`sourceInventory entry ${key} points to missing file: ${source.path}`);
  }
  const currentStat = fs.statSync(sourcePath);
  const currentSha256 = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  if (currentStat.size !== source.bytes || currentSha256 !== source.sha256) {
    fail(`sourceInventory entry ${key} is stale for ${source.path}`);
  }
}

for (const screen of requiredScreens) {
  if (!dataPackage.screens?.[screen]) fail(`UI data package missing screen ${screen}`);
  if (!Array.isArray(dataPackage.screens[screen].sourceRefs) || dataPackage.screens[screen].sourceRefs.length === 0) {
    fail(`Screen ${screen} has no sourceRefs`);
  }
  if (!Array.isArray(dataPackage.screens[screen].caveats) || dataPackage.screens[screen].caveats.length === 0) {
    fail(`Screen ${screen} has no caveats`);
  }
  for (const ref of dataPackage.screens[screen].sourceRefs) {
    const isRuntimeEndpoint = typeof ref.path === 'string' && ref.path.startsWith('/api/');
    const isInventoriedFile = Object.values(sourceInventory).some((source) => source.path === ref.path);
    if (!isRuntimeEndpoint && !isInventoriedFile) {
      fail(`Screen ${screen} has sourceRef ${ref.key} that is neither runtime API nor sourceInventory-backed: ${ref.path}`);
    }
  }
}

if (dataPackage.screens.roadAmericaPrep.events.length < 2) {
  fail('Road America prep should include both Race 1 and Race 2 event rows.');
}

const fixtureStates = new Set(dataPackage.screens.liveCompanionFixtures.fixtures.map((fixture) => fixture.state));
for (const state of dataPackage.screens.liveCompanionFixtures.requiredStates) {
  if (!fixtureStates.has(state)) fail(`Live fixture state missing: ${state}`);
}

const fixtureVariants = new Set(dataPackage.screens.liveCompanionFixtures.fixtures.map((fixture) => fixture.variant ?? 'base'));
for (const variant of dataPackage.screens.liveCompanionFixtures.requiredVariants ?? []) {
  if (!fixtureVariants.has(variant)) fail(`Live fixture variant missing: ${variant}`);
}

const hasWeatherPartialFixture = dataPackage.screens.liveCompanionFixtures.fixtures.some((fixture) => {
  const weatherGate = fixture.gates?.find((gate) => gate.id === 'weather');
  return fixture.weather?.sourceState === 'partial' && fixture.weather?.warnings?.length > 0 && weatherGate?.state === 'warn';
});
if (!hasWeatherPartialFixture) {
  fail('Live fixture coverage must include a partial weather fixture with warnings and a warn weather gate.');
}

const historyStanding = dataPackage.screens.sourceOps.historyStanding ?? {};
for (const fixture of dataPackage.screens.liveCompanionFixtures.fixtures) {
  if (fixture.points?.schemaVersion !== 'live-points.v1') fail(`Live fixture ${fixture.state} is missing live-points.v1 payload`);
  if (!fixture.points?.mode) fail(`Live fixture ${fixture.state} is missing points.mode`);
  if (fixture.points?.checkedAt !== fixture.checkedAt) fail(`Live fixture ${fixture.state} points.checkedAt does not match fixture.checkedAt`);
  if (typeof fixture.points?.officialModelAvailable !== 'boolean') fail(`Live fixture ${fixture.state} is missing points.officialModelAvailable`);
  if (typeof fixture.points?.reconciliationRequired !== 'boolean') fail(`Live fixture ${fixture.state} is missing points.reconciliationRequired`);
  if (!fixture.points?.bryce || !Object.hasOwn(fixture.points.bryce, 'totalEntrantPoints')) fail(`Live fixture ${fixture.state} is missing points.bryce.totalEntrantPoints`);
  if (fixture.points.bryce.historicalDriverPoints !== historyStanding.points || fixture.points.bryce.historicalRank !== historyStanding.rank) {
    fail(`Live fixture ${fixture.state} historical fallback points do not match history-bryce standing`);
  }
  if (fixture.state === 'wrong_series' && fixture.raceWeekend?.eventName) {
    fail('wrong_series fixture must not populate product raceWeekend.eventName');
  }
  if (fixture.state === 'wrong_series') {
    if (fixture.bryce?.identityGuard?.seriesOk !== false) fail('wrong_series fixture identityGuard.seriesOk must be false');
    if (fixture.bryce?.identityGuard?.matchedBy !== null) fail('wrong_series fixture identityGuard.matchedBy must be null');
    if (fixture.bryce?.bryce !== null) fail('wrong_series fixture must not populate bryce.bryce');
    const car9Row = fixture.liveTiming?.rows?.find((row) => row.no === '9');
    if (!car9Row || car9Row.bryce !== false) {
      fail('wrong_series fixture must include a non-Bryce car #9 row to guard top-series contamination');
    }
  }
  if (fixture.state === 'blocked' && fixture.liveTiming?.sourceState === 'live' && fixture.variant !== 'no_bryce_archive_ready' && fixture.variant !== 'no_bryce_archive_missing') {
    fail('blocked fixture must not report live timing sourceState unless it is the same-series no-Bryce variant');
  }
  if (!fixture.liveTiming?.checkedAt || !fixture.liveTiming?.heartbeat || !Array.isArray(fixture.liveTiming?.rows)) {
    fail(`Live fixture ${fixture.state} must include runtime-shaped liveTiming checkedAt/heartbeat/rows`);
  }
  if (fixture.liveTiming.rows.length !== fixture.liveTiming.rowCount) {
    fail(`Live fixture ${fixture.state} liveTiming.rows length does not match rowCount`);
  }
  if (!fixture.raceWeekend || !Object.hasOwn(fixture.raceWeekend, 'checkedAt') || !Object.hasOwn(fixture.raceWeekend, 'broadcastRoute')) {
    fail(`Live fixture ${fixture.state} must include runtime-shaped raceWeekend`);
  }
  if (!fixture.bryce?.checkedAt || !fixture.bryce?.heartbeat || !Object.hasOwn(fixture.bryce, 'profile') || !Object.hasOwn(fixture.bryce, 'warnings')) {
    fail(`Live fixture ${fixture.state} must include runtime-shaped Bryce state`);
  }
  if (fixture.liveTiming?.rowCount !== fixture.points?.fieldCoverage?.rows) {
    fail(`Live fixture ${fixture.state} liveTiming.rowCount does not match points.fieldCoverage.rows`);
  }
  if (fixture.bryce?.identityGuard?.rcDriverId !== '2143') {
    fail(`Live fixture ${fixture.state} identityGuard must use runtime rcDriverId`);
  }
  if ('raceControlDriverId' in (fixture.bryce?.identityGuard ?? {})) {
    fail(`Live fixture ${fixture.state} identityGuard must not use stale raceControlDriverId`);
  }
  if (fixture.state === 'blocked' && !String(fixture.variant ?? '').startsWith('no_bryce') && fixture.bryce?.identityGuard?.seriesOk !== false) {
    fail('blocked fixture must not claim seriesOk proof');
  }
  const replayGate = fixture.gates.find((gate) => gate.id === 'replay_archive');
  if (fixture.replay?.archiveState !== 'ready' && replayGate?.state === 'pass') {
    fail(`Live fixture ${fixture.state}/${fixture.variant ?? 'base'} must not pass replay_archive gate when archiveState is ${fixture.replay?.archiveState}`);
  }
  if (!Object.hasOwn(fixture.replay ?? {}, 'available') || !fixture.replay?.generatedAt || !Array.isArray(fixture.replay?.sessions) || !fixture.replay?.summary || !Array.isArray(fixture.replay?.rows) || !Array.isArray(fixture.replay?.warnings)) {
    fail(`Live fixture ${fixture.state}/${fixture.variant ?? 'base'} must include runtime-shaped replay payload`);
  }
  if (fixture.variant === 'replay_repeated_cold' && !fixture.replay?.warnings?.length) {
    fail('replay_repeated_cold fixture must include replay warnings');
  }
  if (
    fixture.weather?.schemaVersion !== 'live-weather.v1' ||
    !fixture.weather?.checkedAt ||
    fixture.weather?.source !== 'NWS API' ||
    !Object.hasOwn(fixture.weather, 'point') ||
    !Object.hasOwn(fixture.weather, 'grid') ||
    !Object.hasOwn(fixture.weather, 'observation') ||
    !Array.isArray(fixture.weather?.forecastHourly) ||
    !Array.isArray(fixture.weather?.forecast) ||
    !Array.isArray(fixture.weather?.alerts) ||
    !Array.isArray(fixture.weather?.probes) ||
    !fixture.weather?.cache ||
    !Array.isArray(fixture.weather?.warnings)
  ) {
    fail(`Live fixture ${fixture.state}/${fixture.variant ?? 'base'} must include runtime-shaped weather payload`);
  }
  for (const probeId of ['nws_points', 'nws_observation_stations', 'nws_latest_observation', 'nws_hourly_forecast', 'nws_forecast', 'nws_alerts']) {
    if (!fixture.weather.probes.some((probe) => probe.id === probeId)) {
      fail(`Live fixture ${fixture.state}/${fixture.variant ?? 'base'} is missing weather probe ${probeId}`);
    }
  }
  if (!Array.isArray(fixture.sources?.endpoints) || fixture.sources.endpoints.length === 0) {
    fail(`Live fixture ${fixture.state} is missing representative source endpoints`);
  }
  if (!Array.isArray(fixture.gates) || fixture.gates.length === 0) {
    fail(`Live fixture ${fixture.state} is missing readiness gates`);
  }
  for (const gateId of ['timing_reachable', 'indy_nxt_heartbeat', 'bryce_identity', 'timing_freshness', 'points_fields', 'weather', 'replay_archive']) {
    if (!fixture.gates.some((gate) => gate.id === gateId)) {
      fail(`Live fixture ${fixture.state} is missing readiness gate ${gateId}`);
    }
  }
}

if (dataPackage.screens.raceDebrief.featuredDebriefs.length < 3) {
  fail('Race debrief package should include latest, best, and lowest finish percentile debrief seeds.');
}

for (const debrief of dataPackage.screens.raceDebrief.featuredDebriefs) {
  if (!debrief.sourceState || !debrief.confidence || !debrief.caveat) {
    fail(`Debrief ${debrief.sessionId} is missing source/confidence/caveat state`);
  }
}

if (dataPackage.screens.careerLab.seriesSummary.length === 0) {
  fail('Career Lab series summary is empty.');
}

if (dataPackage.screens.sourceOps.validation.errorCount !== 0) {
  fail(`Validation report has errors: ${dataPackage.screens.sourceOps.validation.errorCount}`);
}

if (!dataPackage.screens.sourceOps.sourceRefs.some((ref) => ref.path === 'public/data/history-bryce.json')) {
  fail('Source Ops historyStanding must include public/data/history-bryce.json sourceRef');
}

if (!(dataPackage.uiReadyArtifacts?.missingBackendContracts ?? []).some((contract) => /Runtime live-readiness hardening proof/i.test(contract))) {
  fail('UI data package must preserve runtime live-readiness hardening as a backend follow-up');
}

if (!(dataPackage.uiReadyArtifacts?.uiFixtureCoverage ?? []).some((contract) => /static UI fixtures/i.test(contract))) {
  fail('UI data package must preserve static UI fixture coverage separately from backend proof');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      screens: requiredScreens.length,
      roadAmericaEvents: dataPackage.screens.roadAmericaPrep.events.length,
      liveFixtures: dataPackage.screens.liveCompanionFixtures.fixtures.length,
      debriefSeeds: dataPackage.screens.raceDebrief.featuredDebriefs.length,
      careerSeries: dataPackage.screens.careerLab.seriesSummary.length
    },
    null,
    2
  )
);
