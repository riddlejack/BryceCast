// Weather for every race of Bryce's career, one record per race session.
//
// Extends the INDY NXT backfill (scripts/backfill-indy-nxt-weather.mjs) to the
// whole career with the same source: the Open-Meteo Historical Weather API
// (ERA5 / ERA5-Land reanalysis), hourly, at the track's coordinates. Hourly is
// the finest grain that archive serves.
//
// The window is the race itself: its start on the official sheet (actualStart,
// else scheduledStart) to that start plus the race's length (the winner's
// official total time, else Bryce's, else the format printed on the sheet, else
// laps times the winner's best lap). Where a race has no clock start, the stated
// race-day window 09:00 to 18:00 local is used instead (basis 'race_day').
//
// Source tiers stay apart:
//   - an official series condition report (weatherObservations of type
//     series_report on the race session) decides wet or dry;
//   - otherwise wet or dry comes from the reanalysis rain in the window, and is
//     labelled as such. Reanalysis is modelled, never observed.
//
// The canonical dataset is not modified: several producers key weather rows by
// session, so a modelled row there could displace an official report. Raw
// responses are cached under data/career/raw/weather/open-meteo/career/ (INDY NXT
// reuses the existing indy-nxt cache), requests are serial, and the result is
// analysis/career-weather/output/race-weather.json, which the UI data package
// reads as careerLab.raceWeather.
//
//   node scripts/build-career-race-weather.mjs            # cache first
//   node scripts/build-career-race-weather.mjs --refresh  # refetch every day
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const careerRawRoot = join(root, 'data/career/raw/weather/open-meteo/career');
const indyRawRoot = join(root, 'data/career/raw/weather/open-meteo/indy-nxt');
const outputPath = join(root, 'analysis/career-weather/output/race-weather.json');
// Observed wet/dry calls (station reports, race reports) for disputed races with no
// official series report. They outrank the reanalysis; a series report outranks them.
const observedCallsPath = join(root, 'analysis/career-weather/data/observed_calls.json');
const reportPath = join(root, 'data/career/reports/career-race-weather-report.json');
const refresh = process.argv.includes('--refresh');
const BRYCE = 'driver_bryce_aron';
const REQUEST_GAP_MS = 400;

// Same variables as the INDY NXT backfill, so the INDY NXT cache serves as is.
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

const SOURCE_NAME = 'Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis, hourly)';
// Light drizzle (51) is left out: ERA5 paints it over most British race days at
// 0.1 mm, and the official reports call most of those races dry.
const RAIN_CODES = new Set([53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SKY_RAIN_MM = 0.3;
const WET_MM = 0.5;
const STORM_CODES = new Set([95, 96, 99]);
const RACE_DAY_WINDOW = { start: '09:00', end: '18:00' };

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};
const asArray = (value) => (Array.isArray(value) ? value : []);
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, digits = 1) => (value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));
const pad2 = (value) => String(value).padStart(2, '0');

// Local wall-clock arithmetic on "YYYY-MM-DDTHH:MM[:SS]" strings, done in UTC so
// no machine timezone leaks in. Open-Meteo returns local times when given the
// track's timezone, so both sides stay in local wall-clock time.
const toMs = (local) => {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) : NaN;
};
const fromMs = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const HOUR = 3600 * 1000;

// "29:18.827", "1:08:11.4", "00:36:15.1240", "52'27.534", "21:12.996" -> seconds.
const parseDuration = (value) => {
  const text = String(value ?? '').trim().split(/\s+/)[0].replace(/'/g, ':');
  if (!/^[0-9:.]+$/.test(text)) return null;
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (!text.includes('.') && parts.length === 3 && String(text.split(':')[2]).length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 1000; // GB3 2022 MM:SS:mmm
  }
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : null;
};
// "35:00 or 14 Laps", "20:00 Time", "25:00 Time" -> minutes; "18 Laps" -> null.
const formatMinutes = (raceFormat) => {
  const m = String(raceFormat ?? '').match(/(\d{1,3}):(\d{2})/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

const buildUrl = ({ latitude, longitude, startDate, endDate, timezone }) => {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: startDate,
    end_date: endDate,
    hourly: hourlyVariables.join(','),
    timezone,
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  }).toString();
  return url.toString();
};

let lastRequestAt = 0;
const fetchDay = async ({ track, date, timezone, isIndyNxt, report }) => {
  const indyPath = join(indyRawRoot, slug(track.id), `${date}.json`);
  const careerPath = join(careerRawRoot, slug(track.id), `${date}.json`);
  const candidates = isIndyNxt ? [indyPath, careerPath] : [careerPath];
  if (!refresh) {
    for (const path of candidates) {
      try {
        const cached = await readJson(path);
        if (cached.responseOk && cached.response?.hourly?.time?.length) {
          report.cacheHits += 1;
          return { rawPath: path, payload: cached };
        }
      } catch {
        // Next candidate, then fetch.
      }
    }
  }
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const url = buildUrl({ latitude: track.latitude, longitude: track.longitude, startDate: date, endDate: date, timezone });
  let response;
  let body;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    lastRequestAt = Date.now();
    response = await fetch(url);
    body = await response.json().catch(() => null);
    if (response.status !== 429 && response.status < 500) break;
    await sleep(5000 * attempt);
  }
  const payload = {
    requestedAt: new Date().toISOString(),
    request: { url, latitude: track.latitude, longitude: track.longitude, date, timezone, hourly: hourlyVariables },
    responseStatus: response.status,
    responseOk: response.ok,
    response: body
  };
  await writeJson(careerPath, payload);
  report.fetched += 1;
  return { rawPath: careerPath, payload };
};

const circularMeanDeg = (pairs) => {
  // Speed-weighted mean of "from" directions; null when there is no wind.
  let x = 0;
  let y = 0;
  for (const { deg, weight } of pairs) {
    if (deg === null || weight === null) continue;
    const rad = (deg * Math.PI) / 180;
    x += Math.sin(rad) * weight;
    y += Math.cos(rad) * weight;
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  const deg = (Math.atan2(x, y) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
};

const mean = (values) => {
  const nums = values.filter((value) => value !== null && Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
};

// Map an official series condition string to the contract's wet/dry.
const seriesWetDry = (value) => {
  const text = String(value ?? '').toLowerCase();
  if (text === 'wet') return 'wet';
  if (text === 'dry') return 'dry';
  if (['damp', 'drying', 'mixed', 'intermediate'].includes(text)) return 'mixed';
  return null;
};

// Calibrated on the 51 races with an official report: a 'mixed' band or rain
// in the hours before the start only lowered agreement, so the model says wet
// or dry, never mixed.
const reanalysisWetDry = (rainMm) => (rainMm >= WET_MM ? 'wet' : 'dry');

const main = async () => {
  const generatedAt = new Date().toISOString();
  const dataset = await readJson(datasetPath);
  const events = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const tracks = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));
  const sessions = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const weatherById = new Map(asArray(dataset.weatherObservations).map((row) => [row.id, row]));
  const evidenceById = new Map(asArray(dataset.sourceEvidence).map((row) => [row.id, row]));
  const resultsBySession = new Map();
  for (const result of asArray(dataset.results)) {
    if (!resultsBySession.has(result.sessionId)) resultsBySession.set(result.sessionId, []);
    resultsBySession.get(result.sessionId).push(result);
  }
  const observedCalls = new Map(asArray((await readJson(observedCallsPath)).calls).map((call) => [call.sessionId, call]));
  const raceSessionIds = [...new Set(asArray(dataset.results)
    .filter((row) => row.driverId === BRYCE && sessions.get(row.sessionId)?.sessionType === 'race')
    .map((row) => row.sessionId))].sort();

  const report = { generatedAt, source: SOURCE_NAME, refresh, races: raceSessionIds.length, fetched: 0, cacheHits: 0, byBasis: {}, byWetDrySource: {}, bySky: {}, skipped: [], rawArtifacts: [] };
  const records = [];

  for (const sessionId of raceSessionIds) {
    const session = sessions.get(sessionId);
    const event = events.get(session.eventId);
    const track = tracks.get(event?.trackId);
    if (!track || typeof track.latitude !== 'number' || typeof track.longitude !== 'number') {
      report.skipped.push({ sessionId, reason: 'missing_track_coordinates' });
      continue;
    }
    const timezone = session.timezone ?? track.timezone;
    const results = resultsBySession.get(sessionId) ?? [];
    const bryce = results.find((row) => row.driverId === BRYCE) ?? null;
    const winner = results.find((row) => Number(row.finishPosition) === 1) ?? null;

    // The window.
    const startText = session.actualStart ?? session.scheduledStart ?? null;
    let basis;
    let startMs;
    let endMs;
    let durationSource;
    if (typeof startText === 'string' && startText.includes('T') && Number.isFinite(toMs(startText))) {
      basis = 'session_sheet';
      startMs = toMs(startText);
      const winnerSeconds = parseDuration(winner?.totalTime);
      const bryceSeconds = parseDuration(bryce?.totalTime);
      const formatMin = formatMinutes(session.raw?.raceFormat);
      const bestLap = parseDuration(winner?.bestLapTime);
      const laps = Number(winner?.lapsCompleted);
      let seconds = null;
      if (winnerSeconds && winnerSeconds >= 120) [seconds, durationSource] = [winnerSeconds, 'winner_total_time'];
      else if (bryceSeconds && bryceSeconds >= 120) [seconds, durationSource] = [bryceSeconds, 'bryce_total_time'];
      else if (formatMin) [seconds, durationSource] = [formatMin * 60, 'sheet_race_format'];
      else if (bestLap && Number.isFinite(laps) && laps > 0) [seconds, durationSource] = [bestLap * laps * 1.05, 'winner_laps_times_best_lap'];
      else [seconds, durationSource] = [45 * 60, 'assumed_45_minutes'];
      endMs = startMs + seconds * 1000;
    } else {
      basis = 'race_day';
      const day = String(startText ?? event?.eventEndDate ?? event?.eventStartDate ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        report.skipped.push({ sessionId, reason: 'no_race_date' });
        continue;
      }
      startMs = toMs(`${day}T${RACE_DAY_WINDOW.start}`);
      endMs = toMs(`${day}T${RACE_DAY_WINDOW.end}`);
      durationSource = 'stated_race_day_window_0900_1800';
    }

    // Hourly stamps: instantaneous values at every hour from the hour before the
    // start to the hour after the end; precipitation is the hour ENDING at the
    // stamp, so the window's rain sums the stamps whose hour overlaps it.
    const firstStamp = Math.floor(startMs / HOUR) * HOUR;
    const lastStamp = Math.ceil(endMs / HOUR) * HOUR;
    const days = new Set();
    for (let t = firstStamp - 3 * HOUR; t <= lastStamp; t += HOUR) days.add(fromMs(t).slice(0, 10));
    const hourly = new Map();
    let requestUrl = null;
    const rawPaths = [];
    for (const date of [...days].sort()) {
      const { rawPath, payload } = await fetchDay({ track, date, timezone, isIndyNxt: event.seriesId === 'series_indy_nxt', report });
      rawPaths.push(relative(root, rawPath));
      if (date === fromMs(startMs).slice(0, 10)) requestUrl = payload.request?.url ?? null;
      const h = payload.response?.hourly;
      if (!payload.responseOk || !h?.time) continue;
      h.time.forEach((time, index) => {
        const row = {};
        for (const key of hourlyVariables) {
          const value = h[key]?.[index];
          row[key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
        }
        hourly.set(toMs(time), row);
      });
    }
    report.rawArtifacts.push(...rawPaths);
    const at = (t) => hourly.get(t) ?? null;
    const instant = [];
    for (let t = firstStamp; t <= lastStamp; t += HOUR) if (at(t)) instant.push({ t, ...at(t) });
    const rainStamps = [];
    for (let t = firstStamp + HOUR; t <= lastStamp; t += HOUR) if (at(t)) rainStamps.push(at(t));
    if (!instant.length) {
      report.skipped.push({ sessionId, reason: 'no_hourly_values_in_window', rawPaths });
      continue;
    }
    const rainMm = rainStamps.reduce((sum, row) => sum + (row.precipitation ?? 0), 0);
    let rainBeforeMm = 0;
    for (let t = firstStamp - 2 * HOUR; t <= firstStamp; t += HOUR) rainBeforeMm += at(t)?.precipitation ?? 0;
    const cloudPct = mean(instant.map((row) => row.cloud_cover));
    const windKph = mean(instant.map((row) => row.wind_speed_10m));
    const gusts = instant.map((row) => row.wind_gusts_10m).filter((value) => value !== null);
    const gustKph = gusts.length ? Math.max(...gusts) : null;
    const windFromDeg = circularMeanDeg(instant.map((row) => ({ deg: row.wind_direction_10m, weight: row.wind_speed_10m })));
    const tempC = mean(instant.map((row) => row.temperature_2m));
    const codes = [...instant, ...rainStamps].map((row) => row.weather_code).filter((value) => value !== null);

    let sky;
    if (codes.some((code) => STORM_CODES.has(code))) sky = 'storm';
    else if (rainMm >= SKY_RAIN_MM || codes.some((code) => RAIN_CODES.has(code))) sky = 'rain';
    else if ((cloudPct ?? 0) >= 80) sky = 'overcast';
    else if ((cloudPct ?? 0) >= 30) sky = 'partly';
    else sky = 'clear';

    // Wet or dry: the official series report wins; then an observed call; else the reanalysis rain.
    const reportRow = asArray(session.weatherObservationRefs)
      .map((id) => weatherById.get(id))
      .find((row) => row?.weatherSourceType === 'series_report' && seriesWetDry(row.wetDry ?? row.trackCondition) !== null);
    let wetDry;
    let wetDrySource;
    let seriesReport = null;
    let observed = null;
    if (reportRow) {
      wetDry = seriesWetDry(reportRow.wetDry ?? reportRow.trackCondition);
      wetDrySource = 'series_report';
      const evidence = evidenceById.get(asArray(reportRow.provenanceRefs)[0]);
      seriesReport = {
        conditionRaw: reportRow.trackConditionRaw ?? reportRow.ambientConditionRaw ?? reportRow.wetDry ?? null,
        weatherObservationId: reportRow.id,
        source: reportRow.source ?? null,
        url: evidence?.url ?? null
      };
    } else if (observedCalls.has(sessionId)) {
      const call = observedCalls.get(sessionId);
      if (!['wet', 'dry', 'mixed'].includes(call.wetDry)) throw new Error(`observed call for ${sessionId} has wetDry ${call.wetDry}`);
      wetDry = call.wetDry;
      wetDrySource = 'observed';
      observed = { summary: call.summary, evidence: asArray(call.evidence) };
    } else {
      wetDry = reanalysisWetDry(rainMm);
      wetDrySource = 'reanalysis';
    }

    const record = {
      sessionId,
      window: { start: fromMs(startMs), end: fromMs(endMs), basis },
      sky,
      wetDry,
      wetDrySource,
      rainMm: round(rainMm, 1),
      cloudPct: round(cloudPct, 0),
      windKph: round(windKph, 1),
      gustKph: round(gustKph, 1),
      windFromDeg,
      tempC: round(tempC, 1),
      source: { name: SOURCE_NAME, tier: 'modelled', url: requestUrl },
      seriesReport,
      observed,
      /* What the reanalysis alone would call, kept beside an official or observed call. */
      modelWetDry: reanalysisWetDry(rainMm),
      detail: {
        timezone,
        durationSource,
        trackId: track.id,
        latitude: track.latitude,
        longitude: track.longitude,
        rainInTwoHoursBeforeMm: round(rainBeforeMm, 1),
        hours: instant.map((row) => ({
          time: fromMs(row.t),
          tempC: row.temperature_2m,
          precipitationMm: row.precipitation,
          cloudPct: row.cloud_cover,
          windKph: row.wind_speed_10m,
          gustKph: row.wind_gusts_10m,
          windFromDeg: row.wind_direction_10m,
          weatherCode: row.weather_code
        })),
        rawArtifactPaths: [...new Set(rawPaths)]
      }
    };
    records.push(record);
    report.byBasis[basis] = (report.byBasis[basis] ?? 0) + 1;
    report.byWetDrySource[wetDrySource] = (report.byWetDrySource[wetDrySource] ?? 0) + 1;
    report.bySky[sky] = (report.bySky[sky] ?? 0) + 1;
  }

  // How far the model can be trusted: its wet or dry call on the races that
  // also have an official report.
  const calibrationRows = records.filter((row) => row.wetDrySource === 'series_report');
  const calibration = { races: calibrationRows.length, agree: 0, officialWetOrMixed: 0, modelCaughtWetOrMixed: 0, officialDry: 0, modelCalledDry: 0, allDryBaselineAgree: 0, skyRainAgree: 0 };
  for (const row of calibrationRows) {
    const model = reanalysisWetDry(row.rainMm ?? 0);
    const official = row.wetDry;
    if ((official === 'dry') === (model === 'dry')) calibration.agree += 1;
    if (official === 'dry') {
      calibration.officialDry += 1;
      calibration.allDryBaselineAgree += 1;
      if (model === 'dry') calibration.modelCalledDry += 1;
    } else {
      calibration.officialWetOrMixed += 1;
      if (model !== 'dry') calibration.modelCaughtWetOrMixed += 1;
    }
    if ((official === 'dry') === (row.sky !== 'rain' && row.sky !== 'storm')) calibration.skyRainAgree += 1;
  }
  report.calibration = calibration;
  for (const sessionId of observedCalls.keys()) {
    const row = records.find((record) => record.sessionId === sessionId);
    if (!row) throw new Error(`observed call ${sessionId} is not a race of the record`);
    if (row.wetDrySource !== 'observed') throw new Error(`observed call ${sessionId} is shadowed by ${row.wetDrySource}`);
  }
  report.rawArtifacts = [...new Set(report.rawArtifacts)].sort();
  report.records = records.length;
  const output = {
    schemaVersion: 'career-race-weather.v1',
    generatedAt,
    datasetUpdatedAt: dataset.updatedAt ?? null,
    source: SOURCE_NAME,
    grain: 'hourly (the finest the Open-Meteo historical archive serves)',
    rules: {
      window: 'session_sheet: the official start (actualStart, else scheduledStart) to start + the race length (winner total time, else Bryce total time, else the sheet race format, else winner laps x best lap x 1.05, else 45 min). race_day: 09:00 to 18:00 local.',
      aggregation: 'Instantaneous values (temperature, cloud, wind) average the hourly stamps from the hour at or before the start to the hour at or after the end; gust is the maximum; wind direction is the speed-weighted circular mean of the from-direction. Rain sums the hourly precipitation of the hours that overlap the window.',
      sky: 'storm: a thunderstorm code (95-99) in the window; rain: 0.3 mm or more, or a moderate drizzle, rain or shower code (light drizzle, code 51, alone is not rain); overcast: mean cloud 80% or more; partly: 30% or more; clear: below 30%.',
      wetDry: 'series_report: the official series condition report on the race session decides (wet; dry; damp, drying or mixed read as mixed). reanalysis: 0.5 mm or more in the window is wet, else dry; the model never says mixed.',
      tiers: 'Reanalysis is modelled, never observed. An official series report decides wet or dry where one exists; then an observed call (nearest station reports and race reports, analysis/career-weather/data/observed_calls.json); else the reanalysis.'
    },
    coverage: { races: records.length, byBasis: report.byBasis, byWetDrySource: report.byWetDrySource, bySky: report.bySky, skipped: report.skipped },
    calibration: { ...calibration, note: 'Wet-or-dry agreement of the reanalysis rule with the official series reports on the same races (wet, damp and drying count as not dry). allDryBaselineAgree is what calling every race dry would score. A modelled dry is weak evidence.' },
    races: records
  };
  await writeJson(outputPath, output);
  const { records: _omit, ...reportOut } = report;
  await writeJson(reportPath, reportOut);
  console.log(JSON.stringify({ wrote: relative(root, outputPath), races: records.length, calibration, fetched: report.fetched, cacheHits: report.cacheHits, byBasis: report.byBasis, byWetDrySource: report.byWetDrySource, bySky: report.bySky, skipped: report.skipped.length }, null, 2));
};

await main();
