import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/imsa');
const reportPath = join(root, 'data/career/reports/imsa-import-report.json');

const year = 2025;
const eventSlug = 'daytona_rolex_24';
const raceResultsJsonUrl =
  'https://imsa.results.alkamelcloud.com/Results/25_2025/02_Daytona%20International%20Speedway/01_IMSA%20WeatherTech%20SportsCar%20Championship/202501251340_Race/24_Hour%2024/03_Results_Race_Official.JSON';
const raceResultsCsvUrl =
  'https://imsa.results.alkamelcloud.com/Results/25_2025/02_Daytona%20International%20Speedway/01_IMSA%20WeatherTech%20SportsCar%20Championship/202501251340_Race/24_Hour%2024/03_Results_Race_Official.CSV';
const timeCardsJsonUrl =
  'https://imsa.results.alkamelcloud.com/Results/25_2025/02_Daytona%20International%20Speedway/01_IMSA%20WeatherTech%20SportsCar%20Championship/202501251340_Race/24_Hour%2024/23_Time%20Cards_Race.JSON';
const eventIndexUrl = 'https://imsa.results.alkamelcloud.com/index.php?season=25_2025&evvent=02_Daytona%20International%20Speedway';
const sessionStartLocal = '2025-01-25T13:40:00';
const sessionTimezone = 'America/New_York';
const daytonaLatitude = 29.1852;
const daytonaLongitude = -81.0705;

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const retries = Math.max(0, Number(argValue('retries', '2')));
const refresh = process.argv.includes('--refresh');

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const safeNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const readTextIfExists = async (path, fallback) => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return fallback;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url, attempt = 0) => {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json,text/csv,text/plain,*/*' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.text();
  } catch (error) {
    if (attempt >= retries) throw error;
    await sleep(250 * 2 ** attempt);
    return fetchText(url, attempt + 1);
  }
};

const fetchJsonCached = async (url, path) => {
  if (!refresh) {
    const cached = await readJsonIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }
  const text = await fetchText(url);
  const payload = JSON.parse(text);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, fromCache: false };
};

const fetchTextCached = async (url, path) => {
  if (!refresh) {
    const cached = await readTextIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }
  const payload = await fetchText(url);
  await writeFile(path, payload);
  return { payload, fromCache: false };
};

const mergeValue = (current, next) => {
  if (next === null || next === undefined || next === '') return current;
  if (Array.isArray(current) || Array.isArray(next)) return Array.from(new Set([...(asArray(current)), ...(asArray(next))]));
  if (current && next && typeof current === 'object' && typeof next === 'object') return { ...current, ...next };
  return next;
};

const upsert = (map, row) => {
  if (!row?.id) return;
  const current = map.get(row.id);
  if (!current) {
    map.set(row.id, row);
    return;
  }
  const merged = { ...current };
  for (const [key, value] of Object.entries(row)) merged[key] = mergeValue(current[key], value);
  merged.provenanceRefs = Array.from(new Set([...(current.provenanceRefs ?? []), ...(row.provenanceRefs ?? [])]));
  map.set(row.id, merged);
};

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/import-imsa-career.mjs',
  licenseNotes: 'Public official IMSA/Al Kamel result feeds; store extracted facts and source URL.',
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/import-imsa-career.mjs',
  rawArtifactPath,
  notes
});

const driverIdFor = (driver) => {
  const name = `${driver.firstname ?? ''} ${driver.surname ?? ''}`.trim();
  return /^bryce\s+aron$/i.test(name) ? 'driver_bryce_aron' : `driver_${slug(name || driver.imsa_driverid || 'unknown')}`;
};

const parseStatus = (status, notFinished) => {
  const value = String(status ?? '').toLowerCase();
  if (notFinished) return 'dnf';
  if (value.includes('classified')) return 'running';
  if (value.includes('dns')) return 'dns';
  if (value.includes('dq') || value.includes('disqualified')) return 'dsq';
  if (value.includes('dnf') || value.includes('not')) return 'dnf';
  return 'unknown';
};

const tempC = (value) => safeNumber(value);

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const existing = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const sourceEvidenceMap = new Map(asArray(existing.sourceEvidence).map((row) => [row.id, row]));
  const drivers = new Map(asArray(existing.drivers).map((row) => [row.id, row]));
  const series = new Map(asArray(existing.series).map((row) => [row.id, row]));
  const teams = new Map(asArray(existing.teams).map((row) => [row.id, row]));
  const cars = new Map(asArray(existing.cars).map((row) => [row.id, row]));
  const tracks = new Map(asArray(existing.tracks).map((row) => [row.id, row]));
  const seasons = new Map(asArray(existing.seasons).map((row) => [row.id, row]));
  const events = new Map(asArray(existing.events).map((row) => [row.id, row]));
  const sessions = new Map(asArray(existing.sessions).map((row) => [row.id, row]));
  const results = new Map(asArray(existing.results).map((row) => [row.id, row]));
  const lapSamples = new Map(asArray(existing.lapSamples).map((row) => [row.id, row]));
  const weatherObservations = new Map(asArray(existing.weatherObservations).map((row) => [row.id, row]));
  const mediaAssets = new Map(asArray(existing.mediaAssets).map((row) => [row.id, row]));

  const report = {
    checkedAt: retrievedAt,
    year,
    refresh,
    fetched: 0,
    cached: 0,
    classificationRowsImported: 0,
    driverResultRowsImported: 0,
    bryceResultRowsImported: 0,
    lapSamplesImported: 0,
    bryceCarLapSamplesImported: 0,
    weatherObservationsImported: 0,
    rawArtifacts: [],
    gaps: []
  };

  const raceJsonPath = join(rawDir, `${year}-${eventSlug}-race-official.json`);
  const raceCsvPath = join(rawDir, `${year}-${eventSlug}-race-official.csv`);
  const timeCardsPath = join(rawDir, `${year}-${eventSlug}-time-cards.json`);
  const [raceJsonResult, raceCsvResult, timeCardsResult] = await Promise.all([
    fetchJsonCached(raceResultsJsonUrl, raceJsonPath),
    fetchTextCached(raceResultsCsvUrl, raceCsvPath),
    fetchJsonCached(timeCardsJsonUrl, timeCardsPath)
  ]);
  for (const result of [raceJsonResult, raceCsvResult, timeCardsResult]) report[result.fromCache ? 'cached' : 'fetched'] += 1;
  report.rawArtifacts.push(raceJsonPath.replace(`${root}/`, ''), raceCsvPath.replace(`${root}/`, ''), timeCardsPath.replace(`${root}/`, ''));

  const raceJson = raceJsonResult.payload;
  const timeCards = timeCardsResult.payload;
  const trackId = 'track_daytona_international_speedway';
  const eventId = `event_imsa_${year}_${eventSlug}`;
  const sessionId = `session_imsa_${year}_${eventSlug}_race`;
  const resultEvidenceId = `source_imsa_${year}_${eventSlug}_race_official_json`;
  const csvEvidenceId = `source_imsa_${year}_${eventSlug}_race_official_csv`;
  const timeCardsEvidenceId = `source_imsa_${year}_${eventSlug}_time_cards_json`;

  upsert(sourceEvidenceMap, sourceEvidence({
    id: resultEvidenceId,
    sourceType: 'official_api',
    sourceName: 'IMSA/Al Kamel 2025 Rolex 24 official race results JSON',
    url: raceResultsJsonUrl,
    retrievedAt,
    coverage: 'Official race classification, drivers, vehicle/class context, fastest laps, and session weather/track condition.',
    rawArtifactPath: raceJsonPath.replace(`${root}/`, ''),
    notes: 'Primary official source for IMSA Daytona 2025 classification.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: csvEvidenceId,
    sourceType: 'official_api',
    sourceName: 'IMSA/Al Kamel 2025 Rolex 24 official race results CSV',
    url: raceResultsCsvUrl,
    retrievedAt,
    coverage: 'CSV mirror of official classification used as a row-level cross-check for Bryce car 85 and co-driver fields.',
    rawArtifactPath: raceCsvPath.replace(`${root}/`, ''),
    notes: 'Confirms Bryce Aron on car 85 row in a tabular source.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: timeCardsEvidenceId,
    sourceType: 'official_api',
    sourceName: 'IMSA/Al Kamel 2025 Rolex 24 time cards JSON',
    url: timeCardsJsonUrl,
    retrievedAt,
    coverage: 'Official car/driver lap time cards for the 24-hour race.',
    rawArtifactPath: timeCardsPath.replace(`${root}/`, ''),
    notes: 'Lap samples are car/stint-driver grain, not independent single-driver race classifications.'
  }));

  upsert(series, {
    id: 'series_imsa_weathertech',
    name: 'IMSA WeatherTech SportsCar Championship',
    category: 'sports_car',
    ladderLevel: 'Top-level North American sports car championship',
    governingBody: 'IMSA',
    countryScope: 'United States / North America',
    officialWebsite: 'https://www.imsa.com/',
    externalIds: { alkamelChampionshipName: raceJson.session?.championship_name ?? null },
    provenanceRefs: [resultEvidenceId]
  });

  upsert(tracks, {
    id: trackId,
    name: 'Daytona International Speedway',
    canonicalName: 'Daytona International Speedway',
    country: 'United States',
    region: 'Florida',
    city: 'Daytona Beach',
    latitude: daytonaLatitude,
    longitude: daytonaLongitude,
    timezone: sessionTimezone,
    trackType: 'road',
    configuration: 'Road course',
    lengthKm: Number((safeNumber(raceJson.session?.circuit?.length) / 1000).toFixed(4)),
    lengthMi: Number((safeNumber(raceJson.session?.circuit?.length) / 1609.344).toFixed(4)),
    direction: 'unknown',
    surface: null,
    elevationM: null,
    cornerCount: null,
    passingDifficulty: null,
    brakingSeverity: null,
    temporary: false,
    altitudeM: null,
    aliases: ['Daytona International Speedway'],
    provenanceRefs: [resultEvidenceId]
  });

  upsert(events, {
    id: eventId,
    seriesId: 'series_imsa_weathertech',
    seasonYear: year,
    name: raceJson.session?.event_name ?? 'Rolex 24 at Daytona',
    round: null,
    eventStartDate: '2025-01-25',
    eventEndDate: '2025-01-26',
    trackId,
    country: 'United States',
    officialEventId: '25_2025/02_Daytona International Speedway',
    provenanceRefs: [resultEvidenceId]
  });

  upsert(sessions, {
    id: sessionId,
    eventId,
    sessionType: 'race',
    sessionName: raceJson.session?.session_name ?? 'Race',
    raceNumber: null,
    scheduledStart: sessionStartLocal,
    actualStart: sessionStartLocal,
    timezone: sessionTimezone,
    lapsScheduled: null,
    distanceScheduled: null,
    status: 'official',
    officialSessionId: '202501251340_Race',
    weatherObservationRefs: [`weather_imsa_${year}_${eventSlug}_official_conditions`],
    ingestionState: 'official',
    broadcastRouteRefs: [],
    notificationRefs: [],
    raw: {
      reportMark: raceJson.session?.report_mark ?? null,
      reportMessage: raceJson.session?.report_message ?? null,
      finalizeType: raceJson.session?.finalize_type ?? null,
      sessionDateRaw: raceJson.session?.session_date ?? null,
      creationDateRaw: raceJson.session?.creation_date ?? null
    },
    provenanceRefs: [resultEvidenceId, timeCardsEvidenceId]
  });

  upsert(weatherObservations, {
    id: `weather_imsa_${year}_${eventSlug}_official_conditions`,
    trackId,
    sessionId,
    observedAt: sessionStartLocal,
    source: 'IMSA/Al Kamel official race result JSON',
    stationId: 'official_session_report',
    latitude: daytonaLatitude,
    longitude: daytonaLongitude,
    distanceFromTrackKm: 0,
    ambientTempC: tempC(raceJson.session?.weather?.air_temperature),
    trackTempC: tempC(raceJson.session?.weather?.track_temperature),
    trackTempSource: 'official_timing',
    trackCondition: String(raceJson.session?.weather?.track_status ?? '').toLowerCase() === 'dry' ? 'dry' : 'unknown',
    gripLevel: 'unknown',
    airDensityKgM3: null,
    relativeHumidityPct: null,
    dewPointC: null,
    windSpeedKph: null,
    windGustKph: null,
    windDirectionDeg: null,
    precipitationMm: null,
    precipitationType: null,
    pressureHpa: null,
    cloudCoverPct: null,
    wetDry: String(raceJson.session?.weather?.track_status ?? '').toLowerCase() === 'dry' ? 'dry' : 'unknown',
    confidence: 'official',
    timeWindowStart: sessionStartLocal,
    timeWindowEnd: '2025-01-26T13:40:00',
    timeWindowReason: 'exact_session',
    trackCoordinateSource: 'manual_public_track_reference',
    weatherSourceType: 'series_report',
    timeConfidence: 'high',
    locationConfidence: 'track_exact',
    joinNotes: 'Official session report weather/track condition from IMSA/Al Kamel. Coordinates identify the circuit, not a separate weather station.',
    provenanceRefs: [resultEvidenceId]
  });
  report.weatherObservationsImported += 1;

  for (const [assetId, title, url, evidenceId, assetType] of [
    [`asset_imsa_${year}_${eventSlug}_race_official_json`, 'IMSA 2025 Rolex 24 official race results JSON', raceResultsJsonUrl, resultEvidenceId, 'result_sheet'],
    [`asset_imsa_${year}_${eventSlug}_race_official_csv`, 'IMSA 2025 Rolex 24 official race results CSV', raceResultsCsvUrl, csvEvidenceId, 'result_sheet'],
    [`asset_imsa_${year}_${eventSlug}_time_cards_json`, 'IMSA 2025 Rolex 24 official time cards JSON', timeCardsJsonUrl, timeCardsEvidenceId, 'timing_sheet'],
    [`asset_imsa_${year}_${eventSlug}_results_index`, 'IMSA 2025 Daytona event results index', eventIndexUrl, resultEvidenceId, 'timing_sheet']
  ]) {
    upsert(mediaAssets, {
      id: assetId,
      assetType,
      title,
      url,
      rightsStatus: 'link_only',
      publishedAt: sessionStartLocal,
      eventId,
      sessionId,
      driverId: null,
      summary: title,
      quoteText: null,
      provenanceRefs: [evidenceId]
    });
  }

  const timeCardByNumber = new Map(asArray(timeCards.participants).map((participant) => [String(participant.number), participant]));
  const classification = asArray(raceJson.classification);
  const overallFieldSize = classification.length;
  const classFieldSizes = new Map();
  for (const row of classification) classFieldSizes.set(row.class, (classFieldSizes.get(row.class) ?? 0) + 1);
  const classPositionByCarNumber = new Map();
  const nextClassPosition = new Map();
  for (const row of classification) {
    const className = row.class ?? 'unknown';
    const classPosition = (nextClassPosition.get(className) ?? 0) + 1;
    nextClassPosition.set(className, classPosition);
    classPositionByCarNumber.set(String(row.number), classPosition);
  }

  for (const row of classification) {
    report.classificationRowsImported += 1;
    const teamId = `team_${slug(row.team)}`;
    const carId = `car_imsa_${year}_${slug(row.team)}_${slug(row.number)}`;
    upsert(teams, {
      id: teamId,
      name: row.team,
      seriesIds: ['series_imsa_weathertech'],
      country: null,
      officialWebsite: null,
      provenanceRefs: [resultEvidenceId]
    });
    upsert(cars, {
      id: carId,
      seriesId: 'series_imsa_weathertech',
      seasonYear: year,
      chassis: row.vehicle ?? null,
      engine: null,
      tireSupplier: row.tires === 'M' ? 'Michelin' : row.tires ?? null,
      class: row.class ?? null,
      carNumber: String(row.number ?? ''),
      entrant: row.team ?? null,
      teamId,
      liveryNotes: null,
      provenanceRefs: [resultEvidenceId]
    });

    for (const driver of asArray(row.drivers)) {
      const driverId = driverIdFor(driver);
      const displayName = `${driver.firstname ?? ''} ${driver.surname ?? ''}`.trim();
      upsert(drivers, {
        id: driverId,
        displayName,
        givenName: driver.firstname ?? null,
        familyName: driver.surname ?? null,
        nationality: driver.country === 'USA' ? 'United States' : driver.country ?? null,
        hometown: driver.hometown ?? (driverId === 'driver_bryce_aron' ? 'Winnetka, Illinois' : null),
        dateOfBirth: null,
        externalIds: {
          imsaDriverId: driver.imsa_driverid || null,
          imsaDriverPlugId: driver.imsa_driverplugid || null,
          imsaLicense: driver.license || null,
          imsaCountry: driver.country || null
        },
        provenanceRefs: [resultEvidenceId, csvEvidenceId]
      });

      const finish = safeNumber(row.position);
      const classFieldSize = classFieldSizes.get(row.class) ?? null;
      const classFinishPosition = classPositionByCarNumber.get(String(row.number)) ?? null;
      upsert(results, {
        id: `result_imsa_${year}_${eventSlug}_${slug(row.number)}_${driverId}`,
        sessionId,
        driverId,
        teamId,
        carId,
        carNumber: String(row.number ?? ''),
        class: row.class ?? null,
        gridPosition: null,
        startPosition: null,
        finishPosition: finish,
        classifiedPosition: finish,
        finishPercentile: finish && overallFieldSize ? Number(((overallFieldSize - finish + 1) / overallFieldSize).toFixed(4)) : null,
        fieldSize: overallFieldSize,
        classFieldSize,
        classFinishPosition,
        classFinishPercentile: classFinishPosition && classFieldSize ? Number(((classFieldSize - classFinishPosition + 1) / classFieldSize).toFixed(4)) : null,
        lapsCompleted: safeNumber(row.laps),
        lapsScheduled: null,
        lapsLed: null,
        points: null,
        status: parseStatus(row.status, row.not_finished),
        statusRaw: row.status ?? null,
        totalTime: row.elapsed_time ?? null,
        gapToLeader: row.gap_first ?? null,
        gapToAhead: row.gap_previous ?? null,
        averageSpeed: null,
        bestLapTime: row.fastest_lap_time ?? null,
        bestLapNumber: safeNumber(row.fastest_lap_number),
        bestLapRank: null,
        pitStops: safeNumber(row.pit_stops),
        penaltyRefs: [],
        incidentRefs: [],
        sourceResultId: `${row.number}:${driver.number}`,
        resultGrain: 'car_driver',
        raw: {
          overallCarPosition: row.position ?? null,
          notFinished: row.not_finished ?? null,
          notFinishedCause: row.not_finished_cause ?? null,
          fastestLapKph: safeNumber(row.fastest_lap_kph),
          fastestLapDriverNumber: row.fastest_lap_driver_number ?? null,
          vehicle: row.vehicle ?? null,
          tires: row.tires ?? null,
          manufacturer: row.manufacturer ?? null,
          driverNumberInCar: driver.number ?? null,
          driverLicense: driver.license ?? null,
          coDrivers: asArray(row.drivers).map((coDriver) => `${coDriver.firstname ?? ''} ${coDriver.surname ?? ''}`.trim())
        },
        provenanceRefs: [resultEvidenceId, csvEvidenceId]
      });
      report.driverResultRowsImported += 1;
      if (driverId === 'driver_bryce_aron') report.bryceResultRowsImported += 1;
    }

    const timeCard = timeCardByNumber.get(String(row.number));
    const driversByCarNumber = new Map(asArray(row.drivers).map((driver) => [String(driver.number), driver]));
    for (const lap of asArray(timeCard?.laps)) {
      const stintDriver = driversByCarNumber.get(String(lap.driver_number));
      const driverId = stintDriver ? driverIdFor(stintDriver) : driverIdFor(asArray(row.drivers)[0] ?? {});
      const lapNumber = safeNumber(lap.number);
      if (!lapNumber) continue;
      upsert(lapSamples, {
        id: `lap_imsa_${year}_${eventSlug}_${slug(row.number)}_${String(lapNumber).padStart(4, '0')}`,
        sessionId,
        driverId,
        lapNumber,
        lapTime: lap.time ?? null,
        position: null,
        gapToLeader: null,
        gapToAhead: null,
        sector1: asArray(lap.sector_times).find((sector) => Number(sector.index) === 1)?.time ?? null,
        sector2: asArray(lap.sector_times).find((sector) => Number(sector.index) === 2)?.time ?? null,
        sector3: asArray(lap.sector_times).find((sector) => Number(sector.index) === 3)?.time ?? null,
        speedTrap: safeNumber(lap.top_speed_kph),
        flagState: null,
        pitIn: Boolean(lap.crossing_pit_finish_lane),
        pitOut: false,
        tireAge: null,
        sourceTimestamp: lap.hour ?? null,
        carId,
        carNumber: String(row.number ?? ''),
        class: row.class ?? null,
        averageSpeedKph: safeNumber(lap.average_speed_kph),
        sessionElapsed: lap.session_elapsed ?? null,
        isValid: Boolean(lap.is_valid),
        isSessionBest: Boolean(lap.is_session_best),
        isPersonalBest: Boolean(lap.is_personal_best),
        raw: {
          driverNumberInCar: lap.driver_number ?? null,
          manuallyInvalidated: lap.manually_invalidated ?? null,
          tlInvalidated: lap.tl_invalidated ?? null,
          sectorTimes: lap.sector_times ?? []
        },
        provenanceRefs: [timeCardsEvidenceId]
      });
      report.lapSamplesImported += 1;
      if (String(row.number) === '85') report.bryceCarLapSamplesImported += 1;
    }
  }

  const bryceResult = Array.from(results.values()).find((row) => row.id === `result_imsa_${year}_${eventSlug}_85_driver_bryce_aron`);
  if (bryceResult) {
    upsert(seasons, {
      id: `season_imsa_weathertech_${year}_bryce_aron`,
      year,
      seriesId: 'series_imsa_weathertech',
      driverId: 'driver_bryce_aron',
      teamIds: [bryceResult.teamId],
      carIds: [bryceResult.carId],
      championshipPosition: null,
      points: null,
      starts: 1,
      wins: bryceResult.finishPosition === 1 ? 1 : 0,
      poles: null,
      podiums: bryceResult.finishPosition && bryceResult.finishPosition <= 3 ? 1 : 0,
      top5: bryceResult.finishPosition && bryceResult.finishPosition <= 5 ? 1 : 0,
      top10: bryceResult.finishPosition && bryceResult.finishPosition <= 10 ? 1 : 0,
      dnfs: bryceResult.status === 'running' ? 0 : 1,
      provenanceRefs: [resultEvidenceId, csvEvidenceId]
    });
  } else {
    report.gaps.push({
      id: 'gap_imsa_2025_daytona_bryce_result_missing',
      scope: 'imsa_2025_daytona',
      status: 'open',
      description: 'Official IMSA classification was fetched but Bryce Aron car 85 result was not normalized.'
    });
  }

  const currentGaps = asArray(existing.gaps).filter(
    (gap) =>
      ![
        'gap_remaining_non_indy_nxt_career_rows',
        'gap_imsa_2025_daytona_bryce_result_missing',
        'gap_remaining_career_rows_after_imsa'
      ].includes(gap.id)
  );
  const dataset = {
    schemaVersion: 'bryce-career.v1',
    updatedAt: retrievedAt,
    drivers: Array.from(drivers.values()).sort((a, b) => a.id.localeCompare(b.id)),
    series: Array.from(series.values()).sort((a, b) => a.id.localeCompare(b.id)),
    teams: Array.from(teams.values()).sort((a, b) => a.id.localeCompare(b.id)),
    cars: Array.from(cars.values()).sort((a, b) => a.id.localeCompare(b.id)),
    tracks: Array.from(tracks.values()).sort((a, b) => a.id.localeCompare(b.id)),
    seasons: Array.from(seasons.values()).sort((a, b) => a.id.localeCompare(b.id)),
    events: Array.from(events.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    results: Array.from(results.values()).sort((a, b) => a.id.localeCompare(b.id)),
    qualifyingResults: asArray(existing.qualifyingResults),
    lapSamples: Array.from(lapSamples.values()).sort((a, b) => a.id.localeCompare(b.id)),
    racecraftEvents: asArray(existing.racecraftEvents),
    penalties: asArray(existing.penalties),
    incidents: asArray(existing.incidents),
    weatherObservations: Array.from(weatherObservations.values()).sort((a, b) => a.id.localeCompare(b.id)),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [
      ...currentGaps,
      ...report.gaps,
      {
        id: 'gap_remaining_career_rows_after_imsa',
        scope: 'career_dataset',
        status: 'open',
        description: 'Later source families, karting race-by-race records, media narrative beyond imported Team USA 2020 context and structured Team USA/Badger Kart Club milestone and record facts, non-official ambient weather enrichment, session-window precision, and track metadata for future imported tracks remain open.'
      }
    ]
  };

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    counts: {
      drivers: dataset.drivers.length,
      series: dataset.series.length,
      teams: dataset.teams.length,
      cars: dataset.cars.length,
      tracks: dataset.tracks.length,
      seasons: dataset.seasons.length,
      events: dataset.events.length,
      sessions: dataset.sessions.length,
      results: dataset.results.length,
      lapSamples: dataset.lapSamples.length,
      weatherObservations: dataset.weatherObservations.length,
      sourceEvidence: dataset.sourceEvidence.length,
      gaps: dataset.gaps.length
    },
    importReport: report
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
