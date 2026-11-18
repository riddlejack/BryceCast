import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// A replay viewer asks for readiness about once a second for the whole race,
// and each frame's answer used to be queryReplay with that session and frame:
// archive-wide COUNT(*) and GROUP BY scans plus two scans of bryce_samples (no
// index on it in the archive the runner writes), with the whole server waiting
// on node:sqlite each time. The frame is now answered from the readiness memo
// and the session's samples, read once and kept until the archive changes; and
// the replay router's race index, rebuilt every 30 s while anyone replays, is
// kept while the archive is unchanged. This drives the real modules against an
// invented archive (nothing here is real timing) and checks that:
//   1. every frame's answer equals queryReplay's for the same arguments;
//   2. once a session is read, its frames never open the archive again;
//   3. a write, in rollback or WAL mode, is seen on the next frame;
//   4. the race index is kept past its TTL while the archive is unchanged,
//      rebuilt after a write, and never kept after a failed build.

const dir = await mkdtemp(join(tmpdir(), 'brycecast-replay-frames-'));
const sqlitePath = join(dir, 'archive.sqlite');
const runnerStatusPath = join(dir, 'live-runner-status.json');
await writeFile(runnerStatusPath, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
// sqlitePath is read when the module loads, so set it before importing.
process.env.BRYCECAST_SQLITE_PATH = sqlitePath;
process.env.BRYCECAST_REPLAY_FRAME_SESSIONS = '2';
const { queryReplay, replayFrameSummary } = await import('./api-server.mjs');
const { createReplayOverlay } = await import('./lib/replay-overlay.mjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withoutTime = (value) => ({ ...value, generatedAt: null });
const iso = (ms) => new Date(ms).toISOString();
const firstMs = Date.parse('2030-05-01T15:00:00.000Z');
const startOf = (session) => firstMs + session * 86_400_000;
const keyOf = (session) => `fixture_session_${session}`;

// Locks the archive: the file is still there, unchanged in size and time, but
// nothing can open it. A frame answered from memory does not notice.
const locked = (run) => {
  chmodSync(sqlitePath, 0o000);
  try {
    return run();
  } finally {
    chmodSync(sqlitePath, 0o644);
  }
};

try {
  const missing = replayFrameSummary({ sessionKey: keyOf(0), beforeCheckedAt: iso(startOf(0)) });
  assert.equal(missing.available, false, 'no archive yet: an unavailable answer, not an exception');
  assert.deepEqual(withoutTime(missing), withoutTime(queryReplay({ limit: 5, sessionKey: keyOf(0), beforeCheckedAt: iso(startOf(0)) })));

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
      diff TEXT, best_lap_time TEXT, best_lap TEXT, last_lap_time TEXT, best_speed TEXT, last_speed TEXT, average_speed TEXT,
      passes INTEGER, passed INTEGER, pit_stops INTEGER, last_pit_lap INTEGER, since_pit_lap INTEGER, tire TEXT,
      overtake_remain INTEGER, overtake_active TEXT, lap_distance REAL, live_diff_ahead TEXT, live_diff_behind TEXT,
      total_driver_points INTEGER, total_entrant_points INTEGER, running_driver_points INTEGER, radiofrequency TEXT
    );
  `);
  const written = new Map();
  const addSample = (conn, session) => {
    const tick = written.get(session) ?? 0;
    written.set(session, tick + 1);
    const checkedAt = iso(startOf(session) + tick * 1000);
    const lap = String(1 + Math.floor(tick / 40));
    const rank = 1 + ((tick + session) % 12);
    const { lastInsertRowid } = conn
      .prepare(`INSERT INTO race_snapshots (checked_at, session_key, event_id, event_session_id, event_name, session_name, flag,
                  lap, total_laps, source_state, bryce_rank, payload_json)
                VALUES (?, ?, ?, ?, 'INDY NXT fixture', 'Race', ?, ?, '30', 'live', ?, '{}')`)
      .run(checkedAt, keyOf(session), String(5000 + session), String(9000 + session), tick % 50 < 45 ? 'GREEN' : 'YELLOW', lap, rank);
    conn
      .prepare(`INSERT INTO bryce_samples (snapshot_id, checked_at, session_key, rank, live_rank, laps, status, gap, passes, passed, pit_stops)
                VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, 0)`)
      .run(lastInsertRowid, checkedAt, keyOf(session), rank, rank, lap, (rank * 1.3).toFixed(3), tick % 4, tick % 3);
  };
  // Three sessions, interleaved the way a backfill could leave them, plus a
  // session with only a few samples (tiny) and one that is never captured.
  for (let tick = 0; tick < 200; tick += 1) for (const session of [0, 1, 2]) addSample(db, session);
  for (let tick = 0; tick < 4; tick += 1) addSample(db, 3);
  db.close();
  await sleep(20);

  // 1. The same answer as queryReplay, frame by frame.
  const frames = [];
  for (const session of [0, 1, 2, 3, 4]) {
    for (const offset of [-1000, 0, 1000, 2500, 3000, 4000, 61_000, 199_000, 10_000_000]) frames.push([keyOf(session), iso(startOf(session) + offset)]);
    frames.push([keyOf(session), null]);
  }
  frames.push(['', iso(startOf(2) + 30_000)]);
  for (const [sessionKey, beforeCheckedAt] of frames) {
    const expected = queryReplay({ limit: 5, sessionKey, beforeCheckedAt });
    const answer = replayFrameSummary({ limit: 5, sessionKey, beforeCheckedAt });
    assert.deepEqual(withoutTime(answer), withoutTime(expected), `frame ${sessionKey || '(latest)'} at ${beforeCheckedAt}`);
  }
  const tiny = replayFrameSummary({ sessionKey: keyOf(3), beforeCheckedAt: null });
  assert.equal(tiny.archiveState, 'tiny');
  assert.equal(replayFrameSummary({ sessionKey: keyOf(4), beforeCheckedAt: null }).archiveState, 'empty');

  // 2. Frames of a session already read never open the archive. The two most
  // recently asked sessions are kept (the bound is 2 in this test).
  replayFrameSummary({ sessionKey: keyOf(0), beforeCheckedAt: null });
  replayFrameSummary({ sessionKey: keyOf(1), beforeCheckedAt: null });
  const heldFrames = locked(() =>
    Array.from({ length: 60 }, (_, second) => replayFrameSummary({ sessionKey: keyOf(second % 2), beforeCheckedAt: iso(startOf(second % 2) + second * 1000) }))
  );
  assert.ok(heldFrames.every((frame) => frame.available && frame.selectedCount === 200), 'a minute of frames for kept sessions, all answered without the archive');
  assert.equal(heldFrames[59].rows.at(-1).checkedAt, iso(startOf(1) + 59_000));
  const answered = heldFrames[0];
  answered.rows.length = 0;
  answered.sessions.length = 0;
  answered.count = -1;
  const again = replayFrameSummary({ sessionKey: keyOf(0), beforeCheckedAt: iso(startOf(0)) });
  assert.equal(again.count, 604, 'a caller changing its answer cannot change the next one');
  assert.equal(again.sessions.length, 4);
  assert.equal(again.rows.length, 1);
  const evicted = locked(() => replayFrameSummary({ sessionKey: keyOf(2), beforeCheckedAt: null }));
  assert.equal(evicted.available, false, 'a session not kept is read again (and here, cannot be)');

  // 3. A write is seen on the next frame, in either journal mode.
  await sleep(20);
  const rollback = new DatabaseSync(sqlitePath);
  addSample(rollback, 0);
  rollback.close();
  const afterWrite = replayFrameSummary({ sessionKey: keyOf(0), beforeCheckedAt: null });
  assert.equal(afterWrite.selectedCount, 201);
  assert.equal(afterWrite.count, 605);
  assert.equal(afterWrite.rows.at(-1).checkedAt, iso(startOf(0) + 200_000));
  const wal = new DatabaseSync(sqlitePath);
  wal.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
  await sleep(20);
  replayFrameSummary({ sessionKey: keyOf(0), beforeCheckedAt: null });
  await sleep(20);
  addSample(wal, 0);
  const afterWal = replayFrameSummary({ sessionKey: keyOf(0), beforeCheckedAt: null });
  assert.equal(afterWal.selectedCount, 202, 'a write that only reaches the WAL is seen on the next frame');
  assert.deepEqual(withoutTime(afterWal), withoutTime(queryReplay({ limit: 5, sessionKey: keyOf(0), beforeCheckedAt: null })));
  wal.close();
  await sleep(20);

  // 4. The race index: kept while the archive is unchanged, rebuilt after a write.
  let clock = Date.parse('2030-06-01T12:00:00.000Z');
  const overlay = createReplayOverlay({ enabled: true, sqlitePath, runnerStatusPath, now: () => clock });
  const index = overlay.available();
  assert.equal(index.sessions.length, 4);
  assert.equal(index.sessions.find((entry) => entry.sessionKey === keyOf(0)).watchable, true);
  clock += 10 * 60_000;
  const kept = locked(() => overlay.available());
  assert.equal(kept.error, undefined, 'past the TTL with the archive unchanged, the index is not rebuilt');
  assert.deepEqual(kept.sessions, index.sessions);
  assert.equal(kept.checkedAt, iso(clock));
  const grow = new DatabaseSync(sqlitePath);
  for (let tick = 0; tick < 130; tick += 1) addSample(grow, 5);
  grow.close();
  clock += 5_000;
  assert.equal(overlay.available().sessions.length, 5, 'the last build is past its TTL, so a write is picked up at once');
  const more = new DatabaseSync(sqlitePath);
  for (let tick = 0; tick < 130; tick += 1) addSample(more, 6);
  more.close();
  clock += 5_000;
  assert.equal(overlay.available().sessions.length, 5, 'inside the TTL a write waits, as before');
  clock += 30_000;
  assert.equal(overlay.available().sessions.length, 6, 'past the TTL it is picked up');
  clock += 30_000;
  const failed = locked(() => overlay.available());
  assert.ok(failed.error === undefined, 'unchanged archive: still the kept index');
  const touch = new DatabaseSync(sqlitePath);
  addSample(touch, 5);
  touch.close();
  clock += 30_000;
  const broken = locked(() => overlay.available());
  assert.ok(broken.error, 'a changed archive that cannot be read reports the error');
  clock += 10 * 60_000;
  assert.equal(overlay.available().error, undefined, 'a failed build is never kept past its TTL');

  console.log('Replay frame readiness: frames equal queryReplay, answered without rescanning, writes seen on the next frame; race index kept until the archive changes.');
} finally {
  try {
    chmodSync(sqlitePath, 0o644);
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
