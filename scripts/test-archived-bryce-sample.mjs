// The live path's newest-archived-Bryce stand-in must return what the old
// whole-archive query returned, at a cost bounded by recent rows rather than by
// the archive's size. On the 19 GB production archive, the old query took ~26 s
// per call, synchronously on the event loop.
//
// Checks, on synthetic archives (no source data):
//   1. Randomized archives: the reader matches the old query exactly. The cases
//      include sessions whose newest rows lack Bryce, LIKE matches that fail
//      validation (another series' heartbeat), and interleaved sessions.
//   2. Incremental: after appends, the result again matches the old query.
//      Appends without Bryce leave it unchanged, and a replaced archive file is
//      searched again from scratch.
//   3. Each call returns a fresh object, so a caller's mutation (archivedSnapshot
//      sorts timing rows in place) never reaches the next caller.
//   4. Cost: on a ~0.5 GB archive the first call is far cheaper than the old
//      query, and a repeat call far cheaper again.
import assert from 'node:assert/strict';
import { mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isBryceTimingRow } from './live-source-endpoints.mjs';
import { bryceLikeClause, createArchivedBryceSampleReader } from './lib/archived-bryce-sample.mjs';

const runtime = await mkdtemp(join(tmpdir(), 'brycecast-archived-bryce-'));
const schema = `CREATE TABLE race_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL, session_key TEXT NOT NULL,
  event_id TEXT, event_session_id TEXT, event_name TEXT, session_name TEXT, flag TEXT, lap TEXT,
  total_laps TEXT, source_state TEXT NOT NULL, bryce_rank INTEGER, bryce_status TEXT, bryce_laps TEXT,
  bryce_gap TEXT, bryce_best_lap_time TEXT, payload_json TEXT NOT NULL);
  CREATE INDEX idx_race_snapshots_session_checked ON race_snapshots(session_key, checked_at);`;

// kind: 'bryce' (valid INDY NXT row), 'other-series' (Bryce-like row under an
// INDYCAR heartbeat: matches the LIKE, fails validation), 'none' (no Bryce).
const payloadFor = (kind, tag, padding = 0) => {
  const bryce = { no: '9', DriverID: '', firstName: 'Bryce', lastName: 'Aron', rank: '4' };
  const others = Array.from({ length: 5 }, (_, i) => ({ no: String(20 + i), DriverID: String(3000 + i), firstName: `F${i}`, lastName: 'D', rank: String(i + 1) }));
  const heartbeat = { Series: kind === 'other-series' ? 'I' : 'L', eventName: `Event ${tag}` };
  const items = kind === 'none' ? others : [bryce, ...others];
  return JSON.stringify({ summary: { tag }, raw: { tag, timing: { timing_results: { heartbeat, Item: items } }, pad: 'x'.repeat(padding) } });
};

const openArchive = (path) => {
  const db = new DatabaseSync(path);
  db.exec(schema);
  return db;
};
const insert = (db, checkedAt, sessionKey, kind, tag, padding) =>
  db.prepare(`INSERT INTO race_snapshots (checked_at, session_key, source_state, payload_json) VALUES (?, ?, 'live', ?)`).run(checkedAt, sessionKey, payloadFor(kind, tag, padding));

// The previous implementation, verbatim, as the oracle.
const oldQuery = (path) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare(`SELECT checked_at, payload_json FROM race_snapshots WHERE ${bryceLikeClause} ORDER BY checked_at DESC LIMIT 500`).all();
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json);
      const timing = payload.raw?.timing?.timing_results;
      const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
      if (timingRows.some((item) => isBryceTimingRow(item, timing?.heartbeat))) {
        return { raw: payload.raw ?? null, checkedAt: row.checked_at ?? payload.summary?.checkedAt ?? null };
      }
    }
    return null;
  } finally {
    db.close();
  }
};

// Deterministic PRNG so a failure reproduces.
let seed = 20261115;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (list) => list[Math.floor(random() * list.length)];
const base = Date.parse('2026-01-01T00:00:00.000Z');

try {
  // 1 + 2. Randomized archives and appends.
  for (let trial = 0; trial < 60; trial += 1) {
    const path = join(runtime, `trial-${trial}.sqlite`);
    const db = openArchive(path);
    const sessions = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, i) => `s${trial}_${i}`);
    let tick = 0;
    const append = (count) => {
      for (let i = 0; i < count; i += 1) {
        // Times mostly increase, with jitter so sessions interleave and ids and
        // checked_at sometimes disagree.
        tick += 1 + Math.floor(random() * 5);
        const at = new Date(base + (tick - Math.floor(random() * 40)) * 1000).toISOString();
        insert(db, at, pick(sessions), pick(['bryce', 'bryce', 'none', 'none', 'other-series']), `${trial}-${tick}`);
      }
    };
    append(Math.floor(random() * 120));
    const reader = createArchivedBryceSampleReader({ sqlitePath: path });
    assert.deepEqual(reader.read(), oldQuery(path), `trial ${trial}: first read matches the old query`);
    for (let round = 0; round < 3; round += 1) {
      append(Math.floor(random() * 15));
      assert.deepEqual(reader.read(), oldQuery(path), `trial ${trial} round ${round}: incremental read matches the old query`);
    }
    const before = reader.read();
    for (let i = 0; i < 5; i += 1) insert(db, new Date(base + (tick + 100 + i) * 1000).toISOString(), sessions[0], 'none', `none-${i}`);
    assert.deepEqual(reader.read(), before, `trial ${trial}: appends without Bryce leave the sample unchanged`);
    assert.deepEqual(reader.read(), oldQuery(path));
    db.close();

    if (trial === 0) {
      // A replaced archive (new inode) is searched from scratch, even if its
      // maximum id is the same or higher.
      const replacement = join(runtime, 'replacement.sqlite');
      const other = openArchive(replacement);
      for (let i = 0; i < 200; i += 1) insert(other, new Date(base + i * 1000).toISOString(), 'replacement', i % 2 ? 'bryce' : 'none', `r-${i}`);
      other.close();
      await rename(replacement, path);
      assert.deepEqual(reader.read(), oldQuery(path), 'a replaced archive file is searched again');
      assert.match(reader.read().raw.tag, /^r-/);
    }
  }

  // 3. Fresh objects per call.
  {
    const path = join(runtime, 'mutation.sqlite');
    const db = openArchive(path);
    insert(db, '2026-05-01T00:00:00.000Z', 'race', 'bryce', 'mutation');
    db.close();
    const reader = createArchivedBryceSampleReader({ sqlitePath: path });
    const first = reader.read();
    first.raw.timing.timing_results.Item.reverse();
    first.raw.tag = 'mutated';
    assert.equal(reader.read().raw.tag, 'mutation', 'a caller mutation does not leak into the next read');
    assert.equal(reader.read().raw.timing.timing_results.Item[0].lastName, 'Aron');
  }

  // A missing archive is null, as before.
  assert.equal(createArchivedBryceSampleReader({ sqlitePath: join(runtime, 'absent.sqlite') }).read(), null);

  // 4. Cost on a ~0.5 GB archive. Sessions run in time order, and the newest one
  // carries no Bryce row (a live session on another series, the case that
  // reaches this fallback live).
  {
    const path = join(runtime, 'large.sqlite');
    const db = openArchive(path);
    db.exec('BEGIN');
    let at = base;
    for (let session = 0; session < 12; session += 1) {
      const kind = session === 11 ? 'none' : 'bryce';
      for (let i = 0; i < 900; i += 1) insert(db, new Date((at += 1000)).toISOString(), `race_${session}`, kind, `${session}-${i}`, 45_000);
    }
    db.exec('COMMIT');
    db.close();
    const time = (fn) => {
      const started = performance.now();
      const value = fn();
      return { value, ms: performance.now() - started };
    };
    const old = time(() => oldQuery(path));
    const reader = createArchivedBryceSampleReader({ sqlitePath: path });
    const first = time(() => reader.read());
    const repeat = time(() => reader.read());
    assert.deepEqual(first.value, old.value, 'the large archive answer matches the old query');
    assert.deepEqual(repeat.value, old.value);
    console.log(`archived-bryce-sample: old query ${old.ms.toFixed(0)} ms; first read ${first.ms.toFixed(0)} ms; repeat ${repeat.ms.toFixed(1)} ms`);
    assert.ok(first.ms < old.ms / 2, `the first read (${first.ms.toFixed(0)} ms) should cost far less than the whole-archive query (${old.ms.toFixed(0)} ms)`);
    assert.ok(repeat.ms < old.ms / 20, `a repeat read (${repeat.ms.toFixed(1)} ms) should be nearly free next to the old query (${old.ms.toFixed(0)} ms)`);
  }
  console.log('archived-bryce-sample: ok');
} finally {
  await rm(runtime, { recursive: true, force: true });
}
