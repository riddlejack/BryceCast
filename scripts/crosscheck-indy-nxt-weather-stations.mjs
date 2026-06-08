import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const reportPath = join(root, 'data/career/reports/indy-nxt-weather-station-crosscheck-report.json');
const rawRoot = join(root, 'data/career/raw/weather/noaa-ghcnh/indy-nxt');
const stationListUrl = 'https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-station-list.csv';
const stationListRawPath = join(rawRoot, 'doc/ghcnh-station-list.csv');
const ghcnhBaseUrl = 'https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/access/by-year';
const sourceDocs = [
  'https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly',
  'https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh_DOCUMENTATION.pdf'
];

const refresh = process.argv.includes('--refresh');
const maxStationDistanceKm = 75;
const maxObservationOffsetMinutes = 75;
const sampleSessionIds = [
  'session_indy_nxt_2024_6314',
  'session_indy_nxt_2024_6317',
  'session_indy_nxt_2024_6319',
  'session_indy_nxt_2024_6326',
  'session_indy_nxt_2025_6446',
  'session_indy_nxt_2025_6454'
];

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};
const writeText = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const numberOrNull = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const metersPerSecondToKph = (value) => value == null ? null : round(value * 3.6);
const round = (value, digits = 1) => {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const datePart = (value) => String(value ?? '').slice(0, 10);
const yearPart = (value) => String(value ?? '').slice(0, 4);
const stationFileUrl = (stationId, year) => `${ghcnhBaseUrl}/${year}/psv/GHCNh_${stationId}_${year}.psv`;
const stationFileRawPath = (stationId, year) => join(rawRoot, 'stations', year, `GHCNh_${stationId}_${year}.psv`);

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const radiusKm = 6371;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const readOrFetchText = async ({ url, rawPath, report }) => {
  if (!refresh) {
    try {
      const text = await readFile(rawPath, 'utf8');
      report.cacheHits += 1;
      return { text, fetched: false };
    } catch {
      // Fetch below.
    }
  }
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${url}`);
  }
  await writeText(rawPath, text);
  report.fetched += 1;
  return { text, fetched: true };
};

const parseCsvStationList = (text) => {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  return lines
    .map((line) => line.split(','))
    .map((parts) => ({
      id: parts[headerIndex.get('GHCN_ID')],
      latitude: numberOrNull(parts[headerIndex.get('LATITUDE')]),
      longitude: numberOrNull(parts[headerIndex.get('LONGITUDE')]),
      elevationM: numberOrNull(parts[headerIndex.get('ELEVATION')]),
      state: parts[headerIndex.get('STATE')] || null,
      name: parts[headerIndex.get('NAME')] || null,
      wmoId: parts[headerIndex.get('WMO_ID')] || null,
      icao: parts[headerIndex.get('ICAO')] || null,
      isoCode: parts[headerIndex.get('ISO_CODE')] || null
    }))
    .filter((station) =>
      station.isoCode === 'US'
      && station.icao
      && station.id
      && Number.isFinite(station.latitude)
      && Number.isFinite(station.longitude)
    );
};

const parsePsv = (text) => {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split('|');
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  return lines.map((line) => {
    const parts = line.split('|');
    const pick = (key) => parts[headerIndex.get(key)] ?? null;
    return {
      observedAtUtc: pick('DATE'),
      temperatureC: numberOrNull(pick('temperature')),
      dewPointC: numberOrNull(pick('dew_point_temperature')),
      relativeHumidityPct: numberOrNull(pick('relative_humidity')),
      pressureHpa: numberOrNull(pick('sea_level_pressure')),
      windDirectionDeg: numberOrNull(pick('wind_direction')),
      windSpeedKph: metersPerSecondToKph(numberOrNull(pick('wind_speed'))),
      windGustKph: metersPerSecondToKph(numberOrNull(pick('wind_gust'))),
      precipitationMm: numberOrNull(pick('precipitation')),
      skyCondition: pick('sky_condition') || null,
      rem: pick('REM') || null,
      quality: {
        temperature: pick('temperature_Quality_Code') || null,
        dewPoint: pick('dew_point_temperature_Quality_Code') || null,
        pressure: pick('sea_level_pressure_Quality_Code') || null,
        windSpeed: pick('wind_speed_Quality_Code') || null,
        precipitation: pick('precipitation_Quality_Code') || null
      }
    };
  });
};

const partsInTimeZone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
};

const localDateTimeToUtc = (localDateTime, timeZone) => {
  const match = String(localDateTime).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const desiredLocalAsUtc = Date.UTC(y, m - 1, d, h, min);
  let guess = desiredLocalAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const parts = partsInTimeZone(new Date(guess), timeZone);
    const representedLocalAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += desiredLocalAsUtc - representedLocalAsUtc;
  }
  return new Date(guess);
};

const nearestStationObservation = (rows, targetUtc) => {
  let best = null;
  for (const row of rows) {
    if (!row.observedAtUtc) continue;
    const observedAt = new Date(`${row.observedAtUtc}Z`);
    if (Number.isNaN(observedAt.getTime())) continue;
    const offsetMinutes = Math.round((observedAt.getTime() - targetUtc.getTime()) / 60000);
    if (Math.abs(offsetMinutes) > maxObservationOffsetMinutes) continue;
    if (!best || Math.abs(offsetMinutes) < Math.abs(best.offsetMinutes)) {
      best = { row, offsetMinutes };
    }
  }
  return best;
};

const compare = (model, station) => {
  const deltas = {
    temperatureC: model.ambientTempC == null || station.temperatureC == null ? null : round(model.ambientTempC - station.temperatureC),
    dewPointC: model.dewPointC == null || station.dewPointC == null ? null : round(model.dewPointC - station.dewPointC),
    relativeHumidityPct: model.relativeHumidityPct == null || station.relativeHumidityPct == null ? null : round(model.relativeHumidityPct - station.relativeHumidityPct),
    pressureHpa: model.pressureHpa == null || station.pressureHpa == null ? null : round(model.pressureHpa - station.pressureHpa),
    windSpeedKph: model.windSpeedKph == null || station.windSpeedKph == null ? null : round(model.windSpeedKph - station.windSpeedKph),
    windGustKph: model.windGustKph == null || station.windGustKph == null ? null : round(model.windGustKph - station.windGustKph),
    precipitationMm: model.precipitationMm == null || station.precipitationMm == null ? null : round(model.precipitationMm - station.precipitationMm)
  };
  const breaches = [];
  if (deltas.temperatureC != null && Math.abs(deltas.temperatureC) > 5) breaches.push('temperature_delta_gt_5c');
  if (deltas.dewPointC != null && Math.abs(deltas.dewPointC) > 5) breaches.push('dew_point_delta_gt_5c');
  if (deltas.relativeHumidityPct != null && Math.abs(deltas.relativeHumidityPct) > 25) breaches.push('relative_humidity_delta_gt_25pct');
  if (deltas.pressureHpa != null && Math.abs(deltas.pressureHpa) > 8) breaches.push('pressure_delta_gt_8hpa');
  if (deltas.windSpeedKph != null && Math.abs(deltas.windSpeedKph) > 25) breaches.push('wind_speed_delta_gt_25kph');
  if ((model.precipitationMm ?? 0) === 0 && (station.precipitationMm ?? 0) > 1) breaches.push('station_precip_when_model_dry');
  if ((model.precipitationMm ?? 0) > 1 && (station.precipitationMm ?? 0) === 0) breaches.push('model_precip_when_station_dry');
  return {
    deltas,
    materialConflict: breaches.length > 0,
    breachReasons: breaches
  };
};

const main = async () => {
  const generatedAt = new Date().toISOString();
  const dataset = await readJson(datasetPath);
  const eventsById = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const tracksById = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));
  const sessionsById = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const weatherBySessionId = new Map(asArray(dataset.weatherObservations).map((row) => [row.sessionId, row]));

  const report = {
    schemaVersion: 'brycecast-indy-nxt-weather-station-crosscheck.v1',
    generatedAt,
    source: 'noaa_ncei_ghcnh',
    stationListUrl,
    sourceDocs,
    requestedSessionIds: sampleSessionIds,
    maxStationDistanceKm,
    maxObservationOffsetMinutes,
    samplesRequested: sampleSessionIds.length,
    samplesMatched: 0,
    samplesUnmatched: 0,
    samplesWithNoMaterialConflict: 0,
    samplesWithMaterialConflict: 0,
    fetched: 0,
    cacheHits: 0,
    rawArtifacts: [],
    unmatched: [],
    samples: []
  };

  const { text: stationListText } = await readOrFetchText({ url: stationListUrl, rawPath: stationListRawPath, report });
  report.rawArtifacts.push(relative(root, stationListRawPath));
  const stations = parseCsvStationList(stationListText);
  const stationFileCache = new Map();

  const stationFile = async (stationId, year) => {
    const cacheKey = `${stationId}:${year}`;
    if (stationFileCache.has(cacheKey)) return stationFileCache.get(cacheKey);
    const url = stationFileUrl(stationId, year);
    const rawPath = stationFileRawPath(stationId, year);
    const { text } = await readOrFetchText({ url, rawPath, report });
    report.rawArtifacts.push(relative(root, rawPath));
    const parsed = { url, rawPath, rows: parsePsv(text) };
    stationFileCache.set(cacheKey, parsed);
    return parsed;
  };

  for (const sessionId of sampleSessionIds) {
    const session = sessionsById.get(sessionId);
    const event = eventsById.get(session?.eventId);
    const track = tracksById.get(event?.trackId);
    const modelWeather = weatherBySessionId.get(sessionId);
    const start = session?.actualStart ?? session?.scheduledStart;
    const year = yearPart(start);
    const timezone = session?.timezone ?? track?.timezone;
    const targetUtc = localDateTimeToUtc(start, timezone);

    const unmatched = (reason) => {
      report.samplesUnmatched += 1;
      report.unmatched.push({ sessionId, reason });
    };

    if (!session || !event || event.seriesId !== 'series_indy_nxt') {
      unmatched('missing_indy_nxt_session');
      continue;
    }
    if (!track || typeof track.latitude !== 'number' || typeof track.longitude !== 'number') {
      unmatched('missing_track_coordinates');
      continue;
    }
    if (!modelWeather) {
      unmatched('missing_open_meteo_weather_row');
      continue;
    }
    if (!targetUtc || !year || !timezone) {
      unmatched('missing_exact_start_or_timezone');
      continue;
    }

    const candidateStations = stations
      .map((station) => ({
        ...station,
        distanceFromTrackKm: haversineKm(track.latitude, track.longitude, station.latitude, station.longitude)
      }))
      .filter((station) => station.distanceFromTrackKm <= maxStationDistanceKm)
      .sort((a, b) => a.distanceFromTrackKm - b.distanceFromTrackKm)
      .slice(0, 8);

    let matched = null;
    for (const station of candidateStations) {
      try {
        const file = await stationFile(station.id, year);
        const observation = nearestStationObservation(file.rows, targetUtc);
        if (!observation) continue;
        matched = { station, file, observation };
        break;
      } catch (error) {
        report.unmatched.push({
          sessionId,
          stationId: station.id,
          reason: 'station_file_unavailable',
          message: error.message
        });
      }
    }

    if (!matched) {
      unmatched('no_station_observation_within_window');
      continue;
    }

    const stationObservation = matched.observation.row;
    const comparison = compare(modelWeather, stationObservation);
    report.samplesMatched += 1;
    if (comparison.materialConflict) report.samplesWithMaterialConflict += 1;
    else report.samplesWithNoMaterialConflict += 1;

    report.samples.push({
      sessionId,
      sessionName: session.sessionName,
      sessionType: session.sessionType,
      sourceSessionStart: start,
      sourceSessionStartUtc: targetUtc.toISOString(),
      eventId: event.id,
      eventName: event.name,
      track: {
        id: track.id,
        name: track.name,
        latitude: track.latitude,
        longitude: track.longitude,
        timezone
      },
      station: {
        id: matched.station.id,
        name: matched.station.name,
        icao: matched.station.icao,
        latitude: matched.station.latitude,
        longitude: matched.station.longitude,
        elevationM: matched.station.elevationM,
        distanceFromTrackKm: round(matched.station.distanceFromTrackKm)
      },
      stationFileUrl: matched.file.url,
      rawArtifactPath: relative(root, matched.file.rawPath),
      stationObservation: {
        observedAtUtc: `${stationObservation.observedAtUtc}Z`,
        offsetFromSessionStartMinutes: matched.observation.offsetMinutes,
        temperatureC: stationObservation.temperatureC,
        dewPointC: stationObservation.dewPointC,
        relativeHumidityPct: stationObservation.relativeHumidityPct,
        pressureHpa: stationObservation.pressureHpa,
        windDirectionDeg: stationObservation.windDirectionDeg,
        windSpeedKph: stationObservation.windSpeedKph,
        windGustKph: stationObservation.windGustKph,
        precipitationMm: stationObservation.precipitationMm,
        skyCondition: stationObservation.skyCondition,
        quality: stationObservation.quality
      },
      openMeteoWeather: {
        weatherId: modelWeather.id,
        observedAtLocal: modelWeather.observedAt,
        confidence: modelWeather.confidence,
        ambientTempC: modelWeather.ambientTempC,
        dewPointC: modelWeather.dewPointC,
        relativeHumidityPct: modelWeather.relativeHumidityPct,
        pressureHpa: modelWeather.pressureHpa,
        windDirectionDeg: modelWeather.windDirectionDeg,
        windSpeedKph: modelWeather.windSpeedKph,
        windGustKph: modelWeather.windGustKph,
        precipitationMm: modelWeather.precipitationMm,
        wetDry: modelWeather.wetDry
      },
      comparison,
      confidenceDecision: 'canonical_row_remains_modeled_medium_representative_crosscheck_only'
    });
  }

  report.rawArtifacts = [...new Set(report.rawArtifacts)].sort();
  report.samples.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  report.unmatched.sort((a, b) => String(a.sessionId).localeCompare(String(b.sessionId)));

  await writeJson(reportPath, report);
  console.log(JSON.stringify({
    report: relative(root, reportPath),
    source: report.source,
    samplesRequested: report.samplesRequested,
    samplesMatched: report.samplesMatched,
    samplesWithNoMaterialConflict: report.samplesWithNoMaterialConflict,
    samplesWithMaterialConflict: report.samplesWithMaterialConflict,
    fetched: report.fetched,
    cacheHits: report.cacheHits
  }, null, 2));
};

await main();
