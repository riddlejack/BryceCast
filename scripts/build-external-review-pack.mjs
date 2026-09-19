import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'analysis', 'external-review-pack');
const sampleDir = path.join(outDir, 'sample-payloads');

const rel = (filePath) => path.relative(repoRoot, filePath).split(path.sep).join('/');
const repoPath = (relativePath) => path.join(repoRoot, relativePath);

const json = async (relativePath) => JSON.parse(await readFile(repoPath(relativePath), 'utf8'));
const text = async (relativePath) => readFile(repoPath(relativePath), 'utf8');

const number = (value, digits = 3) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
};

const compactJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const markdownTable = (headers, rows) => {
  const escape = (value) =>
    String(value ?? '')
      .replaceAll('\n', '<br>')
      .replaceAll('|', '\\|');
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`)
  ].join('\n');
};

const countBy = (rows, key) =>
  rows.reduce((counts, row) => {
    const value = row[key] ?? 'unknown';
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const collectionCount = (value) => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
};

const hashFile = async (relativePath) => {
  const absolutePath = repoPath(relativePath);
  const bytes = await readFile(absolutePath);
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

const csvSummary = async (relativePath) => {
  const body = await text(relativePath);
  const lines = body.trimEnd().split(/\r?\n/);
  const headers = lines[0]?.split(',') ?? [];
  return {
    path: relativePath,
    rows: Math.max(0, lines.length - 1),
    columns: headers.length,
    fields: headers
  };
};

const sourceFiles = [
  'docs/archive/handoffs/CODEX_HANDOFF_CURRENT.md',
  'docs/contracts/UI_ANALYTICS_PRODUCT_CONTRACT.md',
  'docs/contracts/LIVE_RACE_DAY_PRODUCT_CONTRACT.md',
  'docs/archive/audits/LIVE_DATA_READINESS_AUDIT.md',
  'docs/archive/audits/ANALYTICS_SOURCE_AUDIT.md',
  'docs/archive/audits/INDY_NXT_WEATHER_ENRICHMENT_AUDIT.md',
  'analysis/devspace-audit/devspace-audit-evidence.json',
  'analysis/ANALYTICS_UI_ARTIFACT_INDEX.md',
  'analysis/ui-data-package/README.md',
  'analysis/ui-data-package/ui-data-package.json',
  'analysis/ui-contract/ui-metric-manifest.json',
  'analysis/predictive-race-intelligence/README.md',
  'analysis/predictive-race-intelligence/output/summary.json',
  'analysis/predictive-race-intelligence/output/analytics_inventory_registry.json',
  'analysis/predictive-race-intelligence/output/model_scorecard.json',
  'analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json',
  'analysis/predictive-race-intelligence/output/context-packs/career-lab-context.json',
  'analysis/predictive-race-intelligence/output/context-packs/live-race-day-context.json',
  'analysis/career-dimension-context-layer/output/summary.json',
  'analysis/context-event-narrative-layer/output/summary.json',
  'analysis/data-utilization-audit/output/DATA_UTILIZATION_AUDIT.md',
  'analysis/formula-ford-lap-shape/output/summary.json',
  'analysis/imsa-daytona-stint-class-pace/output/summary.json',
  'analysis/indy-nxt-discovery/output/summary.json',
  'analysis/indy-nxt-discovery/output/deep_dive/summary.json',
  'analysis/indy-nxt-race-lap-section-enhancement/output/summary.json',
  'analysis/indy-nxt-section-lap-deep-dive/output/summary.json',
  'analysis/live-contract/README.md',
  'analysis/live-contract/live-api-contract.json',
  'analysis/career-parity/output/summary.json',
  'data/career/career.dataset.json',
  'data/career/sources.manifest.json',
  'data/career/reports/career-coverage-matrix.json',
  'data/career/reports/ingestion-summary.json',
  'data/career/reports/validation-report.json',
  'data/career/reports/indy-nxt-weather-station-crosscheck-report.json',
  'src/App.tsx',
  'src/data/uiContextAdapter.ts',
  'src/data/uiDataPackage.ts',
  'tests/uiContextAdapter.test.ts',
  'scripts/test-ui-context-adapter.mjs'
];

const csvFiles = [
  'analysis/career-parity/output/tables/career_metric_family_parity.csv',
  'analysis/career-parity/output/tables/career_result_conversion.csv',
  'analysis/career-parity/output/tables/career_series_result_summary.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_driver.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_race.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/future_weekend_prep_inputs.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/incident_penalty_context.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/indy_nxt_source_family_audit.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/leader_lap_context.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/race_track_type_summary.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_race.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_section.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv',
  'analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_year.csv',
  'analysis/predictive-race-intelligence/output/career_prior_matrix.csv',
  'analysis/predictive-race-intelligence/output/indy_nxt_feature_matrix.csv'
];

const getEventSeries = (eventById, sessionById, row) => {
  if (row.seriesId) return row.seriesId;
  if (row.eventId) return eventById.get(row.eventId)?.seriesId ?? null;
  if (row.sessionId) {
    const session = sessionById.get(row.sessionId);
    return session ? eventById.get(session.eventId)?.seriesId ?? null : null;
  }
  return null;
};

const buildCareerCapability = (dataset, coverageMatrix) => {
  const eventById = new Map(dataset.events.map((event) => [event.id, event]));
  const sessionById = new Map(dataset.sessions.map((session) => [session.id, session]));
  const coverageRows = Array.isArray(coverageMatrix)
    ? coverageMatrix
    : coverageMatrix.series ?? coverageMatrix.rows ?? coverageMatrix.coverage ?? [];

  const rowCount = (rows, seriesId) =>
    rows.filter((row) => getEventSeries(eventById, sessionById, row) === seriesId).length;

  return dataset.series
    .map((series) => {
      const events = dataset.events.filter((event) => event.seriesId === series.id);
      const eventIds = new Set(events.map((event) => event.id));
      const sessions = dataset.sessions.filter((session) => eventIds.has(session.eventId));
      const sessionIds = new Set(sessions.map((session) => session.id));
      const resultRows = dataset.results.filter((row) => getEventSeries(eventById, sessionById, row) === series.id);
      const coverage = coverageRows.find((row) => row.seriesId === series.id);
      const categories = (coverage?.categories ?? []).map((category) => ({
        id: category.id,
        label: category.label,
        status: category.status,
        covered: category.covered,
        total: category.total,
        coverage: number(category.coverage),
        notes: category.notes
      }));

      return {
        seriesId: series.id,
        seriesName: series.name,
        years: coverage?.years ?? Array.from(new Set(events.map((event) => event.seasonYear))).sort(),
        events: events.length,
        sessions: sessions.length,
        resultRows: resultRows.length,
        bryceResultRows: resultRows.filter((row) => row.driverId === 'driver_bryce_aron').length,
        qualifyingRows: rowCount(dataset.qualifyingResults, series.id),
        lapSamples: rowCount(dataset.lapSamples, series.id),
        racecraftEvents: rowCount(dataset.racecraftEvents, series.id),
        penalties: rowCount(dataset.penalties, series.id),
        incidents: rowCount(dataset.incidents, series.id),
        derivedMetrics: rowCount(dataset.derivedMetrics, series.id),
        weatherRows: rowCount(dataset.weatherObservations, series.id),
        mediaAssets: rowCount(dataset.mediaAssets, series.id),
        coverageCategories: categories,
        openGapIds: coverage?.openGapIds ?? [],
        priorityGaps: coverage?.priorityGaps ?? []
      };
    })
    .sort((a, b) => a.seriesName.localeCompare(b.seriesName));
};

const buildAnalyticsInventory = (summaries, predictiveRegistry, manifest, uiPackage) => {
  const lanes = [
    {
      lane: 'UI data package',
      source: 'analysis/ui-data-package/ui-data-package.json',
      generatedAt: uiPackage.generatedAt,
      counts: {
        screens: Object.keys(uiPackage.screens ?? {}).length,
        sourceInventory: collectionCount(uiPackage.sourceInventory),
        liveFixtures: uiPackage.screens?.liveCompanionFixtures?.fixtures?.length ?? 0
      },
      productUse: 'Primary frontend fixture and source-ref package.'
    },
    {
      lane: 'Predictive race intelligence',
      source: 'analysis/predictive-race-intelligence/output/summary.json',
      generatedAt: summaries.predictive.generatedAt,
      counts: {
        inventoryItems: summaries.predictive.inventoryItems,
        careerPriorRows: summaries.predictive.careerPriorRows,
        indyNxtRaceRows: summaries.predictive.indyNxtRaceRows,
        modelRows: summaries.predictive.modelRows,
        upcomingEventPacks: summaries.predictive.upcomingEventPacks,
        raceDebriefPacks: summaries.predictive.raceDebriefPacks
      },
      productUse: 'Historical prior bands, top-10 path language, analogs, debrief packs, Career Lab pack.'
    },
    {
      lane: 'INDY NXT discovery',
      source: 'analysis/indy-nxt-discovery/output/summary.json',
      generatedAt: summaries.indyNxtDiscovery.datasetUpdatedAt,
      counts: summaries.indyNxtDiscovery,
      productUse: 'INDY NXT outcomes, lap shape, section strengths, weather segments, debrief seeds.'
    },
    {
      lane: 'Career parity',
      source: 'analysis/career-parity/output/summary.json',
      generatedAt: summaries.careerParity.datasetUpdatedAt,
      counts: summaries.careerParity,
      productUse: 'Cross-series result conversion, series summary, metric-family parity guardrails.'
    },
    {
      lane: 'Section lap deep dive',
      source: 'analysis/indy-nxt-section-lap-deep-dive/output/summary.json',
      generatedAt: summaries.sectionLap.generatedAt,
      counts: summaries.sectionLap.counts,
      claimStrength: summaries.sectionLap.claimStrength,
      productUse: 'Practice/qualifying section profiles and Road America prep context.'
    },
    {
      lane: 'Race lap/section enhancement',
      source: 'analysis/indy-nxt-race-lap-section-enhancement/output/summary.json',
      generatedAt: summaries.raceLap.generatedAt,
      counts: summaries.raceLap.counts,
      claimStrength: summaries.raceLap.claimStrength,
      productUse: 'Race lap microstates, segments, inflection overlays, race section context.'
    },
    {
      lane: 'Career dimension context',
      source: 'analysis/career-dimension-context-layer/output/summary.json',
      generatedAt: summaries.careerDimension.generatedAt,
      counts: summaries.careerDimension.counts,
      claimStrength: summaries.careerDimension.claimStrength,
      productUse: 'Career Lab filters, team/track/driver/cohort context.'
    },
    {
      lane: 'Context/event narrative',
      source: 'analysis/context-event-narrative-layer/output/summary.json',
      generatedAt: summaries.contextEvent.generatedAt,
      counts: summaries.contextEvent.counts,
      claimStrength: summaries.contextEvent.claimStrength,
      productUse: 'Timelines, weather/media/source lineage, gap/caveat display.'
    },
    {
      lane: 'IMSA Daytona stint/class pace',
      source: 'analysis/imsa-daytona-stint-class-pace/output/summary.json',
      generatedAt: summaries.imsa.generatedAt,
      counts: summaries.imsa.counts,
      claimStrength: summaries.imsa.claimStrength,
      productUse: 'Career Lab IMSA stint/class/co-driver module.'
    },
    {
      lane: 'Formula Ford lap shape',
      source: 'analysis/formula-ford-lap-shape/output/summary.json',
      generatedAt: summaries.formulaFord.generatedAt,
      counts: summaries.formulaFord.counts,
      claimStrength: summaries.formulaFord.claimStrength,
      productUse: 'Career Lab early-career lap-shape module.'
    }
  ];

  const statusCounts = predictiveRegistry.statusCounts ?? {};
  const contextPacks = {
    schemaVersion: manifest.schemaVersion,
    generatedAt: manifest.generatedAt,
    packCounts: manifest.packCounts,
    totalPacks: manifest.packs.length,
    byType: Object.fromEntries(
      Object.entries(manifest.packCounts).map(([type]) => [
        type,
        manifest.packs
          .filter((pack) => pack.type === type)
          .map((pack) => ({ id: pack.id, path: pack.path, bytes: pack.bytes, sourceRefs: pack.sourceRefs?.length ?? 0 }))
      ])
    )
  };

  return { lanes, statusCounts, contextPacks };
};

const buildVisualizationMatrix = () => [
  {
    surface: 'Race Weekend Prep',
    question: 'What range does the historical context suggest before qualifying?',
    data: 'predictionBand.finishPercentileBand plus same-track and road-course denominators',
    visual: 'Interval band with denominator and confidence drawer',
    caveat: 'Historical prior band only; no expected finish or top-10 probability.'
  },
  {
    surface: 'Race Weekend Prep',
    question: 'What needs to go right for a strong Road America result?',
    data: 'top10Path, analogRaces, same-track and track-type history',
    visual: 'Ordered path cards plus analog race table',
    caveat: 'Path language only; analogs are comparables, not forecasts.'
  },
  {
    surface: 'Race Weekend Prep',
    question: 'Where does Road America historically stress Bryce by section?',
    data: 'section lap deep dive Road America prep context',
    visual: 'Section-family profile and top/weak family ranked bars',
    caveat: 'Official PDF-derived historical rows, not telemetry.'
  },
  {
    surface: 'Live Companion',
    question: 'Can we trust the current live session?',
    data: '/api/readiness, /api/sources, live race-day context pack',
    visual: 'Readiness banner, gates checklist, source drawer',
    caveat: 'Fixture/API-plumbed until an active INDY NXT rehearsal proves it.'
  },
  {
    surface: 'Live Companion',
    question: 'Where is Bryce and what changed?',
    data: '/api/bryce, /api/timing, /api/replay/bryce',
    visual: 'Bryce status tile, timing tower focus band, guarded replay trend shell',
    caveat: 'No GPS/moving dots, team radio audio, live POV, or tire/overtake strategy without proof.'
  },
  {
    surface: 'Race Debrief',
    question: 'Where did the race turn?',
    data: 'race-debrief pack, lapStory, raceContext, sectionSignal',
    visual: 'Lap-position line, segment strip, inflection callouts, incident/penalty chips',
    caveat: 'Race debrief labels require review before public copy.'
  },
  {
    surface: 'Race Debrief',
    question: 'How did qualifying convert into result?',
    data: 'career_result_conversion, prep_session_signals, race_debrief_scores',
    visual: 'Start-finish slope/dumbbell and conversion percentile badge',
    caveat: 'Group/combined qualifying formats need explicit source caveats.'
  },
  {
    surface: 'Career Lab',
    question: 'What can we compare across series without overclaiming?',
    data: 'career metric parity, career series summary, coverage matrix',
    visual: 'Parity heatmap, sortable series table, available/unavailable cells',
    caveat: 'Do not project INDY NXT lap depth onto older series.'
  },
  {
    surface: 'Career Lab',
    question: 'What deep career modules are actually source-backed?',
    data: 'career dimension, IMSA stint/class pace, Formula Ford lap-shape context packs',
    visual: 'Module menu with source badges and drilldowns',
    caveat: 'Descriptive only; no telemetry, setup, or causal root-cause claims.'
  },
  {
    surface: 'Source/Confidence',
    question: 'Why should a user trust or distrust a screen?',
    data: 'sourceInventory, sourceRefs, validation-report, gap ledger',
    visual: 'Global source drawer and compact confidence/availability affordances',
    caveat: 'Absence of imported rows is not proof nothing happened unless source semantics prove it.'
  }
];

const findDebriefWithRaceContext = async (manifest) => {
  const candidates = manifest.packs.filter((pack) => pack.type === 'race_debrief');
  let best = null;
  let bestScore = -1;
  for (const pack of candidates) {
    const body = await json(pack.path);
    const context = body.raceContext ?? {};
    const score =
      Number(context.sessionIncidentCount ?? 0) +
      Number(context.sessionPenaltyCount ?? 0) +
      Number(context.bryceIncidentCount ?? 0) +
      Number(context.brycePenaltyCount ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = body;
    }
  }
  return best;
};

const sourceManifestMarkdown = (sourceManifest) => {
  const rows = sourceManifest.files.map((file) => [file.path, file.bytes, file.sha256.slice(0, 16)]);
  return [
    '# Source Manifest',
    '',
    'This manifest records the exact local files used to build the external review pack. Hashes are SHA-256.',
    '',
    markdownTable(['Path', 'Bytes', 'SHA-256 prefix'], rows)
  ].join('\n');
};

const readmeMarkdown = ({ generatedAt, validation }) =>
  [
    '# BryceCast External Review Pack',
    '',
    `Generated: ${generatedAt}`,
    '',
    'Purpose: give an outside model a clean, source-backed view of what BryceCast is, what data exists, what analytics have already been run, what live capabilities are proven or still gated, and what UI/product questions remain open.',
    '',
    'Use this in two passes:',
    '',
    '1. Start with `PROMPT_FOR_GPT_5_5_PRO_ENVELOPE_A.md` and the Envelope A files. This is the clean-room data and analytics review. It intentionally avoids current UI screenshots and current component taste so the reviewer is not anchored by the first UI pass.',
    '2. After Envelope A returns recommendations, use `PROMPT_FOR_GPT_5_5_PRO_ENVELOPE_B.md` and the current-UI files for a critique against the independent recommendations.',
    '',
    'Core files:',
    '',
    '- `PROJECT_BRIEF.md`: project goal, audiences, guardrails, and source hierarchy.',
    '- `DATA_CAPABILITY_CATALOG.md`: category and granularity inventory by career chapter/series.',
    '- `ANALYTICS_INVENTORY.md`: generated analysis lanes, counts, context packs, and product uses.',
    '- `LIVE_CAPABILITY_MATRIX.md`: what live mode can show now versus what remains fixture-backed, unproven, or unavailable.',
    '- `VISUALIZATION_OPPORTUNITY_MATRIX.md`: candidate screen questions and visualization forms.',
    '- `CURRENT_UI_REVIEW_CONTEXT.md`: only for Envelope B after the clean-room pass.',
    '- `sample-payloads/`: bounded JSON excerpts for Road America prep, debrief, Career Lab, live fixtures, and source/capability summaries.',
    '- `SOURCE_MANIFEST.json` and `SOURCE_MANIFEST.md`: exact source files and hashes used by the pack.',
    '- `PACK_VALIDATION_REPORT.json`: automated completeness checks.',
    '- `DEVSPACE_AUDIT.md`: preinstall/runtime audit of `@waishnav/devspace@1.0.1` and the recommended containment stance.',
    '- `DEVSPACE_SETUP.md`: exact copied-pack sandbox setup recipe for a DevSpace run.',
    '',
    `Validation status: ${validation.ok ? 'ok' : 'failed'}. Checks: ${validation.checks.length}.`
  ].join('\n');

const summarizeOpenGaps = (openGaps) => {
  if (!Array.isArray(openGaps)) return String(openGaps ?? 'unknown');
  const ids = openGaps.map((gap) => gap.id).filter(Boolean);
  return `${openGaps.length}${ids.length ? ` (${ids.join(', ')})` : ''}`;
};

const projectBriefMarkdown = ({ dataset, uiPackage, manifest, predictiveSummary, validationReport, ingestionSummary }) => {
  const openGapSummary = summarizeOpenGaps(ingestionSummary.openGaps);

  return [
    '# Project Brief',
    '',
    'BryceCast is a Bryce Aron racing analytics product. The intended product is a general BryceCast app for race-week prep, live companion readiness, post-race debrief, and a source-backed Career Lab. Road America is the current concrete event slice because the generated June 18 pack includes Road America Race 1/Race 2 as the first upcoming-event UI sources; it is not the final app scope.',
    '',
    'Primary audiences:',
    '',
    '- Bryce and race-facing users who need source-backed context without unsupported engineering claims.',
    '- Family/friends and serious fans who want the weekend story, what to watch, and a clear debrief.',
    '- Operators/builders who need source confidence, gaps, and live readiness states visible.',
    '',
    'Source hierarchy for the review:',
    '',
    '1. `data/career/career.dataset.json` and generated reports under `data/career/reports/`.',
    '2. `analysis/ui-data-package/ui-data-package.json`.',
    '3. Predictive context-pack manifest and packs under `analysis/predictive-race-intelligence/output/context-packs/`.',
    '4. Validator-backed analysis lane outputs under `analysis/*/output/`.',
    '5. Runtime `/api/*` contracts and source code for live behavior.',
    '6. Prose docs after generated artifacts.',
    '',
    'Hard guardrails:',
    '',
    '- Do not use legacy MagicPath visual mock docs as current UI direction.',
    '- Do not ask the UI to parse raw CSVs directly when a UI package/context pack exists.',
    '- Predictive content is limited to historical prior bands, top-10 path language, analogs, and update hooks. Do not create public expected finish, top-10 probability, betting line, or causal model claims.',
    '- Live mode is fixture-backed/API-plumbed but not production-proven. Do not claim live green-flag proof, official points reconciliation, live GPS, team radio audio, live POV, tire/overtake strategy, or detailed pit sequence unless a later live proof artifact exists.',
    '- Older series have uneven source granularity; Career Lab needs coverage badges and unavailable states instead of pretending every era has INDY NXT-grade data.',
    '',
    'Verified anchors:',
    '',
    markdownTable(
      ['Anchor', 'Value'],
      [
        ['career schema', dataset.schemaVersion],
        ['dataset updatedAt', dataset.updatedAt],
        ['validation errors', validationReport.errorCount],
        ['validation warnings', validationReport.warningCount],
        ['open gaps', openGapSummary],
        ['UI package schema', uiPackage.schemaVersion],
        ['UI package generatedAt', uiPackage.generatedAt],
        ['UI screens', Object.keys(uiPackage.screens ?? {}).join(', ')],
        ['predictive summary schema', predictiveSummary.schemaVersion],
        ['context pack schema', manifest.schemaVersion],
        ['context pack counts', JSON.stringify(manifest.packCounts)]
      ]
    )
  ].join('\n');
};

const dataCatalogMarkdown = ({
  datasetCounts,
  careerCapability,
  validationReport,
  sourceEvidenceTypeCounts,
  sourceEvidenceConfidenceCounts,
  weatherSourceCounts
}) => {
  const countRows = Object.entries(datasetCounts).map(([key, value]) => [key, value]);
  const seriesRows = careerCapability.map((series) => [
    series.seriesName,
    series.years.join(', '),
    series.events,
    series.sessions,
    series.resultRows,
    series.bryceResultRows,
    series.qualifyingRows,
    series.lapSamples,
    series.weatherRows,
    series.incidents,
    series.penalties
  ]);

  return [
    '# Data Capability Catalog',
    '',
    'This file summarizes categories and granularity. The full canonical dataset is intentionally not duplicated into the review pack.',
    '',
    '## Canonical Collection Counts',
    '',
    markdownTable(['Collection', 'Rows'], countRows),
    '',
    '## Career Chapter / Series Matrix',
    '',
    markdownTable(
      ['Series', 'Years', 'Events', 'Sessions', 'Result rows', 'Bryce result rows', 'Qualifying rows', 'Lap samples', 'Weather rows', 'Incidents', 'Penalties'],
      seriesRows
    ),
    '',
    '## Cross-Cutting Fields',
    '',
    '- Track metadata: 42 tracks with coordinates/timezone/length/direction/surface/corner count coverage in the generated matrix; Arlington remains medium-confidence in the handoff because it is a future temporary circuit.',
    '- Weather/track condition: 181 rows total. INDY NXT weather is non-official modeled ambient weather for eligible exact-window sessions with station cross-checks; IMSA includes official Al Kamel/IMSA race condition fields; older series vary.',
    '- Source evidence/media: 1,199 source evidence rows and 940 media assets feed lineage, source drawers, and caveats.',
    '- Incidents/penalties/racecraft: INDY NXT has the strongest official race context. Absence in other series usually means unavailable source family, not proof nothing occurred.',
    '- Lap granularity: INDY NXT has official lap charts and section rows; IMSA Daytona has official time-card laps/stints; Formula Ford has Bryce-labeled lap-analysis blocks; most other series do not expose lap samples.',
    '- USF Pro 2000 / USF2000: no canonical series rows are present in the current `bryce-career.v1` dataset. Treat that coverage as absent unless a future ingestion-owned source is explicitly introduced.',
    '',
    '## Source Evidence Mix',
    '',
    markdownTable(['Source type', 'Rows'], Object.entries(sourceEvidenceTypeCounts).map(([key, value]) => [key, value])),
    '',
    markdownTable(['Confidence tier', 'Rows'], Object.entries(sourceEvidenceConfidenceCounts).map(([key, value]) => [key, value])),
    '',
    markdownTable(['Weather source type', 'Rows'], Object.entries(weatherSourceCounts).map(([key, value]) => [key, value])),
    '',
    '## Known Validation Caveat',
    '',
    `Validation currently has ${validationReport.errorCount} errors and ${validationReport.warningCount} warning. The warning is: ${validationReport.warnings?.[0]?.message ?? 'none'}`,
    '',
    '## Machine-Readable Version',
    '',
    'See `sample-payloads/data-capability-summary.json` for counts, per-series rows, and coverage categories.'
  ].join('\n');
};

const analyticsInventoryMarkdown = ({ analyticsInventory, predictiveRegistry }) => {
  const laneRows = analyticsInventory.lanes.map((lane) => [
    lane.lane,
    lane.source,
    lane.generatedAt ?? '',
    JSON.stringify(lane.counts ?? {}),
    lane.claimStrength ?? '',
    lane.productUse
  ]);
  const packRows = Object.entries(analyticsInventory.contextPacks.packCounts).map(([type, count]) => [type, count]);
  const registryRows = Object.entries(analyticsInventory.statusCounts).map(([status, count]) => [status, count]);
  const topItems = predictiveRegistry.items
    .slice(0, 20)
    .map((item) => [item.surface, item.kind, item.label, item.productizationStatus, item.recommendedAction, item.caveat ?? '']);

  return [
    '# Analytics Inventory',
    '',
    'Generated analytics are already broad. The review task is not only "what else can we compute?" but also "what should be elevated, demoted, combined, or visualized differently?"',
    '',
    '## Lane Summary',
    '',
    markdownTable(['Lane', 'Source', 'Generated', 'Counts', 'Claim strength', 'Product use'], laneRows),
    '',
    '## Predictive Registry Status Counts',
    '',
    markdownTable(['Status', 'Count'], registryRows),
    '',
    '## Context Packs',
    '',
    markdownTable(['Type', 'Count'], packRows),
    '',
    '## Representative Predictive Inventory Items',
    '',
    markdownTable(['Surface', 'Kind', 'Label', 'Status', 'Recommended action', 'Caveat'], topItems),
    '',
    '## Review Guidance',
    '',
    '- Treat Road America prep outputs as a concrete event slice, not the whole product.',
    '- The model scorecard is useful for policy and source-drawer transparency, not public point predictions.',
    '- The data-utilization audit reporting no remaining generated utilization backlog does not mean the final product API, semantic layer, or arbitrary query interface is complete.',
    '- Ask whether a finding deserves a chart, a compact stat, a table row, a source drawer entry, or no UI at all.',
    '- Prefer charts that answer a user question. Do not reward chart quantity.'
  ].join('\n');
};

const liveMatrixMarkdown = ({ liveContext, liveFixtures }) => {
  const fixtureRows = liveFixtures.map((fixture) => [
    fixture.id,
    fixture.state,
    fixture.severity,
    fixture.reason,
    fixture.points?.mode ?? '',
    fixture.weather?.sourceState ?? '',
    fixture.replay?.archiveState ?? ''
  ]);
  const gateRows = liveContext.validationGates.map((gate) => [gate.id, gate.status, gate.requirement]);

  return [
    '# Live Capability Matrix',
    '',
    'Live race-day mode has real API/view-model plumbing and fixture states, but it is not production-proven until an active INDY NXT session rehearsal and official post-session reconciliation exist.',
    '',
    '## Runtime Boundary',
    '',
    liveContext.runtimeBoundary.map((route) => `- ${route}`).join('\n'),
    '',
    '## Fixture States In UI Data Package',
    '',
    markdownTable(['Fixture', 'State', 'Severity', 'Reason', 'Points mode', 'Weather', 'Replay'], fixtureRows),
    '',
    '## Live Proof Gates',
    '',
    markdownTable(['Gate', 'Status', 'Requirement'], gateRows),
    '',
    'Note: prior docs record cold/post-session pressure checks, but this worktree does not contain `data/live/live-source-pressure-latest.json` as a current generated artifact. Fresh live-readiness evaluation should rerun `/api/readiness`, `/api/sources`, pressure, poller, and replay checks.',
    '',
    '## Safe To Design Now',
    '',
    '- Readiness/source health shell.',
    '- Schedule, weather readiness, watch/listen routing, and stale/wrong-series states.',
    '- Bryce focus tile and timing tower only when `/api/readiness` proves the session/identity.',
    '- Guarded points card that displays Race Control point fields only when `/api/readiness.points.mode` permits it.',
    '- Replay/debrief shell that clearly reports missing/empty/tiny archive states.',
    '',
    '## Do Not Claim Without Later Proof',
    '',
    '- Live green-flag INDY NXT proof.',
    '- Official points reconciliation.',
    '- Live GPS/moving dots.',
    '- Team radio audio or live POV.',
    '- Tire/overtake strategy, pit prediction, detailed pit sequence, or causal strategy claims.',
    '- NWS weather as official INDY NXT weather or track temperature.'
  ].join('\n');
};

const visualizationMatrixMarkdown = ({ visualizationMatrix }) =>
  [
    '# Visualization Opportunity Matrix',
    '',
    'This is a starting menu for the outside reviewer, not the final UI spec. The reviewer should rank, cut, combine, and propose alternatives.',
    '',
    markdownTable(
      ['Surface', 'Question', 'Data', 'Candidate visual', 'Caveat'],
      visualizationMatrix.map((row) => [row.surface, row.question, row.data, row.visual, row.caveat])
    )
  ].join('\n');

const currentUiReviewMarkdown = ({ uiPackage }) =>
  [
    '# Current UI Review Context',
    '',
    'Use this file only for Envelope B, after the clean-room Envelope A recommendations are complete.',
    '',
    'Current status: a first UI V2 scaffold exists in React/Vite. It is not the final design. It was built to prove a source-backed adapter-first path and to make the generated analytics visible enough for review.',
    '',
    'What exists now:',
    '',
    '- Typed frontend adapter in `src/data/uiContextAdapter.ts` loads `analysis/ui-data-package/ui-data-package.json`, validates referenced raw JSON by SHA-256/byte size, and hydrates context packs before React renders analytics.',
    '- React app in `src/App.tsx` has tabs for Race Intel, Live, Debrief, Career Lab, and Sources.',
    '- The first screen is the app experience, not a marketing landing page.',
    '- UI is mobile-first and guarded around live claims.',
    '- Adapter tests verify Road America Race 1/Race 2 prep payloads, debrief incident/penalty race context, and Career Lab context-pack depth.',
    '',
    'Known limitations:',
    '',
    '- This pass is a scaffold and review surface, not the final tab-by-tab product design.',
    '- Road America is the concrete current event slice because the generated package includes it; the final BryceCast app should generalize across races.',
    '- Chart choices and information hierarchy still need a dedicated design/visualization pass with user oversight.',
    '- Live mode remains fixture/API-plumbed but not production-proven.',
    '',
    'UI package screens currently available:',
    '',
    markdownTable(
      ['Screen key', 'Payload summary'],
      Object.entries(uiPackage.screens ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? `${value.length} rows` : Object.keys(value ?? {}).join(', ')
      ])
    )
  ].join('\n');

const promptEnvelopeA = () =>
  [
    '# Prompt For GPT-5.5 Pro: Envelope A',
    '',
    'You are an independent product/data/visualization reviewer. You have not seen the current UI. Do a clean-room review of BryceCast from the files in this pack.',
    '',
    'Project: BryceCast is a source-backed racing analytics app for Bryce Aron. It should support race-week prep, live companion readiness, race debriefs, and a Career Lab. The app is general across races, not Road-America-only; Road America is the current concrete slice because the June 18 data package has upcoming-event packs for that weekend.',
    '',
    'Read these files first:',
    '',
    '1. `PROJECT_BRIEF.md`',
    '2. `DATA_CAPABILITY_CATALOG.md`',
    '3. `ANALYTICS_INVENTORY.md`',
    '4. `LIVE_CAPABILITY_MATRIX.md`',
    '5. `VISUALIZATION_OPPORTUNITY_MATRIX.md`',
    '6. `sample-payloads/*.json` as needed',
    '7. `SOURCE_MANIFEST.md` only for provenance',
    '',
    'Your tasks:',
    '',
    '1. Identify the strongest product structure: tabs/screens, user jobs, and what each should contain for v1 versus later.',
    '2. Rank existing analytics by display value. For each high-value item, say whether it should be a chart, stat, table, narrative card, source drawer detail, or omitted.',
    '3. Suggest additional analyses that could plausibly be run from the listed available data. Separate easy derived summaries from heavier regressions/models. Flag sample-size/leakage/causality risks.',
    '4. Propose visualization patterns for Race Weekend Prep, Live Companion, Race Debrief, Career Lab, and Source/Confidence. Be specific about axes, denominators, filters, and what not to chart.',
    '5. Identify vacuous or low-value material to remove or demote.',
    '6. Identify missing data/capability proof that should block a UI claim.',
    '7. Brainstorm features not yet considered, including replay/media/article workflows, but keep them source/permission bounded.',
    '',
    'Scoring rubric for each recommendation:',
    '',
    '- User value',
    '- Evidence strength',
    '- Visual clarity',
    '- Implementation effort',
    '- Race-week relevance',
    '- Caveat burden',
    '- Novelty or memorability',
    '',
    'Hard constraints:',
    '',
    '- Do not propose public expected finish, top-10 probability, betting line, or causal model claims from the current predictive artifacts.',
    '- Do not claim live green-flag proof, live GPS, team radio audio, live POV, official points reconciliation, tire/overtake strategy, or detailed pit sequence.',
    '- Do not assume older series have INDY NXT-level lap/section/live data.',
    '- Do not use current UI assumptions; this is a clean-room recommendation pass.',
    '',
    'Return format:',
    '',
    '1. Executive recommendation.',
    '2. Proposed app architecture and tab contents.',
    '3. Ranked analytics/visualization menu.',
    '4. Additional analysis ideas with feasibility and risk.',
    '5. Live-mode readiness and proof gates.',
    '6. Career Lab structure.',
    '7. What to cut/defer.',
    '8. Questions for Jack/Bryce/team before final UI design.'
  ].join('\n');

const promptEnvelopeB = () =>
  [
    '# Prompt For GPT-5.5 Pro: Envelope B',
    '',
    'Use this only after you have completed Envelope A. Now critique the current first UI scaffold against your independent recommendations.',
    '',
    'Read:',
    '',
    '1. `CURRENT_UI_REVIEW_CONTEXT.md`',
    '2. Any screenshots or localhost capture the user provides separately.',
    '3. `sample-payloads/ui-current-state-summary.json`',
    '4. The Envelope A files only as needed for source truth.',
    '',
    'Tasks:',
    '',
    '1. Identify what the current UI scaffold gets structurally right.',
    '2. Identify where it is anchored too much to Road America, too shallow, too chart-heavy, too stat-heavy, or too generic.',
    '3. Map each current tab to your proposed final v1 tab contents.',
    '4. Recommend specific UI changes: charts to add/remove, stat cards to replace with visuals, source/confidence affordances, mobile layout improvements, and language/caveat fixes.',
    '5. Separate quick improvements from deeper redesign work.',
    '',
    'Hard constraints:',
    '',
    '- Do not treat the current scaffold as approved final direction.',
    '- Do not invent source proof not present in the pack.',
    '- Keep live and predictive claims bounded by the constraints in Envelope A.',
    '',
    'Return a prioritized critique with concrete screen-by-screen recommendations.'
  ].join('\n');

const devspaceAuditMarkdown = ({ evidence }) =>
  [
    '# DevSpace Preinstall Audit',
    '',
    `Evidence generated: ${evidence.generatedAt}`,
    '',
    `Package audited: \`${evidence.package.name}@${evidence.package.version}\` from npm.`,
    '',
    'Audit commands run before this file was generated:',
    '',
    '```bash',
    'npm view @waishnav/devspace --json',
    'npm pack @waishnav/devspace@1.0.1 --pack-destination /tmp/devspace-audit-20260619',
    'tar -xzf /tmp/devspace-audit-20260619/waishnav-devspace-1.0.1.tgz -C /tmp/devspace-audit-20260619/unpacked',
    'npm install --ignore-scripts --omit=dev /tmp/devspace-audit-20260619/waishnav-devspace-1.0.1.tgz',
    'npm audit --omit=dev --json',
    'git ls-remote https://github.com/Waishnav/devspace.git HEAD refs/heads/main "refs/tags/*"',
    '```',
    '',
    'Findings:',
    '',
    `- npm metadata: latest at audit time was ${evidence.package.version}, published ${evidence.package.publishedAt}, one maintainer, ${evidence.package.license} license, README links to \`${evidence.package.repository}\`.`,
    '- Published package has no `preinstall`, `install`, or `postinstall` script in its own `package.json`.',
    `- Published tarball \`gitHead\` is \`${evidence.package.gitHead}\`, matching the peeled \`v${evidence.package.version}\` GitHub tag from \`git ls-remote\`.`,
    `- Local dependency install with \`--ignore-scripts --omit=dev\` installed ${evidence.dependencyAudit.dependencies.prod} production packages and \`npm audit\` reported ${evidence.dependencyAudit.vulnerabilities.total} known vulnerabilities.`,
    '- Runtime design is intentionally powerful: it exposes local file read/write/edit tools and a shell tool through MCP after owner-password OAuth approval.',
    '- File tools path-check against opened workspaces/allowed roots, but shell commands run as the local user from the workspace directory. A shell command can read outside the allowed root unless the whole DevSpace process is constrained by an OS/container sandbox.',
    '- Post-review finding: no verified first-party `DEVSPACE_*` flag in `@waishnav/devspace@1.0.1` disables shell-tool registration. `DEVSPACE_TOOL_MODE=minimal` still registers shell.',
    '- Token exposure risk: if `DEVSPACE_OAUTH_OWNER_TOKEN` is supplied in the DevSpace process environment, an approved MCP shell session can inspect that inherited environment. Treat public-tunnel use as gated unless shell is disabled by patching DevSpace, the owner token is not inherited by shell, or DevSpace runs inside a disposable environment where that exposure is acceptable.',
    '- DevSpace stores config/auth under `~/.devspace` by default; use `DEVSPACE_CONFIG_DIR` and `DEVSPACE_STATE_DIR` for an isolated setup.',
    '- It does not create the public tunnel itself. Any tunnel URL should be treated as exposed internet surface and protected separately.',
    '',
    'Sandbox tests run locally:',
    '',
    `- Strict deny-default allowlist profile: ${evidence.sandbox.strictDenyDefault.status} with exit ${evidence.sandbox.strictDenyDefault.exitCode} even for simple \`ls\`/\`node\` probes in this macOS environment. Do not rely on that profile until it is tuned separately.`,
    `- Practical deny-home profile: ${evidence.sandbox.denyHome.status}. The pack was copied to \`${evidence.sandbox.denyHome.packCopy}\`; sandbox allowed reading that copy, blocked \`${evidence.sandbox.denyHome.blockedHomePath}\`, and \`devspace doctor\` reported SQLite ${evidence.sandbox.denyHome.doctor.sqlite}.`,
    `- Local server smoke: ${evidence.localServerSmoke.status} from \`/tmp\` with \`DEVSPACE_ALLOWED_ROOTS=${evidence.localServerSmoke.allowedRoots}\`, \`DEVSPACE_SKILLS=0\`, \`DEVSPACE_WIDGETS=off\`, and \`DEVSPACE_LOG_SHELL_COMMANDS=0\`. Unauthenticated \`/mcp\` returned ${evidence.localServerSmoke.unauthenticatedMcpStatus} with OAuth metadata as expected.`,
    `- Public tunnel started: ${evidence.publicTunnelStarted}. ChatGPT authentication flow started: ${evidence.chatGptAuthFlowStarted}.`,
    '',
    'Recommendation:',
    '',
    '- Do not expose the full BryceCast repo through plain DevSpace over an internet tunnel.',
    '- Do not start a public DevSpace tunnel for this review with the package as-is unless you also solve the shell/token exposure boundary. The review pack is ready; the live connector is not cleared for full-trust use.',
    '- Safer options: upload/copy the generated review pack directly into GPT-5.5 Pro, run DevSpace in a disposable macOS user/container/VM with no sensitive files, or patch/wrap DevSpace so the shell tool is disabled and verify that `/env`/`printenv` cannot reveal owner credentials.',
    '- If using DevSpace anyway, expose only a `/tmp` copy of this external-review pack, run under deny-home sandbox or stronger containment, set `DEVSPACE_SKILLS=0`, `DEVSPACE_WIDGETS=off` or `changes`, a narrow `DEVSPACE_ALLOWED_ROOTS`, isolated config/state dirs, and leave `DEVSPACE_LOG_SHELL_COMMANDS=0`.',
    '- If the sandbox, shell, token, or tunnel setup changes, rerun the local read-block, token-noninheritance, and endpoint smoke tests before connecting ChatGPT.',
    '',
    'Current status: package audit and local sandbox smoke passed for exposing the copied review pack only, but public DevSpace use remains gated by shell/token exposure. No public tunnel or ChatGPT authentication flow has been started.'
  ].join('\n');

const devspaceSetupMarkdown = () =>
  [
    '# DevSpace Setup For GPT-5.5 Pro Review',
    '',
    'Use this only if you want ChatGPT/5.5 Pro to access the review pack through DevSpace. This setup intentionally exposes a copied review pack, not the BryceCast repo.',
    '',
    'Already staged by the audit:',
    '',
    '- Local DevSpace runtime: `/tmp/devspace-audit-20260619/runtime-install`',
    '- npm tarball audit dir: `/tmp/devspace-audit-20260619`',
    '- Safe pack copy target: `/tmp/brycecast-external-review-pack`',
    '- Deny-home sandbox profile: `/tmp/devspace-audit-20260619/devspace-deny-home.sb`',
    '',
    'Refresh the pack copy before starting DevSpace:',
    '',
    '```bash',
    'PACK_SRC="/Users/example/Documents/Bryce POV access/analysis/external-review-pack"',
    'PACK_COPY="/tmp/brycecast-external-review-pack"',
    'rm -rf "$PACK_COPY"',
    'cp -R "$PACK_SRC" "$PACK_COPY"',
    '```',
    '',
    'Create or refresh the deny-home sandbox profile:',
    '',
    '```bash',
    'cat > /tmp/devspace-audit-20260619/devspace-deny-home.sb <<\\EOF',
    '(version 1)',
    '(allow default)',
    '(deny file-read* (subpath "/Users/example"))',
    '(deny file-write* (subpath "/Users/example"))',
    'EOF',
    '```',
    '',
    'Local smoke check:',
    '',
    '```bash',
    'sandbox-exec -f /tmp/devspace-audit-20260619/devspace-deny-home.sb /bin/cat /private/tmp/brycecast-external-review-pack/README.md | head -1',
    'sandbox-exec -f /tmp/devspace-audit-20260619/devspace-deny-home.sb /bin/ls /Users/example/Documents',
    '# The first command should print the pack title; the second should fail with Operation not permitted.',
    '```',
    '',
    'Public tunnel gate:',
    '',
    'Do not start a public DevSpace tunnel for this review until one of these is true:',
    '',
    '- DevSpace is patched or configured so the MCP shell tool is unavailable, and a smoke test proves no shell tool is advertised.',
    '- The owner token is not inherited by shell commands, and a smoke test proves `env`/`printenv` cannot reveal DevSpace credentials.',
    '- DevSpace runs inside a disposable user/container/VM that contains only `/tmp/brycecast-external-review-pack` and no reusable credentials.',
    '',
    'Reason: `@waishnav/devspace@1.0.1` registers a shell tool, and the audited shell layer inherits the process environment. A public reviewer session that can invoke shell can read any owner token provided in that environment.',
    '',
    'Residual risk: this deny-home sandbox is not a full container. It is acceptable for local smoke testing the review-pack boundary, but it is not by itself enough to clear a public DevSpace tunnel with shell enabled.'
  ].join('\n');

const validatePack = ({ uiPackage, manifest, careerCapability, samples, sourceManifest, missingSourceFiles }) => {
  const checks = [];
  const add = (id, ok, details) => checks.push({ id, ok, details });

  add('ui_data_package_schema', uiPackage.schemaVersion === 'brycecast.uiDataPackage.v1', uiPackage.schemaVersion);
  add('context_pack_manifest_schema', manifest.schemaVersion === 'brycecast.predictiveRaceIntelligence.contextPackManifest.v1', manifest.schemaVersion);
  add('context_pack_counts', JSON.stringify(manifest.packCounts) === JSON.stringify({
    career_lab: 1,
    live_race_day: 1,
    race_debrief: 36,
    upcoming_event: 9
  }), manifest.packCounts);
  add('road_america_events', samples.roadAmericaPrep.events.length === 2, samples.roadAmericaPrep.events.map((event) => event.eventName));
  add(
    'road_america_payload_fields',
    samples.roadAmericaPrep.events.every(
      (event) => event.predictionBand && event.top10Path?.length && event.chartSpecs?.length && event.contextPackRef?.path
    ),
    samples.roadAmericaPrep.events.map((event) => ({
      eventName: event.eventName,
      hasPredictionBand: Boolean(event.predictionBand),
      top10Path: event.top10Path?.length ?? 0,
      chartSpecs: event.chartSpecs?.length ?? 0,
      contextPackRef: event.contextPackRef?.path
    }))
  );
  add(
    'debrief_incident_penalty_context',
    Number(samples.raceDebrief.raceContext?.sessionIncidentCount ?? 0) > 0 ||
      Number(samples.raceDebrief.raceContext?.sessionPenaltyCount ?? 0) > 0,
    samples.raceDebrief.raceContext
  );
  add(
    'career_lab_depth',
    samples.careerLab.seriesSummary.length >= 3 &&
      samples.careerLab.resultConversionRows > 100 &&
      samples.careerLab.metricFamilyParity.length >= 5,
    {
      seriesSummary: samples.careerLab.seriesSummary.length,
      resultConversionRows: samples.careerLab.resultConversionRows,
      metricFamilyParity: samples.careerLab.metricFamilyParity.length
    }
  );
  add('career_series_count', careerCapability.length === 7, careerCapability.map((series) => series.seriesName));
  add('source_manifest_files', sourceManifest.files.length >= 30, sourceManifest.files.length);
  add('source_manifest_declared_files_exist', missingSourceFiles.length === 0, missingSourceFiles);
  add(
    'source_manifest_includes_adapter_test',
    sourceManifest.files.some((file) => file.path === 'tests/uiContextAdapter.test.ts'),
    sourceManifest.files.filter((file) => file.path.includes('uiContextAdapter') || file.path.includes('ui-context-adapter')).map((file) => file.path)
  );

  return {
    ok: checks.every((check) => check.ok),
    generatedAt: new Date().toISOString(),
    checks
  };
};

const main = async () => {
  const generatedAt = new Date().toISOString();

  const [
    dataset,
    sourceManifestRaw,
    devspaceAuditEvidence,
    coverageMatrix,
    ingestionSummary,
    validationReport,
    uiPackage,
    manifest,
    predictiveSummary,
    predictiveRegistry,
    liveContext,
    careerLab,
    summaries
  ] = await Promise.all([
    json('data/career/career.dataset.json'),
    json('data/career/sources.manifest.json'),
    json('analysis/devspace-audit/devspace-audit-evidence.json'),
    json('data/career/reports/career-coverage-matrix.json'),
    json('data/career/reports/ingestion-summary.json'),
    json('data/career/reports/validation-report.json'),
    json('analysis/ui-data-package/ui-data-package.json'),
    json('analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json'),
    json('analysis/predictive-race-intelligence/output/summary.json'),
    json('analysis/predictive-race-intelligence/output/analytics_inventory_registry.json'),
    json('analysis/predictive-race-intelligence/output/context-packs/live-race-day-context.json'),
    json('analysis/predictive-race-intelligence/output/context-packs/career-lab-context.json'),
    Promise.all([
      json('analysis/indy-nxt-discovery/output/summary.json'),
      json('analysis/career-parity/output/summary.json'),
      json('analysis/indy-nxt-section-lap-deep-dive/output/summary.json'),
      json('analysis/indy-nxt-race-lap-section-enhancement/output/summary.json'),
      json('analysis/career-dimension-context-layer/output/summary.json'),
      json('analysis/context-event-narrative-layer/output/summary.json'),
      json('analysis/imsa-daytona-stint-class-pace/output/summary.json'),
      json('analysis/formula-ford-lap-shape/output/summary.json')
    ]).then(
      ([
        indyNxtDiscovery,
        careerParity,
        sectionLap,
        raceLap,
        careerDimension,
        contextEvent,
        imsa,
        formulaFord
      ]) => ({
        indyNxtDiscovery,
        careerParity,
        sectionLap,
        raceLap,
        careerDimension,
        contextEvent,
        imsa,
        formulaFord
      })
    )
  ]);

  summaries.predictive = predictiveSummary;

  const missingSourceFiles = sourceFiles.filter((file) => !existsSync(repoPath(file)));
  const existingSourceFiles = sourceFiles.filter((file) => existsSync(repoPath(file)));
  const sourceFilesWithPacks = [
    ...new Set([
      ...existingSourceFiles,
      ...manifest.packs.map((pack) => pack.path),
      ...csvFiles.filter((file) => existsSync(repoPath(file)))
    ])
  ];
  const fileManifest = await Promise.all(sourceFilesWithPacks.map(hashFile));
  const csvSummaries = await Promise.all(csvFiles.filter((file) => existsSync(repoPath(file))).map(csvSummary));
  const sourceManifest = {
    schemaVersion: 'brycecast.externalReviewPack.sourceManifest.v1',
    generatedAt,
    packageSource: '@waishnav/devspace audit and BryceCast generated artifacts',
    files: fileManifest,
    csvSummaries,
    careerSourcesManifest: {
      schemaVersion: sourceManifestRaw.schemaVersion,
      sourceCount: sourceManifestRaw.sources?.length ?? sourceManifestRaw.items?.length ?? null
    }
  };

  const datasetCounts = Object.fromEntries(
    [
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
      'derivedMetrics',
      'weatherObservations',
      'mediaAssets',
      'sourceEvidence',
      'gaps',
      'broadcastRoutes',
      'notificationEvents',
      'notificationRules'
    ].map((key) => [key, dataset[key]?.length ?? 0])
  );
  const sourceEvidenceTypeCounts = countBy(dataset.sourceEvidence ?? [], 'sourceType');
  const sourceEvidenceConfidenceCounts = countBy(dataset.sourceEvidence ?? [], 'confidenceTier');
  const weatherSourceCounts = countBy(dataset.weatherObservations ?? [], 'weatherSourceType');
  const careerCapability = buildCareerCapability(dataset, coverageMatrix);
  const analyticsInventory = buildAnalyticsInventory(summaries, predictiveRegistry, manifest, uiPackage);
  const visualizationMatrix = buildVisualizationMatrix();
  const raceDebrief = await findDebriefWithRaceContext(manifest);
  const liveFixtures = uiPackage.screens.liveCompanionFixtures.fixtures;
  const roadAmericaPrep = {
    title: uiPackage.screens.roadAmericaPrep.title,
    readiness: uiPackage.screens.roadAmericaPrep.readiness,
    events: uiPackage.screens.roadAmericaPrep.events
  };
  const careerLabSample = {
    schemaVersion: careerLab.schemaVersion,
    generatedAt: careerLab.generatedAt,
    resultConversionRows: careerLab.resultConversionRows,
    seriesSummary: careerLab.seriesSummary.slice(0, 7),
    metricFamilyParity: careerLab.metricFamilyParity.slice(0, 14),
    topCareerStories: careerLab.topCareerStories,
    chartSpecs: careerLab.chartSpecs,
    caveats: careerLab.caveats,
    sourceRefs: careerLab.sourceRefs
  };
  const samples = {
    roadAmericaPrep,
    raceDebrief,
    careerLab: careerLabSample,
    liveFixtures,
    dataCapability: {
      datasetCounts,
      sourceEvidenceTypeCounts,
      sourceEvidenceConfidenceCounts,
      weatherSourceCounts,
      careerCapability
    },
    uiCurrentState: {
      screens: Object.keys(uiPackage.screens),
      roadAmericaEventCount: uiPackage.screens.roadAmericaPrep.events.length,
      liveFixtureCount: liveFixtures.length,
      debriefSeedCount:
        uiPackage.screens.raceDebrief.featuredDebriefs?.length ?? uiPackage.screens.raceDebrief.seeds?.length ?? 0,
      careerSeriesCount:
        uiPackage.screens.careerLab.seriesSummary?.length ?? uiPackage.screens.careerLab.series?.length ?? 0,
      sourceInventoryCount: collectionCount(uiPackage.sourceInventory),
      adapterFiles: ['src/data/uiContextAdapter.ts', 'tests/uiContextAdapter.test.ts', 'scripts/test-ui-context-adapter.mjs']
    }
  };

  const validation = validatePack({ uiPackage, manifest, careerCapability, samples, sourceManifest, missingSourceFiles });
  validation.checks.push({
    id: 'devspace_audit_evidence',
    ok:
      devspaceAuditEvidence.schemaVersion === 'brycecast.devspaceAuditEvidence.v1' &&
      devspaceAuditEvidence.package?.name === '@waishnav/devspace' &&
      devspaceAuditEvidence.package?.version === '1.0.1' &&
      devspaceAuditEvidence.sandbox?.denyHome?.status === 'passed' &&
      devspaceAuditEvidence.localServerSmoke?.status === 'passed' &&
      devspaceAuditEvidence.publicTunnelStarted === false,
    details: {
      schemaVersion: devspaceAuditEvidence.schemaVersion,
      package: `${devspaceAuditEvidence.package?.name}@${devspaceAuditEvidence.package?.version}`,
      denyHome: devspaceAuditEvidence.sandbox?.denyHome?.status,
      localServerSmoke: devspaceAuditEvidence.localServerSmoke?.status,
      publicTunnelStarted: devspaceAuditEvidence.publicTunnelStarted
    }
  });
  validation.ok = validation.checks.every((check) => check.ok);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(sampleDir, { recursive: true });

  const files = {
    'README.md': readmeMarkdown({ generatedAt, validation }),
    'PROJECT_BRIEF.md': projectBriefMarkdown({
      dataset,
      uiPackage,
      manifest,
      predictiveSummary,
      validationReport,
      ingestionSummary
    }),
    'DATA_CAPABILITY_CATALOG.md': dataCatalogMarkdown({
      datasetCounts,
      careerCapability,
      validationReport,
      sourceEvidenceTypeCounts,
      sourceEvidenceConfidenceCounts,
      weatherSourceCounts
    }),
    'ANALYTICS_INVENTORY.md': analyticsInventoryMarkdown({ analyticsInventory, predictiveRegistry }),
    'LIVE_CAPABILITY_MATRIX.md': liveMatrixMarkdown({ liveContext, liveFixtures }),
    'VISUALIZATION_OPPORTUNITY_MATRIX.md': visualizationMatrixMarkdown({ visualizationMatrix }),
    'CURRENT_UI_REVIEW_CONTEXT.md': currentUiReviewMarkdown({ uiPackage }),
    'PROMPT_FOR_GPT_5_5_PRO_ENVELOPE_A.md': promptEnvelopeA(),
    'PROMPT_FOR_GPT_5_5_PRO_ENVELOPE_B.md': promptEnvelopeB(),
    'SOURCE_MANIFEST.md': sourceManifestMarkdown(sourceManifest),
    'DEVSPACE_AUDIT.md': devspaceAuditMarkdown({ evidence: devspaceAuditEvidence }),
    'DEVSPACE_SETUP.md': devspaceSetupMarkdown(),
    'SOURCE_MANIFEST.json': compactJson(sourceManifest),
    'PACK_VALIDATION_REPORT.json': compactJson(validation)
  };

  const sampleFiles = {
    'road-america-prep.json': roadAmericaPrep,
    'race-debrief-with-incident-penalty-context.json': raceDebrief,
    'career-lab-context-excerpt.json': careerLabSample,
    'live-fixtures.json': liveFixtures,
    'data-capability-summary.json': samples.dataCapability,
    'analytics-inventory-summary.json': analyticsInventory,
    'visualization-opportunity-matrix.json': visualizationMatrix,
    'ui-current-state-summary.json': samples.uiCurrentState
  };

  await Promise.all([
    ...Object.entries(files).map(([name, body]) => writeFile(path.join(outDir, name), `${body.trimEnd()}\n`)),
    ...Object.entries(sampleFiles).map(([name, body]) => writeFile(path.join(sampleDir, name), compactJson(body)))
  ]);

  if (!validation.ok) {
    console.error(JSON.stringify(validation, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    outDir: rel(outDir),
    files: Object.keys(files).length,
    sampleFiles: Object.keys(sampleFiles).length,
    sourceFiles: sourceManifest.files.length,
    checks: validation.checks.length
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
