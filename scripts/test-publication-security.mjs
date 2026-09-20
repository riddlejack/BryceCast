// Exercise the actual HTTP handler in an isolated process with upstream fetch disabled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection, createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const runtime = await mkdtemp(join(tmpdir(), 'brycecast-publication-security-'));
const preload = join(runtime, 'no-network.mjs');
await writeFile(preload, "globalThis.fetch = async () => { console.error('FORBIDDEN_UPSTREAM_FETCH'); throw new Error('Upstream disabled in publication security test'); };\n");
const token = 'synthetic-publication-test-token';
const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`, '--static=dist'], {
  env: { ...process.env, BRYCECAST_OPERATOR_TOKEN: token, BRYCECAST_API_RUNNER_ONLY: '1', BRYCECAST_ENABLE_TIMING_DOWNLOADS: '0', BRYCECAST_REPLAY_CLIENT_REQUESTS: '2', BRYCECAST_SQLITE_PATH: join(runtime, 'absent.sqlite'), BRYCECAST_RUNNER_STATUS_PATH: join(runtime, 'absent.json') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', b => output += b);
child.stderr.on('data', b => output += b);
const base = `http://127.0.0.1:${port}`;
const browser = { origin: 'https://untrusted.example' };
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, `API did not start: ${output}`);
  const publicHealthResponse = await fetch(`${base}/api/health`, { headers: browser });
  const publicHealth = await publicHealthResponse.json();
  assert.equal(publicHealth.ok, true);
  assert.equal(publicHealth.storage, undefined, 'public health must not expose local storage metadata');
  assert.equal(publicHealth.replay, undefined, 'public health must not expose replay database/session metadata');
  assert.equal(publicHealth.staticDir, undefined, 'public health must not expose server filesystem layout');
  for (const [header, value] of [
    ['content-security-policy', "frame-ancestors 'none'"],
    ['permissions-policy', 'camera=(), geolocation=(), microphone=()'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY']
  ]) assert.equal(publicHealthResponse.headers.get(header), value, `${header} missing from API response`);

  const localHealth = await (await fetch(`${base}/api/health`)).json();
  assert.ok(localHealth.storage, 'direct loopback health retains operator diagnostics');

  const replayRoute = `${base}/api/health?replay=synthetic&rt=2026-01-01T00:00:00.000Z`;
  const replayClient = { ...browser, 'cf-connecting-ip': '203.0.113.10', 'cf-ray': 'synthetic-rate-test' };
  assert.equal((await fetch(replayRoute, { headers: replayClient })).status, 200);
  assert.equal((await fetch(replayRoute, { headers: replayClient })).status, 200);
  const limitedReplay = await fetch(replayRoute, { headers: replayClient });
  assert.equal(limitedReplay.status, 429, 'the HTTP replay route enforces its per-client limit');
  const retryAfter = Number(limitedReplay.headers.get('retry-after'));
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 10, 'rate refusal includes the remaining fixed-window delay');
  const otherReplayClient = { ...browser, 'cf-connecting-ip': '203.0.113.11', 'cf-ray': 'synthetic-rate-test-other' };
  assert.equal((await fetch(replayRoute, { headers: otherReplayClient })).status, 200, 'one limited client does not block a separate client');

  const malformedHostResponse = await new Promise((resolve, reject) => {
    let response = '';
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.write('GET /api/health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n');
    });
    socket.on('data', (chunk) => { response += chunk; });
    socket.on('error', reject);
    socket.on('close', () => resolve(response));
  });
  assert.match(malformedHostResponse, /^HTTP\/1\.1 200 /, 'malformed Host must not crash or escape request handling');
  assert.equal((await fetch(`${base}/api/health`, { headers: browser })).status, 200, 'server stays alive after malformed Host');

  const staticResponse = await fetch(`${base}/`);
  assert.equal(staticResponse.status, 200);
  assert.equal(staticResponse.headers.get('x-content-type-options'), 'nosniff', 'static response missing security headers');
  assert.equal(staticResponse.headers.get('x-frame-options'), 'DENY', 'static response missing frame denial');
  for (const route of ['/racecontrol/timingscoring-ris.json?refresh=1', '/api/weather/live?refresh=1', '/api/weather/upcoming?cache=0']) {
    const response = await fetch(base + route, { headers: browser });
    assert.equal(response.status, 403, `${route}: public refresh must be refused`);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const operatorRefresh = await fetch(`${base}/racecontrol/timingscoring-ris.json?refresh=1`, { headers: { ...browser, authorization: `Bearer ${token}` } });
  assert.equal(operatorRefresh.status, 409, 'Even an operator must not compete with the capture runner');
  assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST', headers: browser })).status, 403);
  assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST', headers: { ...browser, authorization: `Bearer ${token}` } })).status, 409);
  assert.equal((await fetch(`${base}/api/timing-archive/session_indy_nxt_2024_6314/observations`)).status, 403, 'Redistribution must require explicit opt-in');
  assert.ok(!output.includes('FORBIDDEN_UPSTREAM_FETCH'), 'A guarded request attempted upstream network access');
  console.log('PASS: request parsing, response headers, public diagnostics, replay client limiting, operator boundaries, default download refusal, and no upstream fetch');
} finally {
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode === null) { child.kill('SIGTERM'); await exited; }
  await rm(runtime, { recursive: true, force: true });
}
