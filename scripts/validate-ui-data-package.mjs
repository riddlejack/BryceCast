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

/* ---------- section-lap packs (Brief H: heat map + drawer traceability) ---------- */

const sectionLapRefs = dataPackage.screens.raceDebrief.sectionLapRefs;
if (!Array.isArray(sectionLapRefs) || sectionLapRefs.length === 0) {
  fail('raceDebrief.sectionLapRefs must exist (sessions with official per-lap section observations).');
}
for (const ref of sectionLapRefs ?? []) {
  if (!expectedRaceDebriefSessionIds.has(ref.sessionId)) {
    fail(`Section-lap ref ${ref.sessionId} is not a race-debrief session.`);
  }
  const packPath = path.join(repoRoot, ref.path);
  if (!fs.existsSync(packPath)) {
    fail(`Section-lap pack missing on disk: ${ref.path}`);
    continue;
  }
  const raw = fs.readFileSync(packPath);
  if (createHash('sha256').update(raw).digest('hex') !== ref.sha256 || raw.length !== ref.bytes) {
    fail(`Section-lap pack ref is stale for ${ref.path}`);
  }
  const pack = JSON.parse(raw.toString());
  if (pack.sessionId !== ref.sessionId || pack.id !== ref.id || pack.type !== 'section_laps') {
    fail(`Section-lap pack identity mismatch for ${ref.path}`);
  }
  if (pack.venueName !== ref.venueName || pack.seasonYear !== ref.seasonYear) {
    fail(`Section-lap ref venue/season must mirror the pack for ${ref.path}`);
  }
  if (!Array.isArray(pack.sections) || pack.sections.length === 0) {
    fail(`Section-lap pack ${ref.sessionId} must carry at least one section family.`);
  }
  const tupleLength = (pack.tupleOrder ?? []).length;
  if (tupleLength < 8) {
    fail(`Section-lap pack ${ref.sessionId} must declare its tuple order.`);
  }
  for (const section of pack.sections ?? []) {
    for (const lapTuple of section.laps ?? []) {
      if (!Array.isArray(lapTuple) || lapTuple.length !== tupleLength) {
        fail(`Section-lap pack ${ref.sessionId} "${section.sectionName}" has a malformed lap tuple.`);
        break;
      }
      const [lap, pct] = lapTuple;
      if (lap !== null && (lap < 1 || lap > (pack.totalLaps ?? 0))) {
        fail(`Section-lap pack ${ref.sessionId} "${section.sectionName}" lap ${lap} outside 1..${pack.totalLaps}.`);
        break;
      }
      if (pct !== null && (pct < 0 || pct > 1)) {
        fail(`Section-lap pack ${ref.sessionId} "${section.sectionName}" percentile ${pct} outside [0,1].`);
        break;
      }
    }
  }
  if (!Array.isArray(pack.caveats) || pack.caveats.length === 0) {
    fail(`Section-lap pack ${ref.sessionId} must state caveats.`);
  }
}

/* ---------- career conversion rows must carry chronology ---------- */

const conversionRows = dataPackage.screens.careerLab.resultConversion ?? [];
const undatedConversionRows = conversionRows.filter((row) => !row.eventStartDate).length;
if (conversionRows.length === 0 || undatedConversionRows > 0) {
  fail(`careerLab.resultConversion must carry eventStartDate on every row (${undatedConversionRows} missing of ${conversionRows.length}).`);
}

/* ---------- career named moments: deterministic semantics + referential integrity ---------- */

const careerMomentKindOrder = [
  'first_car_win',
  'first_indy_nxt_race',
  'best_indy_nxt_finish',
  'daytona_24',
  'wwtr_mechanical'
];
const compareCareerMomentChronology = (left, right) =>
  String(left?.eventStartDate ?? '').localeCompare(String(right?.eventStartDate ?? '')) ||
  String(left?.sessionId ?? '').localeCompare(String(right?.sessionId ?? ''));
const chronologicalConversionRows = conversionRows.slice().sort(compareCareerMomentChronology);
const conversionBySession = new Map(conversionRows.map((row) => [row.sessionId, row]));
const indyNxtConversionRows = chronologicalConversionRows.filter((row) => row.seriesId === 'series_indy_nxt');
const expectedMomentSessions = new Map();
const firstCarWin = chronologicalConversionRows.find((row) => numberOrZero(row.finishPosition) === 1) ?? null;
if (firstCarWin) expectedMomentSessions.set('first_car_win', firstCarWin.sessionId);
const firstIndyNxtRace = indyNxtConversionRows[0] ?? null;
if (firstIndyNxtRace) expectedMomentSessions.set('first_indy_nxt_race', firstIndyNxtRace.sessionId);
const bestIndyNxtFinish = indyNxtConversionRows
  .filter((row) => Number.isFinite(Number(row.finishPosition)))
  .slice()
  .sort(
    (left, right) =>
      Number(left.finishPosition) - Number(right.finishPosition) || compareCareerMomentChronology(left, right)
  )[0] ?? null;
if (bestIndyNxtFinish) expectedMomentSessions.set('best_indy_nxt_finish', bestIndyNxtFinish.sessionId);
const daytona24 = chronologicalConversionRows.find(
  (row) =>
    row.seriesId === 'series_imsa_weathertech' &&
    /daytona/i.test(`${row.eventName ?? ''} ${row.trackName ?? ''}`) &&
    /(?:rolex|24)/i.test(`${row.eventName ?? ''} ${row.raceLabel ?? ''}`)
) ?? null;
if (daytona24) expectedMomentSessions.set('daytona_24', daytona24.sessionId);
const wwtrMechanical = (dataPackage.screens.raceDebrief.seasonIndex ?? [])
  .filter(
    (row) =>
      Number(row.seasonYear) === 2026 &&
      String(row.eventStartDate ?? '').startsWith('2026-06') &&
      row.trackName === 'World Wide Technology Raceway' &&
      String(row.officialStatus ?? '').toLowerCase() === 'mechanical'
  )
  .slice()
  .sort(
    (left, right) =>
      compareCareerMomentChronology(left, right) ||
      (Number(left.roundIndex) || Number.MAX_SAFE_INTEGER) - (Number(right.roundIndex) || Number.MAX_SAFE_INTEGER)
  )[0] ?? null;
if (wwtrMechanical) expectedMomentSessions.set('wwtr_mechanical', wwtrMechanical.sessionId);

const careerMoments = dataPackage.screens.careerLab.moments ?? [];
if (!Array.isArray(careerMoments) || careerMoments.length > 6) {
  fail(`careerLab.moments must contain at most six rows (got ${careerMoments.length ?? 0}).`);
}
const momentKinds = new Set();
const momentSessionKinds = new Set();
for (const moment of careerMoments) {
  if (!moment.sessionId || !moment.shortLabel || !careerMomentKindOrder.includes(moment.kind)) {
    fail('Every careerLab.moments row must carry sessionId, shortLabel, and a supported kind.');
  }
  if (Array.from(moment.shortLabel).length > 22) {
    fail(`Career moment ${moment.kind} label exceeds 22 characters: ${moment.shortLabel}`);
  }
  if (!conversionBySession.has(moment.sessionId)) {
    fail(`Career moment ${moment.kind} references missing resultConversion session ${moment.sessionId}.`);
  }
  if (momentKinds.has(moment.kind)) {
    fail(`careerLab.moments leaks duplicate kind ${moment.kind}.`);
  }
  momentKinds.add(moment.kind);
  const sessionKind = `${moment.sessionId}\u0000${moment.kind}`;
  if (momentSessionKinds.has(sessionKind)) {
    fail(`careerLab.moments leaks duplicate session/kind ${moment.sessionId}/${moment.kind}.`);
  }
  momentSessionKinds.add(sessionKind);
}
for (const [kind, sessionId] of expectedMomentSessions) {
  const moment = careerMoments.find((candidate) => candidate.kind === kind);
  if (!moment || moment.sessionId !== sessionId) {
    fail(`careerLab.moments ${kind} must resolve to ${sessionId}.`);
  }
}
const expectedMomentOrder = careerMoments
  .slice()
  .sort(
    (left, right) =>
      compareCareerMomentChronology(conversionBySession.get(left.sessionId), conversionBySession.get(right.sessionId)) ||
      careerMomentKindOrder.indexOf(left.kind) - careerMomentKindOrder.indexOf(right.kind)
  )
  .map((moment) => `${moment.sessionId}/${moment.kind}`);
const actualMomentOrder = careerMoments.map((moment) => `${moment.sessionId}/${moment.kind}`);
if (JSON.stringify(actualMomentOrder) !== JSON.stringify(expectedMomentOrder)) {
  fail('careerLab.moments must use stable event-date, session-id, and kind ordering.');
}
const wwtrMoment = careerMoments.find((moment) => moment.kind === 'wwtr_mechanical');
if (wwtrMoment && wwtrMoment.shortLabel !== 'WWTR · mechanical') {
  fail('careerLab.moments WWTR label must be exactly "WWTR · mechanical".');
}

/* ---------- career weather joins (wet/dry splits) ---------- */

const allowedWetDry = new Set(['dry', 'wet', 'damp', 'drying', null]);
const badWetDryRows = conversionRows.filter((row) => !allowedWetDry.has(row.wetDry ?? null)).length;
if (badWetDryRows > 0) {
  fail(`careerLab.resultConversion carries ${badWetDryRows} rows with an unexpected wetDry value.`);
}
const wetJoinedRows = conversionRows.filter((row) => row.wetDry !== null && row.wetDry !== undefined);
if (wetJoinedRows.length === 0) {
  fail('careerLab.resultConversion must join at least one sourced weather condition (wetDry).');
}
if (wetJoinedRows.some((row) => !row.weatherConfidence)) {
  fail('Every weather-joined conversion row must carry weatherConfidence.');
}

/* ---------- career head-to-head ---------- */

const careerHeadToHead = dataPackage.screens.careerLab.headToHead ?? [];
if (!Array.isArray(careerHeadToHead) || careerHeadToHead.length < 40) {
  fail(`careerLab.headToHead must carry the full rival table (got ${careerHeadToHead.length ?? 0}).`);
}
for (const rival of careerHeadToHead) {
  const ahead = rival.bryceAhead ?? 0;
  const behind = rival.bryceBehind ?? 0;
  if (!rival.driverName || typeof rival.racesTogether !== 'number' || rival.racesTogether <= 0) {
    fail(`Head-to-head row ${rival.driverName ?? '(unnamed)'} needs driverName and racesTogether.`);
  }
  if (ahead + behind > rival.racesTogether) {
    fail(`Head-to-head row ${rival.driverName}: ahead ${ahead} + behind ${behind} exceeds racesTogether ${rival.racesTogether}.`);
  }
  if (!Array.isArray(rival.notableRaces)) {
    fail(`Head-to-head row ${rival.driverName} must carry a notableRaces array.`);
  }
}
const headToHeadSorted = careerHeadToHead.every(
  (rival, index) => index === 0 || (careerHeadToHead[index - 1].racesTogether ?? 0) >= (rival.racesTogether ?? 0)
);
if (!headToHeadSorted) {
  fail('careerLab.headToHead must be sorted by racesTogether descending.');
}

/* ---------- lap position mix (where the laps lived) ---------- */

const lapPositionMix = dataPackage.screens.careerLab.lapPositionMix ?? [];
if (!Array.isArray(lapPositionMix) || lapPositionMix.length < 2) {
  fail(`careerLab.lapPositionMix must carry at least two INDY NXT seasons (got ${lapPositionMix.length ?? 0}).`);
}
for (const season of lapPositionMix) {
  const positionLaps = (season.positions ?? []).reduce((sum, entry) => sum + (entry.laps ?? 0), 0);
  if (typeof season.seasonYear !== 'number' || !(season.totalLaps > 0) || positionLaps !== season.totalLaps) {
    fail(`Lap position mix ${season.seasonYear}: position counts must sum to totalLaps.`);
  }
  for (const share of [season.top5LapShare, season.top10LapShare]) {
    if (typeof share !== 'number' || share < 0 || share > 1) {
      fail(`Lap position mix ${season.seasonYear}: lap shares must sit in [0, 1].`);
    }
  }
}

/* ---------- Career Lab life stats (The odometer) ---------- */

const lifeStats = dataPackage.screens.careerLab.lifeStats;
if (lifeStats?.schemaVersion !== 'brycecast.careerLifeStats.v2') {
  fail('careerLab.lifeStats must carry the validated career-life-stats schema.');
}
for (const [key, expectedPath] of Object.entries({
  careerLifeStatsSummary: 'analysis/career-life-stats/output/summary.json',
  careerLifeStatsResearch: 'analysis/career-life-stats/RESEARCH.md',
  careerLifeStatsVenueFacts: 'analysis/career-life-stats/data/venue_facts.csv',
  careerLifeStatsResourceAssumptions: 'analysis/career-life-stats/data/resource_model_assumptions.csv',
  careerLifeStatsMilesRaced: 'analysis/career-life-stats/output/tables/miles_raced.csv',
  careerLifeStatsSessionLedger: 'analysis/career-life-stats/output/tables/session_mileage_ledger.csv',
  careerLifeStatsMileageBreakdowns: 'analysis/career-life-stats/output/tables/mileage_breakdowns.csv',
  careerLifeStatsTravelLegs: 'analysis/career-life-stats/output/tables/travel_legs.csv',
  careerLifeStatsTravelModeBreakdown: 'analysis/career-life-stats/output/tables/travel_mode_breakdown.csv',
  careerLifeStatsFuelEstimate: 'analysis/career-life-stats/output/tables/estimated_fuel_burned.csv',
  careerLifeStatsTireEstimate: 'analysis/career-life-stats/output/tables/estimated_unique_tires.csv'
})) {
  if (sourceInventory[key]?.path !== expectedPath) {
    fail(`sourceInventory.${key} must point to ${expectedPath}.`);
  }
}
const lifeStatsSummary = JSON.parse(fs.readFileSync(path.join(repoRoot, sourceInventory.careerLifeStatsSummary.path), 'utf8'));
for (const field of [
  'personalRaceMileage',
  'physicalSessionMileage',
  'travel',
  'countries',
  'venues',
  'longestLeg',
  'farthestVenuePair',
  'coverageGaps',
  'resourceModels'
]) {
  if (JSON.stringify(lifeStats[field]) !== JSON.stringify(lifeStatsSummary[field])) {
    fail(`careerLab.lifeStats.${field} must mirror the validated summary.`);
  }
}
if (lifeStats.personalRaceMileage.raceRows !== 145 || lifeStats.personalRaceMileage.coveredRaceRows !== 145) {
  fail('careerLab.lifeStats must cover all 145 canonical Bryce race results.');
}
if (lifeStats.personalRaceMileage.laps !== 3019 || lifeStats.personalRaceMileage.miles !== 6924.4) {
  fail('careerLab.lifeStats must carry personally attributable race laps and mileage.');
}
if (
  lifeStats.physicalSessionMileage.floor.confidenceClass !== 'observed_lower_bound' ||
  lifeStats.physicalSessionMileage.exact.confidenceClass !== 'observed_exact' ||
  lifeStats.physicalSessionMileage.unknown.confidenceClass !== 'unknown'
) {
  fail('careerLab.lifeStats physical-session aggregates must preserve confidence classes.');
}
if (
  lifeStats.travel.greatCircleMinimum.miles !== 54649.3 ||
  lifeStats.travel.routeAdjustedMinimum.confidenceClass !== 'modeled_range' ||
  lifeStats.travel.actualTravel.confidenceClass !== 'unknown'
) {
  fail('careerLab.lifeStats travel outputs must distinguish minimum, modeled route proxy, and unknown actual travel.');
}
const lifeStatsBreakdownDimensions = new Set((lifeStats.mileageBreakdowns ?? []).map((row) => row.dimensionType));
for (const dimension of ['season', 'series', 'session_type', 'venue', 'country', 'confidence_class']) {
  if (!lifeStatsBreakdownDimensions.has(dimension)) {
    fail(`careerLab.lifeStats mileageBreakdowns is missing ${dimension}.`);
  }
}
if (!(lifeStats.travelModeBreakdown ?? []).every((row) => row.travelModeProxy && row.legCount >= 0)) {
  fail('careerLab.lifeStats travelModeBreakdown must be visualization-ready.');
}
for (const [name, rows, low, base, high] of [
  ['fuelEstimateRanges', lifeStats.fuelEstimateRanges, 'estimatedFuelLowLiters', 'estimatedFuelBaseLiters', 'estimatedFuelHighLiters'],
  ['tireEstimateRanges', lifeStats.tireEstimateRanges, 'estimatedUniqueTiresLow', 'estimatedUniqueTiresBase', 'estimatedUniqueTiresHigh']
]) {
  if (!Array.isArray(rows) || rows.length !== 10) fail(`careerLab.lifeStats.${name} must carry ten series/year rows.`);
  for (const row of rows) {
    if (row.confidenceClass !== 'modeled_range' || !(row[low] <= row[base] && row[base] <= row[high]) || !row.sourceUrl?.startsWith('https://')) {
      fail(`careerLab.lifeStats.${name} contains an invalid modeled range.`);
    }
  }
}
if (!Array.isArray(lifeStats.venueSources) || lifeStats.venueSources.length !== lifeStats.venues) {
  fail('careerLab.lifeStats venueSources must list every physical venue.');
}
for (const venue of lifeStats.venueSources) {
  if (
    !venue.trackName ||
    !Array.isArray(venue.trackIds) ||
    venue.trackIds.length === 0 ||
    !(venue.lengthSources ?? []).every((source) => source.includes(' | https://')) ||
    !(venue.coordsSources ?? []).every((source) => source.includes(' | https://'))
  ) {
    fail(`careerLab.lifeStats venue source is incomplete for ${venue.trackName ?? '(unnamed)'}.`);
  }
}
const lifeStatSourcePaths = new Set((lifeStats.sourceRefs ?? []).map((ref) => ref.path));
for (const key of [
  'careerLifeStatsSummary',
  'careerLifeStatsResearch',
  'careerLifeStatsVenueFacts',
  'careerLifeStatsResourceAssumptions',
  'careerLifeStatsMilesRaced',
  'careerLifeStatsSessionLedger',
  'careerLifeStatsMileageBreakdowns',
  'careerLifeStatsTravelLegs',
  'careerLifeStatsTravelModeBreakdown',
  'careerLifeStatsFuelEstimate',
  'careerLifeStatsTireEstimate'
]) {
  if (!lifeStatSourcePaths.has(sourceInventory[key].path)) {
    fail(`careerLab.lifeStats sourceRefs must include ${sourceInventory[key].path}.`);
  }
}
if (
  !(lifeStats.caveats ?? []).some((caveat) => /142 Al Kamel-derived driver-stint laps/.test(caveat)) ||
  !(lifeStats.caveats ?? []).some((caveat) => /exact observations and F1600 lower bounds stay separate/.test(caveat)) ||
  !(lifeStats.caveats ?? []).some((caveat) => /actual travel is blocked/.test(caveat))
) {
  fail('careerLab.lifeStats must preserve attribution, confidence, and actual-travel caveats.');
}
if (JSON.stringify(lifeStats).includes('9137.7') || JSON.stringify(lifeStats).includes('9,137.7')) {
  fail('careerLab.lifeStats must never expose the shared-car odometer value.');
}

/* ---------- Career Lab atlas (deterministic land + 145-race venue contract) ---------- */

const atlas = dataPackage.screens.careerLab.atlas;
if (atlas?.schemaVersion !== 'brycecast.careerAtlas.v3') {
  fail('careerLab.atlas must carry the validated career-atlas schema.');
}
for (const [key, expectedPath] of Object.entries({
  careerAtlasOutput: 'analysis/career-atlas/output/atlas.json',
  careerAtlasGlobeTexture: 'analysis/career-atlas/output/world_land_texture.png',
  careerAtlasNaturalEarth: 'analysis/career-atlas/data/ne_110m_land.geojson',
  careerAtlasNaturalEarthSource: 'analysis/career-atlas/data/SOURCE.md',
  careerAtlasRequirements: 'analysis/career-atlas/requirements.txt',
  careerAtlasBuilderScript: 'analysis/career-atlas/scripts/build_career_atlas.py',
  careerAtlasValidatorScript: 'analysis/career-atlas/scripts/validate_career_atlas.py'
})) {
  if (sourceInventory[key]?.path !== expectedPath) {
    fail(`sourceInventory.${key} must point to ${expectedPath}.`);
  }
}
const atlasOutput = JSON.parse(fs.readFileSync(path.join(repoRoot, sourceInventory.careerAtlasOutput.path), 'utf8'));
for (const field of ['schemaVersion', 'naturalEarth', 'geometry', 'globe', 'venues', 'venueCount', 'raceCount', 'confidenceClasses', 'caveats']) {
  if (JSON.stringify(atlas[field]) !== JSON.stringify(atlasOutput[field])) {
    fail(`careerLab.atlas.${field} must mirror the validated atlas artifact.`);
  }
}
if (atlas.venueCount !== 34 || atlas.venues.length !== 34 || atlas.raceCount !== 145) {
  fail('careerLab.atlas must carry all 34 physical venues and all 145 canonical race rows.');
}
if (atlas.venues.reduce((sum, venue) => sum + venue.raceCount, 0) !== 145) {
  fail('careerLab.atlas venue race counts must reconcile to 145.');
}
if (atlas.naturalEarth.license !== 'public_domain' || atlas.naturalEarth.sourceSha256 !== sourceInventory.careerAtlasNaturalEarth.sha256) {
  fail('careerLab.atlas must preserve pinned Natural Earth public-domain provenance.');
}
if (
  atlas.globe?.projection !== 'orthographic' ||
  atlas.globe?.texture?.path !== sourceInventory.careerAtlasGlobeTexture.path ||
  atlas.globe?.texture?.sha256 !== sourceInventory.careerAtlasGlobeTexture.sha256 ||
  atlas.globe?.texture?.width !== 1024 ||
  atlas.globe?.texture?.height !== 512 ||
  atlas.globe?.texture?.sourceFeatureCount !== 127 ||
  atlas.globe?.zoom?.min !== 1 ||
  atlas.globe?.zoom?.max !== 32
) {
  fail('careerLab.atlas full-world orthographic globe contract is invalid.');
}
if (
  atlas.geometry.projection !== 'equirectangular_wrapped' ||
  atlas.geometry.fillRule !== 'evenodd' ||
  !atlas.geometry.landPath?.startsWith('M') ||
  atlas.geometry.landPathSha256 !== createHash('sha256').update(atlas.geometry.landPath).digest('hex')
) {
  fail('careerLab.atlas geometry path or projection contract is invalid.');
}
if (new Set(atlas.venues.map((venue) => venue.venueId)).size !== atlas.venueCount) {
  fail('careerLab.atlas venue identifiers must be unique.');
}
if (JSON.stringify([...new Set(atlas.venues.map((venue) => venue.region))].sort()) !== JSON.stringify(['Europe', 'North America', 'Oceania'])) {
  fail('careerLab.atlas must carry the three deterministic career regions used by the UI filter.');
}
for (const venue of atlas.venues) {
  if (
    !venue.trackName ||
    !venue.country ||
    !venue.region ||
    !(venue.raceCount > 0) ||
    !Array.isArray(venue.seriesSpans) ||
    venue.seriesSpans.length === 0 ||
    venue.seriesSpans.reduce((sum, span) => sum + span.raceCount, 0) !== venue.raceCount ||
    venue.confidence?.coordinates !== 'observed_exact' ||
    venue.confidence?.raceCount !== 'observed_exact' ||
    !/^\/(races|career\/race)\//.test(venue.latestRace?.raceHref ?? '') ||
    !(venue.coordinateSources ?? []).every((source) => source.includes(' | https://')) ||
    venue.projected?.x < 0 ||
    venue.projected?.x > atlas.geometry.canvas.width ||
    venue.projected?.y < 0 ||
    venue.projected?.y > atlas.geometry.canvas.height
  ) {
    fail(`careerLab.atlas venue contract is incomplete for ${venue.trackName ?? '(unnamed)'}.`);
  }
  for (const span of venue.seriesSpans ?? []) {
    if (
      !(span.raceCount > 0) ||
      !span.seriesId ||
      !span.seriesShort ||
      !span.latestRace?.sessionId ||
      !/^\/(races|career\/race)\//.test(span.latestRace?.raceHref ?? '')
    ) {
      fail(`careerLab.atlas series-filter contract is incomplete for ${venue.trackName ?? '(unnamed)'}.`);
    }
  }
}
const atlasSourcePaths = new Set((atlas.sourceRefs ?? []).map((ref) => ref.path));
for (const key of [
  'careerAtlasOutput',
  'careerAtlasGlobeTexture',
  'careerAtlasNaturalEarth',
  'careerAtlasNaturalEarthSource',
  'careerAtlasRequirements',
  'careerLifeStatsVenueFacts',
  'careerLifeStatsMilesRaced',
  'careerLifeStatsResearch',
  'canonicalDataset',
  'careerResultConversion',
  'careerAtlasBuilderScript',
  'careerAtlasValidatorScript'
]) {
  if (!atlasSourcePaths.has(sourceInventory[key].path)) {
    fail(`careerLab.atlas sourceRefs must include ${sourceInventory[key].path}.`);
  }
}
if (JSON.stringify(atlas).includes('54649.3') || JSON.stringify(atlas).includes('travelMiles')) {
  fail('careerLab.atlas must remain venue-only; travel displacement and mileage layers are parked.');
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
