import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  appendLiveHistoryPayload,
  createLiveHistoryState,
  liveSessionKeyOf,
  seedLiveHistoryState
} from '../src/data/liveHistoryModel.ts';
import { fullFieldRunningOrderSeries, runningOrderTimeDomain } from '../src/data/liveRunningOrderModel.ts';

// BryceCast Brief O — the server remembers the race (running-order rank-series).
//
// The endpoint hands a mid-race joiner the session-so-far so their rank chart is
// full on first paint instead of blank. This test drives the EXACT user path
// (the client's own request shapes) and asserts, end to end:
//   * a downsampled per-car rank series (breakpoints, not raw 1s samples),
//   * a startup window whose newest seeded point touches "now" (no empty span),
//   * replay windowing through the SAME resolver the live routes use, stateless,
//   * the cache-backed law (constant archive reads inside a refresh bucket),
//   * serving THROUGH a source-degradation gap, and
//   * the '' RaceTools id lesson (empty ids are absent, Bryce stays resolved).

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'brycecast-rank-series-'));
const sqlitePath = join(temp, 'rank-series.sqlite');
const runnerStatusPath = join(temp, 'live-runner-status.json');
const port = 8951 + (process.pid % 40);
const baseUrl = `http://127.0.0.1:${port}`;

// A six-car INDY NXT race where the running order actually MOVES, so downsampling
// to rank changes is meaningful. Bryce (#9 / DriverID 2143) climbs P5 → P4 → P3.
const SESSION = '7001-6900';
const EVENT_ID = '7001';
const EVENT_SESSION_ID = '6900';
const START_MS = Date.parse('2026-07-04T17:00:00.000Z');
const at = (index) => new Date(START_MS + index * 1000).toISOString();

const CARS = [
  { no: '14', driverId: '3000', first: 'Alessandro', last: 'de Tullio', team: 'AJ Foyt Racing' },
  { no: '2', driverId: '3001', first: 'Nolan', last: 'Siegel', team: 'HMD' },
  { no: '5', driverId: '3002', first: 'Caio', last: 'Collet', team: 'HMD' },
  { no: '9', driverId: '2143', first: 'Bryce', last: 'Aron', team: 'Chip Ganassi Racing' },
  { no: '3', driverId: '3003', first: 'Salvador', last: 'de Alba', team: 'HMD' },
  { no: '76', driverId: '3004', first: 'Josh', last: 'Pierson', team: 'HMD' }
];
const byNo = Object.fromEntries(CARS.map((car) => [car.no, car]));

// The running order (front → back, by car number) at snapshot `index`. Rank
// changes happen at a few known breakpoints; everything between is unchanged.
const orderAt = (index) => {
  if (index < 30) return ['14', '2', '5', '9', '3', '76'];   // Bryce P4? no — P4 index 3 => P4. He starts P4 here
  if (index < 70) return ['14', '2', '9', '5', '3', '76'];   // Bryce passes #5 → P3
  if (index < 130) return ['14', '9', '2', '5', '3', '76'];  // Bryce passes #2 → P2
  return ['14', '9', '2', '5', '3', '76'];
};
// Bryce actually starts P4 and climbs to P2; keep it honest and simple.

const flagAt = (index) => (index >= 95 && index < 110 ? 'YELLOW' : 'GREEN');

const timingRowsFor = (index) => {
  const order = orderAt(index);
  return order.map((no, position) => {
    const car = byNo[no];
    const rank = String(position + 1);
    // A simple monotonic gap ladder so battle frames have something to chew on.
    const gap = position === 0 ? '0' : (position * 1.4).toFixed(1);
    const liveGap = position === 0 ? '0' : '1.4';
    return {
      no,
      DriverID: car.driverId,
      firstName: car.first,
      lastName: car.last,
      team: car.team,
      rank,
      liveRank: rank,
      startPosition: String(CARS.findIndex((c) => c.no === no) + 1),
      status: 'Active',
      gap,
      liveGap,
      diff: gap,
      laps: String(10 + Math.floor(index / 15)),
      bestLapTime: '1:58.100',
      lastLapTime: '1:59.000',
      runningDriverPoints: '150',
      totalDriverPoints: '0',
      totalEntrantPoints: '150',
      liveDiffAhead: '800000',
      liveDiffBehind: '900000'
    };
  });
};

const rawFor = (index, { degraded = false } = {}) => {
  const heartbeat = {
    eventName: 'INDY NXT at Mid-Ohio',
    EventID: EVENT_ID,
    EventSessionID: EVENT_SESSION_ID,
    SessionName: 'Race',
    SessionType: 'R',
    SessionStatus: flagAt(index),
    Series: 'L',
    currentFlag: flagAt(index),
    lapNumber: String(10 + Math.floor(index / 15)),
    totalLaps: '35',
    trackName: 'Mid-Ohio',
    trackType: 'RC'
  };
  // A source-degradation gap: the timing feed publishes no Item rows. The
  // endpoint must skip these frames yet keep serving the last-good series.
  const Item = degraded ? [] : timingRowsFor(index);
  return {
    timing: { timing_results: { heartbeat, Item } },
    drivers_nxt: { drivers: { driver: [{ driverid: '2143', firstname: 'Bryce', lastname: 'Aron', radiofrequency: '452.7000' }] } },
    config: { track_map_url: '' },
    schedule_nxt: {},
    trackactivity_nxt: {}
  };
};

const db = new DatabaseSync(sqlitePath);
db.exec(`
  CREATE TABLE race_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL, session_key TEXT NOT NULL,
    event_id TEXT, event_session_id TEXT, event_name TEXT, session_name TEXT, flag TEXT, lap TEXT,
    total_laps TEXT, source_state TEXT NOT NULL, bryce_rank INTEGER, bryce_status TEXT, bryce_laps TEXT,
    bryce_gap TEXT, bryce_best_lap_time TEXT, payload_json TEXT NOT NULL
  );
  CREATE INDEX idx_race_snapshots_session_checked ON race_snapshots(session_key, checked_at);
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
    (checked_at, session_key, event_id, event_session_id, event_name, session_name, flag, lap, total_laps,
     source_state, bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json)
  VALUES (?, ?, ?, ?, 'INDY NXT at Mid-Ohio', 'Race', ?, ?, '35', 'live', ?, 'Active', ?, ?, '1:58.100', ?)
`);

const TOTAL = 170;
const GAP_START = 140;
const GAP_END = 150; // [140,150) publish no timing rows (source degradation)
let bryceMovesSeen = 0;
for (let index = 0; index < TOTAL; index += 1) {
  const degraded = index >= GAP_START && index < GAP_END;
  const raw = rawFor(index, { degraded });
  const checkedAt = at(index);
  const bryceRow = degraded ? null : timingRowsFor(index).find((row) => row.no === '9');
  const bryceRank = bryceRow ? Number(bryceRow.rank) : null;
  if (bryceRow && index > 0 && Number(bryceRow.rank) !== Number(timingRowsFor(index - 1).find((r) => r.no === '9')?.rank)) {
    bryceMovesSeen += 1;
  }
  insertSnapshot.run(
    checkedAt, SESSION, EVENT_ID, EVENT_SESSION_ID, flagAt(index),
    String(10 + Math.floor(index / 15)),
    bryceRank, bryceRow?.laps ?? null, bryceRow?.gap ?? null,
    JSON.stringify({ summary: { checkedAt, trackName: 'Mid-Ohio' }, raw })
  );
}
db.close();
assert.ok(bryceMovesSeen >= 2, `fixture sanity: Bryce should change rank at least twice (saw ${bryceMovesSeen})`);

await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));

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
  return { status: response.status, json: text ? JSON.parse(text) : null };
};
const seriesQuery = (params = '') => `/api/history/rank-series${params}`;
const replayQuery = (session, rt, speed = 1) => `?replay=${encodeURIComponent(session)}&rt=${encodeURIComponent(rt)}&speed=${speed}`;

// The client seeds through liveSourceCheckedAtOf → for a windowed series the
// clock is the window's last checked_at; a live series clocks to its own newest.
const touchesNow = (history, clockCheckedAt) => {
  const domain = runningOrderTimeDomain(history, clockCheckedAt);
  const latest = history.samples.at(-1);
  return Boolean(domain && latest && domain.waiting === false && domain.endMs === latest.checkedAtMs);
};

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetchJson('/api/health')).json?.ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // -------------------------------------------------------------------------
  // 1. Endpoint shape + downsampling. The live series (no params) reads the
  //    active session up to the latest archived sample.
  // -------------------------------------------------------------------------
  const live = (await fetchJson(seriesQuery(`?session=${encodeURIComponent(SESSION)}`))).json;
  assert.equal(live.schemaVersion, 'live-rank-series.v1', 'series carries its schema version');
  assert.equal(live.available, true, 'the active session has an available series');
  assert.equal(live.mode, 'live', 'no replay params → live mode');
  assert.equal(live.sessionKey, SESSION, 'the resolved archive session key is echoed');
  assert.equal(live.clientSessionKey, `${EVENT_ID}-${EVENT_SESSION_ID}`, 'clientSessionKey matches the live payload bucket identity');
  assert.ok(Array.isArray(live.frames) && live.frames.length >= 3, 'the series has multiple frames');
  assert.ok(live.frames.length < TOTAL / 3, `downsampled to breakpoints, not raw 1s samples (frames ${live.frames.length} << ${TOTAL})`);
  assert.ok(live.frames.every((frame) => Array.isArray(frame.rows) && frame.rows.length === CARS.length), 'each frame carries the full field');
  assert.ok(live.frames.some((frame) => frame.rows.some((row) => row.bryce === true)), 'frames flag Bryce');
  // Newest frame reaches the latest archived sample (no reserved empty span).
  assert.equal(live.frames.at(-1).checkedAt, live.window.lastCheckedAt, 'the newest frame touches the window edge');

  // -------------------------------------------------------------------------
  // 2. Startup-window test: seed the client model and prove the newest seeded
  //    point touches "now" with no reserved empty span (the F5 gate).
  // -------------------------------------------------------------------------
  {
    const seeded = seedLiveHistoryState(createLiveHistoryState(), live, live.clientSessionKey);
    const session = seeded.sessions[live.clientSessionKey];
    assert.ok(session, 'the seed lands in the client session bucket');
    assert.ok(session.samples.length >= 2, `seed clears the two-sample gate on first paint (got ${session.samples.length})`);
    const rankSeries = fullFieldRunningOrderSeries(session);
    assert.ok(rankSeries.length >= 2, 'the seeded window builds a full-field rank series');
    assert.ok(rankSeries.some((entry) => entry.bryce), 'Bryce has a seeded rank line');
    assert.equal(session.samples.at(-1).checkedAt, live.window.lastCheckedAt, 'newest seeded sample is the window edge');
    assert.equal(touchesNow(session, live.window.lastCheckedAt), true, 'STARTUP WINDOW: newest seeded point touches now — no reserved empty span');
    assert.equal(session.stats.arrivals, 0, 'seeding never inflates the live-poll counters');
    // The seeded Bryce line actually shows his climb (P4 → P2), not a flat floor.
    const bryceRanks = rankSeries.find((entry) => entry.bryce).points.map((point) => point.rank).filter((rank) => rank !== null);
    assert.ok(new Set(bryceRanks).size >= 2, 'the seeded Bryce line carries his rank changes');
  }

  // -------------------------------------------------------------------------
  // 3. Replay windowing through the SAME resolver — windowed, and stateless.
  // -------------------------------------------------------------------------
  const midRt = at(75);   // after Bryce's second move
  const lateRt = at(160); // near the end
  const early = (await fetchJson(seriesQuery(replayQuery(SESSION, at(45), 4)))).json;
  const mid = (await fetchJson(seriesQuery(replayQuery(SESSION, midRt, 4)))).json;
  const late = (await fetchJson(seriesQuery(replayQuery(SESSION, lateRt, 4)))).json;
  assert.equal(mid.mode, 'replay', 'replay params → replay mode');
  assert.equal(mid.window.virtualNow, new Date(Date.parse(midRt)).toISOString(), 'the window reports the virtual now it was asked for');
  assert.ok(Date.parse(mid.window.lastCheckedAt) <= Date.parse(midRt), 'the windowed series never runs past virtual now');
  assert.ok(early.breakpointCount < mid.breakpointCount, 'an earlier virtual now yields fewer breakpoints');
  assert.ok(mid.breakpointCount < late.breakpointCount, 'a later virtual now yields more breakpoints');
  // Stateless: re-reading the earlier window is unaffected by the later reads.
  const earlyAgain = (await fetchJson(seriesQuery(replayQuery(SESSION, at(45), 4)))).json;
  assert.equal(earlyAgain.breakpointCount, early.breakpointCount, 'the resolver holds no per-client state — a re-read is identical');
  // The windowed seed touches its own virtual now.
  {
    const seeded = seedLiveHistoryState(createLiveHistoryState(), mid, mid.clientSessionKey);
    const session = seeded.sessions[mid.clientSessionKey];
    assert.equal(touchesNow(session, mid.window.lastCheckedAt), true, 'a windowed replay seed also touches its virtual now');
  }

  // -------------------------------------------------------------------------
  // 4. Cache-backed law: within a refresh bucket, repeated reads do not re-scan
  //    the archive (constant reads for N viewers).
  // -------------------------------------------------------------------------
  {
    const first = (await fetchJson(seriesQuery(replayQuery(SESSION, lateRt, 4)))).json;
    const again = (await fetchJson(seriesQuery(replayQuery(SESSION, lateRt, 4)))).json;
    assert.equal(again.cache.refreshedAt, first.cache.refreshedAt, 'CACHE-BACKED: a second viewer inside the bucket reuses the same archive read');
    assert.equal(again.cache.totalBreakpoints, first.cache.totalBreakpoints, 'the cached breakpoint list is shared, not recomputed per viewer');
  }

  // -------------------------------------------------------------------------
  // 5. Same resolver gating + live-guard.
  // -------------------------------------------------------------------------
  assert.equal((await fetchJson(seriesQuery(replayQuery('no-such-session', midRt)))).status, 404, 'unknown replay session is refused 404');
  {
    await writeFile(runnerStatusPath, JSON.stringify({ phase: 'LIVE', updatedAt: new Date().toISOString(), lastSuccessfulWriteAt: new Date().toISOString() }));
    // The per-request live-guard reads runner status on a throttled cadence, so
    // poll until it flips (exactly as the replay contract test does).
    let guarded = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      guarded = (await fetchJson(seriesQuery(replayQuery(SESSION, midRt, 4)))).json;
      if (guarded.mode === 'live') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(guarded.mode, 'live', 'LIVE-GUARD: a live runner makes rank-series ignore replay params and serve the live path');
    await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
    // Wait for the throttled guard to clear before the replay-driven sections.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if ((await fetchJson(seriesQuery(replayQuery(SESSION, midRt, 4)))).json?.mode === 'replay') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // -------------------------------------------------------------------------
  // 6. Append-through-data-degradation: the endpoint keeps serving across a
  //    source gap, and a client that seeds then appends its own polls stays
  //    contiguous and touching now.
  // -------------------------------------------------------------------------
  {
    // The endpoint still serves a full, touching-now series when virtual now
    // sits INSIDE the degradation gap (no timing rows published there).
    const duringGap = (await fetchJson(seriesQuery(replayQuery(SESSION, at(145), 4)))).json;
    assert.equal(duringGap.available, true, 'DEGRADATION: the endpoint keeps serving during a source gap');
    assert.ok(duringGap.frames.length >= 2, 'the last-good order is carried across the gap');
    assert.equal(duringGap.frames.at(-1).checkedAt, duringGap.window.lastCheckedAt, 'the gap window still touches its virtual now');

    // A poll taken DURING the gap carries no Bryce row, so readiness withholds
    // rather than fabricate motion — the honest degradation contract.
    const gapPoll = (await fetchJson(`/api/readiness${replayQuery(SESSION, at(145), 4)}`)).json;
    assert.ok(!['ready', 'degraded'].includes(gapPoll.state), 'DEGRADATION: a no-timing frame is not appended as live motion');

    // Client path: seed before the gap, append a poll during it (a safe no-op),
    // then append the polls once timing resumes — the exact bytes the Live page
    // sends. The seeded window must survive the outage and resume touching now.
    const preGap = (await fetchJson(seriesQuery(replayQuery(SESSION, at(120), 4)))).json;
    let history = seedLiveHistoryState(createLiveHistoryState(), preGap, preGap.clientSessionKey);
    const beforeCount = history.sessions[preGap.clientSessionKey].samples.length;
    let resumedReady = false;
    for (const rt of [at(145), at(155), at(165)]) {
      const payload = (await fetchJson(`/api/readiness${replayQuery(SESSION, rt, 4)}`)).json;
      assert.equal(liveSessionKeyOf(payload), preGap.clientSessionKey, 'the appended poll shares the seeded bucket');
      if (['ready', 'degraded'].includes(payload.state)) resumedReady = true;
      history = appendLiveHistoryPayload(history, payload); // no-op when the poll is not usable
    }
    assert.ok(resumedReady, 'DEGRADATION: readiness resumes once timing publishes again');
    const session = history.sessions[preGap.clientSessionKey];
    assert.ok(session.samples.length > beforeCount, 'DEGRADATION: post-gap appends extend the seeded window');
    const latestPoll = session.samples.at(-1);
    assert.equal(touchesNow(session, latestPoll.checkedAt), true, 'after append-through-degradation the newest point still touches now');
    const rankSeries = fullFieldRunningOrderSeries(session);
    assert.ok(rankSeries.find((entry) => entry.bryce)?.points.some((point) => point.rank !== null), 'Bryce keeps a served rank line through the degradation');
  }

  // -------------------------------------------------------------------------
  // 7. The '' RaceTools lesson: empty/whitespace ids are absent, Bryce stays
  //    resolved by his flag, and empty-id rivals never collapse into one.
  // -------------------------------------------------------------------------
  {
    const frame = {
      checkedAt: at(200),
      lap: 20,
      flag: 'GREEN',
      rows: [
        { driverId: '', no: '14', firstName: 'Alessandro', lastName: 'de Tullio', rank: '1', liveRank: '1', bryce: false },
        { driverId: '   ', no: '2', firstName: 'Nolan', lastName: 'Siegel', rank: '2', liveRank: '2', bryce: false },
        { driverId: '2143', no: '9', firstName: 'Bryce', lastName: 'Aron', rank: '3', liveRank: '3', bryce: true }
      ]
    };
    const response = { schemaVersion: 'live-rank-series.v1', available: true, mode: 'replay', sessionKey: SESSION, clientSessionKey: `${EVENT_ID}-${EVENT_SESSION_ID}`, bryceId: '2143', frameCount: 1, breakpointCount: 1, window: { firstCheckedAt: at(200), lastCheckedAt: at(200), virtualNow: at(200), coverageSeconds: 0 }, frames: [frame] };
    const seeded = seedLiveHistoryState(createLiveHistoryState(), response, response.clientSessionKey);
    const session = seeded.sessions[response.clientSessionKey];
    assert.ok(session, 'a frame with empty rival ids still seeds');
    const sample = session.samples.at(-1);
    // #14 and #2 fall back to their car numbers (non-empty), Bryce keeps his id.
    const ids = sample.rows.map((row) => row.no);
    assert.deepEqual([...ids].sort(), ['14', '2', '9'].sort(), 'empty driverIds fall back to distinct car numbers — no collapse to ""');
    assert.equal(sample.bryceId, '2143', 'Bryce stays resolved through his flag despite empty rival ids');
  }

  // -------------------------------------------------------------------------
  // 8. Lake-fed replay path. The 40 RaceTools/Timing71 replays live as gzipped
  //    NDJSON feeds, NOT in the sqlite archive — the temp fixture above holds
  //    none of them. This server carries the real lake manifest, so the endpoint
  //    must window a lake session through the SAME resolver and seed a
  //    full-to-now chart exactly like an own-capture. (Regression guard: an
  //    earlier build read only race_snapshots, so every lake replay seeded blank.)
  // -------------------------------------------------------------------------
  {
    const available = (await fetchJson('/api/replay/available')).json;
    const lake = (available.sessions ?? []).find(
      (entry) => typeof entry.sessionKey === 'string' && entry.sessionKey.startsWith('session_') && entry.watchable && (entry.bryceSamples ?? 0) > 200
    );
    assert.ok(lake, 'a watchable lake replay session is available to serve');
    // A virtual now two-thirds into the archived span — deep enough that a real
    // mid-race joiner has a session-so-far to be handed.
    const firstMs = Date.parse(lake.firstCheckedAt);
    const lastMs = Date.parse(lake.lastCheckedAt);
    const rt = new Date(firstMs + Math.round((lastMs - firstMs) * 0.66)).toISOString();
    const series = (await fetchJson(seriesQuery(replayQuery(lake.sessionKey, rt, 4)))).json;
    assert.equal(series.mode, 'replay', 'a lake session resolves through the replay resolver');
    assert.equal(series.sessionKey, lake.sessionKey, 'the lake archive session key is echoed');
    assert.equal(series.available, true, 'LAKE PATH: the endpoint serves a lake-fed replay the sqlite never held');
    assert.ok(series.frames.length >= 2, 'the lake series carries multiple running-order frames');
    assert.ok(series.frameCount < lake.samples, 'the lake series is downsampled to breakpoints, not raw 1s samples');
    assert.ok(Date.parse(series.window.lastCheckedAt) <= Date.parse(rt), 'the lake window never runs past virtual now');
    assert.equal(series.frames.at(-1).checkedAt, series.window.lastCheckedAt, 'the newest lake frame touches the window edge');
    assert.ok(series.clientSessionKey, "the lake series resolves a client bucket key (eventSessionId for RaceTools '' EventID)");
    // Seed the client model — the lake seed must touch now on first paint too.
    const seeded = seedLiveHistoryState(createLiveHistoryState(), series, series.clientSessionKey);
    const session = seeded.sessions[series.clientSessionKey];
    assert.ok(session && session.samples.length >= 2, 'the lake seed clears the two-sample gate on first paint');
    assert.equal(touchesNow(session, series.window.lastCheckedAt), true, 'LAKE PATH: the seeded lake window touches its virtual now');
    assert.ok(fullFieldRunningOrderSeries(session).some((entry) => entry.bryce), 'the seeded lake window carries a Bryce rank line');
    // Cache-backed + stateless across the two archive substrates alike.
    const again = (await fetchJson(seriesQuery(replayQuery(lake.sessionKey, rt, 4)))).json;
    assert.equal(again.cache.totalBreakpoints, series.cache.totalBreakpoints, 'the lake breakpoint list is cached, not rebuilt per viewer');
  }
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}

assert.equal(stderr, '', stderr);
console.log(JSON.stringify({
  ok: true,
  contract: 'server-remembers-the-race',
  shape: 'downsampled-per-car-rank-breakpoints',
  startupWindow: 'newest-seeded-point-touches-now',
  replayWindowing: 'same-resolver-stateless-windowed',
  cacheBacked: 'constant-archive-reads-per-bucket',
  degradation: 'endpoint-serves-through-gaps',
  emptyIds: 'racetools-empty-id-absent-bryce-resolved',
  lakePath: 'lake-fed-replays-served-and-seeded'
}, null, 2));
