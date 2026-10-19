// Off-session answers from the real HTTP handler, in runner-only mode with
// upstream fetch disabled. Between sessions the live runner writes no timing, and
// /api/readiness, /api/session, /api/bryce, /api/timing, /api/snapshot and
// /api/sources answered 503 "cache has not warmed yet" for the whole 2026
// off-season. A healthy waiting runner (IDLE, or ARMED before a session) now gets
// an explicit cold, no-session reply; a missing, stale or silent runner still 503s.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));

const runtime = await mkdtemp(join(tmpdir(), 'brycecast-off-session-'));
const preload = join(runtime, 'no-network.mjs');
await writeFile(preload, "globalThis.fetch = async () => { console.error('FORBIDDEN_UPSTREAM_FETCH'); throw new Error('Upstream disabled in off-session test'); };\n");
const statusPath = join(runtime, 'live-runner-status.json');
const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`], {
  env: {
    ...process.env,
    BRYCECAST_API_RUNNER_ONLY: '1',
    BRYCECAST_SQLITE_PATH: join(runtime, 'absent.sqlite'),
    BRYCECAST_RUNNER_STATUS_PATH: statusPath
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));
const base = `http://127.0.0.1:${port}`;
const browser = { origin: 'https://untrusted.example', accept: 'application/json' };
const routes = ['/api/readiness', '/api/session', '/api/bryce', '/api/timing', '/api/snapshot', '/api/sources'];

const writeStatus = (status) => writeFile(statusPath, JSON.stringify(status));
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const get = async (route) => {
  const response = await fetch(base + route, { headers: browser });
  return { status: response.status, body: await response.json() };
};
// The feed's own session on Oct 16, 2026: an INDYCAR race, which must never be
// promoted into BryceCast's session fields.
const indycarSession = { eventId: '5519', eventSessionId: '6736', name: 'Race', eventName: 'Mission Foods Grand Prix of Monterey', sessionName: 'Race' };

const assertNoSessionReplies = async (phase) => {
  const replies = Object.fromEntries(await Promise.all(routes.map(async (route) => [route, await get(route)])));
  for (const route of routes) assert.equal(replies[route].status, 200, `${phase}: ${route} answers 200, not ${replies[route].status}`);

  const readiness = replies['/api/readiness'].body;
  assert.equal(readiness.state, 'pre_session', `${phase}: readiness reports pre_session`);
  assert.equal(readiness.runner.phase, phase);
  assert.equal(readiness.gates[0].id, phase === 'ARMED' ? 'capture_runner_armed' : 'capture_runner_idle');
  assert.equal(readiness.raceWeekend.eventName, null, `${phase}: readiness must not promote the feed's INDYCAR session`);

  const session = replies['/api/session'].body;
  assert.equal(session.sourceState, 'cold');
  assert.equal(session.eventName, null, `${phase}: /api/session must not promote the feed's INDYCAR session`);
  assert.equal(session.broadcastRoute, null);
  assert.equal(session.runner.phase, phase);
  assert.match(session.reason, phase === 'ARMED' ? /armed/ : /No INDY NXT session is active/);

  const timing = replies['/api/timing'].body;
  assert.equal(timing.sourceState, 'cold');
  assert.equal(timing.rowCount, 0);
  assert.deepEqual(timing.rows, []);
  assert.equal(timing.bryceNo, '9');

  const snapshot = replies['/api/snapshot'].body;
  assert.equal(snapshot.sourceState, 'cold');
  assert.equal(snapshot.heartbeat, null);
  assert.deepEqual(snapshot.timingRows, []);
  assert.equal(snapshot.noSession, undefined, 'the internal marker is not sent');

  const bryce = replies['/api/bryce'].body;
  assert.equal(bryce.sourceState, 'cold');
  assert.equal(bryce.bryce, null);

  const sources = replies['/api/sources'].body;
  assert.equal(sources.sourceState, 'cold');
  assert.deepEqual(sources.endpoints, []);
  assert.deepEqual(sources.local, {}, 'public callers get no local file metadata');
};

const assertOutage = async (label) => {
  for (const route of routes) {
    const reply = await get(route);
    assert.equal(reply.status, 503, `${label}: ${route} must stay an outage`);
    assert.match(reply.body.error, /capture runner is not reporting/, `${label}: ${route} names the real cause`);
  }
};

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, `API did not start: ${output}`);

  await writeStatus({ phase: 'IDLE', updatedAt: ago(60_000), currentSession: indycarSession, nextSession: null, lastSuccessfulWriteAt: null });
  await assertNoSessionReplies('IDLE');

  await writeStatus({ phase: 'ARMED', updatedAt: ago(20_000), currentSession: indycarSession, nextSession: null, lastSuccessfulWriteAt: null });
  await assertNoSessionReplies('ARMED');

  await writeStatus({ phase: 'ARMED', updatedAt: ago(5 * 60_000), currentSession: indycarSession, nextSession: null, lastSuccessfulWriteAt: null });
  await assertOutage('ARMED runner silent for five minutes');

  await writeStatus({ phase: 'IDLE', updatedAt: ago(12 * 60_000), currentSession: null, nextSession: null, lastSuccessfulWriteAt: null });
  await assertOutage('IDLE runner past two missed polls');

  await writeStatus({ phase: 'LIVE', updatedAt: ago(5_000), currentSession: null, nextSession: null, lastSuccessfulWriteAt: null });
  await assertOutage('LIVE runner writing no timing');

  await rm(statusPath, { force: true });
  await assertOutage('no runner status');

  assert.doesNotMatch(output, /FORBIDDEN_UPSTREAM_FETCH/, 'off-session replies make no upstream request');
  console.log('PASS: off-session API replies — healthy IDLE and ARMED runners answer cold 200s on all six live routes; stale, silent or missing runners stay 503 with the real cause');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(runtime, { recursive: true, force: true });
}
