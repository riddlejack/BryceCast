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
  stdio: ['ignore', 'pipe', 'pipe'],
  // Smoke checks route behavior, not latency SLAs — give upstream fetches
  // headroom so a burst of parallel probes doesn't flake the run.
  env: { ...process.env, BRYCECAST_SOURCE_FETCH_TIMEOUT_MS: process.env.BRYCECAST_SOURCE_FETCH_TIMEOUT_MS ?? '15000' }
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const health = await waitForHealth();
  const readiness = (await fetchJson('/api/readiness')).json;
  assert(readiness?.schemaVersion === 'live-readiness.v1', '/api/readiness missing schema version');
  assert(
    ['ready', 'pre_session', 'degraded', 'wrong_series', 'stale', 'blocked'].includes(readiness?.state),
    '/api/readiness returned unknown product state'
  );
  assert(['green', 'amber', 'red'].includes(readiness?.severity), '/api/readiness missing severity');
  assert(readiness?.raceWeekend && readiness?.liveTiming && readiness?.bryce && readiness?.points, '/api/readiness missing nested state summaries');
  assert(readiness.points?.schemaVersion === 'live-points.v1', '/api/readiness missing live points state');
  assert(readiness.points?.officialModelAvailable === false, '/api/readiness must not claim an official local points model');
  assert(Array.isArray(readiness?.gates) && readiness.gates.length > 0, '/api/readiness missing gates');
  assert(Array.isArray(readiness?.sources?.endpoints), '/api/readiness missing source endpoint summary');
  if (readiness.state === 'wrong_series') {
    assert(readiness.bryce?.bryce === null, '/api/readiness wrong_series must not expose top-series car #9 as Bryce');
    assert(readiness.bryce?.identityGuard?.seriesOk === false, '/api/readiness wrong_series missing failed series guard');
  }
  for (const row of readiness.liveTiming?.rows ?? []) {
    for (const field of ['rank', 'liveRank', 'startPosition', 'passes', 'passed', 'pitStops', 'runningDriverPoints', 'totalDriverPoints', 'totalEntrantPoints']) {
      assert(row[field] === null || typeof row[field] === 'number', `/api/readiness row ${field} must be number or null`);
    }
  }

  let snapshot = null;
  const liveSnapshotRequired = ['ready', 'degraded'].includes(readiness.state);
  if (liveSnapshotRequired) {
    snapshot = (await fetchJson('/api/snapshot')).json;
    assert(snapshot?.heartbeat?.EventID, '/api/snapshot missing heartbeat EventID');
    assert(Array.isArray(snapshot?.timingRows) && snapshot.timingRows.length > 0, '/api/snapshot missing timing rows');
    assert(snapshot?.bryce?.no === '9', '/api/snapshot missing Bryce #9 row');
    assert(snapshot?.bryce?.firstName === 'Bryce' && snapshot?.bryce?.lastName === 'Aron', '/api/snapshot bound #9 to the wrong driver');
    assert(!snapshot.timingRows.some((row) => row.no === '9' && row.lastName === 'Dixon'), '/api/snapshot included top-series #9 collision as Bryce timing');
    const driverProfileProbe = snapshot.sourceProbes?.find((probe) => probe.id === 'drivers_nxt');
    assert(driverProfileProbe, '/api/snapshot missing driver-profile source probe');

    const session = (await fetchJson('/api/session')).json;
    assert(session?.eventSessionId, '/api/session missing eventSessionId');
    assert(session?.broadcastRoute, '/api/session missing broadcastRoute');

    const bryce = (await fetchJson('/api/bryce')).json;
    assert(bryce?.bryce?.no === '9', '/api/bryce missing Bryce row');
    assert(bryce?.bryce?.firstName === 'Bryce' && bryce?.bryce?.lastName === 'Aron', '/api/bryce bound #9 to the wrong driver');
    assert(bryce?.profile?.firstname === 'Bryce' && bryce?.profile?.lastname === 'Aron', '/api/bryce missing fallback Bryce profile identity');
    if (driverProfileProbe.state === 'live') {
      assert(bryce?.profile?.radiofrequency, '/api/bryce live driver-profile probe missing radio frequency');
    }

    const timing = (await fetchJson('/api/timing')).json;
    assert(timing?.rowCount > 0, '/api/timing missing row count');
    assert(timing?.rows?.some((row) => row.bryce), '/api/timing missing Bryce highlight');
  } else {
    assert(readiness.reason, '/api/readiness non-live state missing reason');
  }

  const sources = (await fetchJson('/api/sources')).json;
  assert(sources?.endpoints?.length >= 9, '/api/sources missing expanded upstream probes');
  const timingSource = sources.endpoints.find((endpoint) => endpoint.id === 'timing');
  assert(timingSource, '/api/sources missing timing source probe');
  assert(
    timingSource.sourceSummary?.brycePresent || ['wrong_session', 'payload_invalid', 'error'].includes(timingSource.readinessState),
    '/api/sources treats global timing as Bryce-ready without a Bryce timing row'
  );
  if (timingSource.sourceSummary?.brycePresent === false) {
    assert(timingSource.readinessState === 'wrong_session', '/api/sources missing wrong-session readiness for no-Bryce global timing');
  }
  const nxtDriverSource = sources.endpoints.find((endpoint) => endpoint.id === 'drivers_nxt');
  assert(nxtDriverSource, '/api/sources missing NXT driver source probe');
  assert(
    nxtDriverSource.sourceSummary?.brycePresent || ['profile_unavailable', 'error'].includes(nxtDriverSource.readinessState),
    '/api/sources treats NXT driver feed as profile-ready without Bryce profile'
  );
  if (nxtDriverSource.sourceSummary?.brycePresent && !nxtDriverSource.sourceSummary?.radiofrequency) {
    assert(nxtDriverSource.readinessState === 'profile_partial', '/api/sources missing partial profile readiness when radio frequency is unavailable');
  }
  const nttCandidate = sources.endpoints.find((endpoint) => endpoint.id === 'ntt_data_polling');
  assert(nttCandidate, '/api/sources missing NTT prediction candidate probe');
  assert(
    ['candidate_unavailable', 'candidate_unverified', 'error'].includes(nttCandidate.readinessState),
    '/api/sources exposes NTT prediction candidate without candidate readiness state'
  );
  if (nttCandidate.ok && nttCandidate.sourceSummary?.payloadAgeSeconds !== null) {
    assert(nttCandidate.readinessState !== 'available', '/api/sources treats NTT prediction candidate as available from HTTP success alone');
  }
  const topDriverSource = sources.endpoints.find((endpoint) => endpoint.id === 'drivers_top');
  assert(topDriverSource, '/api/sources missing top-series guard probe');
  assert(topDriverSource.readinessState === 'reference_only' || topDriverSource.readinessState === 'error', '/api/sources treats top-series guard as an app-available Bryce source');
  assert(sources.endpoints.every((endpoint) => typeof endpoint.freshnessLabel === 'string'), '/api/sources missing freshness labels');
  assert(sources.endpoints.every((endpoint) => Object.prototype.hasOwnProperty.call(endpoint, 'checkedAgeSeconds')), '/api/sources missing checked age');
  assert(sources.endpoints.every((endpoint) => typeof endpoint.readinessState === 'string'), '/api/sources missing readiness state');
  assert(sources?.local?.sqlite, '/api/sources missing local storage status');

  const liveWeather = (await fetchJson('/api/weather/live?trackId=track_road_america')).json;
  assert(liveWeather?.schemaVersion === 'live-weather.v1', '/api/weather/live missing schema version');
  assert(['live', 'partial'].includes(liveWeather?.sourceState), '/api/weather/live missing live/partial state');
  assert(liveWeather?.track?.id === 'track_road_america', '/api/weather/live returned wrong track');
  assert(
    liveWeather.sourceState === 'partial' || liveWeather?.station?.id,
    '/api/weather/live missing station id for live weather response'
  );
  assert(
    liveWeather.sourceState !== 'live' || (liveWeather.observation?.timestamp && liveWeather.observation?.station),
    '/api/weather/live marked weather live without observation identity fields'
  );
  assert(
    liveWeather.sourceState === 'live' || liveWeather.probes?.some((probe) => !probe.ok),
    '/api/weather/live partial response did not include a failed probe'
  );
  assert(['hit', 'miss', 'joined_inflight'].includes(liveWeather?.cache?.status), '/api/weather/live missing cache status');

  const upcomingWeather = (await fetchJson('/api/weather/upcoming')).json;
  assert(upcomingWeather?.schemaVersion === 'live-weather-upcoming.v1', '/api/weather/upcoming missing schema version');
  assert(Array.isArray(upcomingWeather?.events), '/api/weather/upcoming missing event list');
  assert(upcomingWeather.events.length > 0, '/api/weather/upcoming found no future INDY NXT events');
  assert(
    upcomingWeather.events.every((row) => row.forecastReadiness?.status && row.weather?.track?.id),
    '/api/weather/upcoming missing readiness or weather payloads'
  );
  const cachedUpcomingWeather = (await fetchJson('/api/weather/upcoming')).json;
  assert(
    cachedUpcomingWeather.events.every((row) => row.weather?.cache?.status === 'hit'),
    '/api/weather/upcoming did not reuse cached per-track weather on immediate repeat'
  );

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

  const checkedEndpoints = [
    '/api/health',
    '/api/readiness',
    ...(liveSnapshotRequired ? ['/api/snapshot', '/api/session', '/api/bryce', '/api/timing'] : []),
    '/api/sources',
    '/api/weather/live?trackId=track_road_america',
    '/api/weather/upcoming',
    '/api/history/bryce',
    '/api/history/bryce?compact=1'
  ];

  if (health.storage?.latestSnapshot?.exists) {
    const raceLog = (await fetchJson('/api/race-log/latest')).json;
    assert(raceLog?.sessionKey, '/api/race-log/latest missing sessionKey');
    checkedEndpoints.push('/api/race-log/latest');
  }

  if (health.storage?.onboardCatalog?.exists) {
    const onboards = (await fetchJson('/api/onboard-catalog')).json;
    assert(onboards?.counts, '/api/onboard-catalog missing counts');
    checkedEndpoints.push('/api/onboard-catalog');
  }

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
  checkedEndpoints.push('/api/replay/bryce');

  const povPayload = { status: 'inconclusive', source: 'INDYCAR App', evidenceRef: 'api-smoke-pov', proofItems: [] };
  await fetchJson('/api/pov-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(povPayload)
  });
  const povProof = (await fetchJson('/api/pov-proof')).json;
  assert(povProof?.evidenceRef === 'api-smoke-pov', '/api/pov-proof did not persist POST payload');
  checkedEndpoints.push('/api/pov-proof');

  const audioPayload = { status: 'official_race_audio_available', source: 'INDYCAR Radio', evidenceRef: 'api-smoke-audio', proofItems: [] };
  await fetchJson('/api/audio-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(audioPayload)
  });
  const audioProof = (await fetchJson('/api/audio-proof')).json;
  assert(audioProof?.evidenceRef === 'api-smoke-audio', '/api/audio-proof did not persist POST payload');
  checkedEndpoints.push('/api/audio-proof');
  await resetProofs();

  const raceControl = await fetch(`${baseUrl}/racecontrol/timingscoring-ris.json`, { headers: { accept: 'application/json' } });
  assert(raceControl.ok, '/racecontrol proxy did not return OK');
  checkedEndpoints.push('/racecontrol/timingscoring-ris.json');
  const topDrivers = await fetch(`${baseUrl}/racecontrol/driversfeed.json`, { headers: { accept: 'application/json' } });
  assert(topDrivers.ok, '/racecontrol top-series driver proxy did not return OK');
  checkedEndpoints.push('/racecontrol/driversfeed.json');
  const nttData = await fetch(`${baseUrl}/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json`, { headers: { accept: 'application/json' } });
  assert(nttData.ok, '/ntt-data proxy did not return OK');
  checkedEndpoints.push('/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json');

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
        snapshot: snapshot
          ? {
              event: snapshot.heartbeat.eventName,
              flag: snapshot.heartbeat.currentFlag,
              bryceRank: snapshot.bryce.rank
            }
          : null,
        endpointsChecked: checkedEndpoints,
        readiness: {
          state: readiness.state,
          reason: readiness.reason,
          pointsMode: readiness.points.mode,
          timingRows: readiness.liveTiming.rowCount
        },
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
