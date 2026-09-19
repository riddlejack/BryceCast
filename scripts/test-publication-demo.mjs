#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(projectRoot, 'scripts', 'serve-demo.mjs');
const child = spawn(process.execPath, [serverPath, '--port=0'], {
  cwd: projectRoot,
  env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const waitForPort = () =>
  new Promise((resolvePort, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Demo server did not start.\nstdout: ${stdout}\nstderr: ${stderr}`)), 10_000);
    const inspect = () => {
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(deadline);
        resolvePort(Number(match[1]));
      }
    };
    child.stdout.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(deadline);
      reject(new Error(`Demo server exited before startup with code ${code}.\nstdout: ${stdout}\nstderr: ${stderr}`));
    });
    inspect();
  });

const rawRequest = (port, path, options = {}) =>
  new Promise((resolveResponse, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers ?? {}
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolveResponse({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        );
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });

const readJson = (response) => JSON.parse(response.body);

let port;
try {
  port = await waitForPort();

  const healthResponse = await rawRequest(port, '/api/health');
  assert.equal(healthResponse.status, 200);
  const health = readJson(healthResponse);
  assert.equal(health.status, 'ok');
  assert.equal(health.mode, 'historical_portfolio_snapshot');
  assert.equal(health.liveCapture, false);
  assert.equal(health.upstreamPolling, false);
  assert.equal(health.databaseAccess, false);
  assert.match(health.dataAsOf, /^\d{4}-\d{2}-\d{2}$/);

  const root = await rawRequest(port, '/');
  assert.equal(root.status, 200);
  assert.match(root.headers['content-type'], /^text\/html/);
  assert.match(root.body, /Historical portfolio snapshot/);
  assert.match(root.body, /live capture is disabled/);
  assert.match(root.body, new RegExp(`data as of ${health.dataAsOf}`));
  assert.match(root.body, /<div id="root"><\/div>/);
  assert.match(root.body, /<script type="module"[^>]+src="\/assets\//);

  for (const route of ['/career', '/career/race/session_indy_nxt_2024_6314', '/races/session_indy_nxt_2024_6314']) {
    const response = await rawRequest(port, route);
    assert.equal(response.status, 200, `${route} should receive the SPA shell`);
    assert.match(response.body, /Historical portfolio snapshot/);
    assert.match(response.body, /<div id="root"><\/div>/);
  }

  const scriptPath = root.body.match(/<script type="module"[^>]+src="([^"]+)"/)?.[1];
  assert.ok(scriptPath, 'built script path should be present');
  const script = await rawRequest(port, scriptPath);
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /^text\/javascript/);
  assert.ok(script.body.length > 1_000, 'built application JavaScript should be served');

  const readinessResponse = await rawRequest(port, '/api/readiness?replay=ignored');
  assert.equal(readinessResponse.status, 200);
  const readiness = readJson(readinessResponse);
  assert.equal(readiness.demo, true);
  assert.equal(readiness.state, 'pre_session');
  assert.notEqual(readiness.state, 'ready');
  assert.match(readiness.reason, /Live capture and source polling are disabled/);
  assert.equal(readiness.liveTiming.rowCount, 0);
  assert.deepEqual(readiness.liveTiming.rows, []);
  assert.equal(readiness.liveTiming.sourceState, 'cold');
  assert.equal(readiness.weather.available, false);
  assert.equal(readiness.weather.sourceState, 'unavailable');
  assert.equal(readiness.weather.observation, null);
  assert.deepEqual(readiness.weather.forecastHourly, []);
  assert.equal(readiness.replay.available, false);
  assert.deepEqual(readiness.replay.sessions, []);
  assert.ok(readiness.sources.endpoints.every((endpoint) => endpoint.ok === false && endpoint.sourceState === 'unavailable'));
  assert.ok(readiness.gates.every((gate) => gate.state !== 'pass'));

  const weatherUpcoming = readJson(await rawRequest(port, '/api/weather/upcoming'));
  assert.equal(weatherUpcoming.available, false);
  assert.deepEqual(weatherUpcoming.events, []);
  const weatherLiveResponse = await rawRequest(port, '/api/weather/live?trackId=track_road_america');
  assert.equal(weatherLiveResponse.status, 200);
  const weatherLive = readJson(weatherLiveResponse);
  assert.equal(weatherLive.available, false);
  assert.equal(weatherLive.observation, null);
  assert.deepEqual(weatherLive.forecastHourly, []);

  const nextSession = readJson(await rawRequest(port, '/api/next-session'));
  assert.equal(nextSession.available, false);
  assert.equal(nextSession.nextSession, null);
  const replay = readJson(await rawRequest(port, '/api/replay/available'));
  assert.equal(replay.enabled, false);
  assert.deepEqual(replay.sessions, []);

  const timing = await rawRequest(port, '/api/timing-archive/session_indy_nxt_2024_6314/observations?source=timing71');
  assert.equal(timing.status, 403);
  assert.equal(readJson(timing).error, 'permission_pending');

  for (const path of ['/..%2fpackage.json', '/%2e%2e%5cpackage.json', '/%00package.json']) {
    const response = await rawRequest(port, path);
    assert.ok([400, 404].includes(response.status), `${path} must be rejected`);
    assert.doesNotMatch(response.body, /"name"\s*:\s*"brycecast"/);
  }

  const post = await rawRequest(port, '/api/readiness', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  assert.equal(readJson(post).error, 'method_not_allowed');

  const head = await rawRequest(port, '/api/health', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  const unknownApi = await rawRequest(port, '/api/not-a-demo-route');
  assert.equal(unknownApi.status, 404);
  assert.equal(readJson(unknownApi).error, 'unavailable_in_demo');

  console.log(`publication demo tests passed at http://127.0.0.1:${port} (data as of ${health.dataAsOf})`);
} finally {
  if (!child.killed) child.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) resolveExit();
    else child.once('exit', resolveExit);
    setTimeout(resolveExit, 2_000).unref();
  });
}
