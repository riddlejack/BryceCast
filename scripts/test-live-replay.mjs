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
// Enough green snapshots to cross the "watchable" threshold so the captured-race
// index marks this session as a real, replayable race for its race page.
const watchableBaseMs = Date.parse('2026-06-21T16:08:22.000Z');
for (let index = 0; index < 130; index += 1) {
  const checkedAt = new Date(watchableBaseMs + index * 1000).toISOString();
  insertSnapshot.run(checkedAt, JSON.stringify({ summary: { checkedAt, trackName: 'Road America' }, raw }));
}

// Finding B fixtures: captures that must NEVER be replayable even via a direct
// /live?replay=<key> URL. Same sample volume as the watchable race, so the only
// thing that keeps them out is the watchable criteria itself.
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
      checkedAt,
      sessionKey,
      eventId,
      eventSessionId,
      eventName,
      sessionName,
      bryceRank,
      bryceRank === null ? null : 'Active',
      bryceRank === null ? null : '12',
      bryceRank === null ? null : '8.1',
      bryceRank === null ? null : '1:58.100',
      JSON.stringify({ summary: { checkedAt }, raw: {} })
    );
  }
};
// A practice capture: green and well-sampled with Bryce present, but not a race.
seedGatingSession({ sessionKey: '5537-6753', eventId: '5537', eventSessionId: '6753', eventName: 'INDY NXT at Road America', sessionName: 'Practice 1', bryceRank: 6, baseIso: '2026-06-20T14:00:00.000Z' });
// A wrong-series capture: a green race with plenty of samples, but the runner
// never stamped a Bryce timing row (bryce_rank NULL) — it is not his session.
seedGatingSession({ sessionKey: '9001-8801', eventId: '9001', eventSessionId: '8801', eventName: 'IndyCar Test Session', sessionName: 'Race', bryceRank: null, baseIso: '2026-06-20T18:00:00.000Z' });
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

// 16x is a Time Machine speed and must advance the archive clock proportionally.
const fastStart = overlay.start({ session: '5537-6754', t0: '2026-06-21T16:08:20.000Z', speed: 16 });
assert.equal(fastStart.speed, 16, '16x replay speed must be accepted');
nowMs += 100;
assert.equal(overlay.currentRecord().archiveCheckedAt, '2026-06-21T16:08:21.000Z', '16x replay clock should advance ~1.6 archive seconds in 100ms');
assert.throws(() => overlay.start({ session: '5537-6754', t0: '2026-06-21T16:08:20.000Z', speed: 7 }), /speed must be/, 'invalid replay speed must be rejected');
overlay.stop();

// The captured-race index maps this archived session to its race page.
const availableIndex = overlay.available();
assert.equal(availableIndex.enabled, true, 'available() must report enabled overlay');
const roadAmerica = availableIndex.sessions.find((session) => session.sessionKey === '5537-6754');
assert.ok(roadAmerica, 'available() must list the archived Road America race');
assert.equal(roadAmerica.eventSessionId, '6754', 'available() must carry eventSessionId for the crosswalk');
assert.equal(roadAmerica.canonicalSessionId, 'session_indy_nxt_2026_6754', 'available() must derive the canonical race-page sessionId');
assert.equal(roadAmerica.isRace, true, 'available() must classify a Race session');
assert.equal(roadAmerica.watchable, true, 'a green, well-sampled race capture must be watchable');
assert.ok(roadAmerica.firstGreenAt, 'available() must report the green-flag timestamp for restart-from-green');
assert.equal(createReplayOverlay({ enabled: false, sqlitePath, runnerStatusPath }).available().enabled, false, 'disabled overlay must report available() disabled');
// A restart from the same overlay must still refuse-when-live check on start.

await writeFile(runnerStatusPath, JSON.stringify({ phase: 'LIVE' }));
assert.throws(
  () => createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath }).start({ session: '5537-6754', speed: 1 }),
  /real live runner reports an active session/
);
await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE' }));

// ---- Finding B (unit): only watchable Bryce races are replayable ----
// A direct /live?replay=<key> URL must be held to the same watchable criteria
// the race-page index applies. A practice capture and a wrong-series capture
// (no Bryce samples) are both refused by start().
{
  const gateOverlay = createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath });
  const gateIndex = gateOverlay.available();
  const practice = gateIndex.sessions.find((session) => session.sessionKey === '5537-6753');
  const wrongSeries = gateIndex.sessions.find((session) => session.sessionKey === '9001-8801');
  assert.ok(practice, 'available() must list the practice capture');
  assert.ok(wrongSeries, 'available() must list the wrong-series capture');
  assert.equal(practice.isRace, false, 'a practice session is not a race');
  assert.equal(practice.watchable, false, 'a practice capture must not be watchable');
  assert.equal(wrongSeries.bryceSamples, 0, 'a wrong-series capture carries zero Bryce samples');
  assert.equal(wrongSeries.watchable, false, 'a wrong-series capture must not be watchable');
  assert.throws(
    () => gateOverlay.start({ session: '5537-6753', speed: 1 }),
    /not a watchable Bryce race capture/,
    'start() must refuse a non-watchable practice capture'
  );
  assert.throws(
    () => gateOverlay.start({ session: '9001-8801', speed: 1 }),
    /not a watchable Bryce race capture/,
    'start() must refuse a wrong-series capture'
  );
}

// ---- Finding A (unit): a live runner preempts a running replay ----
// If the real runner goes live mid-playback, the overlay must auto-suspend so
// its records stop masking the live race, and report the honest stopped state.
{
  let guardNow = Date.parse('2026-07-12T19:00:00.000Z');
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date(guardNow).toISOString() }));
  const guardOverlay = createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath, now: () => guardNow, guardTtlMs: 500 });
  const idleStart = guardOverlay.start({ session: '5537-6754', t0: '2026-06-21T16:08:20.000Z', speed: 1 });
  assert.equal(idleStart.active, true, 'replay starts while the runner is idle');
  assert.ok(guardOverlay.currentRecord(), 'replay serves an archived record while the runner is idle');
  // The real runner flips live mid-playback.
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'LIVE', updatedAt: new Date(guardNow).toISOString() }));
  guardNow += 600; // advance past the guard TTL so the next read re-checks status
  assert.equal(guardOverlay.currentRecord(), null, 'a live runner must preempt the replay record');
  const tripped = guardOverlay.status();
  assert.equal(tripped.active, false, 'a preempted replay reports inactive');
  assert.equal(tripped.stoppedByLive, true, 'a preempted replay reports stoppedByLive');
  assert.match(tripped.reason ?? '', /live session is on/i, 'a preempted replay carries an honest reason');
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
}

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
    NODE_NO_WARNINGS: '1',
    BRYCECAST_REPLAY: '1',
    BRYCECAST_SQLITE_PATH: sqlitePath,
    BRYCECAST_RUNNER_STATUS_PATH: runnerStatusPath,
    // Snappy live-guard re-check so the transition test doesn't have to wait a
    // full second for the runner-status read to refresh.
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
  assert.equal(replayTiming.rows.find((row) => row.bryce)?.driverId, '2143', 'compact timing rows must retain stable driver identity');
  const readiness = await fetchJson('/api/readiness');
  assert.equal(readiness.schemaVersion, 'live-readiness.v1');
  assert.equal(readiness.liveTiming.rows.find((row) => row.bryce)?.runningDriverPoints, 159);
  assert.equal(readiness.bryce.identityGuard.matchedBy, 'driver_id');
  assert.equal(readiness.replay.simulation?.active, true, 'replay readiness must identify simulated playback');
  assert.equal(readiness.replay.simulation?.mode, 'archived_replay', 'replay readiness must remain distinct from official live mode');
  assert.equal((await fetchJson('/api/replay/control')).active, true);

  const available = await fetchJson('/api/replay/available');
  assert.equal(available.schemaVersion, 'live-replay-available.v1', '/api/replay/available missing schema version');
  assert.equal(available.enabled, true, '/api/replay/available must report the enabled overlay');
  const roadAmericaRow = available.sessions.find((session) => session.sessionKey === '5537-6754');
  assert.ok(roadAmericaRow?.watchable, '/api/replay/available must expose the watchable Road America race');
  assert.equal(roadAmericaRow.canonicalSessionId, 'session_indy_nxt_2026_6754', '/api/replay/available must map to the canonical race-page sessionId');
  assert.equal(available.sessions.find((session) => session.sessionKey === '5537-6753')?.watchable, false, '/api/replay/available must mark the practice capture non-watchable');
  assert.equal(available.sessions.find((session) => session.sessionKey === '9001-8801')?.watchable, false, '/api/replay/available must mark the wrong-series capture non-watchable');

  // ---- Family flow (exact frontend param path) ----
  // The gap that let 51 assertions pass while the real "Watch this race unfold"
  // tap hung on "Cueing up the replay" forever: the earlier start above hand-
  // picks t0 and speed=1 and never reads the control body. useReplaySession
  // instead derives session / t0 / speed from /api/replay/available and — the
  // fix — treats playback as engaged ONLY when the control body says
  // active:true. This drives that same data path end to end: available →
  // start(active:true) → first timing + readiness payload is the simulated
  // replay → stop.
  const DEFAULT_REPLAY_SPEED = 4; // mirrors src/app/useReplaySession.ts
  const familySession = (await fetchJson('/api/replay/available')).sessions.find((session) => session.sessionKey === '5537-6754');
  assert.ok(familySession?.watchable, 'family flow: available() must surface the watchable capture the race-page CTA links to');
  // clampT0(session, session.firstGreenAt) === firstGreenAt (green falls inside
  // the captured span), so this query is byte-for-byte what useReplaySession
  // .start() builds for the CTA tap — session key + green-flag t0 + default speed.
  const familyQuery = `?session=${encodeURIComponent(familySession.sessionKey)}&t0=${encodeURIComponent(familySession.firstGreenAt)}&speed=${DEFAULT_REPLAY_SPEED}`;
  const familyStartRes = await fetch(`${baseUrl}/api/replay/control${familyQuery}`);
  const familyStart = JSON.parse(await familyStartRes.text());
  assert.equal(familyStartRes.status, 200, 'family flow: the start request must answer 200');
  assert.equal(familyStart.active, true, 'family flow: the start body must report active:true — the exact signal the client now requires to leave the cue-up');
  assert.equal(familyStart.sessionKey, '5537-6754', 'family flow: the engaged replay must be the requested capture');
  assert.equal(Number(familyStart.speed), DEFAULT_REPLAY_SPEED, 'family flow: the engaged replay must run at the frontend default speed');
  const familyTiming = await fetchJson('/api/timing');
  assert.equal(familyTiming.rows.find((row) => row.bryce)?.driverId, '2143', 'family flow: the first timing payload after start must carry the archived Bryce row');
  const familyReadiness = await fetchJson('/api/readiness');
  assert.equal(familyReadiness.replay.simulation?.active, true, 'family flow: the first readiness payload must be flagged simulated so the page clears "Cueing up the replay"');
  const familyStop = JSON.parse(await (await fetch(`${baseUrl}/api/replay/control?stop=1`)).text());
  assert.equal(familyStop.active, false, 'family flow: stop must disengage playback');

  // ---- Lake-fed replay (2024-25 RaceTools / 2026 Timing71) end to end ----
  // A historical race that we never captured ourselves must light up "Watch this
  // race unfold" too: it appears in available() source-tiered, starts via the same
  // frontend param path, and serves capture-shaped timing where Bryce carries his
  // TRUE season car number while resolving on his stable Race Control driver id.
  {
    const lakeAvailable = await fetchJson('/api/replay/available');
    const lake2024 = lakeAvailable.sessions.find((s) => s.canonicalSessionId === 'session_indy_nxt_2024_6314');
    assert.ok(lake2024, 'lake feed: available() must list the 2024 Barber RaceTools race');
    assert.equal(lake2024.sourceTier, 'racetools_capture', 'lake feed: a 2024 race must be tiered as a RaceTools capture');
    assert.equal(lake2024.tierLabel, 'RaceTools race-weekend capture', 'lake feed: the tier label must never read as official or as our own capture');
    assert.equal(lake2024.watchable, true, 'lake feed: a validated 2024 race must be watchable');
    assert.equal(lake2024.eventSessionId, '6314', 'lake feed: the eventSessionId must key the 2024 race page');
    assert.ok(lakeAvailable.sessions.some((s) => s.sourceTier === 'timing71_normalized'), 'lake feed: 2026 Timing71 races must also be listed, tiered as third-party normalized');
    // Our own watchable capture wins over a lake feed for the same event session.
    const lake6754 = lakeAvailable.sessions.find((s) => s.sessionKey === 'session_indy_nxt_2026_6754');
    if (lake6754) assert.equal(lake6754.watchable, false, 'lake feed: a lake session is superseded when a watchable capture covers the same event session');

    const lakeQuery = `?session=${encodeURIComponent(lake2024.sessionKey)}&t0=${encodeURIComponent(lake2024.firstGreenAt)}&speed=${DEFAULT_REPLAY_SPEED}`;
    const lakeStart = JSON.parse(await (await fetch(`${baseUrl}/api/replay/control${lakeQuery}`)).text());
    assert.equal(lakeStart.active, true, 'lake feed: the start body must report active:true so the page leaves the cue-up');
    assert.equal(lakeStart.source, 'lake_feeds', 'lake feed: playback must be served by the lake source, not the sqlite overlay');
    assert.equal(lakeStart.tierLabel, 'RaceTools race-weekend capture', 'lake feed: the engaged replay must carry its source tier');
    const lakeTiming = await fetchJson('/api/timing');
    const lakeBryce = lakeTiming.rows.find((row) => row.bryce);
    assert.equal(lakeBryce?.driverId, '2143', 'lake feed: Bryce must resolve on his stable Race Control driver id');
    assert.equal(lakeBryce?.no, '27', 'lake feed: Bryce must carry his TRUE 2024 car number (#27), not #9');
    // Structural (capture-shaped) compatibility: the payload, heartbeat, and each
    // timing row must carry exactly the same FIELDS as a live capture. Values may
    // legitimately be null where a historical replay has no data (e.g. running
    // championship points), which is the same null the live compact row emits when
    // a live feed omits them — so the field SET, not the value type, is the contract.
    assert.deepEqual(Object.keys(lakeTiming).sort(), Object.keys(expectedTiming).sort(), 'lake feed: timing payload must carry the live top-level fields');
    assert.deepEqual(Object.keys(lakeTiming.heartbeat).sort(), Object.keys(expectedTiming.heartbeat).sort(), 'lake feed: heartbeat must carry the live fields');
    assert.deepEqual(Object.keys(lakeTiming.rows[0]).sort(), Object.keys(expectedTiming.rows[0]).sort(), 'lake feed: each timing row must carry the live capture fields');
    const lakeReadiness = await fetchJson('/api/readiness');
    assert.equal(lakeReadiness.replay.simulation?.active, true, 'lake feed: readiness must flag simulated playback');
    assert.equal(lakeReadiness.bryce.identityGuard.matchedBy, 'driver_id', 'lake feed: the identity guard must match Bryce by driver id');
    const lakeStop = JSON.parse(await (await fetch(`${baseUrl}/api/replay/control?stop=1`)).text());
    assert.equal(lakeStop.active, false, 'lake feed: stop must disengage lake playback');
  }

  // A refused start must be legible to the client, not a silent hang: the body
  // reports active!==true AND carries a human reason, which is what the page now
  // renders as "this replay can't start: <reason>" with an exit — never a cue-up.
  const refusedRes = await fetch(`${baseUrl}/api/replay/control?session=5537-6753&t0=${encodeURIComponent(familySession.firstGreenAt)}&speed=${DEFAULT_REPLAY_SPEED}`);
  const refused = JSON.parse(await refusedRes.text());
  assert.equal(refusedRes.ok, false, 'family flow: a non-watchable start must not answer ok');
  assert.notEqual(refused.active, true, 'family flow: a refused start must never report active:true');
  assert.equal(typeof refused.error, 'string', 'family flow: a refused start must carry a human reason for the honest can’t-start state');
  // Restore the replay the Finding A transition below expects to be running.
  await fetchJson('/api/replay/control?session=5537-6754&t0=2026-06-21T16%3A08%3A20.000Z&speed=1');

  // ---- Finding A (transition): idle → replay → runner goes live → real record ----
  // The real runner goes live and writes a fresh, distinguishable record (Bryce
  // running P3 on lap 15, not the archived P6 on lap 12 the replay was serving).
  const liveCheckedAt = new Date().toISOString();
  const liveBryce = { ...timingRows[1], rank: '3', liveRank: '3', laps: '15', gap: '4.2', liveGap: '4.2', lastLapTime: '1:57.500' };
  const liveRaw = {
    ...raw,
    timing: { timing_results: { heartbeat: { ...heartbeat, lapNumber: '15' }, Item: [timingRows[0], liveBryce] } }
  };
  const liveDb = new DatabaseSync(sqlitePath);
  liveDb
    .prepare(`
      INSERT INTO race_snapshots
        (checked_at, session_key, event_id, event_session_id, event_name, session_name, flag, lap, total_laps,
         source_state, bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json)
      VALUES (?, '5537-6754', '5537', '6754', 'INDY NXT at Road America', 'Race 2', 'GREEN', '15', '18', 'live', 3, 'Active', '15', '4.2', '1:58.100', ?)
    `)
    .run(liveCheckedAt, JSON.stringify({ summary: { checkedAt: liveCheckedAt, trackName: 'Road America' }, raw: liveRaw }));
  liveDb.close();
  await writeFile(
    runnerStatusPath,
    JSON.stringify({ phase: 'LIVE', updatedAt: new Date().toISOString(), lastSuccessfulWriteAt: new Date().toISOString() })
  );

  // Poll until the live-guard re-checks status (TTL 200ms) and every live route
  // falls through to the fresh real record.
  let liveTiming = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    liveTiming = await fetchJson('/api/timing');
    if (liveTiming.rows.find((row) => row.bryce)?.rank === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(liveTiming.rows.find((row) => row.bryce)?.rank, 3, 'after the runner goes live, /api/timing must serve the real record, not the replay');
  assert.deepEqual(shapeOf(liveTiming), shapeOf(expectedTiming), 'the real live /api/timing keeps the same payload shape');

  const liveReadiness = await fetchJson('/api/readiness');
  assert.notEqual(liveReadiness.replay.simulation?.active, true, 'live readiness must no longer report simulated replay');
  assert.equal(liveReadiness.liveTiming.rows.find((row) => row.bryce)?.laps, '15', 'live readiness must carry the real record');

  const liveSources = await fetchJson('/api/sources');
  assert.ok(Array.isArray(liveSources.endpoints), '/api/sources must still serve a real source report after preemption');

  const controlAfterLive = await fetchJson('/api/replay/control');
  assert.equal(controlAfterLive.active, false, 'replay control must report inactive after live preemption');
  assert.equal(controlAfterLive.stoppedByLive, true, 'replay control must report stoppedByLive after live preemption');
  assert.match(controlAfterLive.reason ?? '', /live session is on/i, 'replay control must carry the honest live-preemption reason');

  // ---- Finding B (server): a direct URL cannot start a non-watchable capture ----
  await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
  assert.equal((await fetch(`${baseUrl}/api/replay/control?session=5537-6753&speed=1`)).status, 422, 'a direct replay start on a practice capture must be refused');
  assert.equal((await fetch(`${baseUrl}/api/replay/control?session=9001-8801&speed=1`)).status, 422, 'a direct replay start on a wrong-series capture must be refused');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}

assert.equal(stderr, '', stderr);
console.log(JSON.stringify({ ok: true, assertions: 85, payloadShape: 'live-compatible', timeMachine: 'available+16x', liveGuard: 'preempts-replay', gating: 'watchable-only', familyFlow: 'available-derived-params+active-body', lakeFeeds: '2024-25-racetools+2026-timing71-source-tiered' }, null, 2));
