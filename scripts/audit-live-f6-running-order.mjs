import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRaceSnapshotFromResults, compactTimingRowForReadiness } from './api-server.mjs';
import { raceSnapshotEndpoints } from './live-source-endpoints.mjs';
import {
  detectBryceRunningOrderCrossings,
  fullFieldRunningOrderSeries,
  runningOrderFrameForSample,
  runningOrderGapThresholdMs,
  runningOrderPointSegments,
  runningOrderTimeDomain
} from '../src/data/liveRunningOrderModel.ts';
import { livePosition, stableDriverId } from '../src/data/liveMotionModel.ts';

const arg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const sqlitePath = resolve(arg('sqlite', process.env.BRYCECAST_SQLITE_PATH ?? 'data/live/brycecast.sqlite'));
const outputPath = resolve(arg('out', 'analysis/live-f6-audit/automated-running-order-proof.json'));
const requestedSessions = String(arg('sessions', '5544-6761,5543-6760')).split(',').map((value) => value.trim()).filter(Boolean);
const targetCrossingAt = '2026-07-04T17:22:05.680Z';

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

const emptyHistory = (sessionKey) => ({
  sessionKey,
  samples: [],
  selectedDrivers: [],
  stats: { arrivals: 0, valueChanges: 0, unchangedValues: 0, duplicateTimestamps: 0, outOfOrderArrivals: 0 }
});

const histories = new Map(requestedSessions.map((sessionKey) => [sessionKey, emptyHistory(sessionKey)]));
const violations = [];
const fail = (sessionKey, checkedAt, rule, detail) => {
  if (violations.length < 100) violations.push({ sessionKey, checkedAt, rule, detail });
};

const db = new DatabaseSync(sqlitePath, { readOnly: true });
try {
  const placeholders = requestedSessions.map(() => '?').join(',');
  const statement = db.prepare(`SELECT checked_at, session_key, payload_json FROM race_snapshots WHERE session_key IN (${placeholders}) ORDER BY session_key, checked_at`);
  for (const row of statement.iterate(...requestedSessions)) {
    let archived;
    try {
      archived = JSON.parse(row.payload_json);
    } catch (error) {
      fail(row.session_key, row.checked_at, 'payload_parse', String(error));
      continue;
    }
    const raw = archived.raw ?? {};
    let snapshot;
    try {
      snapshot = buildRaceSnapshotFromResults(raceSnapshotEndpoints.map((endpoint) => sourceResult(endpoint, raw[endpoint.id], row.checked_at)));
    } catch (error) {
      fail(row.session_key, row.checked_at, 'adapter', String(error));
      continue;
    }
    const rows = snapshot.timingRows
      .map((timingRow) => compactTimingRowForReadiness(timingRow, snapshot.heartbeat))
      .filter((timingRow) => livePosition(timingRow) !== null && stableDriverId(timingRow))
      .sort((left, right) => livePosition(left) - livePosition(right) || stableDriverId(left).localeCompare(stableDriverId(right)));
    const bryce = rows.find((timingRow) => timingRow.bryce === true);
    if (!bryce) continue;
    histories.get(row.session_key).samples.push({
      sessionKey: row.session_key,
      checkedAt: row.checked_at,
      checkedAtMs: Date.parse(row.checked_at),
      arrivalCheckedAt: row.checked_at,
      lap: Number.isFinite(Number(snapshot.heartbeat?.lapNumber)) ? Number(snapshot.heartbeat.lapNumber) : null,
      flag: String(snapshot.heartbeat?.currentFlag ?? ''),
      rows,
      bryceId: stableDriverId(bryce),
      signature: ''
    });
  }
} finally {
  db.close();
}

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const isLapped = (row, bryceRow) => {
  const rowLaps = numberOrNull(row.laps);
  const bryceLaps = numberOrNull(bryceRow?.laps);
  if (rowLaps !== null && bryceLaps !== null && rowLaps < bryceLaps) return true;
  return /(?:^|\s)\d+\s+laps?\b|lap\s+down|lapped/i.test([row.diff, row.gap, row.liveGap, row.status, row.comment].join(' '));
};

const proofAtElapsed = (history, elapsedMs) => {
  const first = history.samples[0];
  const target = first.checkedAtMs + elapsedMs;
  const index = history.samples.findIndex((sample) => sample.checkedAtMs >= target);
  if (index < 0) return null;
  const prefix = { ...history, samples: history.samples.slice(0, index + 1) };
  const latest = prefix.samples.at(-1);
  const domain = runningOrderTimeDomain(prefix, latest.checkedAt);
  const currentFrame = runningOrderFrameForSample(latest);
  const series = fullFieldRunningOrderSeries(prefix);
  const liveEndpoints = series
    .filter((entry) => currentFrame.some((current) => current.id === entry.id))
    .map((entry) => entry.points.at(-1)?.checkedAtMs ?? null);
  return {
    requestedElapsedMs: elapsedMs,
    observedElapsedMs: latest.checkedAtMs - first.checkedAtMs,
    firstCheckedAt: first.checkedAt,
    nowCheckedAt: latest.checkedAt,
    sampleCount: prefix.samples.length,
    domain,
    liveEndpointCount: liveEndpoints.length,
    assertions: {
      startsAtFirstSample: domain.startMs === first.checkedAtMs,
      endsAtRealNow: domain.endMs === latest.checkedAtMs,
      noReservedEmptyGulf: liveEndpoints.length > 0 && liveEndpoints.every((value) => value === domain.endMs),
      stillGrowing: domain.growing === true,
      withinOneSourceCadence: latest.checkedAtMs - target <= runningOrderGapThresholdMs(prefix)
    }
  };
};

let samplesChecked = 0;
let officialRankChecks = 0;
let lappedUpstreamSamples = 0;
const sessionReports = [];
const lappedEvidence = [];
const allCrossings = [];
const startupProof = [];

for (const history of histories.values()) {
  const series = fullFieldRunningOrderSeries(history);
  const seriesById = new Map(series.map((entry) => [entry.id, entry]));
  const activeLappedSpans = new Map();
  const completedLappedSpans = [];

  history.samples.forEach((sample, sampleIndex) => {
    samplesChecked += 1;
    const frame = runningOrderFrameForSample(sample);
    const frameById = new Map(frame.map((entry) => [entry.id, entry]));
    if (frame.length < 2 || !frameById.has(sample.bryceId)) fail(history.sessionKey, sample.checkedAt, 'ordering_available', 'official running order did not contain Bryce plus a rival');
    if (new Set(frame.map((entry) => entry.id)).size !== frame.length) fail(history.sessionKey, sample.checkedAt, 'stable_identity', 'duplicate stable driver identity in one running-order frame');

    sample.rows.forEach((row) => {
      const id = stableDriverId(row);
      const rank = livePosition(row);
      if (!id || rank === null) return;
      officialRankChecks += 1;
      if (frameById.get(id)?.rank !== rank) fail(history.sessionKey, sample.checkedAt, 'official_rank_agreement', `${id}: ${frameById.get(id)?.rank} != ${rank}`);
      if (seriesById.get(id)?.points[sampleIndex]?.rank !== rank) fail(history.sessionKey, sample.checkedAt, 'history_rank_agreement', `${id}: history erased or changed official P${rank}`);
    });

    const bryceRow = sample.rows.find((row) => stableDriverId(row) === sample.bryceId);
    const bryceRank = livePosition(bryceRow);
    const upstreamLapped = sample.rows.filter((row) => {
      const rank = livePosition(row);
      return rank !== null && bryceRank !== null && rank < bryceRank && isLapped(row, bryceRow);
    });
    if (upstreamLapped.length > 0) lappedUpstreamSamples += 1;
    const currentIds = new Set(upstreamLapped.map(stableDriverId));
    for (const row of upstreamLapped) {
      const id = stableDriverId(row);
      const existing = activeLappedSpans.get(id);
      if (existing && existing.lastIndex === sampleIndex - 1) {
        existing.lastIndex = sampleIndex;
        existing.endCheckedAt = sample.checkedAt;
        existing.samples += 1;
      } else {
        if (existing) completedLappedSpans.push(existing);
        activeLappedSpans.set(id, {
          sessionKey: history.sessionKey,
          driverId: id,
          driverName: frameById.get(id)?.name ?? id,
          rank: livePosition(row),
          bryceRank,
          startCheckedAt: sample.checkedAt,
          endCheckedAt: sample.checkedAt,
          firstIndex: sampleIndex,
          lastIndex: sampleIndex,
          samples: 1
        });
      }
      if (frameById.get(id)?.rank !== livePosition(row) || seriesById.get(id)?.points[sampleIndex]?.rank !== livePosition(row)) {
        fail(history.sessionKey, sample.checkedAt, 'lapped_upstream_rank_persistence', `${id} lost official P${livePosition(row)}`);
      }
    }
    for (const [id, span] of activeLappedSpans) {
      if (!currentIds.has(id)) {
        completedLappedSpans.push(span);
        activeLappedSpans.delete(id);
      }
    }
  });
  completedLappedSpans.push(...activeLappedSpans.values());
  lappedEvidence.push(...completedLappedSpans.filter((span) => span.samples >= 2).sort((left, right) => right.samples - left.samples).slice(0, 3));

  for (const entry of series) {
    if (entry.points.length !== history.samples.length) fail(history.sessionKey, null, 'append_parity', `${entry.id}: ${entry.points.length} history points for ${history.samples.length} source samples`);
    const segments = runningOrderPointSegments(entry.points);
    if (segments.some((segment) => segment.some((point, index) => index > 0 && point.breakBefore))) {
      fail(history.sessionKey, null, 'missing_order_bridge', `${entry.id}: a rendered segment crossed a source break`);
    }
  }

  const crossings = detectBryceRunningOrderCrossings(history);
  allCrossings.push(...crossings.map((crossing) => ({ sessionKey: history.sessionKey, ...crossing })));
  const activeStartIndex = history.samples.findIndex((sample) => /green|yellow|caution|fcy/i.test(sample.flag));
  const activeHistory = activeStartIndex >= 0 ? { ...history, samples: history.samples.slice(activeStartIndex) } : history;
  const t10 = proofAtElapsed(activeHistory, 10_000);
  const t60 = proofAtElapsed(activeHistory, 60_000);
  if (t10) startupProof.push({ sessionKey: history.sessionKey, state: 't+10s', ...t10 });
  if (t60) startupProof.push({ sessionKey: history.sessionKey, state: 't+60s', ...t60 });
  sessionReports.push({
    sessionKey: history.sessionKey,
    samples: history.samples.length,
    drivers: series.length,
    gapThresholdMs: runningOrderGapThresholdMs(history),
    lineBreaks: series.reduce((count, entry) => count + entry.points.filter((point) => point.breakBefore).length, 0),
    crossings: crossings.length,
    lappedUpstreamSpans: completedLappedSpans.filter((span) => span.samples >= 2).length
  });
}

const targetCrossing = allCrossings.find((crossing) => crossing.checkedAt === targetCrossingAt && crossing.rivalId === '2147' && crossing.direction === 'ahead_of' && crossing.lap === 10) ?? null;
if (!targetCrossing) fail('5544-6761', targetCrossingAt, 'required_crossing', 'Bryce ahead of Allaer on lap 10 was not detected from the rank swap');
if (lappedEvidence.length === 0) fail(null, null, 'required_lapped_upstream_append', 'no two-sample archived interval kept appending while a lapped car ranked upstream of Bryce');
if (startupProof.length < requestedSessions.length * 2) fail(null, null, 'required_startup_proof', 't+10s and t+60s could not be measured for every requested session');
for (const proof of startupProof) {
  for (const [assertion, passed] of Object.entries(proof.assertions)) {
    if (!passed) fail(proof.sessionKey, proof.nowCheckedAt, `startup_${assertion}`, `${proof.state} failed`);
  }
}

const report = {
  schemaVersion: 'brycecast.liveF6RunningOrderProof.v1',
  generatedAt: new Date().toISOString(),
  source: { sqlite: sqlitePath, readOnly: true, sessions: requestedSessions },
  semantics: {
    y: 'official integer livePosition rank; P1 at the top; lapped, pitted, or retired status does not erase a published rank',
    x: 'one source/replay checkedAt clock; grows from first sample to real now until five minutes, then trails five minutes',
    path: 'step-after at source timestamps; every line breaks together when ordering cadence is missing',
    focus: 'current Bryce rank plus three whole official lanes above and below',
    gaps: 'corridor-derived seconds ahead of or behind Bryce; unavailable intervals render as an em dash'
  },
  samplesChecked,
  officialRankChecks,
  lappedUpstreamSamples,
  lappedUpstreamAppendProof: lappedEvidence,
  startupNowEdgeProof: startupProof,
  targetCrossing,
  crossingCount: allCrossings.length,
  crossingExamples: allCrossings.slice(0, 20),
  sessions: sessionReports,
  violations,
  ok: violations.length === 0
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
