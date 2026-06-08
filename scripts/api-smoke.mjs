import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] ?? '8799');
const baseUrl = `http://127.0.0.1:${port}`;
const distDir = join(root, 'dist');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const distExists = async () => {
  try {
    await access(distDir);
    return true;
  } catch {
    return false;
  }
};

const fetchJson = async (path, init) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    ...init
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text.slice(0, 200)}`);
  }
  return { response, json, text };
};

const waitForHealth = async () => {
  for (let index = 0; index < 80; index += 1) {
    try {
      const { json } = await fetchJson('/api/health');
      if (json?.ok) return json;
    } catch {}
    await sleep(250);
  }
  throw new Error('API server did not become healthy');
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const resetProofs = async () => {
  await fetchJson('/api/pov-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'unproven',
      source: 'INDYCAR App',
      evidenceRef: '',
      liveConfirmedSeconds: 0,
      notes: 'API smoke reset: live #9 onboard remains unverified until same-race proof is recorded.',
      proofItems: []
    })
  });
  await fetchJson('/api/audio-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'frequency_only',
      source: 'Published frequency',
      evidenceRef: '',
      liveConfirmedSeconds: 0,
      notes: 'API smoke reset: published #9 frequency is metadata only.',
      proofItems: []
    })
  });
};

const serverArgs = ['scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`];
if (await distExists()) {
  serverArgs.push('--static=dist');
}

const child = spawn(process.execPath, serverArgs, {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const health = await waitForHealth();
  const snapshot = (await fetchJson('/api/snapshot')).json;
  assert(snapshot?.heartbeat?.EventID, '/api/snapshot missing heartbeat EventID');
  assert(Array.isArray(snapshot?.timingRows) && snapshot.timingRows.length > 0, '/api/snapshot missing timing rows');
  assert(snapshot?.bryce?.no === '9', '/api/snapshot missing Bryce #9 row');
  assert(snapshot?.bryce?.firstName === 'Bryce' && snapshot?.bryce?.lastName === 'Aron', '/api/snapshot bound #9 to the wrong driver');
  assert(!snapshot.timingRows.some((row) => row.no === '9' && row.lastName === 'Dixon'), '/api/snapshot included top-series #9 collision as Bryce timing');

  const session = (await fetchJson('/api/session')).json;
  assert(session?.eventSessionId, '/api/session missing eventSessionId');
  assert(session?.broadcastRoute, '/api/session missing broadcastRoute');

  const bryce = (await fetchJson('/api/bryce')).json;
  assert(bryce?.bryce?.no === '9', '/api/bryce missing Bryce row');
  assert(bryce?.bryce?.firstName === 'Bryce' && bryce?.bryce?.lastName === 'Aron', '/api/bryce bound #9 to the wrong driver');
  assert(bryce?.profile?.radiofrequency, '/api/bryce missing radio frequency');

  const timing = (await fetchJson('/api/timing')).json;
  assert(timing?.rowCount > 0, '/api/timing missing row count');
  assert(timing?.rows?.some((row) => row.bryce), '/api/timing missing Bryce highlight');

  const sources = (await fetchJson('/api/sources')).json;
  assert(sources?.endpoints?.length >= 5, '/api/sources missing upstream probes');
  assert(sources.endpoints.every((endpoint) => typeof endpoint.freshnessLabel === 'string'), '/api/sources missing freshness labels');
  assert(sources.endpoints.every((endpoint) => Object.prototype.hasOwnProperty.call(endpoint, 'checkedAgeSeconds')), '/api/sources missing checked age');
  assert(sources?.local?.sqlite, '/api/sources missing local storage status');

  const history = (await fetchJson('/api/history/bryce')).json;
  assert(Array.isArray(history?.points) && history.points.length > 0, '/api/history/bryce missing history points');
  assert(history?.meta?.schemaVersion === 'history-bryce.v1', '/api/history/bryce missing schema metadata');
  assert(history.meta.rows === history.points.length, '/api/history/bryce metadata row count mismatch');

  const compactHistory = await fetchJson('/api/history/bryce?compact=1');
  assert(compactHistory.response.headers.get('x-brycecast-schema-version') === 'history-bryce.v1', '/api/history/bryce compact missing schema header');
  assert(compactHistory.json?.meta?.rows === history.points.length, '/api/history/bryce compact metadata row count mismatch');
  assert(Array.isArray(compactHistory.json?.trackSplits) && compactHistory.json.trackSplits.length > 0, '/api/history/bryce compact missing track splits');
  assert(compactHistory.json?.latestRace?.race, '/api/history/bryce compact missing latest race');
  assert(Array.isArray(compactHistory.json?.teammateBench) && compactHistory.json.teammateBench.some((row) => row.driverId === 'bryce'), '/api/history/bryce compact missing Bryce teammate bench');

  const raceLog = (await fetchJson('/api/race-log/latest')).json;
  assert(raceLog?.sessionKey, '/api/race-log/latest missing sessionKey');

  const onboards = (await fetchJson('/api/onboard-catalog')).json;
  assert(onboards?.counts, '/api/onboard-catalog missing counts');

  const replay = (await fetchJson('/api/replay/bryce?limit=5')).json;
  assert(typeof replay?.available === 'boolean', '/api/replay/bryce missing availability flag');
  assert(['missing', 'empty', 'tiny', 'ready'].includes(replay?.archiveState), '/api/replay/bryce missing archiveState');
  assert(Array.isArray(replay?.sessions), '/api/replay/bryce missing sessions');
  assert(replay?.summary && typeof replay.summary === 'object', '/api/replay/bryce missing summary');
  assert(Array.isArray(replay?.warnings), '/api/replay/bryce missing warnings');
  assert(Array.isArray(replay?.rows), '/api/replay/bryce missing rows');
  for (let index = 1; index < replay.rows.length; index += 1) {
    assert(Date.parse(replay.rows[index - 1].checkedAt) <= Date.parse(replay.rows[index].checkedAt), '/api/replay/bryce rows not chronological');
  }
  for (const row of replay.rows) {
    if (typeof row.startPosition === 'number' && typeof row.rank === 'number') {
      assert(row.positionDelta === row.startPosition - row.rank, '/api/replay/bryce invalid positionDelta');
    }
    if (typeof row.passes === 'number' && typeof row.passed === 'number') {
      assert(row.netPasses === row.passes - row.passed, '/api/replay/bryce invalid netPasses');
    }
  }
  const replayLimitOne = (await fetchJson('/api/replay/bryce?limit=1')).json;
  assert(replayLimitOne?.rows?.length <= 1, '/api/replay/bryce limit=1 returned too many rows');
  const replayClamp = (await fetchJson('/api/replay/bryce?limit=9999')).json;
  assert(replayClamp?.rows?.length <= 500, '/api/replay/bryce limit clamp failed');

  const povPayload = { status: 'inconclusive', source: 'INDYCAR App', evidenceRef: 'api-smoke-pov', proofItems: [] };
  await fetchJson('/api/pov-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(povPayload)
  });
  const povProof = (await fetchJson('/api/pov-proof')).json;
  assert(povProof?.evidenceRef === 'api-smoke-pov', '/api/pov-proof did not persist POST payload');

  const audioPayload = { status: 'official_race_audio_available', source: 'INDYCAR Radio', evidenceRef: 'api-smoke-audio', proofItems: [] };
  await fetchJson('/api/audio-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(audioPayload)
  });
  const audioProof = (await fetchJson('/api/audio-proof')).json;
  assert(audioProof?.evidenceRef === 'api-smoke-audio', '/api/audio-proof did not persist POST payload');
  await resetProofs();

  const raceControl = await fetch(`${baseUrl}/racecontrol/timingscoring-ris.json`, { headers: { accept: 'application/json' } });
  assert(raceControl.ok, '/racecontrol proxy did not return OK');

  let rootStatus = null;
  if (await distExists()) {
    const rootResponse = await fetch(`${baseUrl}/`);
    rootStatus = rootResponse.status;
    assert(rootResponse.ok, 'static app root did not serve from API server');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        staticServed: rootStatus === 200,
        health: {
          service: health.service,
          staticDir: health.staticDir,
          sqlite: health.storage?.sqlite?.exists ?? false
        },
        snapshot: {
          event: snapshot.heartbeat.eventName,
          flag: snapshot.heartbeat.currentFlag,
          bryceRank: snapshot.bryce.rank
        },
        endpointsChecked: [
          '/api/health',
          '/api/snapshot',
          '/api/session',
          '/api/bryce',
          '/api/timing',
          '/api/sources',
          '/api/history/bryce',
          '/api/history/bryce?compact=1',
          '/api/race-log/latest',
          '/api/onboard-catalog',
          '/api/replay/bryce',
          '/api/pov-proof',
          '/api/audio-proof',
          '/racecontrol/timingscoring-ris.json'
        ]
        ,
        sourceFreshness: sources.endpoints.map((endpoint) => ({ id: endpoint.id, freshness: endpoint.freshnessLabel }))
      },
      null,
      2
    )
  );
} finally {
  await resetProofs().catch(() => {});
  child.kill('SIGTERM');
  await sleep(250);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}
