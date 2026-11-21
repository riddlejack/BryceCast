import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// The readiness replay summary (queryReplay({ limit: 5 })) is a set of
// archive-wide scans on node:sqlite's synchronous driver; on the production
// archive it held the whole server for up to ~4.7 s per readiness call. The
// server now keeps it until the archive changes. This drives the real module
// against an invented archive: the summary is reused while the SQLite file and
// its WAL are unchanged, recomputed after a write in either journal mode, each
// caller gets its own copy, and a missing archive is answered, not thrown.

const dir = await mkdtemp(join(tmpdir(), 'brycecast-readiness-memo-'));
const sqlitePath = join(dir, 'archive.sqlite');
// sqlitePath is read when the module loads, so set it before importing.
process.env.BRYCECAST_SQLITE_PATH = sqlitePath;
const { readinessReplaySummary } = await import('./api-server.mjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const missing = readinessReplaySummary();
  assert.equal(missing.available, false, 'no archive yet: an unavailable summary, not an exception');

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
  let sample = 0;
  const addSample = (conn) => {
    sample += 1;
    const checkedAt = new Date(Date.UTC(2026, 8, 13, 18, 0, sample)).toISOString();
    const { lastInsertRowid } = conn
      .prepare(`INSERT INTO race_snapshots (checked_at, session_key, event_name, session_name, source_state, payload_json)
                VALUES (?, 'fixture-session', 'INDY NXT fixture', 'Race', 'live', '{}')`)
      .run(checkedAt);
    conn
      .prepare(`INSERT INTO bryce_samples (snapshot_id, checked_at, session_key, rank, laps, status)
                VALUES (?, ?, 'fixture-session', 4, ?, 'Active')`)
      .run(lastInsertRowid, checkedAt, String(sample));
  };
  for (let i = 0; i < 3; i += 1) addSample(db);
  db.close();
  await sleep(20);

  const first = readinessReplaySummary();
  assert.equal(first.available, true);
  assert.equal(first.count, 3);
  await sleep(20);
  const second = readinessReplaySummary();
  assert.equal(second.generatedAt, first.generatedAt, 'archive unchanged: the cached summary, not a new scan');
  assert.deepEqual(second, first);
  assert.notEqual(second, first, 'each caller gets its own copy');
  second.rows.length = 0;
  second.count = -1;
  assert.equal(readinessReplaySummary().count, 3, 'a caller changing its copy cannot change the next answer');

  // A write in the default (rollback) journal changes the main file.
  await sleep(20);
  const rollback = new DatabaseSync(sqlitePath);
  addSample(rollback);
  rollback.close();
  const afterWrite = readinessReplaySummary();
  assert.equal(afterWrite.count, 4, 'a write to the archive is seen on the next call');
  assert.notEqual(afterWrite.generatedAt, first.generatedAt);

  // In WAL mode (as the capture runner writes) a write lands in the -wal file
  // and the main file can stay as it was.
  const wal = new DatabaseSync(sqlitePath);
  wal.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
  await sleep(20);
  const beforeWal = readinessReplaySummary();
  assert.equal(beforeWal.count, 4);
  await sleep(20);
  addSample(wal);
  const afterWal = readinessReplaySummary();
  assert.equal(afterWal.count, 5, 'a write that only reaches the WAL is seen on the next call');
  await sleep(20);
  assert.equal(readinessReplaySummary().generatedAt, afterWal.generatedAt, 'and is cached again until the next write');
  wal.close();

  console.log('Readiness replay summary memo: cached while the archive and its WAL are unchanged, recomputed after a write.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
