import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const trackMetadataPath = join(root, 'data/career/raw/track-metadata/track-metadata.v1.json');
const contextPackManifestPath = join(root, 'analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json');
const userAgent = 'BryceCast live weather readiness audit (local development; contact: brycecast.local)';
const defaultFetchTimeoutMs = 8000;
const defaultWeatherCacheTtlMs = 5 * 60 * 1000;
const defaultUpcomingWeatherConcurrency = 4;
const defaultUpcomingWeatherTrackDeadlineMs = 12000;
const weatherCache = new Map();
const weatherInflight = new Map();
let trackMetadataPromise = null;
let upcomingEventPacksPromise = null;

const round = (value, digits = 2) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const scale = 10 ** digits;
  return Math.round(parsed * scale) / scale;
};

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const normalizedTrackName = (value = '') => String(value).trim().toLowerCase();

const loadTrackMetadataCatalog = () => {
  trackMetadataPromise ??= readFile(trackMetadataPath, 'utf8').then((text) => {
    const payload = JSON.parse(text);
    return Array.isArray(payload.tracks) ? payload.tracks : [];
  });
  return trackMetadataPromise;
};

const loadUpcomingEventPacks = () => {
  upcomingEventPacksPromise ??= readFile(contextPackManifestPath, 'utf8')
    .then((text) => JSON.parse(text))
    .then((manifest) =>
      Promise.all(
        (manifest.packs ?? [])
          .filter((pack) => pack.type === 'upcoming_event' && pack.path)
          .map((pack) => readFile(join(root, pack.path), 'utf8').then((text) => JSON.parse(text)))
      )
    );
  return upcomingEventPacksPromise;
};

const compactWeatherTrack = (track) => ({
  id: track.id,
  name: track.name,
  canonicalName: track.canonicalName ?? track.name,
  city: track.city ?? null,
  region: track.region ?? null,
  country: track.country ?? null,
  latitude: track.latitude,
  longitude: track.longitude,
  timezone: track.timezone ?? null,
  coordinateSourceUrl: track.coordinateSourceUrl ?? null,
  metadataSourceUrl: track.metadataSourceUrl ?? track.sourceUrl ?? null,
  metadataConfidenceTier: track.metadataConfidenceTier ?? track.confidenceTier ?? null,
  weatherJoinReady: typeof track.latitude === 'number' && typeof track.longitude === 'number'
});

const cacheKeyForTrack = (track) => `${track.id}:${track.latitude.toFixed(4)},${track.longitude.toFixed(4)}`;

const withCacheState = (report, cache) => ({
  ...cloneJson(report),
  cache
});

const summarizeError = (error) => {
  if (error?.name === 'AbortError') return 'request timed out';
  return error instanceof Error ? error.message : String(error);
};

const nwsJson = async (url, { timeoutMs = defaultFetchTimeoutMs } = {}) => {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/geo+json, application/json',
        'user-agent': userAgent
      }
    });
    const text = await response.text();
    let json = null;
    let parseError = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      parseError = summarizeError(error);
    }
    const ok = response.ok && !parseError;
    return {
      ok,
      status: response.status,
      url,
      latencyMs: Math.round(performance.now() - startedAt),
      lastModified: response.headers.get('last-modified'),
      contentType: response.headers.get('content-type'),
      bytes: Buffer.byteLength(text),
      json,
      error: ok ? null : parseError ? `JSON parse failed: ${parseError}` : `${response.status} ${response.statusText}: ${text.slice(0, 200)}`
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      latencyMs: Math.round(performance.now() - startedAt),
      lastModified: null,
      contentType: null,
      bytes: 0,
      json: null,
      error: summarizeError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const loadTrackMetadata = async (trackId = 'track_road_america') => {
  const tracks = await loadTrackMetadataCatalog();
  const track = tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`Track not found in career dataset: ${trackId}`);
  if (typeof track.latitude !== 'number' || typeof track.longitude !== 'number') {
    throw new Error(`Track lacks numeric coordinates: ${trackId}`);
  }
  return compactWeatherTrack(track);
};

export const loadUpcomingIndyNxtEvents = async ({ now = new Date() } = {}) => {
  const [tracks, eventPacks] = await Promise.all([loadTrackMetadataCatalog(), loadUpcomingEventPacks()]);
  const tracksByName = new Map();
  for (const track of tracks) {
    tracksByName.set(normalizedTrackName(track.name), track);
    tracksByName.set(normalizedTrackName(track.canonicalName), track);
  }
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return eventPacks
    .filter((event) => {
      const date = Date.parse(event.eventEndDate ?? event.eventStartDate ?? '');
      return Number.isFinite(date) && date >= todayUtc;
    })
    .map((event) => {
      const track = tracksByName.get(normalizedTrackName(event.track?.name));
      const officialEventId = String(event.eventId ?? '').match(/_(\d+)$/)?.[1] ?? null;
      return {
        id: event.id,
        name: event.eventName ?? event.name,
        officialEventId,
        eventStartDate: event.eventStartDate ?? null,
        eventEndDate: event.eventEndDate ?? event.eventStartDate ?? null,
        timezone: track?.timezone ?? null,
        status: 'upcoming',
        trackId: track?.id ?? null,
        track: track ? compactWeatherTrack(track) : null,
        raw: null,
        provenanceRefs: event.sourceRefs ?? []
      };
    })
    .filter((event) => event.track?.weatherJoinReady)
    .sort((left, right) => Date.parse(left.eventStartDate ?? '') - Date.parse(right.eventStartDate ?? ''));
};

export const eventForecastReadiness = (event, { now = new Date() } = {}) => {
  const date = Date.parse(event.eventStartDate ?? event.eventEndDate ?? '');
  if (!Number.isFinite(date)) {
    return {
      status: 'date_unavailable',
      daysUntilEvent: null,
      note: 'Event date is unavailable, so only current venue conditions can be shown.'
    };
  }
  const daysUntilEvent = Math.round(((date - now.getTime()) / 86400000) * 10) / 10;
  if (daysUntilEvent <= 0) {
    return {
      status: 'event_window_open',
      daysUntilEvent,
      note: 'Event window is open or in the past; live observations and hourly forecast are operational.'
    };
  }
  if (daysUntilEvent <= 7) {
    return {
      status: 'forecast_window_open',
      daysUntilEvent,
      note: 'NWS forecast window is close enough for event-weekend prep, with normal forecast uncertainty.'
    };
  }
  return {
    status: 'too_far_for_event_forecast',
    daysUntilEvent,
    note: 'Only current venue conditions and readiness can be shown now; event-window forecast should refresh closer to the session.'
  };
};

const normalizeObservation = (payload) => {
  const props = payload?.properties ?? {};
  const value = (key) => props[key]?.value ?? null;
  return {
    station: props.station ?? null,
    timestamp: props.timestamp ?? null,
    textDescription: props.textDescription ?? null,
    temperatureC: round(value('temperature'), 1),
    dewpointC: round(value('dewpoint'), 1),
    windDirectionDeg: round(value('windDirection'), 0),
    windSpeedKph: round(value('windSpeed'), 1),
    windGustKph: round(value('windGust'), 1),
    barometricPressurePa: round(value('barometricPressure'), 0),
    seaLevelPressurePa: round(value('seaLevelPressure'), 0),
    visibilityM: round(value('visibility'), 0),
    relativeHumidityPct: round(value('relativeHumidity'), 0),
    windChillC: round(value('windChill'), 1),
    heatIndexC: round(value('heatIndex'), 1),
    precipitationLastHourMm: round(value('precipitationLastHour'), 2)
  };
};

const normalizeForecastPeriod = (period) => ({
  number: period.number ?? null,
  name: period.name ?? null,
  startTime: period.startTime ?? null,
  endTime: period.endTime ?? null,
  isDaytime: period.isDaytime ?? null,
  temperature: period.temperature ?? null,
  temperatureUnit: period.temperatureUnit ?? null,
  probabilityOfPrecipitationPct: period.probabilityOfPrecipitation?.value ?? null,
  dewpointC: round(period.dewpoint?.value, 1),
  relativeHumidityPct: round(period.relativeHumidity?.value, 0),
  windSpeed: period.windSpeed ?? null,
  windDirection: period.windDirection ?? null,
  shortForecast: period.shortForecast ?? null,
  detailedForecast: period.detailedForecast ?? null
});

const failedProbeShape = (probe, error) => ({
  ...probe,
  ok: false,
  error: probe?.error ?? error
});

const hasObservationValueObject = (props, key) => (
  props[key] &&
  typeof props[key] === 'object' &&
  Object.prototype.hasOwnProperty.call(props[key], 'value')
);

const requireObservationProbe = (probe) => {
  if (!probe?.ok) return probe;
  const props = probe.json?.properties;
  if (!props || typeof props !== 'object') {
    return failedProbeShape(probe, 'NWS latest observation payload missing properties.');
  }
  const hasIdentity = typeof props.timestamp === 'string' && props.timestamp.length > 0 && props.station;
  const hasObservationShape = (
    typeof props.textDescription === 'string' ||
    [
      'temperature',
      'dewpoint',
      'windDirection',
      'windSpeed',
      'barometricPressure',
      'visibility',
      'relativeHumidity',
      'precipitationLastHour'
    ].some((key) => hasObservationValueObject(props, key))
  );
  return hasIdentity && hasObservationShape
    ? probe
    : failedProbeShape(probe, 'NWS latest observation payload missing timestamp, station, or measurement fields.');
};

const requireForecastPeriodsProbe = (probe, label) => {
  if (!probe?.ok) return probe;
  const periods = probe.json?.properties?.periods;
  return Array.isArray(periods) && periods.length > 0 ? probe : failedProbeShape(probe, `NWS ${label} payload missing forecast periods.`);
};

const normalizeAlert = (feature) => {
  const props = feature.properties ?? {};
  return {
    id: props.id ?? feature.id ?? null,
    event: props.event ?? null,
    severity: props.severity ?? null,
    certainty: props.certainty ?? null,
    urgency: props.urgency ?? null,
    effective: props.effective ?? null,
    expires: props.expires ?? null,
    headline: props.headline ?? null,
    areaDesc: props.areaDesc ?? null,
    instruction: props.instruction ?? null
  };
};

export const fetchLiveWeatherForTrack = async (track) => {
  const checkedAt = new Date().toISOString();
  const point = `${track.latitude.toFixed(4)},${track.longitude.toFixed(4)}`;
  const probes = [];

  const pointProbe = await nwsJson(`https://api.weather.gov/points/${point}`);
  probes.push({ id: 'nws_points', ...pointProbe, json: undefined });
  if (!pointProbe.ok || !pointProbe.json?.properties) {
    return {
      schemaVersion: 'live-weather.v1',
      checkedAt,
      sourceState: 'error',
      source: 'NWS API',
      track,
      point,
      observation: null,
      forecastHourly: [],
      forecast: [],
      alerts: [],
      probes,
      error: pointProbe.error ?? 'NWS point metadata unavailable'
    };
  }

  const pointProps = pointProbe.json.properties;
  const stationListProbe = pointProps.observationStations
    ? await nwsJson(pointProps.observationStations)
    : { ok: false, status: null, url: null, latencyMs: 0, lastModified: null, contentType: null, bytes: 0, json: null, error: 'NWS observation station URL unavailable' };
  probes.push({ id: 'nws_observation_stations', ...stationListProbe, json: undefined });
  const stationUrl = stationListProbe.json?.features?.[0]?.id ?? null;
  const stationId = stationUrl?.split('/').at(-1) ?? null;
  const missingObservationProbe = {
    ok: false,
    status: null,
    url: pointProps.observationStations ?? null,
    latencyMs: 0,
    lastModified: null,
    contentType: null,
    bytes: 0,
    json: null,
    error: stationListProbe.ok ? 'NWS observation station list returned no stations' : 'NWS observation station unavailable'
  };
  const missingHourlyProbe = {
    ok: false,
    status: null,
    url: null,
    latencyMs: 0,
    lastModified: null,
    contentType: null,
    bytes: 0,
    json: null,
    error: 'NWS hourly forecast URL unavailable'
  };
  const missingForecastProbe = {
    ok: false,
    status: null,
    url: null,
    latencyMs: 0,
    lastModified: null,
    contentType: null,
    bytes: 0,
    json: null,
    error: 'NWS daily forecast URL unavailable'
  };

  const [rawObservationProbe, rawHourlyProbe, rawForecastProbe, alertsProbe] = await Promise.all([
    stationId ? nwsJson(`https://api.weather.gov/stations/${stationId}/observations/latest`) : Promise.resolve(missingObservationProbe),
    pointProps.forecastHourly ? nwsJson(pointProps.forecastHourly) : Promise.resolve(missingHourlyProbe),
    pointProps.forecast ? nwsJson(pointProps.forecast) : Promise.resolve(missingForecastProbe),
    nwsJson(`https://api.weather.gov/alerts/active?point=${point}`)
  ]);
  const observationProbe = requireObservationProbe(rawObservationProbe);
  const hourlyProbe = requireForecastPeriodsProbe(rawHourlyProbe, 'hourly forecast');
  const forecastProbe = requireForecastPeriodsProbe(rawForecastProbe, 'daily forecast');

  for (const [id, probe] of [
    ['nws_latest_observation', observationProbe],
    ['nws_hourly_forecast', hourlyProbe],
    ['nws_forecast', forecastProbe],
    ['nws_alerts', alertsProbe]
  ]) {
    if (probe) probes.push({ id, ...probe, json: undefined });
  }

  const observation = observationProbe?.ok ? normalizeObservation(observationProbe.json) : null;
  /* Keep two days of hourly periods so the Race Week strip can reach the
   * scheduled session windows ("his race hour") during race-week crunch,
   * without bloating the polled payload the way the full 156-hour range would. */
  const forecastHourly = asArray(hourlyProbe?.json?.properties?.periods).slice(0, 48).map(normalizeForecastPeriod);
  const forecast = asArray(forecastProbe?.json?.properties?.periods).slice(0, 8).map(normalizeForecastPeriod);
  const alerts = asArray(alertsProbe?.json?.features).map(normalizeAlert);

  return {
    schemaVersion: 'live-weather.v1',
    checkedAt,
    sourceState: probes.every((probe) => probe.ok) ? 'live' : 'partial',
    source: 'NWS API',
    track,
    point,
    grid: {
      office: pointProps.gridId ?? null,
      gridX: pointProps.gridX ?? null,
      gridY: pointProps.gridY ?? null,
      forecastZone: pointProps.forecastZone ?? null,
      county: pointProps.county ?? null,
      fireWeatherZone: pointProps.fireWeatherZone ?? null
    },
    station: {
      id: stationId,
      url: stationUrl
    },
    observation,
    forecastHourly,
    forecast,
    alerts,
    probes
  };
};

export const fetchCachedLiveWeatherForTrack = async (
  track,
  { ttlMs = defaultWeatherCacheTtlMs, nowMs = Date.now(), forceRefresh = false } = {}
) => {
  const key = cacheKeyForTrack(track);
  const cached = weatherCache.get(key);
  if (!forceRefresh && cached && nowMs - cached.fetchedAtMs <= ttlMs) {
    return withCacheState(cached.report, {
      status: 'hit',
      key,
      fetchedAt: new Date(cached.fetchedAtMs).toISOString(),
      expiresAt: new Date(cached.fetchedAtMs + ttlMs).toISOString(),
      ttlMs
    });
  }

  if (weatherInflight.has(key)) {
    const report = await weatherInflight.get(key);
    return withCacheState(report, {
      status: 'joined_inflight',
      key,
      fetchedAt: report.checkedAt,
      expiresAt: new Date(Date.parse(report.checkedAt) + ttlMs).toISOString(),
      ttlMs
    });
  }

  const request = fetchLiveWeatherForTrack(track);
  weatherInflight.set(key, request);
  try {
    const report = await request;
    const fetchedAtMs = Date.parse(report.checkedAt);
    weatherCache.set(key, {
      fetchedAtMs: Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now(),
      report
    });
    return withCacheState(report, {
      status: 'miss',
      key,
      fetchedAt: report.checkedAt,
      expiresAt: new Date((Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now()) + ttlMs).toISOString(),
      ttlMs
    });
  } finally {
    weatherInflight.delete(key);
  }
};

const unavailableLiveWeatherForTrack = (track, error, { deadlineMs } = {}) => ({
  schemaVersion: 'live-weather.v1',
  checkedAt: new Date().toISOString(),
  sourceState: 'error',
  source: 'NWS API',
  track,
  point: `${track.latitude.toFixed(4)},${track.longitude.toFixed(4)}`,
  observation: null,
  forecastHourly: [],
  forecast: [],
  alerts: [],
  probes: [
    {
      id: 'upcoming_weather_deadline',
      ok: false,
      status: null,
      url: null,
      latencyMs: deadlineMs ?? null,
      lastModified: null,
      contentType: null,
      bytes: 0,
      error
    }
  ],
  error
});

const withTrackDeadline = async (track, request, { deadlineMs = defaultUpcomingWeatherTrackDeadlineMs } = {}) => {
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => {
      resolve(unavailableLiveWeatherForTrack(track, `Upcoming weather deadline exceeded after ${deadlineMs} ms`, { deadlineMs }));
    }, deadlineMs);
  });
  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timeout);
  }
};

export const buildUpcomingIndyNxtWeatherReport = async ({
  useCache = true,
  forceRefresh = false,
  ttlMs = defaultWeatherCacheTtlMs,
  concurrency = defaultUpcomingWeatherConcurrency,
  trackDeadlineMs = defaultUpcomingWeatherTrackDeadlineMs
} = {}) => {
  const events = await loadUpcomingIndyNxtEvents();
  const weatherByTrackId = new Map();

  const tracks = [];
  for (const event of events) {
    if (!weatherByTrackId.has(event.track.id) && !tracks.some((track) => track.id === event.track.id)) {
      tracks.push(event.track);
    }
  }

  let nextTrackIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), tracks.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextTrackIndex < tracks.length) {
      const track = tracks[nextTrackIndex];
      nextTrackIndex += 1;
      const request = useCache
        ? fetchCachedLiveWeatherForTrack(track, { ttlMs, forceRefresh })
        : fetchLiveWeatherForTrack(track);
      const weather = await withTrackDeadline(track, request, { deadlineMs: trackDeadlineMs });
      weatherByTrackId.set(track.id, weather);
    }
  });
  await Promise.all(workers);

  return {
    schemaVersion: 'live-weather-upcoming.v1',
    checkedAt: new Date().toISOString(),
    sourceState: [...weatherByTrackId.values()].every((weather) => weather.sourceState === 'live') ? 'live' : 'partial',
    concurrency: workerCount,
    trackDeadlineMs,
    series: 'INDY NXT',
    eventCount: events.length,
    events: events.map((event) => ({
      event,
      forecastReadiness: eventForecastReadiness(event),
      weather: weatherByTrackId.get(event.track.id)
    }))
  };
};
