import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { buildSummary, snapshotDedupKey, writeStorage } from './lib/race-poller-core.mjs';
import { createLiveRunner } from './lib/live-runner-core.mjs';
import { createReplayOverlay } from './lib/replay-overlay.mjs';

// BryceCast S-tier runner hardening — snapshot dedup archive equivalence.
//
// The live runner, during LIVE, records every poll for cadence/heartbeat
// continuity but does NOT re-store the duplicate raw bytes when the upstream
// timing blob returns a byte-identical payload (an ETag/Last-Modified/content-hash
// marker row stands in its place). This test proves the load-bearing property:
//
//   the archive readers (rank-series live + replay, and the replay overlay) emit
//   BYTE-IDENTICAL output for a deduped archive and a full one.
//
// The risk it guards is real: the rank-series gap detector marks a break when
// consecutive stored snapshots fall more than a cadence multiple apart, so a
// NAIVE drop-duplicates dedup would turn every long position hold into a false
// archive gap and fragment the line. The sequence below deliberately holds a
// position for ~10s before a breakpoint, which a naive dedup fails and the
// cadence-preserving marker design passes.

const START_MS = Date.parse('2026-07-04T17:00:00.000Z');
const at = (index) => new Date(START_MS + index * 1000).toISOString();

const SESSION = '7001-6900';
const EVENT_ID = '7001';
const EVENT_SESSION_ID = '6900';

const CARS = [
  { no: '14', driverId: '3000', first: 'Alessandro', last: 'de Tullio', team: 'AJ Foyt Racing' },
  { no: '2', driverId: '3001', first: 'Nolan', last: 'Siegel', team: 'HMD' },
  { no: '5', driverId: '3002', first: 'Caio', last: 'Collet', team: 'HMD' },
  { no: '9', driverId: '2143', first: 'Bryce', last: 'Aron', team: 'Chip Ganassi Racing' },
  { no: '3', driverId: '3003', first: 'Salvador', last: 'de Alba', team: 'HMD' },
  { no: '76', driverId: '3004', first: 'Josh', last: 'Pierson', team: 'HMD' }
];
const byNo = Object.fromEntries(CARS.map((car) => [car.no, car]));

// A rich session (150 polls, so the archive clears the >=120-sample watchable
// gate for replay): a long hold, a rank change, a long hold, a caution flag
// change, a hold, a long source-degradation gap (empty timing rows), a resume
// with a new order, a hold, then cold.
const LAST_INDEX = 149;
const orderAt = (index) => {
  if (index < 60) return ['14', '2', '5', '9', '3', '76']; // Bryce P4
  if (index < 140) return ['14', '2', '9', '5', '3', '76']; // Bryce P3
  return ['14', '9', '2', '5', '3', '76']; // Bryce P2 (post-gap)
};
const flagAt = (index) => {
  if (index >= 149) return 'COLD';
  if (index >= 110 && index < 115) return 'YELLOW';
  return 'GREEN';
};
const lapAt = (index) => String(5 + Math.floor(index / 20));
const isDegraded = (index) => index >= 125 && index < 140; // 15s outage > 5s gap threshold

const timingRowsFor = (index) => {
  const order = orderAt(index);
  return order.map((no, position) => {
    const car = byNo[no];
    const rank = String(position + 1);
    const gap = position === 0 ? '0' : (position * 1.4).toFixed(1);
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
      liveGap: '1.4',
      diff: gap,
      laps: lapAt(index),
      bestLapTime: '1:58.100',
      lastLapTime: '1:59.000',
      runningDriverPoints: '150',
      totalDriverPoints: '0',
      totalEntrantPoints: '150'
    };
  });
};

const heartbeatFor = (index) => ({
  eventName: 'INDY NXT at Mid-Ohio',
  EventID: EVENT_ID,
  EventSessionID: EVENT_SESSION_ID,
  SessionName: 'Race',
  SessionType: 'R',
  SessionStatus: flagAt(index),
  Series: 'L',
  currentFlag: flagAt(index),
  lapNumber: lapAt(index),
  totalLaps: '35',
  trackName: 'Mid-Ohio',
  trackType: 'RC'
});

// The endpoint result set for one poll. `keyMode` selects which validators the
// upstream presents so both the ETag path and the content-hash fallback are
// exercised. Identical successive polls carry an identical ETag (Azure BlockBlob
// behaviour, verified by probe) so the dedup key matches byte-for-byte.
const resultsFor = (index, { keyMode = 'etag' } = {}) => {
  const heartbeat = heartbeatFor(index);
  const Item = isDegraded(index) ? [] : timingRowsFor(index);
  const timingPayload = { timing_results: { heartbeat, Item } };
  const bytes = Buffer.byteLength(JSON.stringify(timingPayload));
  // A content signature that is stable iff the timing bytes are stable.
  const contentSig = `${orderAt(index).join('')}|${flagAt(index)}|${lapAt(index)}|${isDegraded(index) ? 'deg' : 'ok'}`;
  const etag = keyMode === 'etag' ? `0xETAG-${contentSig}` : null;
  const lastModified = keyMode === 'lastmod' ? `lm-${contentSig}` : null;
  const base = (id, label, payload) => ({
    id,
    label,
    series: 'indy_nxt',
    cadence: 'fast',
    role: 'test',
    proxyPath: `/racecontrol/${id}.json`,
    url: `https://example.test/${id}.json`,
    ok: true,
    status: 200,
    contentType: 'application/json',
    lastModified: null,
    etag: null,
    bytes: Buffer.byteLength(JSON.stringify(payload)),
    fetchedAt: at(index),
    payload,
    error: null
  });
  return [
    { ...base('timing', 'Timing', timingPayload), etag, lastModified, bytes },
    base('drivers_nxt', 'Drivers', { drivers: { driver: [{ driverid: '2143', firstname: 'Bryce', lastname: 'Aron', radiofrequency: '452.7000' }] } }),
    base('config', 'Config', { track_map_url: '' }),
    base('schedule_nxt', 'Schedule', {}),
    base('trackactivity_nxt', 'Track activity', {})
  ];
};

// Build one archive under `root`. `dedup=false` stores every poll in full;
// `dedup=true` replicates the runner's LIVE dedup decision (dedupable frame +
// matching key against the last full snapshot in the same session → marker row).
// Both use the SAME scripted checked_at, so the two archives are directly
// comparable. Returns row-shape counts.
const buildArchive = async (root, { dedup, keyMode }) => {
  let prev = null; // { key, snapshotId }
  let markerCount = 0;
  let fullCount = 0;
  for (let index = 0; index <= LAST_INDEX; index += 1) {
    const results = resultsFor(index, { keyMode });
    const timingResult = results.find((result) => result.id === 'timing');
    const summary = buildSummary(results, { root });
    summary.checkedAt = at(index); // deterministic archive clock

    const timing = timingResult.payload.timing_results;
    const dedupable = Boolean(timing.heartbeat && Array.isArray(timing.Item) && timing.Item.length > 0);
    const key = dedupable ? snapshotDedupKey(timingResult) : null;
    const deduped = dedup && dedupable && prev && prev.key === key;

    const { snapshotId } = await writeStorage(summary, results, {
      root,
      dedup: deduped ? { ofSnapshotId: prev.snapshotId, key } : null
    });

    if (deduped) markerCount += 1;
    else fullCount += 1;

    if (!dedupable || !key) prev = null;
    else if (deduped) prev = { key, snapshotId: prev.snapshotId };
    else prev = { key, snapshotId };
  }
  return { markerCount, fullCount, total: markerCount + fullCount };
};

const markerRowCount = (sqlitePath) => {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM race_snapshots WHERE payload_json LIKE '%\"dedup\"%'").get()?.n ?? 0);
  } finally {
    db.close();
  }
};

const startApiServer = async (sqlitePath, runnerStatusPath, port) => {
  const child = spawn(process.execPath, ['scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      BRYCECAST_REPLAY: '1',
      BRYCECAST_SQLITE_PATH: sqlitePath,
      BRYCECAST_RUNNER_STATUS_PATH: runnerStatusPath,
      BRYCECAST_REPLAY_GUARD_TTL_MS: '200'
    }
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const json = await response.json();
      if (json?.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { child, baseUrl, stderrRef: () => stderr };
};

const fetchJson = async (baseUrl, path) => {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
};

// Strip the only wall-clock, archive-content-independent fields so "byte
// identical" compares what the archive actually determines.
const normalizeRankSeries = (payload) => {
  const clone = JSON.parse(JSON.stringify(payload));
  delete clone.checkedAt;
  if (clone.cache) delete clone.cache.refreshedAt;
  return JSON.stringify(clone);
};

// A replay-overlay summary is a blob stored once, when its snapshot was written.
// A deduped poll resolves to the FULL snapshot it references, so its summary
// inherits the baseline's clock stamps (checkedAt / fetchedAt / derived ages) —
// while the presented record (archiveCheckedAt, recomputed checkedAt) and the
// load-bearing `raw` payload are byte-identical to the full archive. Normalizing
// out those stamps proves the race CONTENT of the summary is identical too.
const normalizeSummary = (summary) => {
  const clone = JSON.parse(JSON.stringify(summary ?? null));
  if (clone && typeof clone === 'object') {
    delete clone.checkedAt;
    for (const endpoint of clone.endpoints ?? []) {
      delete endpoint.fetchedAt;
      delete endpoint.checkedAgeSeconds;
      delete endpoint.modifiedAgeSeconds;
      delete endpoint.freshnessLabel;
    }
  }
  return JSON.stringify(clone);
};

const temp = await mkdtemp(join(tmpdir(), 'brycecast-dedup-equiv-'));
try {
  // ---------------------------------------------------------------------------
  // Part A — the runner actually dedups (ETag + content-hash paths), skips the
  // duplicate raw capture, and honours the env kill switch. Driven end to end
  // through createLiveRunner over a frozen live INDY NXT payload.
  // ---------------------------------------------------------------------------
  const driveFrozenRunner = async ({ keyMode, snapshotDedup, envKill }) => {
    const root = await mkdtemp(join(tmpdir(), 'brycecast-dedup-runner-'));
    let nowMs = Date.parse('2026-07-04T16:15:00.000Z');
    const frozen = resultsFor(5, { keyMode }); // a single stable live payload, reused every tick
    const fetchEndpoint = async (endpoint) => {
      const match = frozen.find((result) => result.id === endpoint.id);
      return match ? { ...match, fetchedAt: new Date(nowMs).toISOString() } : { ...endpoint, ok: false, status: 0, bytes: 0, payload: null, etag: null, lastModified: null, fetchedAt: new Date(nowMs).toISOString(), error: 'unexpected' };
    };
    const priorEnv = process.env.BRYCECAST_SNAPSHOT_DEDUP;
    if (envKill) process.env.BRYCECAST_SNAPSHOT_DEDUP = '0';
    else delete process.env.BRYCECAST_SNAPSHOT_DEDUP;
    try {
      const runner = createLiveRunner({
        root,
        fetchEndpoint,
        ...(snapshotDedup === undefined ? {} : { snapshotDedup }),
        processBudgetProvider: async () => ({ checkedAt: new Date(nowMs).toISOString(), effectiveProcessLimit: 1000, userProcessCount: 100, spareProcessSlots: 900, critical: false }),
        nowMs: () => nowMs,
        sleep: async (ms) => {
          nowMs += Math.min(ms, 1000);
        },
        pid: 5252,
        idlePollMs: 1,
        armedPollMs: 1,
        livePollMs: 1,
        enrichmentPollMs: 1,
        raw: true
      });
      const status = await runner.run({ maxIterations: 6 });
      const sqlitePath = join(root, 'data/live/brycecast.sqlite');
      const markers = markerRowCount(sqlitePath);
      return { status, markers };
    } finally {
      if (priorEnv === undefined) delete process.env.BRYCECAST_SNAPSHOT_DEDUP;
      else process.env.BRYCECAST_SNAPSHOT_DEDUP = priorEnv;
      await rm(root, { recursive: true, force: true });
    }
  };

  // ETag path, dedup ON (default).
  {
    const { status, markers } = await driveFrozenRunner({ keyMode: 'etag', snapshotDedup: true });
    assert.equal(status.phase, 'LIVE', 'frozen live NXT payload keeps the runner LIVE');
    assert.equal(status.rowCounts.snapshots, 6, 'a row is recorded for every poll (cadence continuity)');
    assert.equal(status.rowCounts.dedupedSnapshots, 5, 'ETag dedup: only the LIVE-entry snapshot is full; the 5 holds are markers');
    assert.equal(status.rowCounts.rawTimingPayloads, 1, 'the duplicate raw timing capture is skipped on deduped polls');
    assert.equal(markers, 5, 'the sqlite carries exactly the marker rows');
  }
  // Content-hash fallback path (no ETag, no Last-Modified), dedup ON.
  {
    const { status, markers } = await driveFrozenRunner({ keyMode: 'none', snapshotDedup: true });
    assert.equal(status.rowCounts.dedupedSnapshots, 5, 'content-hash fallback dedups when the upstream sends no validators');
    assert.equal(markers, 5, 'content-hash fallback writes marker rows');
  }
  // Kill switch via explicit option.
  {
    const { status, markers } = await driveFrozenRunner({ keyMode: 'etag', snapshotDedup: false });
    assert.equal(status.rowCounts.dedupedSnapshots, 0, 'snapshotDedup:false disables dedup');
    assert.equal(status.rowCounts.rawTimingPayloads, 6, 'with dedup off every poll writes its raw capture');
    assert.equal(markers, 0, 'no marker rows when dedup is off');
  }
  // Kill switch via BRYCECAST_SNAPSHOT_DEDUP=0 env (no explicit option).
  {
    const { status, markers } = await driveFrozenRunner({ keyMode: 'etag', envKill: true });
    assert.equal(status.rowCounts.dedupedSnapshots, 0, 'BRYCECAST_SNAPSHOT_DEDUP=0 disables dedup');
    assert.equal(markers, 0, 'no marker rows under the env kill switch');
  }

  // ---------------------------------------------------------------------------
  // Part B — reader byte-equivalence. Build a full archive and a deduped archive
  // from the SAME scripted sequence, then compare what the real archive readers
  // serve over each.
  // ---------------------------------------------------------------------------
  const fullRoot = join(temp, 'full');
  const dedupRoot = join(temp, 'dedup');
  const fullShape = await buildArchive(fullRoot, { dedup: false, keyMode: 'etag' });
  const dedupShape = await buildArchive(dedupRoot, { dedup: true, keyMode: 'etag' });

  assert.equal(fullShape.total, dedupShape.total, 'both archives record the same number of polls (cadence preserved)');
  assert.equal(fullShape.markerCount, 0, 'the full archive has no markers');
  assert.ok(dedupShape.markerCount >= 20, `the deduped archive collapses the holds into markers (got ${dedupShape.markerCount})`);
  assert.ok(dedupShape.fullCount < fullShape.total, 'the deduped archive stores strictly fewer full payloads');

  const fullSqlite = join(fullRoot, 'data/live/brycecast.sqlite');
  const dedupSqlite = join(dedupRoot, 'data/live/brycecast.sqlite');
  assert.equal(markerRowCount(fullSqlite), 0, 'full sqlite carries no marker rows');
  assert.equal(markerRowCount(dedupSqlite), dedupShape.markerCount, 'deduped sqlite carries exactly its marker rows');

  const fullStatus = join(temp, 'full-status.json');
  const dedupStatus = join(temp, 'dedup-status.json');
  const idleStatus = JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() });
  await writeFile(fullStatus, idleStatus);
  await writeFile(dedupStatus, idleStatus);

  const base = 8991 + (process.pid % 30);
  const full = await startApiServer(fullSqlite, fullStatus, base);
  const dedupSrv = await startApiServer(dedupSqlite, dedupStatus, base + 1);
  try {
    const rankPath = (params) => `/api/history/rank-series${params}`;
    const replay = (rt) => `?replay=${encodeURIComponent(SESSION)}&rt=${encodeURIComponent(rt)}&speed=4`;

    // Cases: live (session-so-far), replay mid-hold (dedup-heavy), replay just
    // after the source-degradation gap, replay at the cold end.
    const cases = [
      { name: 'live', path: rankPath(`?session=${encodeURIComponent(SESSION)}`) },
      { name: 'replay-mid-hold', path: rankPath(replay(at(80))) },
      { name: 'replay-after-gap', path: rankPath(replay(at(145))) },
      { name: 'replay-cold-end', path: rankPath(replay(at(149))) }
    ];
    let sawGap = false;
    for (const testCase of cases) {
      const fullResponse = (await fetchJson(full.baseUrl, testCase.path)).json;
      const dedupResponse = (await fetchJson(dedupSrv.baseUrl, testCase.path)).json;
      assert.equal(fullResponse.available, true, `${testCase.name}: full archive serves a series`);
      assert.equal(dedupResponse.available, true, `${testCase.name}: deduped archive serves a series`);
      assert.equal(
        normalizeRankSeries(dedupResponse),
        normalizeRankSeries(fullResponse),
        `${testCase.name}: rank-series is BYTE-IDENTICAL for the deduped and full archives`
      );
      if (fullResponse.frames.some((frame) => frame.gapBefore === true)) sawGap = true;
    }
    assert.ok(sawGap, 'the verified source-degradation gap is present (the equivalence is non-trivial: holds are NOT gaps)');

    // The mid-hold replay must reach the held order (P3), not fragment: a naive
    // drop-dedup would have broken the line at index 60 and this frame set would
    // differ from the full archive above (already asserted identical).
    const midHold = (await fetchJson(dedupSrv.baseUrl, rankPath(replay(at(80))))).json;
    assert.ok(
      midHold.frames.some((frame) => frame.rows.some((row) => row.bryce === true && row.liveRank === 3)),
      'mid-hold replay carries Bryce at his held P3 through the deduped span'
    );

    assert.equal(full.stderrRef(), '', `full api-server stderr: ${full.stderrRef()}`);
    assert.equal(dedupSrv.stderrRef(), '', `dedup api-server stderr: ${dedupSrv.stderrRef()}`);
  } finally {
    for (const server of [full, dedupSrv]) {
      server.child.kill('SIGTERM');
      await new Promise((resolve) => server.child.once('exit', resolve));
    }
  }

  // ---------------------------------------------------------------------------
  // Part C — the replay OVERLAY resolves a marker at a virtual clock inside a
  // dedup-heavy hold to byte-identical raw/summary as the full archive.
  // ---------------------------------------------------------------------------
  {
    const overlayStatus = join(temp, 'overlay-status.json');
    await writeFile(overlayStatus, JSON.stringify({ phase: 'IDLE', updatedAt: new Date().toISOString() }));
    const fullOverlay = createReplayOverlay({ enabled: true, sqlitePath: fullSqlite, runnerStatusPath: overlayStatus });
    const dedupOverlay = createReplayOverlay({ enabled: true, sqlitePath: dedupSqlite, runnerStatusPath: overlayStatus });
    for (const rt of [at(30), at(80), at(146)]) {
      const fullRecord = fullOverlay.recordAt({ session: SESSION, rt, speed: 4 });
      const dedupRecord = dedupOverlay.recordAt({ session: SESSION, rt, speed: 4 });
      assert.ok(fullRecord?.record, `overlay(full) resolves a record at ${rt}`);
      assert.ok(dedupRecord?.record, `overlay(dedup) resolves a record at ${rt}`);
      // The load-bearing replay payload and the archive clock the overlay presents
      // are byte-identical (a marker keeps its OWN checked_at while resolving the
      // deduped raw from the snapshot it references).
      assert.equal(
        JSON.stringify(dedupRecord.record.raw),
        JSON.stringify(fullRecord.record.raw),
        `replay overlay raw payload is byte-identical at ${rt}`
      );
      assert.equal(
        dedupRecord.record.archiveCheckedAt,
        fullRecord.record.archiveCheckedAt,
        `replay overlay archive clock is byte-identical at ${rt}`
      );
      assert.equal(
        normalizeSummary(dedupRecord.record.summary),
        normalizeSummary(fullRecord.record.summary),
        `replay overlay summary content is identical at ${rt}`
      );
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: 'snapshot-dedup-archive-equivalence',
      runner: 'etag+content-hash dedup, raw-capture skip, env + option kill switch',
      readers: 'rank-series(live+replay) and replay-overlay byte-identical: deduped == full',
      guard: 'holds stay continuous; the source-degradation gap is still detected'
    },
    null,
    2
  )
);
