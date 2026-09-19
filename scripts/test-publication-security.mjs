// Exercise the actual HTTP handler in an isolated process with upstream fetch disabled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const runtime = await mkdtemp(join(tmpdir(), 'brycecast-publication-security-'));
const preload = join(runtime, 'no-network.mjs');
await writeFile(preload, "globalThis.fetch = async () => { console.error('FORBIDDEN_UPSTREAM_FETCH'); throw new Error('Upstream disabled in publication security test'); };\n");
const token = 'synthetic-publication-test-token';
const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`], {
  env: { ...process.env, BRYCECAST_OPERATOR_TOKEN: token, BRYCECAST_API_RUNNER_ONLY: '1', BRYCECAST_ENABLE_TIMING_DOWNLOADS: '0', BRYCECAST_SQLITE_PATH: join(runtime, 'absent.sqlite'), BRYCECAST_RUNNER_STATUS_PATH: join(runtime, 'absent.json') },
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
  console.log('PASS: real HTTP operator boundaries, runner ownership, default download refusal, same-origin default, and no upstream fetch');
} finally {
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode === null) { child.kill('SIGTERM'); await exited; }
  await rm(runtime, { recursive: true, force: true });
}
