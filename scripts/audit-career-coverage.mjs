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
    description: 'Official penalty or decision rows linked to sessions and drivers where possible.'
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
      'detailed_pit_context',
      'derived_benchmarks'
    ]),
    unavailable: new Set(['official_weather_conditions'])
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
  series_indy_nxt: ['gap_indy_nxt_qualifying_lap_reports']
};

const buildCoverage = ({ dataset, summary, indyReport, canceledSessionEvidence }) => {
  const eventsById = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const sessionsById = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const tracksById = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));
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
        notes: `${exactWindowSessions.length}/${physicalSessions.length} physical sessions have clock-time starts; ${anyWindowSessions.length}/${physicalSessions.length} have at least date-level starts.`
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
          : `${lapSampleSessions.length} sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.`
      }),
      category('indy_section_data', sectionMetricSessions.length, series.id === 'series_indy_nxt' ? sessions.length : 0, {
        covered: series.id === 'series_indy_nxt' ? Math.min(topSectionComparableParsed, sectionResultsComparableParsed) : sectionMetricSessions.length,
        total: series.id === 'series_indy_nxt' ? Math.max(topSectionComparableDiscovered, sectionResultsComparableDiscovered) : 0,
        status: indySectionStatus,
        notes: series.id === 'series_indy_nxt'
          ? `${topSectionComparableParsed}/${topSectionComparableDiscovered} comparable Top Section reports parsed after excluding ${topSectionCanceledHeldOut} official canceled session; ${sectionResultsComparableParsed}/${sectionResultsComparableDiscovered} comparable Section Results reports parsed after excluding ${sectionResultsCanceledHeldOut} official canceled session. True held-outs: ${sectionResultsTrueHeldOut.map((row) => `${row.sessionId} (${row.reason})`).join(', ') || 'none'}.`
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
        status: policy.supported.has('detailed_pit_context') ? 'blocked' : undefined,
        notes: series.id === 'series_indy_nxt'
          ? 'INDY NXT has official/API pit-stop counts, but no detailed pit-summary or pit-lane sequence importer yet.'
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
        !['derived_benchmarks'].includes(row.id)
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
      categories,
      priorityGaps
    });

    for (const year of years) {
      const yearEvents = events.filter((event) => event.seasonYear === year);
      const yearEventIds = new Set(yearEvents.map((event) => event.id));
      const yearSessions = sessions.filter((session) => yearEventIds.has(session.eventId));
      const yearRaceSessions = yearSessions.filter(isRaceLike);
      const yearRaceRows = yearRaceSessions.flatMap((session) => resultsBySession.get(session.id) ?? []);
      seasonRows.push({
        seriesId: series.id,
        seriesName: series.name,
        year,
        events: yearEvents.length,
        sessions: yearSessions.length,
        raceSessions: yearRaceSessions.length,
        raceRows: yearRaceRows.length,
        qualifyingSessions: yearSessions.filter((session) => session.sessionType === 'qualifying').length,
        exactWindowSessions: yearSessions.filter((session) => !isPhysicalWindowExempt(session) && hasExactTimestamp(session)).length,
        physicalSessions: yearSessions.filter((session) => !isPhysicalWindowExempt(session)).length,
        raceRowsWithGridOrStart: yearRaceRows.filter((row) => row.gridPosition != null || row.startPosition != null).length,
        raceRowsWithPitStops: yearRaceRows.filter((row) => row.pitStops != null).length,
        lapSampleSessions: yearSessions.filter((session) => (lapSamplesBySession.get(session.id) ?? []).length > 0).length,
        weatherSessions: yearSessions.filter((session) => (weatherBySession.get(session.id) ?? []).length > 0).length
      });
    }
  }

  const globalPriority = [
    {
      rank: 1,
      id: 'audit_and_patch_indy_nxt_detail_categories',
      seriesId: 'series_indy_nxt',
      rationale: 'INDY NXT is the richest and most UI-relevant source family. Lap charts, section data, penalties, cautions, racecraft, and pit-stop counts are already present; detailed pit context remains blocked unless official report availability is confirmed.'
    },
    {
      rank: 2,
      id: 'patch_froc_grid_and_exact_test_windows_where_source_exists',
      seriesId: 'series_froc',
      rationale: 'FROC has known partial grid/start and exact test-window gaps. Date-only article context is present; exact times should stay null until official timing evidence appears.'
    },
    {
      rank: 3,
      id: 'resolve_or_preserve_gb3_2022_source_broken_rows',
      seriesId: 'series_gb3',
      rationale: 'GB3 2021 is strong; GB3 2022 has one official manifest session with a row-level JSON 404 and broader start/grid asymmetry versus 2021.'
    },
    {
      rank: 4,
      id: 'harden_formula_ford_lap_and_grid_diagnostics',
      seriesId: 'series_formula_ford',
      rationale: 'Formula Ford 2020 has rich official PDFs, but grid rows and Bryce-only lap-analysis continuation pages remain partial by parser confidence.'
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
    for (const category of row.categories.filter((category) => category.status !== 'complete')) {
      lines.push(`- ${category.label}: ${category.status}. ${category.notes ?? ''}`.trim());
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
};

const main = async () => {
  const [dataset, summary, indyReport] = await Promise.all([
    readJson(datasetPath),
    readJson(join(reportsDir, 'ingestion-summary.json'), null),
    readJson(join(reportsDir, 'indy-nxt-report-details-backfill-report.json'), null)
  ]);
  if (!dataset) throw new Error(`Missing dataset at ${datasetPath}`);

  const canceledSessionEvidence = await collectCanceledSessionEvidence(dataset);
  const report = buildCoverage({ dataset, summary, indyReport, canceledSessionEvidence });
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
