import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/gb3');
const reportPath = join(root, 'data/career/reports/gb3-import-report.json');

const year = 2022;
const championshipId = 22;
const base = 'https://www.gb-3.net/json/results';
const bryceDriverUrl = '/drivers/2022/bryce-aron';
const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const concurrency = Math.max(1, Number(argValue('concurrency', '4')));
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
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText} for ${url}`);
      error.status = response.status;
      throw error;
    }
    return JSON.parse(text);
  } catch (error) {
    if (error.status === 404 || attempt >= retries) throw error;
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

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/import-gb3-career.mjs',
  licenseNotes: 'Public official GB3 results JSON/PDF links; store extracted facts and source URL.',
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/import-gb3-career.mjs',
  rawArtifactPath,
  notes
});

const sessionType = (session) => {
  if (Number(session.Type) === 2 || Number(session.RaceNumber) > 0) return 'race';
  if (Number(session.Type) === 1 || /qual/i.test(session.Name ?? '')) return 'qualifying';
  if (/test/i.test(session.Name ?? '')) return 'test';
  return 'practice';
};

const statusCategory = (position) => {
  const value = String(position ?? '').toLowerCase();
  if (/^\d+$/.test(value)) return 'running';
  if (value.includes('dq')) return 'dsq';
  if (value.includes('dnf')) return 'dnf';
  if (value.includes('dns')) return 'dns';
  return 'unknown';
};

const parsePosition = (position) => (/^\d+$/.test(String(position ?? '')) ? Number(position) : null);

const venueTimezone = (venue) => (/spa/i.test(venue ?? '') ? 'Europe/Brussels' : 'Europe/London');
const venueCountry = (venue) => (/spa/i.test(venue ?? '') ? 'Belgium' : 'United Kingdom');

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
  const mediaAssets = new Map(asArray(existing.mediaAssets).map((row) => [row.id, row]));

  const importReport = {
    checkedAt: retrievedAt,
    year,
    concurrency,
    refresh,
    fetched: 0,
    cached: 0,
    sessionsDiscovered: 0,
    sessionsImported: 0,
    manifestOnlySessionsImported: 0,
    sessionFetchFailures: [],
    resultsImported: 0,
    bryceResultsImported: 0,
    mediaAssetsImported: 0,
    rawArtifacts: [],
    gaps: []
  };

  upsert(series, {
    id: 'series_gb3',
    name: 'GB3 Championship',
    category: 'formula',
    ladderLevel: 'British single-seater development ladder',
    governingBody: 'MotorSport Vision',
    countryScope: 'United Kingdom / Europe',
    officialWebsite: 'https://www.gb-3.net/',
    externalIds: { gb3ChampionshipId: String(championshipId) },
    provenanceRefs: ['source_gb3_2022_rounds']
  });

  const roundsUrl = `${base}/${year}/${championshipId}/_rounds.json`;
  const standingsUrl = `${base}/${year}/${championshipId}/_standings.json`;
  const roundsPath = join(rawDir, `${year}-rounds.json`);
  const standingsPath = join(rawDir, `${year}-standings.json`);
  const [roundsResult, standingsResult] = await Promise.all([
    fetchJsonCached(roundsUrl, roundsPath),
    fetchJsonCached(standingsUrl, standingsPath)
  ]);
  importReport[roundsResult.fromCache ? 'cached' : 'fetched'] += 1;
  importReport[standingsResult.fromCache ? 'cached' : 'fetched'] += 1;
  importReport.rawArtifacts.push(roundsPath.replace(`${root}/`, ''), standingsPath.replace(`${root}/`, ''));

  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_gb3_2022_rounds',
    sourceType: 'official_api',
    sourceName: 'GB3 2022 rounds JSON',
    url: roundsUrl,
    retrievedAt,
    coverage: 'Official GB3 2022 round/session manifest.',
    rawArtifactPath: roundsPath.replace(`${root}/`, ''),
    notes: 'Primary discovery route for GB3 2022 events, sessions, timestamps, and result PDF links.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_gb3_2022_standings',
    sourceType: 'official_api',
    sourceName: 'GB3 2022 standings JSON',
    url: standingsUrl,
    retrievedAt,
    coverage: 'Official GB3 2022 driver standings, points, wins, and per-race RoundPoints.',
    rawArtifactPath: standingsPath.replace(`${root}/`, ''),
    notes: 'Use DriverUrl for Bryce identity; standings IDs differ from session-row IDs.'
  }));

  const rounds = asArray(roundsResult.payload);
  const standings = asArray(standingsResult.payload);
  const standingsByDriverUrl = new Map(standings.map((row) => [row.DriverUrl, row]));
  const sessionsToFetch = rounds.flatMap((round) =>
    asArray(round.Series)
      .filter((championship) => Number(championship.ChampionshipID) === championshipId)
      .flatMap((championship) =>
        asArray(championship.Sessions).map((session) => ({
          round,
          session,
          id: String(session.Id),
          url: `${base}/${year}/${session.Id}.json`,
          path: join(rawDir, `${year}-session-${session.Id}.json`)
        }))
      )
  );
  importReport.sessionsDiscovered = sessionsToFetch.length;

  const fetchedSessions = await mapLimit(sessionsToFetch, concurrency, async (entry) => {
    try {
      const result = await fetchJsonCached(entry.url, entry.path);
      importReport[result.fromCache ? 'cached' : 'fetched'] += 1;
      importReport.rawArtifacts.push(entry.path.replace(`${root}/`, ''));
      return { ...entry, records: asArray(result.payload), fromCache: result.fromCache };
    } catch (error) {
      importReport.sessionFetchFailures.push({
        sessionId: entry.id,
        status: error.status ?? 'unknown',
        url: entry.url,
        sessionName: entry.session.Name,
        round: entry.round.Number,
        venue: entry.round.Venue
      });
      return { ...entry, records: null, error };
    }
  });

  const raceSessions = sessionsToFetch
    .filter((entry) => sessionType(entry.session) === 'race')
    .sort((left, right) => Number(left.session.RaceNumber) - Number(right.session.RaceNumber));
  const raceIndexBySessionId = new Map(raceSessions.map((entry, index) => [entry.id, index]));

  for (const round of rounds) {
    const trackName = `${round.Venue}${round.CircuitLayout ? ` ${round.CircuitLayout}` : ''}`;
    const trackId = `track_${slug(trackName)}`;
    upsert(tracks, {
      id: trackId,
      name: trackName,
      canonicalName: trackName,
      country: venueCountry(round.Venue),
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: venueTimezone(round.Venue),
      trackType: 'road',
      configuration: round.CircuitLayout ?? null,
      lengthKm: null,
      lengthMi: null,
      direction: 'unknown',
      surface: null,
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: Array.from(new Set([round.Venue, trackName].filter(Boolean))),
      provenanceRefs: ['source_gb3_2022_rounds']
    });

    upsert(events, {
      id: `event_gb3_${year}_r${round.Number}_${slug(round.Venue)}`,
      seriesId: 'series_gb3',
      seasonYear: year,
      name: `GB3 ${year} Round ${round.Number} - ${round.Venue}`,
      round: safeNumber(round.Number),
      eventStartDate: round.FirstDate ? String(round.FirstDate).slice(0, 10) : null,
      eventEndDate: round.LastDate ? String(round.LastDate).slice(0, 10) : null,
      trackId,
      country: venueCountry(round.Venue),
      officialEventId: String(round.EventID ?? round.Id ?? ''),
      provenanceRefs: ['source_gb3_2022_rounds']
    });
  }

  for (const entry of fetchedSessions) {
    const { round, session } = entry;
    const trackName = `${round.Venue}${round.CircuitLayout ? ` ${round.CircuitLayout}` : ''}`;
    const eventId = `event_gb3_${year}_r${round.Number}_${slug(round.Venue)}`;
    const sessionId = `session_gb3_${year}_${entry.id}`;
    const sessionEvidenceId = `source_gb3_2022_session_${entry.id}`;

    if (!entry.records) {
      upsert(sessions, {
        id: sessionId,
        eventId,
        sessionType: sessionType(session),
        sessionName: session.Name,
        raceNumber: safeNumber(session.RaceNumber),
        scheduledStart: session.DateTime ?? null,
        actualStart: null,
        timezone: venueTimezone(round.Venue),
        lapsScheduled: null,
        distanceScheduled: null,
        status: 'official_manifest_only',
        officialSessionId: entry.id,
        weatherObservationRefs: [],
        ingestionState: 'official_manifest_only',
        broadcastRouteRefs: [],
        notificationRefs: [],
        raw: {
          gb3Type: session.Type ?? null,
          lengthMinutes: safeNumber(session.Length),
          orderByDateTime: session.OrderByDateTime ?? null,
          rowLevelJsonFetchFailure: {
            status: entry.error?.status ?? 'unknown',
            url: entry.url
          }
        },
        provenanceRefs: ['source_gb3_2022_rounds']
      });
      importReport.sessionsImported += 1;
      importReport.manifestOnlySessionsImported += 1;
      const knownMissing1248 = entry.id === '1248' && entry.error?.status === 404;
      importReport.gaps.push({
        id: `gap_gb3_2022_session_${entry.id}_missing_json`,
        scope: 'gb3_2022',
        status: 'open',
        description: knownMissing1248
          ? `GB3 _rounds.json lists ${round.Venue} ${session.Name} (${entry.id}) at ${session.DateTime ?? 'an unknown time'}, so the session entity is retained from the official manifest. Row-level results remain unavailable because the official session JSON endpoint returned 404 and a focused source audit found that the rendered official results page did not expose row-level table data without that JSON payload.`
          : `GB3 _rounds.json lists ${round.Venue} ${session.Name} (${entry.id}) at ${session.DateTime ?? 'an unknown time'}, so the session entity is retained from the official manifest. Row-level results remain unavailable because the official session JSON endpoint returned ${entry.error?.status ?? 'an error'}.`,
        provenanceRefs: ['source_gb3_2022_rounds'],
        raw: {
          officialManifestUrl: roundsUrl,
          officialJsonUrl: entry.url,
          ...(knownMissing1248
            ? {
                renderedResultsPageUrl: `https://www.gb-3.net/results?round=R${round.Number}&session=${entry.id}&year=${year}`,
                alternateOfficialCheck: 'rendered_results_page_checked_no_row_level_table_without_json_payload',
                unavailableReason: 'official_session_json_404_rendered_page_has_empty_client_table'
              }
            : {
                unavailableReason: `official_session_json_fetch_failed_${entry.error?.status ?? 'unknown'}`
              })
        }
      });
      continue;
    }

    upsert(sourceEvidenceMap, sourceEvidence({
      id: sessionEvidenceId,
      sourceType: 'official_api',
      sourceName: `GB3 2022 session ${entry.id}`,
      url: entry.url,
      retrievedAt,
      coverage: `${round.Venue} ${session.Name} full-field result rows.`,
      rawArtifactPath: entry.path.replace(`${root}/`, ''),
      notes: 'Primary row-level GB3 source. Position can be numeric or status text such as DQ/DNF.'
    }));

    upsert(sessions, {
      id: sessionId,
      eventId,
      sessionType: sessionType(session),
      sessionName: session.Name,
      raceNumber: safeNumber(session.RaceNumber),
      scheduledStart: session.DateTime ?? null,
      actualStart: null,
      timezone: venueTimezone(round.Venue),
      lapsScheduled: null,
      distanceScheduled: null,
      status: 'official',
      officialSessionId: entry.id,
      weatherObservationRefs: [],
      ingestionState: 'official',
      broadcastRouteRefs: [],
      notificationRefs: [],
      raw: {
        gb3Type: session.Type ?? null,
        lengthMinutes: safeNumber(session.Length),
        orderByDateTime: session.OrderByDateTime ?? null
      },
      provenanceRefs: ['source_gb3_2022_rounds', sessionEvidenceId]
    });
    importReport.sessionsImported += 1;

    if (session.ResultsPDF) {
      const assetId = `asset_gb3_${year}_${entry.id}_results_pdf`;
      upsert(mediaAssets, {
        id: assetId,
        assetType: 'pdf',
        title: `GB3 ${year} ${round.Venue} ${session.Name} results PDF`,
        url: session.ResultsPDF,
        rightsStatus: 'link_only',
        publishedAt: session.DateTime ?? null,
        eventId,
        sessionId,
        driverId: null,
        summary: `Official GB3 result PDF for ${round.Venue} ${session.Name}.`,
        quoteText: null,
        provenanceRefs: ['source_gb3_2022_rounds']
      });
      importReport.mediaAssetsImported += 1;
    }

    const fieldSize = entry.records.length;
    for (const record of entry.records) {
      const driverName = `${record.Firstname ?? ''} ${record.Surname ?? ''}`.trim();
      const driverId = record.DriverUrl === bryceDriverUrl ? 'driver_bryce_aron' : `driver_${slug(driverName || record.DriverUrl || record.Id)}`;
      const standing = standingsByDriverUrl.get(record.DriverUrl);
      const teamId = `team_${slug(record.Team || 'unknown_team')}`;
      const carId = `car_gb3_${year}_${slug(record.Team || 'unknown_team')}_${slug(record.Number ?? 'unknown')}`;
      const finish = parsePosition(record.Position);
      const racePointIndex = raceIndexBySessionId.get(entry.id);
      const racePoints = racePointIndex !== undefined ? standing?.RoundPoints?.[racePointIndex] ?? null : null;

      upsert(drivers, {
        id: driverId,
        displayName: driverName || `Driver ${record.Id}`,
        givenName: record.Firstname ?? null,
        familyName: record.Surname ?? null,
        nationality: standing?.CountryISO === 'US' ? 'United States' : null,
        hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, Illinois' : null,
        dateOfBirth: null,
        externalIds: {
          gb3SessionDriverId: record.Id ? String(record.Id) : null,
          gb3StandingsDriverId: standing?.Id ? String(standing.Id) : null,
          gb3DriverUrl: record.DriverUrl ?? null
        },
        provenanceRefs: [sessionEvidenceId]
      });

      upsert(teams, {
        id: teamId,
        name: record.Team || 'Unknown Team',
        seriesIds: ['series_gb3'],
        country: null,
        officialWebsite: null,
        provenanceRefs: [sessionEvidenceId]
      });

      upsert(cars, {
        id: carId,
        seriesId: 'series_gb3',
        seasonYear: year,
        chassis: null,
        engine: null,
        tireSupplier: null,
        class: 'GB3',
        carNumber: String(record.Number ?? ''),
        entrant: record.Team || 'Unknown Team',
        teamId,
        liveryNotes: null,
        provenanceRefs: [sessionEvidenceId]
      });

      upsert(results, {
        id: `result_gb3_${year}_${entry.id}_${driverId}`,
        sessionId,
        driverId,
        teamId,
        carId,
        carNumber: String(record.Number ?? ''),
        class: 'GB3',
        gridPosition: null,
        startPosition: null,
        finishPosition: finish,
        classifiedPosition: finish,
        finishPercentile: finish && fieldSize ? Number(((fieldSize - finish + 1) / fieldSize).toFixed(4)) : null,
        fieldSize,
        lapsCompleted: safeNumber(record.Laps),
        lapsScheduled: null,
        lapsLed: null,
        points: safeNumber(racePoints),
        status: statusCategory(record.Position),
        statusRaw: String(record.Position ?? ''),
        totalTime: record.TotalTime ?? null,
        gapToLeader: record.Gap ?? null,
        gapToAhead: record.Diff ?? null,
        averageSpeed: null,
        bestLapTime: record.FastestLap ?? null,
        bestLapNumber: safeNumber(record.FastestLapNo),
        bestLapRank: null,
        pitStops: safeNumber(record.PitStops),
        penaltyRefs: [],
        incidentRefs: [],
        sourceResultId: record.Id ? String(record.Id) : null,
        raw: {
          gb3PositionRaw: record.Position ?? null,
          fastestLapAvgSpeedMph: safeNumber(record.FastestLapAvgSpeed),
          isFastest: Boolean(record.IsFastest),
          subClassification: record.SubClassification ?? '',
          driverUrl: record.DriverUrl ?? null
        },
        provenanceRefs: [sessionEvidenceId]
      });
      importReport.resultsImported += 1;
      if (driverId === 'driver_bryce_aron') importReport.bryceResultsImported += 1;
    }
  }

  const bryceStanding = standingsByDriverUrl.get(bryceDriverUrl);
  const bryceRaceResults = Array.from(results.values()).filter((row) => row.driverId === 'driver_bryce_aron' && String(row.sessionId).startsWith(`session_gb3_${year}_`) && sessions.get(row.sessionId)?.sessionType === 'race');
  const bryceTeamIds = Array.from(new Set(bryceRaceResults.map((row) => row.teamId).filter(Boolean)));
  const bryceCarIds = Array.from(new Set(bryceRaceResults.map((row) => row.carId).filter(Boolean)));
  upsert(seasons, {
    id: `season_gb3_${year}_bryce_aron`,
    year,
    seriesId: 'series_gb3',
    driverId: 'driver_bryce_aron',
    teamIds: bryceTeamIds,
    carIds: bryceCarIds,
    championshipPosition: safeNumber(bryceStanding?.Position),
    points: safeNumber(bryceStanding?.Points),
    starts: bryceRaceResults.length,
    wins: safeNumber(bryceStanding?.TotalWins),
    poles: null,
    podiums: bryceRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: bryceRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: bryceRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: bryceRaceResults.filter((row) => row.status !== 'running').length,
    provenanceRefs: ['source_gb3_2022_standings']
  });

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
      !['gap_non_indy_nxt_career_rows', 'gap_remaining_non_indy_nxt_career_rows', 'gap_remaining_career_rows_after_imsa'].includes(gap.id) &&
      !String(gap.id ?? '').startsWith('gap_gb3_2022_session_')
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
    lapSamples: asArray(existing.lapSamples),
    racecraftEvents: asArray(existing.racecraftEvents),
    penalties: asArray(existing.penalties),
    incidents: asArray(existing.incidents),
    weatherObservations: asArray(existing.weatherObservations),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [
      ...currentGaps,
      ...importReport.gaps,
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
      series: dataset.series.length,
      teams: dataset.teams.length,
      cars: dataset.cars.length,
      tracks: dataset.tracks.length,
      seasons: dataset.seasons.length,
      events: dataset.events.length,
      sessions: dataset.sessions.length,
      results: dataset.results.length,
      sourceEvidence: dataset.sourceEvidence.length,
      gaps: dataset.gaps.length
    },
    importReport
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
