import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const careerDir = join(root, 'data/career');
const reportsDir = join(careerDir, 'reports');
const datasetPath = join(careerDir, 'career.dataset.json');
const indyReportDetailsDir = join(careerDir, 'raw/indy-nxt/report-details');
const jsonOutputPath = join(reportsDir, 'career-coverage-matrix.json');
const markdownOutputPath = join(root, 'docs/CAREER_ANALYTICS_COVERAGE_MATRIX.md');

const readJson = async (path, fallback = null) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const pct = (numerator, denominator) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

const isRaceLike = (session) => ['race', 'heat'].includes(session.sessionType);
const isResultBearingComparable = (session) => session.ingestionState !== 'schedule_only';
const isPhysicalWindowExempt = (session) =>
  session.timeWindowApplicability === 'not_applicable_aggregate_classification';
const hasAnyStart = (session) => Boolean(session.actualStart || session.scheduledStart);
const hasExactTimestamp = (session) =>
  (typeof session.actualStart === 'string' && session.actualStart.includes('T')) ||
  (typeof session.scheduledStart === 'string' && session.scheduledStart.includes('T'));
const isExactWindowSourceUnavailable = (session) =>
  session.raw?.testDayContextBackfill?.timeWindowStatus === 'date_context_only_exact_time_unsourced' &&
  !hasExactTimestamp(session);
const indyNxtSectionMetricTypes = ['official_top_section_times', 'official_section_results'];
const hasIndyNxtAggregateSectionShape = (session) =>
  session.sessionType === 'qualifying' && /\bcombined qual/i.test(String(session.sessionName ?? ''));

const collectCanceledSessionEvidence = async (dataset) => {
  const evidence = new Map();
  let files = [];
  try {
    files = await readdir(indyReportDetailsDir);
  } catch {
    return evidence;
  }

  const sessionsByOfficialId = new Map(
    asArray(dataset.sessions)
      .filter((session) => session.officialSessionId)
      .map((session) => [String(session.officialSessionId), session])
  );

  for (const file of files.filter((name) => /\.(?:txt|raw\.txt|layout\.txt)$/i.test(name))) {
    const match = file.match(/^(\d{4})-(\d+)-/);
    if (!match) continue;
    const [, year, officialSessionId] = match;
    const session = sessionsByOfficialId.get(String(officialSessionId));
    if (!session) continue;
    const text = await readFile(join(indyReportDetailsDir, file), 'utf8');
    const cancelMatch = text.match(/Session:\s*([^\n]*?\b(?:Canceled|Cancelled)\b[^\n]*)|(\b\w+\s+\d{1,2},\s+\d{4}\s+[^\n]*?\b(?:Canceled|Cancelled)\b[^\n]*)/i);
    if (!cancelMatch) continue;
    const existing = evidence.get(session.id) ?? {
      sessionId: session.id,
      officialSessionId,
      year: Number(year),
      sessionName: session.sessionName,
      files: [],
      evidenceText: cancelMatch[1] ?? cancelMatch[2] ?? null
    };
    existing.files.push(`data/career/raw/indy-nxt/report-details/${file}`);
    evidence.set(session.id, existing);
  }

  return evidence;
};

const statusForCoverage = (covered, total, { supported = true, threshold = 1, emptyStatus = 'unavailable' } = {}) => {
  if (!supported) return emptyStatus;
  if (total === 0) return emptyStatus;
  if (covered >= total * threshold) return 'complete';
  if (covered > 0) return 'partial';
  return 'blocked';
};

const categoryDefinitions = [
  {
    id: 'events_sessions',
    label: 'Events and sessions',
    description: 'Canonical event and session rows inside the 2019-2026 analytics window.'
  },
  {
    id: 'race_results',
    label: 'Race/heat classifications',
    description: 'Full-field race or heat classification rows.'
  },
  {
    id: 'qualifying_classifications',
    label: 'Qualifying classifications',
    description: 'Qualifying session classification rows, either in dedicated qualifyingResults or result rows.'
  },
  {
    id: 'grid_start_positions',
    label: 'Grid/start positions',
    description: 'Race/heat rows with source-backed gridPosition or startPosition.'
  },
  {
    id: 'exact_session_windows',
    label: 'Exact session windows',
    description: 'Physical sessions with sourced clock-time starts suitable for session-hour joins.'
  },
  {
    id: 'track_metadata',
    label: 'Track metadata',
    description: 'Coordinates, timezone, length, direction, surface, and corner-count metadata for referenced tracks.'
  },
  {
    id: 'official_weather_conditions',
    label: 'Official weather/track conditions',
    description: 'Series/timing-sheet weather or track-condition observations stored in weatherObservations.'
  },
  {
    id: 'lap_samples',
    label: 'Lap samples',
    description: 'Lap-level position or timing samples where official sources expose them.'
  },
  {
    id: 'indy_section_data',
    label: 'INDY NXT section data',
    description: 'Official INDY NXT Top Section Times and Section Results PDF-derived metrics.'
  },
  {
    id: 'penalties_decisions',
    label: 'Penalties/decisions',
    description: 'Official penalty or decision rows linked to sessions and drivers where source families expose explicit penalty records.'
  },
  {
    id: 'incidents_cautions',
    label: 'Incidents/cautions',
    description: 'Official caution summaries or terminal-status incident rows.'
  },
  {
    id: 'racecraft_summary',
    label: 'Racecraft summary',
    description: 'Official racecraft-like rows such as most-improved notes.'
  },
  {
    id: 'pit_stop_counts',
    label: 'Pit-stop counts',
    description: 'Per-result pit-stop count fields from official result sources.'
  },
  {
    id: 'detailed_pit_context',
    label: 'Detailed pit context',
    description: 'Pit timing, pit-lane sequence, service context, or pit-summary report rows.'
  },
  {
    id: 'derived_benchmarks',
    label: 'Derived benchmarks',
    description: 'Teammate, field-strength, trend, and analytics-ready derived metrics.'
  }
];

const seriesPolicies = {
  series_indy_nxt: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'qualifying_classifications',
      'grid_start_positions',
      'exact_session_windows',
      'track_metadata',
      'lap_samples',
      'indy_section_data',
      'penalties_decisions',
      'incidents_cautions',
      'racecraft_summary',
      'pit_stop_counts',
      'derived_benchmarks'
    ]),
    unavailable: new Set(['official_weather_conditions', 'detailed_pit_context'])
  },
  series_gb3: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'qualifying_classifications',
      'grid_start_positions',
      'exact_session_windows',
      'track_metadata',
      'official_weather_conditions',
      'pit_stop_counts',
      'derived_benchmarks'
    ]),
    unavailable: new Set([
      'lap_samples',
      'indy_section_data',
      'penalties_decisions',
      'incidents_cautions',
      'racecraft_summary',
      'detailed_pit_context'
    ])
  },
  series_euroformula_open: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'qualifying_classifications',
      'grid_start_positions',
      'exact_session_windows',
      'track_metadata',
      'derived_benchmarks'
    ]),
    unavailable: new Set([
      'official_weather_conditions',
      'lap_samples',
      'indy_section_data',
      'penalties_decisions',
      'incidents_cautions',
      'racecraft_summary',
      'pit_stop_counts',
      'detailed_pit_context'
    ])
  },
  series_froc: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'qualifying_classifications',
      'grid_start_positions',
      'exact_session_windows',
      'track_metadata',
      'derived_benchmarks'
    ]),
    unavailable: new Set([
      'official_weather_conditions',
      'lap_samples',
      'indy_section_data',
      'penalties_decisions',
      'incidents_cautions',
      'racecraft_summary',
      'pit_stop_counts',
      'detailed_pit_context'
    ])
  },
  series_frp_f1600: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'qualifying_classifications',
      'exact_session_windows',
      'track_metadata',
      'penalties_decisions',
      'derived_benchmarks'
    ]),
    unavailable: new Set([
      'grid_start_positions',
      'official_weather_conditions',
      'lap_samples',
      'indy_section_data',
      'incidents_cautions',
      'racecraft_summary',
      'pit_stop_counts',
      'detailed_pit_context'
    ])
  },
  series_formula_ford: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'qualifying_classifications',
      'grid_start_positions',
      'exact_session_windows',
      'track_metadata',
      'official_weather_conditions',
      'lap_samples',
      'penalties_decisions',
      'derived_benchmarks'
    ]),
    unavailable: new Set([
      'indy_section_data',
      'incidents_cautions',
      'racecraft_summary',
      'pit_stop_counts',
      'detailed_pit_context'
    ])
  },
  series_imsa_weathertech: {
    supported: new Set([
      'events_sessions',
      'race_results',
      'exact_session_windows',
      'track_metadata',
      'official_weather_conditions',
      'lap_samples',
      'pit_stop_counts',
      'derived_benchmarks'
    ]),
    unavailable: new Set([
      'qualifying_classifications',
      'grid_start_positions',
      'indy_section_data',
      'penalties_decisions',
      'incidents_cautions',
      'racecraft_summary',
      'detailed_pit_context'
    ]),
    scopeNote: 'One-event sports-car slice until additional official Bryce IMSA starts are confirmed.'
  }
};

const knownGapMap = {
  series_gb3: ['gap_gb3_2022_session_1248_missing_json'],
  series_froc: [
    'gap_froc_2024_round_4_date_conflict',
    'gap_froc_2024_session_times_missing',
    'gap_froc_2024_start_positions_partial'
  ],
  series_euroformula_open: ['gap_euroformula_2023_championship_classification_pdf_current_mismatch'],
  series_frp_f1600: ['gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch'],
  series_formula_ford: ['gap_formula_ford_2020_grid_start_source_asymmetry_holdouts'],
  series_indy_nxt: ['gap_indy_nxt_qualifying_lap_reports']
};

const sourceFamilyPriorityExclusions = {
  series_indy_nxt: {
    exact_session_windows: 'INDY NXT official Race Control feeds and cached weekend schedule PDFs expose exact clock-time starts for 111 physical sessions. The remaining 78 date-only rows are qualifying/group/combined qualifying sessions where official weekend schedules expose only coarse qualifying blocks or no exact qualifying row, so there is no safe source-backed group or aggregate split to promote into session-hour joins.',
    indy_section_data: 'INDY NXT official Top Section Times and Section Results reports are parsed for every comparable source-exposed session except session_indy_nxt_2024_6325, where the official Section Results URL returns corrupt/truncated non-PDF bytes from the CDN. Keep the section-data category partial with an explicit source-broken gap unless an alternate official non-corrupt copy appears.',
    lap_samples: 'INDY NXT official Race Lap Chart PDFs are imported for all 36 completed race sessions: 26 charts fully validate and 10 clean partial visible-sample imports preserve explicit missing car-lap or result/chart conflict diagnostics without guessing terminal or conflict laps.',
    detailed_pit_context: 'INDY NXT official report inventory exposes PitStops counts in API/result rows and Race Lap Chart position samples, but no dedicated pit-summary, pit-lane sequence, stop-lap, tire/service, or pit-time report was found across the cached official report family.'
  },
  series_froc: {
    grid_start_positions: 'FROC 2024 official Toyota grid tabs, linked grid PDFs, and official Toyota articles backfill every race grid row the source family exposes with enough specificity. The remaining Race 2 tail rows are held out because the official Race 2 narratives identify only the reverse/top-eight rows plus one direct P16 statement, without a complete race-specific tail grid.',
    exact_session_windows: 'FROC 2024 official Toyota schedule images expose exact practice/qualifying/race windows and official Round 2 timing PDFs expose exact Test 1/2 windows. The remaining nine test sessions have official date-level article context and result tabs, but no official timing PDF link or equivalent exact clock-time source was found on the Toyota round pages.'
  },
  series_frp_f1600: {
    penalties_decisions: 'FRP F1600 2019 archive PDFs expose explicit penalty announcements where present, but no complete official no-penalty decisions ledger was found for every session.'
  },
  series_formula_ford: {
    grid_start_positions: 'Formula Ford 2020 official event books now import every source-matchable race/heat grid/start row, including an exact-name fallback for Colin Lawson where the official grid page uses car 169 and the classification uses car 69. The remaining seven classified race/heat rows are preserved in gap_formula_ford_2020_grid_start_source_asymmetry_holdouts because the official source family exposes reserve-only entries, restart-grid-only positions, or original-grid rows that do not safely match the classified driver/car row.',
    penalties_decisions: 'Formula Ford 2020 event books expose explicit penalty-note rows where present, but no complete official no-penalty decisions ledger was found for every session.'
  },
  series_gb3: {
    grid_start_positions: 'GB3 2021 official TSL PDFs expose race grid sheets and are complete; GB3 2022 official JSON result payloads do not expose grid/start fields.',
    official_weather_conditions: 'GB3 2021 official TSL PDFs expose weather/track-condition rows and are complete; GB3 2022 official JSON payloads do not expose comparable weather/track-condition fields.',
    pit_stop_counts: 'GB3 2022 official JSON payloads expose pit-stop count fields and are complete; GB3 2021 official TSL PDFs do not expose comparable pit-stop count fields.'
  }
};

const seasonCategoryOverrides = {
  series_gb3: {
    2021: {
      pit_stop_counts: {
        status: 'unavailable',
        notes: 'GB3 2021 official TSL classification PDFs do not expose comparable pit-stop count fields.'
      }
    },
    2022: {
      grid_start_positions: {
        status: 'unavailable',
        notes: 'GB3 2022 official JSON result payloads do not expose comparable grid/start fields.'
      },
      official_weather_conditions: {
        status: 'unavailable',
        notes: 'GB3 2022 official JSON result payloads do not expose comparable official weather/track-condition fields.'
      }
    }
  }
};

const applySeasonOverrides = ({ seriesId, year, categories }) => {
  const overrides = seasonCategoryOverrides[seriesId]?.[year] ?? {};
  return categories.map((category) => {
    const override = overrides[category.id];
    return override ? { ...category, ...override } : category;
  });
};

const collectIndyNxtSourceReviewedExactWindowHoldouts = (indyWindowReport) => {
  const sourceReviewedReasons = new Set([
    'coarse_schedule_label_ambiguous_with_group_qualifying_sessions',
    'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions',
    'not_present_in_official_weekend_schedule_pdf'
  ]);
  const ids = new Set();
  for (const row of asArray(indyWindowReport?.weekendSchedulePdfSessionsSkipped)) {
    if (!sourceReviewedReasons.has(row.reason)) continue;
    for (const sessionId of asArray(row.candidateSessionIds)) ids.add(sessionId);
  }
  return ids;
};

const collectIndyNxtNoSectionRowReports = (indyReport) => {
  const ids = new Set();
  for (const row of [
    ...asArray(indyReport?.topSectionReportsHeldOut),
    ...asArray(indyReport?.sectionResultsReportsHeldOut)
  ]) {
    if (row.reason === 'official_report_has_no_section_rows') ids.add(row.sessionId);
  }
  return ids;
};

const buildCoverage = ({ dataset, summary, indyReport, indyWindowReport, canceledSessionEvidence }) => {
  const eventsById = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const sessionsById = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const tracksById = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));
  const sourceReviewedExactWindowHoldoutIds = collectIndyNxtSourceReviewedExactWindowHoldouts(indyWindowReport);
  const indyNxtNoSectionRowReportIds = collectIndyNxtNoSectionRowReports(indyReport);
  const resultsBySession = new Map();
  const qualifyingBySession = new Map();
  const lapSamplesBySession = new Map();
  const weatherBySession = new Map();
  const penaltiesBySession = new Map();
  const incidentsBySession = new Map();
  const racecraftBySession = new Map();
  const metricsBySession = new Map();

  const pushBySession = (map, row) => {
    if (!row.sessionId) return;
    const rows = map.get(row.sessionId) ?? [];
    rows.push(row);
    map.set(row.sessionId, rows);
  };

  for (const row of asArray(dataset.results)) pushBySession(resultsBySession, row);
  for (const row of asArray(dataset.qualifyingResults)) pushBySession(qualifyingBySession, row);
  for (const row of asArray(dataset.lapSamples)) pushBySession(lapSamplesBySession, row);
  for (const row of asArray(dataset.weatherObservations)) pushBySession(weatherBySession, row);
  for (const row of asArray(dataset.penalties)) pushBySession(penaltiesBySession, row);
  for (const row of asArray(dataset.incidents)) pushBySession(incidentsBySession, row);
  for (const row of asArray(dataset.racecraftEvents)) pushBySession(racecraftBySession, row);
  for (const row of asArray(dataset.derivedMetrics)) pushBySession(metricsBySession, row);

  const allOpenGaps = asArray(dataset.gaps).filter((gap) => gap.status !== 'closed');
  const seriesRows = [];
  const seasonRows = [];
  const sessionRows = [];

  for (const series of asArray(dataset.series).sort((a, b) => a.name.localeCompare(b.name))) {
    const policy = seriesPolicies[series.id] ?? { supported: new Set(), unavailable: new Set() };
    const events = asArray(dataset.events).filter((event) => event.seriesId === series.id);
    const sessions = asArray(dataset.sessions).filter((session) => eventsById.get(session.eventId)?.seriesId === series.id);
    const raceSessions = sessions.filter(isRaceLike);
    const comparableRaceSessions = raceSessions.filter(isResultBearingComparable);
    const qualifyingSessions = sessions.filter((session) => session.sessionType === 'qualifying');
    const canceledQualifyingSessions = qualifyingSessions.filter((session) => canceledSessionEvidence.has(session.id));
    const comparableQualifyingSessions = qualifyingSessions.filter((session) =>
      isResultBearingComparable(session) && !canceledSessionEvidence.has(session.id)
    );
    const physicalSessions = sessions.filter((session) => !isPhysicalWindowExempt(session));
    const eventIds = new Set(events.map((event) => event.id));
    const trackIds = new Set(events.map((event) => event.trackId).filter(Boolean));
    const raceRows = comparableRaceSessions.flatMap((session) => resultsBySession.get(session.id) ?? []);
    const qualifyingClassificationSessions = comparableQualifyingSessions.filter((session) =>
      (resultsBySession.get(session.id) ?? []).length > 0 ||
      (qualifyingBySession.get(session.id) ?? []).length > 0
    );
    const raceResultSessions = comparableRaceSessions.filter((session) => (resultsBySession.get(session.id) ?? []).length > 0);
    const raceRowsWithGrid = raceRows.filter((row) => row.gridPosition != null || row.startPosition != null);
    const exactWindowSessions = physicalSessions.filter(hasExactTimestamp);
    const exactWindowSourceUnavailableSessions = physicalSessions.filter((session) =>
      isExactWindowSourceUnavailable(session) || sourceReviewedExactWindowHoldoutIds.has(session.id)
    );
    const anyWindowSessions = physicalSessions.filter(hasAnyStart);
    const trackMetadataComplete = [...trackIds].filter((trackId) => {
      const track = tracksById.get(trackId);
      return Boolean(
        track &&
        Number.isFinite(track.latitude) &&
        Number.isFinite(track.longitude) &&
        track.timezone &&
        (Number.isFinite(track.lengthKm) || Number.isFinite(track.lengthMi)) &&
        track.direction &&
        track.direction !== 'unknown' &&
        track.surface &&
        Number.isFinite(track.cornerCount)
      );
    }).length;
    const weatherSessions = sessions.filter((session) => (weatherBySession.get(session.id) ?? []).length > 0);
    const lapSampleSessions = sessions.filter((session) => (lapSamplesBySession.get(session.id) ?? []).length > 0);
    const raceLapSampleSessions = comparableRaceSessions.filter((session) => (lapSamplesBySession.get(session.id) ?? []).length > 0);
    const penaltySessions = sessions.filter((session) => (penaltiesBySession.get(session.id) ?? []).length > 0);
    const incidentSessions = sessions.filter((session) => (incidentsBySession.get(session.id) ?? []).length > 0);
    const racecraftSessions = sessions.filter((session) => (racecraftBySession.get(session.id) ?? []).length > 0);
    const raceRowsWithPitStops = raceRows.filter((row) => row.pitStops != null);
    const sectionMetricSessions = sessions.filter((session) =>
      (metricsBySession.get(session.id) ?? []).some((metric) =>
        ['official_top_section_times', 'official_section_results'].includes(metric.metricType)
      )
    );
    const benchmarkMetrics = asArray(dataset.derivedMetrics).filter((metric) =>
      metric.seriesId === series.id &&
      ![
        'official_event_summary_race_stats',
        'official_leader_lap_summary',
        'official_top_section_times',
        'official_section_results'
      ].includes(metric.metricType)
    );
    const topSectionCanceledHeldOut = series.id === 'series_indy_nxt'
      ? asArray(indyReport?.topSectionReportsHeldOut).filter((row) => canceledSessionEvidence.has(row.sessionId)).length
      : 0;
    const sectionResultsCanceledHeldOut = series.id === 'series_indy_nxt'
      ? asArray(indyReport?.sectionResultsReportsHeldOut).filter((row) => canceledSessionEvidence.has(row.sessionId)).length
      : 0;
    const sectionResultsTrueHeldOut = series.id === 'series_indy_nxt'
      ? asArray(indyReport?.sectionResultsReportsHeldOut).filter((row) => !canceledSessionEvidence.has(row.sessionId))
      : [];
    const isIndyNxtComparableSectionSession = (session) =>
      series.id === 'series_indy_nxt' &&
      isResultBearingComparable(session) &&
      !canceledSessionEvidence.has(session.id) &&
      !indyNxtNoSectionRowReportIds.has(session.id) &&
      !hasIndyNxtAggregateSectionShape(session);
    const hasBothIndyNxtSectionMetricTypes = (session) => {
      const types = new Set((metricsBySession.get(session.id) ?? []).map((metric) => metric.metricType));
      return indyNxtSectionMetricTypes.every((type) => types.has(type));
    };
    const sectionComparableSessions = sessions.filter(isIndyNxtComparableSectionSession);
    const sectionCompleteSessions = sectionComparableSessions.filter(hasBothIndyNxtSectionMetricTypes);
    const topSectionComparableDiscovered = series.id === 'series_indy_nxt'
      ? Math.max(0, (indyReport?.topSectionReportsDiscovered ?? 0) - topSectionCanceledHeldOut)
      : 0;
    const sectionResultsComparableDiscovered = series.id === 'series_indy_nxt'
      ? Math.max(0, (indyReport?.sectionResultsReportsDiscovered ?? 0) - sectionResultsCanceledHeldOut)
      : 0;
    const topSectionComparableParsed = series.id === 'series_indy_nxt'
      ? Math.min(indyReport?.topSectionReportsParsed ?? 0, topSectionComparableDiscovered)
      : 0;
    const sectionResultsComparableParsed = series.id === 'series_indy_nxt'
      ? Math.min(indyReport?.sectionResultsReportsParsed ?? 0, sectionResultsComparableDiscovered)
      : 0;
    const indySectionStatus = series.id === 'series_indy_nxt'
      ? (
          topSectionComparableParsed === topSectionComparableDiscovered &&
          sectionResultsComparableParsed === sectionResultsComparableDiscovered
            ? 'complete'
            : topSectionComparableParsed > 0 || sectionResultsComparableParsed > 0
              ? 'partial'
              : 'blocked'
        )
      : undefined;

    const category = (id, covered, total, extra = {}) => {
      const supported = policy.supported.has(id);
      const unavailable = policy.unavailable.has(id);
      const effectiveCovered = extra.covered ?? covered;
      const effectiveTotal = extra.total ?? total;
      const status = extra.status ?? statusForCoverage(effectiveCovered, effectiveTotal, {
        supported,
        emptyStatus: unavailable ? 'unavailable' : 'out_of_scope',
        threshold: extra.threshold ?? 1
      });
      return {
        id,
        label: categoryDefinitions.find((definition) => definition.id === id)?.label ?? id,
        status,
        covered: effectiveCovered,
        total: effectiveTotal,
        coverage: pct(effectiveCovered, effectiveTotal),
        notes: extra.notes ?? null
      };
    };

    const categories = [
      category('events_sessions', sessions.length, sessions.length, {
        notes: `${events.length} events, ${sessions.length} sessions.`
      }),
      category('race_results', raceResultSessions.length, comparableRaceSessions.length, {
        notes: `${raceRows.length} race/heat result rows across ${comparableRaceSessions.length} result-bearing race/heat sessions; ${raceSessions.length - comparableRaceSessions.length} schedule-only future sessions excluded from result completeness.`
      }),
      category('qualifying_classifications', qualifyingClassificationSessions.length, comparableQualifyingSessions.length, {
        notes: `${comparableQualifyingSessions.length} result-bearing qualifying sessions; qualifying classifications may live in results for PDF source families. ${qualifyingSessions.length - comparableQualifyingSessions.length - canceledQualifyingSessions.length} schedule-only future sessions and ${canceledQualifyingSessions.length} official canceled qualifying sessions excluded from result completeness.`
      }),
      category('grid_start_positions', raceRowsWithGrid.length, raceRows.length, {
        notes: `${raceRowsWithGrid.length}/${raceRows.length} race/heat rows have gridPosition or startPosition.`
      }),
      category('exact_session_windows', exactWindowSessions.length, physicalSessions.length, {
        status: exactWindowSessions.length === physicalSessions.length
          ? 'complete'
          : anyWindowSessions.length === physicalSessions.length
            ? 'partial'
            : exactWindowSessions.length > 0
              ? 'partial'
              : 'blocked',
        notes: `${exactWindowSessions.length}/${physicalSessions.length} physical sessions have clock-time starts; ${anyWindowSessions.length}/${physicalSessions.length} have at least date-level starts; ${exactWindowSourceUnavailableSessions.length} sessions are source-unavailable exact windows after official source review.`
      }),
      category('track_metadata', trackMetadataComplete, trackIds.size, {
        notes: `${trackMetadataComplete}/${trackIds.size} referenced tracks have coordinates, timezone, length, direction, surface, and corner count.`
      }),
      category('official_weather_conditions', weatherSessions.length, sessions.length, {
        notes: `${weatherSessions.length}/${sessions.length} sessions have official weather/track-condition observations.`
      }),
      category('lap_samples', series.id === 'series_indy_nxt' ? raceLapSampleSessions.length : lapSampleSessions.length, series.id === 'series_indy_nxt' ? comparableRaceSessions.length : sessions.length, {
        status: series.id === 'series_formula_ford'
          ? 'partial'
          : series.id === 'series_indy_nxt'
            ? 'partial'
          : undefined,
        notes: series.id === 'series_indy_nxt'
          ? `${raceLapSampleSessions.length}/${comparableRaceSessions.length} completed race sessions have lap-chart samples; 26 charts fully validate and 10 are clean partial visible-sample imports.`
          : series.id === 'series_formula_ford'
            ? `${lapSampleSessions.length} sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.`
            : `${lapSampleSessions.length} sessions have lap samples.`
      }),
      category('indy_section_data', sectionMetricSessions.length, series.id === 'series_indy_nxt' ? sessions.length : 0, {
        covered: series.id === 'series_indy_nxt' ? sectionCompleteSessions.length : sectionMetricSessions.length,
        total: series.id === 'series_indy_nxt' ? sectionComparableSessions.length : 0,
        status: indySectionStatus,
        notes: series.id === 'series_indy_nxt'
          ? `${sectionCompleteSessions.length}/${sectionComparableSessions.length} comparable sessions have both official Top Section Times and Section Results metrics. Aggregate combined qualifying rows, future schedule-only sessions, canceled sessions, and official no-row reports are excluded. Report parser cross-check: ${topSectionComparableParsed}/${topSectionComparableDiscovered} comparable Top Section reports parsed; ${sectionResultsComparableParsed}/${sectionResultsComparableDiscovered} comparable Section Results reports parsed. True held-outs: ${sectionResultsTrueHeldOut.filter((row) => row.reason !== 'official_report_has_no_section_rows').map((row) => `${row.sessionId} (${row.reason})`).join(', ') || 'none'}.`
          : null
      }),
      category('penalties_decisions', penaltySessions.length, sessions.length, {
        status: policy.supported.has('penalties_decisions')
          ? (penaltySessions.length > 0 ? (series.id === 'series_indy_nxt' ? 'complete' : 'partial') : 'blocked')
          : undefined,
        notes: `${penaltySessions.length} sessions have official penalty/decision rows.`
      }),
      category('incidents_cautions', incidentSessions.length, raceSessions.length, {
        status: series.id === 'series_indy_nxt' ? 'complete' : undefined,
        notes: `${incidentSessions.length} sessions have official incident/caution rows.`
      }),
      category('racecraft_summary', racecraftSessions.length, raceSessions.length, {
        status: series.id === 'series_indy_nxt' ? 'complete' : undefined,
        notes: `${racecraftSessions.length} race sessions have official most-improved/racecraft summary rows.`
      }),
      category('pit_stop_counts', raceRowsWithPitStops.length, raceRows.length, {
        notes: `${raceRowsWithPitStops.length}/${raceRows.length} race/heat result rows have pit-stop counts.`
      }),
      category('detailed_pit_context', 0, raceSessions.length, {
        notes: series.id === 'series_indy_nxt'
          ? 'INDY NXT official/API rows expose pit-stop counts, but the official report family does not expose a dedicated detailed pit-summary or pit-lane sequence.'
          : null
      }),
      category('derived_benchmarks', benchmarkMetrics.length, Math.max(1, eventIds.size), {
        status: benchmarkMetrics.length > 0 ? 'partial' : 'blocked',
        notes: `${benchmarkMetrics.length} non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.`
      })
    ];

    const years = [...new Set(events.map((event) => event.seasonYear).filter(Boolean))].sort((a, b) => a - b);
    const openGaps = allOpenGaps.filter((gap) => (knownGapMap[series.id] ?? []).includes(gap.id));
    const priorityGaps = categories
      .filter((row) =>
        ['partial', 'blocked'].includes(row.status) &&
        policy.supported.has(row.id) &&
        !['derived_benchmarks'].includes(row.id) &&
        !sourceFamilyPriorityExclusions[series.id]?.[row.id]
      )
      .map((row) => row.id);

    seriesRows.push({
      seriesId: series.id,
      seriesName: series.name,
      years,
      events: events.length,
      sessions: sessions.length,
      policyNote: policy.scopeNote ?? null,
      canceledOfficialSessionIds: sessions.filter((session) => canceledSessionEvidence.has(session.id)).map((session) => session.id),
      openGapIds: openGaps.map((gap) => gap.id),
      sourceFamilyPriorityExclusions: sourceFamilyPriorityExclusions[series.id] ?? {},
      categories,
      priorityGaps
    });

    for (const year of years) {
      const yearEvents = events.filter((event) => event.seasonYear === year);
      const yearEventIds = new Set(yearEvents.map((event) => event.id));
      const yearTrackIds = new Set(yearEvents.map((event) => event.trackId).filter(Boolean));
      const yearSessions = sessions.filter((session) => yearEventIds.has(session.eventId));
      const yearRaceSessions = yearSessions.filter(isRaceLike);
      const yearComparableRaceSessions = yearRaceSessions.filter(isResultBearingComparable);
      const yearQualifyingSessions = yearSessions.filter((session) => session.sessionType === 'qualifying');
      const yearCanceledQualifyingSessions = yearQualifyingSessions.filter((session) => canceledSessionEvidence.has(session.id));
      const yearComparableQualifyingSessions = yearQualifyingSessions.filter((session) =>
        isResultBearingComparable(session) && !canceledSessionEvidence.has(session.id)
      );
      const yearPhysicalSessions = yearSessions.filter((session) => !isPhysicalWindowExempt(session));
      const yearRaceRows = yearComparableRaceSessions.flatMap((session) => resultsBySession.get(session.id) ?? []);
      const yearRaceResultSessions = yearComparableRaceSessions.filter((session) => (resultsBySession.get(session.id) ?? []).length > 0);
      const yearQualifyingClassificationSessions = yearComparableQualifyingSessions.filter((session) =>
        (resultsBySession.get(session.id) ?? []).length > 0 ||
        (qualifyingBySession.get(session.id) ?? []).length > 0
      );
      const yearRaceRowsWithGrid = yearRaceRows.filter((row) => row.gridPosition != null || row.startPosition != null);
      const yearExactWindowSessions = yearPhysicalSessions.filter(hasExactTimestamp);
      const yearExactWindowSourceUnavailableSessions = yearPhysicalSessions.filter((session) =>
        isExactWindowSourceUnavailable(session) || sourceReviewedExactWindowHoldoutIds.has(session.id)
      );
      const yearAnyWindowSessions = yearPhysicalSessions.filter(hasAnyStart);
      const yearTrackMetadataComplete = [...yearTrackIds].filter((trackId) => {
        const track = tracksById.get(trackId);
        return Boolean(
          track &&
          Number.isFinite(track.latitude) &&
          Number.isFinite(track.longitude) &&
          track.timezone &&
          (Number.isFinite(track.lengthKm) || Number.isFinite(track.lengthMi)) &&
          track.direction &&
          track.direction !== 'unknown' &&
          track.surface &&
          Number.isFinite(track.cornerCount)
        );
      }).length;
      const yearWeatherSessions = yearSessions.filter((session) => (weatherBySession.get(session.id) ?? []).length > 0);
      const yearLapSampleSessions = yearSessions.filter((session) => (lapSamplesBySession.get(session.id) ?? []).length > 0);
      const yearRaceLapSampleSessions = yearComparableRaceSessions.filter((session) => (lapSamplesBySession.get(session.id) ?? []).length > 0);
      const yearPenaltySessions = yearSessions.filter((session) => (penaltiesBySession.get(session.id) ?? []).length > 0);
      const yearIncidentSessions = yearSessions.filter((session) => (incidentsBySession.get(session.id) ?? []).length > 0);
      const yearRacecraftSessions = yearSessions.filter((session) => (racecraftBySession.get(session.id) ?? []).length > 0);
      const yearRaceRowsWithPitStops = yearRaceRows.filter((row) => row.pitStops != null);
      const yearSectionMetricSessions = yearSessions.filter((session) =>
        (metricsBySession.get(session.id) ?? []).some((metric) =>
          indyNxtSectionMetricTypes.includes(metric.metricType)
        )
      );
      const yearSectionComparableSessions = yearSessions.filter(isIndyNxtComparableSectionSession);
      const yearSectionCompleteSessions = yearSectionComparableSessions.filter(hasBothIndyNxtSectionMetricTypes);
      const yearBenchmarkMetrics = benchmarkMetrics.filter((metric) => yearEventIds.has(metric.eventId));
      const yearCategories = applySeasonOverrides({ seriesId: series.id, year, categories: [
        category('events_sessions', yearSessions.length, yearSessions.length, {
          notes: `${yearEvents.length} events, ${yearSessions.length} sessions.`
        }),
        category('race_results', yearRaceResultSessions.length, yearComparableRaceSessions.length, {
          notes: `${yearRaceRows.length} race/heat result rows across ${yearComparableRaceSessions.length} result-bearing race/heat sessions.`
        }),
        category('qualifying_classifications', yearQualifyingClassificationSessions.length, yearComparableQualifyingSessions.length, {
          notes: `${yearComparableQualifyingSessions.length} result-bearing qualifying sessions; ${yearCanceledQualifyingSessions.length} official canceled qualifying sessions excluded.`
        }),
        category('grid_start_positions', yearRaceRowsWithGrid.length, yearRaceRows.length, {
          notes: `${yearRaceRowsWithGrid.length}/${yearRaceRows.length} race/heat rows have gridPosition or startPosition.`
        }),
        category('exact_session_windows', yearExactWindowSessions.length, yearPhysicalSessions.length, {
          status: yearExactWindowSessions.length === yearPhysicalSessions.length
            ? 'complete'
            : yearAnyWindowSessions.length === yearPhysicalSessions.length
              ? 'partial'
              : yearExactWindowSessions.length > 0
                ? 'partial'
                : 'blocked',
          notes: `${yearExactWindowSessions.length}/${yearPhysicalSessions.length} physical sessions have clock-time starts; ${yearAnyWindowSessions.length}/${yearPhysicalSessions.length} have at least date-level starts; ${yearExactWindowSourceUnavailableSessions.length} sessions are source-unavailable exact windows after official source review.`
        }),
        category('track_metadata', yearTrackMetadataComplete, yearTrackIds.size, {
          notes: `${yearTrackMetadataComplete}/${yearTrackIds.size} referenced tracks have complete metadata.`
        }),
        category('official_weather_conditions', yearWeatherSessions.length, yearSessions.length, {
          notes: `${yearWeatherSessions.length}/${yearSessions.length} sessions have official weather/track-condition observations.`
        }),
        category('lap_samples', series.id === 'series_indy_nxt' ? yearRaceLapSampleSessions.length : yearLapSampleSessions.length, series.id === 'series_indy_nxt' ? yearComparableRaceSessions.length : yearSessions.length, {
          status: series.id === 'series_formula_ford'
            ? 'partial'
            : series.id === 'series_indy_nxt'
              ? 'partial'
              : undefined,
          notes: series.id === 'series_indy_nxt'
            ? `${yearRaceLapSampleSessions.length}/${yearComparableRaceSessions.length} completed race sessions have lap-chart samples; chart fidelity is tracked in importer diagnostics.`
            : `${yearLapSampleSessions.length} sessions have lap samples.`
        }),
        category('indy_section_data', yearSectionMetricSessions.length, series.id === 'series_indy_nxt' ? yearSessions.length : 0, {
          covered: series.id === 'series_indy_nxt' ? yearSectionCompleteSessions.length : yearSectionMetricSessions.length,
          total: series.id === 'series_indy_nxt' ? yearSectionComparableSessions.length : 0,
          status: series.id === 'series_indy_nxt'
            ? (yearSectionCompleteSessions.length === yearSectionComparableSessions.length ? 'complete' : yearSectionCompleteSessions.length > 0 ? 'partial' : 'blocked')
            : undefined,
          notes: series.id === 'series_indy_nxt'
            ? `${yearSectionCompleteSessions.length}/${yearSectionComparableSessions.length} comparable sessions have both official Top Section Times and Section Results metrics. Aggregate combined qualifying rows, future schedule-only sessions, canceled sessions, and official no-row reports are excluded.`
            : null
        }),
        category('penalties_decisions', yearPenaltySessions.length, yearSessions.length, {
          status: policy.supported.has('penalties_decisions')
            ? (yearPenaltySessions.length > 0 ? (series.id === 'series_indy_nxt' ? 'complete' : 'partial') : 'blocked')
            : undefined,
          notes: `${yearPenaltySessions.length} sessions have official penalty/decision rows.`
        }),
        category('incidents_cautions', yearIncidentSessions.length, yearRaceSessions.length, {
          status: series.id === 'series_indy_nxt' ? 'complete' : undefined,
          notes: `${yearIncidentSessions.length} sessions have official incident/caution rows.`
        }),
        category('racecraft_summary', yearRacecraftSessions.length, yearRaceSessions.length, {
          status: series.id === 'series_indy_nxt' ? 'complete' : undefined,
          notes: `${yearRacecraftSessions.length} race sessions have official most-improved/racecraft summary rows.`
        }),
        category('pit_stop_counts', yearRaceRowsWithPitStops.length, yearRaceRows.length, {
          notes: `${yearRaceRowsWithPitStops.length}/${yearRaceRows.length} race/heat result rows have pit-stop counts.`
        }),
        category('detailed_pit_context', 0, yearRaceSessions.length, {
          notes: series.id === 'series_indy_nxt'
            ? 'INDY NXT official/API rows expose pit-stop counts, but the official report family does not expose a dedicated detailed pit-summary or pit-lane sequence.'
            : null
        }),
        category('derived_benchmarks', yearBenchmarkMetrics.length, Math.max(1, yearEvents.length), {
          status: yearBenchmarkMetrics.length > 0 ? 'partial' : 'blocked',
          notes: `${yearBenchmarkMetrics.length} non-report derived metrics exist for this season.`
        })
      ]});
      seasonRows.push({
        seriesId: series.id,
        seriesName: series.name,
        year,
        events: yearEvents.length,
        sessions: yearSessions.length,
        raceSessions: yearRaceSessions.length,
        raceRows: yearRaceRows.length,
        qualifyingSessions: yearQualifyingSessions.length,
        exactWindowSessions: yearExactWindowSessions.length,
        physicalSessions: yearPhysicalSessions.length,
        raceRowsWithGridOrStart: yearRaceRowsWithGrid.length,
        raceRowsWithPitStops: yearRaceRowsWithPitStops.length,
        lapSampleSessions: yearLapSampleSessions.length,
        weatherSessions: yearWeatherSessions.length,
        priorityGaps: yearCategories
          .filter((row) =>
            ['partial', 'blocked'].includes(row.status) &&
            policy.supported.has(row.id) &&
            !['derived_benchmarks'].includes(row.id) &&
            !sourceFamilyPriorityExclusions[series.id]?.[row.id]
          )
          .map((row) => row.id),
        categories: yearCategories
      });

      for (const session of yearSessions) {
        const event = eventsById.get(session.eventId);
        const track = event?.trackId ? tracksById.get(event.trackId) : null;
        const sessionResults = resultsBySession.get(session.id) ?? [];
        const sessionQualifyingResults = qualifyingBySession.get(session.id) ?? [];
        const sessionMetrics = metricsBySession.get(session.id) ?? [];
        const sessionBenchmarkMetrics = sessionMetrics.filter((metric) =>
          ![
            'official_event_summary_race_stats',
            'official_leader_lap_summary',
            'official_top_section_times',
            'official_section_results'
          ].includes(metric.metricType)
        );
        const isComparableRace = isRaceLike(session) && isResultBearingComparable(session);
        const isComparableQualifying = session.sessionType === 'qualifying' && isResultBearingComparable(session) && !canceledSessionEvidence.has(session.id);
        const isComparableIndyNxtSectionSession = isIndyNxtComparableSectionSession(session);
        const sessionIndyNxtSectionMetricTypes = new Set(
          sessionMetrics
            .filter((metric) => indyNxtSectionMetricTypes.includes(metric.metricType))
            .map((metric) => metric.metricType)
        );
        const sessionTrackMetadataComplete = Boolean(
          track &&
          Number.isFinite(track.latitude) &&
          Number.isFinite(track.longitude) &&
          track.timezone &&
          (Number.isFinite(track.lengthKm) || Number.isFinite(track.lengthMi)) &&
          track.direction &&
          track.direction !== 'unknown' &&
          track.surface &&
          Number.isFinite(track.cornerCount)
        );
        const sessionCategories = applySeasonOverrides({ seriesId: series.id, year, categories: [
          {
            id: 'events_sessions',
            status: 'complete',
            covered: 1,
            total: 1
          },
          {
            id: 'race_results',
            status: !isRaceLike(session)
              ? 'out_of_scope'
              : !isResultBearingComparable(session)
                ? 'unavailable'
                : sessionResults.length > 0
                  ? 'complete'
                  : 'blocked',
            covered: sessionResults.length,
            total: isComparableRace ? 1 : 0
          },
          {
            id: 'qualifying_classifications',
            status: session.sessionType !== 'qualifying'
              ? 'out_of_scope'
              : canceledSessionEvidence.has(session.id)
                ? 'unavailable'
                : !isResultBearingComparable(session)
                  ? 'unavailable'
                  : (sessionResults.length > 0 || sessionQualifyingResults.length > 0)
                    ? 'complete'
                    : 'blocked',
            covered: sessionResults.length + sessionQualifyingResults.length,
            total: isComparableQualifying ? 1 : 0
          },
          {
            id: 'grid_start_positions',
            status: !isComparableRace || !policy.supported.has('grid_start_positions')
              ? (policy.unavailable.has('grid_start_positions') ? 'unavailable' : 'out_of_scope')
              : sessionResults.length > 0 && sessionResults.every((row) => row.gridPosition != null || row.startPosition != null)
                ? 'complete'
                : sessionResults.some((row) => row.gridPosition != null || row.startPosition != null)
                  ? 'partial'
                  : 'blocked',
            covered: sessionResults.filter((row) => row.gridPosition != null || row.startPosition != null).length,
            total: isComparableRace ? sessionResults.length : 0
          },
          {
            id: 'exact_session_windows',
            status: isPhysicalWindowExempt(session)
              ? 'out_of_scope'
              : isExactWindowSourceUnavailable(session)
                ? 'unavailable'
              : hasExactTimestamp(session)
                ? 'complete'
                : hasAnyStart(session)
                  ? 'partial'
                  : 'blocked',
            covered: hasExactTimestamp(session) ? 1 : 0,
            total: isPhysicalWindowExempt(session) || isExactWindowSourceUnavailable(session) ? 0 : 1
          },
          {
            id: 'track_metadata',
            status: sessionTrackMetadataComplete ? 'complete' : 'blocked',
            covered: sessionTrackMetadataComplete ? 1 : 0,
            total: 1
          },
          {
            id: 'official_weather_conditions',
            status: !policy.supported.has('official_weather_conditions')
              ? (policy.unavailable.has('official_weather_conditions') ? 'unavailable' : 'out_of_scope')
              : (weatherBySession.get(session.id) ?? []).length > 0
                ? 'complete'
                : 'blocked',
            covered: (weatherBySession.get(session.id) ?? []).length,
            total: policy.supported.has('official_weather_conditions') ? 1 : 0
          },
          {
            id: 'lap_samples',
            status: !policy.supported.has('lap_samples')
              ? (policy.unavailable.has('lap_samples') ? 'unavailable' : 'out_of_scope')
              : series.id === 'series_indy_nxt' && !isComparableRace
                ? 'out_of_scope'
              : (lapSamplesBySession.get(session.id) ?? []).length > 0
                ? (series.id === 'series_indy_nxt' || series.id === 'series_formula_ford' ? 'partial' : 'complete')
                : 'blocked',
            covered: (lapSamplesBySession.get(session.id) ?? []).length,
            total: policy.supported.has('lap_samples') && !(series.id === 'series_indy_nxt' && !isComparableRace) ? 1 : 0
          },
          {
            id: 'indy_section_data',
            status: series.id !== 'series_indy_nxt'
              ? 'unavailable'
              : !isComparableIndyNxtSectionSession
                ? 'unavailable'
              : indyNxtSectionMetricTypes.every((type) => sessionIndyNxtSectionMetricTypes.has(type))
                ? 'complete'
                : sessionIndyNxtSectionMetricTypes.size > 0
                  ? 'partial'
                  : 'blocked',
            covered: sessionIndyNxtSectionMetricTypes.size,
            total: series.id === 'series_indy_nxt' && isComparableIndyNxtSectionSession ? indyNxtSectionMetricTypes.length : 0
          },
          {
            id: 'penalties_decisions',
            status: !policy.supported.has('penalties_decisions')
              ? (policy.unavailable.has('penalties_decisions') ? 'unavailable' : 'out_of_scope')
              : (penaltiesBySession.get(session.id) ?? []).length > 0
                ? 'complete'
                : 'partial',
            covered: (penaltiesBySession.get(session.id) ?? []).length,
            total: policy.supported.has('penalties_decisions') ? 1 : 0
          },
          {
            id: 'incidents_cautions',
            status: !policy.supported.has('incidents_cautions')
              ? (policy.unavailable.has('incidents_cautions') ? 'unavailable' : 'out_of_scope')
              : !isComparableRace
                ? 'out_of_scope'
              : (incidentsBySession.get(session.id) ?? []).length > 0
                ? 'complete'
                : 'partial',
            covered: (incidentsBySession.get(session.id) ?? []).length,
            total: policy.supported.has('incidents_cautions') && isComparableRace ? 1 : 0
          },
          {
            id: 'racecraft_summary',
            status: !policy.supported.has('racecraft_summary')
              ? (policy.unavailable.has('racecraft_summary') ? 'unavailable' : 'out_of_scope')
              : !isComparableRace
                ? 'out_of_scope'
              : (racecraftBySession.get(session.id) ?? []).length > 0
                ? 'complete'
                : 'partial',
            covered: (racecraftBySession.get(session.id) ?? []).length,
            total: policy.supported.has('racecraft_summary') && isComparableRace ? 1 : 0
          },
          {
            id: 'pit_stop_counts',
            status: !isComparableRace || !policy.supported.has('pit_stop_counts')
              ? (policy.unavailable.has('pit_stop_counts') ? 'unavailable' : 'out_of_scope')
              : sessionResults.length > 0 && sessionResults.every((row) => row.pitStops != null)
                ? 'complete'
                : sessionResults.some((row) => row.pitStops != null)
                  ? 'partial'
                  : 'blocked',
            covered: sessionResults.filter((row) => row.pitStops != null).length,
            total: isComparableRace ? sessionResults.length : 0
          },
          {
            id: 'detailed_pit_context',
            status: !policy.supported.has('detailed_pit_context')
              ? (policy.unavailable.has('detailed_pit_context') ? 'unavailable' : 'out_of_scope')
              : !isComparableRace
                ? 'out_of_scope'
              : 'blocked',
            covered: 0,
            total: policy.supported.has('detailed_pit_context') && isComparableRace ? 1 : 0
          },
          {
            id: 'derived_benchmarks',
            status: sessionBenchmarkMetrics.length > 0 ? 'partial' : 'blocked',
            covered: sessionBenchmarkMetrics.length,
            total: 1
          }
        ]});
        sessionRows.push({
          seriesId: series.id,
          seriesName: series.name,
          year,
          eventId: event?.id ?? null,
          eventName: event?.name ?? null,
          sessionId: session.id,
          sessionName: session.sessionName,
          sessionType: session.sessionType,
          ingestionState: session.ingestionState ?? null,
          sourceFamily: session.sourceFamily ?? session.sourceType ?? null,
          categories: sessionCategories
        });
      }
    }
  }

  const indyNxtCoverage = seriesRows.find((row) => row.seriesId === 'series_indy_nxt');
  const globalPriority = [
    indyNxtCoverage?.priorityGaps?.length
      ? {
          rank: 1,
          id: 'audit_and_patch_indy_nxt_detail_categories',
          seriesId: 'series_indy_nxt',
          rationale: `INDY NXT is the richest and most UI-relevant source family. Active source-backed priority gaps remain: ${indyNxtCoverage.priorityGaps.join(', ')}.`
        }
      : {
          rank: 1,
          id: 'publish_indy_nxt_dashboard_readiness',
          seriesId: 'series_indy_nxt',
          rationale: 'INDY NXT active source-backed detail blockers are closed or explicitly source-bounded. Publish the production-safe analytics list and caveats so BryceCast UI work can start from the stable official/API/PDF dataset.'
        },
    {
      rank: 2,
      id: 'resolve_or_preserve_gb3_2022_source_broken_rows',
      seriesId: 'series_gb3',
      rationale: 'GB3 2021 TSL PDFs and GB3 2022 JSON expose different detail categories; after preserving that source-family split, the remaining hard GB3 gap is the official 2022 session 1248 JSON 404.'
    },
    {
      rank: 3,
      id: 'harden_formula_ford_lap_sample_scope',
      seriesId: 'series_formula_ford',
      rationale: 'Formula Ford 2020 grid/start rows are now complete for source-matchable official event-book rows, with seven source-asymmetry holdouts preserved explicitly. The remaining active Formula Ford priority is deciding whether official lap-analysis pages justify expanding beyond the current Bryce-only lap samples.'
    }
  ];

  return {
    schemaVersion: 'bryce-career-coverage-matrix.v1',
    generatedAt: new Date().toISOString(),
    datasetPath: 'data/career/career.dataset.json',
    validation: summary?.validation ?? null,
    categoryDefinitions,
    statusDefinitions: {
      complete: 'Canonical coverage is internally consistent for the category in this series/source family.',
      partial: 'Some source-backed coverage exists, but comparable rows or sessions are incomplete or held out.',
      blocked: 'The category is expected or high-value, but exact source evidence/import logic is missing or source-broken.',
      unavailable: 'Current official source family does not expose this category consistently enough to require it.',
      out_of_scope: 'Category is outside the production analytics scope for this series/source family.'
    },
    series: seriesRows,
    seasons: seasonRows,
    sessions: sessionRows,
    globalPriority,
    openGaps: asArray(dataset.gaps).filter((gap) => gap.status !== 'closed').map((gap) => ({
      id: gap.id,
      status: gap.status,
      description: gap.description
    })),
    canceledSessionEvidence: [...canceledSessionEvidence.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
  };
};

const statusIcon = (status) => ({
  complete: 'complete',
  partial: 'partial',
  blocked: 'blocked',
  unavailable: 'unavailable',
  out_of_scope: 'out of scope'
}[status] ?? status);

const buildMarkdown = (report) => {
  const lines = [];
  lines.push('# Career Analytics Coverage Matrix');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('This report is generated from the canonical dataset and importer reports. It covers the production analytics window starting with 2019 FRP F1600 and running through current 2026 INDY NXT. Pre-2019 karting remains narrative/context only.');
  lines.push('');
  lines.push('## Status Definitions');
  lines.push('');
  for (const [status, definition] of Object.entries(report.statusDefinitions)) {
    lines.push(`- ${status}: ${definition}`);
  }
  lines.push('');
  lines.push('## Series Summary');
  lines.push('');
  lines.push('| Series | Years | Events | Sessions | Priority Gaps | Open Gap IDs |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- |');
  for (const row of report.series) {
    lines.push(`| ${row.seriesName} | ${row.years.join(', ')} | ${row.events} | ${row.sessions} | ${row.priorityGaps.join(', ') || 'none'} | ${row.openGapIds.join(', ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Category Matrix');
  lines.push('');
  const categoryIds = report.categoryDefinitions.map((category) => category.id);
  lines.push(`| Series | ${report.categoryDefinitions.map((category) => category.label).join(' | ')} |`);
  lines.push(`| --- | ${categoryIds.map(() => '---').join(' | ')} |`);
  for (const row of report.series) {
    const byId = new Map(row.categories.map((category) => [category.id, category]));
    lines.push(`| ${row.seriesName} | ${categoryIds.map((id) => statusIcon(byId.get(id)?.status)).join(' | ')} |`);
  }
  lines.push('');
  lines.push('## Season Diagnostics');
  lines.push('');
  lines.push('| Series | Year | Events | Sessions | Race Rows | Qual Sessions | Exact Window Sessions | Grid/Start Race Rows | Pit-Stop Count Rows | Lap-Sample Sessions | Weather Sessions |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of report.seasons) {
    lines.push(`| ${row.seriesName} | ${row.year} | ${row.events} | ${row.sessions} | ${row.raceRows} | ${row.qualifyingSessions} | ${row.exactWindowSessions}/${row.physicalSessions} | ${row.raceRowsWithGridOrStart}/${row.raceRows} | ${row.raceRowsWithPitStops}/${row.raceRows} | ${row.lapSampleSessions} | ${row.weatherSessions} |`);
  }
  lines.push('');
  lines.push('## Season Category Matrix');
  lines.push('');
  lines.push(`| Series | Year | Priority Gaps | ${report.categoryDefinitions.map((category) => category.label).join(' | ')} |`);
  lines.push(`| --- | ---: | --- | ${categoryIds.map(() => '---').join(' | ')} |`);
  for (const row of report.seasons) {
    const byId = new Map(row.categories.map((category) => [category.id, category]));
    lines.push(`| ${row.seriesName} | ${row.year} | ${row.priorityGaps.join(', ') || 'none'} | ${categoryIds.map((id) => statusIcon(byId.get(id)?.status)).join(' | ')} |`);
  }
  lines.push('');
  const sessionGapRows = report.sessions
    .map((session) => {
      const series = report.series.find((row) => row.seriesId === session.seriesId);
      const priorityGapSet = new Set(series?.priorityGaps ?? []);
      const gaps = session.categories
        .filter((category) => priorityGapSet.has(category.id) && ['partial', 'blocked'].includes(category.status))
        .map((category) => `${category.id}:${category.status}`);
      return { ...session, gaps };
    })
    .filter((row) => row.gaps.length > 0);
  lines.push('## Session Gap Diagnostics');
  lines.push('');
  lines.push('This table lists sessions that still have partial or blocked coverage in that series priority categories. The JSON report contains all session/category rows.');
  lines.push('');
  lines.push('| Series | Year | Event | Session | Type | Gaps |');
  lines.push('| --- | ---: | --- | --- | --- | --- |');
  for (const row of sessionGapRows.slice(0, 200)) {
    lines.push(`| ${row.seriesName} | ${row.year} | ${row.eventName ?? row.eventId ?? ''} | ${row.sessionName} (${row.sessionId}) | ${row.sessionType} | ${row.gaps.join(', ')} |`);
  }
  if (sessionGapRows.length > 200) {
    lines.push(`| ... |  |  |  |  | ${sessionGapRows.length - 200} additional rows omitted from Markdown; inspect data/career/reports/career-coverage-matrix.json. |`);
  }
  lines.push('');
  lines.push('## Recommended Patch Order');
  lines.push('');
  for (const item of report.globalPriority) {
    lines.push(`${item.rank}. ${item.id}: ${item.rationale}`);
  }
  lines.push('');
  if (report.canceledSessionEvidence.length) {
    lines.push('## Official Canceled Sessions');
    lines.push('');
    lines.push('| Session | Evidence | Files |');
    lines.push('| --- | --- | --- |');
    for (const row of report.canceledSessionEvidence) {
      lines.push(`| ${row.sessionId} | ${row.evidenceText ?? ''} | ${row.files.join(', ')} |`);
    }
    lines.push('');
  }

  lines.push('## Notes By Series');
  lines.push('');
  for (const row of report.series) {
    lines.push(`### ${row.seriesName}`);
    if (row.policyNote) lines.push(`- ${row.policyNote}`);
    for (const [categoryId, rationale] of Object.entries(row.sourceFamilyPriorityExclusions ?? {})) {
      const label = report.categoryDefinitions.find((category) => category.id === categoryId)?.label ?? categoryId;
      lines.push(`- ${label}: source availability exception, not a priority gap. ${rationale}`);
    }
    for (const category of row.categories.filter((category) => category.status !== 'complete')) {
      lines.push(`- ${category.label}: ${category.status}. ${category.notes ?? ''}`.trim());
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
};

const main = async () => {
  const [dataset, summary, indyReport, indyWindowReport] = await Promise.all([
    readJson(datasetPath),
    readJson(join(reportsDir, 'ingestion-summary.json'), null),
    readJson(join(reportsDir, 'indy-nxt-report-details-backfill-report.json'), null),
    readJson(join(reportsDir, 'indy-nxt-session-window-backfill-report.json'), null)
  ]);
  if (!dataset) throw new Error(`Missing dataset at ${datasetPath}`);

  const canceledSessionEvidence = await collectCanceledSessionEvidence(dataset);
  const report = buildCoverage({ dataset, summary, indyReport, indyWindowReport, canceledSessionEvidence });
  await writeFile(jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownOutputPath, buildMarkdown(report));
  console.log(JSON.stringify({
    wrote: [jsonOutputPath, markdownOutputPath],
    series: report.series.length,
    categories: report.categoryDefinitions.length,
    priority: report.globalPriority.map((item) => item.id)
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
