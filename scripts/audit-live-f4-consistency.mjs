import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRaceSnapshotFromResults, compactTimingRowForReadiness } from './api-server.mjs';
import { raceSnapshotEndpoints } from './live-source-endpoints.mjs';
import { buildCumulativeLiveBattleFrame, livePosition, positiveGapSeconds, sortRowsForLiveDisplay, stableDriverId } from '../src/data/liveMotionModel.ts';

const arg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const sqlitePath = resolve(arg('sqlite', process.env.BRYCECAST_SQLITE_PATH ?? 'data/live/brycecast.sqlite'));
const outputPath = arg('out') ? resolve(arg('out')) : null;
const requestedSessions = String(arg('sessions', '5544-6761,5543-6760')).split(',').map((value) => value.trim()).filter(Boolean);

const sourceResult = (endpoint, payload, checkedAt) => ({
  ...endpoint,
  ok: payload !== undefined && payload !== null,
  status: payload !== undefined && payload !== null ? 200 : 0,
  contentType: payload !== undefined && payload !== null ? 'application/json' : null,
  fetchedAt: checkedAt,
  lastModified: null,
  etag: null,
  bytes: payload === undefined || payload === null ? 0 : Buffer.byteLength(JSON.stringify(payload)),
  payload: payload ?? null,
  error: payload === undefined || payload === null ? 'archived payload missing' : null
});

const violations = [];
const orderDifferenceExamples = [];
const sessionStats = new Map();
let samplesChecked = 0;
let driverRowsChecked = 0;
let battleCarsChecked = 0;
let leaderCoordinatesChecked = 0;
let displayOrderDiffSamples = 0;

const fail = (row, rule, detail) => {
  if (violations.length < 100) violations.push({ checkedAt: row.checked_at, sessionKey: row.session_key, rule, detail });
};

const db = new DatabaseSync(sqlitePath, { readOnly: true });
try {
  const placeholders = requestedSessions.map(() => '?').join(',');
  const statement = db.prepare(
    `SELECT checked_at, session_key, payload_json FROM race_snapshots WHERE session_key IN (${placeholders}) ORDER BY session_key, checked_at`
  );
  for (const row of statement.iterate(...requestedSessions)) {
    samplesChecked += 1;
    const stats = sessionStats.get(row.session_key) ?? { sessionKey: row.session_key, samples: 0, driverRows: 0, battleCars: 0, displayOrderDiffSamples: 0 };
    stats.samples += 1;
    sessionStats.set(row.session_key, stats);
    let archived;
    try {
      archived = JSON.parse(row.payload_json);
    } catch (error) {
      fail(row, 'payload_json_parse', error instanceof Error ? error.message : String(error));
      continue;
    }
    const raw = archived.raw ?? {};
    let snapshot;
    try {
      snapshot = buildRaceSnapshotFromResults(raceSnapshotEndpoints.map((endpoint) => sourceResult(endpoint, raw[endpoint.id], row.checked_at)));
    } catch (error) {
      fail(row, 'live_adapter_normalization', error instanceof Error ? error.message : String(error));
      continue;
    }
    const timingRows = snapshot.timingRows.map((timingRow) => compactTimingRowForReadiness(timingRow, snapshot.heartbeat));
    const fieldRows = sortRowsForLiveDisplay(timingRows);
    driverRowsChecked += fieldRows.length;
    stats.driverRows += fieldRows.length;
    const ids = fieldRows.map(stableDriverId);
    if (ids.some((id) => !id)) fail(row, 'stable_driver_identity', 'one or more display rows lack DriverID/car fallback');
    if (new Set(ids).size !== ids.length) fail(row, 'stable_driver_identity', 'duplicate driver identity in one payload');
    for (let index = 1; index < fieldRows.length; index += 1) {
      if (livePosition(fieldRows[index - 1]) > livePosition(fieldRows[index])) fail(row, 'field_live_order', `row ${index - 1} follows row ${index}`);
    }

    const publishedRankIds = timingRows
      .filter((timingRow) => Number.isFinite(Number(timingRow.rank)))
      .slice()
      .sort((left, right) => Number(left.rank) - Number(right.rank) || stableDriverId(left).localeCompare(stableDriverId(right)))
      .map(stableDriverId);
    if (ids.join('|') !== publishedRankIds.join('|')) {
      displayOrderDiffSamples += 1;
      stats.displayOrderDiffSamples += 1;
      if (orderDifferenceExamples.length < 3) {
        orderDifferenceExamples.push({
          checkedAt: row.checked_at,
          sessionKey: row.session_key,
          liveOrder: fieldRows.slice(0, 8).map((timingRow) => ({ id: stableDriverId(timingRow), liveRank: timingRow.liveRank, rank: timingRow.rank })),
          publishedRankOrder: timingRows
            .slice()
            .sort((left, right) => Number(left.rank) - Number(right.rank))
            .slice(0, 8)
            .map((timingRow) => ({ id: stableDriverId(timingRow), liveRank: timingRow.liveRank, rank: timingRow.rank }))
        });
      }
    }

    const bryce = fieldRows.find((timingRow) => timingRow.bryce === true) ?? null;
    if (!bryce || stableDriverId(bryce) !== '2143') {
      fail(row, 'bryce_identity', `guarded Bryce row was ${bryce ? stableDriverId(bryce) : 'missing'}`);
      continue;
    }
    const frame = buildCumulativeLiveBattleFrame(fieldRows, bryce);
    if (!frame) {
      fail(row, 'battle_frame', 'eligible payload did not produce a battle frame');
      continue;
    }
    const bryceIndex = fieldRows.findIndex((timingRow) => stableDriverId(timingRow) === '2143');
    const cumulativeFromLeader = new Map();
    let cumulativeSeconds = 0;
    let cumulativeAvailable = true;
    fieldRows.forEach((timingRow, index) => {
      if (index === 0) {
        cumulativeFromLeader.set(stableDriverId(timingRow), 0);
        leaderCoordinatesChecked += 1;
        return;
      }
      const interval = positiveGapSeconds(timingRow.liveGap);
      if (interval === null) cumulativeAvailable = false;
      if (cumulativeAvailable) cumulativeSeconds += interval;
      cumulativeFromLeader.set(stableDriverId(timingRow), cumulativeAvailable ? cumulativeSeconds : null);
      if (cumulativeAvailable) leaderCoordinatesChecked += 1;
    });
    const bryceLeaderCoordinate = cumulativeFromLeader.get('2143');
    const expectedAhead = bryceIndex > 0 && positiveGapSeconds(fieldRows[bryceIndex].liveGap) !== null ? stableDriverId(fieldRows[bryceIndex - 1]) : null;
    const expectedBehind = bryceIndex + 1 < fieldRows.length && positiveGapSeconds(fieldRows[bryceIndex + 1].liveGap) !== null ? stableDriverId(fieldRows[bryceIndex + 1]) : null;
    if ((frame.ahead?.id ?? null) !== expectedAhead) fail(row, 'adjacent_interval_identity', `ahead ${frame.ahead?.id ?? null} != ${expectedAhead}`);
    if ((frame.behind?.id ?? null) !== expectedBehind) fail(row, 'adjacent_interval_identity', `behind ${frame.behind?.id ?? null} != ${expectedBehind}`);

    for (const car of frame.cars) {
      battleCarsChecked += 1;
      stats.battleCars += 1;
      const fieldRow = fieldRows.find((timingRow) => stableDriverId(timingRow) === car.id);
      if (!fieldRow) {
        fail(row, 'battle_field_identity', `${car.id} missing from field`);
        continue;
      }
      if (livePosition(fieldRow) !== car.rank) fail(row, 'battle_field_live_rank', `${car.id} ${car.rank} != ${livePosition(fieldRow)}`);
      const carIndex = fieldRows.indexOf(fieldRow);
      let expectedOffset = 0;
      if (carIndex < bryceIndex) {
        for (let index = bryceIndex; index > carIndex; index -= 1) expectedOffset += positiveGapSeconds(fieldRows[index].liveGap) ?? Number.NaN;
      } else {
        for (let index = bryceIndex + 1; index <= carIndex; index += 1) expectedOffset -= positiveGapSeconds(fieldRows[index].liveGap) ?? Number.NaN;
      }
      if (!Number.isFinite(expectedOffset) || Math.abs(expectedOffset - car.offsetSeconds) > 1e-9) {
        fail(row, 'cumulative_adjacent_interval', `${car.id} ${car.offsetSeconds} != ${expectedOffset}`);
      }
      const carLeaderCoordinate = cumulativeFromLeader.get(car.id);
      if (
        Number.isFinite(bryceLeaderCoordinate) &&
        Number.isFinite(carLeaderCoordinate) &&
        Math.abs((bryceLeaderCoordinate - carLeaderCoordinate) - car.offsetSeconds) > 1e-9
      ) {
        fail(row, 'shared_leader_coordinate', `${car.id} ${carLeaderCoordinate} is inconsistent with Bryce ${bryceLeaderCoordinate} and corridor ${car.offsetSeconds}`);
      }
    }
  }
} finally {
  db.close();
}

const report = {
  schemaVersion: 'brycecast.liveF4ConsistencyProof.v1',
  generatedAt: new Date().toISOString(),
  sqlite: sqlitePath,
  readOnly: true,
  sessionsRequested: requestedSessions,
  samplesChecked,
  driverRowsChecked,
  battleCarsChecked,
  leaderCoordinatesChecked,
  invariants: {
    samePayload: true,
    sharedStableDriverIdentity: true,
    sharedLiveRankOrder: true,
    adjacentLiveGapSemantics: true,
    cumulativeBattleOffsets: true,
    cumulativeLeaderCoordinates: true
  },
  violations,
  ok: violations.length === 0,
  displayOrderAudit: {
    displayOrder: 'liveRank with rank fallback',
    publishedComparison: 'rank',
    differingSamples: displayOrderDiffSamples,
    explanation: 'A difference is legitimate when Race Control liveRank leads published rank during an asynchronous update; battle and field both retain the same liveRank order from the same payload.',
    examples: orderDifferenceExamples
  },
  sessions: [...sessionStats.values()]
};

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
