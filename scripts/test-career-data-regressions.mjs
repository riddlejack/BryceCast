import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dataset = JSON.parse(await readFile('data/career/career.dataset.json', 'utf8'));
const report = JSON.parse(await readFile('data/career/reports/validation-report.json', 'utf8'));
const ingestionSummary = JSON.parse(await readFile('data/career/reports/ingestion-summary.json', 'utf8'));
const indyNxtReportDetailsBackfill = JSON.parse(await readFile('data/career/reports/indy-nxt-report-details-backfill-report.json', 'utf8'));
const frocImportReport = JSON.parse(await readFile('data/career/reports/froc-2024-import-report.json', 'utf8'));
const sessionWindowBackfillReport = JSON.parse(await readFile('data/career/reports/session-window-backfill-report.json', 'utf8'));
const careerCoverageMatrix = JSON.parse(await readFile('data/career/reports/career-coverage-matrix.json', 'utf8'));
const sourceManifest = JSON.parse(await readFile('data/career/sources.manifest.json', 'utf8'));

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
assert.deepEqual(duplicateIds(dataset.sessions), [], 'sessions must not contain duplicate ids');
assert.deepEqual(duplicateIds(dataset.results), [], 'results must not contain duplicate ids');
assert.deepEqual(duplicateIds(dataset.sourceEvidence), [], 'sourceEvidence must not contain duplicate ids');
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
  indyCoverage?.categories.find((row) => row.id === 'detailed_pit_context')?.status,
  'blocked',
  'INDY NXT detailed pit context must remain explicitly blocked until a detailed pit-summary importer exists'
);
const indySectionCoverage = indyCoverage?.categories.find((row) => row.id === 'indy_section_data');
assert.equal(indySectionCoverage?.status, 'partial', 'INDY NXT section data must remain partial until the true malformed Section Results PDF gap is resolved');
assert.equal(indySectionCoverage?.covered, 145, 'INDY NXT section-data coverage must exclude official canceled sessions from parsed comparable reports');
assert.equal(indySectionCoverage?.total, 146, 'INDY NXT section-data denominator must exclude official canceled sessions');
assert.match(
  indySectionCoverage?.notes ?? '',
  /session_indy_nxt_2024_6325 \(official_pdf_has_no_extractable_text\)/,
  'INDY NXT section-data notes must identify the true remaining held-out Section Results report'
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
assert.equal(formulaFordImportReport.bryceLapSamplesImported, 282, 'Formula Ford importer must extract all source-backed Bryce lap-analysis samples');
assert.equal(formulaFordImportReport.lapSamplesImported, 282, 'Formula Ford lap-sample import must stay scoped to Bryce-owned lap-analysis rows');

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
assert.equal(indyNxtQualifyingResults.length, 1238, 'INDY NXT qualifyingResults must import all official API SessionType=Q records');
assert.equal(
  indyNxtQualifyingResults.filter((row) => row.driverId === 'driver_bryce_aron').length,
  61,
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
const indyNxtStatusIncidents = dataset.incidents.filter((row) => /^incident_indy_nxt_status_/.test(row.id ?? ''));
assert.equal(
  indyNxtStatusIncidents.length,
  68,
  'INDY NXT official terminal statuses contact/mechanical/dns must normalize to incident rows'
);
const indyNxtStatusIncidentTypes = indyNxtStatusIncidents.reduce((counts, row) => {
  counts[row.incidentType] = (counts[row.incidentType] ?? 0) + 1;
  return counts;
}, {});
assert.deepEqual(
  indyNxtStatusIncidentTypes,
  { contact: 55, dns: 2, mechanical: 11 },
  'INDY NXT official terminal-status incidents must preserve source status categories without inferring unknowns'
);
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
  36,
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
assert.equal(indyNxtReportDetailsBackfill.topSectionReportsDiscovered, 147, 'INDY NXT report-detail backfill must discover all official Top Section Times PDFs from session metadata');
assert.equal(indyNxtReportDetailsBackfill.topSectionReportsParsed, 146, 'INDY NXT report-detail backfill must parse all non-canceled official Top Section Times PDFs');
assert.equal(indyNxtReportDetailsBackfill.topSectionMetricsImported, 146, 'INDY NXT report-detail backfill must import one metric per parsed official Top Section Times PDF');
assert.equal(indyNxtReportDetailsBackfill.sectionResultsReportsDiscovered, 147, 'INDY NXT report-detail backfill must discover all official Section Results PDFs from session metadata');
assert.equal(indyNxtReportDetailsBackfill.sectionResultsReportsParsed, 145, 'INDY NXT report-detail backfill must parse all extractable non-canceled official Section Results PDFs');
assert.equal(indyNxtReportDetailsBackfill.sectionResultsMetricsImported, 145, 'INDY NXT report-detail backfill must import one metric per parsed official Section Results PDF');
assert.deepEqual(indyNxtReportDetailsBackfill.sectionResultsFailures, [], 'INDY NXT Section Results parser must not leave parser failures');
assert.deepEqual(
  indyNxtReportDetailsBackfill.sectionResultsReportsHeldOut,
  [
    {
      sessionId: 'session_indy_nxt_2024_6325',
      reason: 'official_pdf_has_no_extractable_text',
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
assert.equal(indyNxtReportDetailsBackfill.resultsReportsDiscovered, 36, 'INDY NXT Results PDF penalty/caution parser must stay scoped to race sessions');
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
  10,
  'INDY NXT report-detail backfill must record the ten partial lap-chart imports'
);
assert.equal(
  indyNxtReportDetailsBackfill.partialLapSamplesImported,
  8472,
  'INDY NXT report-detail backfill must record source-visible samples imported from partial lap charts'
);
assert.equal(
  indyNxtReportDetailsBackfill.parserFailures.length,
  0,
  'INDY NXT report-detail backfill must clear lap-chart parser failures after preserving official DQ/result-lap conflicts'
);
const indyNxtDetroit2024Race1PartialLapChart = indyNxtReportDetailsBackfill.partialLapChartImports.find((row) => row.sessionId === 'session_indy_nxt_2024_6326');
assert.equal(
  indyNxtDetroit2024Race1PartialLapChart?.samplesImported,
  840,
  'INDY NXT Detroit 2024 Race 1 must import clean source-visible chart samples'
);
assert.deepEqual(
  indyNxtDetroit2024Race1PartialLapChart?.resultLapConflicts,
  [{ carNumber: '75', expected: 0, parsed: 7, status: 'unknown', reason: 'official_result_zero_laps_with_source_visible_lap_chart_samples' }],
  'INDY NXT Detroit 2024 Race 1 partial report must preserve car 75 official result/chart conflict'
);
const indyNxtDetroit2024Race1LapSamples = dataset.lapSamples.filter((row) => row.sessionId === 'session_indy_nxt_2024_6326');
assert.equal(
  indyNxtDetroit2024Race1LapSamples.length,
  840,
  'INDY NXT Detroit 2024 Race 1 partial lap chart must import visible chart samples'
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

const roadAmericaScheduleOnlySessions = [
  ['session_indy_nxt_2026_6869', 'Practice', 'practice', '2026-06-19T14:00:00', '2026-06-19T14:00:00'],
  ['session_indy_nxt_2026_6870', 'Qualifying - Race 1 Group 1', 'qualifying', '2026-06-20T09:00:00', '2026-06-20T09:00:00'],
  ['session_indy_nxt_2026_6871', 'Qualifying - Race 1 Group 2', 'qualifying', '2026-06-20T09:18:00', '2026-06-20T09:18:00'],
  ['session_indy_nxt_2026_6872', 'Combined Qualifying - Race 1', 'qualifying', '2026-06-20T09:30:00', '2026-06-20T09:30:00'],
  ['session_indy_nxt_2026_6762', 'Race', 'race', '2026-06-20T11:30:00', '2026-06-20T11:36:00']
];
for (const [sessionId, sessionName, sessionType, scheduledStart, actualStart] of roadAmericaScheduleOnlySessions) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(session?.eventId, 'event_indy_nxt_2026_5545', `${sessionId} must attach to the official Road America Race 1 event`);
  assert.equal(session?.sessionName, sessionName, `${sessionId} must preserve the Race Control session label`);
  assert.equal(session?.sessionType, sessionType, `${sessionId} must normalize the Race Control session type`);
  assert.equal(session?.scheduledStart, scheduledStart, `${sessionId} must convert source UTC start to Road America local time`);
  assert.equal(session?.actualStart, actualStart, `${sessionId} must convert source estimated green flag to event-local actualStart`);
  assert.equal(session?.scheduledEnd?.startsWith(scheduledStart.slice(0, 10)), true, `${sessionId} must retain an event-local scheduled end`);
  assert.equal(session?.timezone, 'America/Chicago', `${sessionId} must retain Road America timezone`);
  assert.equal(session?.timeSource, 'official_race_control_trackactivity_schedule_only', `${sessionId} must mark schedule-only Race Control timing`);
  assert.ok((session?.provenanceRefs ?? []).includes('source_indy_nxt_2026_race_control_trackactivity_schedule'), `${sessionId} must cite Race Control trackactivity provenance`);
  assert.equal(dataset.results.some((row) => row.sessionId === sessionId), false, `${sessionId} must remain schedule-only with no fabricated result rows`);
}

for (const sessionId of ['session_indy_nxt_2026_6805', 'session_indy_nxt_2026_6806', 'session_indy_nxt_2026_6807']) {
  const session = dataset.sessions.find((row) => row.id === sessionId);
  assert.equal(
    session?.timeSource === 'official_race_control_schedule',
    false,
    `${sessionId} must not be backfilled from the schedule feed because qualifying group timing is ambiguous`
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
