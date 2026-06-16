import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawPath = join(root, 'data/career/raw/track-metadata/track-metadata.v1.json');
const reportPath = join(root, 'data/career/reports/track-metadata-import-report.json');

const verifySourceUrls = process.argv.includes('--verify-source-urls');
const dryRun = process.argv.includes('--dry-run');

const requiredCollections = [
  'drivers',
  'series',
  'teams',
  'cars',
  'tracks',
  'seasons',
  'events',
  'sessions',
  'results',
  'qualifyingResults',
  'lapSamples',
  'racecraftEvents',
  'penalties',
  'incidents',
  'weatherObservations',
  'mediaAssets',
  'broadcastRoutes',
  'notificationRules',
  'notificationEvents',
  'derivedMetrics',
  'sourceEvidence',
  'gaps'
];

const allowedTrackTypes = new Set(['street', 'road', 'oval', 'karting', 'mixed', 'unknown']);
const allowedDirections = new Set(['clockwise', 'counterclockwise', 'bidirectional', 'unknown']);
const allowedConfidenceTiers = new Set(['official', 'high', 'medium', 'low']);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const addIssue = (issues, severity, path, message) => {
  issues.push({ severity, path, message });
};

const sourceIdForTrack = (trackId) => `source_track_metadata_${trackId.replace(/^track_/, '')}`;

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const isValidTimezone = (timezone) => {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const hasSpecificClockTime = (value) => {
  if (!value) return false;
  return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(value)) || /\b\d{1,2}:\d{2}(:\d{2})?\b/.test(String(value));
};

const mergeDefined = (current, next) => {
  if (next === null || next === undefined || next === '') return current;
  if (current === null || current === undefined || current === '' || current === 'unknown') return next;
  return next;
};

const trackWeatherJoinReadiness = (track) => {
  const hasCoordinates = isNumber(track.latitude) && isNumber(track.longitude);
  const hasTimezone = isValidTimezone(track.timezone);
  const hasLayout = isNumber(track.lengthKm) || isNumber(track.lengthMi);
  return {
    ready: hasCoordinates && hasTimezone,
    coordinates: hasCoordinates,
    timezone: hasTimezone,
    layout: hasLayout,
    sourceEvidenceId: sourceIdForTrack(track.id),
    caveat:
      track.confidenceTier === 'medium'
        ? 'Usable for event-level weather joins, but coordinate/layout precision should be refined when stronger official data appears.'
        : null
  };
};

const addRef = (row, ref) => ({
  ...row,
  provenanceRefs: unique([...(row.provenanceRefs ?? []), ref])
});

const trackMetadataEvidence = (track, retrievedAt) => ({
  id: sourceIdForTrack(track.id),
  sourceType: 'official_page',
  sourceName: `${track.canonicalName ?? track.name} track metadata source pack`,
  url: track.sourceUrl,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-track-metadata.mjs',
  licenseNotes: 'Public track/circuit metadata sources; store extracted facts, source URLs, and provenance only.',
  confidenceTier: track.confidenceTier,
  coverage: [
    `Layout/location metadata for ${track.name}.`,
    `Primary layout source: ${track.sourceUrl}.`,
    track.directionSourceUrl ? `Direction source: ${track.directionSourceUrl}.` : null,
    `Coordinate source: ${track.coordinateSourceUrl}.`
  ].filter(Boolean).join(' '),
  parser: 'scripts/backfill-track-metadata.mjs',
  rawArtifactPath: 'data/career/raw/track-metadata/track-metadata.v1.json',
  notes: track.notes ?? null,
  linkedUrls: unique([track.sourceUrl, track.coordinateSourceUrl, track.directionSourceUrl])
});

const cleanTrackMetadataGapLanguage = (gap) => ({
  ...gap,
  description: typeof gap.description === 'string'
    ? gap.description
        .replace(/detailed track metadata/g, 'track metadata for future imported tracks')
        .replace(/Need coordinates\/timezone\/layout length\/direction\/corners before weather\./g, 'Current imported tracks need maintained metadata before weather joins.')
    : gap.description
});

const validateRawMetadata = (raw, dataset, issues) => {
  if (raw.schemaVersion !== 'bryce-track-metadata.v1') {
    addIssue(issues, 'error', 'raw.schemaVersion', 'Expected bryce-track-metadata.v1.');
  }
  if (!Array.isArray(raw.tracks)) {
    addIssue(issues, 'error', 'raw.tracks', 'Raw metadata must contain a tracks array.');
    return;
  }

  const datasetTrackIds = new Set(asArray(dataset.tracks).map((track) => track.id));
  const rawTrackIds = new Set();

  raw.tracks.forEach((track, index) => {
    const path = `raw.tracks[${index}]`;
    if (!track.id) addIssue(issues, 'error', `${path}.id`, 'Track metadata row is missing id.');
    if (rawTrackIds.has(track.id)) addIssue(issues, 'error', `${path}.id`, `Duplicate raw track metadata id ${track.id}.`);
    rawTrackIds.add(track.id);

    if (!datasetTrackIds.has(track.id)) {
      addIssue(issues, 'warn', `${path}.id`, `Track metadata id ${track.id} is not currently present in the career dataset.`);
    }
    if (!track.name || !track.canonicalName) addIssue(issues, 'error', `${path}.name`, 'Track metadata row needs name and canonicalName.');
    if (!track.country || !track.city) addIssue(issues, 'error', `${path}.location`, 'Track metadata row needs country and city.');
    if (!isNumber(track.latitude) || track.latitude < -90 || track.latitude > 90) addIssue(issues, 'error', `${path}.latitude`, 'Latitude must be numeric and in range.');
    if (!isNumber(track.longitude) || track.longitude < -180 || track.longitude > 180) addIssue(issues, 'error', `${path}.longitude`, 'Longitude must be numeric and in range.');
    if (!isValidTimezone(track.timezone)) addIssue(issues, 'error', `${path}.timezone`, 'Timezone must be a valid IANA timezone.');
    if (!allowedTrackTypes.has(track.trackType)) addIssue(issues, 'error', `${path}.trackType`, 'Track type is not in the allowed vocabulary.');
    if (!allowedDirections.has(track.direction)) addIssue(issues, 'error', `${path}.direction`, 'Direction is not in the allowed vocabulary.');
    if (!isNumber(track.lengthKm) || track.lengthKm <= 0) addIssue(issues, 'error', `${path}.lengthKm`, 'lengthKm must be a positive number.');
    if (!isNumber(track.lengthMi) || track.lengthMi <= 0) addIssue(issues, 'error', `${path}.lengthMi`, 'lengthMi must be a positive number.');
    if (isNumber(track.lengthKm) && isNumber(track.lengthMi)) {
      const expectedMi = track.lengthKm * 0.621371;
      const pctDiff = Math.abs(expectedMi - track.lengthMi) / expectedMi;
      if (pctDiff > 0.04) addIssue(issues, 'warn', `${path}.length`, 'Metric and imperial lengths differ by more than 4%.');
    }
    if (!isNumber(track.cornerCount) || track.cornerCount <= 0) addIssue(issues, 'warn', `${path}.cornerCount`, 'cornerCount is missing or not positive.');
    if (!track.sourceUrl) addIssue(issues, 'error', `${path}.sourceUrl`, 'Track metadata needs a primary sourceUrl.');
    if (!track.coordinateSourceUrl) addIssue(issues, 'error', `${path}.coordinateSourceUrl`, 'Track metadata needs a coordinateSourceUrl.');
    if (!allowedConfidenceTiers.has(track.confidenceTier)) addIssue(issues, 'error', `${path}.confidenceTier`, 'confidenceTier is not in the allowed vocabulary.');
  });

  for (const track of asArray(dataset.tracks)) {
    if (!rawTrackIds.has(track.id)) {
      addIssue(issues, 'error', `dataset.tracks.${track.id}`, 'Imported dataset track has no track metadata backfill row.');
    }
  }
};

const verifyUrl = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'text/html,application/json,application/pdf,text/plain,*/*' }
    });
    if ([403, 405, 501].includes(response.status)) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { accept: 'text/html,application/json,application/pdf,text/plain,*/*' }
      });
    }
    const finalUrl = response.url ?? '';
    const softNotFound = /page-not-found|not-found|404/i.test(finalUrl);
    return {
      url,
      ok: response.ok && !softNotFound,
      status: response.status,
      statusText: softNotFound ? 'Soft not found redirect' : response.statusText,
      finalUrl
    };
  } catch (error) {
    return { url, ok: false, status: null, statusText: error.message, finalUrl: null };
  } finally {
    clearTimeout(timeout);
  }
};

const classifyWeatherReadiness = (session, event, track) => {
  if (!track?.latitude || !track?.longitude) return 'blocked_missing_track_coordinates';
  if (!session.timezone) return 'blocked_missing_session_timezone';
  if (session.timeWindowApplicability === 'not_applicable_aggregate_classification') return 'not_applicable_aggregate_classification';
  if (!session.scheduledStart && !session.actualStart) return 'blocked_missing_session_start';
  if (hasSpecificClockTime(session.actualStart) || hasSpecificClockTime(session.scheduledStart)) return 'precise_window_ready';
  if (event?.eventStartDate || session.scheduledStart) return 'event_day_context_only';
  return 'blocked_missing_session_window';
};

const main = async () => {
  const [dataset, raw] = await Promise.all([readJson(datasetPath), readJson(rawPath)]);
  const retrievedAt = new Date().toISOString();
  const issues = [];

  for (const collection of requiredCollections) {
    if (!Array.isArray(dataset[collection])) addIssue(issues, 'error', `dataset.${collection}`, 'Dataset collection is missing or not an array.');
  }

  validateRawMetadata(raw, dataset, issues);
  const rawIssuesHaveErrors = issues.some((issue) => issue.severity === 'error');
  if (rawIssuesHaveErrors) {
    await mkdir(dirname(reportPath), { recursive: true });
    const failedReport = {
      checkedAt: retrievedAt,
      ok: false,
      dryRun,
      verifySourceUrls,
      rawArtifact: rawPath.replace(`${root}/`, ''),
      counts: {
        rawTracks: Array.isArray(raw.tracks) ? raw.tracks.length : 0,
        datasetTracks: Array.isArray(dataset.tracks) ? dataset.tracks.length : 0
      },
      genericWeatherImported: false,
      issues
    };
    await writeFile(reportPath, `${JSON.stringify(failedReport, null, 2)}\n`);
    console.log(JSON.stringify(failedReport, null, 2));
    process.exitCode = 1;
    return;
  }

  const metadataByTrack = new Map(raw.tracks.map((track) => [track.id, track]));
  const evidenceById = new Map(asArray(dataset.sourceEvidence).map((row) => [row.id, row]));
  const trackEvidenceIds = new Map(raw.tracks.map((track) => [track.id, sourceIdForTrack(track.id)]));

  for (const track of raw.tracks) {
    evidenceById.set(sourceIdForTrack(track.id), trackMetadataEvidence(track, retrievedAt));
  }

  let tracksUpdated = 0;
  const tracks = asArray(dataset.tracks).map((current) => {
    const metadata = metadataByTrack.get(current.id);
    if (!metadata) return current;
    const evidenceId = sourceIdForTrack(metadata.id);
    const next = addRef({
      ...current,
      canonicalName: mergeDefined(current.canonicalName, metadata.canonicalName),
      country: mergeDefined(current.country, metadata.country),
      region: mergeDefined(current.region, metadata.region),
      city: mergeDefined(current.city, metadata.city),
      latitude: mergeDefined(current.latitude, metadata.latitude),
      longitude: mergeDefined(current.longitude, metadata.longitude),
      timezone: mergeDefined(current.timezone, metadata.timezone),
      trackType: mergeDefined(current.trackType, metadata.trackType),
      configuration: mergeDefined(current.configuration, metadata.configuration),
      lengthKm: mergeDefined(current.lengthKm, metadata.lengthKm),
      lengthMi: mergeDefined(current.lengthMi, metadata.lengthMi),
      direction: mergeDefined(current.direction, metadata.direction),
      surface: mergeDefined(current.surface, metadata.surface),
      cornerCount: mergeDefined(current.cornerCount, metadata.cornerCount),
      temporary: mergeDefined(current.temporary, metadata.temporary),
      metadataSourceUrl: metadata.sourceUrl,
      coordinateSourceUrl: metadata.coordinateSourceUrl,
      directionSourceUrl: metadata.directionSourceUrl ?? current.directionSourceUrl ?? null,
      metadataConfidenceTier: metadata.confidenceTier,
      metadataNotes: metadata.notes ?? current.metadataNotes ?? null,
      weatherJoinReady: trackWeatherJoinReadiness(metadata).ready,
      weatherJoinReadiness: trackWeatherJoinReadiness(metadata)
    }, evidenceId);
    if (JSON.stringify(current) !== JSON.stringify(next)) tracksUpdated += 1;
    return next;
  });

  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const eventsByIdBefore = new Map(asArray(dataset.events).map((event) => [event.id, event]));

  let eventTimezonesBackfilled = 0;
  const events = asArray(dataset.events).map((event) => {
    const track = tracksById.get(event.trackId);
    const evidenceId = trackEvidenceIds.get(event.trackId);
    if (!track?.timezone || event.timezone) return event;
    eventTimezonesBackfilled += 1;
    return addRef({
      ...event,
      timezone: track.timezone,
      timezoneSource: 'track_metadata',
      timezoneProvenanceRef: evidenceId
    }, evidenceId);
  });

  const eventsById = new Map(events.map((event) => [event.id, event]));

  let sessionTimezonesBackfilled = 0;
  const sessionTimezoneMismatches = [];
  const sessions = asArray(dataset.sessions).map((session) => {
    const event = eventsById.get(session.eventId);
    const track = event ? tracksById.get(event.trackId) : null;
    const evidenceId = event ? trackEvidenceIds.get(event.trackId) : null;
    if (!track?.timezone) return session;
    if (session.timezone && session.timezone !== track.timezone) {
      sessionTimezoneMismatches.push({
        sessionId: session.id,
        sessionTimezone: session.timezone,
        trackTimezone: track.timezone,
        trackId: track.id
      });
      return session;
    }
    if (session.timezone) return session;
    sessionTimezonesBackfilled += 1;
    return addRef({
      ...session,
      timezone: track.timezone,
      timezoneSource: 'track_metadata',
      timezoneProvenanceRef: evidenceId,
      timePrecision: session.timePrecision ?? (hasSpecificClockTime(session.actualStart) || hasSpecificClockTime(session.scheduledStart) ? 'local_datetime' : 'date_only')
    }, evidenceId);
  });

  for (const mismatch of sessionTimezoneMismatches) {
    addIssue(issues, 'warn', `sessions.${mismatch.sessionId}.timezone`, `Session timezone ${mismatch.sessionTimezone} differs from track timezone ${mismatch.trackTimezone}.`);
  }

  const updatedDataset = {
    ...dataset,
    updatedAt: retrievedAt,
    tracks,
    events,
    sessions,
    sourceEvidence: Array.from(evidenceById.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [
      ...asArray(dataset.gaps)
        .filter((gap) => ![
          'gap_remaining_non_indy_nxt_career_rows',
          'gap_remaining_career_rows_after_imsa',
          'gap_remaining_career_rows_after_frp_f1600_2019',
          'gap_remaining_career_rows_after_froc',
          'gap_remaining_career_rows_after_formula_ford_2020',
          'gap_remaining_career_rows_after_formula_ford_2020_refresh',
          'gap_remaining_career_rows_after_track_metadata'
        ].includes(gap.id))
        .map(cleanTrackMetadataGapLanguage),
      {
        id: 'gap_remaining_career_rows_after_track_metadata',
        scope: 'career_dataset',
        status: 'open',
        description:
          'Broad historical-tail placeholder, not a UI-readiness blocker. Remaining optional or metric-specific work includes pre-2019 karting race-by-race records, early-career Formula Ford appearances outside the imported official books, future imported-track metadata, non-official ambient weather outside current exact-window scope, and future derived benchmark models. Current production caveats are tracked by specific gap IDs.'
      }
    ]
  };

  const updatedEventsById = new Map(events.map((event) => [event.id, event]));
  const readinessRows = sessions.map((session) => {
    const event = updatedEventsById.get(session.eventId);
    const track = event ? tracksById.get(event.trackId) : null;
    return {
      sessionId: session.id,
      eventId: session.eventId,
      trackId: event?.trackId ?? null,
      readiness: classifyWeatherReadiness(session, event, track)
    };
  });

  const readinessCounts = readinessRows.reduce((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] ?? 0) + 1;
    return acc;
  }, {});

  const trackCoverageRows = tracks.map((track) => ({
    trackId: track.id,
    name: track.name,
    hasCoordinates: isNumber(track.latitude) && isNumber(track.longitude),
    hasTimezone: Boolean(track.timezone),
    hasLength: isNumber(track.lengthKm) && isNumber(track.lengthMi),
    hasKnownDirection: Boolean(track.direction && track.direction !== 'unknown'),
    hasLayoutProfile: Boolean(track.trackType && track.configuration && track.direction && track.direction !== 'unknown' && track.surface),
    confidenceTier: track.metadataConfidenceTier ?? null
  }));

  const incompleteTracks = trackCoverageRows.filter((row) => !row.hasCoordinates || !row.hasTimezone || !row.hasLength || !row.hasLayoutProfile);
  for (const row of incompleteTracks) {
    addIssue(issues, 'warn', `tracks.${row.trackId}`, 'Track row is still missing at least one core metadata field after backfill, including known direction where applicable.');
  }

  let sourceVerification = { requested: verifySourceUrls, checked: 0, ok: null, failures: [], results: [] };
  if (verifySourceUrls) {
    const urls = unique(raw.tracks.flatMap((track) => [track.sourceUrl, track.coordinateSourceUrl]));
    const results = await Promise.all(urls.map(verifyUrl));
    sourceVerification = {
      requested: true,
      checked: results.length,
      ok: results.every((result) => result.ok),
      failures: results.filter((result) => !result.ok),
      results
    };
    for (const result of sourceVerification.failures) {
      addIssue(issues, 'warn', `sourceUrls.${result.url}`, `Source URL did not verify live: ${result.statusText}.`);
    }
  }

  const report = {
    checkedAt: retrievedAt,
    ok: issues.every((issue) => issue.severity !== 'error'),
    dryRun,
    verifySourceUrls,
    rawArtifact: rawPath.replace(`${root}/`, ''),
    genericWeatherImported: false,
    preservedWeatherObservationRows: asArray(dataset.weatherObservations).length,
    counts: {
      rawTracks: raw.tracks.length,
      datasetTracksBefore: asArray(dataset.tracks).length,
      datasetTracksAfter: tracks.length,
      tracksUpdated,
      sourceEvidenceUpserted: raw.tracks.length,
      eventTimezonesBackfilled,
      sessionTimezonesBackfilled,
      sessionTimezoneMismatches: sessionTimezoneMismatches.length,
      weatherPreciseWindowReadySessions: readinessCounts.precise_window_ready ?? 0,
      weatherEventDayContextOnlySessions: readinessCounts.event_day_context_only ?? 0,
      weatherBlockedSessions: Object.entries(readinessCounts)
        .filter(([key]) => key.startsWith('blocked_'))
        .reduce((sum, [, count]) => sum + count, 0)
    },
    qualityGates: {
      allImportedTracksHaveMetadataRows: raw.tracks.length === tracks.length,
      allImportedTracksHaveWeatherJoinLocation: trackCoverageRows.every((row) => row.hasCoordinates && row.hasTimezone),
      allImportedTracksHaveLayoutLength: trackCoverageRows.every((row) => row.hasLength),
      allImportedTracksHaveKnownDirection: trackCoverageRows.every((row) => row.hasKnownDirection),
      allImportedTracksHaveFullLayoutProfile: incompleteTracks.length === 0,
      allEventsHaveTimezone: events.every((event) => Boolean(event.timezone)),
      allSessionsHaveTimezone: sessions.every((session) => Boolean(session.timezone)),
      weatherBackfillReadyForPreciseWindowsOnly: (readinessCounts.precise_window_ready ?? 0) > 0,
      noGenericWeatherImported: true
    },
    weatherPrep: {
      readinessCounts,
      preciseWindowReadySample: readinessRows.filter((row) => row.readiness === 'precise_window_ready').slice(0, 12),
      eventDayOnlySample: readinessRows.filter((row) => row.readiness === 'event_day_context_only').slice(0, 12),
      blockedSample: readinessRows.filter((row) => row.readiness.startsWith('blocked_')).slice(0, 12),
      note: 'Do not import generic ambient weather for date-only or missing-start sessions as session-hour weather. Only precise_window_ready rows are candidates for session-hour ambient weather; event_day_context_only rows can support date-level context.'
    },
    trackCoverage: {
      incompleteTracks,
      rows: trackCoverageRows
    },
    sourceVerification,
    issues
  };

  if (!dryRun) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(datasetPath, `${JSON.stringify(updatedDataset, null, 2)}\n`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
