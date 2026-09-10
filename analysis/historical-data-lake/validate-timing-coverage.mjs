#!/usr/bin/env node

import {access, readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const LEDGER_PATH = join(REPO_ROOT, 'data/historical-data-lake/catalog/timing-coverage-ledger.json');
const CAREER_PATH = join(REPO_ROOT, 'data/career/career.dataset.json');
const SOURCE_MAP_PATH = join(HERE, 'timing-coverage-sources.json');
const ledger = JSON.parse(await readFile(LEDGER_PATH, 'utf8'));
const career = JSON.parse(await readFile(CAREER_PATH, 'utf8'));
const sourceMap = JSON.parse(await readFile(SOURCE_MAP_PATH, 'utf8'));
const failures = [];
const fail = (message) => failures.push(message);
const exists = async (relativePath) => {
  try {
    await access(join(REPO_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
};

const races = ledger.sessions.filter((session) => session.sessionType === 'race');
const qualifying = ledger.sessions.filter((session) => session.sessionType === 'qualifying');
const eventsById = new Map(career.events.map((event) => [event.id, event]));
const completedBryceRaceSessionIds = new Set(
  career.results
    .filter((result) => result.driverId === 'driver_bryce_aron')
    .filter((result) => result.finishPosition != null || result.classifiedPosition != null || result.lapsCompleted != null)
    .map((result) => result.sessionId),
);
const expectedRaceIds = new Set(
  career.sessions
    .filter((session) => session.sessionType === 'race')
    .filter((session) => eventsById.get(session.eventId)?.seriesId === 'series_indy_nxt')
    .filter((session) => completedBryceRaceSessionIds.has(session.id))
    .map((session) => session.id),
);
const actualRaceIds = new Set(races.map((race) => race.canonicalSessionId));
for (const id of expectedRaceIds) if (!actualRaceIds.has(id)) fail(`${id}: canonical completed Bryce race missing from ledger`);
for (const id of actualRaceIds) if (!expectedRaceIds.has(id)) fail(`${id}: ledger race is not a canonical completed Bryce result`);
if (qualifying.length !== expectedRaceIds.size) fail(`expected ${expectedRaceIds.size} qualifying links, found ${qualifying.length}`);
for (const id of expectedRaceIds) {
  if (!qualifying.some((row) => row.qualifiesRaceSessionId === id)) fail(`${id}: qualifying coverage link missing`);
}

const knownIds = new Set(sourceMap.knownAsOfRegression?.raceSessionIds ?? []);
for (const id of knownIds) if (!expectedRaceIds.has(id)) fail(`${id}: known-as-of regression race disappeared from canonical`);
for (const [year, expected] of Object.entries(sourceMap.knownAsOfRegression?.raceCounts ?? {})) {
  const actual = races.filter((race) => race.year === Number(year)).length;
  if (actual < expected) fail(`${year}: known-as-of race floor ${expected}, found ${actual}`);
}

for (const race of races) {
  const isKnown = knownIds.has(race.canonicalSessionId);
  if (isKnown && race.status !== 'observed') fail(`${race.canonicalSessionId}: known-as-of race is ${race.status}`);
  if (!['observed', 'unavailable'].includes(race.status)) fail(`${race.canonicalSessionId}: invalid race status ${race.status}`);
  if (race.status === 'observed') {
    if (!race.primarySource || race.primarySource.observationCount < 1) fail(`${race.canonicalSessionId}: no observed primary source`);
    if (race.primarySource.observationAssertion !== 'observations_present_not_unbroken_1hz') {
      fail(`${race.canonicalSessionId}: observed status lacks non-completeness assertion`);
    }
    if (!race.primarySource?.observedArtifact || !(await exists(race.primarySource.observedArtifact))) {
      fail(`${race.canonicalSessionId}: observed artifact missing`);
    }
    if (!race.replayArtifact || !(await exists(race.replayArtifact))) fail(`${race.canonicalSessionId}: replay artifact missing`);
    if (race.noGps !== true || race.primarySource?.noGps !== true) fail(`${race.canonicalSessionId}: noGps contract missing`);
  } else {
    if (race.sources.length !== 0 || race.primarySource !== null) fail(`${race.canonicalSessionId}: unavailable row contains a joined source`);
    if (!race.caveats.some((note) => /No high-frequency source/i.test(note))) fail(`${race.canonicalSessionId}: unavailable source search reason missing`);
  }
}

const nashville2024 = qualifying.find((session) => session.canonicalOfficialSessionId === '6489');
if (nashville2024?.status !== 'partial') fail('Nashville 2024 qualifying must remain partial/interrupted');
const iowa2025 = qualifying.find((session) => session.canonicalOfficialSessionId === '6596');
if (iowa2025?.status !== 'unavailable') fail('Iowa 2025 qualifying must remain unavailable/no capture');
for (const id of ['6764', '6757', '6759', '6758']) {
  const race = races.find((session) => session.canonicalOfficialSessionId === id);
  if (race?.primarySource?.tier !== 'race_control_capture') fail(`${id}: late race should prefer direct Race Control capture`);
}
for (const id of ['6950', '6953']) {
  const session = qualifying.find((row) => row.canonicalOfficialSessionId === id);
  if (session?.primarySource?.tier !== 'race_control_capture') fail(`${id}: Monterey qualifying capture missing`);
}
for (const session of qualifying.filter((row) => ['observed', 'partial'].includes(row.status))) {
  if (!session.lapObservationCoverage?.hasObservedClock) fail(`${session.canonicalSessionId}: qualifying clock coverage missing`);
}
for (const id of ['6950', '6953']) {
  const session = qualifying.find((row) => row.canonicalOfficialSessionId === id);
  if (session?.lapObservationCoverage?.sampleCount !== 432 || session?.lapObservationCoverage?.maxLap !== 8) {
    fail(`${id}: Monterey qualifying should retain 432 clocked Bryce samples through lap 8`);
  }
}
const midOhio = races.find((session) => session.canonicalSessionId === 'session_indy_nxt_2025_6452');
const midOhioGap = midOhio?.primarySource?.gaps?.intervalsOver2Seconds?.find((gap) => gap.seconds === 436);
if (!midOhioGap) fail('Mid-Ohio 2025: 436s RaceTools source gap is not preserved');
const midOhioSupplement = midOhio?.sources?.find((source) => source.replayId === 'b8128c6f-dc53-492e-a7e5-1bef64c4c567');
if (!midOhioSupplement || midOhioSupplement.cadence?.maxSeconds > 4) fail('Mid-Ohio 2025: independent Timing71 supplemental coverage missing');
if ((midOhio?.replayInterpolationCoverage?.withheldSeconds ?? 0) < 400) fail('Mid-Ohio 2025: replay does not withhold the long source gap');
const fakeMilwaukee = '0895cf60-5926-438b-bf15-c73a99af4043';
if (ledger.sessions.some((session) => session.sources.some((source) => source.replayId === fakeMilwaukee))) {
  fail('false Milwaukee/Scott Dixon replay was promoted');
}
if (!ledger.rejectedSources?.[fakeMilwaukee]) fail('false Milwaukee replay rejection is not recorded');
if (ledger.sourceInventoryEvidence?.inventories?.racetools?.season2026DirectoryStatus !== 404) {
  fail('RaceTools 2026 inventory search evidence missing');
}

if (failures.length) {
  process.stderr.write(`timing coverage FAILED (${failures.length})\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ok: true, ...ledger.counts, gate: 'green'}, null, 2)}\n`);
