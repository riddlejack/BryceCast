import type {
  AnalyticsConfidence,
  AnalyticsFallbackState,
  AnalyticsMetric,
  AnalyticsMetricValue,
  AnalyticsSourceDrawerEntry,
  AnalyticsSourceKind,
  AnalyticsSourceProvenance,
  AnalyticsSurface,
  AnalyticsViewModelRegistry,
  CareerLabState,
  HistoricalCareerContext,
  LiveRaceCompanionState,
  RaceControlIdentityMapping,
  RaceControlLiveContext,
  RaceDebriefState,
  RaceWeekendPrepState,
  SourceOpsState,
  UiMetricManifest,
  UiMetricManifestItem,
  UiReadyArtifactsManifest
} from './analyticsContracts';
import { ANALYTICS_SURFACE_CONTRACTS } from './analyticsContracts';
import type { BryceReplayPayload, RaceSnapshot, SeasonHistoryPayload, SourceState, TimingRow } from './types';

const readinessRank: Record<AnalyticsFallbackState, number> = {
  available: 0,
  live_only: 1,
  replay_only: 1,
  source_bounded: 2,
  partial: 3,
  deferred: 4,
  unavailable: 5
};

export interface BuildAnalyticsViewModelsInput {
  uiMetricManifest: UiMetricManifest;
  uiReadyArtifacts?: UiReadyArtifactsManifest | null;
  raceSnapshot?: RaceSnapshot | null;
  replay?: BryceReplayPayload | null;
  seasonHistory?: SeasonHistoryPayload | null;
  generatedAt?: string;
}

export const analyticsSurfaceOrder: AnalyticsSurface[] = [
  'race_weekend_prep',
  'live_race_companion',
  'race_debrief',
  'career_lab',
  'source_ops'
];

export const analyticsSurfaceMetricIds: Record<AnalyticsSurface, string[]> = {
  race_weekend_prep: ['prep_event_command_center', 'prep_track_history', 'prep_practice_qualifying_funnel', 'prep_weather_window'],
  live_race_companion: [
    'live_source_readiness',
    'live_bryce_status_tile',
    'live_timing_tower',
    'live_gap_lap_trend',
    'live_points_projection',
    'live_weather_strip'
  ],
  race_debrief: [
    'debrief_header',
    'debrief_qualifying_conversion',
    'debrief_lap_position_story',
    'debrief_section_strengths',
    'debrief_incidents_penalties',
    'debrief_team_context',
    'debrief_source_drawer'
  ],
  career_lab: ['career_series_summary', 'career_metric_parity_matrix', 'career_result_conversion_explorer', 'career_gap_ledger'],
  source_ops: ['ops_validation_status', 'ops_live_source_console', 'ops_replay_archive_state']
};

export const getManifestItemsForSurface = (manifest: UiMetricManifest, surface: AnalyticsSurface): UiMetricManifestItem[] =>
  manifest.items.filter((item) => item.surface === surface);

export const buildAnalyticsViewModels = (input: BuildAnalyticsViewModelsInput): AnalyticsViewModelRegistry => {
  const generatedAt = input.generatedAt ?? input.uiMetricManifest.generatedAt;
  return {
    schemaVersion: 'brycecast.analyticsViewModels.v1',
    generatedAt,
    raceWeekendPrep: buildRaceWeekendPrepState(input),
    liveRaceCompanion: buildLiveRaceCompanionState(input),
    raceDebrief: buildRaceDebriefState(input),
    careerLab: buildCareerLabState(input),
    sourceOps: buildSourceOpsState(input)
  };
};

export const buildRaceWeekendPrepState = (input: BuildAnalyticsViewModelsInput): RaceWeekendPrepState => {
  const items = getManifestItemsForSurface(input.uiMetricManifest, 'race_weekend_prep');
  const metrics = buildMetricMap(items);
  return {
    schemaVersion: 'brycecast.raceWeekendPrepState.v1',
    surface: 'race_weekend_prep',
    readiness: combineReadiness(items),
    metrics,
    sourceDrawer: buildSourceDrawer(items),
    artifactInputs: collectProvenance(items, 'artifact'),
    liveInputs: collectProvenance(items, 'api'),
    deferredBackendFields: ['timezone-normalized schedule countdown', 'official series weather', '/api/readiness live gate']
  };
};

export const buildLiveRaceCompanionState = (input: BuildAnalyticsViewModelsInput): LiveRaceCompanionState => {
  const items = getManifestItemsForSurface(input.uiMetricManifest, 'live_race_companion');
  return {
    schemaVersion: 'brycecast.liveRaceCompanionState.v1',
    surface: 'live_race_companion',
    readiness: combineReadiness(items),
    metrics: buildMetricMap(items),
    sourceDrawer: buildSourceDrawer(items),
    raceControl: buildRaceControlLiveContext(input.raceSnapshot ?? null),
    historicalCareer: buildHistoricalCareerContext(input.seasonHistory ?? null),
    replay: input.replay ?? null,
    blockedUntilReadiness: [
      '/api/readiness product gate',
      'wrong-series versus pre-session reducer',
      'stale timing age thresholds',
      'live point-field coverage and reconciliation status'
    ]
  };
};

export const buildRaceDebriefState = (input: BuildAnalyticsViewModelsInput): RaceDebriefState => {
  const items = getManifestItemsForSurface(input.uiMetricManifest, 'race_debrief');
  return {
    schemaVersion: 'brycecast.raceDebriefState.v1',
    surface: 'race_debrief',
    readiness: combineReadiness(items),
    metrics: buildMetricMap(items),
    sourceDrawer: buildSourceDrawer(items),
    officialResultArtifacts: collectProvenance(items, 'artifact').filter((source) => source.path.includes('career') || source.path.includes('debrief')),
    derivedReviewRequiredIds: ['debrief_header']
  };
};

export const buildCareerLabState = (input: BuildAnalyticsViewModelsInput): CareerLabState => {
  const items = getManifestItemsForSurface(input.uiMetricManifest, 'career_lab');
  return {
    schemaVersion: 'brycecast.careerLabState.v1',
    surface: 'career_lab',
    readiness: combineReadiness(items),
    metrics: buildMetricMap(items),
    sourceDrawer: buildSourceDrawer(items),
    historicalCareer: buildHistoricalCareerContext(input.seasonHistory ?? null),
    parityArtifactPaths: collectProvenance(items, 'artifact')
      .map((source) => source.path)
      .filter((sourcePath) => sourcePath.includes('career-parity'))
  };
};

export const buildSourceOpsState = (input: BuildAnalyticsViewModelsInput): SourceOpsState => {
  const items = getManifestItemsForSurface(input.uiMetricManifest, 'source_ops');
  return {
    schemaVersion: 'brycecast.sourceOpsState.v1',
    surface: 'source_ops',
    readiness: combineReadiness(items),
    metrics: buildMetricMap(items),
    sourceDrawer: buildSourceDrawer(items),
    missingBackendContracts: input.uiReadyArtifacts?.missingBackendContracts ?? [
      'Formal /api/readiness product wrapper is still pending for UI gating.'
    ],
    requiredReadinessRoute: '/api/readiness'
  };
};

export const buildRaceControlLiveContext = (snapshot: RaceSnapshot | null): RaceControlLiveContext => {
  const timingRows = snapshot?.timingRows ?? [];
  const bryceRow = snapshot?.bryce ?? findBryceTimingRow(timingRows);
  return {
    snapshot,
    bryceRow,
    sourceState: snapshot?.sourceState ?? 'unavailable',
    identityGuard: buildRaceControlIdentityGuard(snapshot, bryceRow),
    timingRows
  };
};

export const buildHistoricalCareerContext = (history: SeasonHistoryPayload | null): HistoricalCareerContext => {
  if (!history) {
    return {
      history: null,
      sourceState: 'unavailable',
      seedDataPolicy: null
    };
  }

  if (history.source === 'seed' || history.meta?.schemaVersion !== 'history-bryce.v1') {
    return {
      history,
      sourceState: 'seed',
      seedDataPolicy: {
        productionEligible: false,
        sourceState: 'seed',
        reason: 'Legacy seed/demo history is layout-only fallback data and must not be treated as source-backed analytics.'
      }
    };
  }

  return {
    history,
    sourceState: 'source_backed',
    seedDataPolicy: null
  };
};

export const buildAnalyticsMetric = (item: UiMetricManifestItem): AnalyticsMetric<AnalyticsMetricValue> => ({
  id: item.id,
  label: item.id,
  value: {
    question: item.userQuestion,
    priority: item.priority,
    stakeholder: item.stakeholder,
    grain: item.grain,
    artifactPaths: item.dataSources.filter((source) => source.kind === 'artifact').map((source) => source.path),
    apiPaths: item.dataSources.filter((source) => source.kind === 'api').map((source) => source.path),
    displayFamily: item.recommendedVisualizationFamily,
    fallbackState: item.fallbackState,
    owner: item.implementationOwner
  },
  unit: null,
  sourceState: item.availability,
  readiness: item.availability,
  confidence: item.confidence,
  provenance: item.dataSources.map(sourceToProvenance),
  caveatIds: item.caveatBehavior?.gapIds ?? [],
  unavailableReason: unavailableReasonFor(item),
  requiredFields: item.requiredFields
});

const buildMetricMap = (items: UiMetricManifestItem[]): Record<string, AnalyticsMetric<AnalyticsMetricValue>> =>
  Object.fromEntries(items.map((item) => [item.id, buildAnalyticsMetric(item)]));

const buildSourceDrawer = (items: UiMetricManifestItem[]): AnalyticsSourceDrawerEntry[] =>
  items.map((item) => {
    const metric = buildAnalyticsMetric(item);
    return {
      metricId: item.id,
      question: item.userQuestion,
      readiness: metric.readiness,
      confidence: metric.confidence,
      provenance: metric.provenance,
      caveatIds: metric.caveatIds,
      caveat: item.caveatBehavior?.copy ?? null
    };
  });

const collectProvenance = (items: UiMetricManifestItem[], kind: AnalyticsSourceKind): AnalyticsSourceProvenance[] => {
  const sources = items.flatMap((item) => item.dataSources.map(sourceToProvenance)).filter((source) => source.kind === kind);
  return Array.from(new Map(sources.map((source) => [source.path, source])).values());
};

const sourceToProvenance = (source: { kind: string; path: string }): AnalyticsSourceProvenance => ({
  kind: classifySourceKind(source),
  path: source.path,
  sourceFamily: sourceFamilyForPath(source.path),
  role: roleForPath(source.path)
});

const classifySourceKind = (source: { kind: string; path: string }): AnalyticsSourceKind => {
  if (source.kind === 'api') return 'api';
  if (source.path.startsWith('http')) return 'external';
  if (source.path.endsWith('.sqlite') || source.path.endsWith('.jsonl')) return 'local_storage';
  if (source.path.includes('/reports/') || source.path.endsWith('-matrix.json')) return 'generated_report';
  if (source.path.endsWith('.json') && source.path.includes('data/career/')) return 'dataset';
  if (source.path.startsWith('docs/')) return 'doc';
  if (source.kind === 'artifact') return 'artifact';
  return 'artifact';
};

const sourceFamilyForPath = (sourcePath: string): string => {
  if (sourcePath.startsWith('/api/weather')) return 'live_weather_api';
  if (sourcePath.startsWith('/api/')) return 'live_api';
  if (sourcePath.includes('career-parity')) return 'career_parity';
  if (sourcePath.includes('indy-nxt-discovery')) return 'indy_nxt_analytics';
  if (sourcePath.includes('data/career/reports')) return 'generated_career_report';
  if (sourcePath.includes('data/career/career.dataset.json')) return 'canonical_career_dataset';
  if (sourcePath.includes('data/live')) return 'local_live_archive';
  if (sourcePath.startsWith('docs/')) return 'prose_contract';
  if (sourcePath.startsWith('http')) return 'external_race_control';
  return 'unknown';
};

const roleForPath = (sourcePath: string): AnalyticsSourceProvenance['role'] => {
  if (sourcePath.includes('drivers_top') || sourcePath.includes('timingscoring-ris')) return 'guard';
  if (sourcePath.includes('snapshots.jsonl') || sourcePath.includes('brycecast.sqlite')) return 'fallback';
  if (sourcePath.includes('docs/')) return 'context';
  return 'primary';
};

const unavailableReasonFor = (item: UiMetricManifestItem): string | null => {
  if (item.availability === 'available') return null;
  if (item.availability === 'live_only') return 'Requires live API payloads and product readiness before source-backed values can render.';
  if (item.availability === 'replay_only') return 'Requires local replay archive coverage before trend analytics can render.';
  if (item.availability === 'source_bounded') return 'Safe only within the stated source family and denominator caveats.';
  if (item.availability === 'partial') return item.fallbackState || 'Partial source coverage requires visible caveats.';
  return item.fallbackState || 'Deferred until a source-backed contract exists.';
};

const combineReadiness = (items: UiMetricManifestItem[]): AnalyticsFallbackState => {
  if (items.length === 0) return 'unavailable';
  return items.reduce<AnalyticsFallbackState>((current, item) => (readinessRank[item.availability] > readinessRank[current] ? item.availability : current), 'available');
};

const findBryceTimingRow = (rows: TimingRow[]): TimingRow | null =>
  rows.find((row) => row.no === '9' && (String(row.DriverID ?? '') === '2143' || `${row.firstName} ${row.lastName}` === 'Bryce Aron')) ?? null;

const buildRaceControlIdentityGuard = (snapshot: RaceSnapshot | null, bryceRow: TimingRow | null): RaceControlIdentityMapping => {
  const series = snapshot?.heartbeat?.Series?.toLowerCase() ?? '';
  const sessionName = snapshot?.heartbeat?.SessionName?.toLowerCase() ?? '';
  const seriesOk = series.includes('nxt') || series === 'l' || sessionName.includes('nxt');
  const driverId = String(bryceRow?.DriverID ?? '');
  const exactName = bryceRow ? `${bryceRow.firstName} ${bryceRow.lastName}` === 'Bryce Aron' : false;
  const matchedBy: RaceControlIdentityMapping['matchedBy'] = driverId === '2143' ? 'driver_id' : exactName ? 'exact_name' : bryceRow ? 'unverified' : 'missing';

  return {
    carNumber: '9',
    raceControlDriverId: '2143',
    driverOverrideId: '4959',
    mergePolicy: 'documented_mapping_only',
    matchedBy,
    seriesOk
  };
};

export const assertManifestCoversSurfaceContracts = (manifest: UiMetricManifest): string[] => {
  const failures: string[] = [];
  for (const surface of analyticsSurfaceOrder) {
    const itemIds = new Set(getManifestItemsForSurface(manifest, surface).map((item) => item.id));
    for (const requiredMetricId of ANALYTICS_SURFACE_CONTRACTS[surface].requiredMetricIds) {
      if (!itemIds.has(requiredMetricId)) {
        failures.push(`${surface} missing ${requiredMetricId}`);
      }
    }
  }
  return failures;
};
