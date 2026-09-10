#!/usr/bin/env node
// Exercise the public download contract against a real isolated API process.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const runtime = await mkdtemp(join(tmpdir(), 'brycecast-download-test-'));
const base = 'http://127.0.0.1:8796';
const child = spawn(process.execPath, ['scripts/api-server.mjs', '--host=127.0.0.1', '--port=8796'], {
  env: { ...process.env, BRYCECAST_API_RUNNER_ONLY: '1', BRYCECAST_REPLAY: '1', BRYCECAST_SQLITE_PATH: join(runtime, 'absent.sqlite'), BRYCECAST_RUNNER_STATUS_PATH: join(runtime, 'absent-status.json') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (bytes) => output += bytes);
child.stderr.on('data', (bytes) => output += bytes);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* server starting */ }
    await delay(100);
  }
  assert.ok(ready, `API did not start: ${output}`);
  const ledger = JSON.parse(await readFile('data/historical-data-lake/catalog/timing-coverage-ledger.json', 'utf8'));
  let checked = 0;
  for (const row of ledger.sessions) {
    const response = await fetch(`${base}/api/timing-archive/${row.canonicalSessionId}/observations`);
    if (!row.primarySource?.observedArtifact) {
      assert.equal(response.status, 404, row.canonicalSessionId);
      continue;
    }
    assert.equal(response.status, 200, row.canonicalSessionId);
    assert.equal(response.headers.get('content-type'), 'application/gzip');
    assert.match(response.headers.get('content-disposition'), /attachment/);
    const received = Buffer.from(await response.arrayBuffer());
    const expected = await readFile(row.primarySource.observedArtifact);
    assert.equal(sha(received), sha(expected), `${row.canonicalSessionId}: native source bytes must remain unchanged`);
    checked++;
  }
  for (const id of ['session_indy_nxt_2026_99999', '..%2F..%2Fdata%2Flive%2Fbrycecast.sqlite']) {
    assert.equal((await fetch(`${base}/api/timing-archive/${id}/observations`)).status, 404);
  }
  const manifest = JSON.parse(await readFile('analysis/replay-feeds/output/replay-feeds-manifest.json', 'utf8'));
  const available = await (await fetch(`${base}/api/replay/available`)).json();
  let replayed = 0;
  for (const session of manifest.sessions.filter((row) => row.watchable)) {
    assert.ok(available.sessions.some((row) => row.sessionKey === session.sessionKey && row.watchable), session.sessionKey);
    const params = new URLSearchParams({ replay: session.sessionKey, rt: session.lastCheckedAt });
    const response = await fetch(`${base}/api/timing?${params}`);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.rows?.length > 0, `${session.sessionKey}: no replay timing rows`);
    replayed++;
  }
  const gapParams = new URLSearchParams({ replay: 'session_indy_nxt_2025_6452', rt: '2025-07-06T10:45:00.000Z' });
  for (const route of ['readiness', 'timing', 'snapshot', 'bryce', 'session', 'sources', 'history/rank-series']) {
    const response = await fetch(`${base}/api/${route}?${gapParams}`);
    const body = await response.json();
    assert.equal(response.status, 409, `${route}: source gap must not return stale or live data`);
    assert.equal(body.error, 'source_gap');
    assert.equal(body.gap.nextObservedAt, '2025-07-06T10:49:28.000Z');
    assert.equal(body.rows, undefined);
  }
  gapParams.set('rt', '2025-07-06T10:49:28.000Z');
  assert.equal((await fetch(`${base}/api/timing?${gapParams}`)).status, 200);
  console.log(`PASS: ${checked} native downloads match source bytes; ${replayed} race replays serve timing; all replay routes withhold missing source time and resume correctly`);
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(runtime, { recursive: true, force: true });
}
