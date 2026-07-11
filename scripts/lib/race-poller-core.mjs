import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { isBryceProfile, isBryceTimingRow } from '../live-source-endpoints.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const defaultRoot = dirname(dirname(__dirname));

export const liveStoragePaths = (root = defaultRoot) => {
  const dataDir = join(root, 'data/live');
  const publicDataDir = join(root, 'public/data');
  return {
    root,
    dataDir,
    publicDataDir,
    sqlitePath: join(dataDir, 'brycecast.sqlite'),
    jsonlPath: join(dataDir, 'snapshots.jsonl'),
    latestPath: join(dataDir, 'latest-snapshot.json'),
    publicLatestPath: join(publicDataDir, 'live-snapshot.json')
  };
};

export const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const ageSeconds = (value, now = Date.now()) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? Math.max(0, Math.round((now - parsed) / 1000)) : null;
};

export const formatAge = (seconds) => {
  if (seconds === null || seconds === undefined) return 'age unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};

export const describeBryceMiss = (heartbeat, timingRows) => {
  const carNine = timingRows.find((row) => String(row?.no) === '9');
  const event = heartbeat?.eventName ? ` at ${heartbeat.eventName}` : '';
  const series = heartbeat?.Series ? `Series ${heartbeat.Series}` : 'unknown series';
  const carNineNote = carNine ? ' A different car #9 exists in that feed.' : '';
  return `Current Race Control timing feed is ${series}${event} and does not contain Bryce Aron.${carNineNote}`;
};

export const sourceState = (heartbeat) => {
  if (!heartbeat) return 'error';
  const flags = `${heartbeat.currentFlag ?? ''} ${heartbeat.SessionStatus ?? ''} ${heartbeat.SessionType ?? ''}`.toUpperCase();
  const lap = safeNumber(heartbeat.lapNumber);
  const total = safeNumber(heartbeat.totalLaps);
  const complete = lap !== null && total !== null && total > 0 && lap >= total;
  return flags.includes('COLD') || flags.includes('CHECKER') || flags.includes('COMPLETE') || complete ? 'cold' : 'live';
};

export const fetchEndpoint = async (endpoint, { timeoutMs = 5000, cacheBust = false } = {}) => {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = cacheBust ? `${endpoint.url}${endpoint.url.includes('?') ? '&' : '?'}t=${Date.now()}` : endpoint.url;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    return {
      ...endpoint,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      lastModified: response.headers.get('last-modified'),
      etag: response.headers.get('etag'),
      bytes: Buffer.byteLength(text),
      fetchedAt,
      payload,
      error: response.ok ? null : `${response.status} ${response.statusText}`
    };
  } catch (error) {
    return {
      ...endpoint,
      ok: false,
      status: 0,
      contentType: null,
      lastModified: null,
      etag: null,
      bytes: 0,
      fetchedAt,
      payload: null,
      error: error?.name === 'AbortError' ? `Timed out after ${timeoutMs} ms` : error instanceof Error ? error.message : 'Unknown fetch error'
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const pendingEndpointResult = (endpoint, note, fetchedAt = new Date().toISOString()) => ({
  ...endpoint,
  ok: false,
  status: 0,
  contentType: null,
  lastModified: null,
  etag: null,
  bytes: 0,
  fetchedAt,
  payload: null,
  error: note
});

export const buildSummary = (results, { root = defaultRoot } = {}) => {
  const paths = liveStoragePaths(root);
  const timingResult = results.find((result) => result.id === 'timing');
  const timing = timingResult?.payload?.timing_results;
  const drivers = results.find((result) => result.id === 'drivers_nxt')?.payload?.drivers?.driver ?? [];
  const config = results.find((result) => result.id === 'config')?.payload ?? {};
  const heartbeat = timing?.heartbeat ?? {};
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  const bryce = timingRows.find((row) => isBryceTimingRow(row, heartbeat)) ?? null;
  const bryceProfile = Array.isArray(drivers) ? drivers.find(isBryceProfile) ?? null : null;
  const checkedAt = new Date().toISOString();
  const sessionKey = `${heartbeat.EventID ?? 'unknown'}-${heartbeat.EventSessionID ?? heartbeat.SessionName ?? 'unknown'}`;
  const state = sourceState(heartbeat);
  const timingUnavailable = !timingResult?.ok || !timing?.heartbeat;
  const endpointSummaries = results.map((result) => ({
    id: result.id,
    label: result.label,
    series: result.series ?? null,
    cadence: result.cadence ?? null,
    role: result.role ?? null,
    proxyPath: result.proxyPath ?? null,
    url: result.url,
    ok: result.ok,
    status: result.status,
    bytes: result.bytes,
    fetchedAt: result.fetchedAt,
    lastModified: result.lastModified,
    etag: result.etag,
    checkedAgeSeconds: ageSeconds(result.fetchedAt),
    modifiedAgeSeconds: ageSeconds(result.lastModified),
    freshnessLabel: result.ok
      ? `checked ${formatAge(ageSeconds(result.fetchedAt))}; ${result.lastModified ? `modified ${formatAge(ageSeconds(result.lastModified))}` : 'no Last-Modified header'}`
      : `fetch failed; checked ${formatAge(ageSeconds(result.fetchedAt))}`,
    note: result.ok ? `${result.bytes} bytes` : result.error
  }));

  return {
    schemaVersion: 1,
    checkedAt,
    sessionKey,
    eventId: heartbeat.EventID ?? '',
    eventSessionId: heartbeat.EventSessionID ?? '',
    eventName: heartbeat.eventName ?? 'Unknown event',
    trackName: heartbeat.trackName ?? 'Unknown track',
    trackLength: safeNumber(heartbeat.trackLength),
    trackType: heartbeat.trackType ?? '',
    sessionName: heartbeat.SessionName ?? '',
    sessionType: heartbeat.SessionType ?? '',
    sessionStatus: heartbeat.SessionStatus ?? '',
    flag: heartbeat.currentFlag ?? '',
    lap: heartbeat.lapNumber ?? '',
    totalLaps: heartbeat.totalLaps ?? '',
    sourceState: timingUnavailable ? 'error' : bryce ? state : 'stale',
    rowCount: timingRows.length,
    bryceUnavailableReason: bryce
      ? undefined
      : timingUnavailable
        ? `Race Control timing payload unavailable: ${timingResult?.error ?? 'missing timing heartbeat'}.`
        : describeBryceMiss(heartbeat, timingRows),
    bryce: bryce
      ? {
          no: bryce.no,
          rank: safeNumber(bryce.rank),
          liveRank: safeNumber(bryce.liveRank),
          startPosition: safeNumber(bryce.startPosition),
          laps: bryce.laps ?? '',
          status: bryce.status ?? '',
          marker: bryce.marker ?? '',
          comment: bryce.comment ?? '',
          gap: bryce.gap ?? '',
          liveGap: bryce.liveGap ?? '',
          diff: bryce.diff ?? '',
          bestLapTime: bryce.bestLapTime ?? '',
          bestLap: bryce.bestLap ?? '',
          lastLapTime: bryce.lastLapTime ?? '',
          bestSpeed: bryce.BestSpeed ?? '',
          lastSpeed: bryce.LastSpeed ?? '',
          averageSpeed: bryce.AverageSpeed ?? '',
          passes: safeNumber(bryce.Passes),
          passed: safeNumber(bryce.Passed),
          pitStops: safeNumber(bryce.pitStops),
          lastPitLap: safeNumber(bryce.lastPitLap),
          sincePitLap: safeNumber(bryce.sincePitLap),
          tire: bryce.Tire ?? '',
          overtakeRemain: safeNumber(bryce.OverTake_Remain),
          overtakeActive: bryce.OverTake_Active ?? '',
          lapDistance: safeNumber(bryce.lapDistance),
          liveDiffAhead: bryce.liveDiffAhead ?? '',
          liveDiffBehind: bryce.liveDiffBehind ?? '',
          totalDriverPoints: safeNumber(bryce.totalDriverPoints),
          totalEntrantPoints: safeNumber(bryce.totalEntrantPoints),
          runningDriverPoints: safeNumber(bryce.runningDriverPoints),
          radiofrequency: bryceProfile?.radiofrequency ?? ''
        }
      : null,
    storage: {
      sqlite: relative(root, paths.sqlitePath),
      jsonl: relative(root, paths.jsonlPath),
      latest: relative(root, paths.latestPath),
      publicLatest: relative(root, paths.publicLatestPath)
    },
    trackMapUrl: config.track_map_url ?? '',
    endpoints: endpointSummaries
  };
};

export const openDb = (root = defaultRoot) => {
  const { sqlitePath } = liveStoragePaths(root);
  const db = new DatabaseSync(sqlitePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS race_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      event_id TEXT,
      event_session_id TEXT,
      event_name TEXT,
      session_name TEXT,
      flag TEXT,
      lap TEXT,
      total_laps TEXT,
      source_state TEXT NOT NULL,
      bryce_rank INTEGER,
      bryce_status TEXT,
      bryce_laps TEXT,
      bryce_gap TEXT,
      bryce_best_lap_time TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_race_snapshots_session_checked ON race_snapshots(session_key, checked_at);
    CREATE TABLE IF NOT EXISTS source_probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      endpoint_id TEXT NOT NULL,
      url TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      last_modified TEXT,
      etag TEXT,
      note TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES race_snapshots(id)
    );
    CREATE TABLE IF NOT EXISTS bryce_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      rank INTEGER,
      live_rank INTEGER,
      start_position INTEGER,
      laps TEXT,
      status TEXT,
      comment TEXT,
      gap TEXT,
      live_gap TEXT,
      diff TEXT,
      best_lap_time TEXT,
      best_lap TEXT,
      last_lap_time TEXT,
      best_speed TEXT,
      last_speed TEXT,
      average_speed TEXT,
      passes INTEGER,
      passed INTEGER,
      pit_stops INTEGER,
      last_pit_lap INTEGER,
      since_pit_lap INTEGER,
      tire TEXT,
      overtake_remain INTEGER,
      overtake_active TEXT,
      lap_distance REAL,
      live_diff_ahead TEXT,
      live_diff_behind TEXT,
      total_driver_points INTEGER,
      total_entrant_points INTEGER,
      running_driver_points INTEGER,
      radiofrequency TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES race_snapshots(id)
    );
  `);
  const existingColumns = new Set(db.prepare('PRAGMA table_info(bryce_samples)').all().map((column) => column.name));
  for (const [column, definition] of [
    ['best_lap', 'TEXT'],
    ['average_speed', 'TEXT'],
    ['last_pit_lap', 'INTEGER'],
    ['since_pit_lap', 'INTEGER'],
    ['tire', 'TEXT'],
    ['overtake_remain', 'INTEGER'],
    ['overtake_active', 'TEXT'],
    ['lap_distance', 'REAL'],
    ['live_diff_ahead', 'TEXT'],
    ['live_diff_behind', 'TEXT'],
    ['total_driver_points', 'INTEGER'],
    ['total_entrant_points', 'INTEGER'],
    ['running_driver_points', 'INTEGER'],
    ['radiofrequency', 'TEXT']
  ]) {
    if (!existingColumns.has(column)) {
      db.exec(`ALTER TABLE bryce_samples ADD COLUMN ${column} ${definition}`);
    }
  }
  return db;
};

export const writeStorage = async (summary, results, { root = defaultRoot, dryRun = false } = {}) => {
  if (dryRun) {
    return { wrote: false, snapshotId: null };
  }

  const paths = liveStoragePaths(root);
  await mkdir(paths.dataDir, { recursive: true });
  await mkdir(paths.publicDataDir, { recursive: true });

  const db = openDb(root);
  let snapshotId = null;
  try {
    const insertSnapshot = db.prepare(`
      INSERT INTO race_snapshots (
        checked_at, session_key, event_id, event_session_id, event_name, session_name, flag, lap, total_laps,
        source_state, bryce_rank, bryce_status, bryce_laps, bryce_gap, bryce_best_lap_time, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertProbe = db.prepare(`
      INSERT INTO source_probes (snapshot_id, endpoint_id, url, ok, status, bytes, last_modified, etag, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBryce = db.prepare(`
      INSERT INTO bryce_samples (
        snapshot_id, checked_at, session_key, rank, live_rank, start_position, laps, status, comment, gap,
        live_gap, diff, best_lap_time, best_lap, last_lap_time, best_speed, last_speed, average_speed,
        passes, passed, pit_stops, last_pit_lap, since_pit_lap, tire, overtake_remain, overtake_active,
        lap_distance, live_diff_ahead, live_diff_behind, total_driver_points, total_entrant_points,
        running_driver_points, radiofrequency
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const rawPayload = {
      summary,
      raw: Object.fromEntries(results.map((result) => [result.id, result.payload]))
    };
    const snapshotResult = insertSnapshot.run(
      summary.checkedAt,
      summary.sessionKey,
      summary.eventId,
      summary.eventSessionId,
      summary.eventName,
      summary.sessionName,
      summary.flag,
      summary.lap,
      summary.totalLaps,
      summary.sourceState,
      summary.bryce?.rank ?? null,
      summary.bryce?.status ?? null,
      summary.bryce?.laps ?? null,
      summary.bryce?.gap ?? null,
      summary.bryce?.bestLapTime ?? null,
      JSON.stringify(rawPayload)
    );
    snapshotId = Number(snapshotResult.lastInsertRowid);

    for (const endpoint of summary.endpoints) {
      insertProbe.run(snapshotId, endpoint.id, endpoint.url, endpoint.ok ? 1 : 0, endpoint.status, endpoint.bytes, endpoint.lastModified, endpoint.etag, endpoint.note);
    }

    if (summary.bryce) {
      insertBryce.run(
        snapshotId,
        summary.checkedAt,
        summary.sessionKey,
        summary.bryce.rank,
        summary.bryce.liveRank,
        summary.bryce.startPosition,
        summary.bryce.laps,
        summary.bryce.status,
        summary.bryce.comment,
        summary.bryce.gap,
        summary.bryce.liveGap,
        summary.bryce.diff,
        summary.bryce.bestLapTime,
        summary.bryce.bestLap,
        summary.bryce.lastLapTime,
        summary.bryce.bestSpeed,
        summary.bryce.lastSpeed,
        summary.bryce.averageSpeed,
        summary.bryce.passes,
        summary.bryce.passed,
        summary.bryce.pitStops,
        summary.bryce.lastPitLap,
        summary.bryce.sincePitLap,
        summary.bryce.tire,
        summary.bryce.overtakeRemain,
        summary.bryce.overtakeActive,
        summary.bryce.lapDistance,
        summary.bryce.liveDiffAhead,
        summary.bryce.liveDiffBehind,
        summary.bryce.totalDriverPoints,
        summary.bryce.totalEntrantPoints,
        summary.bryce.runningDriverPoints,
        summary.bryce.radiofrequency
      );
    }
  } finally {
    db.close();
  }

  const line = `${JSON.stringify(summary)}\n`;
  await appendFile(paths.jsonlPath, line);
  await writeFile(paths.latestPath, JSON.stringify(summary, null, 2));
  await writeFile(paths.publicLatestPath, JSON.stringify(summary, null, 2));
  return { wrote: true, snapshotId };
};
