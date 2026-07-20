#!/usr/bin/env node
/**
 * Offline acceptance-gate suite for Live Archive V2 (Part 1 of task #35).
 *
 * Builds a representative legacy archive — a COPY of a two-session capture in a
 * temp dir, exactly as the live writer serializes it (`payload_json =
 * JSON.stringify({ summary, raw })`, raw = timing + four enrichment payloads) —
 * with the redundancy profile the plan's audit measured (enrichments constant,
 * timing changing every second, plus rare DNF/flag/comment/pit transitions and a
 * session boundary). It then migrates that copy to a V2 content-addressed sidecar
 * and runs the plan's offline-runnable acceptance gates.
 *
 * This NEVER touches the live runtime; everything lives under a mkdtemp dir that
 * is removed on exit.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  DEFAULT_RETENTION_POLICY,
  createLegacySchema,
  detectArchiveFormat,
  extractSessionToLegacyDb,
  migrateLegacyToV2,
  planRetention,
  reconstructPayloadJson
} from './lib/archive-v2.mjs';
import { openArchive } from './lib/archive-reader.mjs';
import { runAcceptanceGates } from './lib/archive-v2-gates.mjs';

const workdir = mkdtempSync(join(tmpdir(), 'brycecast-archive-v2-'));
let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

// ---------------------------------------------------------------------------
// Build a representative legacy fixture.
// ---------------------------------------------------------------------------

const pad = (label, size) => `${label}:${'x'.repeat(Math.max(0, size - label.length - 1))}`;

// Enrichment payloads: large and CONSTANT across the session (the 94%-redundant
// bytes the audit found). Two distinct roster versions overall so dedup is real
// but not trivial.
const driversV1 = { drivers: { driver: Array.from({ length: 24 }, (_, i) => ({ driverid: String(2000 + i), firstname: `Driver${i}`, lastname: `Last${i}`, radiofrequency: `45${i}.7000`, note: pad(`roster-a-${i}`, 120) })) } };
const configPayload = { track_map_url: 'https://example.test/map.svg', networks: [], config_blob: pad('config', 2600) };
const schedulePayload = { schedule: { race: Array.from({ length: 14 }, (_, i) => ({ eventid: String(5500 + i), name: `Round ${i + 1}`, blob: pad(`sched-${i}`, 150) })) } };
const trackActivityPayload = { trackactivity: { event: [{ eventid: '5541', eventname: 'INDY NXT test', blob: pad('activity', 2400) }] } };

const heartbeatFor = ({ eventSessionId, sessionName, flag, lap, totalLaps }) => ({
  eventName: 'INDY NXT test event',
  EventID: '5541',
  EventSessionID: eventSessionId,
  SessionName: sessionName,
  SessionType: sessionName.startsWith('Race') ? 'R' : 'P',
  Series: 'L',
  currentFlag: flag,
  lapNumber: String(lap),
  totalLaps: String(totalLaps),
  trackName: 'Test Speedway',
  trackType: 'RC'
});

const timingPayloadFor = ({ heartbeat, rank, status, gap, laps, comment, pitStops, tick }) => ({
  timing_results: {
    heartbeat,
    Item: [
      { no: '14', DriverID: '3000', firstName: 'Alpha', lastName: 'Leader', rank: '1', liveRank: '1', laps: String(laps), status: 'Active', gap: '0' },
      {
        no: '9',
        DriverID: '2143',
        firstName: 'Bryce',
        lastName: 'Aron',
        team: 'Chip Ganassi Racing',
        rank: String(rank),
        liveRank: String(rank),
        startPosition: '8',
        status,
        comment: comment ?? '',
        gap,
        laps: String(laps),
        pitStops: String(pitStops),
        bestLapTime: '1:58.100',
        lastLapTime: `1:5${tick % 9}.${(tick * 7) % 900}`, // varies every tick → unique timing payloads
        runningDriverPoints: '159',
        totalDriverPoints: '0',
        totalEntrantPoints: '159'
      }
    ]
  }
});

const summaryFor = ({ heartbeat, checkedAt, sessionKey, rank, status, gap, laps, comment, pitStops, sourceState }) => ({
  schemaVersion: 1,
  checkedAt,
  sessionKey,
  eventId: heartbeat.EventID,
  eventSessionId: heartbeat.EventSessionID,
  eventName: heartbeat.eventName,
  trackName: heartbeat.trackName,
  sessionName: heartbeat.SessionName,
  flag: heartbeat.currentFlag,
  lap: heartbeat.lapNumber,
  totalLaps: heartbeat.totalLaps,
  sourceState,
  bryce: {
    no: '9',
    rank,
    laps: String(laps),
    status,
    comment: comment ?? '',
    gap,
    bestLapTime: '1:58.100',
    pitStops,
    runningDriverPoints: 159
  },
  endpoints: [
    { id: 'timing', ok: true, bytes: 300 },
    { id: 'drivers_nxt', ok: true, bytes: 2600 },
    { id: 'config', ok: true, bytes: 2600 },
    { id: 'schedule_nxt', ok: true, bytes: 2100 },
    { id: 'trackactivity_nxt', ok: true, bytes: 2400 }
  ]
});

const legacyPath = join(workdir, 'legacy.sqlite');
const legacyDb = new DatabaseSync(legacyPath);
createLegacySchema(legacyDb);

const insertSnapshot = legacyDb.prepare(`
  INSERT INTO race_snapshots (checked_at, session_key, event_id, event_session_id, event_name, session_name,
    flag, lap, total_laps, source_state, bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertBryce = legacyDb.prepare(`
  INSERT INTO bryce_samples (snapshot_id, checked_at, session_key, rank, status, gap, laps)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertProbe = legacyDb.prepare(`
  INSERT INTO source_probes (snapshot_id, endpoint_id, url, ok, status, bytes, last_modified, etag, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const baseMs = Date.parse('2026-08-07T18:00:00.000Z');
let tick = 0;
let insertedRareTransitions = 0;

const writeSnapshot = ({ session, eventSessionId, sessionName, rank, status, gap, laps, flag, totalLaps, comment, pitStops, sourceState, repeatTimingOf = null, nullEnrichment = false }) => {
  const checkedAt = new Date(baseMs + tick * 1000).toISOString();
  const heartbeat = heartbeatFor({ eventSessionId, sessionName, flag, lap: laps, totalLaps });
  const sessionKey = `5541-${eventSessionId}`;
  const timing = repeatTimingOf ?? timingPayloadFor({ heartbeat, rank, status, gap, laps, comment, pitStops, tick });
  const raw = {
    timing,
    drivers_nxt: driversV1,
    config: nullEnrichment ? null : configPayload,
    schedule_nxt: schedulePayload,
    trackactivity_nxt: trackActivityPayload
  };
  const summary = summaryFor({ heartbeat, checkedAt, sessionKey, rank, status, gap, laps, comment, pitStops, sourceState });
  const payloadJson = JSON.stringify({ summary, raw });
  const res = insertSnapshot.run(
    checkedAt, sessionKey, '5541', eventSessionId, heartbeat.eventName, sessionName,
    flag, String(laps), String(totalLaps), sourceState, rank, status, String(laps), gap, '1:58.100', payloadJson
  );
  const snapshotId = Number(res.lastInsertRowid);
  insertBryce.run(snapshotId, checkedAt, sessionKey, rank, status, gap, String(laps));
  for (const endpoint of summary.endpoints) {
    insertProbe.run(snapshotId, endpoint.id, `https://example.test/${endpoint.id}`, 1, 200, endpoint.bytes, null, null, `${endpoint.bytes} bytes`);
  }
  tick += 1;
  return { snapshotId, timing };
};

// Session 1: Practice (a session boundary precedes the Race). 40 snapshots.
for (let i = 0; i < 40; i += 1) {
  writeSnapshot({ session: 1, eventSessionId: '6801', sessionName: 'Practice 1', rank: 5, status: 'Active', gap: '3.1', laps: i, flag: 'GREEN', totalLaps: 0, pitStops: 0, sourceState: 'live' });
}

// Session 2: Race. 560 snapshots with rare transitions woven in.
let firstGreenTiming = null;
for (let lap = 0, i = 0; i < 560; i += 1) {
  if (i % 28 === 0 && lap < 20) lap += 1;
  let flag = 'GREEN';
  let status = 'Active';
  let comment = '';
  let pitStops = 0;
  let rank = 6;
  let gap = '8.1';
  let sourceState = 'live';
  let repeatTimingOf = null;
  let nullEnrichment = false;

  if (i >= 120 && i < 140) { flag = 'YELLOW'; comment = 'Caution — debris'; } // flag transition window
  if (i === 300) { status = 'In Pit'; pitStops = 1; comment = 'Pit stop'; } // pit transition
  if (i > 300 && i < 320) pitStops = 1;
  if (i === 500) { status = 'DNF'; comment = 'Mechanical'; sourceState = 'cold'; rank = 20; } // DNF/mechanical
  if (i > 500) { status = 'DNF'; sourceState = 'cold'; rank = 20; }
  if (i === 45) nullEnrichment = true; // a failed enrichment fetch (payload null)
  // Two exact-repeat timing responses (upstream didn't update within the second).
  if (i === 200 && firstGreenTiming) repeatTimingOf = firstGreenTiming;

  const written = writeSnapshot({
    session: 2, eventSessionId: '6802', sessionName: 'Race', rank, status, gap, laps: lap,
    flag, totalLaps: 20, comment, pitStops, sourceState, repeatTimingOf, nullEnrichment
  });
  if (i === 10) firstGreenTiming = written.timing;
  if ([120, 300, 500].includes(i)) insertedRareTransitions += 1;
}
legacyDb.close();

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

console.log('archive-v2 offline acceptance gates');

// Migrate the copy → V2 sidecar.
const v2Path = join(workdir, 'sidecar-v2.sqlite');
const srcDb = new DatabaseSync(legacyPath, { readOnly: true });
const sideDb = new DatabaseSync(v2Path);
const stats = migrateLegacyToV2({ sourceDb: srcDb, sidecarDb: sideDb });
srcDb.close();
sideDb.close();

check('migration reports snapshot/version stats', () => {
  assert.equal(stats.snapshots, 600, 'all 600 snapshots migrated');
  assert.ok(stats.distinctVersions > 0, 'produced distinct payload versions');
  // Enrichments constant → drivers/schedule/trackactivity dedup to ~1 version
  // each (config gets a 2nd for the null fetch). Timing is per-second unique.
  assert.ok(stats.perEndpoint.drivers_nxt.versions <= 2, `drivers_nxt deduped hard (${stats.perEndpoint.drivers_nxt.versions})`);
  assert.ok(stats.perEndpoint.trackactivity_nxt.versions === 1, 'trackactivity_nxt deduped to one version');
  assert.equal(stats.perEndpoint.config.versions, 2, 'config has payload + null versions');
});

const gates = runAcceptanceGates({ legacyPath, v2Path });
for (const gate of gates.gates) console.log(`    [${gate.pass ? 'PASS' : 'FAIL'}] ${gate.name} — ${gate.detail}`);

check('all offline acceptance gates pass', () => {
  assert.ok(gates.pass, 'every gate passes');
});
check('timestamp-survival gate: every legacy timestamp represented', () => {
  const g = gates.gates.find((x) => x.name === 'timestamp-survival');
  assert.equal(g.metrics.legacyCount, 600);
  assert.equal(g.metrics.v2Count, 600);
  assert.equal(g.metrics.missingTs, 0);
});
check('contract-equivalence gate: byte-identical for all 600 snapshots', () => {
  const g = gates.gates.find((x) => x.name === 'contract-equivalence');
  assert.equal(g.metrics.compared, 600);
  assert.equal(g.metrics.byteMismatch, 0);
});
check('event-survival gate: rare transitions survive identically', () => {
  const g = gates.gates.find((x) => x.name === 'event-survival');
  assert.equal(g.metrics.transitionMissing, 0);
  assert.ok(g.metrics.transitionRows >= insertedRareTransitions + 2, 'transition set includes flag/pit/DNF + the session boundary');
});
check('compression-ratio gate: V2 embedded ≤ 15% of legacy', () => {
  const g = gates.gates.find((x) => x.name === 'compression-ratio');
  assert.ok(g.metrics.ratio <= 0.15, `ratio ${g.metrics.ratio} must be ≤ 0.15`);
  assert.ok(g.metrics.ratio > 0, 'ratio measured');
});

// Reader abstraction: hydrates the SAME {summary, raw} from both formats.
check('backward-compatible reader hydrates legacy AND v2 identically', () => {
  const legacyReader = openArchive(legacyPath);
  const v2Reader = openArchive(v2Path);
  try {
    assert.equal(legacyReader.format, 'legacy');
    assert.equal(v2Reader.format, 'v2');
    const ids = legacyReader.allSnapshotIds();
    assert.equal(ids.length, 600);
    for (const id of ids) {
      const a = legacyReader.hydrateById(id);
      const b = v2Reader.hydrateById(id);
      assert.deepEqual(b.summary, a.summary, `summary equal for id ${id}`);
      assert.deepEqual(b.raw, a.raw, `raw equal for id ${id}`);
      assert.equal(b.sessionKey, a.sessionKey);
      assert.equal(b.archiveCheckedAt, a.archiveCheckedAt);
    }
    // Replay resolve path: latest-at-timestamp is equivalent across formats.
    const sessions = v2Reader.listSessions();
    for (const s of sessions) {
      const at = s.lastCheckedAt;
      const la = legacyReader.hydrateAt(s.sessionKey, at);
      const vb = v2Reader.hydrateAt(s.sessionKey, at);
      assert.deepEqual(vb.raw, la.raw, `hydrateAt raw equal for ${s.sessionKey}`);
      assert.deepEqual(vb.summary, la.summary, `hydrateAt summary equal for ${s.sessionKey}`);
    }
  } finally {
    legacyReader.close();
    v2Reader.close();
  }
});

// Old archives still read: a legacy DB opened by the new reader is unaffected.
check('old archives still read through the new reader', () => {
  const reader = openArchive(legacyPath);
  try {
    const snap = reader.hydrateById(1);
    assert.ok(snap.summary && snap.raw, 'legacy snapshot hydrates');
    assert.ok(snap.raw.drivers_nxt?.drivers, 'legacy raw carries enrichment payloads');
  } finally {
    reader.close();
  }
});

// Idempotency (proxy for the recovery gate's "no duplicate ownership"): a second
// migration to a fresh sidecar reconstructs byte-identically to the first.
check('migration is idempotent — a second sidecar reconstructs identically', () => {
  const v2Path2 = join(workdir, 'sidecar-v2-b.sqlite');
  const s = new DatabaseSync(legacyPath, { readOnly: true });
  const d = new DatabaseSync(v2Path2);
  const stats2 = migrateLegacyToV2({ sourceDb: s, sidecarDb: d });
  s.close();
  d.close();
  assert.equal(stats2.distinctVersions, stats.distinctVersions, 'same distinct-version count');
  const a = new DatabaseSync(v2Path, { readOnly: true });
  const b = new DatabaseSync(v2Path2, { readOnly: true });
  try {
    for (let id = 1; id <= 600; id += 1) {
      assert.equal(reconstructPayloadJson(b, id), reconstructPayloadJson(a, id), `id ${id} reconstructs identically`);
    }
  } finally {
    a.close();
    b.close();
  }
});

// Session extraction → migrate the extracted single-session copy (the plan's
// "extract a session to /tmp" flow), gates pass on the slice.
check('extractSessionToLegacyDb produces a migratable single-session copy', () => {
  const extractPath = join(workdir, 'race-only.sqlite');
  const s = new DatabaseSync(legacyPath, { readOnly: true });
  const d = new DatabaseSync(extractPath);
  const { copied } = extractSessionToLegacyDb({ sourceDb: s, destDb: d, sessionKey: '5541-6802' });
  s.close();
  d.close();
  assert.equal(copied, 560, 'race session extracted');
  assert.equal(detectArchiveFormat(new DatabaseSync(extractPath, { readOnly: true })).format, 'legacy');

  const slicePath = join(workdir, 'race-only-v2.sqlite');
  const s2 = new DatabaseSync(extractPath, { readOnly: true });
  const d2 = new DatabaseSync(slicePath);
  migrateLegacyToV2({ sourceDb: s2, sidecarDb: d2 });
  s2.close();
  d2.close();
  const sliceGates = runAcceptanceGates({ legacyPath: extractPath, v2Path: slicePath });
  assert.ok(sliceGates.pass, 'gates pass on the extracted single-session slice');
});

// Retention policy is inert: the planner never deletes and reports activated:false.
check('retention planner is inert (config only, no deletion)', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => ({
    sessionKey: `s-${i}`,
    firstCheckedAt: new Date(baseMs - (i + 1) * 86400000).toISOString(),
    lastCheckedAt: new Date(baseMs - i * 86400000 + 3600000).toISOString()
  }));
  const plan = planRetention(sessions, DEFAULT_RETENTION_POLICY, baseMs + 60 * 86400000);
  assert.equal(plan.activated, false, 'plan is never activated');
  assert.equal(plan.hotSessions.length, DEFAULT_RETENTION_POLICY.hotSessionCount);
  assert.ok(plan.compactCandidates.length + plan.withheldTooYoung.length === sessions.length - DEFAULT_RETENTION_POLICY.hotSessionCount);
  assert.equal(DEFAULT_RETENTION_POLICY.guardrails.neverMutateLiveArchive, true);
});

rmSync(workdir, { recursive: true, force: true });
console.log(`\narchive-v2: ${passed} checks passed`);
