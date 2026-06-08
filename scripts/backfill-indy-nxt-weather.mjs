import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawRoot = join(root, 'data/career/raw/weather/open-meteo/indy-nxt');
const reportPath = join(root, 'data/career/reports/indy-nxt-weather-backfill-report.json');

const refresh = process.argv.includes('--refresh');
const sourcePrefix = 'source_weather_indy_nxt_open_meteo_';
const weatherPrefix = 'weather_indy_nxt_open_meteo_';
const hourlyVariables = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation',
  'rain',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'shortwave_radiation',
  'soil_temperature_0_to_7cm'
];

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const datePart = (value) => String(value ?? '').slice(0, 10);
const hasExactStart = (session) => {
  const start = session.actualStart ?? session.scheduledStart;
  return typeof start === 'string' && start.includes('T');
};

const todayUtcDate = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) => {
  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
};
const archiveCutoffDate = addDays(todayUtcDate(), -1);

const pad2 = (value) => String(value).padStart(2, '0');
const nearestLocalHour = (localDateTime) => {
  const match = String(localDateTime).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  let [, year, month, day, hour, minute] = match.map((value, index) => (index === 0 ? value : Number(value)));
  if (minute >= 30) {
    const utc = Date.UTC(year, month - 1, day, hour + 1);
    const rounded = new Date(utc);
    year = rounded.getUTCFullYear();
    month = rounded.getUTCMonth() + 1;
    day = rounded.getUTCDate();
    hour = rounded.getUTCHours();
  }
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:00`;
};

const valueAt = (hourly, key, index) => {
  const value = hourly?.[key]?.[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const weatherCodeLabel = (code) => {
  const labels = {
    0: 'clear_sky',
    1: 'mainly_clear',
    2: 'partly_cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'depositing_rime_fog',
    51: 'light_drizzle',
    53: 'moderate_drizzle',
    55: 'dense_drizzle',
    56: 'light_freezing_drizzle',
    57: 'dense_freezing_drizzle',
    61: 'slight_rain',
    63: 'moderate_rain',
    65: 'heavy_rain',
    66: 'light_freezing_rain',
    67: 'heavy_freezing_rain',
    71: 'slight_snow',
    73: 'moderate_snow',
    75: 'heavy_snow',
    77: 'snow_grains',
    80: 'slight_rain_showers',
    81: 'moderate_rain_showers',
    82: 'violent_rain_showers',
    85: 'slight_snow_showers',
    86: 'heavy_snow_showers',
    95: 'thunderstorm',
    96: 'thunderstorm_slight_hail',
    99: 'thunderstorm_heavy_hail'
  };
  return labels[code] ?? (code == null ? null : `wmo_${code}`);
};

const wetDryFrom = ({ precipitationMm, rainMm, weatherCode }) => {
  if ((rainMm ?? 0) >= 0.2 || (precipitationMm ?? 0) >= 0.2 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode)) return 'wet';
  if ((rainMm ?? 0) > 0 || (precipitationMm ?? 0) > 0) return 'damp';
  return 'dry';
};

const thermalStressFrom = (apparentTempC) => {
  if (apparentTempC == null) return 'unknown';
  if (apparentTempC >= 32) return 'extreme_heat';
  if (apparentTempC >= 27) return 'hot';
  if (apparentTempC <= 5) return 'cold';
  if (apparentTempC <= 12) return 'cool';
  return 'moderate';
};

const windRiskFrom = (windGustKph, windSpeedKph) => {
  const speed = Math.max(windGustKph ?? 0, windSpeedKph ?? 0);
  if (speed >= 50) return 'high';
  if (speed >= 35) return 'medium';
  return 'low';
};

const buildOpenMeteoUrl = ({ latitude, longitude, date, timezone }) => {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: date,
    end_date: date,
    hourly: hourlyVariables.join(','),
    timezone,
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  }).toString();
  return url.toString();
};

const fetchOrRead = async ({ track, date, timezone, report }) => {
  const rawPath = join(rawRoot, slug(track.id), `${date}.json`);
  if (!refresh) {
    try {
      const cached = await readJson(rawPath);
      report.cacheHits += 1;
      return { rawPath, payload: cached };
    } catch {
      // Fetch below.
    }
  }

  const requestUrl = buildOpenMeteoUrl({
    latitude: track.latitude,
    longitude: track.longitude,
    date,
    timezone
  });
  const response = await fetch(requestUrl);
  const body = await response.json();
  const payload = {
    requestedAt: new Date().toISOString(),
    request: {
      url: requestUrl,
      latitude: track.latitude,
      longitude: track.longitude,
      date,
      timezone,
      hourly: hourlyVariables
    },
    responseStatus: response.status,
    responseOk: response.ok,
    response: body
  };
  await writeJson(rawPath, payload);
  report.fetched += 1;
  return { rawPath, payload };
};

const sourceEvidence = ({ id, rawPath, track, date, requestUrl, generatedAt }) => ({
  id,
  sourceType: 'weather_api',
  sourceName: 'Open-Meteo Historical Weather API',
  url: requestUrl,
  retrievedAt: generatedAt,
  rawArtifactPath: relative(root, rawPath),
  confidenceTier: 'medium',
  coverage: `Non-official hourly modeled ambient weather for ${track.name} on ${date}.`,
  notes: 'Open-Meteo archive is modeled/reanalysis-style ambient weather at track coordinates. It is not an official INDY NXT session report and must not be used as track temperature.',
  provenanceRefs: []
});

const main = async () => {
  const generatedAt = new Date().toISOString();
  const dataset = await readJson(datasetPath);
  const eventsById = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const tracksById = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));

  const indySessions = asArray(dataset.sessions)
    .filter((session) => eventsById.get(session.eventId)?.seriesId === 'series_indy_nxt');
  const exactSessions = indySessions.filter(hasExactStart);
  const eligibleSessions = exactSessions.filter((session) => datePart(session.actualStart ?? session.scheduledStart) <= archiveCutoffDate);
  const dateOnlySessions = indySessions.filter((session) => !hasExactStart(session));
  const futureSessions = exactSessions.filter((session) => datePart(session.actualStart ?? session.scheduledStart) > archiveCutoffDate);

  const report = {
    generatedAt,
    source: 'open_meteo_historical_archive',
    archiveCutoffDate,
    requestedVariables: hourlyVariables,
    eligibleExactWindowSessions: eligibleSessions.length,
    skippedDateOnlySessions: dateOnlySessions.length,
    skippedFutureSessions: futureSessions.length,
    joinedSessions: 0,
    joinedBySessionType: {},
    skipped: [],
    joined: [],
    fetched: 0,
    cacheHits: 0,
    sourceEvidenceUpserted: 0,
    rawArtifacts: []
  };

  const sourceEvidenceById = new Map(
    asArray(dataset.sourceEvidence)
      .filter((row) => !String(row.id).startsWith(sourcePrefix))
      .map((row) => [row.id, row])
  );
  const weatherRowsById = new Map(
    asArray(dataset.weatherObservations)
      .filter((row) => !String(row.id).startsWith(weatherPrefix))
      .map((row) => [row.id, row])
  );

  const weatherIdsBySession = new Map();
  for (const session of eligibleSessions) {
    const event = eventsById.get(session.eventId);
    const track = tracksById.get(event?.trackId);
    const start = session.actualStart ?? session.scheduledStart;
    const localHour = nearestLocalHour(start);
    const date = datePart(localHour);
    const skip = (reason) => {
      report.skipped.push({ sessionId: session.id, reason });
    };
    if (!event) {
      skip('missing_event');
      continue;
    }
    if (!track) {
      skip('missing_track');
      continue;
    }
    if (typeof track.latitude !== 'number' || typeof track.longitude !== 'number') {
      skip('missing_track_coordinates');
      continue;
    }
    if (!track.timezone && !session.timezone) {
      skip('missing_timezone');
      continue;
    }
    if (!localHour || !date) {
      skip('invalid_session_start');
      continue;
    }

    const timezone = session.timezone ?? track.timezone;
    const { rawPath, payload } = await fetchOrRead({ track, date, timezone, report });
    const hourly = payload.response?.hourly;
    const index = asArray(hourly?.time).findIndex((time) => time === localHour);
    const requestUrl = payload.request?.url ?? buildOpenMeteoUrl({
      latitude: track.latitude,
      longitude: track.longitude,
      date,
      timezone
    });
    report.rawArtifacts.push(relative(root, rawPath));
    if (!payload.responseOk || index < 0) {
      report.skipped.push({
        sessionId: session.id,
        reason: payload.responseOk ? 'matching_hour_missing' : 'open_meteo_response_not_ok',
        rawArtifactPath: relative(root, rawPath)
      });
      continue;
    }

    const evidenceId = `${sourcePrefix}${slug(track.id)}_${date.replaceAll('-', '')}`;
    sourceEvidenceById.set(evidenceId, sourceEvidence({ id: evidenceId, rawPath, track, date, requestUrl, generatedAt }));

    const weatherCode = valueAt(hourly, 'weather_code', index);
    const precipitationMm = valueAt(hourly, 'precipitation', index);
    const rainMm = valueAt(hourly, 'rain', index);
    const apparentTempC = valueAt(hourly, 'apparent_temperature', index);
    const windSpeedKph = valueAt(hourly, 'wind_speed_10m', index);
    const windGustKph = valueAt(hourly, 'wind_gusts_10m', index);
    const weatherId = `${weatherPrefix}${session.id}`;
    weatherRowsById.set(weatherId, {
      id: weatherId,
      trackId: track.id,
      sessionId: session.id,
      observedAt: localHour,
      source: 'Open-Meteo Historical Weather API hourly archive',
      stationId: 'open_meteo_track_coordinate_model',
      latitude: track.latitude,
      longitude: track.longitude,
      distanceFromTrackKm: 0,
      ambientTempC: valueAt(hourly, 'temperature_2m', index),
      apparentTempC,
      ambientConditionRaw: weatherCodeLabel(weatherCode),
      weatherCode,
      trackTempC: null,
      trackTempSource: null,
      trackCondition: null,
      trackConditionRaw: null,
      gripLevel: 'unknown',
      airDensityKgM3: null,
      relativeHumidityPct: valueAt(hourly, 'relative_humidity_2m', index),
      dewPointC: valueAt(hourly, 'dew_point_2m', index),
      windSpeedKph,
      windGustKph,
      windDirectionDeg: valueAt(hourly, 'wind_direction_10m', index),
      precipitationMm,
      rainMm,
      precipitationType: precipitationMm && precipitationMm > 0 ? 'precipitation' : null,
      pressureHpa: valueAt(hourly, 'pressure_msl', index),
      cloudCoverPct: valueAt(hourly, 'cloud_cover', index),
      shortwaveRadiationWm2: valueAt(hourly, 'shortwave_radiation', index),
      soilTemp0To7CmC: valueAt(hourly, 'soil_temperature_0_to_7cm', index),
      soilTempProxyForTrackTemp: true,
      wetDry: wetDryFrom({ precipitationMm, rainMm, weatherCode }),
      thermalStress: thermalStressFrom(apparentTempC),
      windRisk: windRiskFrom(windGustKph, windSpeedKph),
      confidence: 'modeled_medium',
      timeWindowStart: localHour,
      timeWindowEnd: localHour,
      timeWindowReason: 'nearest_open_meteo_hour_to_exact_session_start',
      sourceSessionStart: start,
      joinedHourOffsetMinutes: Math.round((Date.parse(localHour) - Date.parse(`${String(start).slice(0, 13)}:00`)) / 60000),
      trackCoordinateSource: 'track_metadata',
      weatherSourceType: 'grid_reanalysis',
      timeConfidence: 'exact_session_hour',
      locationConfidence: 'track_coordinate',
      joinNotes: 'Non-official Open-Meteo hourly archive joined to the nearest local hour at track coordinates. Do not treat as official INDY NXT weather or track temperature.',
      caveats: [
        'non_official_modeled_weather',
        'track_temperature_unavailable',
        'soil_temperature_is_weak_surface_proxy_only',
        'no_station_crosscheck'
      ],
      rawArtifactPath: relative(root, rawPath),
      provenanceRefs: [evidenceId]
    });
    weatherIdsBySession.set(session.id, weatherId);
    report.joinedSessions += 1;
    report.joinedBySessionType[session.sessionType] = (report.joinedBySessionType[session.sessionType] ?? 0) + 1;
    report.joined.push({
      sessionId: session.id,
      sessionType: session.sessionType,
      trackId: track.id,
      sourceSessionStart: start,
      joinedLocalHour: localHour,
      weatherId,
      confidence: 'modeled_medium',
      rawArtifactPath: relative(root, rawPath)
    });
  }

  const updatedSessions = asArray(dataset.sessions).map((session) => {
    const cleanedRefs = asArray(session.weatherObservationRefs).filter((id) => !String(id).startsWith(weatherPrefix));
    const weatherId = weatherIdsBySession.get(session.id);
    return weatherId
      ? { ...session, weatherObservationRefs: [...cleanedRefs, weatherId] }
      : { ...session, weatherObservationRefs: cleanedRefs };
  });

  report.sourceEvidenceUpserted = [...sourceEvidenceById.keys()].filter((id) => String(id).startsWith(sourcePrefix)).length;
  report.rawArtifacts = [...new Set(report.rawArtifacts)].sort();
  report.joined.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  report.skipped.sort((a, b) => String(a.sessionId).localeCompare(String(b.sessionId)));

  const output = {
    ...dataset,
    sessions: updatedSessions,
    weatherObservations: Array.from(weatherRowsById.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: Array.from(sourceEvidenceById.values()).sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeJson(datasetPath, output);
  await writeJson(reportPath, report);
  console.log(JSON.stringify({
    wrote: relative(root, datasetPath),
    report: relative(root, reportPath),
    source: report.source,
    archiveCutoffDate,
    joinedSessions: report.joinedSessions,
    joinedBySessionType: report.joinedBySessionType,
    skippedDateOnlySessions: report.skippedDateOnlySessions,
    skippedFutureSessions: report.skippedFutureSessions,
    fetched: report.fetched,
    cacheHits: report.cacheHits,
    sourceEvidenceUpserted: report.sourceEvidenceUpserted
  }, null, 2));
};

await main();
