// Concurrent lake-feed replay reads must not stall the server.
//
// On November 15, 2026 about ten parallel `GET /api/session?replay=…&rt=…`
// reads for different Timing71-backed races left brycecast.com answering
// nothing, the home page included, until the process was restarted. Each cold
// replay read decoded the whole feed synchronously on the event loop — gunzip
// plus a JSON.parse of every row (~19 MB of JSON per race) — and with more races
// in play than the three cache slots, every poll was a cold read. The single Node
// process that serves the API also serves the static site, so nothing else could
// be answered while those decodes ran.
//
// This test builds synthetic lake feeds (no source data; nothing here is real
// timing) and checks, against the real HTTP handler:
//   1. a cold replay read parses only the row it serves, not the whole feed;
//   2. lazily parsed rows are identical to a full parse (measured and derived
//      values pass through untouched), including lines in a non-leading shape;
//   3. ten parallel cold reads for ten different races, with the cache smaller
//      than the burst, all answer correctly, and a /api/health probe sent with
//      them answers well inside the time a full-parse decode of those feeds
//      takes on this machine;
//   4. a replay frame with timing rows but no Bryce row (every Timing71 feed
//      opens with a few) is refused as that frame, never answered with the live
//      path's newest-archived-Bryce substitute. That substitute is a different
//      race, and finding it is a LIKE scan of every payload in the SQLite
//      archive: ~26 s per read on the 19 GB production archive, which is what
//      actually held the server on November 15.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createLakeReplayFeeds, lazyFeedRow } from './lib/replay-lake-feeds.mjs';

const SESSIONS = 10;
const ROWS = 3000; // a race at 1 s cadence, like the real Timing71 feeds
const CARS = 23;
const firstMs = Date.parse('2026-03-28T17:00:00.000Z');

const runtime = await mkdtemp(join(tmpdir(), 'brycecast-replay-load-'));
const feedsDir = join(runtime, 'feeds');
await mkdir(feedsDir);
const manifestPath = join(runtime, 'replay-feeds-manifest.json');
const runnerStatusPath = join(runtime, 'live-runner-status.json');
await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));

const sessionKeyFor = (index) => `session_indy_nxt_2026_${9900 + index}`;
const iso = (ms) => new Date(ms).toISOString();

// One synthetic row in the reducer's own line shape. Bryce is car 9 by name so
// the snapshot builder resolves his row; every other car is a placeholder.
// Like every Timing71 feed, each race opens with frames that carry no Bryce row.
const OPENING_FRAMES_WITHOUT_BRYCE = 5;
const rowFor = (sessionIndex, tick) => {
  const checkedAt = iso(firstMs + tick * 1000);
  const lap = String(1 + Math.floor(tick / 80));
  const bryceRank = 1 + ((tick + sessionIndex) % CARS);
  const items = Array.from({ length: CARS }, (_, car) => {
    const isBryce = car === 0 && tick >= OPENING_FRAMES_WITHOUT_BRYCE;
    const rank = isBryce ? bryceRank : 1 + ((car + (car >= bryceRank ? 0 : -1) + CARS) % CARS);
    return {
      no: isBryce ? '9' : String(100 + car),
      DriverID: isBryce ? '' : `fixture-${car}`,
      firstName: isBryce ? 'Bryce' : `Fixture${car}`,
      lastName: isBryce ? 'Aron' : 'Driver',
      team: `Fixture Team ${car % 8}`,
      rank: String(rank),
      liveRank: String(rank),
      startPosition: String(car + 1),
      status: 'Active',
      gap: (rank * 1.137).toFixed(3),
      liveGap: (rank * 1.141).toFixed(3),
      laps: lap,
      bestLapTime: `1:${String(10 + (car % 40)).padStart(2, '0')}.${String(100 + tick % 900)}`,
      lastLapTime: `1:${String(11 + (car % 40)).padStart(2, '0')}.${String(100 + (tick * 7) % 900)}`,
      sectors: Array.from({ length: 12 }, (_, s) => ({ id: `S${s}`, time: (20 + s + (tick % 13) / 10).toFixed(3), speed: (150 + s + car).toFixed(1) }))
    };
  });
  return {
    checkedAt,
    sessionKey: sessionKeyFor(sessionIndex),
    summary: { checkedAt, trackName: 'Fixture Circuit', flag: 'GREEN', lap, totalLaps: '40', sourceTier: 'timing71_normalized', noGps: true },
    raw: {
      timing: {
        timing_results: {
          heartbeat: {
            eventName: `Fixture Grand Prix ${sessionIndex}`,
            EventID: String(5900 + sessionIndex),
            EventSessionID: String(9900 + sessionIndex),
            SessionName: 'Race',
            SessionType: 'R',
            Series: 'L',
            trackName: 'Fixture Circuit',
            trackType: 'RC',
            SessionStatus: 'GREEN',
            currentFlag: 'GREEN',
            lapNumber: lap,
            totalLaps: '40'
          },
          Item: items
        }
      },
      drivers_nxt: { drivers: [] },
      config: { track_map_url: '' },
      schedule_nxt: {},
      trackactivity_nxt: {}
    }
  };
};

const sessions = [];
const feedLines = new Map();
for (let index = 0; index < SESSIONS; index += 1) {
  const sessionKey = sessionKeyFor(index);
  const lines = Array.from({ length: ROWS }, (_, tick) => JSON.stringify(rowFor(index, tick)));
  feedLines.set(sessionKey, lines);
  await writeFile(join(feedsDir, `${sessionKey}.ndjson.gz`), gzipSync(lines.join('\n') + '\n', { level: 1 }));
  sessions.push({
    sessionKey,
    canonicalSessionId: sessionKey,
    eventSessionId: String(9900 + index),
    eventName: `Fixture Grand Prix ${index}`,
    sessionName: 'Race',
    seasonYear: 2026,
    samples: ROWS,
    bryceSamples: ROWS,
    firstCheckedAt: iso(firstMs),
    lastCheckedAt: iso(firstMs + (ROWS - 1) * 1000),
    firstGreenAt: iso(firstMs),
    watchable: true,
    sourceTier: 'timing71_normalized',
    tierLabel: 'Third-party normalized (Timing71)',
    noGps: true
  });
}
await writeFile(manifestPath, JSON.stringify({ sessions }));

// A runner archive whose newest Bryce sample belongs to a different race: the
// live path's fallback would substitute it, so a replay must never show it.
const sqlitePath = join(runtime, 'archive.sqlite');
{
  const db = new DatabaseSync(sqlitePath);
  db.exec(`CREATE TABLE race_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL, session_key TEXT NOT NULL,
    event_id TEXT, event_session_id TEXT, event_name TEXT, session_name TEXT, flag TEXT, lap TEXT,
    total_laps TEXT, source_state TEXT NOT NULL, bryce_rank INTEGER, bryce_status TEXT, bryce_laps TEXT,
    bryce_gap TEXT, bryce_best_lap_time TEXT, payload_json TEXT NOT NULL);
    CREATE INDEX idx_race_snapshots_session_checked ON race_snapshots(session_key, checked_at);`);
  const decoy = rowFor(0, 100);
  decoy.raw.timing.timing_results.heartbeat.eventName = 'Archive Decoy Grand Prix';
  db.prepare(`INSERT INTO race_snapshots (checked_at, session_key, event_name, session_name, source_state, payload_json)
              VALUES (?, 'decoy_practice', 'Archive Decoy Grand Prix', 'Practice 1', 'live', ?)`)
    .run('2026-10-16T15:00:00.000Z', JSON.stringify({ summary: decoy.summary, raw: decoy.raw }));
  db.close();
}

const rtFor = (index) => iso(firstMs + (1200 + index * 37) * 1000);
const expectedRow = (index) => JSON.parse(feedLines.get(sessionKeyFor(index))[1200 + index * 37]);

let child;
try {
  // 1. Lazy rows are exactly a full parse, and the fallback handles other shapes.
  for (const line of feedLines.get(sessionKeyFor(0)).slice(0, 50)) {
    const full = JSON.parse(line);
    const lazy = lazyFeedRow(line);
    assert.equal(lazy.checkedAt, full.checkedAt);
    assert.equal(lazy.ms, Date.parse(full.checkedAt));
    assert.deepEqual(lazy.summary, full.summary);
    assert.deepEqual(lazy.raw, full.raw);
  }
  const reordered = JSON.stringify({ sessionKey: 'x', checkedAt: '2026-03-28T17:00:01.000Z', summary: { lap: '1' }, raw: { a: 1 } });
  assert.deepEqual({ ...lazyFeedRow(reordered) }, { ms: Date.parse('2026-03-28T17:00:01.000Z'), checkedAt: '2026-03-28T17:00:01.000Z', summary: { lap: '1' }, raw: { a: 1 } });
  const escaped = '{"checkedAt":"2026-03-28T17:00:0\\u0032.000Z","summary":null,"raw":null}';
  assert.equal(lazyFeedRow(escaped).checkedAt, '2026-03-28T17:00:02.000Z', 'an escaped timestamp falls back to a full parse');

  // 2. A cold read parses the served row, not the feed.
  const feeds = createLakeReplayFeeds({ enabled: true, manifestPath, runnerStatusPath, rowsCacheMaxSessions: 3 });
  assert.equal(feeds.has(sessionKeyFor(0)), true);
  const realParse = JSON.parse;
  let parses = 0;
  JSON.parse = (...args) => {
    parses += 1;
    return realParse(...args);
  };
  let resolved;
  try {
    resolved = feeds.recordAt({ session: sessionKeyFor(0), rt: rtFor(0), speed: 1 });
  } finally {
    JSON.parse = realParse;
  }
  assert.ok(resolved?.record, 'the cold read resolves a record');
  assert.ok(parses <= 2, `a cold replay read parsed ${parses} JSON documents; it should parse only the row it serves, not all ${ROWS}`);
  assert.deepEqual(resolved.record.summary, expectedRow(0).summary, 'the served summary is the row at rt');
  assert.deepEqual(resolved.record.raw, expectedRow(0).raw, 'the served raw payload is the row at rt');

  // Machine-relative yardstick: what decoding these feeds the old way costs here.
  const fullDecodeStarted = performance.now();
  for (const { sessionKey } of sessions) {
    const text = gunzipSync(readFileSync(join(feedsDir, `${sessionKey}.ndjson.gz`))).toString('utf8').trim();
    for (const line of text.split('\n')) JSON.parse(line);
  }
  const fullDecodeMs = performance.now() - fullDecodeStarted;

  // 3. Ten parallel cold reads over HTTP, cache smaller than the burst.
  const reserve = createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const preload = join(runtime, 'no-network.mjs');
  await writeFile(preload, "globalThis.fetch = async () => { throw new Error('Upstream disabled in replay-load test'); };\n");
  child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`], {
    env: {
      ...process.env,
      BRYCECAST_REPLAY: '1',
      BRYCECAST_API_RUNNER_ONLY: '1',
      BRYCECAST_SQLITE_PATH: sqlitePath,
      BRYCECAST_RUNNER_STATUS_PATH: runnerStatusPath,
      BRYCECAST_REPLAY_FEEDS_MANIFEST: manifestPath,
      BRYCECAST_REPLAY_ROWS_CACHE_SESSIONS: '3'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let attempt = 0; attempt < 100 && !up; attempt += 1) {
    try {
      up = (await fetch(`${base}/api/health`)).ok;
    } catch {
      await delay(100);
    }
  }
  assert.ok(up, `the API server started\n${output}`);

  const timed = async (path) => {
    const started = performance.now();
    const response = await fetch(base + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    const body = await response.json();
    return { status: response.status, body, ms: performance.now() - started };
  };
  const burst = sessions.map((session, index) =>
    timed(`/api/session?replay=${encodeURIComponent(session.sessionKey)}&rt=${encodeURIComponent(rtFor(index))}&speed=1`)
  );
  const health = timed('/api/health');
  const [replies, healthReply] = await Promise.all([Promise.all(burst), health]);

  replies.forEach((reply, index) => {
    assert.equal(reply.status, 200, `${sessionKeyFor(index)} answered ${reply.status}: ${JSON.stringify(reply.body)}`);
    const heartbeat = expectedRow(index).raw.timing.timing_results.heartbeat;
    assert.equal(reply.body.eventName, heartbeat.eventName, 'the replay serves its own race');
    assert.equal(reply.body.eventSessionId, heartbeat.EventSessionID);
    assert.equal(reply.body.lap, heartbeat.lapNumber, 'the lap at rt passes through unchanged');
  });
  assert.equal(healthReply.status, 200);
  const slowestReplayMs = Math.max(...replies.map((reply) => reply.ms));
  console.log(
    `replay-load: full decode of ${SESSIONS} feeds ${fullDecodeMs.toFixed(0)} ms; burst slowest ${slowestReplayMs.toFixed(0)} ms; health ${healthReply.ms.toFixed(0)} ms`
  );
  assert.ok(
    healthReply.ms < fullDecodeMs / 2,
    `/api/health took ${healthReply.ms.toFixed(0)} ms behind ${SESSIONS} cold replay reads; a full decode of those feeds takes ${fullDecodeMs.toFixed(0)} ms here, so the server is still decoding whole feeds on the event loop`
  );
  assert.ok(
    slowestReplayMs < fullDecodeMs / 2,
    `the slowest of ${SESSIONS} parallel cold replay reads took ${slowestReplayMs.toFixed(0)} ms (full decode: ${fullDecodeMs.toFixed(0)} ms)`
  );

  // 4. The opening frames: refused as the replay frame, never substituted.
  const openingRt = iso(firstMs + 2000);
  const opening = await timed(`/api/session?replay=${encodeURIComponent(sessionKeyFor(0))}&rt=${encodeURIComponent(openingRt)}&speed=1`);
  assert.equal(opening.status, 502, `an opening frame without Bryce answered ${opening.status}: ${JSON.stringify(opening.body)}`);
  assert.doesNotMatch(JSON.stringify(opening.body), /Archive Decoy/, 'a replay frame is never replaced by a different race from the live archive');
  assert.ok(
    JSON.stringify(opening.body).includes(`Replay frame ${openingRt} of ${sessionKeyFor(0)} has no Bryce timing row`),
    `the refusal names the frame: ${JSON.stringify(opening.body)}`
  );
  const afterOpening = await timed(`/api/session?replay=${encodeURIComponent(sessionKeyFor(0))}&rt=${encodeURIComponent(iso(firstMs + OPENING_FRAMES_WITHOUT_BRYCE * 1000))}&speed=1`);
  assert.equal(afterOpening.status, 200, 'the first frame with Bryce serves normally');
  assert.equal(afterOpening.body.eventName, 'Fixture Grand Prix 0');

  console.log('replay-load: ok');
} finally {
  child?.kill();
  await rm(runtime, { recursive: true, force: true });
}
