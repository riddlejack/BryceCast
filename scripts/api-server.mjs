import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const dataDir = join(root, 'data/live');
const publicDataDir = join(root, 'public/data');
const sqlitePath = join(dataDir, 'brycecast.sqlite');
const latestSnapshotPath = join(publicDataDir, 'live-snapshot.json');
const onboardCatalogPath = join(publicDataDir, 'onboard-catalog.json');
const historyPath = join(publicDataDir, 'history-bryce.json');
const povProofPath = join(dataDir, 'pov-proof.json');
const audioProofPath = join(dataDir, 'audio-proof.json');

const raceControlEndpoints = [
  { id: 'timing', label: 'Timing and scoring', path: 'timingscoring-ris.json', url: 'https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json' },
  { id: 'drivers_nxt', label: 'INDY NXT drivers', path: 'driversfeed_nxt.json', url: 'https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json' },
  { id: 'config', label: 'Race Control config', path: 'tsconfig.json', url: 'https://indycar.blob.core.windows.net/racecontrol/tsconfig.json' },
  { id: 'schedule_nxt', label: 'INDY NXT schedule', path: 'schedulefeed_nxt.json', url: 'https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json' },
  {
    id: 'trackactivity_nxt',
    label: 'INDY NXT track activity',
    path: 'trackactivityleaderboardfeed_nxt.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json'
  }
];

const sourceUrlByPath = new Map(raceControlEndpoints.map((endpoint) => [`/racecontrol/${endpoint.path}`, endpoint.url]));

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

const isBryceTimingRow = (row) => {
  const first = String(row?.firstName ?? '').toLowerCase();
  const last = String(row?.lastName ?? '').toLowerCase();
  const driverId = String(row?.DriverID ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

const isBryceProfile = (driver) => {
  const first = String(driver?.firstname ?? '').toLowerCase();
  const last = String(driver?.lastname ?? '').toLowerCase();
  const driverId = String(driver?.rc_driver_id ?? driver?.driverid ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

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
  const fallback = [
    { id: 'fs1', name: 'FS1', url: defaultRouteUrls.fs1, kind: 'video' },
    { id: 'indycar-radio', name: 'INDYCAR Radio Network', url: defaultRouteUrls.indycarRadio, kind: 'audio' },
    { id: 'indycar-live', name: 'INDYCAR LIVE', url: defaultRouteUrls.indycarLive, kind: 'international' }
  ];

  return routeFromNetworks({
    heartbeat,
    eventName: heartbeat.eventName ?? 'Unknown event',
    sessionName: heartbeat.SessionName ?? 'Race',
    sessionType: heartbeat.SessionType ?? '',
    startsAt: '',
    source: networks.length ? 'config' : 'seed',
    note: networks.length ? 'Using generic Race Control watch links because no session route matched.' : 'Using fallback route because no current session route matched.',
    networks: networks.length ? networks : fallback
  });
};

const fetchEndpoint = async (endpoint) => {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(`${endpoint.url}?t=${Date.now()}`, { headers: { accept: 'application/json' } });
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
      error: error instanceof Error ? error.message : 'Unknown fetch error'
    };
  }
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

const endpointProbe = (result, state, note) => ({
  id: result.id,
  label: result.label,
  url: result.url,
  state,
  note,
  ...freshnessForResult(result, state)
});

const fetchRaceControl = async () => Promise.all(raceControlEndpoints.map(fetchEndpoint));

const readLatestArchivedRaw = () => {
  try {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const row = db.prepare('SELECT payload_json FROM race_snapshots ORDER BY checked_at DESC LIMIT 1').get();
      if (!row?.payload_json) return null;
      const payload = JSON.parse(row.payload_json);
      return payload.raw ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
};

const archivedSnapshot = ({ reason, liveResults, fallbackProfile }) => {
  const raw = readLatestArchivedRaw();
  const timing = raw?.timing?.timing_results;
  const heartbeat = timing?.heartbeat;
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  const drivers = raw?.drivers_nxt?.drivers?.driver ?? [];
  const config = raw?.config ?? {};
  const schedule = raw?.schedule_nxt;
  const trackActivity = raw?.trackactivity_nxt;
  const bryce = timingRows.find(isBryceTimingRow);
  const bryceProfile = (Array.isArray(drivers) ? drivers.find(isBryceProfile) : null) ?? fallbackProfile;

  if (!heartbeat || !bryce || !bryceProfile || timingRows.length === 0) return null;

  const archivedResults = liveResults.map((result) => {
    if (result.id === 'timing') {
      return endpointProbe(result, 'stale', `${reason} Using the latest archived INDY NXT Race Control timing sample instead.`);
    }
    if (!result.ok) return endpointProbe(result, 'error', result.error);
    if (result.id === 'drivers_nxt') return endpointProbe(result, 'live', `Bryce profile ${bryceProfile.radiofrequency ? 'with radio frequency' : 'loaded'}.`);
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
    broadcastRoute: buildTrackActivityRoute(trackActivity, heartbeat) ?? buildScheduleRoute(schedule, heartbeat) ?? buildConfigRoute(config, heartbeat),
    updatedAt: new Date().toISOString(),
    sourceState: 'stale',
    sourceProbes: [
      endpointProbe(
        {
          id: 'bryce-row-guard',
          label: 'Bryce row guard',
          url: raceControlEndpoints.find((endpoint) => endpoint.id === 'timing')?.url ?? '',
          ok: true,
          bytes: 0,
          fetchedAt: new Date().toISOString()
        },
        'stale',
        reason
      ),
      ...archivedResults
    ]
  };
};

const buildRaceSnapshot = async () => {
  const results = await fetchRaceControl();
  const timing = results.find((result) => result.id === 'timing')?.payload?.timing_results;
  const drivers = results.find((result) => result.id === 'drivers_nxt')?.payload?.drivers?.driver ?? [];
  const config = results.find((result) => result.id === 'config')?.payload ?? {};
  const schedule = results.find((result) => result.id === 'schedule_nxt')?.payload;
  const trackActivity = results.find((result) => result.id === 'trackactivity_nxt')?.payload;
  const heartbeat = timing?.heartbeat;
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  const bryce = timingRows.find(isBryceTimingRow);
  const bryceProfile = Array.isArray(drivers) ? drivers.find(isBryceProfile) : null;

  if (!heartbeat || !bryce || !bryceProfile || timingRows.length === 0) {
    if (heartbeat && !bryce && bryceProfile && timingRows.length > 0) {
      const cached = archivedSnapshot({
        reason: describeBryceMiss(heartbeat, timingRows),
        liveResults: results,
        fallbackProfile: bryceProfile
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
    if (result.id === 'drivers_nxt') return endpointProbe(result, 'live', `Bryce profile ${bryceProfile.radiofrequency ? 'with radio frequency' : 'loaded'}.`);
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
    broadcastRoute: buildTrackActivityRoute(trackActivity, heartbeat) ?? buildScheduleRoute(schedule, heartbeat) ?? buildConfigRoute(config, heartbeat),
    updatedAt: new Date().toISOString(),
    sourceState: state,
    sourceProbes
  };
};

const buildSourceReport = async () => {
  const results = await fetchRaceControl();
  return {
    checkedAt: new Date().toISOString(),
    endpoints: results.map((result) => ({
      id: result.id,
      label: result.label,
      url: result.url,
      ok: result.ok,
      status: result.status,
      contentType: result.contentType,
      fetchedAt: result.fetchedAt,
      lastModified: result.lastModified,
      etag: result.etag,
      bytes: result.bytes,
      checkedAgeSeconds: ageSeconds(result.fetchedAt),
      modifiedAgeSeconds: ageSeconds(result.lastModified),
      freshnessLabel: freshnessForResult(result, result.ok ? 'live' : 'error').freshnessLabel,
      note: result.ok ? `${result.bytes} bytes` : result.error
    }))
  };
};

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const replayTime = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const replayArchiveState = (available, totalCount, rowCount) => {
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
      lastLapTime: row.last_lap_time || '',
      bestSpeed: replayNumber(row.best_speed),
      lastSpeed: replayNumber(row.last_speed),
      passes,
      passed,
      netPasses: passes !== null && passed !== null ? passes - passed : null,
      pitStops: replayNumber(row.pit_stops),
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

const queryReplay = ({ limit: limitValue, offset: offsetValue, sessionKey: requestedSessionKey }) => {
  const limit = Math.min(Math.max(Number(limitValue) || 100, 1), 500);
  const offset = Math.max(Number(offsetValue) || 0, 0);
  try {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const total = db.prepare('SELECT COUNT(*) AS count FROM bryce_samples').get();
      const totalCount = Number(total?.count ?? 0);
      const latest = db.prepare('SELECT session_key FROM bryce_samples ORDER BY checked_at DESC LIMIT 1').get();
      const sessionKey = requestedSessionKey || latest?.session_key || null;
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
                 b.gap, b.live_gap, b.diff, b.best_lap_time, b.last_lap_time, b.best_speed, b.last_speed,
                 b.passes, b.passed, b.pit_stops, s.source_state, s.flag
          FROM bryce_samples b
          LEFT JOIN race_snapshots s ON s.id = b.snapshot_id
          WHERE (? IS NULL OR b.session_key = ?)
          ORDER BY b.checked_at DESC
          LIMIT ?
          OFFSET ?
        `
        )
        .all(sessionKey, sessionKey, limit, offset)
        .reverse();
      const selected = sessionKey ? db.prepare('SELECT COUNT(*) AS count FROM bryce_samples WHERE session_key = ?').get(sessionKey) : total;
      const returnedRows = buildReplayRows(rows);
      const archiveState = replayArchiveState(true, totalCount, rows.length);
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
        selectedCount: Number(selected?.count ?? rows.length),
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

const sendJson = (res, statusCode, payload, headers = {}) => {
  res.writeHead(statusCode, { ...jsonHeaders, ...headers });
  res.end(JSON.stringify(payload, null, 2));
};

const sendError = (res, statusCode, message, detail) => {
  sendJson(res, statusCode, { ok: false, error: message, detail });
};

const proxyRaceControl = async (req, res, pathname) => {
  const target = sourceUrlByPath.get(pathname);
  if (!target) return false;
  try {
    const response = await fetch(`${target}?t=${Date.now()}`, { headers: { accept: req.headers.accept ?? 'application/json' } });
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    });
    res.end(body);
  } catch (error) {
    sendError(res, 502, 'Race Control proxy failed', error instanceof Error ? error.message : String(error));
  }
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

    if (pathname === '/api/snapshot' || pathname === '/api/race/snapshot') {
      sendJson(res, 200, await buildRaceSnapshot());
      return;
    }

    if (pathname === '/api/session') {
      const snapshot = await buildRaceSnapshot();
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
      const snapshot = await buildRaceSnapshot();
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
      const snapshot = await buildRaceSnapshot();
      sendJson(res, 200, {
        checkedAt: snapshot.updatedAt,
        sourceState: snapshot.sourceState,
        rowCount: snapshot.timingRows.length,
        bryceNo: snapshot.bryce.no,
        rows: snapshot.timingRows.map((row) => ({
          no: row.no,
          name: `${row.firstName} ${row.lastName}`.trim(),
          team: row.team,
          rank: row.rank,
          liveRank: row.liveRank,
          startPosition: row.startPosition,
          status: row.status,
          comment: row.comment,
          gap: row.gap,
          liveGap: row.liveGap,
          diff: row.diff,
          laps: row.laps,
          bestLapTime: row.bestLapTime,
          lastLapTime: row.lastLapTime,
          bestSpeed: row.BestSpeed,
          lastSpeed: row.LastSpeed,
          passes: row.Passes,
          passed: row.Passed,
          bryce: isBryceTimingRow(row)
        }))
      });
      return;
    }

    if (pathname === '/api/sources') {
      const report = await buildSourceReport();
      sendJson(res, 200, {
        ...report,
        local: {
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
      sendJson(res, 200, queryReplay({ limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset'), sessionKey: url.searchParams.get('sessionKey') }));
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
      const [snapshot, sources] = await Promise.all([buildRaceSnapshot(), buildSourceReport()]);
      sendJson(res, 200, { checkedAt: new Date().toISOString(), snapshotUpdatedAt: snapshot.updatedAt, sourceCount: sources.endpoints.length });
      return;
    }

    if (await sendStatic(res, pathname)) return;
    sendError(res, 404, 'Route not found', pathname);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    sendError(res, statusCode, error instanceof Error ? error.message : 'Unexpected API error');
  }
};

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
