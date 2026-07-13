import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRaceSnapshotFromResults, compactTimingRowForReadiness } from './api-server.mjs';
import { raceSnapshotEndpoints } from './live-source-endpoints.mjs';
import {
  cameraDomainFor,
  cameraFrameForSample,
  cameraPointSegments,
  detectBryceCrossings,
  fullFieldCameraSeries,
  rollingMedian
} from '../src/data/liveCameraModel.ts';
import { livePosition, stableDriverId } from '../src/data/liveMotionModel.ts';

const arg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const sqlitePath = resolve(arg('sqlite', process.env.BRYCECAST_SQLITE_PATH ?? 'data/live/brycecast.sqlite'));
const outputPath = resolve(arg('out', 'analysis/live-f5-audit/automated-camera-proof.json'));
const requestedSessions = String(arg('sessions', '5544-6761,5543-6760')).split(',').map((value) => value.trim()).filter(Boolean);
const targetBefore = '2026-07-04T17:22:04.423Z';
const targetAfter = '2026-07-04T17:22:05.680Z';

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

const histories = new Map(requestedSessions.map((sessionKey) => [sessionKey, {
  sessionKey,
  samples: [],
  selectedDrivers: [],
  stats: { arrivals: 0, valueChanges: 0, unchangedValues: 0, duplicateTimestamps: 0, outOfOrderArrivals: 0 }
}]));
const violations = [];
const fail = (sample, rule, detail) => {
  if (violations.length < 100) violations.push({ sessionKey: sample.sessionKey, checkedAt: sample.checkedAt, rule, detail });
};

const db = new DatabaseSync(sqlitePath, { readOnly: true });
try {
  const placeholders = requestedSessions.map(() => '?').join(',');
  const statement = db.prepare(`SELECT checked_at, session_key, payload_json FROM race_snapshots WHERE session_key IN (${placeholders}) ORDER BY session_key, checked_at`);
  for (const row of statement.iterate(...requestedSessions)) {
    let archived;
    try { archived = JSON.parse(row.payload_json); } catch (error) { violations.push({ sessionKey: row.session_key, checkedAt: row.checked_at, rule: 'payload_parse', detail: String(error) }); continue; }
    const raw = archived.raw ?? {};
    let snapshot;
    try {
      snapshot = buildRaceSnapshotFromResults(raceSnapshotEndpoints.map((endpoint) => sourceResult(endpoint, raw[endpoint.id], row.checked_at)));
    } catch (error) {
      violations.push({ sessionKey: row.session_key, checkedAt: row.checked_at, rule: 'adapter', detail: String(error) });
      continue;
    }
    const rows = snapshot.timingRows.map((timingRow) => compactTimingRowForReadiness(timingRow, snapshot.heartbeat))
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

let samplesChecked = 0;
let coordinateChecks = 0;
let unchangedArrivals = 0;
let sourcedChanges = 0;
let leaderChanges = 0;
const sessionReports = [];
const targetEvidence = [];
const allCrossings = [];

for (const history of histories.values()) {
  let previousSignature = null;
  let previousLeader = null;
  for (const sample of history.samples) {
    samplesChecked += 1;
    const frame = cameraFrameForSample(sample);
    const ids = frame.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) fail(sample, 'stable_identity', 'duplicate DriverID in one frame');
    const leader = frame[0];
    if (leader?.value !== 0) fail(sample, 'absolute_leader_origin', `leader coordinate was ${leader?.value}`);
    const bryce = frame.find((entry) => entry.bryce);
    const bryceRow = sample.rows.find((entry) => stableDriverId(entry) === sample.bryceId);
    if (bryce?.rank !== livePosition(bryceRow)) fail(sample, 'bryce_rank_agreement', `${bryce?.rank} != ${livePosition(bryceRow)}`);
    frame.forEach((entry, index) => {
      if (entry.value === null) return;
      coordinateChecks += 1;
      if (index > 0 && frame[index - 1].value !== null && entry.value < frame[index - 1].value) fail(sample, 'monotonic_absolute_coordinate', `${entry.id} ${entry.value} < upstream ${frame[index - 1].value}`);
    });
    const signature = JSON.stringify(frame.map((entry) => [entry.id, entry.rank, entry.value, entry.status]));
    if (previousSignature !== null) {
      if (signature === previousSignature) unchangedArrivals += 1;
      else sourcedChanges += 1;
    }
    previousSignature = signature;
    const leaderId = leader?.id ?? null;
    if (previousLeader && leaderId && previousLeader !== leaderId) leaderChanges += 1;
    previousLeader = leaderId;
    if ([targetBefore, targetAfter].includes(sample.checkedAt)) {
      const around = frame.filter((entry) => entry.rank !== null && bryce?.rank !== null && Math.abs(entry.rank - bryce.rank) <= 2);
      targetEvidence.push({ checkedAt: sample.checkedAt, sessionKey: sample.sessionKey, lap: sample.lap, flag: sample.flag, leaderId, bryce, around });
    }
  }
  const series = fullFieldCameraSeries(history);
  const bryceSeries = series.find((entry) => entry.bryce);
  const breakCount = bryceSeries?.points.filter((point) => point.breakBefore).length ?? 0;
  if (breakCount !== history.samples.reduce((count, sample, index) => index > 0 && stableDriverId(sample.rows[0]) !== stableDriverId(history.samples[index - 1].rows[0]) ? count + 1 : count, 0)) {
    violations.push({ sessionKey: history.sessionKey, checkedAt: null, rule: 'leader_change_break', detail: `${breakCount} modeled breaks did not match source leader changes` });
  }
  cameraPointSegments(bryceSeries?.points ?? []).forEach((segment) => {
    for (let index = 1; index < segment.length; index += 1) {
      if (segment[index].leaderId !== segment[index - 1].leaderId) violations.push({ sessionKey: history.sessionKey, checkedAt: segment[index].checkedAt, rule: 'continuity_offset_forbidden', detail: 'one rendered segment crossed leader identity' });
    }
  });
  const crossings = detectBryceCrossings(history);
  allCrossings.push(...crossings.map((crossing) => ({ sessionKey: history.sessionKey, ...crossing })));
  const latest = history.samples.at(-1);
  const lastBryce = bryceSeries?.points.filter((point) => point.value !== null).at(-1);
  const median = latest && bryceSeries ? rollingMedian(bryceSeries.points, latest.checkedAtMs) : null;
  const domain = median !== null && lastBryce?.value !== null && lastBryce?.value !== undefined ? cameraDomainFor(median, lastBryce.value) : null;
  sessionReports.push({ sessionKey: history.sessionKey, samples: history.samples.length, drivers: series.length, leaderChangeBreaks: breakCount, bryceCrossings: crossings.length, finalCameraDomain: domain });
}

const targetCrossing = allCrossings.find((crossing) => crossing.checkedAt === targetAfter && crossing.rivalId === '2147');
if (!targetCrossing) violations.push({ sessionKey: '5544-6761', checkedAt: targetAfter, rule: 'required_visual_proof_target', detail: 'Bryce/Allaer crossing was not detected' });

const report = {
  schemaVersion: 'brycecast.liveF5CameraProof.v1',
  generatedAt: new Date().toISOString(),
  source: { sqlite: sqlitePath, readOnly: true, sessions: requestedSessions },
  semantics: {
    y: 'cumulative contiguous numeric liveGap seconds from current live-ranked leader; smaller is higher',
    x: 'trailing five minutes; step-after at source timestamps',
    camera: '12 seconds centered on trailing-60-second Bryce median, edge-clamped',
    leaderChange: 'absolute coordinate retained; line breaks; no continuity offset'
  },
  samplesChecked,
  coordinateChecks,
  arrivalCadence: { sourcedChanges, unchangedArrivals, conclusion: 'one-second arrival is not treated as one-second value motion' },
  leaderChanges,
  targetEvidence,
  targetCrossing,
  sessions: sessionReports,
  crossingCount: allCrossings.length,
  crossingExamples: allCrossings.slice(0, 12),
  violations,
  ok: violations.length === 0
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
