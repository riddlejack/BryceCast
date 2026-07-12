import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { bryceCarNumber, isBryceProfile, isBryceTimingRow, isIndyNxtTimingHeartbeat, liveSourceEndpoints, raceSnapshotEndpoints } from './live-source-endpoints.mjs';
import { buildPointsProjectionState } from './live-points-state.mjs';
import { createReplayOverlay } from './lib/replay-overlay.mjs';
import {
  buildUpcomingIndyNxtWeatherReport,
  fetchCachedLiveWeatherForTrack,
  loadUpcomingIndyNxtEvents,
  loadTrackMetadata
} from './live-weather-service.mjs';

export { buildPointsProjectionState };

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const dataDir = join(root, 'data/live');
const publicDataDir = join(root, 'public/data');
const sqlitePath = resolve(process.env.BRYCECAST_SQLITE_PATH ?? join(dataDir, 'brycecast.sqlite'));
const runnerStatusPath = resolve(process.env.BRYCECAST_RUNNER_STATUS_PATH ?? join(dirname(sqlitePath), 'live-runner-status.json'));
const latestSnapshotPath = join(publicDataDir, 'live-snapshot.json');
const onboardCatalogPath = join(publicDataDir, 'onboard-catalog.json');
const historyPath = join(publicDataDir, 'history-bryce.json');
const povProofPath = join(dataDir, 'pov-proof.json');
const audioProofPath = join(dataDir, 'audio-proof.json');

const raceControlEndpoints = raceSnapshotEndpoints;
const sourceProbeEndpoints = liveSourceEndpoints;
const sourceFetchTimeoutMs = Number(process.env.BRYCECAST_SOURCE_FETCH_TIMEOUT_MS ?? 5000);
const enrichmentCacheTtlMs = 30000;
const apiCacheRefreshMs = Number(process.env.BRYCECAST_API_CACHE_REFRESH_MS ?? 15000);
const apiRunnerFreshMs = Number(process.env.BRYCECAST_API_RUNNER_FRESH_MS ?? 60000);
const replayEnabled = process.env.BRYCECAST_REPLAY === '1';
const replayOverlay = createReplayOverlay({ enabled: replayEnabled, sqlitePath, runnerStatusPath });

const sourceUrlByPath = new Map(sourceProbeEndpoints.map((endpoint) => [endpoint.proxyPath, endpoint.url]));
const sourceEndpointByPath = new Map(sourceProbeEndpoints.map((endpoint) => [endpoint.proxyPath, endpoint]));
const sourceEndpointById = new Map(sourceProbeEndpoints.map((endpoint) => [endpoint.id, endpoint]));
const endpointResultCache = new Map();
const endpointRefreshes = new Map();

const defaultRouteUrls = {
  fs1: 'https://www.foxsports.com/live/fs1',
  fs2: 'https://www.foxsports.com/live/fs2',
  hulu: 'https://www.hulu.com/live-tv',
  xfinity: 'https://www.xfinity.com/stream/',
  indycarLive: 'https://www.indycarlive.com',
  indycarRadio: 'https://www.indycar.com/Radio'
};

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const port = Number(argValue('port', process.env.PORT ?? '8787'));
const host = argValue('host', process.env.HOST ?? '0.0.0.0');
const staticArg = argValue('static', '');
const staticDir = staticArg ? resolve(root, staticArg) : null;

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept'
};

const historySchemaVersion = 'history-bryce.v1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const ageSeconds = (value, now = Date.now()) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? Math.max(0, Math.round((now - parsed) / 1000)) : null;
};

const formatAge = (seconds) => {
  if (seconds === null || seconds === undefined) return 'age unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};

const average = (values) => {
  const clean = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const roundOne = (value) => (value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10) / 10);

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const bryceRcDriverId = '2143';

const fallbackBryceProfile = (bryce = null) => ({
  driverid: '4959',
  rc_driver_id: bryceRcDriverId,
  name: 'Bryce Aron',
  firstname: 'Bryce',
  lastname: 'Aron',
  number: bryce?.no ?? '9',
  team: '',
  headshot: '',
  heroshot: '',
  waistupimage: '',
  carillustration: '',
  endplatesmall: '',
  radiofrequency: '',
  hometown: '',
  residence: '',
  website: '',
  stats: {
    starts: '',
    poles: '',
    wins: '',
    top5: '',
    top10: '',
    avgstart: '',
    avgfinish: '',
    lapsled: '',
    running: '',
    points: ''
  }
});

const describeBryceMiss = (heartbeat, timingRows) => {
  const carNine = timingRows.find((row) => String(row?.no) === '9');
  const currentSeries = heartbeat?.Series ? `Series ${heartbeat.Series}` : 'unknown series';
  const currentEvent = heartbeat?.eventName ? ` at ${heartbeat.eventName}` : '';
  const carNineNote = carNine ? ' A different car #9 exists in that feed.' : '';
  return `Current Race Control timing feed is ${currentSeries}${currentEvent} and does not contain Bryce Aron.${carNineNote}`;
};

const sourceState = (heartbeat) => {
  if (!heartbeat) return 'error';
  const flags = `${heartbeat.currentFlag ?? ''} ${heartbeat.SessionStatus ?? ''} ${heartbeat.SessionType ?? ''}`.toUpperCase();
  const lap = safeNumber(heartbeat.lapNumber);
  const total = safeNumber(heartbeat.totalLaps);
  const complete = lap !== null && total !== null && total > 0 && lap >= total;
  return flags.includes('COLD') || flags.includes('CHECKER') || flags.includes('COMPLETE') || complete ? 'cold' : 'live';
};

const isActiveTimingHeartbeat = (heartbeat) => {
  if (sourceState(heartbeat) !== 'live') return false;
  const flags = `${heartbeat?.currentFlag ?? ''} ${heartbeat?.SessionStatus ?? ''}`.toUpperCase();
  if (flags.includes('GREEN') || flags.includes('YELLOW')) return true;
  return false;
};

const historyPoints = (payload) => (Array.isArray(payload?.points) ? payload.points : []);

const isOfficialHistoryPoint = (point) => String(point?.source ?? '').toLowerCase().includes('official');

const historyMeta = (payload) => {
  const points = historyPoints(payload);
  const officialRows = points.filter(isOfficialHistoryPoint).length;
  const checkedAgeSeconds = ageSeconds(payload?.checkedAt);
  const source = String(payload?.source ?? 'unknown');
  const sourceFingerprint = `${historySchemaVersion}:${source}:${points.length}:${officialRows}:${payload?.checkedAt ?? 'unchecked'}`;
  return {
    schemaVersion: historySchemaVersion,
    seasonYear: 2026,
    rows: points.length,
    officialRows,
    provisionalRows: points.length - officialRows,
    checkedAt: payload?.checkedAt ?? null,
    checkedAgeSeconds,
    checkedAgeLabel: formatAge(checkedAgeSeconds),
    source,
    sourceFingerprint
  };
};

const historySplits = (payload) =>
  ['Street', 'Road', 'Oval']
    .map((trackType) => {
      const rows = historyPoints(payload).filter((point) => point.type === trackType);
      const finishes = rows.map((point) => point.finish);
      return {
        trackType,
        starts: rows.length,
        averageStart: roundOne(average(rows.map((point) => point.start))),
        averageFinish: roundOne(average(finishes)),
        averageDelta: roundOne(average(rows.map((point) => point.start - point.finish))),
        bestFinish: finishes.length ? Math.min(...finishes) : null,
        top10s: finishes.filter((finish) => finish <= 10).length,
        averageBestLapRank: roundOne(average(rows.map((point) => point.bestLapRank).filter((rank) => rank > 0))),
        officialRows: rows.filter(isOfficialHistoryPoint).length,
        provisionalRows: rows.filter((point) => !isOfficialHistoryPoint(point)).length
      };
    })
    .filter((row) => row.starts > 0);

const historyBench = (payload) => {
  const points = historyPoints(payload);
  const currentYear = payload?.yearSummaries?.find((summary) => summary.year === 2026);
  return [
    {
      name: 'Bryce Aron',
      driverId: 'bryce',
      year: 2026,
      starts: currentYear?.starts ?? points.length,
      bestFinish: payload?.bryceStanding?.bestFinish ?? currentYear?.bestFinish ?? null,
      top10s: payload?.bryceStanding?.top10 ?? currentYear?.top10s ?? null,
      averageFinish: roundOne(currentYear?.averageFinish ?? average(points.map((point) => point.finish)))
    },
    ...asArray(payload?.teammateSummaries).map((row) => ({
      name: row.name,
      driverId: row.driverId,
      year: row.year ?? 2026,
      starts: row.starts,
      bestFinish: row.bestFinish,
      top10s: row.top10s ?? null,
      averageFinish: roundOne(row.averageFinish)
    }))
  ]
    .filter((row) => Number(row.starts) > 0)
    .sort((left, right) => Number(left.averageFinish ?? 99) - Number(right.averageFinish ?? 99));
};

const withHistoryMeta = (payload) => ({
  ...payload,
  meta: historyMeta(payload)
});

const compactHistory = (payload) => {
  const points = historyPoints(payload);
  const deltaRows = points
    .map((point) => ({ race: point.race, type: point.type, start: point.start, finish: point.finish, delta: point.start - point.finish, source: point.source ?? null }))
    .sort((left, right) => right.delta - left.delta);
  return {
    meta: historyMeta(payload),
    bryceStanding: payload?.bryceStanding ?? null,
    currentYear: payload?.yearSummaries?.find((summary) => summary.year === 2026) ?? null,
    latestRace: points.at(-1) ?? null,
    trackSplits: historySplits(payload),
    bestGain: deltaRows[0] ?? null,
    largestLoss: deltaRows.at(-1) ?? null,
    bestLapRank: points
      .filter((point) => point.bestLapRank > 0)
      .sort((left, right) => left.bestLapRank - right.bestLapRank)[0] ?? null,
    teammateBench: historyBench(payload)
  };
};

const networkKind = (name = '') => {
  const normalized = name.toLowerCase();
  if (normalized.includes('radio') || normalized.includes('sirius')) return 'audio';
  if (normalized.includes('indycar live')) return 'international';
  if (normalized.includes('app')) return 'app';
  if (normalized.includes('fs1') || normalized.includes('fs2') || normalized.includes('fox')) return 'video';
  return 'fallback';
};

const normalizeNetwork = (network, fallbackIndex) => {
  const name = network?.name?.trim();
  const url = network?.url?.trim();
  if (!name || !url) return null;
  return {
    id: network.id ?? `${name}-${fallbackIndex}`,
    name,
    url,
    logoPositive: network.logo_image_positive,
    logoNegative: network.logo_image_negative,
    kind: networkKind(name)
  };
};

const normalizeWatchLink = (link, fallbackIndex) => {
  const name = link?.image?.alt?.trim() || link?.text?.trim();
  const url = link?.url?.trim();
  if (!name || !url) return null;
  return {
    id: `config-${fallbackIndex}-${name}`,
    name,
    url,
    logoPositive: link.image?.source,
    kind: networkKind(name)
  };
};

const routeFromNetworks = ({ heartbeat, eventName, sessionName, sessionType, startsAt, endsAt, estimatedGreenFlag, source, note, networks }) => {
  const unique = networks.filter((network, index, all) => all.findIndex((candidate) => candidate.name === network.name && candidate.url === network.url) === index);
  const priority = ['FS1', 'FOX', 'FS2', 'Fox One', 'INDYCAR LIVE'];
  const priorityIndex = (network) => {
    const index = priority.findIndex((name) => network.name.includes(name));
    return index === -1 ? 99 : index;
  };
  const video = unique
    .filter((network) => network.kind === 'video')
    .sort((left, right) => priorityIndex(left) - priorityIndex(right));
  const primaryVideo = video[0];

  return {
    eventId: heartbeat.EventID ?? '',
    sessionId: heartbeat.EventSessionID ?? '',
    eventName,
    sessionName,
    sessionType,
    startsAt,
    endsAt,
    estimatedGreenFlag,
    primaryVideo,
    alternates: unique.filter((network) => network.kind !== 'audio' && network.kind !== 'international' && network !== primaryVideo),
    audio: unique.filter((network) => network.kind === 'audio'),
    international: unique.filter((network) => network.kind === 'international'),
    source,
    note
  };
};

const buildTrackActivityRoute = (payload, heartbeat) => {
  const event = asArray(payload?.trackactivity?.event).find((candidate) => String(candidate.eventid) === String(heartbeat.EventID));
  const session = asArray(event?.sessions?.session).find((candidate) => String(candidate.sessionid) === String(heartbeat.EventSessionID));
  if (!event || !session) return null;

  const networks = asArray(session.networks?.network)
    .map((network, index) => normalizeNetwork(network, index))
    .filter(Boolean);
  if (networks.length === 0) return null;

  return routeFromNetworks({
    heartbeat,
    eventName: event.eventname ?? heartbeat.eventName,
    sessionName: session.sessionlabel ?? heartbeat.SessionName,
    sessionType: session.sessiontype ?? heartbeat.SessionType,
    startsAt: session.startdatetime ?? '',
    endsAt: session.enddatetime,
    estimatedGreenFlag: session.estimatedgreenflag,
    source: 'trackactivity',
    note: `Matched current EventSessionID ${heartbeat.EventSessionID} from track activity.`,
    networks
  });
};

const buildScheduleRoute = (payload, heartbeat) => {
  const race = asArray(payload?.schedule?.race).find((candidate) => String(candidate.eventid) === String(heartbeat.EventID));
  if (!race) return null;

  const broadcasts = asArray(race.broadcasts?.broadcast);
  const sessionBroadcast =
    broadcasts.find((broadcast) => broadcast.name?.toLowerCase().includes(String(heartbeat.SessionName ?? '').toLowerCase())) ??
    broadcasts.find((broadcast) => broadcast.name?.toLowerCase().includes(String(heartbeat.SessionType ?? '').toLowerCase())) ??
    broadcasts[0];
  const listing = race.tv?.listing;
  const broadcastNetworks = asArray(sessionBroadcast?.networks?.network)
    .map((network, index) => normalizeNetwork(network, index))
    .filter(Boolean);
  const listingNetwork =
    listing?.channel && listing.datetime
      ? {
          id: `listing-${listing.channel}`,
          name: listing.channel,
          url: listing.channel.toUpperCase() === 'FS2' ? defaultRouteUrls.fs2 : defaultRouteUrls.fs1,
          logoPositive: listing.channel_logo_positive,
          logoNegative: listing.channel_logo_negative,
          kind: networkKind(listing.channel)
        }
      : null;
  const networks = listingNetwork ? [listingNetwork, ...broadcastNetworks] : broadcastNetworks;
  if (networks.length === 0) return null;

  return routeFromNetworks({
    heartbeat,
    eventName: race.name ?? heartbeat.eventName,
    sessionName: sessionBroadcast?.name ?? listing?.programname ?? heartbeat.SessionName,
    sessionType: heartbeat.SessionType,
    startsAt: sessionBroadcast?.start ?? listing?.datetime ?? '',
    endsAt: sessionBroadcast?.end,
    source: 'schedule',
    note: `Matched EventID ${heartbeat.EventID} from schedule feed.`,
    networks
  });
};

const buildConfigRoute = (payload, heartbeat) => {
  const networks = (payload?.ways_to_watch ?? [])
    .filter((link) => link.show !== false)
    .map((link, index) => normalizeWatchLink(link, index))
    .filter(Boolean);
  if (networks.length === 0) return null;

  return routeFromNetworks({
    heartbeat,
    eventName: heartbeat.eventName ?? 'Unknown event',
    sessionName: heartbeat.SessionName ?? 'Race',
    sessionType: heartbeat.SessionType ?? '',
    startsAt: '',
    source: 'config',
    note: 'Using generic Race Control watch links because no session route matched.',
    networks
  });
};

const buildUnavailableRoute = (heartbeat, note = 'Session route feeds are pending or unavailable; no authorized broadcast route is source-backed yet.') => ({
  eventId: heartbeat.EventID ?? '',
  sessionId: heartbeat.EventSessionID ?? '',
  eventName: heartbeat.eventName ?? 'Unknown event',
  sessionName: heartbeat.SessionName ?? 'Session pending',
  sessionType: heartbeat.SessionType ?? '',
  startsAt: '',
  alternates: [],
  audio: [],
  international: [],
  source: 'unavailable',
  note
});

const fetchEndpoint = async (endpoint) => {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sourceFetchTimeoutMs);
  try {
    const response = await fetch(`${endpoint.url}?t=${Date.now()}`, {
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
      error: error?.name === 'AbortError' ? `Timed out after ${sourceFetchTimeoutMs} ms` : error instanceof Error ? error.message : 'Unknown fetch error'
    };
  } finally {
    clearTimeout(timeout);
  }
};

const cacheEndpointResult = (endpoint, result) => {
  const cacheEntry = {
    result,
    checkedAt: Date.now()
  };
  endpointResultCache.set(endpoint.id, cacheEntry);
  return cacheEntry.result;
};

const fetchEndpointAndCache = async (endpoint) => {
  const result = await fetchEndpoint(endpoint);
  return cacheEndpointResult(endpoint, result);
};

const pendingEndpointResult = (endpoint, note) => ({
  ...endpoint,
  ok: false,
  status: 0,
  contentType: null,
  lastModified: null,
  etag: null,
  bytes: 0,
  fetchedAt: new Date().toISOString(),
  payload: null,
  error: note
});

const refreshEndpointInBackground = (endpoint) => {
  if (endpointRefreshes.has(endpoint.id)) return;
  const refresh = fetchEndpointAndCache(endpoint).finally(() => {
    endpointRefreshes.delete(endpoint.id);
  });
  endpointRefreshes.set(endpoint.id, refresh);
};

const cachedOrPendingEndpoint = (endpoint) => {
  const cacheEntry = endpointResultCache.get(endpoint.id);
  const cacheAgeMs = cacheEntry ? Date.now() - cacheEntry.checkedAt : Infinity;
  if (cacheAgeMs > enrichmentCacheTtlMs) refreshEndpointInBackground(endpoint);
  if (cacheEntry?.result) return cacheEntry.result;
  return pendingEndpointResult(endpoint, 'Enrichment feed refresh is pending; not blocking live timing response.');
};

const freshnessForResult = (result, state) => {
  const now = Date.now();
  const checkedAgeSeconds = ageSeconds(result.fetchedAt, now);
  const modifiedAgeSeconds = ageSeconds(result.lastModified, now);
  const checkedLabel = result.fetchedAt ? `checked ${formatAge(checkedAgeSeconds)}` : 'check time unavailable';
  const modifiedLabel = result.lastModified ? `modified ${formatAge(modifiedAgeSeconds)}` : 'no Last-Modified header';
  const freshnessLabel = result.ok ? `${checkedLabel}; ${modifiedLabel}` : `fetch failed; ${checkedLabel}`;

  return {
    fetchedAt: result.fetchedAt,
    lastModified: result.lastModified ?? null,
    etag: result.etag ?? null,
    bytes: result.bytes ?? 0,
    checkedAgeSeconds,
    modifiedAgeSeconds,
    freshnessLabel,
    state
  };
};

const parseNttDatetime = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().replace(' ', 'T');
  const parsed = Date.parse(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isFinite(parsed) ? parsed : null;
};

const sourceEndpointSemantics = (result) => {
  if (!result.ok) {
    return {
      sourceState: 'error',
      readinessState: 'error',
      sourceSummary: null,
      note: result.error
    };
  }

  if (result.id === 'ntt_data_polling') {
    const rows = Array.isArray(result.payload) ? result.payload : [];
    const latestDatetime = rows.map((row) => row?.Datetime).filter(Boolean).sort().at(-1) ?? null;
    const latestMs = parseNttDatetime(latestDatetime);
    const payloadAgeSeconds = latestMs === null ? null : Math.max(0, Math.round((Date.now() - latestMs) / 1000));
    const stale = payloadAgeSeconds === null || payloadAgeSeconds > 3600;
    return {
      sourceState: stale ? 'stale' : 'cold',
      readinessState: stale ? 'candidate_unavailable' : 'candidate_unverified',
      sourceSummary: {
        rowCount: rows.length,
        datasets: [...new Set(rows.map((row) => row?.Dataset).filter(Boolean))],
        latestDatetime,
        payloadAgeSeconds
      },
      note: stale
        ? `Candidate NTT prediction blob is reachable but stale${latestDatetime ? `; latest payload datetime ${latestDatetime}` : ''}. Treat as unavailable for INDY NXT readiness.`
        : 'Candidate NTT prediction blob is fresh enough to inspect, but must remain unverified until live INDY NXT relevance is proven.'
    };
  }

  if (result.id === 'timing') {
    const timing = result.payload?.timing_results;
    const heartbeat = timing?.heartbeat;
    const rows = Array.isArray(timing?.Item) ? timing.Item : [];
    const bryce = rows.find((row) => isBryceTimingRow(row, heartbeat)) ?? null;
    const timingState = sourceState(heartbeat);
    const sourceSummary = {
      eventName: heartbeat?.eventName ?? null,
      series: heartbeat?.Series ?? null,
      sessionName: heartbeat?.SessionName ?? null,
      sessionStatus: heartbeat?.SessionStatus ?? null,
      flag: heartbeat?.currentFlag ?? null,
      lap: heartbeat?.lapNumber ?? null,
      totalLaps: heartbeat?.totalLaps ?? null,
      eventId: heartbeat?.EventID ?? null,
      eventSessionId: heartbeat?.EventSessionID ?? null,
      trackName: heartbeat?.trackName ?? null,
      rowCount: rows.length,
      brycePresent: Boolean(bryce)
    };

    if (!heartbeat) {
      return {
        sourceState: 'error',
        readinessState: 'payload_invalid',
        sourceSummary,
        note: 'Timing endpoint is reachable but missing a Race Control heartbeat; unavailable for BryceCast readiness.'
      };
    }

    if (!bryce) {
      return {
        sourceState: timingState,
        readinessState: 'wrong_session',
        sourceSummary,
        note: `${rows.length} timing rows loaded, but no Bryce Aron timing row is present. Treat as wrong-session for BryceCast readiness.`
      };
    }

    return {
      sourceState: timingState,
      readinessState: timingState === 'live' ? 'available' : 'cold_session',
      sourceSummary,
      note: `${rows.length} timing rows loaded with Bryce Aron present; session ${heartbeat.currentFlag ?? 'unknown'}.`
    };
  }

  if (result.id === 'drivers_nxt') {
    const drivers = Array.isArray(result.payload?.drivers?.driver) ? result.payload.drivers.driver : [];
    const bryce = drivers.find(isBryceProfile) ?? null;
    const sourceSummary = {
      driverCount: drivers.length,
      brycePresent: Boolean(bryce),
      driverid: bryce?.driverid ?? null,
      rcDriverId: bryce?.rc_driver_id ?? null,
      team: bryce?.team ?? null,
      radiofrequency: bryce?.radiofrequency ?? null,
      points: bryce?.stats?.points ?? null
    };

    if (!bryce) {
      return {
        sourceState: 'stale',
        readinessState: 'profile_unavailable',
        sourceSummary,
        note: `${drivers.length} NXT driver profiles loaded, but Bryce Aron was not present. Treat profile/radio enrichment as unavailable.`
      };
    }

    if (!bryce.radiofrequency) {
      return {
        sourceState: 'stale',
        readinessState: 'profile_partial',
        sourceSummary,
        note: 'Bryce profile loaded from NXT driver feed, but radio frequency metadata is unavailable.'
      };
    }

    return {
      sourceState: 'live',
      readinessState: 'available',
      sourceSummary,
      note: `Bryce profile loaded with radio frequency ${bryce.radiofrequency}.`
    };
  }

  if (result.role === 'wrong_series_guard_reference') {
    return {
      sourceState: 'cold',
      readinessState: 'reference_only',
      sourceSummary: null,
      note: `${result.bytes} bytes loaded. Reference-only wrong-series guard; do not treat as Bryce live timing.`
    };
  }

  return {
    sourceState: 'live',
    readinessState: 'available',
    sourceSummary: null,
    note: `${result.bytes} bytes loaded.`
  };
};

const endpointProbe = (result, state, note) => ({
  id: result.id,
  label: result.label,
  url: result.url,
  state,
  note,
  ...freshnessForResult(result, state)
});

const driverProfileEndpointProbe = (result, profile, unavailableNote) => {
  if (!profile) {
    return endpointProbe(result, 'stale', unavailableNote);
  }
  if (!profile.radiofrequency) {
    return endpointProbe(result, 'stale', 'Bryce profile loaded, but radio frequency metadata is unavailable.');
  }
  return endpointProbe(result, 'live', `Bryce profile loaded with radio frequency ${profile.radiofrequency}.`);
};

const fetchRaceControl = async () => {
  const timingEndpoint = raceControlEndpoints.find((endpoint) => endpoint.id === 'timing');
  const enrichmentEndpoints = raceControlEndpoints.filter((endpoint) => endpoint.id !== 'timing');
  const timingResult = timingEndpoint
    ? await fetchEndpointAndCache(timingEndpoint)
    : pendingEndpointResult(
        {
          id: 'timing',
          label: 'Timing and scoring',
          url: '',
          series: 'global_active_session',
          cadence: 'fast',
          role: 'primary_timing'
        },
        'Timing endpoint is not configured.'
      );
  const enrichmentResults = enrichmentEndpoints.map(cachedOrPendingEndpoint);
  return [timingResult, ...enrichmentResults];
};
const fetchSourceProbes = async () => Promise.all(sourceProbeEndpoints.map(fetchEndpointAndCache));

const readLatestArchivedRaw = () => {
  try {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT checked_at, payload_json
           FROM race_snapshots
           WHERE payload_json LIKE '%"DriverID":"2143"%'
              OR payload_json LIKE '%"DriverID":2143%'
              OR (
                payload_json LIKE '%"firstName":"Bryce"%'
                AND payload_json LIKE '%"lastName":"Aron"%'
                AND (payload_json LIKE '%"no":"9"%' OR payload_json LIKE '%"no":9%')
              )
           ORDER BY checked_at DESC
           LIMIT 500`
        )
        .all();
      for (const row of rows) {
        if (!row?.payload_json) continue;
        const payload = JSON.parse(row.payload_json);
        const timing = payload.raw?.timing?.timing_results;
        const heartbeat = timing?.heartbeat;
        const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
        if (timingRows.some((row) => isBryceTimingRow(row, heartbeat))) {
          return {
            raw: payload.raw ?? null,
            checkedAt: row.checked_at ?? payload.summary?.checkedAt ?? null
          };
        }
      }
      return null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
};

const archivedSnapshot = ({ reason, liveResults, fallbackProfile }) => {
  const archived = readLatestArchivedRaw();
  const raw = archived?.raw;
  const archivedCheckedAt = archived?.checkedAt ?? new Date().toISOString();
  const timing = raw?.timing?.timing_results;
  const heartbeat = timing?.heartbeat;
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  const drivers = raw?.drivers_nxt?.drivers?.driver ?? [];
  const config = raw?.config ?? {};
  const schedule = raw?.schedule_nxt;
  const trackActivity = raw?.trackactivity_nxt;
  const bryce = timingRows.find((row) => isBryceTimingRow(row, heartbeat));
  const archivedBryceProfile = Array.isArray(drivers) ? drivers.find(isBryceProfile) : null;
  const bryceProfile = archivedBryceProfile ?? fallbackProfile ?? fallbackBryceProfile(bryce);

  if (!heartbeat || !bryce || timingRows.length === 0) return null;

  const archivedResults = liveResults.map((result) => {
    if (result.id === 'timing') {
      return endpointProbe(result, 'stale', `${reason} Using the latest archived INDY NXT Race Control timing sample instead.`);
    }
    if (!result.ok) return endpointProbe(result, 'error', result.error);
    if (result.id === 'drivers_nxt') {
      const currentDrivers = Array.isArray(result.payload?.drivers?.driver) ? result.payload.drivers.driver : [];
      const currentBryceProfile = currentDrivers.find(isBryceProfile) ?? null;
      return driverProfileEndpointProbe(
        result,
        currentBryceProfile,
        'Archived Bryce timing fallback is active, but the current NXT driver profile feed did not prove Bryce profile/radio enrichment.'
      );
    }
    if (result.id === 'config') return endpointProbe(result, config.track_map_url ? 'live' : 'stale', config.track_map_url ? 'Track map URL found.' : 'Config loaded without map.');
    if (result.id === 'schedule_nxt') return endpointProbe(result, 'live', 'Schedule feed loaded for session broadcast routing.');
    if (result.id === 'trackactivity_nxt') return endpointProbe(result, 'live', 'Track activity feed loaded for EventSessionID routing.');
    return endpointProbe(result, 'live', `${result.bytes} bytes loaded.`);
  });

  return {
    heartbeat,
    timingRows: timingRows.sort((left, right) => Number(left.rank) - Number(right.rank)),
    bryce,
    bryceProfile,
    trackMapUrl: config.track_map_url ?? '',
    broadcastRoute: buildTrackActivityRoute(trackActivity, heartbeat) ?? buildScheduleRoute(schedule, heartbeat) ?? buildConfigRoute(config, heartbeat) ?? buildUnavailableRoute(heartbeat, 'Archived timing is available, but current route feeds did not produce a source-backed session route.'),
    updatedAt: archivedCheckedAt,
    sourceState: 'stale',
    sourceProbes: [
      endpointProbe(
        {
          id: 'bryce-row-guard',
          label: 'Bryce row guard',
          url: raceControlEndpoints.find((endpoint) => endpoint.id === 'timing')?.url ?? '',
          ok: true,
          bytes: 0,
          fetchedAt: archivedCheckedAt
        },
        'stale',
        reason
      ),
      ...archivedResults
    ]
  };
};

export const buildRaceSnapshotFromResults = (results) => {
  const timing = results.find((result) => result.id === 'timing')?.payload?.timing_results;
  const drivers = results.find((result) => result.id === 'drivers_nxt')?.payload?.drivers?.driver ?? [];
  const config = results.find((result) => result.id === 'config')?.payload ?? {};
  const schedule = results.find((result) => result.id === 'schedule_nxt')?.payload;
  const trackActivity = results.find((result) => result.id === 'trackactivity_nxt')?.payload;
  const heartbeat = timing?.heartbeat;
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  const bryce = timingRows.find((row) => isBryceTimingRow(row, heartbeat));
  const liveBryceProfile = Array.isArray(drivers) ? drivers.find(isBryceProfile) : null;
  const bryceProfile = liveBryceProfile ?? fallbackBryceProfile(bryce);

  if (!heartbeat || !bryce || timingRows.length === 0) {
    if (heartbeat && !bryce && timingRows.length > 0) {
      const cached = archivedSnapshot({
        reason: describeBryceMiss(heartbeat, timingRows),
        liveResults: results,
        fallbackProfile: liveBryceProfile
      });
      if (cached) return cached;
    }
    const errors = results.filter((result) => !result.ok).map((result) => `${result.id}: ${result.error}`).join('; ');
    throw Object.assign(new Error(`Race Control payload missing heartbeat or Bryce row. ${errors}`.trim()), { statusCode: 502 });
  }

  const state = sourceState(heartbeat);
  const sourceProbes = results.map((result) => {
    if (!result.ok) return endpointProbe(result, 'error', result.error);
    if (result.id === 'timing') return endpointProbe(result, state, `${timingRows.length} timing rows loaded; session ${heartbeat.currentFlag ?? 'unknown'}.`);
    if (result.id === 'drivers_nxt') {
      return driverProfileEndpointProbe(
        result,
        liveBryceProfile,
        'Bryce timing row is live, but the NXT driver profile was unavailable; using fallback profile identity fields.'
      );
    }
    if (result.id === 'config') return endpointProbe(result, config.track_map_url ? 'live' : 'stale', config.track_map_url ? 'Track map URL found.' : 'Config loaded without map.');
    if (result.id === 'schedule_nxt') return endpointProbe(result, 'live', 'Schedule feed loaded for session broadcast routing.');
    if (result.id === 'trackactivity_nxt') return endpointProbe(result, 'live', 'Track activity feed loaded for EventSessionID routing.');
    return endpointProbe(result, 'live', `${result.bytes} bytes loaded.`);
  });

  return {
    heartbeat,
    timingRows: timingRows.sort((left, right) => Number(left.rank) - Number(right.rank)),
    bryce,
    bryceProfile,
    trackMapUrl: config.track_map_url ?? '',
    broadcastRoute: buildTrackActivityRoute(trackActivity, heartbeat) ?? buildScheduleRoute(schedule, heartbeat) ?? buildConfigRoute(config, heartbeat) ?? buildUnavailableRoute(heartbeat),
    updatedAt: new Date().toISOString(),
    sourceState: state,
    sourceProbes
  };
};

const buildRaceSnapshotFromUpstream = async () => buildRaceSnapshotFromResults(await fetchRaceControl());

const buildSourceReportFromResults = (results, checkedAt = new Date().toISOString()) => {
  return {
    checkedAt,
    endpoints: results.map((result) => {
      const semantics = sourceEndpointSemantics(result);
      const freshness = freshnessForResult(result, semantics.sourceState);
      return {
        id: result.id,
        label: result.label,
        series: result.series ?? null,
        cadence: result.cadence ?? null,
        role: result.role ?? null,
        proxyPath: result.proxyPath ?? null,
        url: result.url,
        ok: result.ok,
        status: result.status,
        sourceState: semantics.sourceState,
        readinessState: semantics.readinessState,
        contentType: result.contentType,
        fetchedAt: result.fetchedAt,
        lastModified: result.lastModified,
        etag: result.etag,
        bytes: result.bytes,
        checkedAgeSeconds: freshness.checkedAgeSeconds,
        modifiedAgeSeconds: freshness.modifiedAgeSeconds,
        freshnessLabel: freshness.freshnessLabel,
        sourceSummary: semantics.sourceSummary,
        note: semantics.note
      };
    })
  };
};

const buildSourceReportFromUpstream = async () => buildSourceReportFromResults(await fetchSourceProbes());

const readJsonFile = async (path, fallback = null) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJsonFile = async (path, payload) => {
  const body = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, JSON.stringify(body, null, 2));
  return body;
};

const readBodyJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
};

const fileStatus = async (path) => {
  try {
    const info = await stat(path);
    const mtime = info.mtime.toISOString();
    const modifiedAgeSeconds = ageSeconds(mtime);
    return {
      exists: true,
      path: relative(root, path),
      size: info.size,
      mtime,
      modifiedAgeSeconds,
      freshnessLabel: `updated ${formatAge(modifiedAgeSeconds)}`
    };
  } catch {
    return { exists: false, path: relative(root, path), size: 0, mtime: null, modifiedAgeSeconds: null, freshnessLabel: 'not found' };
  }
};

const replayNumber = (value) => {
  return safeNumber(value);
};

const replayTime = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const replayArchiveState = (available, totalCount, rowCount) => {
  if (!available) return 'missing';
  if (totalCount === 0) return 'empty';
  if (rowCount < 10) return 'tiny';
  return 'ready';
};

const buildReplayRows = (rows) => {
  const firstTime = replayTime(rows[0]?.checked_at);
  return rows.map((row, index) => {
    const rank = replayNumber(row.rank);
    const startPosition = replayNumber(row.start_position);
    const passes = replayNumber(row.passes);
    const passed = replayNumber(row.passed);
    const rowTime = replayTime(row.checked_at);

    return {
      checkedAt: row.checked_at,
      sessionKey: row.session_key,
      elapsedSeconds: firstTime !== null && rowTime !== null ? Math.round((rowTime - firstTime) / 1000) : null,
      sample: index + 1,
      timeLabel: new Date(row.checked_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      rank,
      liveRank: replayNumber(row.live_rank),
      startPosition,
      positionDelta: startPosition !== null && rank !== null ? startPosition - rank : null,
      laps: row.laps ?? '',
      status: row.status || '',
      comment: row.comment || '',
      gap: row.gap || '',
      liveGap: row.live_gap || '',
      diff: row.diff || '',
      bestLapTime: row.best_lap_time || '',
      bestLap: row.best_lap || '',
      lastLapTime: row.last_lap_time || '',
      bestSpeed: replayNumber(row.best_speed),
      lastSpeed: replayNumber(row.last_speed),
      averageSpeed: replayNumber(row.average_speed),
      passes,
      passed,
      netPasses: passes !== null && passed !== null ? passes - passed : null,
      pitStops: replayNumber(row.pit_stops),
      lastPitLap: replayNumber(row.last_pit_lap),
      sincePitLap: replayNumber(row.since_pit_lap),
      tire: row.tire || '',
      overtakeRemain: replayNumber(row.overtake_remain),
      overtakeActive: row.overtake_active || '',
      lapDistance: replayNumber(row.lap_distance),
      liveDiffAhead: row.live_diff_ahead || '',
      liveDiffBehind: row.live_diff_behind || '',
      totalDriverPoints: replayNumber(row.total_driver_points),
      totalEntrantPoints: replayNumber(row.total_entrant_points),
      runningDriverPoints: replayNumber(row.running_driver_points),
      radiofrequency: row.radiofrequency || '',
      sourceState: row.source_state || '',
      flag: row.flag || ''
    };
  });
};

const buildReplaySummary = (rows) => {
  const first = rows[0] ?? null;
  const latest = rows.at(-1) ?? null;
  const ranks = rows.map((row) => replayNumber(row.rank)).filter((rank) => rank !== null);
  const firstRank = replayNumber(first?.rank);
  const latestRank = replayNumber(latest?.rank);
  const positionDelta = firstRank !== null && latestRank !== null ? firstRank - latestRank : null;
  const firstTime = replayTime(first?.checked_at);
  const latestTime = replayTime(latest?.checked_at);
  const statusEvents = [];
  let previousStatus = null;

  for (const row of rows) {
    const status = row.status || 'Unknown';
    const comment = row.comment || '';
    if (status !== previousStatus || comment) {
      statusEvents.push({
        checkedAt: row.checked_at,
        status,
        comment,
        rank: replayNumber(row.rank),
        gap: row.gap || row.live_gap || row.diff || ''
      });
    }
    previousStatus = status;
  }

  return {
    firstCheckedAt: first?.checked_at ?? null,
    lastCheckedAt: latest?.checked_at ?? null,
    coverageMinutes: firstTime !== null && latestTime !== null ? Math.round(((latestTime - firstTime) / 60000) * 10) / 10 : 0,
    firstRank,
    lastRank: latestRank,
    latestRank,
    bestRank: ranks.length ? Math.min(...ranks) : null,
    worstRank: ranks.length ? Math.max(...ranks) : null,
    positionDelta,
    rankDelta: positionDelta,
    netPasses:
      replayNumber(latest?.passes) !== null && replayNumber(latest?.passed) !== null ? replayNumber(latest.passes) - replayNumber(latest.passed) : null,
    latestStatus: latest?.status ?? '',
    latestComment: latest?.comment ?? '',
    latestGap: latest?.gap || latest?.live_gap || latest?.diff || '',
    latestLaps: latest?.laps ?? '',
    latestBestLapTime: latest?.best_lap_time ?? '',
    latestPassNet:
      replayNumber(latest?.passes) !== null && replayNumber(latest?.passed) !== null ? replayNumber(latest.passes) - replayNumber(latest.passed) : null,
    statusEvents: statusEvents.slice(-12)
  };
};

export const queryReplay = ({
  limit: limitValue,
  offset: offsetValue,
  sessionKey: requestedSessionKey,
  sample: sampleMode,
  beforeCheckedAt = null
}) => {
  const limit = Math.min(Math.max(Number(limitValue) || 100, 1), 500);
  const offset = Math.max(Number(offsetValue) || 0, 0);
  const perLap = sampleMode === 'lap';
  try {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const total = db.prepare('SELECT COUNT(*) AS count FROM bryce_samples').get();
      const totalCount = Number(total?.count ?? 0);
      const latest = db.prepare('SELECT session_key FROM bryce_samples ORDER BY checked_at DESC LIMIT 1').get();
      const sessionKey = requestedSessionKey || latest?.session_key || null;
      const sampleColumns = new Set(db.prepare('PRAGMA table_info(bryce_samples)').all().map((column) => column.name));
      const sampleColumn = (column) => (sampleColumns.has(column) ? `b.${column}` : `NULL AS ${column}`);
      const sessions = db
        .prepare(
          `
          SELECT b.session_key AS sessionKey,
                 COUNT(*) AS samples,
                 MIN(b.checked_at) AS firstCheckedAt,
                 MAX(b.checked_at) AS lastCheckedAt,
                 MIN(s.event_name) AS eventName,
                 MIN(s.session_name) AS sessionName
          FROM bryce_samples b
          LEFT JOIN race_snapshots s ON s.id = b.snapshot_id
          GROUP BY b.session_key
          ORDER BY MAX(b.checked_at) DESC
        `
        )
        .all()
        .map((session) => ({
          ...session,
          samples: Number(session.samples ?? 0)
        }));

      const rows = db
        .prepare(
          `
          SELECT b.checked_at, b.session_key, b.rank, b.live_rank, b.start_position, b.laps, b.status, b.comment,
                 b.gap, b.live_gap, b.diff, b.best_lap_time, ${sampleColumn('best_lap')}, b.last_lap_time,
                 b.best_speed, b.last_speed, ${sampleColumn('average_speed')}, b.passes, b.passed,
                 b.pit_stops, ${sampleColumn('last_pit_lap')}, ${sampleColumn('since_pit_lap')},
                 ${sampleColumn('tire')}, ${sampleColumn('overtake_remain')}, ${sampleColumn('overtake_active')},
                 ${sampleColumn('lap_distance')}, ${sampleColumn('live_diff_ahead')}, ${sampleColumn('live_diff_behind')},
                 ${sampleColumn('total_driver_points')}, ${sampleColumn('total_entrant_points')},
                 ${sampleColumn('running_driver_points')}, ${sampleColumn('radiofrequency')}, s.source_state, s.flag
          FROM bryce_samples b
          LEFT JOIN race_snapshots s ON s.id = b.snapshot_id
          WHERE (? IS NULL OR b.session_key = ?)
            AND (? IS NULL OR b.checked_at <= ?)
          ${perLap
            ? `AND b.checked_at = (
                 SELECT MAX(b2.checked_at) FROM bryce_samples b2
                 WHERE b2.session_key = b.session_key AND b2.laps = b.laps
               )`
            : ''}
          ORDER BY ${perLap ? 'CAST(b.laps AS INTEGER) ASC' : 'b.checked_at DESC'}
          LIMIT ?
          OFFSET ?
        `
        )
        .all(sessionKey, sessionKey, beforeCheckedAt, beforeCheckedAt, limit, offset);
      if (!perLap) rows.reverse();
      const selected = sessionKey ? db.prepare('SELECT COUNT(*) AS count FROM bryce_samples WHERE session_key = ?').get(sessionKey) : total;
      const selectedCount = Number(selected?.count ?? rows.length);
      const returnedRows = buildReplayRows(rows);
      const archiveState = replayArchiveState(true, selectedCount, selectedCount);
      const warnings = [];
      if (archiveState === 'empty') warnings.push('No Bryce samples found. Run npm run poll:race or npm run poll:race:watch during a session.');
      if (archiveState === 'tiny') warnings.push('Archive has fewer than 10 samples. Treat this as coverage proof, not a full race trend.');
      if (rows.length > 1 && new Set(rows.map((row) => `${row.rank}-${row.status}-${row.gap}-${row.laps}`)).size === 1) {
        warnings.push('No movement detected across returned samples. This is likely a repeated cold/post-race archive slice.');
      }

      return {
        available: true,
        sqlite: relative(root, sqlitePath),
        generatedAt: new Date().toISOString(),
        archiveState,
        count: totalCount,
        returned: rows.length,
        selectedCount,
        sessionKey,
        sessions,
        summary: buildReplaySummary(rows),
        rows: returnedRows,
        warnings
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      available: false,
      sqlite: relative(root, sqlitePath),
      generatedAt: new Date().toISOString(),
      archiveState: 'missing',
      count: 0,
      returned: 0,
      selectedCount: 0,
      sessionKey: null,
      sessions: [],
      summary: buildReplaySummary([]),
      rows: [],
      warnings: ['SQLite archive unavailable. Run npm run poll:race to create the local archive.'],
      error: error instanceof Error ? error.message : 'SQLite unavailable'
    };
  }
};

export const compactTimingRowForReadiness = (row, heartbeat = null) => ({
  no: row?.no ?? '',
  firstName: row?.firstName ?? '',
  lastName: row?.lastName ?? '',
  name: `${row?.firstName ?? ''} ${row?.lastName ?? ''}`.trim(),
  team: row?.team ?? '',
  rank: safeNumber(row?.rank),
  liveRank: safeNumber(row?.liveRank),
  startPosition: safeNumber(row?.startPosition),
  status: row?.status ?? '',
  comment: row?.comment ?? '',
  gap: row?.gap ?? '',
  liveGap: row?.liveGap ?? '',
  diff: row?.diff ?? '',
  laps: row?.laps ?? '',
  bestLapTime: row?.bestLapTime ?? '',
  lastLapTime: row?.lastLapTime ?? '',
  bestSpeed: safeNumber(row?.BestSpeed),
  lastSpeed: safeNumber(row?.LastSpeed),
  averageSpeed: safeNumber(row?.AverageSpeed),
  passes: safeNumber(row?.Passes),
  passed: safeNumber(row?.Passed),
  pitStops: safeNumber(row?.pitStops),
  lastPitLap: safeNumber(row?.lastPitLap),
  sincePitLap: safeNumber(row?.sincePitLap),
  tire: row?.Tire ?? '',
  overtakeRemain: safeNumber(row?.OverTake_Remain),
  overtakeActive: row?.OverTake_Active ?? '',
  lapDistance: safeNumber(row?.lapDistance),
  liveDiffAhead: row?.liveDiffAhead ?? '',
  liveDiffBehind: row?.liveDiffBehind ?? '',
  runningDriverPoints: safeNumber(row?.runningDriverPoints),
  totalDriverPoints: safeNumber(row?.totalDriverPoints),
  totalEntrantPoints: safeNumber(row?.totalEntrantPoints),
  bryce: isBryceTimingRow(row, heartbeat)
});

const heartbeatSummary = (heartbeat = null) => ({
  eventName: heartbeat?.eventName ?? null,
  eventId: heartbeat?.EventID ?? null,
  eventSessionId: heartbeat?.EventSessionID ?? null,
  sessionName: heartbeat?.SessionName ?? null,
  sessionType: heartbeat?.SessionType ?? null,
  sessionStatus: heartbeat?.SessionStatus ?? null,
  series: heartbeat?.Series ?? null,
  flag: heartbeat?.currentFlag ?? null,
  lap: safeNumber(heartbeat?.lapNumber),
  totalLaps: safeNumber(heartbeat?.totalLaps),
  trackName: heartbeat?.trackName ?? null,
  trackType: heartbeat?.trackType ?? null
});

const compactSourceHealthState = (sourceReport = {}) => {
  const endpoints = asArray(sourceReport.endpoints).map((endpoint) => ({
    id: endpoint.id,
    role: endpoint.role ?? null,
    series: endpoint.series ?? null,
    cadence: endpoint.cadence ?? null,
    ok: Boolean(endpoint.ok),
    status: endpoint.status ?? null,
    sourceState: endpoint.sourceState ?? 'error',
    readinessState: endpoint.readinessState ?? 'unknown',
    checkedAgeSeconds: endpoint.checkedAgeSeconds ?? null,
    modifiedAgeSeconds: endpoint.modifiedAgeSeconds ?? null,
    freshnessLabel: endpoint.freshnessLabel ?? 'freshness unknown',
    sourceSummary: endpoint.sourceSummary ?? null,
    note: endpoint.note ?? ''
  }));
  return {
    checkedAt: sourceReport.checkedAt ?? new Date().toISOString(),
    endpoints,
    local: sourceReport.local ?? {},
    critical: endpoints.filter((endpoint) => endpoint.role === 'primary_timing').map((endpoint) => endpoint.id),
    enrichment: endpoints
      .filter((endpoint) => ['driver_identity_profile', 'track_map_watch_links_config', 'schedule_broadcast_grid_context', 'session_route_results_context'].includes(endpoint.role))
      .map((endpoint) => endpoint.id),
    reference: endpoints.filter((endpoint) => endpoint.role === 'wrong_series_guard_reference').map((endpoint) => endpoint.id),
    candidate: endpoints.filter((endpoint) => String(endpoint.role ?? '').includes('candidate')).map((endpoint) => endpoint.id)
  };
};

const buildRaceWeekendState = ({ checkedAt, heartbeat, broadcastRoute, sourceState, readiness }) => ({
  checkedAt,
  eventId: heartbeat?.EventID ?? null,
  eventSessionId: heartbeat?.EventSessionID ?? null,
  eventName: heartbeat?.eventName ?? null,
  sessionName: heartbeat?.SessionName ?? null,
  sessionType: heartbeat?.SessionType ?? null,
  sessionStatus: heartbeat?.SessionStatus ?? null,
  trackName: heartbeat?.trackName ?? null,
  trackType: heartbeat?.trackType ?? null,
  trackLength: safeNumber(heartbeat?.trackLength),
  flag: heartbeat?.currentFlag ?? null,
  lap: safeNumber(heartbeat?.lapNumber),
  totalLaps: safeNumber(heartbeat?.totalLaps),
  startsAt: broadcastRoute?.startsAt ?? null,
  estimatedGreenFlag: broadcastRoute?.estimatedGreenFlag ?? null,
  endsAt: broadcastRoute?.endsAt ?? null,
  timezone: null,
  broadcastRoute: broadcastRoute ?? null,
  sourceState,
  readiness
});

const timingEndpointMatchesHeartbeat = (timingEndpoint = null, heartbeat = null) => {
  const summary = timingEndpoint?.sourceSummary;
  if (!summary || !heartbeat) return true;
  const checks = [
    [summary.eventId, heartbeat.EventID],
    [summary.eventSessionId, heartbeat.EventSessionID]
  ].filter(([left, right]) => left !== null && left !== undefined && left !== '' && right !== null && right !== undefined && right !== '');
  if (checks.length === 0) return true;
  return checks.every(([left, right]) => String(left) === String(right));
};

const buildBryceLiveState = ({ checkedAt, heartbeat, timingRows, bryce, bryceProfile, broadcastRoute, sourceState, readiness }) => {
  const seriesOk = isIndyNxtTimingHeartbeat(heartbeat);
  const carNine = asArray(timingRows).find((row) => String(row?.no ?? '').trim() === bryceCarNumber) ?? null;
  const identityRow = bryce ?? carNine;
  const driverIdMatch = String(identityRow?.DriverID ?? '') === bryceRcDriverId;
  const exactNameMatch = String(identityRow?.firstName ?? '').toLowerCase() === 'bryce' && String(identityRow?.lastName ?? '').toLowerCase() === 'aron';
  const matchedBy = seriesOk && driverIdMatch ? 'driver_id' : seriesOk && exactNameMatch ? 'exact_name' : null;
  const warnings = [];
  if (!seriesOk) warnings.push('Active timing heartbeat is not INDY NXT.');
  if (!bryce) warnings.push(carNine ? 'Car #9 exists in the active feed but failed the Bryce INDY NXT identity guard.' : 'No Bryce timing row is present.');

  return {
    checkedAt,
    sourceState,
    readiness,
    heartbeat: heartbeatSummary(heartbeat),
    bryce: bryce ? compactTimingRowForReadiness(bryce, heartbeat) : null,
    profile: bryceProfile ?? fallbackBryceProfile(bryce),
    identityGuard: {
      carNumber: bryceCarNumber,
      rcDriverId: bryceRcDriverId,
      matchedBy,
      seriesOk
    },
    broadcastRoute: broadcastRoute ?? null,
    warnings
  };
};

const buildReadinessGates = ({ timingEndpoint, sourceReport, heartbeat, timingRows, bryce, sourceState, state, weather, replay }) => {
  const endpointList = asArray(sourceReport?.endpoints);
  const enrichmentFailures = endpointList.filter(
    (endpoint) =>
      !['timing', 'drivers_top', 'schedule_top', 'trackactivity_top', 'ntt_data_polling'].includes(endpoint.id) &&
      !['available', 'reference_only'].includes(endpoint.readinessState)
  );
  const checkedAgeSeconds = timingEndpoint?.checkedAgeSeconds ?? null;
  const timingFreshnessApplies = timingEndpointMatchesHeartbeat(timingEndpoint, heartbeat);
  return [
    {
      id: 'timing_reachable',
      state: timingEndpoint?.ok ? 'pass' : 'fail',
      summary: timingEndpoint?.ok ? 'Race Control timing endpoint is reachable.' : timingEndpoint?.note ?? 'Race Control timing endpoint is unavailable.'
    },
    {
      id: 'indy_nxt_heartbeat',
      state: isIndyNxtTimingHeartbeat(heartbeat) ? 'pass' : 'fail',
      summary: isIndyNxtTimingHeartbeat(heartbeat) ? 'Timing heartbeat is INDY NXT-compatible.' : 'Timing heartbeat is not INDY NXT.'
    },
    {
      id: 'bryce_identity',
      state: bryce ? 'pass' : 'fail',
      summary: bryce ? 'Bryce car #9 passed driver-id/name guard.' : describeBryceMiss(heartbeat, asArray(timingRows))
    },
    {
      id: 'timing_freshness',
      state:
        sourceState === 'live' && (!timingFreshnessApplies || checkedAgeSeconds === null || checkedAgeSeconds <= 3)
          ? 'pass'
          : state === 'stale'
            ? 'fail'
            : 'warn',
      summary: `Timing source is ${sourceState}; ${timingEndpoint?.freshnessLabel ?? 'freshness unknown'}.`
    },
    {
      id: 'enrichment_sources',
      state: enrichmentFailures.length === 0 ? 'pass' : 'warn',
      summary:
        enrichmentFailures.length === 0
          ? 'Required enrichment sources are available or not blocking.'
          : `${enrichmentFailures.length} enrichment source(s) are partial or unavailable.`
    },
    {
      id: 'points_fields',
      state: bryce && ['race_control_live', 'partial'].includes(buildPointsProjectionState({ checkedAt: new Date().toISOString(), timingRows, bryce, readinessState: state }).mode) ? 'pass' : 'warn',
      summary: bryce ? 'Race Control points fields inspected for Bryce.' : 'Live Bryce points are unavailable without a guarded Bryce row.'
    },
    {
      id: 'weather',
      state: weather?.sourceState === 'live' ? 'pass' : weather?.sourceState === 'partial' ? 'warn' : 'fail',
      summary: `Weather source is ${weather?.sourceState ?? 'unavailable'}.`
    },
    {
      id: 'replay_archive',
      state: ['ready', 'tiny'].includes(replay?.archiveState) ? 'pass' : 'warn',
      summary: `Replay archive is ${replay?.archiveState ?? 'unavailable'}.`
    }
  ];
};

export const buildReadinessPayloadFromParts = ({
  checkedAt = new Date().toISOString(),
  heartbeat = null,
  timingRows = [],
  bryce = null,
  bryceProfile = null,
  broadcastRoute = null,
  sourceState: inputSourceState = null,
  sourceReport = {},
  history = null,
  replay = null,
  weather = null
}) => {
  const sources = compactSourceHealthState(sourceReport);
  const timingEndpoint = sources.endpoints.find((endpoint) => endpoint.id === 'timing') ?? null;
  const timingRowsArray = asArray(timingRows);
  const hasRows = timingRowsArray.length > 0;
  const seriesOk = isIndyNxtTimingHeartbeat(heartbeat);
  const activeTiming = isActiveTimingHeartbeat(heartbeat);
  const timingCheckedAgeSeconds = timingEndpoint?.checkedAgeSeconds ?? null;
  const sourceStateValue = inputSourceState ?? timingEndpoint?.sourceState ?? (heartbeat ? sourceState(heartbeat) : 'error');
  const timingFreshnessApplies = timingEndpointMatchesHeartbeat(timingEndpoint, heartbeat);
  const timingCheckedStale = timingFreshnessApplies && timingCheckedAgeSeconds !== null && timingCheckedAgeSeconds > 10;
  const timingSourceStale = timingFreshnessApplies && sourceStateValue === 'stale';
  const bryceProfilePending = Boolean(bryce) && !bryceProfile?.radiofrequency;
  const broadcastRoutePending = Boolean(heartbeat && seriesOk) && (!broadcastRoute || broadcastRoute.source === 'unavailable');
  const enrichmentDegraded =
    bryceProfilePending ||
    broadcastRoutePending ||
    sources.endpoints.some(
      (endpoint) =>
        !['timing', 'drivers_top', 'schedule_top', 'trackactivity_top', 'ntt_data_polling'].includes(endpoint.id) &&
        !['available', 'reference_only'].includes(endpoint.readinessState)
    ) ||
    weather?.sourceState === 'partial' ||
    weather?.sourceState === 'error' ||
    replay?.archiveState === 'missing' ||
    replay?.archiveState === 'empty';

  let state = 'blocked';
  let reason = 'Required live timing context is unavailable.';

  if (!heartbeat && !hasRows) {
    state = 'blocked';
    reason = 'Race Control timing payload has no heartbeat or timing rows.';
  } else if (!seriesOk && heartbeat) {
    state = 'wrong_series';
    reason = describeBryceMiss(heartbeat, timingRowsArray);
  } else if (timingSourceStale || timingCheckedStale) {
    state = 'stale';
    reason = 'Timing data is too old for live Bryce display.';
  } else if (sourceStateValue === 'cold') {
    state = 'pre_session';
    reason = 'Timing feed is cold; live Bryce race mode is not active yet.';
  } else if (!bryce && heartbeat && seriesOk && activeTiming) {
    state = 'wrong_series';
    reason = 'Fresh INDY NXT timing is active, but no guarded Bryce car #9 row is present.';
  } else if (!bryce && heartbeat) {
    state = 'pre_session';
    reason = 'INDY NXT session context exists, but Bryce is not in a fresh live timing row yet.';
  } else if (bryce && seriesOk && !activeTiming) {
    state = 'pre_session';
    reason = 'Bryce timing row is present, but Race Control is not in an active green/yellow or lap-progress state yet.';
  } else if (bryce && seriesOk && enrichmentDegraded) {
    state = 'degraded';
    reason = 'Core Bryce timing is usable, but one or more enrichment sources are partial.';
  } else if (bryce && seriesOk) {
    state = 'ready';
    reason = 'Fresh INDY NXT timing has a guarded Bryce car #9 row.';
  }

  const severity = state === 'ready' ? 'green' : ['blocked', 'wrong_series'].includes(state) ? 'red' : 'amber';
  const points = buildPointsProjectionState({ checkedAt, timingRows: timingRowsArray, bryce, readinessState: state, history });
  const productHeartbeat = seriesOk ? heartbeat : null;
  const productBroadcastRoute = seriesOk ? broadcastRoute : null;
  const gates = buildReadinessGates({
    timingEndpoint,
    sourceReport: sources,
    heartbeat,
    timingRows: timingRowsArray,
    bryce,
    sourceState: sourceStateValue,
    state,
    weather,
    replay
  });

  return {
    schemaVersion: 'live-readiness.v1',
    checkedAt,
    state,
    severity,
    reason,
    raceWeekend: buildRaceWeekendState({ checkedAt, heartbeat: productHeartbeat, broadcastRoute: productBroadcastRoute, sourceState: sourceStateValue, readiness: state }),
    liveTiming: {
      checkedAt,
      sourceState: sourceStateValue,
      rowCount: timingRowsArray.length,
      bryceNo: bryceCarNumber,
      heartbeat: heartbeatSummary(heartbeat),
      rows: timingRowsArray
        .slice()
        .sort((left, right) => Number(left?.rank ?? 999) - Number(right?.rank ?? 999))
        .map((row) => compactTimingRowForReadiness(row, heartbeat))
    },
    bryce: buildBryceLiveState({
      checkedAt,
      heartbeat,
      timingRows: timingRowsArray,
      bryce,
      bryceProfile,
      broadcastRoute,
      sourceState: sourceStateValue,
      readiness: state
    }),
    points,
    weather:
      weather ?? {
        schemaVersion: 'live-weather.v1',
        checkedAt,
        sourceState: 'error',
        track: null,
        probes: [],
        cache: null,
        warnings: ['Weather payload unavailable.']
      },
    replay:
      replay ?? {
        available: false,
        archiveState: 'missing',
        count: 0,
        returned: 0,
        selectedCount: 0,
        sessionKey: null,
        sessions: [],
        summary: buildReplaySummary([]),
        rows: [],
        warnings: ['Replay payload unavailable.']
      },
    sources,
    gates
  };
};

const pickReadinessWeatherTrack = async (heartbeat = null) => {
  const upcomingEvents = await loadUpcomingIndyNxtEvents();
  const heartbeatEventId = String(heartbeat?.EventID ?? '');
  const heartbeatEventName = String(heartbeat?.eventName ?? '').toLowerCase();
  const matchedEvent =
    upcomingEvents.find((event) => heartbeatEventId && String(event.officialEventId ?? '') === heartbeatEventId) ??
    upcomingEvents.find((event) => heartbeatEventName && String(event.name ?? '').toLowerCase() === heartbeatEventName) ??
    upcomingEvents.find((event) => heartbeatEventName && heartbeatEventName.includes(String(event.track?.name ?? '').toLowerCase()));
  return matchedEvent?.track ?? upcomingEvents[0]?.track ?? (await loadTrackMetadata('track_road_america'));
};

const fetchReadinessWeather = async (checkedAt, heartbeat = null) => {
  try {
    const track = await pickReadinessWeatherTrack(heartbeat);
    return await fetchCachedLiveWeatherForTrack(track, {});
  } catch (error) {
    return {
      schemaVersion: 'live-weather.v1',
      checkedAt,
      sourceState: 'error',
      track: { id: 'track_road_america', name: 'Road America' },
      probes: [{ ok: false, label: 'weather', error: error instanceof Error ? error.message : String(error) }],
      cache: { status: 'error' }
    };
  }
};

const buildReadinessPayloadFromRuntimeParts = async ({
  results,
  sourceReportBase,
  historyPayload,
  replay,
  checkedAt = new Date().toISOString(),
  weatherOverride
}) => {
  const sourceReport = {
    ...sourceReportBase,
    local: {
      latestSnapshot: await fileStatus(latestSnapshotPath),
      runnerStatus: await fileStatus(runnerStatusPath),
      onboardCatalog: await fileStatus(onboardCatalogPath),
      history: await fileStatus(historyPath),
      sqlite: await fileStatus(sqlitePath),
      povProof: await fileStatus(povProofPath),
      audioProof: await fileStatus(audioProofPath)
    }
  };
  const timing = results.find((result) => result.id === 'timing')?.payload?.timing_results;
  const drivers = results.find((result) => result.id === 'drivers_nxt')?.payload?.drivers?.driver ?? [];
  const config = results.find((result) => result.id === 'config')?.payload ?? {};
  const schedule = results.find((result) => result.id === 'schedule_nxt')?.payload;
  const trackActivity = results.find((result) => result.id === 'trackactivity_nxt')?.payload;
  const heartbeat = timing?.heartbeat ?? null;
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  const bryce = timingRows.find((row) => isBryceTimingRow(row, heartbeat)) ?? null;
  const bryceProfile = (Array.isArray(drivers) ? drivers.find(isBryceProfile) : null) ?? fallbackBryceProfile(bryce);
  const weather = weatherOverride === undefined ? await fetchReadinessWeather(checkedAt, heartbeat) : weatherOverride;
  const broadcastRoute = heartbeat
    ? buildTrackActivityRoute(trackActivity, heartbeat) ?? buildScheduleRoute(schedule, heartbeat) ?? buildConfigRoute(config, heartbeat) ?? buildUnavailableRoute(heartbeat)
    : null;

  return buildReadinessPayloadFromParts({
    checkedAt,
    heartbeat,
    timingRows,
    bryce,
    bryceProfile,
    broadcastRoute,
    sourceState: heartbeat ? sourceState(heartbeat) : null,
    sourceReport,
    history: historyPayload ? compactHistory(historyPayload) : null,
    replay,
    weather
  });
};

const buildReadinessPayloadFromUpstream = async () => {
  const checkedAt = new Date().toISOString();
  const [results, sourceReportBase, historyPayload, replay] = await Promise.all([
    fetchRaceControl(),
    buildSourceReportFromUpstream(),
    readJsonFile(historyPath),
    Promise.resolve(queryReplay({ limit: 5 }))
  ]);
  return buildReadinessPayloadFromRuntimeParts({
    checkedAt,
    results,
    sourceReportBase,
    historyPayload,
    replay
  });
};

const apiRuntimeCache = {
  snapshot: null,
  sources: null,
  readiness: null,
  refreshedAt: null,
  refreshPromise: null,
  lastError: null,
  timer: null,
  started: false
};

const resultFromRawPayload = (endpoint, payload, checkedAt) => ({
  ...endpoint,
  ok: payload !== undefined && payload !== null,
  status: payload !== undefined && payload !== null ? 200 : 0,
  contentType: payload !== undefined && payload !== null ? 'application/json' : null,
  lastModified: null,
  etag: null,
  bytes: payload !== undefined && payload !== null ? Buffer.byteLength(JSON.stringify(payload)) : 0,
  fetchedAt: checkedAt,
  payload: payload ?? null,
  error: payload !== undefined && payload !== null ? null : 'No cached runner payload for endpoint.'
});

const rawResultsFromSnapshotRecord = (record) => {
  const raw = record?.raw ?? {};
  return raceControlEndpoints.map((endpoint) => resultFromRawPayload(endpoint, raw[endpoint.id], record.checkedAt));
};

const sourceResultsFromSnapshotRecord = (record) => {
  const raw = record?.raw ?? {};
  return sourceProbeEndpoints.map((endpoint) => resultFromRawPayload(endpoint, raw[endpoint.id], record.checkedAt));
};

const readLatestRawSnapshotRecord = () => {
  try {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const row = db.prepare('SELECT checked_at, payload_json FROM race_snapshots ORDER BY checked_at DESC LIMIT 1').get();
      if (!row?.payload_json) return null;
      const payload = JSON.parse(row.payload_json);
      return {
        checkedAt: row.checked_at ?? payload.summary?.checkedAt ?? null,
        summary: payload.summary ?? null,
        raw: payload.raw ?? null
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
};

const readFreshRunnerRawRecord = async () => {
  const status = await readJsonFile(runnerStatusPath);
  const statusAgeSeconds = ageSeconds(status?.updatedAt);
  if (!status || statusAgeSeconds === null || statusAgeSeconds * 1000 > apiRunnerFreshMs) return null;
  if (!status.lastSuccessfulWriteAt) return null;
  const writeAgeSeconds = ageSeconds(status.lastSuccessfulWriteAt);
  if (writeAgeSeconds === null || writeAgeSeconds * 1000 > apiRunnerFreshMs) return null;
  const record = readLatestRawSnapshotRecord();
  if (!record?.raw) return null;
  const recordAgeSeconds = ageSeconds(record.checkedAt);
  if (recordAgeSeconds === null || recordAgeSeconds * 1000 > apiRunnerFreshMs) return null;
  return { ...record, runnerStatus: status };
};

const buildReadinessPayloadFromRunnerRecord = async (record) => {
  const results = rawResultsFromSnapshotRecord(record);
  const sourceReportBase = buildSourceReportFromResults(sourceResultsFromSnapshotRecord(record), record.checkedAt ?? new Date().toISOString());
  return buildReadinessPayloadFromRuntimeParts({
    checkedAt: record.checkedAt ?? new Date().toISOString(),
    results,
    sourceReportBase,
    historyPayload: await readJsonFile(historyPath),
    replay: queryReplay({ limit: 5 })
  });
};

const replayWeatherUnavailable = (checkedAt, record) => ({
  schemaVersion: 'live-weather.v1',
  checkedAt,
  sourceState: 'unavailable',
  track: {
    id: 'track_road_america',
    name: record?.summary?.trackName ?? 'Road America'
  },
  probes: [],
  cache: { status: 'replay_not_captured' },
  warnings: ['Weather was not part of this archived Race Control replay and is not inferred.']
});

const currentReplayRecord = () => replayOverlay.currentRecord();

const buildReplaySnapshot = (record) => buildRaceSnapshotFromResults(rawResultsFromSnapshotRecord(record));

const buildReplaySourceReport = (record) =>
  buildSourceReportFromResults(sourceResultsFromSnapshotRecord(record), record.checkedAt ?? new Date().toISOString());

const buildReadinessPayloadFromReplayRecord = async (record) => {
  const replay = queryReplay({
    limit: 500,
    sessionKey: record.sessionKey,
    beforeCheckedAt: record.archiveCheckedAt
  });
  return buildReadinessPayloadFromRuntimeParts({
    checkedAt: record.checkedAt,
    results: rawResultsFromSnapshotRecord(record),
    sourceReportBase: buildReplaySourceReport(record),
    historyPayload: await readJsonFile(historyPath),
    replay,
    weatherOverride: replayWeatherUnavailable(record.checkedAt, record)
  });
};

const refreshApiRuntimeCache = async ({ reason = 'loop', force = false } = {}) => {
  if (apiRuntimeCache.refreshPromise && !force) return apiRuntimeCache.refreshPromise;
  apiRuntimeCache.refreshPromise = (async () => {
    const refreshedAt = new Date().toISOString();
    const [snapshotResult, sourcesResult, readinessResult] = await Promise.allSettled([
      buildRaceSnapshotFromUpstream(),
      buildSourceReportFromUpstream(),
      buildReadinessPayloadFromUpstream()
    ]);
    if (snapshotResult.status === 'fulfilled') apiRuntimeCache.snapshot = snapshotResult.value;
    if (sourcesResult.status === 'fulfilled') apiRuntimeCache.sources = sourcesResult.value;
    if (readinessResult.status === 'fulfilled') apiRuntimeCache.readiness = readinessResult.value;
    apiRuntimeCache.refreshedAt = refreshedAt;
    apiRuntimeCache.lastError = [snapshotResult, sourcesResult, readinessResult]
      .filter((result) => result.status === 'rejected')
      .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
    if (apiRuntimeCache.lastError.length === 0) apiRuntimeCache.lastError = null;
    return {
      checkedAt: refreshedAt,
      reason,
      snapshot: snapshotResult.status,
      sources: sourcesResult.status,
      readiness: readinessResult.status,
      errors: apiRuntimeCache.lastError
    };
  })().finally(() => {
    apiRuntimeCache.refreshPromise = null;
  });
  return apiRuntimeCache.refreshPromise;
};

const startApiRuntimeCacheLoop = () => {
  if (apiRuntimeCache.started) return;
  apiRuntimeCache.started = true;
  refreshApiRuntimeCache({ reason: 'startup' }).catch(() => {});
  apiRuntimeCache.timer = setInterval(() => {
    refreshApiRuntimeCache({ reason: 'interval' }).catch(() => {});
  }, apiCacheRefreshMs);
  apiRuntimeCache.timer.unref?.();
};

const requireCached = async (key, label) => {
  if (apiRuntimeCache[key]) return apiRuntimeCache[key];
  if (apiRuntimeCache.refreshPromise) {
    await apiRuntimeCache.refreshPromise.catch(() => {});
    if (apiRuntimeCache[key]) return apiRuntimeCache[key];
  }
  const detail = apiRuntimeCache.lastError?.join('; ') ?? 'Cache has not warmed yet.';
  throw Object.assign(new Error(`${label} cache unavailable. ${detail}`), { statusCode: 503 });
};

const cachedRaceSnapshot = async () => {
  const replayRecord = currentReplayRecord();
  if (replayRecord) return buildReplaySnapshot(replayRecord);
  const runnerRecord = await readFreshRunnerRawRecord();
  if (runnerRecord) {
    try {
      return buildRaceSnapshotFromResults(rawResultsFromSnapshotRecord(runnerRecord));
    } catch {}
  }
  return requireCached('snapshot', 'Race snapshot');
};

const cachedReadinessPayload = async () => {
  const replayRecord = currentReplayRecord();
  if (replayRecord) return buildReadinessPayloadFromReplayRecord(replayRecord);
  const runnerRecord = await readFreshRunnerRawRecord();
  if (runnerRecord) return buildReadinessPayloadFromRunnerRecord(runnerRecord);
  return requireCached('readiness', 'Readiness');
};

const cachedSourceReport = async () => {
  const replayRecord = currentReplayRecord();
  if (replayRecord) return buildReplaySourceReport(replayRecord);
  const runnerRecord = await readFreshRunnerRawRecord();
  if (runnerRecord) return buildSourceReportFromResults(sourceResultsFromSnapshotRecord(runnerRecord), runnerRecord.checkedAt ?? new Date().toISOString());
  return requireCached('sources', 'Source report');
};

const cachedEndpointResult = async (endpoint) => {
  const cacheEntry = endpointResultCache.get(endpoint.id);
  if (cacheEntry?.result) return cacheEntry.result;
  const runnerRecord = await readFreshRunnerRawRecord();
  if (runnerRecord?.raw && Object.prototype.hasOwnProperty.call(runnerRecord.raw, endpoint.id)) {
    return resultFromRawPayload(endpoint, runnerRecord.raw[endpoint.id], runnerRecord.checkedAt);
  }
  if (apiRuntimeCache.refreshPromise) await apiRuntimeCache.refreshPromise.catch(() => {});
  return endpointResultCache.get(endpoint.id)?.result ?? null;
};

const sendJson = (res, statusCode, payload, headers = {}) => {
  res.writeHead(statusCode, { ...jsonHeaders, ...headers });
  res.end(JSON.stringify(payload, null, 2));
};

const sendError = (res, statusCode, message, detail) => {
  sendJson(res, statusCode, { ok: false, error: message, detail });
};

const proxyRaceControl = async (req, res, pathname) => {
  const endpoint = sourceEndpointByPath.get(pathname);
  if (!endpoint) return false;
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.searchParams.get('refresh') === '1') {
    const result = await fetchEndpointAndCache(endpoint);
    if (!result.ok) {
      sendError(res, 502, 'Race Control proxy refresh failed', result.error);
      return true;
    }
    res.writeHead(200, {
      'content-type': result.contentType ?? 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-brycecast-refresh-warning': 'Direct upstream proxy refresh is operator/debug only; app clients should use cached /api routes.'
    });
    res.end(JSON.stringify(result.payload));
    return true;
  }

  let cached = await cachedEndpointResult(endpoint);
  if (cached && !cached.ok) {
    // Self-heal a poisoned cache entry (e.g. a startup-burst timeout) with one
    // deduped retry instead of serving the stale error until the next cycle.
    refreshEndpointInBackground(endpoint);
    await endpointRefreshes.get(endpoint.id)?.catch(() => {});
    cached = endpointResultCache.get(endpoint.id)?.result ?? cached;
  }
  if (!cached) {
    sendError(res, 503, 'Race Control proxy cache unavailable', 'Use POST /api/refresh for an explicit operator refresh, then retry the cached proxy path.');
    return true;
  }
  if (!cached.ok) {
    sendError(res, 502, 'Cached Race Control proxy payload is an error', cached.error);
    return true;
  }
  res.writeHead(200, {
    'content-type': cached.contentType ?? 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'x-brycecast-cache': 'server'
  });
  res.end(JSON.stringify(cached.payload));
  return true;
};

const sendStatic = async (res, pathname) => {
  if (!staticDir) return false;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, '');
  let candidate = resolve(staticDir, `.${normalizedPath}`);
  if (!candidate.startsWith(staticDir)) return false;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      candidate = join(candidate, 'index.html');
    }
  } catch {
    candidate = join(staticDir, 'index.html');
  }

  try {
    await access(candidate);
    const type = mimeTypes[extname(candidate)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': candidate.endsWith('index.html') ? 'no-store' : 'public, max-age=3600' });
    createReadStream(candidate).pipe(res);
    return true;
  } catch {
    return false;
  }
};

const handler = async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, jsonHeaders);
    res.end();
    return;
  }

  if (!['GET', 'POST'].includes(req.method)) {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    if (req.method === 'GET' && (await proxyRaceControl(req, res, pathname))) return;

    if (pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'brycecast-api',
        checkedAt: new Date().toISOString(),
        replay: replayOverlay.status(),
        staticDir: staticDir ? relative(root, staticDir) : null,
        storage: {
          latestSnapshot: await fileStatus(latestSnapshotPath),
          onboardCatalog: await fileStatus(onboardCatalogPath),
          history: await fileStatus(historyPath),
          sqlite: await fileStatus(sqlitePath),
          povProof: await fileStatus(povProofPath),
          audioProof: await fileStatus(audioProofPath)
        }
      });
      return;
    }

    if (pathname === '/api/replay/control') {
      if (!replayEnabled) {
        sendError(res, 404, 'Replay mode is disabled.');
        return;
      }
      if (req.method !== 'GET') {
        sendError(res, 405, 'Replay control is GET-only.');
        return;
      }
      if (url.searchParams.get('stop') === '1') {
        sendJson(res, 200, replayOverlay.stop());
        return;
      }
      const session = url.searchParams.get('session');
      if (!session) {
        sendJson(res, 200, replayOverlay.status());
        return;
      }
      sendJson(
        res,
        200,
        replayOverlay.start({
          session,
          t0: url.searchParams.get('t0'),
          speed: url.searchParams.get('speed') ?? 1
        })
      );
      return;
    }

    if (pathname === '/api/snapshot' || pathname === '/api/race/snapshot') {
      sendJson(res, 200, await cachedRaceSnapshot());
      return;
    }

    if (pathname === '/api/readiness') {
      sendJson(res, 200, await cachedReadinessPayload());
      return;
    }

    if (pathname === '/api/next-session') {
      // Schedule-aware view from the live-runner status file (trackactivity/schedule
      // feeds); read-only. Day-to-day source for "when does Bryce run next".
      const status = await readJsonFile(runnerStatusPath);
      if (!status) {
        sendJson(res, 200, { available: false, reason: 'Live runner status not available on this host.' });
        return;
      }
      sendJson(res, 200, {
        available: true,
        checkedAt: status.updatedAt ?? null,
        statusAgeSeconds: ageSeconds(status.updatedAt),
        phase: status.phase ?? null,
        currentSession: status.currentSession ?? null,
        nextSession: status.nextSession ?? null,
        source: status.nextSession?.source ?? null
      });
      return;
    }

    if (pathname === '/api/session') {
      const snapshot = await cachedRaceSnapshot();
      sendJson(res, 200, {
        checkedAt: snapshot.updatedAt,
        eventName: snapshot.heartbeat.eventName,
        eventId: snapshot.heartbeat.EventID,
        eventSessionId: snapshot.heartbeat.EventSessionID,
        sessionName: snapshot.heartbeat.SessionName,
        sessionType: snapshot.heartbeat.SessionType,
        sessionStatus: snapshot.heartbeat.SessionStatus,
        flag: snapshot.heartbeat.currentFlag,
        lap: snapshot.heartbeat.lapNumber,
        totalLaps: snapshot.heartbeat.totalLaps,
        trackName: snapshot.heartbeat.trackName,
        trackType: snapshot.heartbeat.trackType,
        sourceState: snapshot.sourceState,
        broadcastRoute: snapshot.broadcastRoute
      });
      return;
    }

    if (pathname === '/api/bryce') {
      const snapshot = await cachedRaceSnapshot();
      sendJson(res, 200, {
        checkedAt: snapshot.updatedAt,
        sourceState: snapshot.sourceState,
        heartbeat: snapshot.heartbeat,
        bryce: snapshot.bryce,
        profile: snapshot.bryceProfile,
        broadcastRoute: snapshot.broadcastRoute
      });
      return;
    }

    if (pathname === '/api/timing') {
      const snapshot = await cachedRaceSnapshot();
      sendJson(res, 200, {
        checkedAt: snapshot.updatedAt,
        sourceState: snapshot.sourceState,
        rowCount: snapshot.timingRows.length,
        bryceNo: snapshot.bryce.no,
        heartbeat: heartbeatSummary(snapshot.heartbeat),
        rows: snapshot.timingRows.map((row) => compactTimingRowForReadiness(row, snapshot.heartbeat))
      });
      return;
    }

    if (pathname === '/api/sources') {
      const report = await cachedSourceReport();
      sendJson(res, 200, {
        ...report,
        local: {
          latestSnapshot: await fileStatus(latestSnapshotPath),
          runnerStatus: await fileStatus(runnerStatusPath),
          onboardCatalog: await fileStatus(onboardCatalogPath),
          history: await fileStatus(historyPath),
          sqlite: await fileStatus(sqlitePath),
          povProof: await fileStatus(povProofPath),
          audioProof: await fileStatus(audioProofPath)
        }
      });
      return;
    }

    if (pathname === '/api/weather/live') {
      const trackId = url.searchParams.get('trackId') ?? 'track_road_america';
      const forceRefresh = url.searchParams.get('cache') === '0' || url.searchParams.get('refresh') === '1';
      const track = await loadTrackMetadata(trackId);
      sendJson(res, 200, await fetchCachedLiveWeatherForTrack(track, { forceRefresh }));
      return;
    }

    if (pathname === '/api/weather/upcoming') {
      const forceRefresh = url.searchParams.get('cache') === '0' || url.searchParams.get('refresh') === '1';
      sendJson(res, 200, await buildUpcomingIndyNxtWeatherReport({ forceRefresh }));
      return;
    }

    if (pathname === '/api/log/latest' || pathname === '/api/race-log/latest' || pathname === '/api/race/latest') {
      const payload = await readJsonFile(latestSnapshotPath);
      if (!payload) {
        sendError(res, 404, 'No local race log snapshot found. Run npm run poll:race first.');
        return;
      }
      sendJson(res, 200, payload);
      return;
    }

    if (pathname === '/api/onboards/latest' || pathname === '/api/onboard-catalog' || pathname === '/api/pov/catalog') {
      const payload = await readJsonFile(onboardCatalogPath);
      if (!payload) {
        sendError(res, 404, 'No onboard catalog snapshot found. Run npm run probe:pov first.');
        return;
      }
      sendJson(res, 200, payload);
      return;
    }

    if (pathname === '/api/history/bryce') {
      const payload = await readJsonFile(historyPath);
      if (!payload) {
        sendError(res, 404, 'No Bryce history snapshot found. Run npm run ingest:history first.');
        return;
      }
      const headers = { 'x-brycecast-schema-version': historySchemaVersion };
      sendJson(res, 200, url.searchParams.get('compact') === '1' ? compactHistory(payload) : withHistoryMeta(payload), headers);
      return;
    }

    if (pathname === '/api/replay/bryce') {
      const replayRecord = currentReplayRecord();
      sendJson(
        res,
        200,
        queryReplay({
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
          sessionKey: url.searchParams.get('sessionKey') ?? replayRecord?.sessionKey,
          sample: url.searchParams.get('sample'),
          beforeCheckedAt: replayRecord?.archiveCheckedAt ?? null
        })
      );
      return;
    }

    if (pathname === '/api/pov-proof') {
      if (req.method === 'POST') {
        sendJson(res, 200, await writeJsonFile(povProofPath, await readBodyJson(req)));
        return;
      }
      sendJson(res, 200, (await readJsonFile(povProofPath)) ?? { available: false, status: 'unproven', updatedAt: null });
      return;
    }

    if (pathname === '/api/audio-proof') {
      if (req.method === 'POST') {
        sendJson(res, 200, await writeJsonFile(audioProofPath, await readBodyJson(req)));
        return;
      }
      sendJson(res, 200, (await readJsonFile(audioProofPath)) ?? { available: false, status: 'frequency_only', updatedAt: null });
      return;
    }

    if (pathname === '/api/refresh' && req.method === 'POST') {
      const refreshed = await refreshApiRuntimeCache({ reason: 'admin_refresh', force: true });
      sendJson(res, 200, {
        checkedAt: new Date().toISOString(),
        ...refreshed,
        snapshotUpdatedAt: apiRuntimeCache.snapshot?.updatedAt ?? null,
        sourceCount: apiRuntimeCache.sources?.endpoints?.length ?? 0,
        note: 'Explicit admin refresh completed through the server cache layer.'
      });
      return;
    }

    if (await sendStatic(res, pathname)) return;
    sendError(res, 404, 'Route not found', pathname);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    sendError(res, statusCode, error instanceof Error ? error.message : 'Unexpected API error');
  }
};

export const startServer = () => {
  if (replayEnabled && process.env.BRYCECAST_REPLAY_SESSION) {
    replayOverlay.start({
      session: process.env.BRYCECAST_REPLAY_SESSION,
      t0: process.env.BRYCECAST_REPLAY_T0,
      speed: process.env.BRYCECAST_REPLAY_SPEED ?? 1
    });
  }
  if (!replayEnabled) startApiRuntimeCacheLoop();
  const server = createServer(handler);

  server.listen(port, host, () => {
    const staticNote = staticDir ? `, static ${relative(root, staticDir)}` : '';
    console.log(`BryceCast API listening on http://${host}:${port}${staticNote}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer();
}
