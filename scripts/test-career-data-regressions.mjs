import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJsonOrNull = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

const dataset = JSON.parse(await readFile('data/career/career.dataset.json', 'utf8'));
const report = JSON.parse(await readFile('data/career/reports/validation-report.json', 'utf8'));
const ingestionSummary = JSON.parse(await readFile('data/career/reports/ingestion-summary.json', 'utf8'));
const indyNxtImportReport = JSON.parse(await readFile('data/career/reports/indy-nxt-import-report.json', 'utf8'));
const indyNxtReportDetailsBackfill = JSON.parse(await readFile('data/career/reports/indy-nxt-report-details-backfill-report.json', 'utf8'));
const indyNxtSessionWindowBackfill = JSON.parse(await readFile('data/career/reports/indy-nxt-session-window-backfill-report.json', 'utf8'));
const indyNxtWeatherBackfillReport = await readJsonOrNull('data/career/reports/indy-nxt-weather-backfill-report.json');
const indyNxtWeatherStationCrosscheckReport = await readJsonOrNull('data/career/reports/indy-nxt-weather-station-crosscheck-report.json');
const frocImportReport = JSON.parse(await readFile('data/career/reports/froc-2024-import-report.json', 'utf8'));
const sessionWindowBackfillReport = JSON.parse(await readFile('data/career/reports/session-window-backfill-report.json', 'utf8'));
const careerCoverageMatrix = JSON.parse(await readFile('data/career/reports/career-coverage-matrix.json', 'utf8'));
const sourceManifest = JSON.parse(await readFile('data/career/sources.manifest.json', 'utf8'));
const eventsById = new Map(dataset.events.map((row) => [row.id, row]));
const sessionsById = new Map(dataset.sessions.map((row) => [row.id, row]));
const indyNxtEventIds = new Set(dataset.events.filter((row) => row.seriesId === 'series_indy_nxt').map((row) => row.id));

const duplicateIds = (rows) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  }
  return [...duplicates];
};

assert.equal(report.ok, true, 'career validation report must be passing before regression checks');
assert.deepEqual(
  report.errors ?? [],
  [],
  'validation report must expose top-level errors array for direct report readers'
);
assert.deepEqual(
  report.warnings ?? [],
  ingestionSummary.validation?.warnings ?? [],
  'validation report top-level warnings must match ingestion summary warnings'
);
assert.equal(
  report.warningCount,
  (report.warnings ?? []).length,
  'validation report must expose warningCount for direct report readers'
);
assert.equal(
  report.errorCount,
  (report.errors ?? []).length,
  'validation report must expose errorCount for direct report readers'
);
assert.deepEqual(duplicateIds(dataset.sessions), [], 'sessions must not contain duplicate ids');
assert.deepEqual(duplicateIds(dataset.results), [], 'results must not contain duplicate ids');
assert.deepEqual(duplicateIds(dataset.sourceEvidence), [], 'sourceEvidence must not contain duplicate ids');
const indyNxtBryceRaceResults = dataset.results.filter((row) => {
  const session = sessionsById.get(row.sessionId);
  return row.driverId === 'driver_bryce_aron' && session?.sessionType === 'race' && indyNxtEventIds.has(session.eventId);
});
assert.deepEqual(
  [2024, 2025, 2026].map((year) => indyNxtBryceRaceResults.filter((row) => row.sessionId.startsWith(`session_indy_nxt_${year}_`)).length),
  [14, 14, 17],
  'Official schedule plus EventsSessionDetails reconciliation must retain all 45 Bryce INDY NXT race results'
);
assert.deepEqual(
  indyNxtImportReport.seasonReconciliation.map((row) => ({
    year: row.year,
    scheduled: row.scheduledOfficialRaceSessions,
    results: row.eventsSessionDetailsBryceRaceRows,
    driverHistory: row.driverYearDetailsRows,
    standings: row.yearPointSummaryRaceSessionIds,
    missingResults: row.missingBryceResultSessionIds,
    missingStandingsResults: row.standingsSessionsMissingResults
  })),
  [
    { year: 2024, scheduled: 14, results: 14, driverHistory: 14, standings: 14, missingResults: [], missingStandingsResults: [] },
    { year: 2025, scheduled: 14, results: 14, driverHistory: 14, standings: 14, missingResults: [], missingStandingsResults: [] },
    { year: 2026, scheduled: 17, results: 17, driverHistory: 16, standings: 17, missingResults: [], missingStandingsResults: [] }
  ],
  'Season reconciliation must use the official schedule and per-session result rows while preserving driver-history coverage as a cross-check'
);
assert.deepEqual(
  indyNxtImportReport.seasonReconciliation.find((row) => row.year === 2026)?.missingFromDriverYearDetails,
  ['session_indy_nxt_2026_6759'],
  'The official 2026 DriverYearDetails omission of Monterey Race 1 must remain explicit'
);
const indyNxt2026Season = dataset.seasons.find((row) => row.id === 'season_indy_nxt_2026_bryce_aron');
assert.deepEqual(
  {
    championshipPosition: indyNxt2026Season?.championshipPosition,
    points: indyNxt2026Season?.points,
    starts: indyNxt2026Season?.starts,
    bestFinish: indyNxt2026Season?.bestFinish,
    top10: indyNxt2026Season?.top10
  },
  { championshipPosition: 14, points: 298, starts: 17, bestFinish: 6, top10: 8 },
  'The final official 2026 season rollup must reconcile standings and all race results'
);
const late2026Expected = [
  ['6764', 15, 16, 35, 14],
  ['6757', 14, 8, 90, 24],
  ['6759', 7, 6, 35, 28],
  ['6758', 10, 9, 30, 22]
];
for (const [sessionId, start, finish, laps, points] of late2026Expected) {
  const canonicalSessionId = `session_indy_nxt_2026_${sessionId}`;
  const result = indyNxtBryceRaceResults.find((row) => row.sessionId === canonicalSessionId);
  assert.deepEqual(
    [result?.startPosition, result?.finishPosition, result?.lapsCompleted, result?.points],
    [start, finish, laps, points],
    `${canonicalSessionId} must preserve the official Bryce result row`
  );
  assert.ok((result?.provenanceRefs ?? []).includes(`source_indynxt_events_session_${sessionId}`), `${canonicalSessionId} must cite its official EventsSessionDetails source`);
  assert.equal(sessionsById.get(canonicalSessionId)?.ingestionState ?? null, null, `${canonicalSessionId} must no longer remain schedule-only after official result import`);
}
assert.equal(eventsById.get('event_indy_nxt_2026_5547')?.eventEndDate, '2026-08-09', 'Portland 2026 event end date must include the official race day');
assert.equal(
  JSON.stringify(dataset.sourceEvidence).match(/twitter|instagram|facebook|tiktok|youtube|social/i),
  null,
  'canonical source evidence must not collect social media sources'
);
assert.equal(
  JSON.stringify(dataset.mediaAssets).match(/twitter|instagram|facebook|tiktok|youtube|social/i),
  null,
  'canonical media assets must not collect social media sources'
);
assert.equal(
  (sourceManifest.sourcePriority ?? []).includes('social'),
  false,
  'social media must not be a source-priority lane for the production career analytics dataset'
);
assert.equal(careerCoverageMatrix.schemaVersion, 'bryce-career-coverage-matrix.v1', 'coverage matrix report must be generated');
assert.equal(careerCoverageMatrix.series?.length, 7, 'coverage matrix must cover all seven imported production-scope series');
assert.equal(careerCoverageMatrix.seasons?.length, 10, 'coverage matrix must include season-grain coverage rows');
assert.equal(careerCoverageMatrix.sessions?.length, dataset.sessions.length, 'coverage matrix must include session-grain coverage rows');
assert.equal(
  careerCoverageMatrix.sessions?.every((row) => row.categories?.length === careerCoverageMatrix.categoryDefinitions?.length),
  true,
  'every session coverage row must contain every category id for matrix-grade auditing'
);
const coverageMatrixJson = JSON.stringify(careerCoverageMatrix);
assert.equal(
  coverageMatrixJson.includes('[object Object]'),
  false,
  'coverage matrix notes must not leak object coercion artifacts'
);
assert.deepEqual(
  careerCoverageMatrix.series
    .filter((row) => row.seriesId !== 'series_formula_ford')
    .flatMap((row) => row.categories.filter((category) => category.id === 'lap_samples'))
    .filter((category) => String(category.notes ?? '').includes('Formula Ford'))
    .map((category) => category.notes),
  [],
  'coverage matrix lap-sample notes must not describe non-Formula Ford series as Formula Ford rows'
);
const indyCoverage = careerCoverageMatrix.series.find((row) => row.seriesId === 'series_indy_nxt');
assert.equal(
  indyCoverage?.categories.find((row) => row.id === 'race_results')?.status,
  'complete',
  'INDY NXT completed race result sessions should be complete after excluding future schedule-only rows'
);
assert.equal(
  indyCoverage?.categories.find((row) => row.id === 'qualifying_classifications')?.status,
  'complete',
  'INDY NXT qualifying classifications should be complete after excluding official canceled qualifying sessions and future schedule-only rows'
);
assert.deepEqual(
  careerCoverageMatrix.canceledSessionEvidence?.map((row) => row.sessionId).sort(),
  ['session_indy_nxt_2024_6489', 'session_indy_nxt_2025_6596'],
  'coverage matrix must preserve official evidence for canceled INDY NXT qualifying sessions excluded from classification completeness'
);
assert.equal(
  indyCoverage?.categories.find((row) => row.id === 'pit_stop_counts')?.status,
  'complete',
  'INDY NXT official pit-stop count coverage should remain complete across race result rows'
);
assert.equal(
  indyCoverage?.categories.find((row) => row.id === 'official_weather_conditions')?.status,
  'unavailable',
  'INDY NXT non-official ambient weather enrichment must not be counted as official weather/track conditions'
);
assert.equal(
  indyCoverage?.categories.find((row) => row.id === 'official_weather_conditions')?.covered,
  0,
  'INDY NXT official weather/track-condition coverage must stay zero unless official series reports expose it'
);
assert.equal(
  indyCoverage?.categories.find((row) => row.id === 'detailed_pit_context')?.status,
  'unavailable',
  'INDY NXT detailed pit context must be source-limited unless official reports expose a detailed pit-summary or pit-lane sequence'
);
assert.equal(
  indyCoverage?.priorityGaps?.includes('detailed_pit_context'),
  false,
  'INDY NXT detailed pit context must not remain a priority importer gap when the official report family lacks detailed pit-sequence rows'
);
assert.equal(
  indyCoverage?.sourceFamilyPriorityExclusions?.detailed_pit_context?.includes('no dedicated pit-summary'),
  true,
  'INDY NXT detailed pit context must document the source-family limitation'
);
const indyExactWindowCoverage = indyCoverage?.categories.find((row) => row.id === 'exact_session_windows');
const indyNxtPhysicalSessions = dataset.sessions.filter((row) => indyNxtEventIds.has(row.eventId));
const indyNxtExactWindowSessions = indyNxtPhysicalSessions.filter((row) =>
  [row.actualStart, row.scheduledStart].some((value) => typeof value === 'string' && value.includes('T')));
assert.equal(indyExactWindowCoverage?.covered, indyNxtExactWindowSessions.length, 'INDY NXT exact-window coverage must equal canonical sessions with sourced clock-time starts');
assert.equal(indyExactWindowCoverage?.total, indyNxtPhysicalSessions.length, 'INDY NXT exact-window coverage must use every canonical physical session as its denominator');
assert.match(
  indyExactWindowCoverage?.notes ?? '',
  new RegExp(`${indyNxtPhysicalSessions.length - indyNxtExactWindowSessions.length} sessions are source-unavailable exact windows`),
  'INDY NXT exact-window notes must account for all remaining source-reviewed date-only sessions'
);
assert.equal(
  indyCoverage?.priorityGaps?.includes('exact_session_windows'),
  false,
  'INDY NXT exact session windows must not remain a priority importer gap after official source review proves the remaining rows are source-unavailable'
);
assert.equal(
  indyCoverage?.sourceFamilyPriorityExclusions?.exact_session_windows?.includes('coarse qualifying'),
  true,
  'INDY NXT exact-window priority exclusion must document the coarse qualifying source limitation'
);
const indySectionCoverage = indyCoverage?.categories.find((row) => row.id === 'indy_section_data');
assert.equal(indySectionCoverage?.status, 'partial', 'INDY NXT section data must remain partial until the true malformed Section Results PDF gap is resolved');
assert.equal(indySectionCoverage?.total - indySectionCoverage?.covered, 1, 'INDY NXT section-data coverage must leave only the single proven corrupt official report');
assert.match(
  indySectionCoverage?.notes ?? '',
  /session_indy_nxt_2024_6325 \(official_pdf_corrupt_or_truncated\)/,
  'INDY NXT section-data notes must identify the true corrupt official Section Results report'
);
assert.equal(
  indyCoverage?.priorityGaps?.includes('indy_section_data'),
  false,
  'INDY NXT section data must not remain an active importer priority gap when the only comparable holdout is an official corrupt/truncated PDF'
);
assert.equal(
  indyCoverage?.sourceFamilyPriorityExclusions?.indy_section_data?.includes('session_indy_nxt_2024_6325'),
  true,
  'INDY NXT section-data priority exclusion must document the official corrupt/truncated Section Results holdout'
);
const indyLapSamplesCoverage = indyCoverage?.categories.find((row) => row.id === 'lap_samples');
assert.equal(
  indyLapSamplesCoverage?.status,
  'partial',
  'INDY NXT lap samples must remain partial while residual Race Lap Chart cells are explicit missing/conflict diagnostics'
);
assert.equal(
  indyCoverage?.priorityGaps?.includes('lap_samples'),
  false,
  'INDY NXT lap samples must not remain an active priority gap after all official Race Lap Chart PDFs are imported and residual cells require guessing'
);
assert.equal(
  indyCoverage?.sourceFamilyPriorityExclusions?.lap_samples?.includes(`${indyNxtReportDetailsBackfill.lapChartsPartiallyParsed} clean partial`),
  true,
  'INDY NXT lap-sample priority exclusion must document the residual clean partial Race Lap Chart imports'
);
assert.equal(
  indyCoverage?.sourceFamilyPriorityExclusions?.lap_samples?.includes('without guessing terminal'),
  true,
  'INDY NXT lap-sample priority exclusion must reject inferred terminal/conflict laps'
);
assert.equal(
  careerCoverageMatrix.globalPriority?.some((row) => row.id === 'audit_and_patch_indy_nxt_detail_categories'),
  false,
  'Coverage global priorities must not keep INDY NXT detail patching as active work after source-bounded detail gaps are excluded'
);
assert.equal(
  careerCoverageMatrix.globalPriority?.find((row) => row.seriesId === 'series_indy_nxt')?.id,
  'publish_indy_nxt_dashboard_readiness',
  'Coverage global priorities should promote the INDY NXT dashboard-readiness handoff once active source-backed detail blockers are closed'
);
assert.match(
  dataset.gaps.find((row) => row.id === 'gap_indy_nxt_qualifying_lap_reports')?.description ?? '',
  /session_indy_nxt_2024_6325.*official Section Results PDF.*corrupt/i,
  'INDY NXT canonical gap must preserve the true corrupt official Section Results PDF holdout'
);
assert.match(
  dataset.gaps.find((row) => row.id === 'gap_indy_nxt_qualifying_lap_reports')?.description ?? '',
  new RegExp(`${indyNxtReportDetailsBackfill.lapChartsPartiallyParsed} clean partial Race Lap Chart PDFs`, 'i'),
  'INDY NXT canonical gap must describe the remaining lap-chart partials precisely'
);
assert.equal(
  /Pit summaries.*remain open/i.test(dataset.gaps.find((row) => row.id === 'gap_indy_nxt_qualifying_lap_reports')?.description ?? ''),
  false,
  'INDY NXT canonical gap must not keep detailed pit context open after source-family exclusion marks it unavailable'
);
assert.equal(
  /\[object Object\]/.test(careerCoverageMatrix.seasons.find((row) => row.seriesId === 'series_indy_nxt' && row.year === 2024)?.categories.find((row) => row.id === 'indy_section_data')?.notes ?? ''),
  false,
  'INDY NXT season-level section-data notes must render readable counts, not object serialization'
);
const indyNxtWeatherRows = dataset.weatherObservations.filter((row) => eventsById.get(sessionsById.get(row.sessionId)?.eventId)?.seriesId === 'series_indy_nxt');
const indyNxtExactSessions = dataset.sessions.filter((session) => {
  const event = eventsById.get(session.eventId);
  const start = session.actualStart ?? session.scheduledStart;
  return event?.seriesId === 'series_indy_nxt' && typeof start === 'string' && start.includes('T');
});
assert.ok(indyNxtWeatherBackfillReport, 'INDY NXT weather backfill report must exist');
const indyNxtWeatherArchiveCutoffDate = indyNxtWeatherBackfillReport?.archiveCutoffDate ?? '1900-01-01';
const indyNxtWeatherEligibleSessions = indyNxtExactSessions.filter((session) =>
  String(session.actualStart ?? session.scheduledStart).slice(0, 10) <= indyNxtWeatherArchiveCutoffDate
);
const indyNxtWeatherEligibleByType = indyNxtWeatherEligibleSessions.reduce((counts, session) => {
  counts[session.sessionType] = (counts[session.sessionType] ?? 0) + 1;
  return counts;
}, {});
assert.equal(indyNxtWeatherBackfillReport?.source, 'open_meteo_historical_archive', 'INDY NXT weather report must identify Open-Meteo archive source');
assert.equal(
  indyNxtWeatherBackfillReport?.joinedSessions,
  indyNxtWeatherEligibleSessions.length,
  'INDY NXT weather backfill must join every exact-window session at or before the archive cutoff date'
);
assert.deepEqual(
  indyNxtWeatherBackfillReport?.joinedBySessionType,
  indyNxtWeatherEligibleByType,
  'INDY NXT weather report must preserve race-first scope while also joining archive-eligible exact-window practice and qualifying sessions'
);
assert.equal(indyNxtWeatherBackfillReport?.skippedDateOnlySessions, 78, 'INDY NXT weather backfill must skip the 78 date-only sessions');
assert.equal(
  indyNxtWeatherBackfillReport?.skippedFutureSessions,
  indyNxtExactSessions.length - indyNxtWeatherEligibleSessions.length,
  'INDY NXT weather report must preserve future exact-window sessions as skipped rather than fabricating historical weather'
);
assert.equal(indyNxtWeatherRows.length, indyNxtWeatherEligibleSessions.length, 'INDY NXT weather rows must exist exactly for archive-eligible source-backed exact-window sessions');
assert.equal(
  indyNxtWeatherRows.some((row) => row.confidence === 'official' || row.weatherSourceType === 'series_report'),
  false,
  'INDY NXT ambient weather enrichment must never be marked official or series_report'
);
assert.deepEqual(
  indyNxtWeatherRows
    .filter((row) => !row.provenanceRefs?.length || !row.source || !row.weatherSourceType || !row.timeConfidence || !row.locationConfidence)
    .map((row) => row.id),
  [],
  'Every INDY NXT weather row must include source, source type, time/location confidence, and provenance'
);
assert.deepEqual(
  indyNxtWeatherRows
    .filter((row) => !sessionsById.get(row.sessionId)?.actualStart && !sessionsById.get(row.sessionId)?.scheduledStart?.includes('T'))
    .map((row) => row.sessionId),
  [],
  'INDY NXT weather backfill must not assign hour-level rows to date-only sessions'
);
assert.deepEqual(
  indyNxtWeatherRows
    .filter((row) => row.trackTempC != null || row.trackTempSource === 'weather_api_surface_model')
    .map((row) => row.id),
  [],
  'INDY NXT weather backfill must keep trackTempC null and avoid treating soil temperature as track temperature'
);
assert.ok(indyNxtWeatherStationCrosscheckReport, 'INDY NXT weather station cross-check report must exist');
assert.equal(
  indyNxtWeatherStationCrosscheckReport?.source,
  'noaa_ncei_ghcnh',
  'INDY NXT station cross-check must use NOAA/NCEI GHCNh as the no-auth official station-observation route'
);
assert.ok(
  indyNxtWeatherStationCrosscheckReport?.samplesMatched >= 5,
  'INDY NXT station cross-check must match at least five representative exact-window sessions'
);
assert.equal(
  indyNxtWeatherStationCrosscheckReport?.samplesMatched,
  indyNxtWeatherStationCrosscheckReport?.samples?.length,
  'INDY NXT station cross-check report must expose every matched sample'
);
assert.deepEqual(
  indyNxtWeatherStationCrosscheckReport?.samples?.filter((sample) =>
    !sample.station?.id ||
    typeof sample.station?.distanceFromTrackKm !== 'number' ||
    !sample.stationObservation?.observedAtUtc
  ).map((sample) => sample.sessionId),
  [],
  'Every station cross-check sample must include station identity, station distance, and matched observation timestamp'
);
assert.deepEqual(
  indyNxtWeatherRows
    .filter((row) => row.confidence === 'observed_nearby_high' || row.confidence === 'modeled_high')
    .map((row) => row.id),
  [],
  'Representative station cross-checks must not upgrade canonical INDY NXT weather confidence until a systematic row-level cross-check exists'
);
const coverageCategoryForSession = (sessionId, categoryId) =>
  careerCoverageMatrix.sessions
    .find((row) => row.sessionId === sessionId)
    ?.categories.find((row) => row.id === categoryId);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6314', 'lap_samples')?.status,
  'partial',
  'INDY NXT race sessions should remain applicable for lap-chart sample coverage'
);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6314', 'detailed_pit_context')?.status,
  'unavailable',
  'INDY NXT race sessions must not be treated as missing detailed pit-context rows without a source-exposed detailed pit report'
);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6328', 'lap_samples')?.status,
  'out_of_scope',
  'INDY NXT practice sessions must not be treated as missing race lap-chart samples'
);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6330', 'detailed_pit_context')?.status,
  'unavailable',
  'INDY NXT non-race sessions should inherit the source-family detailed pit-context limitation'
);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6330', 'indy_section_data')?.status,
  'complete',
  'INDY NXT qualifying sessions can still be applicable for official section-data reports'
);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6325', 'indy_section_data')?.status,
  'partial',
  'INDY NXT IMS Race 2 section data must remain a partial true held-out because the official Section Results PDF is corrupt'
);
assert.equal(
  coverageCategoryForSession('session_indy_nxt_2024_6536', 'indy_section_data')?.status,
  'unavailable',
  'INDY NXT combined qualifying aggregate rows must not be treated as missing section-data imports'
);
const frocCoverage = careerCoverageMatrix.series.find((row) => row.seriesId === 'series_froc');
const froc2024Coverage = careerCoverageMatrix.seasons.find((row) => row.seriesId === 'series_froc' && row.year === 2024);
assert.deepEqual(
  frocCoverage?.priorityGaps,
  [],
  'FROC source-unavailable exact test windows and Race 2 tail grids must not remain priority import gaps'
);
assert.deepEqual(
  froc2024Coverage?.priorityGaps,
  [],
  'FROC season matrix must apply the same source-unavailable exclusions as the series matrix'
);
assert.equal(
  frocCoverage?.sourceFamilyPriorityExclusions?.exact_session_windows?.includes('remaining nine test sessions'),
  true,
  'FROC exact-window coverage must document why unsourced test sessions are not a priority patch target'
);
assert.equal(
  frocCoverage?.sourceFamilyPriorityExclusions?.grid_start_positions?.includes('Race 2 tail rows'),
  true,
  'FROC grid coverage must document why source-unavailable Race 2 tail rows are not a priority patch target'
);
assert.equal(
  sessionWindowBackfillReport.unsourcedFrocTestSessions?.length,
  9,
  'FROC session-window backfill report must preserve the nine official-source-unavailable test sessions'
);
assert.equal(
  coverageCategoryForSession('session_froc_2024_r1_test_1', 'exact_session_windows')?.status,
  'unavailable',
  'FROC test sessions with only date-level official article context should be unavailable for exact session-window coverage'
);
assert.equal(
  coverageCategoryForSession('session_froc_2024_r2_test_1', 'exact_session_windows')?.status,
  'complete',
  'FROC Round 2 test sessions with official timing PDFs should remain exact-window complete'
);
const frpCoverage = careerCoverageMatrix.series.find((row) => row.seriesId === 'series_frp_f1600');
const formulaFordCoverage = careerCoverageMatrix.series.find((row) => row.seriesId === 'series_formula_ford');
const frp2019Coverage = careerCoverageMatrix.seasons.find((row) => row.seriesId === 'series_frp_f1600' && row.year === 2019);
const formulaFord2020Coverage = careerCoverageMatrix.seasons.find((row) => row.seriesId === 'series_formula_ford' && row.year === 2020);
assert.deepEqual(
  frpCoverage?.priorityGaps,
  [],
  'FRP F1600 explicit penalty announcements must not be promoted into a missing no-penalty ledger gap'
);
assert.deepEqual(
  frp2019Coverage?.priorityGaps,
  [],
  'FRP F1600 season matrix must apply the same no-penalty ledger exclusion as the series matrix'
);
assert.equal(
  frpCoverage?.categories.find((row) => row.id === 'penalties_decisions')?.status,
  'partial',
  'FRP F1600 should preserve explicit source-backed penalty announcements as partial event-record coverage'
);
assert.equal(
  frpCoverage?.sourceFamilyPriorityExclusions?.penalties_decisions?.includes('no complete official no-penalty decisions ledger'),
  true,
  'FRP F1600 penalty coverage must document why absent penalty rows are not a priority gap'
);
{
  const frpPittsburghQualifyingGap = dataset.gaps.find((row) => row.id === 'gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch');
  assert.equal(
    frpPittsburghQualifyingGap?.raw?.linkedPdfUrl,
    'https://cdn.prod.website-files.com/5e6065f5b2e7eb0f83419949/6095518398870138f8bf4afb_F16_Q1_FOR_R1.pdf',
    'FRP Pittsburgh qualifying mismatch gap must preserve the exact official archive PDF URL that points to Summit Point'
  );
  assert.equal(
    frpPittsburghQualifyingGap?.raw?.expectedEvent,
    'Pittsburgh International Race Complex',
    'FRP Pittsburgh qualifying mismatch gap must preserve the expected event'
  );
  assert.match(
    frpPittsburghQualifyingGap?.description ?? '',
    /correct Pittsburgh qualifying PDF was not found on the official archive route/i,
    'FRP Pittsburgh qualifying mismatch gap must state that the official archive route did not expose a correct Pittsburgh qualifying PDF'
  );
}
assert.deepEqual(
  formulaFordCoverage?.priorityGaps,
  ['lap_samples'],
  'Formula Ford priority gaps should focus on source-backed lap-sample continuation work after grid/start source-asymmetry rows are explicitly held out'
);
assert.deepEqual(
  formulaFord2020Coverage?.priorityGaps,
  ['lap_samples'],
  'Formula Ford season matrix must apply the same grid/source-asymmetry and no-penalty exclusions as the series matrix'
);
assert.equal(
  formulaFordCoverage?.sourceFamilyPriorityExclusions?.grid_start_positions?.includes('remaining seven'),
  true,
  'Formula Ford grid/start coverage must document why the remaining held-out rows are no longer active importer priority gaps'
);
assert.equal(
  formulaFordCoverage?.openGapIds?.includes('gap_formula_ford_2020_grid_start_source_asymmetry_holdouts'),
  true,
  'Formula Ford coverage matrix must associate the explicit grid/start holdout gap with the Formula Ford series'
);
assert.equal(
  careerCoverageMatrix.globalPriority?.find((row) => row.seriesId === 'series_formula_ford')?.id,
  'harden_formula_ford_lap_sample_scope',
  'Coverage global priorities must not keep stale Formula Ford grid diagnostic wording after grid/start is source-held-out'
);
assert.equal(
  formulaFordCoverage?.categories.find((row) => row.id === 'penalties_decisions')?.status,
  'partial',
  'Formula Ford should preserve explicit source-backed penalty notes as partial event-record coverage'
);
assert.equal(
  formulaFordCoverage?.sourceFamilyPriorityExclusions?.penalties_decisions?.includes('no complete official no-penalty decisions ledger'),
  true,
  'Formula Ford penalty coverage must document why absent penalty rows are not a priority gap'
);

assert.ok(
  dataset.seasons.some((row) => row.id === 'season_gb3_2021_bryce_aron'),
  'GB3 2021 Bryce season must be imported'
);
assert.ok(
  dataset.sessions.some((row) => row.id.startsWith('session_gb3_2021_')),
  'GB3 2021 sessions must be imported'
);
assert.ok(
  dataset.results.some((row) => row.id.startsWith('result_gb3_2021_') && row.driverId === 'driver_bryce_aron'),
  'GB3 2021 Bryce results must be imported'
);

const gb32021Season = dataset.seasons.find((row) => row.id === 'season_gb3_2021_bryce_aron');
assert.equal(gb32021Season?.championshipPosition, 12, 'GB3 2021 Bryce season must include official championship position');
assert.equal(gb32021Season?.points, 238, 'GB3 2021 Bryce season must include official championship points');
assert.ok(
  (gb32021Season?.provenanceRefs ?? []).includes('source_gb3_2021_official_championship_standings_archive'),
  'GB3 2021 season standings fields must cite official archived GB3 standings provenance'
);
assert.equal(
  dataset.gaps.some((row) => row.id === 'gap_gb3_2021_championship_points_not_officially_recovered'),
  false,
  'GB3 2021 championship points gap must close after official standings import'
);
assert.equal(
  dataset.gaps.some((row) => /GB3 2021 session\/result PDFs are imported/.test(row.description ?? '')),
  false,
  'GB3 2021 must not retain the old broad import gap after official session/result import'
);
const gb32021FormatSource = dataset.sourceEvidence.find((row) => row.id === 'source_gb3_event_format_and_costs');
assert.equal(gb32021FormatSource?.confidenceTier, 'official', 'GB3 race-grid derivation must cite the official GB3 event-format source');
const gb32021RaceRows = dataset.results.filter((row) => {
  if (!row.id.startsWith('result_gb3_2021_')) return false;
  const session = dataset.sessions.find((candidate) => candidate.id === row.sessionId);
  return session?.sessionType === 'race';
});
assert.equal(gb32021RaceRows.length, 369, 'GB3 2021 race result coverage must stay at 369 official TSL rows');
assert.deepEqual(
  gb32021RaceRows.filter((row) => row.gridPosition === null || row.startPosition === null).map((row) => row.id),
  [],
  'GB3 2021 race starts must import from official TSL grid PDFs'
);
const gb3SeriesCoverage = careerCoverageMatrix.series.find((row) => row.seriesId === 'series_gb3');
assert.deepEqual(
  gb3SeriesCoverage?.priorityGaps,
  [],
  'GB3 source-family detail asymmetry must not be promoted as a priority gap once 2021 PDF and 2022 JSON coverage are classified separately'
);
assert.equal(
  gb3SeriesCoverage?.openGapIds?.includes('gap_gb3_2022_session_1248_missing_json'),
  true,
  'GB3 coverage must still preserve the official 2022 session 1248 JSON 404 gap'
);
const gb32021Coverage = careerCoverageMatrix.seasons.find((row) => row.seriesId === 'series_gb3' && row.year === 2021);
const gb32022Coverage = careerCoverageMatrix.seasons.find((row) => row.seriesId === 'series_gb3' && row.year === 2022);
assert.equal(
  gb32021Coverage?.categories.find((row) => row.id === 'grid_start_positions')?.status,
  'complete',
  'GB3 2021 official TSL grid/start coverage must stay complete at season grain'
);
assert.equal(
  gb32021Coverage?.categories.find((row) => row.id === 'official_weather_conditions')?.status,
  'complete',
  'GB3 2021 official TSL weather coverage must stay complete at season grain'
);
assert.equal(
  gb32021Coverage?.categories.find((row) => row.id === 'pit_stop_counts')?.status,
  'unavailable',
  'GB3 2021 TSL PDFs should mark pit-stop count fields unavailable, not blocked'
);
assert.equal(
  gb32022Coverage?.categories.find((row) => row.id === 'grid_start_positions')?.status,
  'unavailable',
  'GB3 2022 official JSON should mark grid/start fields unavailable, not blocked'
);
assert.equal(
  gb32022Coverage?.categories.find((row) => row.id === 'official_weather_conditions')?.status,
  'unavailable',
  'GB3 2022 official JSON should mark official weather fields unavailable, not blocked'
);
assert.equal(
  gb32022Coverage?.categories.find((row) => row.id === 'pit_stop_counts')?.status,
  'complete',
  'GB3 2022 official JSON pit-stop count coverage must stay complete'
);
assert.equal(
  careerCoverageMatrix.sessions
    .find((row) => row.sessionId === 'session_gb3_2021_212005_race_1_result')
    ?.categories.find((row) => row.id === 'pit_stop_counts')?.status,
  'unavailable',
  'GB3 2021 session rows should inherit the season/source-family pit-stop unavailable classification'
);
assert.equal(
  dataset.sourceEvidence.some((row) => row.id === 'source_gb3_2021_212005_gr3_bf3_pdf' && row.confidenceTier === 'official'),
  true,
  'GB3 2021 Brands Hatch Race 3 grid PDF source evidence must be imported'
);
const gb32021BrandsRace1Bryce = dataset.results.find((row) => row.id === 'result_gb3_2021_212005_rc1_driver_bryce_aron');
assert.equal(gb32021BrandsRace1Bryce?.startPosition, 12, 'GB3 2021 Brands Hatch Race 1 Bryce start must import from the official grid PDF');
assert.equal(gb32021BrandsRace1Bryce?.gridPosition, 12, 'GB3 2021 Brands Hatch Race 1 Bryce grid must import from the official grid PDF');
assert.equal(
  gb32021BrandsRace1Bryce?.raw?.gridEvidence?.source,
  'official_tsl_grid_pdf',
  'GB3 2021 Race 1 grid evidence must identify the official TSL grid PDF'
);
assert.ok((gb32021BrandsRace1Bryce?.provenanceRefs ?? []).includes('source_gb3_2021_212005_grd_bf3_pdf'), 'GB3 2021 Race 1 grid must cite official Grid for Race 1 PDF provenance');
const gb32021BrandsRace2Bryce = dataset.results.find((row) => row.id === 'result_gb3_2021_212005_rc2_driver_bryce_aron');
assert.equal(gb32021BrandsRace2Bryce?.startPosition, 11, 'GB3 2021 Brands Hatch Race 2 Bryce start must import the penalty-adjusted official grid PDF position');
assert.equal(gb32021BrandsRace2Bryce?.gridPosition, 11, 'GB3 2021 Brands Hatch Race 2 Bryce grid must import the penalty-adjusted official grid PDF position');
assert.ok((gb32021BrandsRace2Bryce?.provenanceRefs ?? []).includes('source_gb3_2021_212005_gr2_bf3_pdf'), 'GB3 2021 Race 2 grid must cite official Grid for Race 2 PDF provenance');
const gb32021BrandsRace3Bryce = dataset.results.find((row) => row.id === 'result_gb3_2021_212005_rc3_driver_bryce_aron');
assert.equal(gb32021BrandsRace3Bryce?.startPosition, 8, 'GB3 2021 Brands Hatch Race 3 Bryce start must import the official reverse-grid PDF position');
assert.equal(gb32021BrandsRace3Bryce?.gridPosition, 8, 'GB3 2021 Brands Hatch Race 3 Bryce grid must import the official reverse-grid PDF position');
assert.ok((gb32021BrandsRace3Bryce?.provenanceRefs ?? []).includes('source_gb3_2021_212005_gr3_bf3_pdf'), 'GB3 2021 Race 3 grid must cite official Grid for Race 3 PDF provenance');
assert.equal(dataset.gaps.some((row) => row.id === 'gap_gb3_2021_race_3_start_positions_not_source_backed'), false, 'GB3 2021 Race 3 start-position gap must close after official grid PDF import');
const gb32022ManifestOnlySession = dataset.sessions.find((row) => row.id === 'session_gb3_2022_1248');
assert.equal(gb32022ManifestOnlySession?.sessionName, 'Friday session 2', 'GB3 2022 manifest-only session 1248 must retain the official session label');
assert.equal(gb32022ManifestOnlySession?.scheduledStart, '2022-05-27T14:45:00', 'GB3 2022 manifest-only session 1248 must retain the official manifest start time');
assert.equal(gb32022ManifestOnlySession?.sessionType, 'practice', 'GB3 2022 manifest-only session 1248 must normalize as practice from the official manifest');
assert.equal(gb32022ManifestOnlySession?.ingestionState, 'official_manifest_only', 'GB3 2022 session 1248 must be explicit that row-level JSON is unavailable');
assert.equal(
  dataset.results.some((row) => row.sessionId === 'session_gb3_2022_1248'),
  false,
  'GB3 2022 manifest-only session 1248 must not fabricate result rows while the official session JSON 404s'
);
assert.ok(
  (gb32022ManifestOnlySession?.provenanceRefs ?? []).includes('source_gb3_2022_rounds'),
  'GB3 2022 manifest-only session 1248 must cite official rounds JSON provenance'
);
assert.match(
  dataset.gaps.find((row) => row.id === 'gap_gb3_2022_session_1248_missing_json')?.description ?? '',
  /session entity is retained from the official manifest/i,
  'GB3 2022 session 1248 gap must distinguish retained session metadata from missing row-level JSON'
);
{
  const gb31248Gap = dataset.gaps.find((row) => row.id === 'gap_gb3_2022_session_1248_missing_json');
  assert.equal(
    gb31248Gap?.raw?.officialJsonUrl,
    'https://www.gb-3.net/json/results/2022/1248.json',
    'GB3 2022 session 1248 gap must preserve the official JSON URL that 404s'
  );
  assert.equal(
    gb31248Gap?.raw?.renderedResultsPageUrl,
    'https://www.gb-3.net/results?round=R3&session=1248&year=2022',
    'GB3 2022 session 1248 gap must preserve the official rendered results route checked as an alternate artifact'
  );
  assert.match(
    gb31248Gap?.description ?? '',
    /rendered official results page did not expose row-level table data/i,
    'GB3 2022 session 1248 gap must record that the official rendered page did not clear the row-level 404'
  );
}

const euroformulaBryceRaceResults = dataset.results.filter((row) =>
  row.id.startsWith('result_euroformula_2023_') &&
  row.driverId === 'driver_bryce_aron' &&
  dataset.sessions.find((session) => session.id === row.sessionId)?.sessionType === 'race'
);
const euroformula2023Season = dataset.seasons.find((row) => row.id === 'season_euroformula_open_2023_bryce_aron');
assert.equal(euroformula2023Season?.championshipPosition, 4, 'Euroformula 2023 Bryce season must include official championship position');
assert.equal(euroformula2023Season?.points, 238, 'Euroformula 2023 Bryce season must include official championship points');
assert.ok(
  (euroformula2023Season?.provenanceRefs ?? []).includes('source_euroformula_2023_rfeda_final_classifications_pdf'),
  'Euroformula 2023 standings fields must cite official RFEDA final-classifications provenance'
);
assert.equal(
  dataset.gaps.some((row) => row.id === 'gap_euroformula_2023_points_and_standings_not_officially_recovered'),
  false,
  'Euroformula 2023 points gap must close after official standings recovery'
);
{
  const euroformulaMutableSourceGap = dataset.gaps.find((row) => row.id === 'gap_euroformula_2023_championship_classification_pdf_current_mismatch');
  assert.equal(
    euroformulaMutableSourceGap?.status,
    'source_broken_preserved',
    'Euroformula mutable classification PDF mismatch should be preserved as source-broken evidence, not an unresolved standings fact'
  );
  assert.match(
    euroformulaMutableSourceGap?.description ?? '',
    /RFEDA 2023 final classifications PDF is the stable official standings source/i,
    'Euroformula mutable classification gap must point to the stable RFEDA source used for P4 and 238 points'
  );
}
assert.equal(euroformulaBryceRaceResults.length, 18, 'Euroformula 2023 Bryce race-result coverage should remain 18 official race rows');
assert.deepEqual(
  euroformulaBryceRaceResults.filter((row) => row.gridPosition === null || row.startPosition === null).map((row) => row.sessionId),
  [],
  'Euroformula 2023 Bryce race rows must import official grid/start positions from PDF position charts'
);
assert.equal(
  euroformulaBryceRaceResults.find((row) => row.sessionId === 'session_euroformula_2023_01-portimao-race-1')?.gridPosition,
  5,
  'Euroformula Portimao Race 1 Bryce grid position should parse from the official chart'
);
assert.equal(
  euroformulaBryceRaceResults.find((row) => row.sessionId === 'session_euroformula_2023_02-spa_francorchamps-race-2')?.gridPosition,
  4,
  'Euroformula Spa Race 2 Bryce grid position should parse from the official chart'
);
assert.equal(
  dataset.gaps.some((row) => row.id === 'gap_euroformula_2023_starting_grid_not_normalized'),
  false,
  'Euroformula starting-grid gap must close after official chart import'
);

const euroformulaPdfTimingWindows = [
  ['session_euroformula_2023_01-portimao-qualifying', '2023-04-29T10:35:00', 'Europe/Lisbon'],
  ['session_euroformula_2023_01-portimao-race-1', '2023-04-29T15:34:02', 'Europe/Lisbon'],
  ['session_euroformula_2023_07-barcelona-qualifying', '2023-10-21T11:00:00', 'Europe/Madrid'],
  ['session_euroformula_2023_07-barcelona-race-3', '2023-10-22T17:27:55', 'Europe/Madrid']
];
for (const [sessionId, actualStart, timezone] of euroformulaPdfTimingWindows) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.actualStart, actualStart, `${sessionId} must derive actualStart from official PDF Time of Day minus Session Time rows`);
  assert.equal(session?.timezone, timezone, `${sessionId} must preserve event-local timezone for weather joins`);
  assert.equal(session?.timePrecision, 'local_datetime', `${sessionId} must mark PDF-derived timing as local datetime precision`);
  assert.equal(session?.timeSource, 'official_cronococa_pdf_time_of_day_minus_session_time', `${sessionId} must identify the official PDF timing derivation`);
  assert.ok(session?.raw?.sessionStartInference?.sampleCount > 0, `${sessionId} must preserve inference sample count in raw metadata`);
  assert.equal(session?.raw?.sessionStartInference?.uniqueStartCount, 1, `${sessionId} must have one internally consistent inferred start`);
}
assert.equal(
  dataset.sessions
    .filter((row) => String(row.id).startsWith('session_euroformula_2023_'))
    .filter((row) => row.timeSource === 'official_cronococa_pdf_time_of_day_minus_session_time')
    .length,
  28,
  'all 28 Euroformula 2023 sessions must carry official PDF-derived actualStart windows'
);
const expectedExactTimestampSessions = dataset.sessions.filter((row) =>
  (typeof row.scheduledStart === 'string' && row.scheduledStart.includes('T')) ||
  (typeof row.actualStart === 'string' && row.actualStart.includes('T'))
).length;
assert.equal(
  ingestionSummary.readiness.sessions.withExactTimestamp,
  expectedExactTimestampSessions,
  'ingestion summary exact-timestamp readiness must count scheduledStart and actualStart windows'
);

const missingStart = dataset.sessions.filter((row) => !row.scheduledStart && !row.actualStart);
assert.ok(missingStart.length < 53, `session-window backfill should reduce missing starts below 53; got ${missingStart.length}`);
const expectedUnsourcedFrocTestSessions = [
  'session_froc_2024_r1_test_1',
  'session_froc_2024_r1_test_2',
  'session_froc_2024_r1_test_3',
  'session_froc_2024_r3_test_1',
  'session_froc_2024_r3_test_2',
  'session_froc_2024_r4_test_1',
  'session_froc_2024_r4_test_2',
  'session_froc_2024_r5_test_1',
  'session_froc_2024_r5_test_2'
];
assert.deepEqual(
  sessionWindowBackfillReport.unsourcedFrocTestSessions?.map((row) => row.sessionId),
  expectedUnsourcedFrocTestSessions,
  'FROC session-window report must list the exact test rows still blocked by missing official timing PDFs'
);
assert.deepEqual(
  missingStart
    .filter((row) => row.id.startsWith('session_froc_2024_'))
    .map((row) => row.id)
    .sort(),
  expectedUnsourcedFrocTestSessions,
  'remaining FROC missing starts must be only the known unsourced test sessions'
);

const frocRound2TestWindows = [
  ['session_froc_2024_r2_test_1', '2024-01-24T12:40:00', '2024-01-24T12:40:37'],
  ['session_froc_2024_r2_test_2', '2024-01-24T16:20:00', '2024-01-24T16:22:00']
];
for (const [sessionId, scheduledStart, actualStart] of frocRound2TestWindows) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must preserve official Toyota PDF scheduled/classification time`);
  assert.equal(session?.actualStart, actualStart, `${sessionId} must preserve official Toyota PDF actual started-at time`);
  assert.equal(session?.timezone, 'Pacific/Auckland', `${sessionId} must retain New Zealand timezone for weather joins`);
  assert.equal(session?.timeSource, 'official_toyota_timing_pdf', `${sessionId} must mark the PDF timing source`);
  assert.ok(
    (session?.provenanceRefs ?? []).some((ref) => ref.startsWith('source_froc_2024_r2_test_')),
    `${sessionId} must cite official Toyota test-session PDF provenance`
  );
}

const frocRound2Race2Grid = [
  ['39', 2],
  ['71', 4],
  ['23', 6],
  ['4', 8],
  ['5', 10],
  ['48', 12],
  ['19', 14],
  ['20', 16],
  ['14', 1],
  ['6', 3],
  ['15', 5],
  ['7', 7],
  ['41', 9],
  ['22', 11],
  ['31', 13],
  ['739', 15],
  ['16', 17]
];
const frocRound2Race2Rows = dataset.results.filter((row) => row.sessionId === 'session_froc_2024_r2_race_2');
assert.equal(frocRound2Race2Rows.length, 17, 'FROC Round 2 Race 2 should retain 17 official Toyota classification rows');
for (const [carNumber, startPosition] of frocRound2Race2Grid) {
  const row = frocRound2Race2Rows.find((candidate) => candidate.carNumber === carNumber);
  assert.equal(row?.startPosition, startPosition, `FROC Round 2 Race 2 car ${carNumber} must import start position from official Grid R2 PDF`);
  assert.equal(row?.gridPosition, startPosition, `FROC Round 2 Race 2 car ${carNumber} must import grid position from official Grid R2 PDF`);
  assert.equal(row?.raw?.gridEvidence?.source, 'Toyota Grid R2 PDF', `FROC Round 2 Race 2 car ${carNumber} must preserve official grid PDF evidence`);
  assert.ok(
    (row?.provenanceRefs ?? []).includes('source_froc_2024_r2_grid_r2_toyota_pdf'),
    `FROC Round 2 Race 2 car ${carNumber} must cite official Toyota Grid R2 PDF provenance`
  );
}

const assertFrpGridPenalty = ({
  penaltyId,
  sessionId,
  driverId,
  resultId,
  sourceId,
  reason,
  label
}) => {
  const penalty = dataset.penalties.find((row) => row.id === penaltyId);
  assert.equal(penalty?.sessionId, sessionId, `${label} must link to the official qualifying session`);
  assert.equal(penalty?.driverId, driverId, `${label} must link to the official car driver`);
  assert.equal(penalty?.penaltyType, 'grid_position_loss', `${label} type must preserve grid-position loss semantics`);
  assert.equal(penalty?.positionImpact, -2, `${label} must preserve the two-position grid loss`);
  assert.equal(penalty?.reason, reason, `${label} must preserve the official announcement reason`);
  assert.ok((penalty?.provenanceRefs ?? []).includes(sourceId), `${label} must cite the official PDF provenance`);
  assert.ok(
    (dataset.results.find((row) => row.id === resultId)?.penaltyRefs ?? []).includes(penaltyId),
    `${label} result row must link to its official grid-position penalty`
  );
};

assertFrpGridPenalty({
  penaltyId: 'penalty_frp_f1600_2019_r3_03_qualifying_car_21_grid_positions',
  sessionId: 'session_frp_f1600_2019_r3_03_qualifying',
  driverId: 'driver_dave_petzko',
  resultId: 'result_frp_f1600_2019_r3_03_qualifying_driver_dave_petzko_21',
  sourceId: 'source_frp_f1600_2019_r3_03_qualifying_pdf',
  reason: 'causing session stoppage early per Chief Steward',
  label: 'FRP Mid-Ohio car 21 qualifying penalty'
});
assertFrpGridPenalty({
  penaltyId: 'penalty_frp_f1600_2019_r4_01_qualifying_car_40_grid_positions',
  sessionId: 'session_frp_f1600_2019_r4_01_qualifying',
  driverId: 'driver_keith_grant',
  resultId: 'result_frp_f1600_2019_r4_01_qualifying_driver_keith_grant_40',
  sourceId: 'source_frp_f1600_2019_r4_01_qualifying_pdf',
  reason: 'causing session stoppage per Chief Steward.',
  label: 'FRP VIR car 40 qualifying penalty'
});

const assertPenalty = ({
  penaltyId,
  sessionId,
  driverId,
  resultId,
  sourceId,
  penaltyType,
  reason,
  positionImpact,
  timeImpactSeconds,
  label
}) => {
  const penalty = dataset.penalties.find((row) => row.id === penaltyId);
  assert.equal(penalty?.sessionId, sessionId, `${label} must link to the official session`);
  assert.equal(penalty?.driverId, driverId, `${label} must link to the official car driver`);
  assert.equal(penalty?.penaltyType, penaltyType, `${label} must preserve penalty type semantics`);
  assert.equal(penalty?.positionImpact, positionImpact, `${label} must preserve position impact`);
  assert.equal(penalty?.timeImpactSeconds, timeImpactSeconds, `${label} must preserve time impact`);
  assert.equal(penalty?.reason, reason, `${label} must preserve the official announcement reason`);
  assert.ok((penalty?.provenanceRefs ?? []).includes(sourceId), `${label} must cite the official PDF provenance`);
  assert.ok(
    (dataset.results.find((row) => row.id === resultId)?.penaltyRefs ?? []).includes(penaltyId),
    `${label} result row must link to its official penalty`
  );
};

assertPenalty({
  penaltyId: 'penalty_formula_ford_2020_wht_heat_2_car_888_grid_positions',
  sessionId: 'session_formula_ford_2020_wht_heat_2',
  driverId: 'driver_sebastian_melrose',
  resultId: 'result_formula_ford_2020_wht_heat_2_888_driver_sebastian_melrose',
  sourceId: 'source_formula_ford_2020_wht_heat_2_penalty_notes',
  penaltyType: 'grid_position_loss',
  reason: 'exceeding track limits',
  positionImpact: -2,
  timeImpactSeconds: null,
  label: 'Formula Ford WHT Heat 2 car 888 grid penalty'
});
assertPenalty({
  penaltyId: 'penalty_formula_ford_2020_wht_heat_4_car_35_grid_positions',
  sessionId: 'session_formula_ford_2020_wht_heat_4',
  driverId: 'driver_robert_hall',
  resultId: 'result_formula_ford_2020_wht_heat_4_35_driver_robert_hall',
  sourceId: 'source_formula_ford_2020_wht_heat_4_penalty_notes',
  penaltyType: 'grid_position_loss',
  reason: 'exceeding track limits',
  positionImpact: -2,
  timeImpactSeconds: null,
  label: 'Formula Ford WHT Heat 4 car 35 grid penalty'
});
assertPenalty({
  penaltyId: 'penalty_formula_ford_2020_wht_progression_race_car_10_time_seconds',
  sessionId: 'session_formula_ford_2020_wht_progression_race',
  driverId: 'driver_will_everington',
  resultId: 'result_formula_ford_2020_wht_progression_race_10_driver_will_everington',
  sourceId: 'source_formula_ford_2020_wht_progression_race_penalty_notes',
  penaltyType: 'time_penalty',
  reason: 'exceeding track limits',
  positionImpact: null,
  timeImpactSeconds: 5,
  label: 'Formula Ford WHT Progression Race car 10 time penalty'
});
assertPenalty({
  penaltyId: 'penalty_formula_ford_2020_wht_race_16_car_48_time_seconds',
  sessionId: 'session_formula_ford_2020_wht_race_16',
  driverId: 'driver_benn_tilley',
  resultId: 'result_formula_ford_2020_wht_race_16_48_driver_benn_tilley',
  sourceId: 'source_formula_ford_2020_wht_race_16_penalty_notes',
  penaltyType: 'time_penalty',
  reason: 'exceeding track limits',
  positionImpact: null,
  timeImpactSeconds: 5,
  label: 'Formula Ford WHT Race 16 car 48 time penalty'
});

const assertGridStart = ({ resultId, startPosition, sourceId, label }) => {
  const result = dataset.results.find((row) => row.id === resultId);
  assert.equal(result?.gridPosition, startPosition, `${label} must import official grid position`);
  assert.equal(result?.startPosition, startPosition, `${label} must import official start position`);
  assert.equal(result?.raw?.gridEvidence?.source, 'official_formula_ford_grid_page', `${label} must preserve grid evidence kind`);
  assert.ok((result?.provenanceRefs ?? []).includes(sourceId), `${label} must cite official grid page source evidence`);
};

assertGridStart({
  resultId: 'result_formula_ford_2020_festival_heat_1_race_4_21_driver_bryce_aron',
  startPosition: 3,
  sourceId: 'source_formula_ford_2020_festival_heat_1_race_4_grid',
  label: 'Formula Ford Festival Heat 1 Bryce row'
});
assertGridStart({
  resultId: 'result_formula_ford_2020_festival_grand_final_race_21_21_driver_bryce_aron',
  startPosition: 5,
  sourceId: 'source_formula_ford_2020_festival_grand_final_race_21_grid',
  label: 'Formula Ford Festival Grand Final Bryce row'
});
assertGridStart({
  resultId: 'result_formula_ford_2020_wht_heat_2_888_driver_sebastian_melrose',
  startPosition: 8,
  sourceId: 'source_formula_ford_2020_wht_heat_2_grid',
  label: 'Formula Ford WHT Heat 2 Sebastian Melrose row'
});
assertGridStart({
  resultId: 'result_formula_ford_2020_national_oulton_park_race_1_41_driver_alexander_walker',
  startPosition: 15,
  sourceId: 'source_formula_ford_2020_national_oulton_park_race_1_grid',
  label: 'Formula Ford National Oulton Park Race 1 Alexander Walker rookie-symbol grid row'
});
assertGridStart({
  resultId: 'result_formula_ford_2020_national_oulton_park_race_1_17_driver_reece_lycett',
  startPosition: 19,
  sourceId: 'source_formula_ford_2020_national_oulton_park_race_1_grid',
  label: 'Formula Ford National Oulton Park Race 1 Reece Lycett rookie-symbol grid row'
});
assertGridStart({
  resultId: 'result_formula_ford_2020_national_oulton_park_race_1_69_driver_colin_lawson',
  startPosition: 28,
  sourceId: 'source_formula_ford_2020_national_oulton_park_race_1_grid',
  label: 'Formula Ford National Oulton Park Race 1 Colin Lawson source car-number drift grid row'
});
{
  const colinLawsonResult = dataset.results.find((row) => row.id === 'result_formula_ford_2020_national_oulton_park_race_1_69_driver_colin_lawson');
  assert.equal(colinLawsonResult?.carNumber, '69', 'Formula Ford Colin Lawson classification car number must remain the official result car number');
  assert.equal(colinLawsonResult?.raw?.gridEvidence?.carNumber, '169', 'Formula Ford Colin Lawson grid evidence must preserve the official grid-page car number');
  assert.equal(colinLawsonResult?.raw?.gridEvidence?.matchStrategy, 'driver_name_fallback', 'Formula Ford Colin Lawson grid row must document the exact-name fallback match');
}
assertGridStart({
  resultId: 'result_formula_ford_2020_national_oulton_park_race_8_41_driver_alexander_walker',
  startPosition: 12,
  sourceId: 'source_formula_ford_2020_national_oulton_park_race_8_grid',
  label: 'Formula Ford National Oulton Park Race 8 Alexander Walker rookie-symbol grid row'
});

const assertNationalFf1600BryceResult = ({
  resultId,
  finishPosition,
  startPosition,
  bestLapTime,
  sourceId,
  gridSourceId,
  label
}) => {
  const result = dataset.results.find((row) => row.id === resultId);
  assert.equal(result?.driverId, 'driver_bryce_aron', `${label} must import Bryce as the driver`);
  assert.equal(result?.finishPosition, finishPosition, `${label} must preserve official finish position`);
  assert.equal(result?.bestLapTime, bestLapTime, `${label} must preserve official best lap`);
  assert.ok((result?.provenanceRefs ?? []).includes(sourceId), `${label} must cite official classification source evidence`);
  if (startPosition !== null) {
    assert.equal(result?.gridPosition, startPosition, `${label} must import official grid position`);
    assert.equal(result?.startPosition, startPosition, `${label} must import official start position`);
    assert.ok((result?.provenanceRefs ?? []).includes(gridSourceId), `${label} must cite official grid source evidence`);
  }
};

for (const sourceId of [
  'source_formula_ford_2020_national_oulton_park_book_pdf',
  'source_formula_ford_2020_national_brands_hatch_book_pdf',
  'source_formula_ford_2020_national_silverstone_book_pdf',
  'source_formula_ford_2020_champion_cadwell_book_pdf',
  'source_formula_ford_2020_champion_brands_book_pdf'
]) {
  assert.equal(dataset.sourceEvidence.find((row) => row.id === sourceId)?.confidenceTier, 'official', `${sourceId} must exist as official source evidence`);
}

assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_oulton_park_race_1_23_driver_bryce_aron',
  finishPosition: 9,
  startPosition: 12,
  bestLapTime: '2:07.037',
  sourceId: 'source_formula_ford_2020_national_oulton_park_race_1_classification',
  gridSourceId: 'source_formula_ford_2020_national_oulton_park_race_1_grid',
  label: 'National FF1600 Oulton Park Race 1 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_oulton_park_race_8_23_driver_bryce_aron',
  finishPosition: 7,
  startPosition: 9,
  bestLapTime: '2:05.857',
  sourceId: 'source_formula_ford_2020_national_oulton_park_race_8_classification',
  gridSourceId: 'source_formula_ford_2020_national_oulton_park_race_8_grid',
  label: 'National FF1600 Oulton Park Race 2 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_brands_hatch_qualifying_race_2_23_driver_bryce_aron',
  finishPosition: 1,
  startPosition: null,
  bestLapTime: '50.136',
  sourceId: 'source_formula_ford_2020_national_brands_hatch_qualifying_race_2_classification',
  gridSourceId: null,
  label: 'National FF1600 Brands Hatch qualifying Bryce pole row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_brands_hatch_race_2_23_driver_bryce_aron',
  finishPosition: 5,
  startPosition: 1,
  bestLapTime: '50.575',
  sourceId: 'source_formula_ford_2020_national_brands_hatch_race_2_classification',
  gridSourceId: 'source_formula_ford_2020_national_brands_hatch_race_2_grid',
  label: 'National FF1600 Brands Hatch Race 1 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_brands_hatch_race_11_23_driver_bryce_aron',
  finishPosition: 5,
  startPosition: 5,
  bestLapTime: '50.782',
  sourceId: 'source_formula_ford_2020_national_brands_hatch_race_11_classification',
  gridSourceId: 'source_formula_ford_2020_national_brands_hatch_race_11_grid',
  label: 'National FF1600 Brands Hatch Race 2 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_brands_hatch_race_18_23_driver_bryce_aron',
  finishPosition: 5,
  startPosition: 2,
  bestLapTime: '50.764',
  sourceId: 'source_formula_ford_2020_national_brands_hatch_race_18_classification',
  gridSourceId: 'source_formula_ford_2020_national_brands_hatch_race_18_grid',
  label: 'National FF1600 Brands Hatch Race 3 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_silverstone_race_3_23_driver_bryce_aron',
  finishPosition: 9,
  startPosition: 6,
  bestLapTime: '1:19.895',
  sourceId: 'source_formula_ford_2020_national_silverstone_race_3_classification',
  gridSourceId: 'source_formula_ford_2020_national_silverstone_race_3_grid',
  label: 'National FF1600 Silverstone Race 1 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_national_silverstone_race_7_23_driver_bryce_aron',
  finishPosition: 5,
  startPosition: 9,
  bestLapTime: '1:12.289',
  sourceId: 'source_formula_ford_2020_national_silverstone_race_7_classification',
  gridSourceId: 'source_formula_ford_2020_national_silverstone_race_7_grid',
  label: 'National FF1600 Silverstone Race 2 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_champion_cadwell_qualifying_race_2_123_driver_bryce_aron',
  finishPosition: 1,
  startPosition: null,
  bestLapTime: '1:32.371',
  sourceId: 'source_formula_ford_2020_champion_cadwell_qualifying_race_2_classification',
  gridSourceId: null,
  label: 'Champion of Cadwell qualifying Bryce pole row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_champion_cadwell_race_2_123_driver_bryce_aron',
  finishPosition: 3,
  startPosition: 1,
  bestLapTime: '1:32.680',
  sourceId: 'source_formula_ford_2020_champion_cadwell_race_2_classification',
  gridSourceId: 'source_formula_ford_2020_champion_cadwell_race_2_grid',
  label: 'Champion of Cadwell Race 2 Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_champion_cadwell_race_5_123_driver_bryce_aron',
  finishPosition: 1,
  startPosition: 3,
  bestLapTime: '1:32.970',
  sourceId: 'source_formula_ford_2020_champion_cadwell_race_5_classification',
  gridSourceId: 'source_formula_ford_2020_champion_cadwell_race_5_grid',
  label: 'Champion of Cadwell Race 5 Bryce win row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_champion_brands_qualifying_race_5_123_driver_bryce_aron',
  finishPosition: 5,
  startPosition: null,
  bestLapTime: '50.913',
  sourceId: 'source_formula_ford_2020_champion_brands_qualifying_race_5_classification',
  gridSourceId: null,
  label: 'Champion of Brands qualifying Bryce row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_champion_brands_race_5_123_driver_bryce_aron',
  finishPosition: 3,
  startPosition: 5,
  bestLapTime: '50.949',
  sourceId: 'source_formula_ford_2020_champion_brands_race_5_classification',
  gridSourceId: 'source_formula_ford_2020_champion_brands_race_5_grid',
  label: 'Champion of Brands Race 5 Bryce podium row'
});
assertNationalFf1600BryceResult({
  resultId: 'result_formula_ford_2020_champion_brands_race_11_123_driver_bryce_aron',
  finishPosition: 3,
  startPosition: 3,
  bestLapTime: '50.651',
  sourceId: 'source_formula_ford_2020_champion_brands_race_11_classification',
  gridSourceId: 'source_formula_ford_2020_champion_brands_race_11_grid',
  label: 'Champion of Brands Race 11 Bryce podium row'
});

const formulaFordImportReport = JSON.parse(await readFile('data/career/reports/formula-ford-2020-import-report.json', 'utf8'));
const formulaFordClassTokenDriverIds = new Set(['driver_h', 'driver_o', 'driver_p', 'driver_jc', 'driver_ch', 'driver_sca', 'driver_scb', 'driver_scc', 'driver_scd', 'driver_sce']);
assert.deepEqual(
  dataset.results
    .filter((row) => String(row.id).startsWith('result_formula_ford_2020_') && formulaFordClassTokenDriverIds.has(row.driverId))
    .map((row) => row.id),
  [],
  'Formula Ford 2020 importer must not retain stale class-token parser rows as driver results'
);
assert.deepEqual(
  dataset.drivers
    .filter((row) => formulaFordClassTokenDriverIds.has(row.id))
    .map((row) => row.id),
  [],
  'Formula Ford 2020 importer must clean unreferenced single-letter class-token drivers'
);
assert.equal(formulaFordImportReport.bryceLapSamplesImported, 282, 'Formula Ford importer must extract all source-backed Bryce lap-analysis samples');
assert.equal(formulaFordImportReport.lapSamplesImported, 282, 'Formula Ford lap-sample import must stay scoped to Bryce-owned lap-analysis rows');
assert.equal(formulaFordImportReport.gridRowsImported, 755, 'Formula Ford importer must include the Colin Lawson exact-name grid fallback row');
assert.deepEqual(
  formulaFordImportReport.gridRowsMatchedByDriverName,
  [
    {
      sourceId: 'national_oulton_park',
      sessionSlug: 'race_1',
      sessionName: 'RACE 1',
      pageNumber: 13,
      position: 28,
      gridCarNumber: '169',
      resultCarNumber: '69',
      driverName: 'Colin LAWSON',
      reason: 'official_grid_car_number_differs_from_classification_result_car_number'
    }
  ],
  'Formula Ford importer report must isolate exact-name fallback grid matches'
);
{
  const formulaFordGridHoldoutGap = dataset.gaps.find((row) => row.id === 'gap_formula_ford_2020_grid_start_source_asymmetry_holdouts');
  assert.equal(formulaFordGridHoldoutGap?.status, 'open', 'Formula Ford grid/start source-asymmetry holdouts must be explicit open gaps');
  assert.equal(formulaFordGridHoldoutGap?.raw?.resultIds?.length, 7, 'Formula Ford grid/start holdout gap must enumerate the remaining seven held-out result rows');
  assert.equal(
    formulaFordGridHoldoutGap?.raw?.resultIds?.includes('result_formula_ford_2020_wht_grand_final_48_driver_benn_tilley'),
    true,
    'Formula Ford grid/start holdout gap must preserve reserve-only WHT Grand Final rows instead of assigning guessed grid positions'
  );
  assert.match(
    formulaFordGridHoldoutGap?.description ?? '',
    /Lap-analysis imports remain scoped to Bryce-labeled blocks/i,
    'Formula Ford gap must explicitly preserve the Bryce-only lap-analysis scope until unlabeled continuation pages can be matched deterministically'
  );
}

const assertFormulaFordLapSample = ({
  sampleId,
  sessionId,
  lapNumber,
  lapTime,
  sourceTimestamp,
  averageSpeedMph,
  sourceId,
  label
}) => {
  const sample = dataset.lapSamples.find((row) => row.id === sampleId);
  assert.equal(sample?.sessionId, sessionId, `${label} must link to the canonical session`);
  assert.equal(sample?.driverId, 'driver_bryce_aron', `${label} must link to Bryce`);
  assert.equal(sample?.lapNumber, lapNumber, `${label} must preserve lap number`);
  assert.equal(sample?.lapTime, lapTime, `${label} must preserve official lap time`);
  assert.equal(sample?.sourceTimestamp, sourceTimestamp, `${label} must preserve official time of day`);
  assert.equal(sample?.raw?.averageSpeedMph, averageSpeedMph, `${label} must preserve official MPH in raw data`);
  assert.equal(sample?.raw?.source, 'Formula Ford official lap analysis page', `${label} must preserve source kind`);
  assert.ok((sample?.provenanceRefs ?? []).includes(sourceId), `${label} must cite official lap-analysis source evidence`);
  assert.equal(dataset.sourceEvidence.find((row) => row.id === sourceId)?.confidenceTier, 'official', `${label} source evidence must be official`);
};

assertFormulaFordLapSample({
  sampleId: 'lap_formula_ford_2020_festival_qualifying_heat_1_race_4_bryce_aron_007',
  sessionId: 'session_formula_ford_2020_festival_qualifying_heat_1_race_4',
  lapNumber: 7,
  lapTime: '51.475',
  sourceTimestamp: '09:57:05.089',
  averageSpeedMph: 84.47,
  sourceId: 'source_formula_ford_2020_festival_qualifying_heat_1_race_4_lap_analysis',
  label: 'Formula Ford Festival qualifying lap 7 Bryce sample'
});
assertFormulaFordLapSample({
  sampleId: 'lap_formula_ford_2020_national_brands_hatch_qualifying_race_2_bryce_aron_011',
  sessionId: 'session_formula_ford_2020_national_brands_hatch_qualifying_race_2',
  lapNumber: 11,
  lapTime: '50.136',
  sourceTimestamp: '09:30:58.065',
  averageSpeedMph: 86.73,
  sourceId: 'source_formula_ford_2020_national_brands_hatch_qualifying_race_2_lap_analysis',
  label: 'Formula Ford National Brands Hatch qualifying best-lap Bryce sample'
});
assertFormulaFordLapSample({
  sampleId: 'lap_formula_ford_2020_national_oulton_park_qualifying_race_1_bryce_aron_001',
  sessionId: 'session_formula_ford_2020_national_oulton_park_qualifying_race_1',
  lapNumber: 1,
  lapTime: null,
  sourceTimestamp: '08:56:50.545',
  averageSpeedMph: null,
  sourceId: 'source_formula_ford_2020_national_oulton_park_qualifying_race_1_lap_analysis',
  label: 'Formula Ford National Oulton Park qualifying out-lap Bryce sample'
});
assertFormulaFordLapSample({
  sampleId: 'lap_formula_ford_2020_national_silverstone_race_7_bryce_aron_002',
  sessionId: 'session_formula_ford_2020_national_silverstone_race_7',
  lapNumber: 2,
  lapTime: '1:19.213',
  sourceTimestamp: '17:23:08.483',
  averageSpeedMph: 84.11,
  sourceId: 'source_formula_ford_2020_national_silverstone_race_7_lap_analysis',
  label: 'Formula Ford National Silverstone Race 7 source-labeled Bryce sample'
});
assertFormulaFordLapSample({
  sampleId: 'lap_formula_ford_2020_champion_cadwell_race_5_bryce_aron_003',
  sessionId: 'session_formula_ford_2020_champion_cadwell_race_5',
  lapNumber: 3,
  lapTime: '1:32.970',
  sourceTimestamp: '14:55:06.939',
  averageSpeedMph: 84.68,
  sourceId: 'source_formula_ford_2020_champion_cadwell_race_5_lap_analysis',
  label: 'Formula Ford Champion of Cadwell Race 5 source-labeled Bryce sample'
});

assert.match(
  frocImportReport.gaps.find((row) => row.id === 'gap_froc_2024_session_times_missing')?.description ?? '',
  /official Toyota schedule images backfill practice, qualifying, and race starts/i,
  'FROC import report session-time gap must reflect integrated schedule-image and Round 2 timing-PDF backfills'
);
assert.match(
  frocImportReport.gaps.find((row) => row.id === 'gap_froc_2024_start_positions_partial')?.description ?? '',
  /FROC Round 1 Race 3 start positions are imported/i,
  'FROC import report start-position gap must reflect integrated Taupo Race 3 Q2 grid backfill'
);
{
  const frocTimeGap = dataset.gaps.find((row) => row.id === 'gap_froc_2024_session_times_missing');
  assert.equal(
    frocTimeGap?.raw?.unsourcedTestSessions?.length,
    9,
    'FROC session-time gap must enumerate the nine official-date-context-only test sessions still lacking exact clock times'
  );
}

const frocRound5GridRuleSource = dataset.sourceEvidence.find((row) => row.id === 'source_froc_2024_r5_highlands_gp_qualifying_format_article');
assert.equal(
  frocRound5GridRuleSource?.confidenceTier,
  'official',
  'FROC Round 5 grid-rule derivation must cite the official Toyota Highlands qualifying-format article'
);
const frocRound1Qual1Source = dataset.sourceEvidence.find((row) => row.id === 'source_froc_2024_r1_qualifying_1_toyota_article');
assert.equal(
  frocRound1Qual1Source?.confidenceTier,
  'official',
  'FROC Round 1 Race 1 grid derivation must cite the official Toyota Qualifying 1 article'
);
const frocRound1Race1RowsWithStarts = dataset.results.filter(
  (row) => row.sessionId === 'session_froc_2024_r1_race_1' && (row.startPosition !== null || row.gridPosition !== null)
);
assert.equal(frocRound1Race1RowsWithStarts.length, 17, 'FROC Round 1 Race 1 must import all 17 official Qualifying 1-backed starts');
const frocRound1Race1Mansell = dataset.results.find((row) => row.sessionId === 'session_froc_2024_r1_race_1' && row.driverId === 'driver_christian_mansell');
assert.equal(frocRound1Race1Mansell?.startPosition, 1, 'FROC Round 1 Race 1 Mansell start must derive from official Qualifying 1 order');
assert.equal(frocRound1Race1Mansell?.gridPosition, 1, 'FROC Round 1 Race 1 Mansell grid must derive from official Qualifying 1 order');
assert.equal(
  frocRound1Race1Mansell?.raw?.gridEvidence?.source,
  'Toyota Taupo Qualifying 1 article plus Qualifying 1 table',
  'FROC Round 1 Race 1 grid evidence must identify the official Toyota article and qualifying table'
);
assert.ok(
  (frocRound1Race1Mansell?.provenanceRefs ?? []).includes('source_froc_2024_r1_qualifying_1_toyota_article'),
  'FROC Round 1 Race 1 grid must cite official Toyota Qualifying 1 article provenance'
);
const frocRound1Race2Source = dataset.sourceEvidence.find((row) => row.id === 'source_froc_2024_r1_race_2_toyota_article');
assert.equal(
  frocRound1Race2Source?.confidenceTier,
  'official',
  'FROC Round 1 Race 2 grid subset must cite the official Toyota Race 2 article'
);
const frocRound1Race2Starts = new Map(
  dataset.results
    .filter((row) => row.sessionId === 'session_froc_2024_r1_race_2')
    .map((row) => [row.carNumber, row])
);
for (const [carNumber, startPosition] of [
  ['41', 1],
  ['6', 2],
  ['39', 3],
  ['23', 4],
  ['15', 5],
  ['16', 6],
  ['71', 7],
  ['4', 8]
]) {
  const row = frocRound1Race2Starts.get(carNumber);
  assert.equal(row?.startPosition, startPosition, `FROC Round 1 Race 2 car ${carNumber} start must match official Toyota reverse top-eight article rule`);
  assert.equal(row?.gridPosition, startPosition, `FROC Round 1 Race 2 car ${carNumber} grid must match official Toyota reverse top-eight article rule`);
  assert.equal(
    row?.raw?.gridEvidence?.source,
    'Toyota Taupo Race 2 official article reverse top-eight rule plus Race 1 results',
    `FROC Round 1 Race 2 car ${carNumber} grid evidence must identify the official article rule and Race 1 results`
  );
  assert.ok(
    (row?.provenanceRefs ?? []).includes('source_froc_2024_r1_race_2_toyota_article'),
    `FROC Round 1 Race 2 car ${carNumber} grid must cite official Toyota Race 2 article provenance`
  );
}
const frocRound1Race2WoodsToth = frocRound1Race2Starts.get('14');
assert.equal(frocRound1Race2WoodsToth?.startPosition, 16, 'FROC Round 1 Race 2 Woods-Toth start must match official Toyota article P16 statement');
assert.equal(frocRound1Race2WoodsToth?.gridPosition, 16, 'FROC Round 1 Race 2 Woods-Toth grid must match official Toyota article P16 statement');
assert.equal(
  frocRound1Race2WoodsToth?.raw?.gridEvidence?.source,
  'Toyota Taupo Race 2 official article direct P16 statement',
  'FROC Round 1 Race 2 Woods-Toth grid evidence must identify the official article direct P16 statement'
);
assert.ok(
  (frocRound1Race2WoodsToth?.provenanceRefs ?? []).includes('source_froc_2024_r1_race_2_toyota_article'),
  'FROC Round 1 Race 2 Woods-Toth grid must cite official Toyota Race 2 article provenance'
);
assert.equal(
  dataset.results
    .filter((row) => row.sessionId === 'session_froc_2024_r1_race_2')
    .filter((row) => row.startPosition !== null || row.gridPosition !== null).length,
  9,
  'FROC Round 1 Race 2 must import only the official article-backed reverse top-eight and Woods-Toth P16 start positions'
);
const frocRound1Race3Source = dataset.sourceEvidence.find((row) => row.id === 'source_froc_2024_r1_qualifying_2_toyota_article');
assert.equal(
  frocRound1Race3Source?.confidenceTier,
  'official',
  'FROC Round 1 Race 3 grid must cite the official Toyota Qualifying 2 article'
);
const frocRound1Race3Starts = new Map(
  dataset.results
    .filter((row) => row.sessionId === 'session_froc_2024_r1_race_3')
    .map((row) => [row.carNumber, row])
);
for (const [carNumber, startPosition] of [
  ['71', 1],
  ['41', 2],
  ['23', 3],
  ['4', 4],
  ['15', 5],
  ['39', 6],
  ['16', 7],
  ['19', 8],
  ['7', 9],
  ['14', 10],
  ['6', 11],
  ['48', 12],
  ['31', 13],
  ['22', 14],
  ['5', 15],
  ['739', 16],
  ['20', 17]
]) {
  const row = frocRound1Race3Starts.get(carNumber);
  assert.equal(row?.startPosition, startPosition, `FROC Round 1 Race 3 car ${carNumber} start must match official Toyota Q2 article grid`);
  assert.equal(row?.gridPosition, startPosition, `FROC Round 1 Race 3 car ${carNumber} grid must match official Toyota Q2 article grid`);
  assert.equal(
    row?.raw?.gridEvidence?.source,
    'Toyota Taupo Qualifying 2 article plus Qualifying 2 table',
    `FROC Round 1 Race 3 car ${carNumber} grid evidence must identify the official Toyota Q2 article and table`
  );
  assert.ok(
    (row?.provenanceRefs ?? []).includes('source_froc_2024_r1_qualifying_2_toyota_article'),
    `FROC Round 1 Race 3 car ${carNumber} grid must cite official Toyota Qualifying 2 article provenance`
  );
}
assert.equal(
  dataset.results
    .filter((row) => row.sessionId === 'session_froc_2024_r1_race_3')
    .filter((row) => row.startPosition !== null || row.gridPosition !== null).length,
  17,
  'FROC Round 1 Race 3 must import all 17 official Q2-backed start positions'
);
const frocRound5Race1Bryce = dataset.results.find((row) => row.sessionId === 'session_froc_2024_r5_race_1' && row.driverId === 'driver_bryce_aron');
assert.equal(frocRound5Race1Bryce?.startPosition, 8, 'FROC Round 5 Race 1 Bryce start must derive from official Qualifying 1 order');
assert.equal(frocRound5Race1Bryce?.gridPosition, 8, 'FROC Round 5 Race 1 Bryce grid must derive from official Qualifying 1 order');
assert.equal(
  frocRound5Race1Bryce?.raw?.gridEvidence?.source,
  'Toyota Highlands qualifying-format article plus Qualifying 1 table',
  'FROC Round 5 Race 1 Bryce grid evidence must identify the official article and qualifying table'
);
assert.ok(
  (frocRound5Race1Bryce?.provenanceRefs ?? []).includes('source_froc_2024_r5_highlands_gp_qualifying_format_article'),
  'FROC Round 5 Race 1 Bryce grid must cite official Toyota grid-rule article provenance'
);
const frocRound4Qual1Source = dataset.sourceEvidence.find((row) => row.id === 'source_froc_2024_r4_qualifying_1_toyota_article');
assert.equal(
  frocRound4Qual1Source?.confidenceTier,
  'official',
  'FROC Round 4 Race 1 grid derivation must cite the official Toyota Qualifying 1 article'
);
const frocRound4Race1RowsWithStarts = dataset.results.filter(
  (row) => row.sessionId === 'session_froc_2024_r4_race_1' && (row.startPosition !== null || row.gridPosition !== null)
);
assert.equal(frocRound4Race1RowsWithStarts.length, 15, 'FROC Round 4 Race 1 must import all 15 official Qualifying 1-backed starts');
const frocRound4Race1Bryce = dataset.results.find((row) => row.sessionId === 'session_froc_2024_r4_race_1' && row.driverId === 'driver_bryce_aron');
assert.equal(frocRound4Race1Bryce?.startPosition, 7, 'FROC Round 4 Race 1 Bryce start must derive from official Qualifying 1 order');
assert.equal(frocRound4Race1Bryce?.gridPosition, 7, 'FROC Round 4 Race 1 Bryce grid must derive from official Qualifying 1 order');
assert.equal(
  frocRound4Race1Bryce?.raw?.gridEvidence?.source,
  'Toyota Euromarque Qualifying 1 article plus Qualifying 1 table',
  'FROC Round 4 Race 1 Bryce grid evidence must identify the official Toyota article and qualifying table'
);
assert.ok(
  (frocRound4Race1Bryce?.provenanceRefs ?? []).includes('source_froc_2024_r4_qualifying_1_toyota_article'),
  'FROC Round 4 Race 1 Bryce grid must cite official Toyota Qualifying 1 article provenance'
);
const frocRound5Race3Bryce = dataset.results.find((row) => row.sessionId === 'session_froc_2024_r5_race_3' && row.driverId === 'driver_bryce_aron');
assert.equal(frocRound5Race3Bryce?.startPosition, 6, 'FROC Round 5 Grand Prix Bryce start must derive from official segmented qualifying order');
assert.equal(frocRound5Race3Bryce?.gridPosition, 6, 'FROC Round 5 Grand Prix Bryce grid must derive from official segmented qualifying order');
assert.equal(
  frocRound5Race3Bryce?.raw?.gridEvidence?.source,
  'Toyota Highlands qualifying-format article plus Qualifying 1/2/3 tables',
  'FROC Round 5 Grand Prix Bryce grid evidence must identify the official article and segmented qualifying tables'
);
assert.ok(
  (frocRound5Race3Bryce?.provenanceRefs ?? []).includes('source_froc_2024_r5_highlands_gp_qualifying_format_article'),
  'FROC Round 5 Grand Prix Bryce grid must cite official Toyota grid-rule article provenance'
);
const frocRound5Race2Source = dataset.sourceEvidence.find((row) => row.id === 'source_froc_2024_r5_race_2_toyota_article');
assert.equal(
  frocRound5Race2Source?.confidenceTier,
  'official',
  'FROC Round 5 Race 2 grid subset must cite the official Toyota Race 2 article'
);
const frocRound5Race2Starts = new Map(
  dataset.results
    .filter((row) => row.sessionId === 'session_froc_2024_r5_race_2')
    .map((row) => [row.carNumber, row])
);
for (const [carNumber, startPosition] of [
  ['27', 1],
  ['14', 2],
  ['51', 3],
  ['16', 4],
  ['4', 5],
  ['17', 6],
  ['23', 7],
  ['39', 8]
]) {
  const row = frocRound5Race2Starts.get(carNumber);
  assert.equal(row?.startPosition, startPosition, `FROC Round 5 Race 2 car ${carNumber} start must match official Toyota article grid`);
  assert.equal(row?.gridPosition, startPosition, `FROC Round 5 Race 2 car ${carNumber} grid must match official Toyota article grid`);
  assert.equal(
    row?.raw?.gridEvidence?.source,
    'Toyota Highlands Race 2 official article top-eight grid narrative',
    `FROC Round 5 Race 2 car ${carNumber} grid evidence must identify the official article narrative`
  );
  assert.ok(
    (row?.provenanceRefs ?? []).includes('source_froc_2024_r5_race_2_toyota_article'),
    `FROC Round 5 Race 2 car ${carNumber} grid must cite official Toyota Race 2 article provenance`
  );
}
assert.equal(
  dataset.results
    .filter((row) => row.sessionId === 'session_froc_2024_r5_race_2')
    .filter((row) => row.startPosition !== null || row.gridPosition !== null).length,
  8,
  'FROC Round 5 Race 2 must import only the official article-backed top-eight start positions'
);

assert.equal(
  dataset.sessions.find((row) => row.id === 'session_indy_nxt_2024_6367')?.sessionType,
  'qualifying',
  'INDY NXT official SessionType=Q must override session names that contain Race in the qualifying label'
);

const indyNxtQualifyingResults = dataset.qualifyingResults.filter((row) => row.sessionId.startsWith('session_indy_nxt_'));
assert.equal(indyNxtQualifyingResults.length, indyNxtImportReport.qualifyingResultsImported, 'INDY NXT qualifyingResults must reconcile to every official API SessionType=Q record imported in this run');
assert.equal(
  indyNxtQualifyingResults.filter((row) => row.driverId === 'driver_bryce_aron').length,
  indyNxtImportReport.bryceQualifyingResultsImported,
  'INDY NXT qualifyingResults must include Bryce rows from official API SessionType=Q records'
);
const indyNxtStPeteBryceQual = indyNxtQualifyingResults.find((row) => row.id === 'qualifying_indy_nxt_2024_6346_driver_bryce_aron');
assert.equal(indyNxtStPeteBryceQual?.position, 4, 'INDY NXT St. Petersburg 2024 Bryce qualifying position should import from official API');
assert.equal(indyNxtStPeteBryceQual?.bestLapTime, '01:04.8883', 'INDY NXT St. Petersburg 2024 Bryce best qualifying lap should import from official API');
assert.equal(indyNxtStPeteBryceQual?.gapToPole, '0.3058', 'INDY NXT St. Petersburg 2024 Bryce qualifying gap to pole should import from official API Difference field');
assert.equal(indyNxtStPeteBryceQual?.raw?.bestLapSpeedMph, 99.864, 'INDY NXT St. Petersburg 2024 Bryce qualifying speed should import from official API');
assert.equal(indyNxtStPeteBryceQual?.raw?.bestLapNumber, 5, 'INDY NXT St. Petersburg 2024 Bryce qualifying best-lap number should import from official API');
assert.ok(
  (indyNxtStPeteBryceQual?.provenanceRefs ?? []).includes('source_indynxt_events_session_6346'),
  'INDY NXT qualifyingResults must cite the official EventsSessionDetails source evidence'
);

const indyNxtBarber2024LapSamples = dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2024_6314');
const indyNxtBarber2024BryceLapSamples = indyNxtBarber2024LapSamples
  .filter((row) => row.driverId === 'driver_bryce_aron')
  .sort((a, b) => a.lapNumber - b.lapNumber);
assert.equal(indyNxtBarber2024LapSamples.length, 729, 'INDY NXT Barber 2024 official lap chart should import one position sample per completed car-lap');
assert.equal(indyNxtBarber2024BryceLapSamples.length, 35, 'INDY NXT Barber 2024 Bryce lap chart should import all 35 official position samples');
assert.deepEqual(
  indyNxtBarber2024BryceLapSamples.map((row) => row.position),
  [7, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 7, 8, 8],
  'INDY NXT Barber 2024 Bryce lap positions must match the official Race Lap Chart PDF'
);
assert.ok(
  indyNxtBarber2024BryceLapSamples.every((row) => (row.provenanceRefs ?? []).includes('source_indy_nxt_2024_6314_lap_chart_pdf')),
  'INDY NXT Barber 2024 Bryce lap samples must cite the official Race Lap Chart PDF provenance'
);
const indyNxtIowa2024Race2LapSamples = dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2024_6319');
const indyNxtIowa2024Race2BryceLapSamples = indyNxtIowa2024Race2LapSamples.filter((row) => row.driverId === 'driver_bryce_aron');
const indyNxtIowa2024Race2SampleKeys = new Set();
const indyNxtIowa2024Race2DuplicateSampleKeys = new Set();
for (const row of indyNxtIowa2024Race2LapSamples) {
  const sampleKey = `${row.carNumber}|${row.lapNumber}`;
  if (indyNxtIowa2024Race2SampleKeys.has(sampleKey)) indyNxtIowa2024Race2DuplicateSampleKeys.add(sampleKey);
  indyNxtIowa2024Race2SampleKeys.add(sampleKey);
}
assert.equal(
  indyNxtIowa2024Race2LapSamples.length,
  889,
  'INDY NXT Iowa 2024 Race 2 lap chart must import clean source-visible partial samples when completed-lap counts are short'
);
assert.equal(
  indyNxtIowa2024Race2BryceLapSamples.length,
  55,
  'INDY NXT Iowa 2024 Race 2 Bryce lap samples must import from the clean partial lap chart'
);
assert.deepEqual(
  [...indyNxtIowa2024Race2DuplicateSampleKeys],
  [],
  'INDY NXT Iowa 2024 Race 2 partial lap chart import must not create duplicate car-lap samples'
);
assert.ok(
  dataset.sourceEvidence.some((row) => row.id === 'source_indy_nxt_2024_6319_lap_chart_pdf' && /partial/i.test(row.notes ?? '')),
  'INDY NXT Iowa 2024 Race 2 partial lap chart sourceEvidence must record partial import status'
);
const indyNxtIowa2024Race2PartialImport = indyNxtReportDetailsBackfill.partialLapChartImports.find((row) => row.sessionId === 'session_indy_nxt_2024_6319');
assert.equal(
  indyNxtIowa2024Race2PartialImport?.samplesImported,
  889,
  'INDY NXT Iowa 2024 Race 2 partial import report must preserve imported sample count'
);
assert.deepEqual(
  indyNxtIowa2024Race2PartialImport?.missingByCar,
  [{ carNumber: '23', expected: 55, parsed: 53, missing: 2 }],
  'INDY NXT Iowa 2024 Race 2 partial import report must preserve the missing official-count mismatch'
);
assert.equal(
  indyNxtReportDetailsBackfill.parserFailures.some((row) => row.sessionId === 'session_indy_nxt_2024_6319'),
  false,
  'INDY NXT Iowa 2024 Race 2 must leave parserFailures once a clean partial parser output is imported'
);
const indyNxtPortland2024RaceLapSamples = dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2024_6321');
const indyNxtPortland2024RaceDuplicateSampleKeys = new Set();
const indyNxtPortland2024RaceSampleKeys = new Set();
for (const row of indyNxtPortland2024RaceLapSamples) {
  const sampleKey = `${row.carNumber}|${row.lapNumber}`;
  if (indyNxtPortland2024RaceSampleKeys.has(sampleKey)) indyNxtPortland2024RaceDuplicateSampleKeys.add(sampleKey);
  indyNxtPortland2024RaceSampleKeys.add(sampleKey);
}
assert.equal(
  indyNxtPortland2024RaceLapSamples.length,
  564,
  'INDY NXT Portland 2024 Race lap chart must import source-visible lap-1 samples from the unlabeled position column'
);
assert.deepEqual(
  [...indyNxtPortland2024RaceDuplicateSampleKeys],
  [],
  'INDY NXT Portland 2024 Race lap-1 position-column import must not create duplicate car-lap samples'
);
const indyNxtPortland2024RacePartialImport = indyNxtReportDetailsBackfill.partialLapChartImports.find((row) => row.sessionId === 'session_indy_nxt_2024_6321');
assert.equal(
  indyNxtPortland2024RacePartialImport?.missingSamples,
  1,
  'INDY NXT Portland 2024 Race partial import should retain only the one source-invisible car 76 sample after lap-1 position-column parsing'
);
const indyNxtStatusIncidents = dataset.incidents.filter((row) => /^incident_indy_nxt_status_/.test(row.id ?? ''));
assert.equal(
  indyNxtStatusIncidents.length,
  indyNxtImportReport.officialStatusIncidentsImported,
  'INDY NXT official terminal statuses contact/mechanical/dns must normalize to incident rows'
);
const indyNxtStatusIncidentTypes = indyNxtStatusIncidents.reduce((counts, row) => {
  counts[row.incidentType] = (counts[row.incidentType] ?? 0) + 1;
  return counts;
}, {});
assert.deepEqual(Object.keys(indyNxtStatusIncidentTypes).sort(), ['contact', 'dns', 'mechanical'], 'INDY NXT official terminal-status incidents must preserve only source status categories without inferring unknowns');
const brycePortland2024ContactIncident = dataset.incidents.find((row) => row.id === 'incident_indy_nxt_status_2024_6324_driver_bryce_aron');
assert.equal(brycePortland2024ContactIncident?.incidentType, 'contact', 'Bryce Portland 2024 terminal status must normalize as official contact incident');
assert.equal(brycePortland2024ContactIncident?.outcome, 'finish_position_19_laps_31', 'Bryce Portland 2024 incident outcome must preserve official finish/lap context');
assert.ok(
  (brycePortland2024ContactIncident?.provenanceRefs ?? []).includes('source_indynxt_events_session_6324'),
  'Bryce Portland 2024 contact incident must cite official EventsSessionDetails provenance'
);
assert.ok(
  (dataset.results.find((row) => row.id === 'result_indy_nxt_2024_6324_driver_bryce_aron')?.incidentRefs ?? []).includes('incident_indy_nxt_status_2024_6324_driver_bryce_aron'),
  'Bryce Portland 2024 result row must link to the official contact incident'
);
const bryceStPete2026MechanicalIncident = dataset.incidents.find((row) => row.id === 'incident_indy_nxt_status_2026_6763_driver_bryce_aron');
assert.equal(bryceStPete2026MechanicalIncident?.incidentType, 'mechanical', 'Bryce St. Petersburg 2026 terminal status must normalize as official mechanical incident');
const indyNxtDetroit2026CorreaPenalty = dataset.penalties.find((row) => row.id === 'penalty_indy_nxt_2026_6749_car_68_lap_10_drive_through');
assert.equal(indyNxtDetroit2026CorreaPenalty?.driverId, 'driver_jm_correa', 'INDY NXT Detroit 2026 car 68 penalty must map to JM Correa');
assert.equal(indyNxtDetroit2026CorreaPenalty?.penaltyType, 'drive_through', 'INDY NXT Detroit 2026 car 68 penalty must preserve official drive-through sanction');
assert.equal(indyNxtDetroit2026CorreaPenalty?.reason, 'Avoidable Contact', 'INDY NXT Detroit 2026 car 68 penalty must preserve official reason');
assert.equal(indyNxtDetroit2026CorreaPenalty?.lapNumber, 10, 'INDY NXT Detroit 2026 car 68 penalty must preserve official lap number');
assert.ok(
  (indyNxtDetroit2026CorreaPenalty?.provenanceRefs ?? []).includes('source_indy_nxt_2026_6749_results_pdf'),
  'INDY NXT Detroit 2026 car 68 penalty must cite official Results PDF provenance'
);
assert.ok(
  (dataset.results.find((row) => row.id === 'result_indy_nxt_2026_6749_driver_jm_correa')?.penaltyRefs ?? []).includes('penalty_indy_nxt_2026_6749_car_68_lap_10_drive_through'),
  'INDY NXT Detroit 2026 Correa result must link to official penalty row'
);
const indyNxtDetroit2024EscottoDqPenalty = dataset.penalties.find((row) => row.id === 'penalty_indy_nxt_2024_6326_car_75_lap_45_disqualification');
assert.equal(indyNxtDetroit2024EscottoDqPenalty?.driverId, 'driver_ricardo_escotto', 'INDY NXT Detroit 2024 car 75 DQ penalty must map to Ricardo Escotto');
assert.equal(indyNxtDetroit2024EscottoDqPenalty?.penaltyType, 'disqualification', 'INDY NXT Detroit 2024 car 75 DQ penalty must preserve official disqualification sanction');
assert.equal(indyNxtDetroit2024EscottoDqPenalty?.reason, 'Failure to Follow the Direction of INDYCAR', 'INDY NXT Detroit 2024 car 75 DQ penalty must preserve official multi-line reason');
assert.equal(indyNxtDetroit2024EscottoDqPenalty?.lapNumber, 45, 'INDY NXT Detroit 2024 car 75 DQ penalty must preserve official lap number');
assert.ok(
  (indyNxtDetroit2024EscottoDqPenalty?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6326_results_pdf'),
  'INDY NXT Detroit 2024 car 75 DQ penalty must cite official Results PDF provenance'
);
assert.ok(
  (dataset.results.find((row) => row.id === 'result_indy_nxt_2024_6326_driver_ricardo_escotto')?.penaltyRefs ?? []).includes('penalty_indy_nxt_2024_6326_car_75_lap_45_disqualification'),
  'INDY NXT Detroit 2024 Escotto result must link to official DQ penalty row'
);
const malformedIndyNxtPenaltyReasons = dataset.penalties
  .filter((row) => String(row.id ?? '').startsWith('penalty_indy_nxt_'))
  .filter((row) => /\b(?:Yield|Drive-Through|Penalty|Pending|Back of|Stop and|No Further|Disqualification|Restart at)\b/i.test(row.reason ?? ''))
  .map((row) => ({ id: row.id, reason: row.reason }));
assert.deepEqual(
  malformedIndyNxtPenaltyReasons,
  [],
  'INDY NXT Results PDF penalty parser must not glue multiple official rows into one reason field'
);
const indyNxtMonterey2024Caution = dataset.incidents.find((row) => row.id === 'incident_indy_nxt_caution_2024_6317_1');
assert.equal(indyNxtMonterey2024Caution?.incidentType, 'caution_contact', 'INDY NXT Monterey 2024 caution must classify official contact reason');
assert.equal(indyNxtMonterey2024Caution?.lapNumber, 6, 'INDY NXT Monterey 2024 caution must use the first official caution lap');
assert.equal(indyNxtMonterey2024Caution?.description, 'Official caution 1 ran from lap 6 to lap 7 for Contact: Car 10 in Turn 5.', 'INDY NXT Monterey 2024 caution must preserve official reason text');
assert.equal(indyNxtMonterey2024Caution?.driverId, 'driver_reece_gold', 'INDY NXT Monterey 2024 caution must map mentioned car 10 to Reece Gold');
assert.ok(
  (indyNxtMonterey2024Caution?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6317_results_pdf'),
  'INDY NXT Monterey 2024 caution must cite official Results PDF provenance'
);
assert.equal(
  dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2024_6317').length,
  674,
  'INDY NXT Monterey 2024 Race 1 must import clean source-visible partial lap-chart samples'
);
assert.ok(
  dataset.sourceEvidence.some((row) => row.id === 'source_indy_nxt_2024_6317_lap_chart_pdf' && /partial/i.test(row.notes ?? '')),
  'INDY NXT Monterey 2024 Race 1 partial lap chart sourceEvidence must record partial import status'
);
assert.ok(
  indyNxtReportDetailsBackfill.partialLapChartImports.some((row) => row.sessionId === 'session_indy_nxt_2024_6317' && row.missingSamples === 1),
  'INDY NXT Monterey 2024 Race 1 must record missing car-lap count in partial import report'
);
const indyNxtAlabama2024EventSummaryMetric = dataset.derivedMetrics.find((row) => row.id === 'metric_indy_nxt_2024_6314_event_summary_race_stats');
assert.deepEqual(
  indyNxtAlabama2024EventSummaryMetric?.metrics,
  {
    totalLaps: 35,
    greenLaps: 33,
    cautionLaps: 2,
    leadChanges: 0,
    leadChangeDrivers: 1,
    totalPasses: 84,
    positionPasses: 65
  },
  'INDY NXT Alabama 2024 Event Summary race stats must import from the official PDF'
);
assert.ok(
  (indyNxtAlabama2024EventSummaryMetric?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6314_event_summary_pdf'),
  'INDY NXT Alabama 2024 Event Summary race stats must cite official Event Summary PDF provenance'
);
const indyNxtAlabama2024MostImproved = dataset.racecraftEvents.find((row) => row.id === 'racecraft_indy_nxt_2024_6314_most_improved_driver_louis_foster');
assert.equal(indyNxtAlabama2024MostImproved?.driverId, 'driver_louis_foster', 'INDY NXT Alabama 2024 most-improved driver must be Louis Foster');
assert.equal(indyNxtAlabama2024MostImproved?.eventType, 'start_gain', 'INDY NXT Alabama 2024 most-improved row must be modeled as a start-gain racecraft event');
assert.equal(indyNxtAlabama2024MostImproved?.positionBefore, 21, 'INDY NXT Alabama 2024 most-improved start position must come from official Event Summary text');
assert.equal(indyNxtAlabama2024MostImproved?.positionAfter, 5, 'INDY NXT Alabama 2024 most-improved finish position must come from official Event Summary text');
assert.equal(indyNxtAlabama2024MostImproved?.raw?.positionsImproved, 16, 'INDY NXT Alabama 2024 most-improved delta must come from official Event Summary text');
assert.ok(
  (indyNxtAlabama2024MostImproved?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6314_event_summary_pdf'),
  'INDY NXT Alabama 2024 most-improved racecraft event must cite official Event Summary PDF provenance'
);
const indyNxtAlabama2024LeaderSummary = dataset.derivedMetrics.find((row) => row.id === 'metric_indy_nxt_2024_6314_leader_lap_summary');
assert.ok(indyNxtAlabama2024LeaderSummary, 'INDY NXT Alabama 2024 Leader Lap Summary metric must import from the official PDF');
assert.equal(
  dataset.derivedMetrics.filter((row) => /^metric_indy_nxt_\d{4}_\d+_leader_lap_summary$/.test(row.id ?? '')).length,
  indyNxtReportDetailsBackfill.leaderLapSummaryMetricsImported,
  'INDY NXT Leader Lap Summary metrics must import every official race-session PDF'
);
assert.equal(
  indyNxtReportDetailsBackfill.leaderLapSummaryFailures.length,
  0,
  'INDY NXT Leader Lap Summary parser must not leave official PDFs unparsed'
);
assert.ok(
  (indyNxtAlabama2024LeaderSummary?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6314_leader_lap_summary_pdf'),
  'INDY NXT Alabama 2024 Leader Lap Summary metric must cite official Leader Lap Summary PDF provenance'
);
assert.equal(
  indyNxtAlabama2024LeaderSummary?.metrics?.laps?.length,
  35,
  'INDY NXT Alabama 2024 Leader Lap Summary must import all 35 official leader-lap rows'
);
assert.equal(
  indyNxtAlabama2024LeaderSummary?.metrics?.uniqueLeaderDriverIds?.length,
  1,
  'INDY NXT Alabama 2024 Leader Lap Summary must import unique leader count from official rows'
);
const indyNxtAlabama2024LeaderLap1 = indyNxtAlabama2024LeaderSummary?.metrics?.laps?.find((row) => row.lapNumber === 1);
assert.equal(indyNxtAlabama2024LeaderLap1?.driverId, 'driver_jacob_abel', 'INDY NXT Alabama 2024 lap 1 leader must map to Jacob Abel');
assert.equal(indyNxtAlabama2024LeaderLap1?.lapTime, '01:43.9028', 'INDY NXT Alabama 2024 lap 1 leader time must parse from official Leader Lap Summary PDF');
assert.equal(indyNxtAlabama2024LeaderLap1?.flagState, 'Green', 'INDY NXT Alabama 2024 lap 1 flag state must parse from official Leader Lap Summary PDF');
const indyNxtAlabama2024LeaderLap35 = indyNxtAlabama2024LeaderSummary?.metrics?.laps?.find((row) => row.lapNumber === 35);
assert.equal(indyNxtAlabama2024LeaderLap35?.flagState, 'Checker', 'INDY NXT Alabama 2024 final leader lap flag must parse from official Leader Lap Summary PDF');
assert.equal(indyNxtAlabama2024LeaderLap35?.gapToSecond, '00:01.3326', 'INDY NXT Alabama 2024 final leader margin must parse from official Leader Lap Summary PDF');
const indyNxtBarber2026LeaderSummary = dataset.derivedMetrics.find((row) => row.id === 'metric_indy_nxt_2026_6752_leader_lap_summary');
assert.equal(
  indyNxtBarber2026LeaderSummary?.metrics?.laps?.length,
  30,
  'INDY NXT Barber 2026 Race 2 Leader Lap Summary must parse rookie-marker multi-line rows'
);
assert.equal(
  indyNxtBarber2026LeaderSummary?.metrics?.laps?.at(-1)?.flagState,
  'Checker',
  'INDY NXT Barber 2026 Race 2 final leader lap must parse from wrapped official row text'
);
const indyNxtAlabama2024TopSections = dataset.derivedMetrics.find((row) => row.id === 'metric_indy_nxt_2024_6314_top_section_times');
assert.ok(indyNxtAlabama2024TopSections, 'INDY NXT Alabama 2024 Top Section Times metric must import from the official PDF');
assert.ok(
  (indyNxtAlabama2024TopSections?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6314_top_section_times_pdf'),
  'INDY NXT Alabama 2024 Top Section Times metric must cite official Top Section Times PDF provenance'
);
const indyNxtAlabama2024LapSection = indyNxtAlabama2024TopSections?.metrics?.sections?.find((section) => section.name === 'Lap');
const indyNxtAlabama2024BryceLapSection = indyNxtAlabama2024LapSection?.rows?.find((row) => row.driverId === 'driver_bryce_aron');
assert.equal(indyNxtAlabama2024LapSection?.lengthMi, 2.3, 'INDY NXT Alabama 2024 overall lap section length must parse from official Top Section Times PDF');
assert.equal(indyNxtAlabama2024BryceLapSection?.rank, 6, 'INDY NXT Alabama 2024 Bryce overall lap rank must parse from official Top Section Times PDF');
assert.equal(indyNxtAlabama2024BryceLapSection?.time, '01:13.0139', 'INDY NXT Alabama 2024 Bryce overall lap time must parse from official Top Section Times PDF');
assert.equal(indyNxtAlabama2024BryceLapSection?.speedMph, 113.403, 'INDY NXT Alabama 2024 Bryce overall lap speed must parse from official Top Section Times PDF');
assert.equal(indyNxtAlabama2024BryceLapSection?.lapNumber, 19, 'INDY NXT Alabama 2024 Bryce overall lap number must parse from official Top Section Times PDF');
const indyNxtAlabama2024Turns56 = indyNxtAlabama2024TopSections?.metrics?.sections?.find((section) => section.name === 'Turns 5-6');
const indyNxtAlabama2024BryceTurns56 = indyNxtAlabama2024Turns56?.rows?.find((row) => row.driverId === 'driver_bryce_aron');
assert.equal(indyNxtAlabama2024BryceTurns56?.rank, 5, 'INDY NXT Alabama 2024 Bryce Turns 5-6 rank must parse from official Top Section Times PDF');
assert.equal(indyNxtAlabama2024BryceTurns56?.time, '00:05.7302', 'INDY NXT Alabama 2024 Bryce Turns 5-6 time must parse from official Top Section Times PDF');
const indyNxtStPete2024QualTopSections = dataset.derivedMetrics.find((row) => row.id === 'metric_indy_nxt_2024_6346_top_section_times');
assert.ok(indyNxtStPete2024QualTopSections, 'INDY NXT St. Petersburg 2024 qualifying Top Section Times metric must import from the official PDF');
assert.ok(
  (indyNxtStPete2024QualTopSections?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6346_top_section_times_pdf'),
  'INDY NXT St. Petersburg 2024 qualifying Top Section Times metric must cite official PDF provenance'
);
const indyNxtStPete2024QualLapSection = indyNxtStPete2024QualTopSections?.metrics?.sections?.find((section) => section.name === 'Lap');
const indyNxtStPete2024QualBryceLapSection = indyNxtStPete2024QualLapSection?.rows?.find((row) => row.driverId === 'driver_bryce_aron');
assert.equal(indyNxtStPete2024QualLapSection?.lengthMi, 1.8, 'INDY NXT St. Petersburg 2024 qualifying lap section length must parse from official Top Section Times PDF');
assert.equal(indyNxtStPete2024QualBryceLapSection?.rank, 4, 'INDY NXT St. Petersburg 2024 Bryce qualifying lap rank must parse from official Top Section Times PDF');
assert.equal(indyNxtStPete2024QualBryceLapSection?.time, '01:04.8883', 'INDY NXT St. Petersburg 2024 Bryce qualifying lap time must parse from official Top Section Times PDF');
assert.equal(indyNxtStPete2024QualBryceLapSection?.speedMph, 99.864, 'INDY NXT St. Petersburg 2024 Bryce qualifying lap speed must parse from official Top Section Times PDF');
assert.equal(indyNxtStPete2024QualBryceLapSection?.lapNumber, 5, 'INDY NXT St. Petersburg 2024 Bryce qualifying lap number must parse from official Top Section Times PDF');
const indyNxtStPete2024QualSectionResults = dataset.derivedMetrics.find((row) => row.id === 'metric_indy_nxt_2024_6346_section_results');
assert.ok(indyNxtStPete2024QualSectionResults, 'INDY NXT St. Petersburg 2024 qualifying Section Results metric must import from the official PDF');
assert.ok(
  (indyNxtStPete2024QualSectionResults?.provenanceRefs ?? []).includes('source_indy_nxt_2024_6346_section_results_pdf'),
  'INDY NXT St. Petersburg 2024 qualifying Section Results metric must cite official Section Results PDF provenance'
);
const indyNxtStPete2024QualBryceSectionCar = indyNxtStPete2024QualSectionResults?.metrics?.cars?.find((row) => row.driverId === 'driver_bryce_aron');
const indyNxtStPete2024QualBryceSectionLap5 = indyNxtStPete2024QualBryceSectionCar?.laps?.find((row) => row.lapNumber === 5);
const indyNxtStPete2024QualBryceSectionLap5Overall = indyNxtStPete2024QualBryceSectionLap5?.sections?.find((row) => row.name === 'Lap');
const indyNxtStPete2024QualBryceSectionLap5Turn1 = indyNxtStPete2024QualBryceSectionLap5?.sections?.find((row) => row.name === 'Turn 1');
assert.equal(indyNxtStPete2024QualBryceSectionCar?.carNumber, '27', 'INDY NXT St. Petersburg 2024 Bryce Section Results car number must parse from official PDF');
assert.equal(indyNxtStPete2024QualBryceSectionLap5Overall?.timeSeconds, 64.8883, 'INDY NXT St. Petersburg 2024 Bryce lap 5 official Section Results lap time must parse from the official PDF');
assert.equal(indyNxtStPete2024QualBryceSectionLap5Overall?.speedMph, 99.864, 'INDY NXT St. Petersburg 2024 Bryce lap 5 official Section Results lap speed must parse from the official PDF');
assert.equal(indyNxtStPete2024QualBryceSectionLap5Turn1?.timeSeconds, 6.3801, 'INDY NXT St. Petersburg 2024 Bryce lap 5 official Section Results Turn 1 time must parse from the official PDF');
assert.equal(indyNxtStPete2024QualBryceSectionCar?.laps.some((row) => row.lapNumber === 0), true, 'Official Section Results lap 0 must remain available when the PDF exposes an outlap');
assert.equal(indyNxtStPete2024QualBryceSectionCar?.laps.some((row) => row.lapNumber === 10), false, 'A proven repeated terminal row beyond the official St. Petersburg lap count must be excluded');

const recentBryceQualifying = new Map(dataset.qualifyingResults
  .filter((row) => row.driverId === 'driver_bryce_aron')
  .map((row) => [row.sessionId, row]));
for (const [sessionId, position, laps, bestLapTime, sourceId] of [
  ['session_indy_nxt_2026_6900', 8, 10, '01:02.5843', 'source_indynxt_events_session_6900'],
  ['session_indy_nxt_2026_6935', 14, 2, null, 'source_indynxt_events_session_6935'],
  ['session_indy_nxt_2026_6950', 4, 8, '01:14.2164', 'source_indynxt_events_session_6950'],
  ['session_indy_nxt_2026_6953', 5, 8, '01:14.4413', 'source_indynxt_events_session_6953'],
  ['session_indy_nxt_2026_6954', 10, null, '01:14.4413', 'source_indynxt_events_session_6954']
]) {
  const qualifying = recentBryceQualifying.get(sessionId);
  assert.deepEqual([qualifying?.position, qualifying?.laps, qualifying?.bestLapTime], [position, laps, bestLapTime], `${sessionId} must preserve its official Bryce qualifying classification`);
  assert.ok((qualifying?.provenanceRefs ?? []).includes(sourceId), `${sessionId} must cite its official EventsSessionDetails source`);
}

const officialSectionMetrics = dataset.derivedMetrics.filter((row) => row.metricType === 'official_section_results');
for (const metric of officialSectionMetrics) {
  const carNumbers = metric.metrics.cars.map((row) => row.carNumber);
  assert.equal(new Set(carNumbers).size, carNumbers.length, `${metric.id} continuation pages must merge to one record per car`);
  for (const car of metric.metrics.cars) {
    const lapNumbers = car.laps.map((row) => row.lapNumber);
    assert.equal(new Set(lapNumbers).size, lapNumbers.length, `${metric.id} car ${car.carNumber} continuation pages must merge to one record per lap`);
  }
  const actualNames = [...new Set(metric.metrics.cars.flatMap((car) => car.laps.flatMap((lap) => lap.sections.map((section) => section.name))))];
  assert.deepEqual(metric.metrics.sectionNames, actualNames, `${metric.id} section-name metadata must describe retained canonical section values only`);
}
const sectionMetric = (sessionId) => dataset.derivedMetrics.find((row) => row.id === `metric_indy_nxt_2026_${sessionId}_section_results`);
for (const [sessionId, expectedNames] of [
  ['6754', ['I13A to I14', 'I14 to I15C', 'I15C to I15']],
  ['6755', ['Turn 1 Entry', 'Turn 1 Exit', 'Turn 2 Entry', 'BackStretch Entry', 'BackStretch Exit', 'Turn 4 Entry', 'Turn 4 Exit']],
  ['6756', ['Turn 4/5/6', 'Backstretch']]
]) {
  const names = sectionMetric(sessionId)?.metrics?.sectionNames ?? [];
  for (const name of expectedNames) assert.ok(names.includes(name), `session ${sessionId} must preserve official section column ${name}`);
}
for (const [sessionId, expectedLaps, bestLapNumber, bestLapSeconds] of [
  ['6900', 10, 8, 62.5843],
  ['6935', 2, 2, 24.0464],
  ['6950', 8, 8, 74.2164]
]) {
  const metric = sectionMetric(sessionId);
  const car = metric?.metrics?.cars?.find((row) => row.driverId === 'driver_bryce_aron');
  assert.equal(car?.laps.filter((row) => row.lapNumber > 0).length, expectedLaps, `session ${sessionId} must retain all and only Bryce's official completed qualifying laps`);
  assert.equal(car?.laps.some((row) => row.lapNumber === expectedLaps + 1), false, `session ${sessionId} must exclude its proven repeated terminal row`);
  assert.equal(car?.laps.find((row) => row.lapNumber === bestLapNumber)?.sections.find((row) => row.name === 'Lap')?.timeSeconds, bestLapSeconds, `session ${sessionId} Section Results must align with Bryce's official qualifying time`);
  const evidence = dataset.sourceEvidence.find((row) => row.id === metric?.provenanceRefs?.[0]);
  assert.match(evidence?.url ?? '', /^http:\/\/www\.imscdn\.com\//, `session ${sessionId} must cite the working official report URL`);
}
const nashvilleBryceSectionCar = sectionMetric('6755')?.metrics?.cars?.find((row) => row.driverId === 'driver_bryce_aron');
assert.equal(nashvilleBryceSectionCar?.laps.filter((row) => row.lapNumber > 0).length, 65, 'Nashville 2026 must retain Bryce\'s 65 completed race laps');
assert.deepEqual(nashvilleBryceSectionCar?.terminalRowsExcluded, [66], 'Nashville 2026 must exclude the repeated terminal lap 66 row');
assert.equal(indyNxtReportDetailsBackfill.topSectionMetricsImported, indyNxtReportDetailsBackfill.topSectionReportsParsed, 'INDY NXT report-detail backfill must import one metric per parsed official Top Section Times PDF');
assert.equal(indyNxtReportDetailsBackfill.topSectionReportsParsed + indyNxtReportDetailsBackfill.topSectionReportsHeldOut.length + indyNxtReportDetailsBackfill.topSectionFailures.length, indyNxtReportDetailsBackfill.topSectionReportsDiscovered, 'Every official Top Section Times PDF must be parsed, explicitly held out, or reported as a parser failure');
assert.equal(indyNxtReportDetailsBackfill.sectionResultsMetricsImported, indyNxtReportDetailsBackfill.sectionResultsReportsParsed, 'INDY NXT report-detail backfill must import one metric per parsed official Section Results PDF');
assert.equal(indyNxtReportDetailsBackfill.sectionResultsReportsParsed + indyNxtReportDetailsBackfill.sectionResultsReportsHeldOut.length + indyNxtReportDetailsBackfill.sectionResultsFailures.length, indyNxtReportDetailsBackfill.sectionResultsReportsDiscovered, 'Every official Section Results PDF must be parsed, explicitly held out, or reported as a parser failure');
assert.deepEqual(indyNxtReportDetailsBackfill.sectionResultsFailures, [], 'INDY NXT Section Results parser must not leave parser failures');
assert.deepEqual(
  indyNxtReportDetailsBackfill.sectionResultsReportsHeldOut,
  [
    {
      sessionId: 'session_indy_nxt_2024_6325',
      reason: 'official_pdf_corrupt_or_truncated',
      sessionName: 'Race',
      url: 'http://www.imscdn.com/INDYCAR/Documents/6325/2024-05-11/indynxt-sectionresults-r2.pdf'
    },
    {
      sessionId: 'session_indy_nxt_2025_6596',
      reason: 'official_report_has_no_section_rows',
      sessionName: 'Qualifications',
      url: 'http://www.imscdn.com/INDYCAR/Documents/6596/2025-07-11/indynxt-sectionresults-quals.pdf'
    }
  ],
  'INDY NXT held-out Section Results reports must preserve canceled and malformed official evidence'
);
assert.deepEqual(indyNxtReportDetailsBackfill.topSectionFailures, [], 'INDY NXT expanded Top Section Times parser must not leave parser failures');
assert.deepEqual(
  indyNxtReportDetailsBackfill.topSectionReportsHeldOut,
  [{
    sessionId: 'session_indy_nxt_2025_6596',
    reason: 'official_report_has_no_section_rows',
    sessionName: 'Qualifications',
    url: 'http://www.imscdn.com/INDYCAR/Documents/6596/2025-07-11/indynxt-topsectiontimes-quals.pdf'
  }],
  'INDY NXT canceled Iowa 2025 qualifying Top Section Times report must be held out as no-row official evidence'
);
assert.equal(indyNxtReportDetailsBackfill.resultsReportsParsed + indyNxtReportDetailsBackfill.resultsReportFailures.length, indyNxtReportDetailsBackfill.resultsReportsDiscovered, 'Every official race Results PDF must parse or expose a failure');
assert.deepEqual(indyNxtReportDetailsBackfill.resultsReportFailures, [], 'INDY NXT race Results PDF parser must not treat qualifying results as penalty/caution failures');
const indyNxtStPete2026LapSamples = dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2026_6751');
const indyNxtStPete2026BryceLapSamples = indyNxtStPete2026LapSamples
  .filter((row) => row.driverId === 'driver_bryce_aron')
  .sort((a, b) => a.lapNumber - b.lapNumber);
assert.equal(indyNxtStPete2026LapSamples.length, 901, 'INDY NXT St. Petersburg 2026 official lap chart should import validated multi-page position samples');
assert.deepEqual(
  indyNxtStPete2026BryceLapSamples.map((row) => row.position),
  [17, 17, 17, 17, 17, 17, 17, 17, 17, 18, 18, 18, 18, 18, 18, 17, 16, 16, 16, 17, 18, 17, 16, 16, 16, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18],
  'INDY NXT St. Petersburg 2026 Bryce lap positions must use the official multi-page Race Lap Chart continuation header'
);
assert.equal(
  indyNxtReportDetailsBackfill.parserFailures.some((row) => row.sessionId === 'session_indy_nxt_2026_6751'),
  false,
  'INDY NXT St. Petersburg 2026 lap chart must not remain held out after continuation-lap parsing'
);
assert.equal(
  indyNxtReportDetailsBackfill.lapChartsPartiallyParsed,
  indyNxtReportDetailsBackfill.partialLapChartImports.length,
  'INDY NXT report-detail backfill partial count must match its explicit partial-import ledger'
);
assert.equal(
  indyNxtReportDetailsBackfill.partialLapSamplesImported,
  indyNxtReportDetailsBackfill.partialLapChartImports.reduce((total, row) => total + row.samplesImported, 0),
  'INDY NXT report-detail backfill must reconcile source-visible samples imported from partial lap charts'
);
assert.equal(
  indyNxtReportDetailsBackfill.parserFailures.length,
  0,
  'INDY NXT report-detail backfill must clear lap-chart parser failures after preserving official DQ/result-lap conflicts'
);
const indyNxtDetroit2024Race1PartialLapChart = indyNxtReportDetailsBackfill.partialLapChartImports.find((row) => row.sessionId === 'session_indy_nxt_2024_6326');
assert.equal(
  indyNxtDetroit2024Race1PartialLapChart?.samplesImported,
  841,
  'INDY NXT Detroit 2024 Race 1 must import clean source-visible chart samples across safe official extraction candidates'
);
assert.equal(
  indyNxtDetroit2024Race1PartialLapChart?.missingSamples,
  0,
  'INDY NXT Detroit 2024 Race 1 must recover the source-visible car 39 lap sample from an alternate official extraction'
);
assert.deepEqual(
  indyNxtDetroit2024Race1PartialLapChart?.missingByCar,
  [],
  'INDY NXT Detroit 2024 Race 1 must not report missing expected car-lap samples after safe supplementation'
);
assert.deepEqual(
  indyNxtDetroit2024Race1PartialLapChart?.resultLapConflicts,
  [{ carNumber: '75', expected: 0, parsed: 7, status: 'unknown', reason: 'official_result_zero_laps_with_source_visible_lap_chart_samples' }],
  'INDY NXT Detroit 2024 Race 1 partial report must preserve car 75 official result/chart conflict'
);
const indyNxtDetroit2024Race1LapSamples = dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2024_6326');
assert.equal(
  indyNxtDetroit2024Race1LapSamples.length,
  841,
  'INDY NXT Detroit 2024 Race 1 partial lap chart must import visible chart samples'
);
assert.deepEqual(
  indyNxtDetroit2024Race1LapSamples
    .filter((row) => row.carNumber === '39' && row.lapNumber === 2)
    .map((row) => row.position),
  [21],
  'INDY NXT Detroit 2024 Race 1 must import the official source-visible car 39 lap-2 position'
);
assert.equal(
  indyNxtDetroit2024Race1LapSamples.filter((row) => row.driverId === 'driver_bryce_aron').length,
  2,
  'INDY NXT Detroit 2024 Race 1 must import Bryce source-visible lap chart samples'
);
assert.equal(
  indyNxtDetroit2024Race1LapSamples.filter((row) => row.carNumber === '75').length,
  7,
  'INDY NXT Detroit 2024 Race 1 must preserve source-visible car 75 chart samples despite official DQ/zero-lap result'
);
assert.ok(
  indyNxtDetroit2024Race1LapSamples
    .filter((row) => row.carNumber === '75')
    .every((row) => row.raw?.officialResultLapConflict === true),
  'INDY NXT Detroit 2024 Race 1 car 75 samples must carry official result/chart conflict metadata'
);

const teamUsaSourceIds = [
  'source_team_usa_2020_winners_announcement',
  'source_team_usa_2020_bryce_aron_blog',
  'source_team_usa_2020_walter_hayes_report'
];
for (const sourceId of teamUsaSourceIds) {
  assert.ok(
    dataset.sourceEvidence.some((row) => row.id === sourceId && row.confidenceTier === 'official'),
    `${sourceId} must exist as official Team USA source evidence`
  );
}
const teamUsaAssets = dataset.mediaAssets.filter((row) => String(row.id).startsWith('asset_team_usa_2020_'));
assert.equal(teamUsaAssets.length, 3, 'Team USA 2020 context must be represented by three link-only narrative assets');
assert.ok(
  teamUsaAssets.every((row) => row.driverId === 'driver_bryce_aron' && row.rightsStatus === 'link_only'),
  'Team USA context assets must be tied to Bryce and remain link-only'
);
assert.ok(
  teamUsaAssets.some((row) => /2018 BKC TaG Jr champion/i.test(row.summary ?? '') && /Yamaha KT100 runner-up/i.test(row.summary ?? '')),
  'Team USA Bryce blog asset must preserve source-backed karting milestone context'
);
assert.ok(
  teamUsaAssets.some((row) => /Walter Hayes Trophy Grand Final P3/i.test(row.summary ?? '') && /started ninth/i.test(row.summary ?? '')),
  'Team USA Walter Hayes asset must preserve source-backed podium narrative context'
);
const assertCareerMetric = ({ id, sourceId, metricType, value, confidence = 'official', label }) => {
  const metric = dataset.derivedMetrics.find((row) => row.id === id);
  assert.equal(metric?.scope, 'career', `${label} must be stored at career grain`);
  assert.equal(metric?.driverId, 'driver_bryce_aron', `${label} must link to Bryce`);
  assert.equal(metric?.metricType, metricType, `${label} must preserve milestone type`);
  assert.deepEqual(metric?.metrics, value, `${label} must preserve structured milestone value`);
  assert.equal(metric?.confidence, confidence, `${label} must use expected confidence`);
  assert.ok((metric?.provenanceRefs ?? []).includes(sourceId), `${label} must cite source evidence`);
};
assertCareerMetric({
  id: 'metric_team_usa_2020_scholarship_selection',
  sourceId: 'source_team_usa_2020_winners_announcement',
  metricType: 'career_award',
  value: {
    award: 'Team USA Scholarship winner',
    year: 2020,
    coWinners: ['Jackson Lee', 'Simon Sikes'],
    plannedEventFamilies: ['Formula Ford Festival', 'Walter Hayes Trophy', 'Avon National Formula Ford 1600']
  },
  label: 'Team USA 2020 scholarship selection milestone'
});
assertCareerMetric({
  id: 'metric_team_usa_2020_bkc_tag_jr_champion',
  sourceId: 'source_team_usa_2020_bryce_aron_blog',
  metricType: 'karting_championship_milestone',
  value: { championship: 'BKC TaG Jr. Championship', position: 1, year: 2018 },
  label: 'Team USA sourced BKC TaG Jr champion milestone'
});
assertCareerMetric({
  id: 'metric_team_usa_2020_yamaha_kt100_runner_up',
  sourceId: 'source_team_usa_2020_bryce_aron_blog',
  metricType: 'karting_championship_milestone',
  value: { championship: 'Yamaha KT100 championship', position: 2, year: 2018 },
  label: 'Team USA sourced Yamaha KT100 runner-up milestone'
});
assertCareerMetric({
  id: 'metric_team_usa_2020_frp_f1600_podiums_context',
  sourceId: 'source_team_usa_2020_bryce_aron_blog',
  metricType: 'season_context_milestone',
  value: { series: 'FRP F1600 Championship Series', championshipPosition: 3, podiums: 8, year: 2019 },
  label: 'Team USA sourced FRP F1600 season-context milestone'
});
assertCareerMetric({
  id: 'metric_badger_kart_club_2016_yamaha_junior_fast_time',
  sourceId: 'source_badger_kart_club_2016_fast_times_track_records',
  metricType: 'karting_fast_time',
  value: {
    organization: 'Badger Kart Club',
    track: 'Badger Kart Club',
    configuration: null,
    className: 'Yamaha Junior',
    date: '2016-08-06',
    lapTime: '40.536',
    recordTable: '2016 Fast Times'
  },
  label: 'Badger Kart Club 2016 Yamaha Junior Bryce fast-time row'
});
assertCareerMetric({
  id: 'metric_badger_kart_club_2017_classic_tag_junior_fast_time',
  sourceId: 'source_badger_kart_club_2017_fast_times_track_records',
  metricType: 'karting_fast_time',
  value: {
    organization: 'Badger Kart Club',
    track: 'Badger Kart Club',
    configuration: 'Classic Track',
    className: 'TaG Junior',
    date: '2017-06-11',
    lapTime: '38.938',
    recordTable: '2017 Fast Times'
  },
  label: 'Badger Kart Club 2017 Classic Track TaG Junior Bryce fast-time row'
});
assertCareerMetric({
  id: 'metric_badger_kart_club_2017_bus_stop_tag_junior_track_record',
  sourceId: 'source_badger_kart_club_2017_fast_times_track_records',
  metricType: 'karting_track_record',
  value: {
    organization: 'Badger Kart Club',
    track: 'Badger Kart Club',
    configuration: 'Bus Stop',
    className: 'TaG Junior',
    date: '2017-10-09',
    lapTime: '39.070',
    recordTable: 'Track Records'
  },
  label: 'Badger Kart Club 2017 Bus Stop TaG Junior Bryce track-record row'
});

const indyNxtRaceControlWindows = [
  ['session_indy_nxt_2026_6850', '2026-05-29T14:00:00', '2026-05-29T14:00:00', '2026-05-29T14:45:00'],
  ['session_indy_nxt_2026_6851', '2026-05-30T08:00:00', '2026-05-30T08:00:00', '2026-05-30T08:45:00'],
  ['session_indy_nxt_2026_6852', '2026-05-30T12:00:00', '2026-05-30T12:00:00', '2026-05-30T12:12:00'],
  ['session_indy_nxt_2026_6853', '2026-05-30T12:18:00', '2026-05-30T12:18:00', '2026-05-30T12:30:00'],
  ['session_indy_nxt_2026_6854', '2026-05-30T12:30:00', '2026-05-30T12:30:00', '2026-05-30T12:35:00'],
  ['session_indy_nxt_2026_6749', '2026-05-31T10:30:00', '2026-05-31T10:36:00', '2026-05-31T11:30:00'],
  ['session_indy_nxt_2026_6863', '2026-06-06T14:00:00', '2026-06-06T14:05:00', '2026-06-06T15:00:00'],
  ['session_indy_nxt_2026_6864', '2026-06-06T17:00:00', '2026-06-06T17:05:00', '2026-06-06T18:00:00'],
  ['session_indy_nxt_2026_6763', '2026-06-07T16:30:00', '2026-06-07T16:35:00', '2026-06-07T17:30:00']
];
for (const [sessionId, scheduledStart, actualStart, scheduledEnd] of indyNxtRaceControlWindows) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must store official Race Control scheduled start in the event local timezone`);
  assert.equal(session?.actualStart, actualStart, `${sessionId} must store official Race Control estimated green flag in the event local timezone`);
  assert.equal(session?.scheduledEnd, scheduledEnd, `${sessionId} must store official Race Control scheduled end in the event local timezone`);
  assert.equal(session?.timeSource, 'official_race_control_trackactivity', `${sessionId} must mark Race Control trackactivity as the time source`);
  assert.ok(session?.timezone, `${sessionId} must retain track timezone for weather joins`);
  assert.equal(session?.raw?.raceControlTrackActivityWindow?.sourceTimezone, 'UTC', `${sessionId} must record Race Control feed timezone semantics`);
  assert.ok(
    (session?.provenanceRefs ?? []).includes('source_indy_nxt_2026_race_control_trackactivity_schedule'),
    `${sessionId} must cite official Race Control trackactivity provenance`
  );
}

const indyNxtScheduleFeedWindows = [
  ['session_indy_nxt_2026_6766', '2026-02-27T12:30:00', '2026-02-27T13:30:00'],
  ['session_indy_nxt_2026_6767', '2026-02-28T08:30:00', '2026-02-28T09:30:00'],
  ['session_indy_nxt_2026_6751', '2026-03-01T10:00:00', '2026-03-01T11:00:00'],
  ['session_indy_nxt_2026_6783', '2026-03-13T14:00:00', '2026-03-13T15:00:00'],
  ['session_indy_nxt_2026_6784', '2026-03-14T10:00:00', '2026-03-14T11:00:00'],
  ['session_indy_nxt_2026_6753', '2026-03-15T09:30:00', '2026-03-15T10:30:00'],
  ['session_indy_nxt_2026_6804', '2026-03-27T13:30:00', '2026-03-27T14:30:00'],
  ['session_indy_nxt_2026_6752', '2026-03-29T10:00:00', '2026-03-29T11:00:00'],
  ['session_indy_nxt_2026_6828', '2026-05-08T08:00:00', '2026-05-08T09:00:00'],
  ['session_indy_nxt_2026_6756', '2026-05-08T16:00:00', '2026-05-08T17:00:00'],
  ['session_indy_nxt_2026_6765', '2026-05-09T14:30:00', '2026-05-09T15:30:00']
];
for (const [sessionId, scheduledStart, scheduledEnd] of indyNxtScheduleFeedWindows) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must store official Race Control schedule-feed start in the event local timezone`);
  assert.equal(session?.scheduledEnd, scheduledEnd, `${sessionId} must store official Race Control schedule-feed end in the event local timezone`);
  assert.equal(session?.actualStart ?? null, null, `${sessionId} must not treat schedule-feed broadcast time as actual start`);
  assert.equal(session?.timeSource, 'official_race_control_schedule', `${sessionId} must mark Race Control schedule feed as the time source`);
  assert.equal(session?.raw?.raceControlScheduleWindow?.sourceTimezone, 'UTC', `${sessionId} must record schedule-feed timezone semantics`);
  assert.ok(
    (session?.provenanceRefs ?? []).includes('source_indy_nxt_2026_race_control_schedule'),
    `${sessionId} must cite official Race Control schedule-feed provenance`
  );
}

const indyNxtScheduleGreenFlagWindows = [
  ['session_indy_nxt_2026_6750', '2026-03-28T12:00:00']
];
for (const [sessionId, scheduledStart] of indyNxtScheduleGreenFlagWindows) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must store official Race Control event green-flag time in the event local timezone`);
  assert.equal(session?.actualStart ?? null, null, `${sessionId} must not treat scheduled green-flag time as post-session actual start`);
  assert.equal(session?.timeSource, 'official_race_control_schedule_green_flag', `${sessionId} must mark Race Control green-flag field as the time source`);
  assert.equal(session?.raw?.raceControlScheduleGreenFlagWindow?.sourceTimezone, 'UTC', `${sessionId} must record green-flag source timezone semantics`);
  assert.ok(
    (session?.provenanceRefs ?? []).includes('source_indy_nxt_2026_race_control_schedule'),
    `${sessionId} must cite official Race Control schedule-feed provenance`
  );
}

const roadAmericaRace1Event = dataset.events.find((row) => row.id === 'event_indy_nxt_2026_5545');
assert.equal(roadAmericaRace1Event?.trackId, 'track_road_america', 'Road America Race 1 schedule-only event must use sourced track metadata');
assert.equal(roadAmericaRace1Event?.eventStartDate, '2026-06-19', 'Road America Race 1 event start date must derive from official Race Control trackactivity windows');
assert.equal(roadAmericaRace1Event?.eventEndDate, '2026-06-20', 'Road America Race 1 event end date must derive from official Race Control trackactivity windows');
assert.equal(roadAmericaRace1Event?.timezone, 'America/Chicago', 'Road America Race 1 schedule-only event must carry track timezone');
assert.ok((roadAmericaRace1Event?.provenanceRefs ?? []).includes('source_indy_nxt_2026_race_control_schedule'), 'Road America Race 1 event must cite Race Control schedule provenance');

const roadAmericaRace1TrackactivitySessions = [
  ['session_indy_nxt_2026_6869', 'Practice', 'practice', '2026-06-19T14:00:00', '2026-06-19T14:00:00'],
  ['session_indy_nxt_2026_6870', 'Qualifying - Race 1 Group 1', 'qualifying', '2026-06-20T09:00:00', '2026-06-20T09:00:00'],
  ['session_indy_nxt_2026_6871', 'Qualifying - Race 1 Group 2', 'qualifying', '2026-06-20T09:18:00', '2026-06-20T09:18:00'],
  ['session_indy_nxt_2026_6872', 'Combined Qualifying - Race 1', 'qualifying', '2026-06-20T09:30:00', '2026-06-20T09:30:00'],
  ['session_indy_nxt_2026_6762', 'Race', 'race', '2026-06-20T11:30:00', '2026-06-20T11:36:00']
];
for (const [sessionId, sessionName, sessionType, scheduledStart, actualStart] of roadAmericaRace1TrackactivitySessions) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.eventId, 'event_indy_nxt_2026_5545', `${sessionId} must attach to the official Road America Race 1 event`);
  assert.equal(session?.sessionName, sessionName, `${sessionId} must preserve the Race Control session label`);
  assert.equal(session?.sessionType, sessionType, `${sessionId} must normalize the Race Control session type`);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must convert source UTC start to Road America local time`);
  assert.equal(session?.actualStart, actualStart, `${sessionId} must convert source estimated green flag to event-local actualStart`);
  assert.equal(session?.scheduledEnd?.startsWith(scheduledStart.slice(0, 10)), true, `${sessionId} must retain an event-local scheduled end`);
  assert.equal(session?.timezone, 'America/Chicago', `${sessionId} must retain Road America timezone`);
  assert.equal(session?.timeSource, 'official_race_control_trackactivity', `${sessionId} must mark official Race Control timing after the INDY NXT API result import`);
  assert.equal(session?.ingestionState ?? null, null, `${sessionId} must not remain schedule-only after official API rows are imported`);
  assert.ok((session?.provenanceRefs ?? []).includes('source_indy_nxt_2026_race_control_trackactivity_schedule'), `${sessionId} must cite Race Control trackactivity provenance`);
  assert.ok(
    (session?.provenanceRefs ?? []).some((ref) => /^source_indynxt_events_session_/.test(ref)),
    `${sessionId} must cite the official INDY NXT EventsSessionDetails API source`
  );
  assert.equal(dataset.results.some((row) => row.sessionId === sessionId), true, `${sessionId} must retain sourced official API result/classification rows`);
}

const indyNxtWeekendSchedulePdfWindows2024 = [
  ['session_indy_nxt_2024_6328', '2024-03-08T13:35:00', 'stp'],
  ['session_indy_nxt_2024_6329', '2024-03-09T08:25:00', 'stp'],
  ['session_indy_nxt_2024_6324', '2024-03-10T10:00:00', 'stp'],
  ['session_indy_nxt_2024_6354', '2024-04-26T13:30:00', 'ala'],
  ['session_indy_nxt_2024_6355', '2024-04-27T10:05:00', 'ala'],
  ['session_indy_nxt_2024_6314', '2024-04-28T10:05:00', 'ala'],
  ['session_indy_nxt_2024_6365', '2024-05-10T11:05:00', 'ims'],
  ['session_indy_nxt_2024_6315', '2024-05-10T18:10:00', 'ims'],
  ['session_indy_nxt_2024_6325', '2024-05-11T13:00:00', 'ims'],
  ['session_indy_nxt_2024_6391', '2024-05-31T13:50:00', 'det'],
  ['session_indy_nxt_2024_6392', '2024-06-01T08:00:00', 'det'],
  ['session_indy_nxt_2024_6326', '2024-06-02T10:20:00', 'det'],
  ['session_indy_nxt_2024_6402', '2024-06-07T13:50:00', 'ra'],
  ['session_indy_nxt_2024_6403', '2024-06-08T09:00:00', 'ra'],
  ['session_indy_nxt_2024_6316', '2024-06-09T12:05:00', 'ra'],
  ['session_indy_nxt_2024_6413', '2024-06-21T13:10:00', 'lag'],
  ['session_indy_nxt_2024_6414', '2024-06-21T15:40:00', 'lag'],
  ['session_indy_nxt_2024_6317', '2024-06-22T12:25:00', 'lag'],
  ['session_indy_nxt_2024_6327', '2024-06-23T12:55:00', 'lag'],
  ['session_indy_nxt_2024_6426', '2024-07-05T14:05:00', 'mid'],
  ['session_indy_nxt_2024_6427', '2024-07-06T09:40:00', 'mid'],
  ['session_indy_nxt_2024_6318', '2024-07-07T11:15:00', 'mid'],
  ['session_indy_nxt_2024_6437', '2024-07-12T13:00:00', 'iow'],
  ['session_indy_nxt_2024_6438', '2024-07-12T17:30:00', 'iow'],
  ['session_indy_nxt_2024_6319', '2024-07-13T13:05:00', 'iow'],
  ['session_indy_nxt_2024_6480', '2024-08-16T14:15:00', 'stl'],
  ['session_indy_nxt_2024_6481', '2024-08-16T17:45:00', 'stl'],
  ['session_indy_nxt_2024_6320', '2024-08-17T14:55:00', 'stl'],
  ['session_indy_nxt_2024_6494', '2024-08-23T13:45:00', 'por'],
  ['session_indy_nxt_2024_6495', '2024-08-24T11:20:00', 'por'],
  ['session_indy_nxt_2024_6321', '2024-08-25T10:10:00', 'por'],
  ['session_indy_nxt_2024_6505', '2024-08-30T13:30:00', 'mil'],
  ['session_indy_nxt_2024_6506', '2024-08-31T12:00:00', 'mil'],
  ['session_indy_nxt_2024_6322', '2024-08-31T14:50:00', 'mil'],
  ['session_indy_nxt_2024_6488', '2024-09-14T09:00:00', 'nsh'],
  ['session_indy_nxt_2024_6490', '2024-09-14T12:00:00', 'nsh'],
  ['session_indy_nxt_2024_6489', '2024-09-14T14:45:00', 'nsh'],
  ['session_indy_nxt_2024_6323', '2024-09-15T10:50:00', 'nsh']
];
for (const [sessionId, scheduledStart, scheduleKey] of indyNxtWeekendSchedulePdfWindows2024) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must store official 2024 weekend-schedule PDF start time`);
  assert.equal(session?.actualStart ?? null, null, `${sessionId} must not treat 2024 weekend-schedule race timing as actualStart`);
  assert.equal(session?.timeSource, 'official_indycar_weekend_schedule_pdf', `${sessionId} must mark the official weekend schedule PDF as the time source`);
  assert.equal(session?.raw?.indycarWeekendScheduleWindow?.scheduleYear, 2024, `${sessionId} must retain the source schedule year`);
  assert.equal(session?.raw?.indycarWeekendScheduleWindow?.scheduleKey, scheduleKey, `${sessionId} must retain the source schedule key`);
  assert.equal(session?.raw?.indycarWeekendScheduleWindow?.parser, 'pdftotext_layout', `${sessionId} must retain the 2024 PDF parser`);
  assert.ok(
    (session?.provenanceRefs ?? []).includes(`source_indy_nxt_2024_weekend_schedule_${scheduleKey}`),
    `${sessionId} must cite its official 2024 weekend schedule PDF source`
  );
}

const indyNxtWeekendSchedulePdfWindows = [
  ['session_indy_nxt_2025_6515', '2025-02-28T14:00:00', 'stp', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6516', '2025-03-01T09:00:00', 'stp', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6446', '2025-03-02T10:00:00', 'stp', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6611', '2025-05-02T13:30:00', 'ala', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6612', '2025-05-03T09:00:00', 'ala', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6445', '2025-05-04T10:30:00', 'ala', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6627', '2025-05-09T11:00:00', 'ims', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6444', '2025-05-09T19:00:00', 'ims', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6443', '2025-05-10T13:00:00', 'ims', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6639', '2025-05-30T14:00:00', 'det', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6640', '2025-05-31T08:00:00', 'det', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6455', '2025-06-01T10:30:00', 'det', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6667', '2025-06-14T15:15:00', 'stl', 'tesseract_ocr'],
  ['session_indy_nxt_2025_6599', '2025-06-14T19:00:00', 'stl', 'tesseract_ocr'],
  ['session_indy_nxt_2025_6454', '2025-06-15T15:30:00', 'stl', 'tesseract_ocr'],
  ['session_indy_nxt_2025_6675', '2025-06-20T14:30:00', 'ra', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6676', '2025-06-21T09:00:00', 'ra', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6453', '2025-06-22T10:00:00', 'ra', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6679', '2025-07-04T15:00:00', 'mid', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6680', '2025-07-05T08:30:00', 'mid', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6452', '2025-07-06T10:30:00', 'mid', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6690', '2025-07-11T13:30:00', 'iow', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6451', '2025-07-12T11:00:00', 'iow', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6707', '2025-07-25T13:00:00', 'lag', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6708', '2025-07-25T15:30:00', 'lag', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6442', '2025-07-26T13:30:00', 'lag', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6450', '2025-07-27T15:30:00', 'lag', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6713', '2025-08-08T13:00:00', 'por', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6714', '2025-08-09T13:30:00', 'por', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6449', '2025-08-10T10:00:00', 'por', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6727', '2025-08-23T08:00:00', 'mil', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6588', '2025-08-23T14:30:00', 'mil', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6448', '2025-08-24T10:30:00', 'mil', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6731', '2025-08-30T08:00:00', 'nsh', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6593', '2025-08-30T11:30:00', 'nsh', 'pdftotext_layout'],
  ['session_indy_nxt_2025_6447', '2025-08-31T10:30:00', 'nsh', 'pdftotext_layout']
];
for (const [sessionId, scheduledStart, scheduleKey, parser] of indyNxtWeekendSchedulePdfWindows) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must store official 2025 weekend-schedule PDF start time`);
  assert.equal(session?.actualStart ?? null, null, `${sessionId} must not treat weekend-schedule race timing as actualStart`);
  assert.equal(session?.timeSource, 'official_indycar_weekend_schedule_pdf', `${sessionId} must mark the official weekend schedule PDF as the time source`);
  assert.equal(session?.raw?.indycarWeekendScheduleWindow?.scheduleYear, 2025, `${sessionId} must retain the source schedule year`);
  assert.equal(session?.raw?.indycarWeekendScheduleWindow?.scheduleKey, scheduleKey, `${sessionId} must retain the source schedule key`);
  assert.equal(session?.raw?.indycarWeekendScheduleWindow?.parser, parser, `${sessionId} must retain whether text came from pdftotext or OCR`);
  assert.ok(
    (session?.provenanceRefs ?? []).includes(`source_indy_nxt_2025_weekend_schedule_${scheduleKey}`),
    `${sessionId} must cite its official weekend schedule PDF source`
  );
}
assert.equal(
  dataset.sessions.filter((row) => row.id.startsWith('session_indy_nxt_2024_') && row.timeSource === 'official_indycar_weekend_schedule_pdf').length,
  38,
  '2024 INDY NXT weekend schedule PDFs must backfill the 38 unambiguous practice/race/single-qualifying windows'
);
assert.equal(
  dataset.sessions.filter((row) => row.id.startsWith('session_indy_nxt_2025_') && row.timeSource === 'official_indycar_weekend_schedule_pdf').length,
  36,
  '2025 INDY NXT weekend schedule PDFs must backfill the 36 unambiguous practice/race/single-qualifying windows'
);
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsUpdated.filter((row) => row.year === 2024).length, 38, 'INDY NXT session-window report must show 38 official 2024 weekend-schedule PDF updates');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsUpdated.filter((row) => row.year === 2025).length, 36, 'INDY NXT session-window report must show 36 official 2025 weekend-schedule PDF updates');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsUpdated.filter((row) => row.year === 2026).length, 0, 'INDY NXT 2026 weekend-schedule PDFs must not override higher-priority Race Control windows or coarse qualifying groups');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsUpdated.length, 74, 'INDY NXT session-window report must show 74 official 2024-2025 weekend-schedule PDF updates');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.filter((row) => row.year === 2024).length, 8, 'INDY NXT session-window report must preserve eight skipped/ambiguous 2024 weekend-schedule rows');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.filter((row) => row.year === 2025).length, 9, 'INDY NXT session-window report must preserve nine skipped/ambiguous 2025 weekend-schedule rows');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.filter((row) => row.year === 2026).length, 16, 'INDY NXT session-window report must preserve 16 skipped/ambiguous or higher-priority 2026 weekend-schedule rows');
assert.equal(indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.length, 33, 'INDY NXT session-window report must preserve all 33 skipped/ambiguous 2024-2026 weekend-schedule rows');
assert.equal(
  indyNxtSessionWindowBackfill.sources.weekendSchedules.filter((row) => row.year === 2024).length,
  12,
  'INDY NXT session-window report must cache all 12 official 2024 weekend schedule PDFs'
);
assert.equal(
  indyNxtSessionWindowBackfill.sources.weekendSchedules.filter((row) => row.year === 2025).length,
  12,
  'INDY NXT session-window report must cache all 12 official 2025 weekend schedule PDFs'
);
assert.equal(
  indyNxtSessionWindowBackfill.sources.weekendSchedules.filter((row) => row.year === 2026).length,
  4,
  'INDY NXT session-window report must cache the four official completed-event 2026 weekend schedule PDFs reviewed for exact qualifying windows'
);
assert.equal(
  indyNxtSessionWindowBackfill.sources.weekendSchedules.some((row) => row.year === 2025 && row.key === 'stl' && row.parser === 'tesseract_ocr'),
  true,
  'WWTR 2025 image-only weekend schedule PDF must be parsed through the OCR fallback'
);
for (const key of ['stp', 'arl', 'ala', 'ims']) {
  assert.ok(
    dataset.sourceEvidence.some((row) => row.id === `source_indy_nxt_2026_weekend_schedule_${key}`),
    `2026 ${key.toUpperCase()} official weekend schedule PDF must be retained as source evidence`
  );
}
assert.equal(
  indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.some((row) => row.year === 2025 && row.key === 'iow' && row.reason === 'not_present_in_official_weekend_schedule_pdf'),
  true,
  'Iowa 2025 qualifying must remain an explicit skipped row because the official weekend schedule PDF does not expose a qualifying window'
);
const indyNxtSourceReviewedExactWindowReasons = new Set([
  'coarse_schedule_label_ambiguous_with_group_qualifying_sessions',
  'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions',
  'not_present_in_official_weekend_schedule_pdf'
]);
const indyNxtSourceReviewedExactWindowSessionIds = new Set(
  indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped
    .filter((row) => indyNxtSourceReviewedExactWindowReasons.has(row.reason))
    .flatMap((row) => row.candidateSessionIds ?? [])
);
const indyNxtDateOnlyPhysicalSessionIds = new Set(
  dataset.sessions
    .filter((session) => {
      const event = eventsById.get(session.eventId);
      return event?.seriesId === 'series_indy_nxt' && !String(session.scheduledStart ?? session.actualStart ?? '').includes('T');
    })
    .map((session) => session.id)
);
assert.equal(
  indyNxtSourceReviewedExactWindowSessionIds.size,
  indyNxtDateOnlyPhysicalSessionIds.size,
  'INDY NXT source-reviewed exact-window skipped rows must account for every remaining date-only physical session'
);
for (const sessionId of ['session_indy_nxt_2025_6590', 'session_indy_nxt_2025_6591']) {
  const imsSkipped = indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.find((row) => row.year === 2025 && row.key === 'ims' && row.reason === 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions');
  assert.ok(
    imsSkipped?.candidateSessionIds?.includes(sessionId),
    `2025 IMS coarse qualifying skip must include aggregate combined qualifying session ${sessionId}`
  );
}
for (const sessionId of ['session_indy_nxt_2025_6589', 'session_indy_nxt_2025_6595']) {
  const lagSkipped = indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.find((row) => row.year === 2025 && row.key === 'lag' && row.reason === 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions');
  assert.ok(
    lagSkipped?.candidateSessionIds?.includes(sessionId),
    `2025 Monterey coarse qualifying skip must include aggregate combined qualifying session ${sessionId}`
  );
}
for (const sessionId of ['session_indy_nxt_2025_6517', 'session_indy_nxt_2025_6518', 'session_indy_nxt_2025_6596']) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.timeSource === 'official_indycar_weekend_schedule_pdf', false, `${sessionId} must not be backfilled from a coarse or missing 2025 weekend-schedule qualifying row`);
}

const indyNxt2026CoarseQualifyingWeekendRows = [
  ['stp', 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', ['session_indy_nxt_2026_6768', 'session_indy_nxt_2026_6769', 'session_indy_nxt_2026_6770']],
  ['arl', 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', ['session_indy_nxt_2026_6785', 'session_indy_nxt_2026_6786', 'session_indy_nxt_2026_6787']],
  ['ala', 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', ['session_indy_nxt_2026_6805', 'session_indy_nxt_2026_6806', 'session_indy_nxt_2026_6807', 'session_indy_nxt_2026_6808', 'session_indy_nxt_2026_6809', 'session_indy_nxt_2026_6810']],
  ['ims', 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', ['session_indy_nxt_2026_6829', 'session_indy_nxt_2026_6830', 'session_indy_nxt_2026_6831', 'session_indy_nxt_2026_6832', 'session_indy_nxt_2026_6833', 'session_indy_nxt_2026_6834']]
];
for (const [key, reason, sessionIds] of indyNxt2026CoarseQualifyingWeekendRows) {
  const skippedRow = indyNxtSessionWindowBackfill.weekendSchedulePdfSessionsSkipped.find((row) => row.year === 2026 && row.key === key && row.reason === reason);
  assert.deepEqual(
    skippedRow?.candidateSessionIds,
    sessionIds,
    `2026 ${key.toUpperCase()} qualifying must remain an explicit skipped PDF row with canonical candidate IDs`
  );
}
for (const sessionId of indyNxt2026CoarseQualifyingWeekendRows.flatMap(([, , sessionIds]) => sessionIds)) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(
    session?.timeSource === 'official_race_control_schedule',
    false,
    `${sessionId} must not be backfilled from the schedule feed because qualifying group timing is ambiguous`
  );
  assert.equal(
    session?.timeSource === 'official_indycar_weekend_schedule_pdf',
    false,
    `${sessionId} must not be backfilled from a coarse 2026 weekend-schedule qualifying row`
  );
  assert.equal(
    typeof session?.scheduledStart === 'string' && session.scheduledStart.includes('T'),
    false,
    `${sessionId} must remain date-only until an official source exposes a group-specific exact window`
  );
}

const frpRoadAtlantaCombinedQualifying = dataset.sessions.find((row) => row.id === 'session_frp_f1600_2019_r1_03_qualifying');
assert.equal(
  frpRoadAtlantaCombinedQualifying?.timeWindowApplicability,
  'not_applicable_aggregate_classification',
  'FRP Road Atlanta combined qualifying must be modeled as an aggregate classification, not a missing physical session window'
);
assert.deepEqual(
  frpRoadAtlantaCombinedQualifying?.derivedFromSessionIds,
  ['session_frp_f1600_2019_r1_01_practice_1', 'session_frp_f1600_2019_r1_02_practice_2'],
  'FRP Road Atlanta combined qualifying must preserve the practice sessions that supplied the classification'
);
assert.equal(
  report.issues.some((issue) => issue.path === 'sessions.timeCoverage' && /^9 physical sessions\b/.test(issue.message)),
  true,
  'validation warning should count only physical sessions still missing session windows after FROC Round 2 test PDF backfill'
);

const frocTestDayArticleEvidenceIds = [
  'source_froc_2024_r1_toyota_test_day_article',
  'source_froc_2024_r3_toyota_test_day_article',
  'source_froc_2024_r4_toyota_test_day_article',
  'source_froc_2024_r5_toyota_test_day_article'
];
for (const evidenceId of frocTestDayArticleEvidenceIds) {
  const evidence = dataset.sourceEvidence.find((row) => row.id === evidenceId);
  assert.ok(evidence, `${evidenceId} must exist as official Toyota test-day context evidence`);
  assert.equal(evidence.sourceType, 'official_article', `${evidenceId} must be classified as an official article source`);
  assert.ok(evidence.rawArtifactPath, `${evidenceId} must preserve the cached raw article artifact path`);
}

const frocUnwindowedTestSessions = [
  'session_froc_2024_r1_test_1',
  'session_froc_2024_r1_test_2',
  'session_froc_2024_r1_test_3',
  'session_froc_2024_r3_test_1',
  'session_froc_2024_r3_test_2',
  'session_froc_2024_r4_test_1',
  'session_froc_2024_r4_test_2',
  'session_froc_2024_r5_test_1',
  'session_froc_2024_r5_test_2'
];
for (const sessionId of frocUnwindowedTestSessions) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.scheduledStart ?? null, null, `${sessionId} must not fabricate a scheduledStart from date-only article context`);
  assert.equal(session?.actualStart ?? null, null, `${sessionId} must not fabricate an actualStart from date-only article context`);
  assert.equal(
    session?.raw?.testDayContextBackfill?.timeWindowStatus,
    'date_context_only_exact_time_unsourced',
    `${sessionId} must preserve official test-day context while keeping exact start time unsourced`
  );
  assert.ok(
    (session?.provenanceRefs ?? []).includes(session.raw.testDayContextBackfill.sourceEvidenceId),
    `${sessionId} must cite the official article evidence that supports its test-day context`
  );
}

assert.equal(sessionWindowBackfillReport.testDayArticlesCached, 4, 'FROC session-window backfill should cache four official Toyota test-day context articles');
assert.equal(sessionWindowBackfillReport.testDayContextSessionsAnnotated, 9, 'FROC session-window backfill should annotate all nine exact-time-unsourced test sessions with official date context');

const expectedTrackDirections = new Map([
  ['track_new_jersey_motorsports_park_thunderbolt', 'clockwise'],
  ['track_streets_of_arlington', 'counterclockwise'],
  ['track_streets_of_detroit', 'counterclockwise'],
  ['track_streets_of_st_petersburg', 'clockwise']
]);
for (const [trackId, direction] of expectedTrackDirections) {
  const track = dataset.tracks.find((row) => row.id === trackId);
  assert.equal(track?.direction, direction, `${trackId} must preserve source-backed layout direction`);
  assert.ok(
    (track?.provenanceRefs ?? []).includes(`source_track_metadata_${trackId.replace(/^track_/, '')}`),
    `${trackId} must cite curated track metadata provenance`
  );
  const trackEvidence = dataset.sourceEvidence.find((row) => row.id === `source_track_metadata_${trackId.replace(/^track_/, '')}`);
  assert.ok(
    (trackEvidence?.linkedUrls ?? []).some((url) => /imsa\.com|indycar\.com|lapmeta\.com/i.test(url)),
    `${trackId} track metadata evidence must link the direction-supporting source`
  );
}
assert.equal(
  report.issues.some((issue) => issue.path === 'tracks.directionCoverage'),
  false,
  'validation warning should clear once every event-referenced track has sourced layout direction'
);

for (const session of dataset.sessions) {
  if (session.timePrecision === 'local_datetime' || session.timePrecision === 'source_datetime') {
    assert.ok(session.scheduledStart || session.actualStart, `${session.id} has precise timePrecision without a timestamp`);
    assert.ok(session.timezone, `${session.id} has precise timePrecision without timezone`);
    assert.ok((session.provenanceRefs ?? []).length > 0, `${session.id} has precise timePrecision without provenance`);
  }
}

console.log(JSON.stringify({
  ok: true,
  checks: {
    sessions: dataset.sessions.length,
    results: dataset.results.length,
    lapSamples: dataset.lapSamples.length,
    penalties: dataset.penalties.length,
    sourceEvidence: dataset.sourceEvidence.length,
    missingSessionStarts: missingStart.length,
    physicalMissingSessionStarts: dataset.sessions.filter((row) => !row.scheduledStart && !row.actualStart && row.timeWindowApplicability !== 'not_applicable_aggregate_classification').length,
    froc_2024_round_2_test_windows: frocRound2TestWindows.filter(([sessionId]) => {
      const session = dataset.sessions.find((row) => row.id === sessionId);
      return Boolean(session?.scheduledStart && session?.actualStart);
    }).length,
    froc_2024_round_2_race_2_pdf_grid_positions: frocRound2Race2Rows.filter((row) => row.raw?.gridEvidence?.source === 'Toyota Grid R2 PDF').length,
    indy_nxt_2026_race_control_windows: indyNxtRaceControlWindows.filter(([sessionId]) => {
      const session = dataset.sessions.find((row) => row.id === sessionId);
      return Boolean(session?.scheduledStart && session?.actualStart);
    }).length,
    indy_nxt_2026_schedule_feed_windows: indyNxtScheduleFeedWindows.filter(([sessionId]) => {
      const session = dataset.sessions.find((row) => row.id === sessionId);
      return session?.timeSource === 'official_race_control_schedule';
    }).length,
    indy_nxt_2026_schedule_green_flag_windows: indyNxtScheduleGreenFlagWindows.filter(([sessionId]) => {
      const session = dataset.sessions.find((row) => row.id === sessionId);
      return session?.timeSource === 'official_race_control_schedule_green_flag';
    }).length,
    indy_nxt_qualifying_results: indyNxtQualifyingResults.length,
    indy_nxt_bryce_qualifying_results: indyNxtQualifyingResults.filter((row) => row.driverId === 'driver_bryce_aron').length,
    sourced_track_directions: [...expectedTrackDirections].filter(([trackId, direction]) => {
      const track = dataset.tracks.find((row) => row.id === trackId);
      return track?.direction === direction;
    }).length,
    gb3_2021_sessions: dataset.sessions.filter((row) => row.id.startsWith('session_gb3_2021_')).length,
    gb3_2021_bryce_results: dataset.results.filter((row) => row.id.startsWith('result_gb3_2021_') && row.driverId === 'driver_bryce_aron').length,
    gb3_2021_bryce_championship_position: gb32021Season?.championshipPosition,
    gb3_2021_bryce_points: gb32021Season?.points,
    euroformula_2023_bryce_race_results_with_grid: euroformulaBryceRaceResults.filter((row) => row.gridPosition !== null && row.startPosition !== null).length
  }
}, null, 2));
