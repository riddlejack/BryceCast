import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const careerDir = join(root, 'data/career');
const reportsDir = join(careerDir, 'reports');
const datasetPath = join(careerDir, 'career.dataset.json');
const validationPath = join(reportsDir, 'validation-report.json');
const manifestPath = join(careerDir, 'sources.manifest.json');
const outputPath = join(reportsDir, 'ingestion-summary.json');

const readJson = async (path, fallback = null) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const collectionCount = (dataset, key) => (Array.isArray(dataset[key]) ? dataset[key].length : 0);

const pct = (numerator, denominator) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

const idSet = (rows, field) => new Set((rows ?? []).map((row) => row[field]).filter(Boolean));

const compactImportReport = (name, report) => ({
  name,
  checkedAt: report.checkedAt ?? null,
  refresh: report.refresh ?? null,
  fetched: report.fetched ?? null,
  cached: report.cached ?? null,
  sessionsImported: report.sessionsImported ?? null,
  resultsImported: report.resultsImported ?? null,
  bryceResultsImported: report.bryceResultsImported ?? null,
  lapSamplesImported: report.lapSamplesImported ?? null,
  weatherObservationsImported: report.weatherObservationsImported ?? null,
  standingsImported: report.standingsImported ?? null,
  gaps: report.gaps ?? [],
});

const main = async () => {
  const [dataset, validation, manifest] = await Promise.all([
    readJson(datasetPath),
    readJson(validationPath, { ok: false, counts: {}, issues: [] }),
    readJson(manifestPath, { workstreams: [] }),
  ]);

  if (!dataset) {
    throw new Error(`Missing canonical dataset at ${datasetPath}`);
  }

  const reportFiles = (await readdir(reportsDir))
    .filter((name) => name.endsWith('-import-report.json'))
    .sort();
  const importReports = [];
  for (const file of reportFiles) {
    const report = await readJson(join(reportsDir, file), null);
    if (report) importReports.push(compactImportReport(file, report));
  }

  const collectionKeys = [
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
    'gaps',
  ];

  const counts = Object.fromEntries(collectionKeys.map((key) => [key, collectionCount(dataset, key)]));
  const sessions = dataset.sessions ?? [];
  const tracks = dataset.tracks ?? [];
  const weather = dataset.weatherObservations ?? [];
  const sourceEvidence = dataset.sourceEvidence ?? [];

  const sessionsWithTimezone = sessions.filter((session) => Boolean(session.timezone)).length;
  const sessionsWithScheduledStart = sessions.filter((session) => Boolean(session.scheduledStart)).length;
  const sessionsWithExactTimestamp = sessions.filter((session) =>
    (typeof session.scheduledStart === 'string' && session.scheduledStart.includes('T')) ||
    (typeof session.actualStart === 'string' && session.actualStart.includes('T')),
  ).length;
  const tracksWithCoordinates = tracks.filter(
    (track) => Number.isFinite(track.latitude) && Number.isFinite(track.longitude),
  ).length;
  const tracksWithTimezone = tracks.filter((track) => Boolean(track.timezone)).length;
  const tracksWithLength = tracks.filter((track) => Number.isFinite(track.lengthKm) || Number.isFinite(track.lengthMi)).length;
  const tracksWithDirection = tracks.filter((track) => track.direction && track.direction !== 'unknown').length;

  const weatherTrackIds = idSet(weather, 'trackId');
  const weatherSessionIds = idSet(weather, 'sessionId');
  const weatherWithTrackTemp = weather.filter((row) => Number.isFinite(row.trackTempC)).length;
  const weatherWithAmbientTemp = weather.filter((row) => Number.isFinite(row.ambientTempC)).length;

  const sourceTypes = {};
  for (const source of sourceEvidence) {
    const key = source.sourceType ?? 'unknown';
    sourceTypes[key] = (sourceTypes[key] ?? 0) + 1;
  }

  const importedWorkstreams = (manifest.workstreams ?? []).map((workstream) => ({
    id: workstream.id,
    label: workstream.label,
    status: workstream.status,
    reliabilityTier: workstream.reliabilityTier,
  }));

  const warningIssues = (validation.issues ?? []).filter((issue) => issue.severity === 'warn');
  const errorIssues = (validation.issues ?? []).filter((issue) => issue.severity === 'error');

  const blockers = [];
  if (sessionsWithTimezone < sessions.length) {
    blockers.push({
      id: 'weather_join_timezone_backfill',
      severity: 'warn',
      affectedRows: sessions.length - sessionsWithTimezone,
      description: 'Precise weather joins are blocked for sessions without timezone metadata.',
    });
  }
  if (tracksWithCoordinates < tracks.length) {
    blockers.push({
      id: 'track_coordinate_backfill',
      severity: 'warn',
      affectedRows: tracks.length - tracksWithCoordinates,
      description: 'Track-level location analytics and weather station distance checks are incomplete until coordinates are sourced.',
    });
  }
  if (tracksWithDirection < tracks.length) {
    blockers.push({
      id: 'track_direction_partial',
      severity: 'warn',
      affectedRows: tracks.length - tracksWithDirection,
      description: 'Layout-direction analytics are partial until every imported track has a sourced clockwise/counterclockwise/bidirectional direction.',
    });
  }
  if (counts.qualifyingResults === 0) {
    blockers.push({
      id: 'qualifying_results_not_normalized',
      severity: 'warn',
      affectedRows: counts.events,
      description: 'Qualifying-to-race analytics remain limited because qualifying rows are not normalized into their dedicated collection yet.',
    });
  }

  const summary = {
    schemaVersion: 'bryce-career-ingestion-summary.v1',
    generatedAt: new Date().toISOString(),
    datasetPath: 'data/career/career.dataset.json',
    validation: {
      ok: Boolean(validation.ok),
      checkedAt: validation.checkedAt ?? null,
      errors: errorIssues,
      warnings: warningIssues,
    },
    counts,
    readiness: {
      sessions: {
        total: sessions.length,
        withScheduledStart: sessionsWithScheduledStart,
        withExactTimestamp: sessionsWithExactTimestamp,
        withTimezone: sessionsWithTimezone,
        timezoneCoverage: pct(sessionsWithTimezone, sessions.length),
      },
      tracks: {
        total: tracks.length,
        withCoordinates: tracksWithCoordinates,
        withTimezone: tracksWithTimezone,
        withLength: tracksWithLength,
        withDirection: tracksWithDirection,
        coordinateCoverage: pct(tracksWithCoordinates, tracks.length),
        timezoneCoverage: pct(tracksWithTimezone, tracks.length),
        lengthCoverage: pct(tracksWithLength, tracks.length),
      },
      weather: {
        observations: weather.length,
        sessionsCovered: weatherSessionIds.size,
        tracksCovered: weatherTrackIds.size,
        withAmbientTemp: weatherWithAmbientTemp,
        withTrackTemp: weatherWithTrackTemp,
        trackTempCoverage: pct(weatherWithTrackTemp, weather.length),
      },
      analyticsSafeNow: [
        'Source-backed result analytics for imported official families: INDY NXT 2024-2026, GB3/BRDC British F3 2021-2022, IMSA Daytona 2025, Euroformula 2023, FROC 2024, FRP F1600 2019, and Formula Ford 2020',
        'IMSA Daytona lap-sample analytics from official Time Cards JSON',
        'Session-hour ambient weather enrichment for the precise-window subset only',
        'Official-source evidence and gap tracking',
      ],
      analyticsBlockedOrPartial: blockers,
    },
    sourceEvidence: {
      total: sourceEvidence.length,
      bySourceType: sourceTypes,
    },
    workstreams: importedWorkstreams,
    importReports,
    openGaps: (dataset.gaps ?? []).filter((gap) => gap.status !== 'closed'),
  };

  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ wrote: outputPath, ok: summary.validation.ok, counts: summary.counts, blockers }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
