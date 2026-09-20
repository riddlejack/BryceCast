import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRaceSnapshotFromResults, compactTimingRowForReadiness } from './api-server.mjs';
import { createReplayOverlay, runnerReportsLiveSession } from './lib/replay-overlay.mjs';
import { createLakeReplayFeeds } from './lib/replay-lake-feeds.mjs';
import { createReplayRouter } from './lib/replay-router.mjs';
import { raceSnapshotEndpoints } from './live-source-endpoints.mjs';
import { appendLiveHistoryPayload, createLiveHistoryState, liveHistorySampleFromPayload, liveSessionKeyOf } from '../src/data/liveHistoryModel.ts';
import { buildCumulativeLiveBattleFrame } from '../src/data/liveMotionModel.ts';
import {
  OFFSEASON_DEMO_DECLINED_KEY,
  OFFSEASON_DEMO_JOIN_SECONDS,
  declineOffSeasonDemo,
  hasDeclinedOffSeasonDemo,
  offSeasonDemoStartAt,
  shouldAutoStartOffSeasonDemo
} from '../src/data/offSeasonDemo.ts';

// BryceCast per-client replay contract test.
//
// The design principle under test is ABSOLUTE: a request WITHOUT replay params
// must never enter replay code, so a plain client always sees the real feed
// while a concurrent replaying client sees archived rows — from the SAME
// stateless server, with no global replay state anywhere. The centerpiece is
// the isolation test; the rest guard the per-request live-guard, the watchable
// gating, and the Nashville battle/running-order regression via the exact
// per-request param path the Live page now uses.

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

// The distinguishable REAL feed a plain client must see: Bryce running P3 on lap
// 15, not the archived P6 on lap 12 a replay serves. Written last (highest id),
// with a fresh checked_at, so readFreshRunnerRawRecord serves it to plain clients.
const liveBryce = { ...timingRows[1], rank: '3', liveRank: '3', laps: '15', gap: '4.2', liveGap: '4.2', lastLapTime: '1:57.500' };
const liveRaw = { ...raw, timing: { timing_results: { heartbeat: { ...heartbeat, lapNumber: '15' }, Item: [timingRows[0], liveBryce] } } };

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
// Enough green snapshots to cross the "watchable" threshold.
const watchableBaseMs = Date.parse('2026-06-21T16:08:22.000Z');
for (let index = 0; index < 130; index += 1) {
  const checkedAt = new Date(watchableBaseMs + index * 1000).toISOString();
  insertSnapshot.run(checkedAt, JSON.stringify({ summary: { checkedAt, trackName: 'Road America' }, raw }));
}

// Gating fixtures: captures that must NEVER be replayable even via direct params.
const insertGatingSnapshot = db.prepare(`
  INSERT INTO race_snapshots
    (checked_at, session_key, event_id, event_session_id, event_name, session_name, flag, lap, total_laps,
     source_state, bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json)
  VALUES (?, ?, ?, ?, ?, ?, 'GREEN', '12', '18', 'live', ?, ?, ?, ?, ?, ?)
`);
const seedGatingSession = ({ sessionKey, eventId, eventSessionId, eventName, sessionName, bryceRank, baseIso }) => {
  const baseMs = Date.parse(baseIso);
  for (let index = 0; index < 130; index += 1) {
    const checkedAt = new Date(baseMs + index * 1000).toISOString();
    insertGatingSnapshot.run(
      checkedAt, sessionKey, eventId, eventSessionId, eventName, sessionName, bryceRank,
      bryceRank === null ? null : 'Active', bryceRank === null ? null : '12', bryceRank === null ? null : '8.1',
      bryceRank === null ? null : '1:58.100', JSON.stringify({ summary: { checkedAt }, raw: {} })
    );
  }
};
seedGatingSession({ sessionKey: '5537-6753', eventId: '5537', eventSessionId: '6753', eventName: 'INDY NXT at Road America', sessionName: 'Practice 1', bryceRank: 6, baseIso: '2026-06-20T14:00:00.000Z' });
seedGatingSession({ sessionKey: '9001-8801', eventId: '9001', eventSessionId: '8801', eventName: 'IndyCar Test Session', sessionName: 'Race', bryceRank: null, baseIso: '2026-06-20T18:00:00.000Z' });

// The plain client's REAL feed — written last so it is the latest archived record.
const liveCheckedAt = new Date().toISOString();
db.prepare(`
  INSERT INTO race_snapshots
    (checked_at, session_key, event_id, event_session_id, event_name, session_name, flag, lap, total_laps,
     source_state, bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json)
  VALUES (?, '5537-6754', '5537', '6754', 'INDY NXT at Road America', 'Race 2', 'GREEN', '15', '18', 'live', 3, 'Active', '15', '4.2', '1:58.100', ?)
`).run(liveCheckedAt, JSON.stringify({ summary: { checkedAt: liveCheckedAt, trackName: 'Road America' }, raw: liveRaw }));
db.close();

const REPLAY_EARLY_RT = '2026-06-21T16:08:20.000Z'; // resolves the P6/lap12 archived frame

// ---------------------------------------------------------------------------
// Unit: the stateless per-request record resolver owns no global state.
// ---------------------------------------------------------------------------
await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
{
  let nowMs = Date.parse('2026-07-12T18:00:00.000Z');
  const overlay = createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath, now: () => nowMs });
  // Two independent recordAt calls at different rt values must not interfere.
  const early = overlay.recordAt({ session: '5537-6754', rt: REPLAY_EARLY_RT, speed: 1 });
  const later = overlay.recordAt({ session: '5537-6754', rt: '2026-06-21T16:08:21.000Z', speed: 1 });
  assert.equal(early.record.archiveCheckedAt, '2026-06-21T16:08:20.000Z', 'recordAt resolves the row at or before rt');
  assert.equal(later.record.archiveCheckedAt, '2026-06-21T16:08:21.000Z', 'recordAt is stateless — a second call at a later rt is independent');
  assert.equal(early.record.archiveCheckedAt, '2026-06-21T16:08:20.000Z', 're-reading the first record shows no shared mutation');
  assert.equal(overlay.recordAt({ session: '5537-6754', rt: '2020-01-01T00:00:00.000Z', speed: 1 }).outOfRange, true, 'an rt before the span is out of range');
  assert.equal(runnerReportsLiveSession({ phase: 'LIVE' }), true);
  assert.equal(runnerReportsLiveSession({ phase: 'IDLE', latestBryce: { sourceState: 'cold', flag: 'COLD' } }), false);
}

// ---------------------------------------------------------------------------
// Unit: parsed lake rows use bounded least-recently-used retention.
// ---------------------------------------------------------------------------
{
  const boundedLake = createLakeReplayFeeds({ enabled: true, runnerStatusPath, rowsCacheMaxSessions: 2 });
  const [first, second, third] = boundedLake.sessions()
    .filter((session) => session.watchable)
    .sort((a, b) => a.samples - b.samples)
    .slice(0, 3);
  assert.ok(first && second && third, 'the generated manifest provides three watchable LRU fixtures');
  boundedLake.seriesRowsFor(first.sessionKey);
  boundedLake.seriesRowsFor(second.sessionKey);
  assert.deepEqual(boundedLake.cacheInfo().sessionKeys, [first.sessionKey, second.sessionKey]);
  boundedLake.seriesRowsFor(first.sessionKey); // touch: first becomes most recent
  boundedLake.seriesRowsFor(third.sessionKey); // evicts second, the least recent
  assert.deepEqual(
    boundedLake.cacheInfo(),
    { maxSessions: 2, size: 2, sessionKeys: [first.sessionKey, third.sessionKey] },
    'LRU eviction retains the two most recently used parsed sessions'
  );
}

// ---------------------------------------------------------------------------
// Unit: the router's resolveReplay enforces the live-guard + watchable gating.
// ---------------------------------------------------------------------------
const makeRouter = () => {
  const captureOverlay = createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath });
  const lakeFeeds = createLakeReplayFeeds({ enabled: true, runnerStatusPath });
  return createReplayRouter({ captureOverlay, lakeFeeds, enabled: true });
};
{
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
  const router = makeRouter();
  assert.equal(router.resolveReplay({ session: '5537-6754', rt: REPLAY_EARLY_RT, speed: 1 }).kind, 'record', 'a watchable capture resolves to a record');
  assert.ok(router.available().sessions.some((s) => s.sessionKey === 'session_indy_nxt_2026_6754' && s.supersededByCapture), 'fixture covers a lake feed superseded by a native capture');
  assert.equal(router.resolveReplay({ session: 'session_indy_nxt_2026_6754', rt: REPLAY_EARLY_RT, speed: 1 }).kind, 'record', 'canonical race links resolve the preferred native capture after lake supersession');
  assert.equal(router.resolveReplay({ session: '5537-6753', rt: REPLAY_EARLY_RT, speed: 1 }).kind, 'refused', 'a non-watchable practice capture is refused');
  assert.equal(router.resolveReplay({ session: '5537-6753', rt: REPLAY_EARLY_RT, speed: 1 }).statusCode, 422, 'a non-watchable capture refuses with 422');
  assert.equal(router.resolveReplay({ session: '9001-8801', rt: REPLAY_EARLY_RT, speed: 1 }).statusCode, 422, 'a wrong-series capture refuses with 422');
  assert.equal(router.resolveReplay({ session: 'no-such-session', rt: REPLAY_EARLY_RT, speed: 1 }).statusCode, 404, 'an unknown session refuses with 404');
  const midOhioGap = router.resolveReplay({
    session: 'session_indy_nxt_2025_6452',
    rt: '2025-07-06T10:45:00.000Z',
    speed: 1
  });
  assert.equal(midOhioGap.kind, 'source_gap', 'a withheld lake interval resolves as a source gap, not a stale record');
  assert.equal(midOhioGap.statusCode, 409, 'source gaps use a distinct conflict response');
  assert.equal(midOhioGap.gap.lastObservedAt, '2025-07-06T10:42:12.000Z');
  assert.equal(midOhioGap.gap.heldThroughAt, '2025-07-06T10:42:17.000Z');
  assert.equal(midOhioGap.gap.nextObservedAt, '2025-07-06T10:49:28.000Z');
  assert.equal(midOhioGap.gap.maximumHoldSeconds, 5);
  const beforeWithheld = router.resolveReplay({
    session: 'session_indy_nxt_2025_6452',
    rt: '2025-07-06T10:42:17.000Z',
    speed: 1
  });
  assert.equal(beforeWithheld.kind, 'record', 'the declared five-second step-hold remains available');
  assert.equal(beforeWithheld.record.archiveCheckedAt, '2025-07-06T10:42:17.000Z');
  const resumed = router.resolveReplay({
    session: 'session_indy_nxt_2025_6452',
    rt: '2025-07-06T10:49:28.000Z',
    speed: 1
  });
  assert.equal(resumed.kind, 'record', 'replay resumes on the next observed frame');
  assert.equal(resumed.record.archiveCheckedAt, '2025-07-06T10:49:28.000Z');
  const disabledRouter = createReplayRouter({
    captureOverlay: createReplayOverlay({ enabled: false, sqlitePath, runnerStatusPath }),
    lakeFeeds: createLakeReplayFeeds({ enabled: false, runnerStatusPath }),
    enabled: false
  });
  assert.equal(disabledRouter.resolveReplay({ session: '5537-6754', rt: REPLAY_EARLY_RT, speed: 1 }).kind, 'disabled', 'a disabled router never enters replay');
}
{
  // Live-guard: a live runner makes the router ignore params (serve the real feed).
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'LIVE', updatedAt: new Date().toISOString() }));
  const router = makeRouter();
  assert.equal(router.resolveReplay({ session: '5537-6754', rt: REPLAY_EARLY_RT, speed: 1 }).kind, 'live', 'a live runner preempts replay params at the router');
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
}

// ---------------------------------------------------------------------------
// Server end-to-end.
// ---------------------------------------------------------------------------
const sourceResult = (endpoint, payload, checkedAt = '2026-07-12T18:00:00.000Z') => ({
  ...endpoint, ok: payload !== undefined, status: payload !== undefined ? 200 : 0, contentType: 'application/json',
  fetchedAt: checkedAt, lastModified: null, etag: null, bytes: payload === undefined ? 0 : Buffer.byteLength(JSON.stringify(payload)),
  payload, error: payload === undefined ? 'fixture missing' : null
});
const expectedSnapshot = buildRaceSnapshotFromResults(raceSnapshotEndpoints.map((endpoint) => sourceResult(endpoint, raw[endpoint.id])));
const expectedTiming = {
  checkedAt: expectedSnapshot.updatedAt, sourceState: expectedSnapshot.sourceState, rowCount: expectedSnapshot.timingRows.length, bryceNo: expectedSnapshot.bryce.no,
  heartbeat: {
    eventName: heartbeat.eventName, eventId: heartbeat.EventID, eventSessionId: heartbeat.EventSessionID, sessionName: heartbeat.SessionName,
    sessionType: heartbeat.SessionType, sessionStatus: heartbeat.SessionStatus, series: heartbeat.Series, flag: heartbeat.currentFlag,
    lap: 12, totalLaps: 18, trackName: heartbeat.trackName, trackType: heartbeat.trackType
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
    ...process.env, NODE_NO_WARNINGS: '1', BRYCECAST_REPLAY: '1',
    BRYCECAST_SQLITE_PATH: sqlitePath, BRYCECAST_RUNNER_STATUS_PATH: runnerStatusPath,
    BRYCECAST_REPLAY_GUARD_TTL_MS: '200'
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
const replayQuery = (session, rt, speed = 1) => `?replay=${encodeURIComponent(session)}&rt=${encodeURIComponent(rt)}&speed=${speed}`;

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetchJson('/api/health')).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // A plain client's real feed exists: runner idle but fresh, latest record is P3/lap15.
  await writeFile(runnerStatusPath, JSON.stringify({
    phase: 'IDLE', updatedAt: new Date().toISOString(), lastSuccessfulWriteAt: new Date().toISOString(),
    latestBryce: { sourceState: 'cold', flag: 'GREEN' }
  }));

  // ---- Per-request payload shape parity ----
  const replayTiming = await fetchJson(`/api/timing${replayQuery('5537-6754', REPLAY_EARLY_RT)}`);
  assert.deepEqual(shapeOf(replayTiming), shapeOf(expectedTiming), 'per-request replay /api/timing preserves the live payload shape');
  assert.deepEqual(replayTiming.rows, expectedTiming.rows, 'per-request replay timing values are the archived Race Control values');
  assert.equal(replayTiming.rows.find((row) => row.bryce)?.driverId, '2143', 'compact timing rows retain stable driver identity');
  const replayReadiness = await fetchJson(`/api/readiness${replayQuery('5537-6754', REPLAY_EARLY_RT)}`);
  assert.equal(replayReadiness.schemaVersion, 'live-readiness.v1');
  assert.equal(replayReadiness.liveTiming.rows.find((row) => row.bryce)?.runningDriverPoints, 159);
  assert.equal(replayReadiness.bryce.identityGuard.matchedBy, 'driver_id');
  assert.equal(replayReadiness.replay.simulation?.active, true, 'per-request replay readiness identifies simulated playback');
  assert.equal(replayReadiness.replay.simulation?.mode, 'archived_replay', 'per-request replay stays distinct from official live mode');

  // ---- THE ISOLATION TEST (the absolute-priority property) ----
  // Two concurrent clients hit the SAME stateless server at the SAME time:
  // one appends replay params, one does not. The plain client must receive the
  // real feed (P3/lap15) while the replaying client receives archived rows
  // (P6/lap12) — proving one viewer's replay can never touch another's Live page.
  const [plain, replaying] = await Promise.all([
    fetchJson('/api/timing'),
    fetchJson(`/api/timing${replayQuery('5537-6754', REPLAY_EARLY_RT)}`)
  ]);
  const plainBryce = plain.rows.find((row) => row.bryce);
  const replayingBryce = replaying.rows.find((row) => row.bryce);
  assert.equal(plainBryce?.rank, 3, 'ISOLATION: the plain client receives the REAL feed (Bryce P3, lap 15)');
  assert.equal(plainBryce?.laps, '15', 'ISOLATION: the plain client is on the live lap, not the replay lap');
  assert.equal(replayingBryce?.rank, 6, 'ISOLATION: the replaying client receives the ARCHIVED frame (Bryce P6, lap 12)');
  assert.equal(replayingBryce?.laps, '12', 'ISOLATION: the replaying client is on the archived lap');
  const [plainReady, replayReady] = await Promise.all([
    fetchJson('/api/timing'),
    fetchJson(`/api/readiness${replayQuery('5537-6754', REPLAY_EARLY_RT)}`)
  ]);
  assert.equal(plainReady.rows.find((row) => row.bryce)?.rank, 3, 'ISOLATION: a repeated plain poll is still the real feed — no bleed from the concurrent replay');
  assert.equal(replayReady.replay.simulation?.active, true, 'ISOLATION: the concurrent replaying client stays simulated');

  const isolationReport = {
    property: 'per-client-replay-isolation',
    plain: { params: 'none', bryceRank: plainBryce?.rank, bryceLaps: plainBryce?.laps, feed: 'real' },
    replaying: { params: replayQuery('5537-6754', REPLAY_EARLY_RT), bryceRank: replayingBryce?.rank, bryceLaps: replayingBryce?.laps, simulated: replayReady.replay.simulation?.active === true, feed: 'archived' },
    verdict: plainBryce?.rank === 3 && replayingBryce?.rank === 6 ? 'ISOLATED' : 'LEAK'
  };
  console.log(`ISOLATION_TEST ${JSON.stringify(isolationReport)}`);
  assert.equal(isolationReport.verdict, 'ISOLATED', 'ISOLATION verdict must be ISOLATED');

  // ---- available() stays a read-only index (unchanged contract) ----
  const available = await fetchJson('/api/replay/available');
  assert.equal(available.schemaVersion, 'live-replay-available.v1');
  assert.equal(available.enabled, true);
  assert.ok(available.sessions.find((s) => s.sessionKey === '5537-6754')?.watchable, 'available() exposes the watchable Road America race');
  assert.equal(available.sessions.find((s) => s.sessionKey === '5537-6753')?.watchable, false, 'available() marks the practice capture non-watchable');
  assert.equal(available.sessions.find((s) => s.sessionKey === '9001-8801')?.watchable, false, 'available() marks the wrong-series capture non-watchable');
  // The retired global control never flips state.
  const control = await fetchJson('/api/replay/control');
  assert.equal(control.active, false, 'the retired control endpoint reports no active global playback');
  assert.equal(control.retired, true, 'the control endpoint is retired for per-client replay');

  // ---- (d) refused: non-watchable / unknown replay params on a live route ----
  const practiceRefused = await fetch(`${baseUrl}/api/readiness${replayQuery('5537-6753', REPLAY_EARLY_RT)}`);
  assert.equal(practiceRefused.status, 422, 'a non-watchable practice capture is refused on the live route');
  const wrongSeriesRefused = await fetch(`${baseUrl}/api/timing${replayQuery('9001-8801', REPLAY_EARLY_RT)}`);
  assert.equal(wrongSeriesRefused.status, 422, 'a wrong-series capture is refused on the live route');
  const unknownRefused = await fetch(`${baseUrl}/api/readiness${replayQuery('no-such-session', REPLAY_EARLY_RT)}`);
  assert.equal(unknownRefused.status, 404, 'an unknown replay session is refused with 404');

  // ---- Lake-fed per-request replay (2024 RaceTools) ----
  const lake2024 = available.sessions.find((s) => s.canonicalSessionId === 'session_indy_nxt_2024_6314');
  assert.ok(lake2024, 'available() lists the 2024 Barber RaceTools race');
  assert.equal(lake2024.sourceTier, 'racetools_capture');
  const lakeTiming = await fetchJson(`/api/timing${replayQuery(lake2024.sessionKey, lake2024.firstGreenAt, 4)}`);
  const lakeBryce = lakeTiming.rows.find((row) => row.bryce);
  assert.equal(lakeBryce?.driverId, '2143', 'lake feed: Bryce resolves on his stable Race Control driver id');
  assert.equal(lakeBryce?.no, '27', 'lake feed: Bryce carries his TRUE 2024 car number (#27)');
  assert.deepEqual(Object.keys(lakeTiming.rows[0]).sort(), Object.keys(expectedTiming.rows[0]).sort(), 'lake feed: each timing row carries the live capture fields');
  const lakeReadiness = await fetchJson(`/api/readiness${replayQuery(lake2024.sessionKey, lake2024.firstGreenAt, 4)}`);
  assert.equal(lakeReadiness.replay.simulation?.active, true, 'lake feed: readiness flags simulated playback');

  // ---- (a) Nashville 2025 regression via per-request params ----
  // Battle rivals + running-order accumulation, driven exactly as the Live page
  // drives it: the client owns the clock and appends ?replay&rt&speed each poll.
  {
    const NASH = 'session_indy_nxt_2025_6447';
    const nash = available.sessions.find((s) => s.sessionKey === NASH);
    assert.ok(nash?.watchable, 'nashville: the 2025 Music City race is a watchable lake replay');
    const speed = 4;
    const virtualStartMs = Date.parse('2025-08-31T10:51:00.000Z');
    const wallStart = Date.now();
    const rtNow = () => new Date(virtualStartMs + Math.max(0, Date.now() - wallStart) * speed).toISOString();

    let history = createLiveHistoryState();
    let battleWithRivals = null;
    let sessionKey = null;
    const seenArchive = new Set();
    for (let attempt = 0; attempt < 40 && seenArchive.size < 2; attempt += 1) {
      const payload = await fetchJson(`/api/readiness${replayQuery(NASH, rtNow(), speed)}`);
      assert.ok(['ready', 'degraded'].includes(payload.state), `nashville: mid-race readiness must be usable (got ${payload.state})`);
      assert.equal(payload.replay.simulation?.active, true, 'nashville: every mid-race payload is a simulated replay');
      const rows = payload.liveTiming?.rows ?? [];
      const bryce = rows.find((row) => row.bryce === true) ?? null;
      assert.ok(bryce, 'nashville: the guarded Bryce row is present mid-race');
      const battle = buildCumulativeLiveBattleFrame(rows, bryce);
      assert.ok(battle, 'nashville: a battle frame builds around the Bryce anchor');
      if (battle.cars.length > 0) battleWithRivals = battle;
      assert.ok(liveHistorySampleFromPayload(payload) !== null, 'nashville: every usable payload yields a history sample');
      sessionKey = liveSessionKeyOf(payload);
      assert.ok(sessionKey, 'nashville: a session key resolves from the eventSessionId even with an empty eventId');
      seenArchive.add(payload.replay?.simulation?.archiveCheckedAt ?? '');
      history = appendLiveHistoryPayload(history, payload);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    assert.ok(battleWithRivals, 'nashville: the battle corridor carries at least one rival car (the exact regression Jack hit)');
    assert.ok(battleWithRivals.ahead || battleWithRivals.behind, 'nashville: the corridor names at least one adjacent rival');
    const nashSession = history.sessions[sessionKey];
    assert.ok(nashSession, 'nashville: the accumulator holds the Nashville session');
    assert.ok(nashSession.samples.length >= 2, `nashville: the running order crosses its two-sample gate (got ${nashSession.samples.length})`);
    assert.ok(
      nashSession.selectedDrivers.some((driver) => driver.role === 'initially_ahead' || driver.role === 'initially_behind'),
      'nashville: the running order selects at least one rival lane around Bryce'
    );
  }

  // ---- (c) live-guard: runner goes live → replay params ignored, real feed served ----
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'LIVE', updatedAt: new Date().toISOString(), lastSuccessfulWriteAt: new Date().toISOString() }));
  let guardedTiming = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    guardedTiming = await fetchJson(`/api/timing${replayQuery('5537-6754', REPLAY_EARLY_RT)}`);
    if (guardedTiming.rows.find((row) => row.bryce)?.rank === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(guardedTiming.rows.find((row) => row.bryce)?.rank, 3, 'live-guard: replay params are ignored while the runner is live — the real feed (P3) is served');
  const guardedReadiness = await fetchJson(`/api/readiness${replayQuery('5537-6754', REPLAY_EARLY_RT)}`);
  assert.notEqual(guardedReadiness.replay.simulation?.active, true, 'live-guard: a live runner makes the replaying client see the real (non-simulated) feed');
  assert.equal(guardedReadiness.liveTiming.rows.find((row) => row.bryce)?.laps, '15', 'live-guard: the served feed is the real record');
  // And a plain client is unaffected throughout.
  assert.equal((await fetchJson('/api/timing')).rows.find((row) => row.bryce)?.rank, 3, 'live-guard: the plain client keeps seeing the real feed');
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}

/* ---------- off-season auto-demo: the default, not a one-shot ----------
 *
 * With nothing on the calendar, Live auto-starts the featured race. The flag
 * used to be written the moment auto-start was DECIDED, so the demo ran once per
 * tab and the second tap on Live landed on "No session on the calendar" — the
 * owner read that as the feature never having shipped. The record now means
 * DECLINED, and only a control the visitor pressed writes it. */
{
  const makeStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), size: () => map.size };
  };

  const fresh = makeStorage();
  assert.equal(hasDeclinedOffSeasonDemo(fresh), false, 'a new tab has declined nothing');
  assert.equal(
    shouldAutoStartOffSeasonDemo({ declined: false, hasFeaturedRace: true, alreadyAttempted: false }),
    true,
    'the demo auto-starts when nothing is scheduled'
  );
  // Auto-starting writes nothing: opening Live again must show the demo again.
  assert.equal(fresh.size(), 0, 'auto-start records no choice on the visitor’s behalf');
  assert.equal(hasDeclinedOffSeasonDemo(fresh), false, 'the demo is still the default on the second visit');
  assert.equal(
    shouldAutoStartOffSeasonDemo({ declined: hasDeclinedOffSeasonDemo(fresh), hasFeaturedRace: true, alreadyAttempted: false }),
    true,
    'REGRESSION: tapping Live a second time in the same tab starts the demo again'
  );

  // "Exit replay" / "Pick another race" — the only two writers.
  const declined = makeStorage();
  declineOffSeasonDemo(declined);
  assert.equal(declined.getItem(OFFSEASON_DEMO_DECLINED_KEY), '1', 'an explicit exit is recorded for this tab');
  assert.equal(
    shouldAutoStartOffSeasonDemo({ declined: hasDeclinedOffSeasonDemo(declined), hasFeaturedRace: true, alreadyAttempted: false }),
    false,
    'after an explicit exit, Live shows the race list instead of restarting the demo'
  );

  // The old key must not opt anyone out: a tab still holding it sees the demo.
  const legacy = makeStorage({ 'bc:offseason-demo-seen': '1' });
  assert.equal(hasDeclinedOffSeasonDemo(legacy), false, 'the retired once-per-tab flag no longer suppresses the demo');

  // Guards that keep the auto-start effect from looping or firing early.
  assert.equal(
    shouldAutoStartOffSeasonDemo({ declined: false, hasFeaturedRace: false, alreadyAttempted: false }),
    false,
    'an unresolved replay catalog waits rather than refusing'
  );
  assert.equal(
    shouldAutoStartOffSeasonDemo({ declined: false, hasFeaturedRace: true, alreadyAttempted: true }),
    false,
    'the auto-start navigates once per mount'
  );

  // Where the demo JOINS. At the green flag the archive has nothing behind it,
  // so the seed is empty and both charts have to grow from scratch — the demo's
  // whole job is to show a running race. It starts a few minutes in instead, and
  // every input is treated as untrustworthy.
  const capture = (overrides = {}) => ({
    firstCheckedAt: '2026-09-05T22:30:00.000Z',
    firstGreenAt: '2026-09-05T22:38:00.000Z',
    lastCheckedAt: '2026-09-05T23:30:00.000Z',
    durationSeconds: 3600,
    ...overrides
  });
  assert.equal(
    offSeasonDemoStartAt(capture()),
    '2026-09-05T22:44:00.000Z',
    'the demo joins six minutes past the green flag, one more than the charts’ five-minute window'
  );
  assert.equal(OFFSEASON_DEMO_JOIN_SECONDS, 360);
  // A short or part-captured race is never skipped a fixed six minutes into a
  // ten-minute archive: the offset caps at 40% of what was recorded.
  assert.equal(
    offSeasonDemoStartAt(capture({ firstGreenAt: '2026-09-05T22:31:00.000Z', lastCheckedAt: '2026-09-05T22:40:00.000Z', durationSeconds: 600 })),
    '2026-09-05T22:35:00.000Z',
    'the join offset caps at 40% of a short capture (four minutes of ten, not six)'
  );
  // Unknown or unusable inputs fall back to the green flag (no t0 in the URL).
  assert.equal(offSeasonDemoStartAt(capture({ firstGreenAt: null })), null, 'a capture that never went green starts at green');
  assert.equal(offSeasonDemoStartAt(capture({ firstGreenAt: 'not a date' })), null, 'an unparseable green flag starts at green');
  assert.equal(
    offSeasonDemoStartAt({ firstGreenAt: '2026-09-05T22:38:00.000Z' }),
    null,
    'a capture with no measurable span starts at green'
  );
  assert.equal(offSeasonDemoStartAt(capture({ durationSeconds: 0, firstCheckedAt: null })), null, 'a zero-length capture starts at green');
  assert.equal(offSeasonDemoStartAt(null), null, 'an unresolved capture starts at green');
  assert.equal(
    offSeasonDemoStartAt(capture({ firstGreenAt: '2026-09-05T23:29:00.000Z' })),
    null,
    'a green flag near the end of the capture is never pushed past the last archived sample'
  );

  // Storage blocked (private mode): the demo stays the default, never crashes.
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(hasDeclinedOffSeasonDemo(blocked), false, 'blocked storage leaves the demo as the default');
  assert.doesNotThrow(() => declineOffSeasonDemo(blocked), 'blocked storage never breaks the exit control');
  assert.equal(hasDeclinedOffSeasonDemo(null), false, 'a missing storage leaves the demo as the default');
}

assert.equal(stderr, '', stderr);
console.log(JSON.stringify({
  ok: true,
  contract: 'per-client-stateless-replay',
  isolation: 'plain-clients-never-see-replay',
  liveGuard: 'per-request-preempts-replay',
  gating: 'watchable-only-refused-422/404',
  lakeFeeds: '2024-racetools+2025-nashville-per-request',
  nashvilleRegression: 'battle-rivals+running-order-accumulates',
  offSeasonDemo: 'default-until-explicitly-declined',
  offSeasonDemoJoin: 'starts-in-progress-green-flag-fallback'
}, null, 2));
