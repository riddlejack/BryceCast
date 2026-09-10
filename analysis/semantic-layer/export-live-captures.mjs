#!/usr/bin/env node
// Read-only export of the late-2026 BryceCast Race Control archive.
//
// The live database remains remote and immutable: sqlite is opened with
// `-readonly`, no live process is stopped, and only the eight source sessions
// needed to close the current timing gap are selected. The normalized packs
// retain observed timestamps and field state. Race feed packs are source
// observations at their native cadence; no interpolation or GPS is introduced.

import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {createGzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {once} from 'node:events';

const HERE = dirname(fileURLToPath(import.meta.url));
const OBS_DIR = join(HERE, 'output', 'live-captures');
const FEEDS_DIR = join(HERE, '..', 'replay-feeds', 'output', 'feeds');
const MANIFEST_PATH = join(OBS_DIR, 'live-captures-manifest.json');
const SOURCE_TIER = 'race_control_capture';

const hostArg = process.argv.indexOf('--host');
const dbArg = process.argv.indexOf('--db');
const localDbArg = process.argv.indexOf('--local-db');
const databaseShaArg = process.argv.indexOf('--database-sha256');
const SSH_HOST = hostArg >= 0 ? process.argv[hostArg + 1] : 'operator@your-host.local';
const DB_PATH = dbArg >= 0 ? process.argv[dbArg + 1] : '~/BryceCast/site/data/live/brycecast.sqlite';
const LOCAL_DB_PATH = localDbArg >= 0
  ? String(process.argv[localDbArg + 1]).replace(/^~(?=\/)/, homedir())
  : null;
const SOURCE_DATABASE_SHA256 = databaseShaArg >= 0 ? process.argv[databaseShaArg + 1] : null;

const CAPTURES = [
  {captureSessionKey: '5538-6755', canonicalSessionId: 'session_indy_nxt_2026_6755', sessionType: 'race'},
  {captureSessionKey: '5547-6764', canonicalSessionId: 'session_indy_nxt_2026_6764', sessionType: 'race'},
  {captureSessionKey: '5540-6757', canonicalSessionId: 'session_indy_nxt_2026_6757', sessionType: 'race'},
  {captureSessionKey: '5542-6759', canonicalSessionId: 'session_indy_nxt_2026_6759', sessionType: 'race'},
  {captureSessionKey: '5541-6758', canonicalSessionId: 'session_indy_nxt_2026_6758', sessionType: 'race'},
  {captureSessionKey: '5547-6900', canonicalSessionId: 'session_indy_nxt_2026_6900', sessionType: 'qualifying', qualifyingEndBoundary: 'first_checkered'},
  {captureSessionKey: '5540-6935', canonicalSessionId: 'session_indy_nxt_2026_6935', sessionType: 'qualifying', qualifyingEndBoundary: 'last_checkered'},
  {
    captureSessionKey: '5542-6950',
    canonicalSessionId: 'session_indy_nxt_2026_6950',
    canonicalAliases: ['session_indy_nxt_2026_6953'],
    sessionType: 'qualifying',
    qualifyingEndBoundary: 'first_checkered',
  },
];

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function cadence(timestamps) {
  const gaps = [];
  const intervalsOver2Seconds = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    const gap = (timestamps[i] - timestamps[i - 1]) / 1000;
    if (Number.isFinite(gap) && gap >= 0) {
      gaps.push(gap);
      if (gap > 2) {
        intervalsOver2Seconds.push({
          lastObservedAt: new Date(timestamps[i - 1]).toISOString(),
          nextObservedAt: new Date(timestamps[i]).toISOString(),
          seconds: Number(gap.toFixed(3)),
        });
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const rounded = (value) => (value == null ? null : Number(value.toFixed(3)));
  return {
    p50Seconds: rounded(percentile(gaps, 0.5)),
    p95Seconds: rounded(percentile(gaps, 0.95)),
    maxSeconds: rounded(gaps.at(-1) ?? null),
    gapsOver2Seconds: gaps.filter((g) => g > 2).length,
    gapsOver5Seconds: gaps.filter((g) => g > 5).length,
    gapsOver10Seconds: gaps.filter((g) => g > 10).length,
    intervalsOver2Seconds,
  };
}

function nonEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '' ? null : value;
}

function numericRank(row) {
  const live = nonEmpty(row.liveRank);
  const classified = nonEmpty(row.rank);
  const value = Number(live ?? classified);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function bryceLapCoverage(rows) {
  const observations = rows
    .map((row) => ({observedAt: row.checkedAt, lap: Number(row.bryceLaps)}))
    .filter((row) => Number.isFinite(row.lap));
  let changes = 0;
  let previous = null;
  for (const row of observations) {
    if (previous !== null && row.lap !== previous) changes += 1;
    previous = row.lap;
  }
  return {
    clockBasis: 'utc_capture_timestamp',
    hasObservedClock: observations.length > 0,
    firstObservedAt: observations[0]?.observedAt ?? null,
    lastObservedAt: observations.at(-1)?.observedAt ?? null,
    sampleCount: observations.length,
    lapChangeObservationCount: changes,
    minLap: observations.length ? Math.min(...observations.map((row) => row.lap)) : null,
    maxLap: observations.length ? Math.max(...observations.map((row) => row.lap)) : null,
  };
}

async function writeGzipNdjson(path, rows) {
  await mkdir(dirname(path), {recursive: true});
  const gzip = createGzip({level: 9});
  const output = createWriteStream(path);
  gzip.pipe(output);
  for (const row of rows) {
    if (!gzip.write(`${JSON.stringify(row)}\n`)) await once(gzip, 'drain');
  }
  gzip.end();
  await once(output, 'finish');
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function normalizedField(timing) {
  const rows = timing?.timing_results?.Item;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    car: String(row.no ?? ''),
    driverId: row.DriverID == null ? null : String(row.DriverID),
    driver: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || null,
    team: row.team ?? null,
    rank: numericRank(row),
    laps: Number(row.laps) || 0,
    status: row.status ?? null,
    gap: row.liveGap ?? row.gap ?? null,
    bestLapTime: row.bestLapTime || null,
    lastLapTime: row.lastLapTime || null,
    speed: row.LastSpeed ?? row.lastSpeed ?? null,
  }));
}

function feedRow(source, config) {
  const timing = source.timing;
  const heartbeat = timing?.timing_results?.heartbeat ?? {};
  const items = Array.isArray(timing?.timing_results?.Item)
    ? timing.timing_results.Item.map((row) => ({...row, DriverID: row.DriverID == null ? '' : String(row.DriverID)}))
    : [];
  const bryce = items.find((row) => String(row.DriverID) === '2143' || /bryce\s+aron/i.test(`${row.firstName ?? ''} ${row.lastName ?? ''}`));
  if (!bryce) throw new Error(`${config.captureSessionKey} snapshot ${source.sourceRowId} has no Bryce identity proof`);
  const flag = String(source.flag ?? heartbeat.currentFlag ?? '').toUpperCase();
  const normalizedHeartbeat = {
    ...heartbeat,
    EventID: String(source.eventId ?? heartbeat.EventID ?? ''),
    EventSessionID: String(source.eventSessionId ?? heartbeat.EventSessionID ?? ''),
    SessionName: source.sessionName ?? heartbeat.SessionName ?? (config.sessionType === 'race' ? 'Race' : 'Qualifications'),
    SessionType: config.sessionType === 'race' ? 'R' : 'Q',
    Series: 'L',
    SessionStatus: flag,
    currentFlag: flag,
    lapNumber: String(source.lap ?? heartbeat.lapNumber ?? ''),
    totalLaps: String(source.totalLaps ?? heartbeat.totalLaps ?? ''),
  };
  return {
    checkedAt: source.checkedAt,
    sessionKey: config.canonicalSessionId,
    summary: {
      checkedAt: source.checkedAt,
      trackName: source.trackName ?? heartbeat.trackName ?? null,
      flag,
      lap: normalizedHeartbeat.lapNumber,
      totalLaps: normalizedHeartbeat.totalLaps,
      sourceTier: SOURCE_TIER,
      clockBasis: 'utc_capture_timestamp',
      observationBasis: 'observed_source_snapshot',
      interpolated: false,
      noGps: true,
    },
    raw: {
      timing: {timing_results: {heartbeat: normalizedHeartbeat, Item: items}},
      drivers_nxt: {
        drivers: {
          driver: bryce
            ? [{driverid: '2143', firstname: bryce.firstName ?? 'Bryce', lastname: bryce.lastName ?? 'Aron', no: String(bryce.no ?? '9')}]
            : [],
        },
      },
      config: {track_map_url: ''},
      schedule_nxt: {},
      trackactivity_nxt: {},
    },
  };
}

async function readCapture(config) {
  const query = `SELECT json_object(
    'sourceRowId', id,
    'checkedAt', checked_at,
    'eventId', event_id,
    'eventSessionId', event_session_id,
    'eventName', event_name,
    'sessionName', session_name,
    'flag', flag,
    'lap', lap,
    'totalLaps', total_laps,
    'sourceState', source_state,
    'bryceRank', bryce_rank,
    'bryceStatus', bryce_status,
    'bryceLaps', bryce_laps,
    'bryceGap', bryce_gap,
    'bryceBestLapTime', bryce_best_lap_time,
    'trackName', json_extract(payload_json, '$.summary.trackName'),
    'timing', json_extract(payload_json, '$.raw.timing')
  ) FROM race_snapshots WHERE session_key=${sqlQuote(config.captureSessionKey)} ORDER BY id;`;
  const remoteDb = DB_PATH.startsWith('~/') ? `"$HOME/${DB_PATH.slice(2)}"` : shellQuote(DB_PATH);
  const remoteCommand = `sqlite3 -readonly ${remoteDb} ${shellQuote(query)}`;
  const child = LOCAL_DB_PATH
    ? spawn('sqlite3', ['-readonly', `${pathToFileURL(LOCAL_DB_PATH).href}?immutable=1`, query], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn('ssh', ['-o', 'BatchMode=yes', SSH_HOST, remoteCommand], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const rows = [];
  const lines = createInterface({input: child.stdout, crlfDelay: Infinity});
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`read-only sqlite export failed for ${config.captureSessionKey}: ${stderr.trim()}`);
  return rows;
}

await mkdir(OBS_DIR, {recursive: true});
await mkdir(FEEDS_DIR, {recursive: true});
const sessions = [];

for (const config of CAPTURES) {
  const sourceRows = await readCapture(config);
  if (sourceRows.length === 0) throw new Error(`no archived rows for ${config.captureSessionKey}`);
  const expectedEventSessionId = config.captureSessionKey.split('-').at(-1);
  const expectedEventId = config.captureSessionKey.split('-')[0];
  const wrongEventRows = sourceRows.filter((row) => String(row.eventId) !== expectedEventId);
  const wrongSessionRows = sourceRows.filter((row) => String(row.eventSessionId) !== expectedEventSessionId);
  if (wrongEventRows.length > 0) {
    throw new Error(`${config.captureSessionKey} contains ${wrongEventRows.length} rows from another event`);
  }
  if (wrongSessionRows.length > 0) {
    throw new Error(`${config.captureSessionKey} contains ${wrongSessionRows.length} rows from another event session`);
  }
  const bryceIdentityRows = sourceRows.filter((row) => {
    const items = row.timing?.timing_results?.Item;
    return Array.isArray(items) && items.some((item) =>
      String(item.DriverID) === '2143' &&
      String(item.no) === '9' &&
      /bryce\s+aron/i.test(`${item.firstName ?? ''} ${item.lastName ?? ''}`),
    );
  });
  if (bryceIdentityRows.length < 120) {
    throw new Error(`${config.captureSessionKey} has only ${bryceIdentityRows.length} timing rows with Bryce identity proof`);
  }
  const timestamps = sourceRows.map((row) => Date.parse(row.checkedAt));
  const observations = sourceRows.map((row) => ({
    record: 'observation',
    canonicalSessionId: config.canonicalSessionId,
    sourceSessionKey: config.captureSessionKey,
    sourceRowId: row.sourceRowId,
    observedAt: row.checkedAt,
    sourceTier: SOURCE_TIER,
    clockBasis: 'utc_capture_timestamp',
    observationBasis: 'observed_source_snapshot',
    interpolated: false,
    noGps: true,
    sourceState: row.sourceState,
    flag: row.flag,
    lap: row.lap,
    totalLaps: row.totalLaps,
    bryce: {
      rank: row.bryceRank,
      status: row.bryceStatus,
      laps: row.bryceLaps,
      gap: row.bryceGap,
      bestLapTime: row.bryceBestLapTime,
    },
    field: normalizedField(row.timing),
  }));
  const observedArtifact = `analysis/semantic-layer/output/live-captures/${config.canonicalSessionId}.ndjson.gz`;
  const observedArtifactPath = join(OBS_DIR, `${config.canonicalSessionId}.ndjson.gz`);
  await writeGzipNdjson(observedArtifactPath, observations);
  const observedArtifactSha256 = await sha256File(observedArtifactPath);

  let replayArtifact = null;
  let replayArtifactSha256 = null;
  let feedRows = [];
  let racingWindowRows = [];
  let activeWindowEndBoundary = null;
  let terminalFlagObservationLatencySeconds = null;
  let finalOrder = [];
  if (config.sessionType === 'race') {
    const usable = bryceIdentityRows
      .map((row) => feedRow(row, config))
      .filter((row) => row.raw.timing.timing_results.Item.length > 0);
    const firstGreen = usable.findIndex((row) => row.summary.flag === 'GREEN');
    const firstCheckered = usable.findIndex(
      (row, index) => index >= firstGreen && row.summary.flag === 'CHECKERED',
    );
    if (firstGreen < 0 || firstCheckered < firstGreen) {
      throw new Error(`${config.captureSessionKey} has no usable green-to-checkered window`);
    }
    feedRows = usable.slice(firstGreen, firstCheckered + 1);
    const finishLineOffset = feedRows.findIndex((row) => {
      const lap = Number(row.summary.lap);
      const total = Number(row.summary.totalLaps);
      return Number.isFinite(lap) && Number.isFinite(total) && total > 0 && lap >= total;
    });
    const finishLineIndex = finishLineOffset >= 0 ? finishLineOffset : feedRows.length - 1;
    racingWindowRows = feedRows.slice(0, finishLineIndex + 1);
    activeWindowEndBoundary = 'first_observation_where_leader_lap_reaches_total_laps';
    terminalFlagObservationLatencySeconds = Number(
      ((Date.parse(feedRows.at(-1).checkedAt) - Date.parse(racingWindowRows.at(-1).checkedAt)) / 1000).toFixed(3),
    );
    replayArtifact = `analysis/replay-feeds/output/feeds/rc_capture_${config.canonicalSessionId}.ndjson.gz`;
    const replayArtifactPath = join(FEEDS_DIR, `rc_capture_${config.canonicalSessionId}.ndjson.gz`);
    await writeGzipNdjson(replayArtifactPath, feedRows);
    replayArtifactSha256 = await sha256File(replayArtifactPath);
    finalOrder = [...feedRows.at(-1).raw.timing.timing_results.Item]
      .filter((row) => Number(row.rank ?? row.liveRank) > 0)
      .sort((a, b) => Number(a.rank ?? a.liveRank) - Number(b.rank ?? b.liveRank))
      .map((row) => String(row.no));
  } else {
    const firstGreen = sourceRows.findIndex((row) => String(row.flag).toUpperCase() === 'GREEN');
    const checkered = config.qualifyingEndBoundary === 'first_checkered'
      ? sourceRows.findIndex((row, index) => index >= firstGreen && String(row.flag).toUpperCase() === 'CHECKERED')
      : sourceRows.findLastIndex((row) => String(row.flag).toUpperCase() === 'CHECKERED');
    if (firstGreen >= 0 && checkered >= firstGreen) {
      racingWindowRows = sourceRows.slice(firstGreen, checkered + 1);
      activeWindowEndBoundary = config.qualifyingEndBoundary === 'first_checkered'
        ? 'first_observed_checkered_flag'
        : 'last_observed_checkered_flag';
    }
  }

  const entry = {
    canonicalSessionId: config.canonicalSessionId,
    canonicalAliases: config.canonicalAliases ?? [],
    captureSessionKey: config.captureSessionKey,
    sessionType: config.sessionType,
    sourceTier: SOURCE_TIER,
    clockBasis: 'utc_capture_timestamp',
    sourceLabel: 'BryceCast capture of INDYCAR Race Control timing',
    observationBasis: 'observed_source_snapshot',
    interpolated: false,
    noGps: true,
    observedStart: sourceRows[0].checkedAt,
    observedEnd: sourceRows.at(-1).checkedAt,
    observationCount: sourceRows.length,
    usableStateObservationCount: sourceRows.filter((row) => normalizedField(row.timing).length > 0).length,
    bryceObservationCount: sourceRows.filter((row) => row.bryceRank != null).length,
    bryceFieldIdentityObservationCount: bryceIdentityRows.length,
    fieldRowsOmittedFromReplayForMissingBryceIdentity: sourceRows.length - bryceIdentityRows.length,
    cadence: cadence(timestamps),
    racingWindow: racingWindowRows.length
      ? {
          startFlag: 'GREEN',
          endBoundary: activeWindowEndBoundary,
          observedStart: racingWindowRows[0]?.checkedAt ?? null,
          observedEnd: racingWindowRows.at(-1)?.checkedAt ?? null,
          observationCount: racingWindowRows.length,
          cadence: cadence(racingWindowRows.map((row) => Date.parse(row.checkedAt))),
          checkeredObservedAt: config.sessionType === 'race'
            ? feedRows.at(-1)?.checkedAt ?? null
            : racingWindowRows.at(-1)?.checkedAt ?? null,
          terminalFlagObservationLatencySeconds,
        }
      : null,
    bryceLapCoverage: bryceLapCoverage(sourceRows),
    observedArtifact,
    observedArtifactSha256,
    replayArtifact,
    replayArtifactSha256,
    replaySamples: feedRows.length,
    finalOrder,
  };
  sessions.push(entry);
  process.stdout.write(`${config.captureSessionKey} -> ${config.canonicalSessionId}: ${entry.observationCount} observed, ${entry.replaySamples} replay\n`);
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    host: LOCAL_DB_PATH ? 'verified local backup' : SSH_HOST,
    database: LOCAL_DB_PATH ? LOCAL_DB_PATH.replace(homedir(), '~') : DB_PATH,
    databaseSha256: SOURCE_DATABASE_SHA256,
    access: LOCAL_DB_PATH ? 'sqlite3 -readonly immutable local backup' : 'sqlite3 -readonly over SSH',
    mutation: false,
  },
  sessions,
};
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`manifest: ${MANIFEST_PATH}\n`);
