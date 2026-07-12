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
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataPackage.asOfDate ?? ''))) {
  fail('UI data package asOfDate must be recorded as YYYY-MM-DD.');
}
const packageAsOfDate = dataPackage.asOfDate;

const hashFile = (relativePath) =>
  createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex');

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateMs = (value) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 10 : null;
};

const requiredScreens = ['upcomingPrep', 'liveCompanionFixtures', 'raceDebrief', 'careerLab', 'sourceOps'];
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
  const currentSha256 = hashFile(source.path);
  if (currentStat.size !== source.bytes || currentSha256 !== source.sha256) {
    fail(`sourceInventory entry ${key} is stale for ${source.path}`);
  }
}

if (sourceInventory.canonicalDataset?.path !== 'data/career/career.dataset.json') {
  fail('sourceInventory missing canonicalDataset.');
}
if (dataPackage.sourceHash !== hashFile('data/career/career.dataset.json')) {
  fail('UI data package sourceHash does not match canonical dataset.');
}

const canonicalDataset = JSON.parse(fs.readFileSync(path.join(repoRoot, sourceInventory.canonicalDataset.path), 'utf8'));
const canonicalIndexes = (dataset) => ({
  sessions: new Map((dataset.sessions ?? []).map((row) => [row.id, row])),
  events: new Map((dataset.events ?? []).map((row) => [row.id, row]))
});
const canonicalIndyBryceRaceSessions = (dataset) => {
  const { sessions, events } = canonicalIndexes(dataset);
  const out = new Set();
  for (const result of dataset.results ?? []) {
    if (result.driverId !== 'driver_bryce_aron') continue;
    const session = sessions.get(result.sessionId);
    const event = events.get(session?.eventId);
    if (session?.sessionType === 'race' && event?.seriesId === 'series_indy_nxt') {
      out.add(result.sessionId);
    }
  }
  return out;
};
const canonicalFutureIndyEvents = (dataset, asOfDate) => {
  const { sessions, events } = canonicalIndexes(dataset);
  const bryceResultEventIds = new Set();
  for (const result of dataset.results ?? []) {
    if (result.driverId !== 'driver_bryce_aron') continue;
    const session = sessions.get(result.sessionId);
    if (session?.sessionType === 'race') {
      bryceResultEventIds.add(session.eventId);
    }
  }
  return new Set(
    [...events.values()]
      .filter((event) => {
        const eventDateKey = String(event.eventStartDate ?? '').slice(0, 10);
        return (
          event.seriesId === 'series_indy_nxt' &&
          !bryceResultEventIds.has(event.id) &&
          /^\d{4}-\d{2}-\d{2}$/.test(eventDateKey) &&
          eventDateKey >= asOfDate
        );
      })
      .map((event) => event.id)
  );
};
const canonicalBryceFinishedRaceSessions = (dataset) => {
  const { sessions } = canonicalIndexes(dataset);
  return new Set(
    (dataset.results ?? [])
      .filter(
        (result) =>
          result.driverId === 'driver_bryce_aron' &&
          result.finishPosition !== null &&
          sessions.get(result.sessionId)?.sessionType === 'race'
      )
      .map((result) => result.sessionId)
  );
};
const expectedUpcomingEventIds = canonicalFutureIndyEvents(canonicalDataset, packageAsOfDate);
const expectedRaceDebriefSessionIds = canonicalIndyBryceRaceSessions(canonicalDataset);
const expectedUpcomingEventPacks = expectedUpcomingEventIds.size;
const expectedRaceDebriefPacks = expectedRaceDebriefSessionIds.size;
const expectedCareerResultConversionRows = canonicalBryceFinishedRaceSessions(canonicalDataset).size;

const validatePackRef = (packRef, label) => {
  if (!packRef?.path || typeof packRef.bytes !== 'number' || !packRef.sha256) {
    fail(`${label} context pack ref is missing path/bytes/sha256.`);
  }
  const packPath = path.join(repoRoot, packRef.path);
  if (!fs.existsSync(packPath)) {
    fail(`${label} context pack ref points to missing file: ${packRef.path}`);
  }
  const currentStat = fs.statSync(packPath);
  const currentSha256 = hashFile(packRef.path);
  if (currentStat.size !== packRef.bytes || currentSha256 !== packRef.sha256) {
    fail(`${label} context pack ref is stale for ${packRef.path}`);
  }
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  if (pack.sourceHash !== dataPackage.sourceHash) {
    fail(`${label} context pack sourceHash does not match UI package sourceHash.`);
  }
  if (pack.type === 'upcoming_event' && pack.asOfDate !== dataPackage.asOfDate) {
    fail(`${label} upcoming context pack asOfDate does not match UI package asOfDate.`);
  }
  for (const field of ['id', 'type']) {
    if (pack[field] !== packRef[field]) {
      fail(`${label} context pack ${field} mismatch: ref=${packRef[field]} pack=${pack[field]}`);
    }
  }
  for (const field of ['eventId', 'sessionId']) {
    if (Object.hasOwn(packRef, field) && String(pack[field] ?? '') !== String(packRef[field] ?? '')) {
      fail(`${label} context pack ${field} mismatch: ref=${packRef[field]} pack=${pack[field]}`);
    }
  }
  if (!Array.isArray(pack.sourceRefs) || pack.sourceRefs.length === 0) {
    fail(`${label} context pack is missing embedded sourceRefs.`);
  }
  pack.sourceRefs.forEach((ref, index) => validateEmbeddedSourceRef(ref, `${label} sourceRefs[${index}]`));
  return pack;
};

const packIdentityKey = (pack) => [
  pack.id ?? '',
  pack.type ?? '',
  pack.eventId ?? '',
  pack.sessionId ?? '',
  pack.path ?? ''
].join('|');

const assertSetEqual = (actual, expected, label) => {
  const missing = [...expected].filter((item) => !actual.has(item)).sort();
  const extra = [...actual].filter((item) => !expected.has(item)).sort();
  if (missing.length > 0 || extra.length > 0) {
    fail(`${label} mismatch: missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  }
};

const validateJsonSourceRefs = (sourceInventoryKey, label, { requireAsOfDate = false } = {}) => {
  const source = sourceInventory[sourceInventoryKey];
  if (!source) {
    fail(`sourceInventory missing ${sourceInventoryKey}`);
  }
  const object = JSON.parse(fs.readFileSync(path.join(repoRoot, source.path), 'utf8'));
  if (object.sourceHash !== dataPackage.sourceHash) {
    fail(`${label} sourceHash does not match UI package sourceHash.`);
  }
  if (requireAsOfDate && object.asOfDate !== packageAsOfDate) {
    fail(`${label} asOfDate must match UI package asOfDate.`);
  }
  for (const [index, ref] of (object.sourceRefs ?? []).entries()) {
    validateEmbeddedSourceRef(ref, `${label} sourceRefs[${index}]`);
  }
  return object;
};

const validateEmbeddedSourceRef = (ref, label) => {
  if (!ref?.path) {
    fail(`${label} is missing path.`);
  }
  if (typeof ref.path === 'string' && ref.path.startsWith('/api/')) {
    return;
  }
  if (typeof ref.bytes !== 'number' || !ref.sha256) {
    fail(`${label} is missing bytes/sha256 for ${ref.path}.`);
  }
  const sourcePath = path.join(repoRoot, ref.path);
  if (!fs.existsSync(sourcePath)) {
    fail(`${label} points to missing source file: ${ref.path}`);
  }
  const currentStat = fs.statSync(sourcePath);
  const currentSha256 = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  if (currentStat.size !== ref.bytes || currentSha256 !== ref.sha256) {
    fail(`${label} is stale for ${ref.path}`);
  }
};

const validateChartRef = (chartRef, label) => {
  if (!chartRef?.path || typeof chartRef.bytes !== 'number' || !chartRef.sha256) {
    fail(`${label} chart ref is missing path/bytes/sha256.`);
  }
  const chartPath = path.join(repoRoot, chartRef.path);
  if (!fs.existsSync(chartPath)) {
    fail(`${label} chart ref points to missing file: ${chartRef.path}`);
  }
  const currentStat = fs.statSync(chartPath);
  const currentSha256 = createHash('sha256').update(fs.readFileSync(chartPath)).digest('hex');
  if (currentStat.size !== chartRef.bytes || currentSha256 !== chartRef.sha256) {
    fail(`${label} chart ref is stale for ${chartRef.path}`);
  }
};

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

const predictive = dataPackage.predictiveRaceIntelligence;
if (!predictive) {
  fail('UI data package must expose predictiveRaceIntelligence context-pack handoff.');
}
if (!dataPackage.baselineCommit || dataPackage.predictiveRaceIntelligenceRepoHead !== dataPackage.baselineCommit) {
  fail('UI data package predictiveRaceIntelligenceRepoHead must match generated baselineCommit.');
}

for (const key of [
  'predictiveSummary',
  'predictiveInventory',
  'predictiveModelScorecard',
  'predictiveContextPackManifest',
  'predictiveCareerPriorMatrix',
  'predictiveIndyFeatureMatrix',
  'sectionLapDeepDiveSummary',
  'sectionLapContextPack',
  'raceLapSectionSummary',
  'raceLapSectionContextPack',
  'supplementalPrepSectionContextPack',
  'supplementalRaceLapSectionContextPack',
  'prepSessionSignals',
  'fieldStrengthByRace',
  'sectionResultsDeepByRace',
  'leaderLapContext',
  'indyNxtLapTimeline'
]) {
  if (!sourceInventory[key]) {
    fail(`sourceInventory missing predictive source ${key}`);
  }
}
for (const key of ['predictiveBuilderScript', 'predictiveValidatorScript', 'sectionLapBuilderScript', 'sectionLapValidatorScript', 'raceLapSectionBuilderScript', 'raceLapSectionValidatorScript', 'predictiveRunnerScript', 'uiDataPackageBuilderScript', 'uiDataPackageValidatorScript']) {
  if (!sourceInventory[key]) {
    fail(`sourceInventory missing generator source ${key}`);
  }
}
const predictiveInventory = validateJsonSourceRefs('predictiveInventory', 'Predictive inventory', { requireAsOfDate: true });
const predictiveSummary = validateJsonSourceRefs('predictiveSummary', 'Predictive summary', { requireAsOfDate: true });
const predictiveScorecard = validateJsonSourceRefs('predictiveModelScorecard', 'Predictive model scorecard');
for (const item of predictiveInventory.items ?? []) {
  validateEmbeddedSourceRef(
    { path: item.sourcePath, bytes: item.bytes, sha256: item.sha256 },
    `Predictive inventory item ${item.id}`
  );
}
const predictiveManifest = validateJsonSourceRefs('predictiveContextPackManifest', 'Predictive context-pack manifest', { requireAsOfDate: true });
if (predictiveSummary.upcomingEventPacks !== predictive.contextPackCounts?.upcomingEvent || predictiveScorecard.sourceHash !== dataPackage.sourceHash) {
  fail('Predictive summary/scorecard source metadata does not match UI package handoff.');
}
if (predictive.asOfDate !== predictiveSummary.asOfDate || predictive.asOfDate !== predictiveManifest.asOfDate || dataPackage.asOfDate !== predictive.asOfDate) {
  fail('Predictive asOfDate metadata must match across UI package, summary, and manifest.');
}

if (predictive.contextPackCounts?.upcomingEvent !== expectedUpcomingEventPacks) {
  fail(`Expected ${expectedUpcomingEventPacks} upcoming-event context packs, got ${predictive.contextPackCounts?.upcomingEvent}`);
}
if (predictive.contextPackCounts?.raceDebrief !== expectedRaceDebriefPacks) {
  fail(`Expected ${expectedRaceDebriefPacks} race-debrief context packs, got ${predictive.contextPackCounts?.raceDebrief}`);
}
if (predictive.contextPackCounts?.careerLab !== 1 || predictive.contextPackCounts?.liveRaceDay !== 1) {
  fail('Expected one Career Lab and one live race-day context pack.');
}
if (!Array.isArray(predictive.validationGates) || !predictive.validationGates.some((gate) => gate.id === 'live_green_flag_proof' && gate.status === 'blocked_by_live_proof')) {
  fail('Predictive race-intelligence handoff must preserve live green-flag proof as blocked_by_live_proof.');
}
if (!Array.isArray(predictive.modelPromotionGates) || predictive.modelPromotionGates.length < 5) {
  fail('Predictive race-intelligence handoff must expose model promotion gates.');
}
if (!Array.isArray(predictive.chartRefs) || predictive.chartRefs.length === 0) {
  fail('Predictive race-intelligence handoff must expose hashed chart refs.');
}
predictive.chartRefs.forEach((chartRef, index) => validateChartRef(chartRef, `Predictive chartRefs[${index}]`));
if (!Array.isArray(predictive.contextPackRefs)) {
  fail('Predictive race-intelligence handoff must expose all context pack refs.');
}
for (const [index, pack] of (predictiveManifest.packs ?? []).entries()) {
  validateChartRef(pack, `Predictive manifest packs[${index}]`);
}
const manifestPackKeys = new Set((predictiveManifest.packs ?? []).map(packIdentityKey));
const uiPackKeys = new Set(predictive.contextPackRefs.map(packIdentityKey));
if (manifestPackKeys.size !== uiPackKeys.size) {
  fail('Predictive contextPackRefs key count must match the current context-pack manifest.');
}
for (const key of manifestPackKeys) {
  if (!uiPackKeys.has(key)) {
    fail(`Predictive contextPackRefs are missing current manifest pack ${key}`);
  }
}
const contextPackRefsByType = predictive.contextPackRefs.reduce((acc, packRef) => {
  validatePackRef(packRef, `Predictive ${packRef.id}`);
  acc[packRef.type] = (acc[packRef.type] ?? 0) + 1;
  return acc;
}, {});
if (
  contextPackRefsByType.upcoming_event !== predictive.contextPackCounts.upcomingEvent ||
  contextPackRefsByType.race_debrief !== predictive.contextPackCounts.raceDebrief ||
  contextPackRefsByType.career_lab !== predictive.contextPackCounts.careerLab ||
  contextPackRefsByType.live_race_day !== predictive.contextPackCounts.liveRaceDay
) {
  fail('Predictive contextPackRefs counts must match contextPackCounts.');
}
assertSetEqual(
  new Set(predictive.contextPackRefs.filter((packRef) => packRef.type === 'upcoming_event').map((packRef) => packRef.eventId)),
  expectedUpcomingEventIds,
  'Predictive upcoming-event context pack eventId set'
);
assertSetEqual(
  new Set(predictive.contextPackRefs.filter((packRef) => packRef.type === 'race_debrief').map((packRef) => packRef.sessionId)),
  expectedRaceDebriefSessionIds,
  'Predictive race-debrief context pack sessionId set'
);

if (!Array.isArray(dataPackage.screens.upcomingPrep.events) || dataPackage.screens.upcomingPrep.events.length !== expectedUpcomingEventPacks) {
  fail(`Upcoming prep should include all ${expectedUpcomingEventPacks} future INDY NXT event row(s).`);
}
if (expectedUpcomingEventPacks > 0 && !dataPackage.screens.upcomingPrep.nextVenue) {
  fail('Upcoming prep must identify the next upcoming venue.');
}
if (dataPackage.screens.upcomingPrep.contextPackRefs?.length !== dataPackage.screens.upcomingPrep.events.length) {
  fail('Upcoming prep must link every predictive upcoming-event context pack.');
}
assertSetEqual(
  new Set(dataPackage.screens.upcomingPrep.events.map((event) => event.eventId)),
  expectedUpcomingEventIds,
  'Upcoming prep eventId set'
);
dataPackage.screens.upcomingPrep.contextPackRefs.forEach((packRef, index) => {
  if (packRef.type !== 'upcoming_event') {
    fail(`Unexpected upcoming prep context pack type for ${packRef.id}: ${packRef.type}`);
  }
  const event = dataPackage.screens.upcomingPrep.events[index];
  if (packRef.eventId !== event.eventId) {
    fail(`Upcoming prep context pack ref ${packRef.id} does not match event ${event.eventId}`);
  }
  if (event.sourcePayload !== 'upcoming_event_context_pack') {
    fail(`Upcoming prep event ${event.eventId} must be sourced from an upcoming-event context pack.`);
  }
  if (event.contextPackRef?.path !== packRef.path) {
    fail(`Upcoming prep event ${event.eventId} must embed the matching context pack ref.`);
  }
  const pack = validatePackRef(packRef, `Upcoming prep ${packRef.id}`);
  if (
    event.trackName !== pack.track?.name ||
    event.predictionBand?.claimStrength !== pack.predictionBand?.claimStrength ||
    event.top10Path?.length !== pack.top10Path?.length
  ) {
    fail(`Upcoming prep event ${event.eventId} does not mirror its context-pack payload.`);
  }
  if (!Object.hasOwn(event, 'weatherState')) {
    fail(`Upcoming prep event ${event.eventId} must preserve the public weatherState field.`);
  }
  if (
    typeof event.sameTrack?.top10RatePct !== 'number' ||
    typeof event.trackTypeHistory?.top10RatePct !== 'number' ||
    Object.hasOwn(event.sameTrack ?? {}, 'top10Rate') ||
    Object.hasOwn(event.trackTypeHistory ?? {}, 'top10Rate')
  ) {
    fail(`Upcoming prep event ${event.eventId} must expose stable top10RatePct fields, not raw 0-1 top10Rate fields.`);
  }
});
for (let index = 1; index < dataPackage.screens.upcomingPrep.events.length; index += 1) {
  const previous = dataPackage.screens.upcomingPrep.events[index - 1];
  const current = dataPackage.screens.upcomingPrep.events[index];
  if (dateMs(current.eventStartDate) < dateMs(previous.eventStartDate)) {
    fail('Upcoming prep events must be ordered by context-pack eventStartDate.');
  }
}
for (const [key, ref] of Object.entries(dataPackage.screens.upcomingPrep.supplementalContextRefs ?? {})) {
  validateEmbeddedSourceRef(ref, `Upcoming prep supplementalContextRefs.${key}`);
  const pack = JSON.parse(fs.readFileSync(path.join(repoRoot, ref.path), 'utf8'));
  if (pack.sourceHash !== dataPackage.sourceHash) {
    fail(`Upcoming prep supplementalContextRefs.${key} sourceHash does not match UI package sourceHash.`);
  }
  if (pack.trackName !== dataPackage.screens.upcomingPrep.nextVenue) {
    fail(`Upcoming prep supplementalContextRefs.${key} trackName must match nextVenue.`);
  }
}
for (const key of ['prepSection', 'raceLapSection']) {
  if (!dataPackage.screens.upcomingPrep.supplementalContextRefs?.[key]) {
    fail(`Upcoming prep missing supplementalContextRefs.${key}`);
  }
}

/* ---------- Race Week prep modules ---------- */

const nextEventPrep = dataPackage.screens.upcomingPrep.nextEventPrep;
if (expectedUpcomingEventPacks > 0) {
  if (!nextEventPrep) {
    fail('Upcoming prep must carry nextEventPrep while future events exist.');
  } else {
    const nextEvent = dataPackage.screens.upcomingPrep.events[0];
    if (nextEventPrep.eventId !== nextEvent.eventId || nextEventPrep.trackType !== nextEvent.trackType) {
      fail('nextEventPrep must describe the first upcoming event.');
    }
    if (!Array.isArray(nextEventPrep.races) || nextEventPrep.races.length === 0) {
      fail('nextEventPrep.races must contain the Bryce track-type history rows.');
    }
    for (const row of nextEventPrep.races ?? []) {
      if (!row.sessionId || typeof row.startPosition !== 'number' || typeof row.finishPosition !== 'number') {
        fail(`nextEventPrep race row ${row.sessionId ?? '(missing id)'} needs sessionId, startPosition, finishPosition.`);
      }
      if (!Object.hasOwn(row, 'officialStatus')) {
        fail(`nextEventPrep race row ${row.sessionId} must carry officialStatus for honest exclusion labels.`);
      }
    }
    const summary = nextEventPrep.raceSummary ?? {};
    if (summary.raceCount !== nextEventPrep.races.length) {
      fail('nextEventPrep.raceSummary.raceCount must match the race rows.');
    }
    if (summary.cleanRaceCount !== nextEventPrep.races.filter((row) => row.officialStatus === 'running').length) {
      fail('nextEventPrep.raceSummary.cleanRaceCount must equal the running-status rows.');
    }
    const raceIds = new Set(nextEventPrep.races.map((row) => row.sessionId));
    for (const row of nextEventPrep.fridaySignal ?? []) {
      if (!raceIds.has(row.sessionId)) {
        fail(`nextEventPrep.fridaySignal row ${row.sessionId} must join to a race row.`);
      }
    }
    if (!Array.isArray(nextEventPrep.caveats) || nextEventPrep.caveats.length === 0) {
      fail('nextEventPrep must state its caveats.');
    }
  }
}

const standingsSnapshot = dataPackage.screens.upcomingPrep.standingsSnapshot;
if (!standingsSnapshot || typeof standingsSnapshot.available !== 'boolean') {
  fail('Upcoming prep must carry standingsSnapshot with an explicit available flag.');
} else if (standingsSnapshot.available) {
  if (standingsSnapshot.seriesGuard?.ok !== true) {
    fail('standingsSnapshot must only publish entries behind a passing series guard.');
  }
  const bryceEntries = (standingsSnapshot.entries ?? []).filter((entry) => entry.isBryce);
  if (bryceEntries.length !== 1) {
    fail('standingsSnapshot must contain exactly one guarded Bryce entry.');
  }
  for (let index = 1; index < (standingsSnapshot.entries ?? []).length; index += 1) {
    if (standingsSnapshot.entries[index - 1].points < standingsSnapshot.entries[index].points) {
      fail('standingsSnapshot entries must be sorted by points, descending.');
    }
  }
  if (bryceEntries[0] && standingsSnapshot.bryce?.points !== bryceEntries[0].points) {
    fail('standingsSnapshot.bryce must mirror the guarded Bryce entry.');
  }
  if (!Array.isArray(standingsSnapshot.caveats) || standingsSnapshot.caveats.length === 0) {
    fail('standingsSnapshot must state its unofficial-points caveats.');
  }
}

/* ---------- race-story packs ---------- */

const raceStoryRefs = dataPackage.screens.raceDebrief.raceStoryRefs;
if (!Array.isArray(raceStoryRefs) || raceStoryRefs.length !== expectedRaceDebriefSessionIds.size) {
  fail(`raceDebrief.raceStoryRefs must cover all ${expectedRaceDebriefSessionIds.size} race-debrief sessions.`);
}
assertSetEqual(new Set((raceStoryRefs ?? []).map((ref) => ref.sessionId)), expectedRaceDebriefSessionIds, 'Race-story pack sessionId set');
for (const ref of raceStoryRefs ?? []) {
  const storyPath = path.join(repoRoot, ref.path);
  if (!fs.existsSync(storyPath)) {
    fail(`Race-story pack missing on disk: ${ref.path}`);
    continue;
  }
  const raw = fs.readFileSync(storyPath);
  if (createHash('sha256').update(raw).digest('hex') !== ref.sha256 || raw.length !== ref.bytes) {
    fail(`Race-story pack ref is stale for ${ref.path}`);
  }
  const story = JSON.parse(raw.toString());
  if (story.sessionId !== ref.sessionId || story.id !== ref.id || story.type !== 'race_story') {
    fail(`Race-story pack identity mismatch for ${ref.path}`);
  }
  const drivers = story.lapChart?.drivers ?? [];
  const bryceDrivers = drivers.filter((driver) => driver.isBryce);
  if (bryceDrivers.length > 1) {
    fail(`Race-story pack ${ref.sessionId} must not carry duplicate Bryce lap-chart lines.`);
  }
  const bryceHasLaps = bryceDrivers.length === 1 && (bryceDrivers[0].laps ?? []).length > 0;
  if (story.bryce?.inLapChart !== bryceHasLaps) {
    fail(`Race-story pack ${ref.sessionId} bryce.inLapChart must match the lap-chart contents.`);
  }
  if (!bryceHasLaps && story.bryce?.lapsCompleted !== 0) {
    fail(`Race-story pack ${ref.sessionId} has no Bryce lap line but does not record 0 completed laps.`);
  }
  if (drivers.length < 2) {
    fail(`Race-story pack ${ref.sessionId} lap chart must include the field, not just Bryce.`);
  }
  const totalLaps = story.lapChart?.totalLaps ?? 0;
  for (const moment of story.inflections ?? []) {
    if (moment.lap < 1 || moment.lap > totalLaps) {
      fail(`Race-story pack ${ref.sessionId} inflection lap ${moment.lap} is outside 1..${totalLaps}.`);
    }
  }
  if (!Array.isArray(story.caveats) || story.caveats.length === 0) {
    fail(`Race-story pack ${ref.sessionId} must state caveats.`);
  }
}

/* ---------- season index (archive spine) ---------- */

const seasonIndex = dataPackage.screens.raceDebrief.seasonIndex;
if (!Array.isArray(seasonIndex) || seasonIndex.length !== expectedRaceDebriefSessionIds.size) {
  fail(`raceDebrief.seasonIndex must carry one row per race-debrief session (${expectedRaceDebriefSessionIds.size}).`);
}
assertSetEqual(new Set((seasonIndex ?? []).map((row) => row.sessionId)), expectedRaceDebriefSessionIds, 'Season index sessionId set');
for (const row of seasonIndex ?? []) {
  if (typeof row.finishPosition !== 'number' || typeof row.seasonYear !== 'number' || typeof row.roundIndex !== 'number') {
    fail(`Season index row ${row.sessionId} needs seasonYear, roundIndex, finishPosition.`);
  }
  if (!Object.hasOwn(row, 'officialStatus')) {
    fail(`Season index row ${row.sessionId} must carry officialStatus.`);
  }
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

if (dataPackage.screens.liveCompanionFixtures.contextPackRef?.type !== 'live_race_day') {
  fail('Live companion fixtures must link the live race-day context pack.');
}
validatePackRef(dataPackage.screens.liveCompanionFixtures.contextPackRef, 'Live companion');

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

if (dataPackage.screens.raceDebrief.contextPackCoverage?.raceDebriefPacks !== expectedRaceDebriefPacks) {
  fail(`Race debrief screen must expose all ${expectedRaceDebriefPacks} race-debrief context packs through coverage metadata.`);
}
if (!Array.isArray(dataPackage.screens.raceDebrief.contextPackRefs) || dataPackage.screens.raceDebrief.contextPackRefs.length !== expectedRaceDebriefPacks) {
  fail(`Race debrief screen must enumerate all ${expectedRaceDebriefPacks} race-debrief context pack refs.`);
}
const raceDebriefPackSessionIds = new Set();
const raceDebriefPackPayloads = [];
for (const packRef of dataPackage.screens.raceDebrief.contextPackRefs) {
  if (packRef.type !== 'race_debrief' || !packRef.sessionId) {
    fail('Race debrief contextPackRefs must contain race_debrief refs with sessionId.');
  }
  if (raceDebriefPackSessionIds.has(packRef.sessionId)) {
    fail(`Race debrief contextPackRefs duplicate sessionId ${packRef.sessionId}`);
  }
  raceDebriefPackSessionIds.add(packRef.sessionId);
  raceDebriefPackPayloads.push(validatePackRef(packRef, `Race debrief context pack ${packRef.sessionId}`));
}

for (const debrief of dataPackage.screens.raceDebrief.featuredDebriefs) {
  if (!debrief.sourceState || !debrief.confidence || !debrief.caveat) {
    fail(`Debrief ${debrief.sessionId} is missing source/confidence/caveat state`);
  }
  if (debrief.sourcePayload !== 'race_debrief_context_pack') {
    fail(`Debrief ${debrief.sessionId} must be sourced from a race-debrief context pack.`);
  }
  if (debrief.contextPackRef?.type !== 'race_debrief' || debrief.contextPackRef?.sessionId !== debrief.sessionId) {
    fail(`Debrief ${debrief.sessionId} is missing its race-debrief context pack ref`);
  }
  const pack = validatePackRef(debrief.contextPackRef, `Debrief ${debrief.sessionId}`);
  if (
    debrief.raceLabel !== pack.raceLabel ||
    debrief.track?.name !== pack.track?.name ||
    debrief.result?.finishPosition !== pack.outcome?.finishPosition
  ) {
    fail(`Debrief ${debrief.sessionId} does not mirror its context-pack payload.`);
  }
  if (
    debrief.analysis?.paceIndex !== percentValue(pack.conversion?.paceIndex) ||
    debrief.analysis?.conversionPercentileDelta !== percentValue(pack.conversion?.conversionPercentileDelta)
  ) {
    fail(`Debrief ${debrief.sessionId} analysis fields must use UI percentage units derived from the context pack.`);
  }
  if (pack.raceContext) {
    if (!debrief.incidentPenalty) {
      fail(`Debrief ${debrief.sessionId} must preserve incident/penalty context from its raceContext pack.`);
    }
    for (const field of ['sessionIncidentCount', 'sessionPenaltyCount', 'bryceIncidentCount', 'brycePenaltyCount']) {
      if (numberOrZero(debrief.incidentPenalty[field]) !== numberOrZero(pack.raceContext[field])) {
        fail(`Debrief ${debrief.sessionId} incidentPenalty.${field} must mirror raceContext.${field}.`);
      }
    }
  }
  if (!Array.isArray(debrief.sourceRefs) || debrief.sourceRefs.length === 0) {
    fail(`Debrief ${debrief.sessionId} must expose UI-shaped nested sourceRefs.`);
  }
  for (const [index, ref] of debrief.sourceRefs.entries()) {
    if (!ref.key || !ref.note || !ref.path) {
      fail(`Debrief ${debrief.sessionId} sourceRefs[${index}] must include key/path/note.`);
    }
    validateEmbeddedSourceRef(ref, `Debrief ${debrief.sessionId} sourceRefs[${index}]`);
  }
}
const expectedLatestDebrief = raceDebriefPackPayloads
  .slice()
  .sort(
    (left, right) =>
      numberOrZero(right.seasonYear) - numberOrZero(left.seasonYear) ||
      numberOrZero(right.raceOrder?.roundIndex) - numberOrZero(left.raceOrder?.roundIndex)
  )[0];
const actualLatestDebrief = dataPackage.screens.raceDebrief.featuredDebriefs.find((debrief) => debrief.label === 'latestCompleted');
if (actualLatestDebrief?.sessionId !== expectedLatestDebrief?.sessionId) {
  fail(`Race debrief latestCompleted must use max raceOrder, expected ${expectedLatestDebrief?.sessionId} got ${actualLatestDebrief?.sessionId}`);
}

if (dataPackage.screens.careerLab.seriesSummary.length === 0) {
  fail('Career Lab series summary is empty.');
}

if (dataPackage.screens.careerLab.contextPackRef?.type !== 'career_lab') {
  fail('Career Lab must link the Career Lab context pack.');
}
const careerLabPack = validatePackRef(dataPackage.screens.careerLab.contextPackRef, 'Career Lab');
if (dataPackage.screens.careerLab.sourcePayload !== 'career_lab_context_pack') {
  fail('Career Lab must be sourced from the Career Lab context pack.');
}
if (dataPackage.screens.careerLab.careerPriorMatrixPath !== sourceInventory.predictiveCareerPriorMatrix.path) {
  fail('Career Lab must expose the predictive career prior matrix path.');
}
if (dataPackage.screens.careerLab.resultConversionRows !== expectedCareerResultConversionRows || dataPackage.screens.careerLab.resultConversion?.length !== expectedCareerResultConversionRows) {
  fail(`Career Lab must expose all ${expectedCareerResultConversionRows} result-conversion rows, not only a preview sample.`);
}
if (
  dataPackage.screens.careerLab.seriesSummary.length !== (careerLabPack.seriesSummary ?? []).length ||
  dataPackage.screens.careerLab.resultConversionRows !== careerLabPack.resultConversionRows ||
  dataPackage.screens.careerLab.resultConversion?.length !== (careerLabPack.resultConversion ?? []).length
) {
  fail('Career Lab screen payload does not mirror the Career Lab context pack.');
}
const resultConversionFields = new Set(Object.keys(dataPackage.screens.careerLab.resultConversion[0] ?? {}));
for (const field of ['startPosition', 'finishPosition', 'finishPercentile', 'seriesName']) {
  if (!resultConversionFields.has(field)) {
    fail(`Career Lab result-conversion rows are missing ${field}`);
  }
}

if (dataPackage.screens.sourceOps.validation.errorCount !== 0) {
  fail(`Validation report has errors: ${dataPackage.screens.sourceOps.validation.errorCount}`);
}

if (!dataPackage.screens.sourceOps.sourceRefs.some((ref) => ref.path === 'public/data/history-bryce.json')) {
  fail('Source Ops historyStanding must include public/data/history-bryce.json sourceRef');
}

if (dataPackage.screens.sourceOps.gapBoundary?.path !== sourceInventory.contextEventGapBoundary.path) {
  fail('Source Ops gapBoundary must point to the generated gap source-boundary artifact.');
}
if (dataPackage.screens.sourceOps.gapBoundary?.rowCount !== dataPackage.screens.sourceOps.ingestion.openGapCount) {
  fail('Source Ops gapBoundary rowCount must match ingestion openGapCount.');
}
const ingestionSummaryForGaps = JSON.parse(fs.readFileSync(path.join(repoRoot, sourceInventory.ingestionSummary.path), 'utf8'));
const expectedGapById = new Map((ingestionSummaryForGaps.openGaps ?? []).map((gap) => [gap.id, gap]));
const gapBoundaryRows = dataPackage.screens.sourceOps.gapBoundary?.rows ?? [];
const observedGapIds = new Set(gapBoundaryRows.map((row) => row.gapId));
if (observedGapIds.size !== expectedGapById.size) {
  fail('Source Ops gapBoundary must expose each current open gap exactly once.');
}
for (const [gapId, expectedGap] of expectedGapById) {
  const row = gapBoundaryRows.find((candidate) => candidate.gapId === gapId);
  if (!row) {
    fail(`Source Ops gapBoundary missing open gap ${gapId}.`);
  }
  if (row.sourceHash !== dataPackage.sourceHash) {
    fail(`Source Ops gapBoundary row ${gapId} sourceHash does not match UI package sourceHash.`);
  }
  if (row.description !== expectedGap.description) {
    fail(`Source Ops gapBoundary row ${gapId} description does not match ingestion summary.`);
  }
}

if (dataPackage.screens.sourceOps.predictiveRaceIntelligence?.contextPackManifestPath !== sourceInventory.predictiveContextPackManifest.path) {
  fail('Source Ops must expose predictive race-intelligence context-pack manifest path.');
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
      upcomingEvents: dataPackage.screens.upcomingPrep.events.length,
      liveFixtures: dataPackage.screens.liveCompanionFixtures.fixtures.length,
      debriefSeeds: dataPackage.screens.raceDebrief.featuredDebriefs.length,
      careerSeries: dataPackage.screens.careerLab.seriesSummary.length,
      contextPacks: predictive.contextPackCounts
    },
    null,
    2
  )
);
