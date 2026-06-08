import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/indy-nxt');
const reportPath = join(root, 'data/career/reports/indy-nxt-import-report.json');

const seriesId = '09341e09-3216-4f89-a45f-db697d72ee13';
const bryceDriverOverrideId = '4959';
const bryceRaceControlDriverId = '2143';
const years = [2024, 2025, 2026];
const api = (path) => `https://www.indynxt.com/api/results/${path}`;
const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const concurrency = Math.max(1, Number(argValue('concurrency', '64')));
const retries = Math.max(0, Number(argValue('retries', '2')));
const refresh = process.argv.includes('--refresh');

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const trackTypeLabel = (trackType) => {
  if (trackType === 'S') return 'street';
  if (trackType === 'O') return 'oval';
  if (trackType === 'R') return 'road';
  return 'unknown';
};

const statusCategory = (status) => {
  const normalized = String(status ?? '').toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('running')) return 'running';
  if (normalized.includes('mechanical')) return 'mechanical';
  if (normalized.includes('contact')) return 'contact';
  if (normalized.includes('crash')) return 'crash';
  if (normalized.includes('dns')) return 'dns';
  if (normalized.includes('dsq') || normalized.includes('disqualified')) return 'dsq';
  return normalized.includes('dnf') ? 'dnf' : 'unknown';
};

const officialStatusIncidentTypes = new Set(['contact', 'mechanical', 'dns']);
const statusIncidentPrefix = 'incident_indy_nxt_status_';

const nullableGap = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '--.----' || /^-+\.-+$/.test(normalized)) return null;
  return normalized;
};

const raceNumberFromName = (name) => {
  const match = String(name ?? '').match(/Race\s+(\d+)/i);
  return match ? Number(match[1]) : null;
};

const trackNameFromEvent = (eventName) => {
  const name = String(eventName ?? '');
  const rules = [
    [/St\.?\s*Petersburg/i, 'Streets of St. Petersburg'],
    [/Alabama/i, 'Barber Motorsports Park'],
    [/Indianapolis Grand Prix/i, 'Indianapolis Motor Speedway Road Course'],
    [/Detroit/i, 'Streets of Detroit'],
    [/Road America/i, 'Road America'],
    [/Monterey/i, 'WeatherTech Raceway Laguna Seca'],
    [/Mid-Ohio/i, 'Mid-Ohio Sports Car Course'],
    [/Iowa/i, 'Iowa Speedway'],
    [/OUTFRONT|World Wide Technology|WWTR/i, 'World Wide Technology Raceway'],
    [/Portland/i, 'Portland International Raceway'],
    [/Milwaukee/i, 'The Milwaukee Mile'],
    [/Music City|Nashville/i, 'Nashville Superspeedway'],
    [/Arlington/i, 'Streets of Arlington']
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? name;
};

const sessionType = (value, typeCode = null) => {
  const code = String(typeCode ?? '').toUpperCase();
  if (code === 'R') return 'race';
  if (code === 'Q') return 'qualifying';
  if (code === 'P') return 'practice';

  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'R' || normalized.includes('RACE')) return 'race';
  if (normalized === 'Q' || normalized.includes('QUAL')) return 'qualifying';
  if (normalized === 'P' || normalized.includes('PRACT')) return 'practice';
  return 'unknown';
};

const reportUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `http://www.imscdn.com/${String(url).replace(/^\/+/, '')}`;
};

const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, attempt = 0) => {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.json();
  } catch (error) {
    if (attempt >= retries) throw error;
    await sleep(250 * 2 ** attempt);
    return fetchJson(url, attempt + 1);
  }
};

const fetchJsonCached = async (url, path) => {
  if (!refresh) {
    const cached = await readJsonIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }
  const payload = await fetchJson(url);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, fromCache: false };
};

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const mergeValue = (current, next) => {
  if (next === null || next === undefined || next === '') return current;
  if (Array.isArray(current) || Array.isArray(next)) {
    return Array.from(new Set([...(asArray(current)), ...(asArray(next))]));
  }
  if (current && next && typeof current === 'object' && typeof next === 'object') {
    return { ...current, ...next };
  }
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

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, parser, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/import-indy-nxt-career.mjs',
  licenseNotes: 'Public official INDY NXT results API; store extracted facts and source URL.',
  confidenceTier: 'official',
  coverage,
  parser,
  rawArtifactPath,
  notes
});

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
  const sanitizeResultIncidentRefs = (row) => ({
    ...row,
    incidentRefs: asArray(row.incidentRefs).filter((id) => !String(id).startsWith(statusIncidentPrefix))
  });
  const results = new Map(asArray(existing.results).map((row) => sanitizeResultIncidentRefs(row)).map((row) => [row.id, row]));
  const qualifyingResults = new Map(asArray(existing.qualifyingResults).map((row) => [row.id, row]));
  for (const id of qualifyingResults.keys()) {
    if (String(id).startsWith('qualifying_indy_nxt_')) qualifyingResults.delete(id);
  }
  const mediaAssets = new Map(asArray(existing.mediaAssets).map((row) => [row.id, row]));
  const incidents = asArray(existing.incidents).filter((row) => !String(row.id ?? '').startsWith(statusIncidentPrefix));

  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_indynxt_results_api_namespace',
    sourceType: 'official_api',
    sourceName: 'INDY NXT official results API',
    url: 'https://www.indynxt.com/api/results/',
    retrievedAt,
    coverage: 'Official INDY NXT results namespace used for standings, driver-year details, and event-session details.',
    parser: 'scripts/import-indy-nxt-career.mjs',
    rawArtifactPath: 'data/career/raw/indy-nxt/',
    notes: 'API-first source; preferred over scraping INDY NXT pages.'
  }));

  upsert(series, {
    id: 'series_indy_nxt',
    name: 'INDY NXT',
    category: 'formula',
    ladderLevel: 'IndyCar development ladder',
    governingBody: 'INDYCAR',
    countryScope: 'United States',
    officialWebsite: 'https://www.indynxt.com/',
    externalIds: { indynxtSeriesId: seriesId },
    provenanceRefs: ['source_indynxt_results_api_namespace']
  });

  upsert(drivers, {
    id: 'driver_bryce_aron',
    displayName: 'Bryce Aron',
    givenName: 'Bryce',
    familyName: 'Aron',
    nationality: 'United States',
    hometown: 'Winnetka, Illinois',
    dateOfBirth: null,
    externalIds: {
      indynxtDriverId: bryceDriverOverrideId,
      raceControlDriverId: bryceRaceControlDriverId
    },
    provenanceRefs: ['source_indynxt_results_api_namespace']
  });

  const importReport = {
    checkedAt: retrievedAt,
    years,
    sessionsImported: 0,
    resultsImported: 0,
    qualifyingResultsImported: 0,
    bryceQualifyingResultsImported: 0,
    bryceResultsImported: 0,
    officialStatusIncidentsImported: 0,
    mediaAssetsImported: 0,
    concurrency,
    fetchMode: 'global_bounded_parallel',
    maxParallelSessionDetailRequests: 0,
    refresh,
    fetched: 0,
    cached: 0,
    rawArtifacts: [],
    gaps: []
  };

  const seasonDropDownUrl = api(`SeasonDropDown?id=${seriesId}`);
  const seasonDropDownPath = join(rawDir, 'season-drop-down.json');
  const { payload: seasonDropDown, fromCache: seasonDropDownFromCache } = await fetchJsonCached(seasonDropDownUrl, seasonDropDownPath);
  importReport[seasonDropDownFromCache ? 'cached' : 'fetched'] += 1;
  importReport.rawArtifacts.push(seasonDropDownPath.replace(`${root}/`, ''));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_indynxt_season_drop_down',
    sourceType: 'official_api',
    sourceName: 'INDY NXT SeasonDropDown',
    url: seasonDropDownUrl,
    retrievedAt,
    coverage: 'Official event and session ID discovery for INDY NXT result sessions.',
    parser: 'scripts/import-indy-nxt-career.mjs',
    rawArtifactPath: seasonDropDownPath.replace(`${root}/`, ''),
    notes: 'API-first discovery route, preferred over scraping result pages for session IDs.'
  }));
  const sessionsByYear = new Map(
    asArray(seasonDropDown)
      .filter((yearRow) => years.includes(Number(yearRow.Year)))
      .map((yearRow) => [
        Number(yearRow.Year),
        asArray(yearRow.Events).flatMap((event) =>
          asArray(event.Sessions).map((session) => ({
            year: Number(yearRow.Year),
            eventId: event.EventID,
            eventName: event.EventName,
            eventsSessionId: String(session.EventsSessionID),
            sessionName: session.SessionName
          }))
        )
      ])
  );

  const yearDetails = await mapLimit(years, Math.min(concurrency, years.length * 2), async (year) => {
    const yearPointUrl = api(`YearPointSummary?year=${year}&id=${seriesId}`);
    const driverYearUrl = api(`DriverYearDetails?year=${year}&series=${seriesId}&driverID=${bryceDriverOverrideId}`);
    const yearPointPath = join(rawDir, `${year}-year-point-summary.json`);
    const driverYearPath = join(rawDir, `${year}-driver-year-details-bryce.json`);
    const [yearPointResult, driverYearResult] = await Promise.all([fetchJsonCached(yearPointUrl, yearPointPath), fetchJsonCached(driverYearUrl, driverYearPath)]);
    const yearPointSummary = yearPointResult.payload;
    const driverYearDetails = driverYearResult.payload;
    importReport[yearPointResult.fromCache ? 'cached' : 'fetched'] += 1;
    importReport[driverYearResult.fromCache ? 'cached' : 'fetched'] += 1;
    importReport.rawArtifacts.push(yearPointPath.replace(`${root}/`, ''), driverYearPath.replace(`${root}/`, ''));

    const yearEvidenceId = `source_indynxt_${year}_year_point_summary`;
    const driverYearEvidenceId = `source_indynxt_${year}_driver_year_details_bryce`;
    return {
      year,
      yearPointUrl,
      driverYearUrl,
      yearPointPath,
      driverYearPath,
      yearEvidenceId,
      driverYearEvidenceId,
      yearPointSummary: yearPointResult.payload,
      driverYearDetails: driverYearResult.payload
    };
  });

  for (const {
    year,
    yearPointUrl,
    driverYearUrl,
    yearPointPath,
    driverYearPath,
    yearEvidenceId,
    driverYearEvidenceId,
    yearPointSummary,
    driverYearDetails
  } of yearDetails) {
    upsert(sourceEvidenceMap, sourceEvidence({
      id: yearEvidenceId,
      sourceType: 'official_api',
      sourceName: `INDY NXT ${year} YearPointSummary`,
      url: yearPointUrl,
      retrievedAt,
      coverage: `${year} driver standings and EventsSessionsID point rows.`,
      parser: 'scripts/import-indy-nxt-career.mjs',
      rawArtifactPath: yearPointPath.replace(`${root}/`, ''),
      notes: 'Used for season standings and official EventsSessionsID discovery.'
    }));
    upsert(sourceEvidenceMap, sourceEvidence({
      id: driverYearEvidenceId,
      sourceType: 'official_api',
      sourceName: `INDY NXT ${year} DriverYearDetails for Bryce Aron`,
      url: driverYearUrl,
      retrievedAt,
      coverage: `${year} Bryce Aron race-by-race official summary rows.`,
      parser: 'scripts/import-indy-nxt-career.mjs',
      rawArtifactPath: driverYearPath.replace(`${root}/`, ''),
      notes: 'Used as cross-check against EventsSessionDetails records.'
    }));

    const bryceStanding = asArray(yearPointSummary.DriverList).find((driver) => driver.DriverName === 'Bryce Aron');
    const bryceDriverRows = asArray(driverYearDetails.Results);
    upsert(seasons, {
      id: `season_indy_nxt_${year}_bryce_aron`,
      year,
      seriesId: 'series_indy_nxt',
      driverId: 'driver_bryce_aron',
      teamIds: [],
      carIds: [],
      championshipPosition: safeNumber(bryceStanding?.OverallPosition),
      points: safeNumber(bryceStanding?.TotalPoints),
      starts: bryceDriverRows.length,
      wins: safeNumber(bryceStanding?.TotalWins),
      poles: safeNumber(bryceStanding?.TotalPoles),
      podiums: bryceDriverRows.filter((row) => safeNumber(row.Rank) !== null && safeNumber(row.Rank) <= 3).length,
      top5: safeNumber(bryceStanding?.TotalTop5s),
      top10: bryceDriverRows.filter((row) => safeNumber(row.Rank) !== null && safeNumber(row.Rank) <= 10).length,
      dnfs: bryceDriverRows.filter((row) => statusCategory(row.Status) !== 'running').length,
      provenanceRefs: [yearEvidenceId, driverYearEvidenceId]
    });

    const officialSessions = sessionsByYear.get(year) ?? [];
    if (!officialSessions.length) {
      importReport.gaps.push({ year, status: 'missing_session_discovery', note: 'SeasonDropDown returned no sessions for this year.' });
    }
  }

  const officialSessions = years.flatMap((year) => sessionsByYear.get(year) ?? []);
  importReport.maxParallelSessionDetailRequests = Math.min(concurrency, officialSessions.length);
  const sessionDetails = await mapLimit(officialSessions, concurrency, async (discoveredSession) => {
    const year = discoveredSession.year;
    const sessionIdRaw = String(discoveredSession.eventsSessionId);
    const detailsUrl = api(`EventsSessionDetails?id=${sessionIdRaw}`);
    const detailPath = join(rawDir, `${year}-events-session-${sessionIdRaw}.json`);
    const { payload: details, fromCache } = await fetchJsonCached(detailsUrl, detailPath);
    importReport[fromCache ? 'cached' : 'fetched'] += 1;
    importReport.rawArtifacts.push(detailPath.replace(`${root}/`, ''));
    return { year, discoveredSession, sessionIdRaw, detailsUrl, detailPath, details };
  });

  for (const { year, discoveredSession, sessionIdRaw, detailsUrl, detailPath, details } of sessionDetails) {
      const sessionEvidenceId = `source_indynxt_events_session_${sessionIdRaw}`;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: sessionEvidenceId,
        sourceType: 'official_api',
        sourceName: `INDY NXT EventsSessionDetails ${sessionIdRaw}`,
        url: detailsUrl,
        retrievedAt,
        coverage: `${details.EventName ?? 'Unknown event'} ${details.SessionName ?? 'session'} full result records.`,
        parser: 'scripts/import-indy-nxt-career.mjs',
        rawArtifactPath: detailPath.replace(`${root}/`, ''),
        notes: 'Primary row-level source for event/session/result records.'
      }));

      const trackName = trackNameFromEvent(details.EventName ?? discoveredSession.eventName);
      const trackId = `track_${slug(trackName)}`;
      upsert(tracks, {
        id: trackId,
        name: trackName,
        canonicalName: trackName,
        country: 'United States',
        region: null,
        city: null,
        latitude: null,
        longitude: null,
        timezone: null,
        trackType: trackTypeLabel(details.TrackType),
        configuration: null,
        lengthKm: null,
        lengthMi: null,
        direction: 'unknown',
        surface: null,
        elevationM: null,
        cornerCount: null,
        passingDifficulty: null,
        brakingSeverity: null,
        temporary: trackTypeLabel(details.TrackType) === 'street',
        altitudeM: null,
        aliases: Array.from(new Set([details.EventName, discoveredSession.eventName].filter(Boolean))),
        provenanceRefs: [sessionEvidenceId]
      });

      const eventId = `event_indy_nxt_${year}_${discoveredSession.eventId ?? slug(trackName)}`;
      upsert(events, {
        id: eventId,
        seriesId: 'series_indy_nxt',
        seasonYear: year,
        name: details.EventName ?? discoveredSession.eventName,
        round: null,
        eventStartDate: details.SessionDate ? String(details.SessionDate).slice(0, 10) : null,
        eventEndDate: details.SessionDate ? String(details.SessionDate).slice(0, 10) : null,
        trackId,
        country: 'United States',
        officialEventId: discoveredSession.eventId ? String(discoveredSession.eventId) : null,
        provenanceRefs: ['source_indynxt_season_drop_down', sessionEvidenceId]
      });

      const canonicalSessionId = `session_indy_nxt_${year}_${sessionIdRaw}`;
      const sessionRaceNumber = raceNumberFromName(details.SessionName) ?? raceNumberFromName(discoveredSession.sessionName) ?? raceNumberFromName(details.EventName);
      const canonicalSessionType = sessionType(details.SessionName ?? discoveredSession.sessionName ?? details.SessionType, details.SessionType);
      upsert(sessions, {
        id: canonicalSessionId,
        eventId,
        sessionType: canonicalSessionType,
        sessionName: details.SessionName ?? discoveredSession.sessionName ?? details.EventName,
        raceNumber: sessionRaceNumber,
        scheduledStart: details.SessionDate ?? null,
        actualStart: null,
        timezone: null,
        lapsScheduled: null,
        distanceScheduled: null,
        status: 'official',
        officialSessionId: sessionIdRaw,
        weatherObservationRefs: [],
        provenanceRefs: ['source_indynxt_season_drop_down', sessionEvidenceId]
      });
      importReport.sessionsImported += 1;

      for (const report of asArray(details.SessionReports)) {
        const url = reportUrl(report.Url);
        const reportId = `asset_indy_nxt_${year}_${sessionIdRaw}_${slug(report.Name ?? report.ReportType ?? report.DocumentType ?? report.Url ?? 'report')}`;
        upsert(mediaAssets, {
          id: reportId,
          assetType: 'pdf',
          title: report.Name ?? report.ReportType ?? `Session report ${sessionIdRaw}`,
          url,
          rightsStatus: 'link_only',
          publishedAt: details.SessionDate ?? null,
          eventId,
          sessionId: canonicalSessionId,
          driverId: null,
          summary: `Official INDY NXT session report for ${details.EventName ?? discoveredSession.eventName} ${details.SessionName ?? discoveredSession.sessionName}.`,
          quoteText: null,
          raw: {
            documentId: report.DocumentID ?? report.DocumentId ?? null,
            documentType: report.DocumentType ?? report.ReportType ?? null,
            fileType: report.FileType ?? null,
            sortOrder: report.SortOrder ?? null,
            isActive: report.IsActive ?? null,
            modifiedAt: report.ModifiedDate ?? null
          },
          provenanceRefs: [sessionEvidenceId]
        });
        importReport.mediaAssetsImported += 1;
      }

      const records = asArray(details.records).filter((record) => !record.IsDeleted);
      const fieldSize = records.length;
      const bestLapRankByDriver = new Map(
        records
          .map((record) => ({ driverId: String(record.DriverOverrideID), speed: safeNumber(record.BestSpeed) }))
          .filter((record) => record.speed !== null && record.speed > 0)
          .sort((left, right) => right.speed - left.speed)
          .map((record, index) => [record.driverId, index + 1])
      );

      for (const record of records) {
        const driverName = record.DriverName ?? `${record.FirstName ?? ''} ${record.LastName ?? ''}`.trim();
        const driverId = String(record.DriverOverrideID) === bryceDriverOverrideId ? 'driver_bryce_aron' : `driver_${slug(driverName || record.DriverOverrideID)}`;
        upsert(drivers, {
          id: driverId,
          displayName: driverName || `Driver ${record.DriverOverrideID}`,
          givenName: record.FirstName ?? null,
          familyName: record.LastName ?? null,
          nationality: null,
          hometown: null,
          dateOfBirth: null,
          externalIds: { indynxtDriverId: String(record.DriverOverrideID), indynxtDriversId: String(record.DriversID) },
          provenanceRefs: [sessionEvidenceId]
        });

        const teamName = record.TeamName || 'Unknown Team';
        const teamId = `team_${slug(teamName)}`;
        upsert(teams, {
          id: teamId,
          name: teamName,
          seriesIds: ['series_indy_nxt'],
          country: null,
          officialWebsite: null,
          provenanceRefs: [sessionEvidenceId]
        });

        const carId = `car_indy_nxt_${year}_${slug(teamName)}_${slug(record.CarNumber ?? 'unknown')}`;
        upsert(cars, {
          id: carId,
          seriesId: 'series_indy_nxt',
          seasonYear: year,
          chassis: 'Dallara IL-15',
          engine: 'AER turbocharged engine',
          tireSupplier: 'Firestone',
          class: 'INDY NXT',
          carNumber: String(record.CarNumber ?? ''),
          entrant: teamName,
          teamId,
          liveryNotes: null,
          provenanceRefs: [sessionEvidenceId]
        });

        const finish = safeNumber(record.PositionFinish);
        const resultId = `result_indy_nxt_${year}_${sessionIdRaw}_${driverId}`;
        const resultStatus = statusCategory(record.Status);
        const incidentId = `${statusIncidentPrefix}${year}_${sessionIdRaw}_${driverId}`;
        const incidentRefs = [];
        if (canonicalSessionType === 'race' && officialStatusIncidentTypes.has(resultStatus)) {
          incidentRefs.push(incidentId);
          incidents.push({
            id: incidentId,
            sessionId: canonicalSessionId,
            driverId,
            lapNumber: null,
            incidentType: resultStatus,
            description: `Official INDY NXT result status reported "${record.Status ?? resultStatus}" for ${driverName || driverId}.`,
            outcome: `finish_position_${finish ?? 'unknown'}_laps_${safeNumber(record.LapsComplete) ?? 'unknown'}`,
            otherDriverIds: [],
            raw: {
              source: 'INDY NXT EventsSessionDetails Status field',
              statusRaw: record.Status ?? null,
              carNumber: String(record.CarNumber ?? ''),
              finishPosition: finish,
              lapsCompleted: safeNumber(record.LapsComplete),
              eventsSessionsDetailsId: record.EventsSessionsDetailsID ? String(record.EventsSessionsDetailsID) : null
            },
            confidence: 'official_status_label',
            provenanceRefs: [sessionEvidenceId]
          });
          importReport.officialStatusIncidentsImported += 1;
        }
        upsert(results, {
          id: resultId,
          sessionId: canonicalSessionId,
          driverId,
          teamId,
          carId,
          carNumber: String(record.CarNumber ?? ''),
          class: 'INDY NXT',
          gridPosition: safeNumber(record.PositionStart),
          startPosition: safeNumber(record.PositionStart),
          finishPosition: finish,
          classifiedPosition: finish,
          finishPercentile: finish && fieldSize ? Number(((fieldSize - finish + 1) / fieldSize).toFixed(4)) : null,
          fieldSize,
          lapsCompleted: safeNumber(record.LapsComplete),
          lapsScheduled: null,
          lapsLed: safeNumber(record.LapsLed),
          points: safeNumber(record.PointsEarned),
          status: resultStatus,
          statusRaw: record.Status ?? null,
          totalTime: record.ElapsedTime ?? null,
          gapToLeader: record.Difference ?? null,
          gapToAhead: record.Gap ?? null,
          averageSpeed: safeNumber(record.SpeedAvg),
          bestLapTime: record.BestLapTime ?? null,
          bestLapNumber: safeNumber(record.InLap),
          bestLapRank: bestLapRankByDriver.get(String(record.DriverOverrideID)) ?? null,
          pitStops: safeNumber(record.PitStops),
          penaltyRefs: [],
          incidentRefs,
          sourceResultId: record.EventsSessionsDetailsID ? String(record.EventsSessionsDetailsID) : null,
          raw: {
            driversId: record.DriversID ?? null,
            eventsEntrylistId: record.EventsEntrylistID ?? null,
            timesLed: safeNumber(record.TimesLed),
            lapsDown: safeNumber(record.LapsDown),
            qualLap1: record.QualLap1 ?? null,
            qualLap2: record.QualLap2 ?? null,
            qualLap3: record.QualLap3 ?? null,
            qualLap4: record.QualLap4 ?? null
          },
          provenanceRefs: [sessionEvidenceId]
        });
        importReport.resultsImported += 1;
        if (driverId === 'driver_bryce_aron') importReport.bryceResultsImported += 1;

        if (canonicalSessionType === 'qualifying') {
          upsert(qualifyingResults, {
            id: `qualifying_indy_nxt_${year}_${sessionIdRaw}_${driverId}`,
            sessionId: canonicalSessionId,
            driverId,
            teamId,
            carId,
            position: finish,
            bestLapTime: record.BestLapTime ?? null,
            gapToPole: nullableGap(record.Difference),
            laps: safeNumber(record.LapsComplete),
            sessionSegment: details.SessionName ?? discoveredSession.sessionName ?? null,
            penaltyApplied: false,
            gridPositionResulting: safeNumber(record.PositionStart),
            raw: {
              carNumber: String(record.CarNumber ?? ''),
              gapToAhead: nullableGap(record.Gap),
              bestLapNumber: safeNumber(record.InLap),
              bestLapSpeedMph: safeNumber(record.BestSpeed),
              bestSpeedFormatted: record.BestSpeedFormatted ?? null,
              officialSessionType: details.SessionType ?? null,
              eventsSessionsDetailsId: record.EventsSessionsDetailsID ? String(record.EventsSessionsDetailsID) : null,
              qualLap1: record.QualLap1 ?? null,
              qualLap2: record.QualLap2 ?? null,
              qualLap3: record.QualLap3 ?? null,
              qualLap4: record.QualLap4 ?? null
            },
            provenanceRefs: [sessionEvidenceId]
          });
          importReport.qualifyingResultsImported += 1;
          if (driverId === 'driver_bryce_aron') importReport.bryceQualifyingResultsImported += 1;
        }
      }
  }

  const imsaImported = series.has('series_imsa_weathertech');
  const remainingCareerGap = {
    id: imsaImported ? 'gap_remaining_career_rows_after_imsa' : 'gap_remaining_non_indy_nxt_career_rows',
    scope: 'career_dataset',
    status: 'open',
    description: imsaImported
      ? 'Later source families, karting race-by-race records, media narrative beyond imported Team USA 2020 context and structured Team USA/Badger Kart Club milestone and record facts, non-official ambient weather enrichment, session-window precision, and track metadata for future imported tracks remain open.'
      : 'IMSA, later open-wheel and early-career source families, karting, media narrative, weather enrichment, session-window precision, and track metadata for future imported tracks remain open.'
  };
  const currentGaps = asArray(existing.gaps).filter(
    (gap) =>
      ![
        'gap_initial_dataset_unpopulated',
        'gap_indy_nxt_qualifying_lap_reports',
        'gap_non_indy_nxt_career_rows',
        'gap_remaining_non_indy_nxt_career_rows',
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
    qualifyingResults: Array.from(qualifyingResults.values()).sort((a, b) => a.id.localeCompare(b.id)),
    lapSamples: asArray(existing.lapSamples),
    racecraftEvents: asArray(existing.racecraftEvents),
    penalties: asArray(existing.penalties),
    incidents: incidents.sort((a, b) => a.id.localeCompare(b.id)),
    weatherObservations: asArray(existing.weatherObservations),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [
      ...currentGaps,
      {
        id: 'gap_indy_nxt_qualifying_lap_reports',
        scope: 'indy_nxt_official',
        status: 'open',
        description: 'EventsSessionDetails imports race/session result rows, qualifyingResults for official SessionType=Q records, and official terminal-status incident rows for contact/mechanical/dns outcomes. Official Race Lap Chart PDFs, Event Summary PDFs, Leader Lap Summary PDFs, Top Section Times PDFs, and Results PDF penalty/caution summaries are handled by the report-detail backfill. Pit summaries, sector PDFs, and deeper report parsing remain open.'
      },
      remainingCareerGap
    ]
  };

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(importReport, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    counts: {
      drivers: dataset.drivers.length,
      teams: dataset.teams.length,
      cars: dataset.cars.length,
      tracks: dataset.tracks.length,
      seasons: dataset.seasons.length,
      events: dataset.events.length,
      sessions: dataset.sessions.length,
      results: dataset.results.length,
      qualifyingResults: dataset.qualifyingResults.length,
      sourceEvidence: dataset.sourceEvidence.length
    },
    importReport
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
