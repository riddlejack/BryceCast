import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRaceSnapshotFromResults, compactTimingRowForReadiness } from './api-server.mjs';
import { createReplayOverlay, runnerReportsLiveSession } from './lib/replay-overlay.mjs';
import { raceSnapshotEndpoints } from './live-source-endpoints.mjs';

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'brycecast-replay-'));
const sqlitePath = join(temp, 'replay.sqlite');
const runnerStatusPath = join(temp, 'live-runner-status.json');
const port = 8891 + (process.pid % 50);
const baseUrl = `http://127.0.0.1:${port}`;

const heartbeat = {
  eventName: 'INDY NXT at Road America',
  EventID: '5537',
  EventSessionID: '6754',
  SessionName: 'Race 2',
  SessionType: 'R',
  SessionStatus: 'GREEN',
  Series: 'L',
  currentFlag: 'GREEN',
  lapNumber: '12',
  totalLaps: '18',
  trackName: 'Road America',
  trackType: 'RC'
};

const timingRows = [
  {
    no: '14', DriverID: '3000', firstName: 'Alessandro', lastName: 'de Tullio', team: 'AJ Foyt Racing', rank: '1', liveRank: '1',
    startPosition: '2', status: 'Active', gap: '0', liveGap: '0', laps: '12', runningDriverPoints: '302', totalDriverPoints: '0', totalEntrantPoints: '302'
  },
  {
    no: '9', DriverID: '2143', firstName: 'Bryce', lastName: 'Aron', team: 'Chip Ganassi Racing', rank: '6', liveRank: '6',
    startPosition: '15', status: 'Active', gap: '8.1', liveGap: '8.1', laps: '12', bestLapTime: '1:58.100', lastLapTime: '1:59.000',
    runningDriverPoints: '159', totalDriverPoints: '0', totalEntrantPoints: '159', liveDiffAhead: '800000', liveDiffBehind: '900000'
  }
];

const raw = {
  timing: { timing_results: { heartbeat, Item: timingRows } },
  drivers_nxt: { drivers: { driver: [{ driverid: '2143', firstname: 'Bryce', lastname: 'Aron', radiofrequency: '452.7000' }] } },
  config: { track_map_url: '' },
  schedule_nxt: {},
  trackactivity_nxt: {}
};

const db = new DatabaseSync(sqlitePath);
db.exec(`
  CREATE TABLE race_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL, session_key TEXT NOT NULL,
    event_id TEXT, event_session_id TEXT, event_name TEXT, session_name TEXT, flag TEXT, lap TEXT,
    total_laps TEXT, source_state TEXT NOT NULL, bryce_rank INTEGER, bryce_status TEXT, bryce_laps TEXT,
    bryce_gap TEXT, bryce_best_lap_time TEXT, payload_json TEXT NOT NULL
  );
  CREATE TABLE bryce_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, checked_at TEXT NOT NULL, session_key TEXT NOT NULL,
    rank INTEGER, live_rank INTEGER, start_position INTEGER, laps TEXT, status TEXT, comment TEXT, gap TEXT, live_gap TEXT,
    diff TEXT, best_lap_time TEXT, last_lap_time TEXT, best_speed TEXT, last_speed TEXT, passes INTEGER, passed INTEGER,
    pit_stops INTEGER, best_lap TEXT, average_speed TEXT, last_pit_lap INTEGER, since_pit_lap INTEGER, tire TEXT,
    overtake_remain INTEGER, overtake_active TEXT, lap_distance REAL, live_diff_ahead TEXT, live_diff_behind TEXT,
    total_driver_points INTEGER, total_entrant_points INTEGER, running_driver_points INTEGER, radiofrequency TEXT
  );
`);

const insertSnapshot = db.prepare(`
  INSERT INTO race_snapshots
    (checked_at, session_key, event_id, event_session_id, event_name, session_name, flag, lap, total_laps, source_state,
     bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json)
  VALUES (?, '5537-6754', '5537', '6754', 'INDY NXT at Road America', 'Race 2', 'GREEN', '12', '18', 'live', 6, 'Active', '12', '8.1', '1:58.100', ?)
`);
for (const checkedAt of ['2026-06-21T16:08:20.000Z', '2026-06-21T16:08:21.000Z']) {
  const result = insertSnapshot.run(checkedAt, JSON.stringify({ summary: { checkedAt, trackName: 'Road America' }, raw }));
  db.prepare(`
    INSERT INTO bryce_samples
      (snapshot_id, checked_at, session_key, rank, live_rank, start_position, laps, status, gap, live_gap,
       live_diff_ahead, live_diff_behind, total_driver_points, total_entrant_points, running_driver_points)
    VALUES (?, ?, '5537-6754', 6, 6, 15, '12', 'Active', '8.1', '8.1', '800000', '900000', 0, 159, 159)
  `).run(Number(result.lastInsertRowid), checkedAt);
}
db.close();

await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));

let nowMs = Date.parse('2026-07-12T18:00:00.000Z');
const overlay = createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath, now: () => nowMs });
const started = overlay.start({ session: '5537-6754', t0: '2026-06-21T16:08:20.000Z', speed: 2 });
assert.equal(started.active, true);
assert.equal(started.speed, 2);
assert.equal(overlay.currentRecord().archiveCheckedAt, '2026-06-21T16:08:20.000Z');
nowMs += 500;
assert.equal(overlay.currentRecord().archiveCheckedAt, '2026-06-21T16:08:21.000Z', '2x replay clock should advance one archive second in 500ms');
assert.equal(runnerReportsLiveSession({ phase: 'LIVE' }), true);
assert.equal(runnerReportsLiveSession({ phase: 'IDLE', latestBryce: { sourceState: 'cold', flag: 'COLD' } }), false);

await writeFile(runnerStatusPath, JSON.stringify({ phase: 'LIVE' }));
assert.throws(
  () => createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath }).start({ session: '5537-6754', speed: 1 }),
  /real live runner reports an active session/
);
await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE' }));

const sourceResult = (endpoint, payload, checkedAt = '2026-07-12T18:00:00.000Z') => ({
  ...endpoint,
  ok: payload !== undefined,
  status: payload !== undefined ? 200 : 0,
  contentType: 'application/json',
  fetchedAt: checkedAt,
  lastModified: null,
  etag: null,
  bytes: payload === undefined ? 0 : Buffer.byteLength(JSON.stringify(payload)),
  payload,
  error: payload === undefined ? 'fixture missing' : null
});
const expectedSnapshot = buildRaceSnapshotFromResults(raceSnapshotEndpoints.map((endpoint) => sourceResult(endpoint, raw[endpoint.id])));
const expectedTiming = {
  checkedAt: expectedSnapshot.updatedAt,
  sourceState: expectedSnapshot.sourceState,
  rowCount: expectedSnapshot.timingRows.length,
  bryceNo: expectedSnapshot.bryce.no,
  heartbeat: {
    eventName: heartbeat.eventName, eventId: heartbeat.EventID, eventSessionId: heartbeat.EventSessionID,
    sessionName: heartbeat.SessionName, sessionType: heartbeat.SessionType, sessionStatus: heartbeat.SessionStatus,
    series: heartbeat.Series, flag: heartbeat.currentFlag, lap: 12, totalLaps: 18, trackName: heartbeat.trackName, trackType: heartbeat.trackType
  },
  rows: expectedSnapshot.timingRows.map((row) => compactTimingRowForReadiness(row, heartbeat))
};

const shapeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return { array: value.length ? shapeOf(value[0]) : 'empty' };
  if (typeof value !== 'object') return typeof value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shapeOf(value[key])]));
};

const child = spawn(process.execPath, ['scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    BRYCECAST_REPLAY: '1',
    BRYCECAST_SQLITE_PATH: sqlitePath,
    BRYCECAST_RUNNER_STATUS_PATH: runnerStatusPath
  }
});
let stderr = '';
child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

const fetchJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return JSON.parse(text);
};

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetchJson('/api/health')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await fetchJson('/api/replay/control?session=5537-6754&t0=2026-06-21T16%3A08%3A20.000Z&speed=1');
  const replayTiming = await fetchJson('/api/timing');
  assert.deepEqual(shapeOf(replayTiming), shapeOf(expectedTiming), 'replay /api/timing must preserve the live payload shape');
  assert.deepEqual(replayTiming.rows, expectedTiming.rows, 'replay timing values must be the archived Race Control values, normalized by the live adapter');
  const readiness = await fetchJson('/api/readiness');
  assert.equal(readiness.schemaVersion, 'live-readiness.v1');
  assert.equal(readiness.liveTiming.rows.find((row) => row.bryce)?.runningDriverPoints, 159);
  assert.equal(readiness.bryce.identityGuard.matchedBy, 'driver_id');
  assert.equal((await fetchJson('/api/replay/control')).active, true);
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}

assert.equal(stderr, '', stderr);
console.log(JSON.stringify({ ok: true, assertions: 13, payloadShape: 'live-compatible' }, null, 2));

