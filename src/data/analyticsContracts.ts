import type { BryceReplayPayload, RaceSnapshot, SeasonHistoryPayload, SourceState, TimingRow } from './types';

export type AnalyticsSurface = 'race_weekend_prep' | 'live_race_companion' | 'race_debrief' | 'career_lab' | 'source_ops';

export type AnalyticsFallbackState =
  | 'available'
  | 'partial'
  | 'source_bounded'
  | 'unavailable'
  | 'live_only'
  | 'replay_only'
  | 'deferred';

export type AnalyticsConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type AnalyticsSourceKind = 'api' | 'artifact' | 'dataset' | 'generated_report' | 'doc' | 'external' | 'local_storage' | 'seed';

export interface AnalyticsSourceProvenance {
  kind: AnalyticsSourceKind;
  path: string;
  sourceFamily: string;
  sourceState?: string;
  lastGeneratedAt?: string | null;
  role?: 'primary' | 'fallback' | 'guard' | 'context' | 'candidate';
}

export interface AnalyticsMetric<T> {
  id: string;
  label: string;
  value: T | null;
  unit: string | null;
  sourceState: AnalyticsFallbackState;
  readiness: AnalyticsFallbackState;
  confidence: AnalyticsConfidence;
  provenance: AnalyticsSourceProvenance[];
  caveatIds: string[];
  unavailableReason: string | null;
  requiredFields: string[];
}

export interface ManifestDataSource {
  kind: string;
  path: string;
}

export interface UiMetricManifestItem {
  id: string;
  surface: AnalyticsSurface;
  priority: string;
  stakeholder: string[];
  userQuestion: string;
  dataSources: ManifestDataSource[];
  grain: string[];
  requiredFields: string[];
  availability: AnalyticsFallbackState;
  confidence: AnalyticsConfidence;
  caveatBehavior?: {
    gapIds?: string[];
    copy?: string;
    drawer?: boolean;
  };
  recommendedVisualizationFamily: string;
  fallbackState: string;
  implementationOwner: string;
}

export interface UiMetricManifest {
  schemaVersion: 'brycecast.uiMetricManifest.v1';
  generatedAt: string;
  baselineCommit?: string;
  items: UiMetricManifestItem[];
}

export interface UiReadyArtifact {
  artifact: string;
  caveatRule: string;
  grain: string;
  sourceState: string;
  uiUseCase: string;
}

export interface UiReadyArtifactsManifest {
  baselineCommit?: string;
  canonicalDatasetUpdatedAt?: string;
  generatedOn?: string;
  stableArtifacts: UiReadyArtifact[];
  exploratoryOrDeferred: Array<{ artifact: string; reason: string }>;
  missingBackendContracts: string[];
  validationSnapshot?: Record<string, number>;
}

export interface SurfaceContract {
  surface: AnalyticsSurface;
  stateName: string;
  requiredMetricIds: string[];
  sourcePolicy: string;
}

export interface AnalyticsMetricValue {
  question: string;
  priority: string;
  stakeholder: string[];
  grain: string[];
  artifactPaths: string[];
  apiPaths: string[];
  displayFamily: string;
  fallbackState: string;
  owner: string;
}

export interface AnalyticsSourceDrawerEntry {
  metricId: string;
  question: string;
  readiness: AnalyticsFallbackState;
  confidence: AnalyticsConfidence;
  provenance: AnalyticsSourceProvenance[];
  caveatIds: string[];
  caveat: string | null;
}

export interface SeedDataPolicy {
  productionEligible: false;
  sourceState: 'seed';
  reason: string;
}

export interface RaceControlIdentityMapping {
  carNumber: '9';
  raceControlDriverId: '2143';
  driverOverrideId: '4959';
  mergePolicy: 'documented_mapping_only';
  matchedBy: 'driver_id' | 'exact_name' | 'unverified' | 'missing';
  seriesOk: boolean;
}

export interface RaceControlLiveContext {
  snapshot: RaceSnapshot | null;
  bryceRow: TimingRow | null;
  sourceState: SourceState | 'unavailable';
  identityGuard: RaceControlIdentityMapping;
  timingRows: TimingRow[];
}

export interface LiveReadinessPayload {
  schemaVersion: 'live-readiness.v1';
  checkedAt: string;
  state: 'ready' | 'pre_session' | 'degraded' | 'wrong_series' | 'stale' | 'blocked';
  severity: 'green' | 'amber' | 'red';
  reason: string;
  raceWeekend: Record<string, unknown>;
  liveTiming: Record<string, unknown>;
  bryce: Record<string, unknown>;
  points: Record<string, unknown>;
  weather: Record<string, unknown>;
  replay: Record<string, unknown>;
  sources: Record<string, unknown>;
  gates: Array<Record<string, unknown>>;
}

export interface HistoricalCareerContext {
  history: SeasonHistoryPayload | null;
  sourceState: 'source_backed' | 'seed' | 'unavailable';
  seedDataPolicy: SeedDataPolicy | null;
}

export interface RaceWeekendPrepState {
  schemaVersion: 'brycecast.raceWeekendPrepState.v1';
  surface: 'race_weekend_prep';
  readiness: AnalyticsFallbackState;
  metrics: Record<string, AnalyticsMetric<AnalyticsMetricValue>>;
  sourceDrawer: AnalyticsSourceDrawerEntry[];
  artifactInputs: AnalyticsSourceProvenance[];
  liveInputs: AnalyticsSourceProvenance[];
  deferredBackendFields: string[];
}

export interface LiveRaceCompanionState {
  schemaVersion: 'brycecast.liveRaceCompanionState.v1';
  surface: 'live_race_companion';
  readiness: AnalyticsFallbackState;
  metrics: Record<string, AnalyticsMetric<AnalyticsMetricValue>>;
  sourceDrawer: AnalyticsSourceDrawerEntry[];
  readinessPayload: LiveReadinessPayload | null;
  productState: LiveReadinessPayload['state'] | 'unavailable';
  pointsProjection: LiveReadinessPayload['points'] | null;
  raceControl: RaceControlLiveContext;
  historicalCareer: HistoricalCareerContext;
  replay: BryceReplayPayload | null;
  blockedUntilReadiness: string[];
}

export interface RaceDebriefState {
  schemaVersion: 'brycecast.raceDebriefState.v1';
  surface: 'race_debrief';
  readiness: AnalyticsFallbackState;
  metrics: Record<string, AnalyticsMetric<AnalyticsMetricValue>>;
  sourceDrawer: AnalyticsSourceDrawerEntry[];
  officialResultArtifacts: AnalyticsSourceProvenance[];
  derivedReviewRequiredIds: string[];
}

export interface CareerLabState {
  schemaVersion: 'brycecast.careerLabState.v1';
  surface: 'career_lab';
  readiness: AnalyticsFallbackState;
  metrics: Record<string, AnalyticsMetric<AnalyticsMetricValue>>;
  sourceDrawer: AnalyticsSourceDrawerEntry[];
  historicalCareer: HistoricalCareerContext;
  parityArtifactPaths: string[];
}

export interface SourceOpsState {
  schemaVersion: 'brycecast.sourceOpsState.v1';
  surface: 'source_ops';
  readiness: AnalyticsFallbackState;
  metrics: Record<string, AnalyticsMetric<AnalyticsMetricValue>>;
  sourceDrawer: AnalyticsSourceDrawerEntry[];
  missingBackendContracts: string[];
  requiredReadinessRoute: '/api/readiness';
}

export interface AnalyticsViewModelRegistry {
  schemaVersion: 'brycecast.analyticsViewModels.v1';
  generatedAt: string;
  raceWeekendPrep: RaceWeekendPrepState;
  liveRaceCompanion: LiveRaceCompanionState;
  raceDebrief: RaceDebriefState;
  careerLab: CareerLabState;
  sourceOps: SourceOpsState;
}

export const ANALYTICS_SURFACE_CONTRACTS: Record<AnalyticsSurface, SurfaceContract> = {
  race_weekend_prep: {
    surface: 'race_weekend_prep',
    stateName: 'RaceWeekendPrepState',
    requiredMetricIds: ['prep_event_command_center', 'prep_track_history', 'prep_practice_qualifying_funnel', 'prep_weather_window'],
    sourcePolicy: 'Use upcoming live route metadata plus historical artifact paths; future weather claims require live NWS provenance.'
  },
  live_race_companion: {
    surface: 'live_race_companion',
    stateName: 'LiveRaceCompanionState',
    requiredMetricIds: [
      'live_source_readiness',
      'live_bryce_status_tile',
      'live_timing_tower',
      'live_gap_lap_trend',
      'live_points_projection',
      'live_weather_strip'
    ],
    sourcePolicy: 'Keep live Race Control data separate from historical career analytics and guard Bryce identity before live labels render.'
  },
  race_debrief: {
    surface: 'race_debrief',
    stateName: 'RaceDebriefState',
    requiredMetricIds: [
      'debrief_header',
      'debrief_qualifying_conversion',
      'debrief_lap_position_story',
      'debrief_incidents_penalties',
      'debrief_team_context',
      'debrief_source_drawer'
    ],
    sourcePolicy: 'Use official result, lap-chart, section, and source-audit artifact paths; badge partial or derived review states.'
  },
  career_lab: {
    surface: 'career_lab',
    stateName: 'CareerLabState',
    requiredMetricIds: ['career_series_summary', 'career_metric_parity_matrix', 'career_result_conversion_explorer', 'career_gap_ledger'],
    sourcePolicy: 'Read parity by metric family and avoid projecting INDY NXT coverage depth onto older series.'
  },
  source_ops: {
    surface: 'source_ops',
    stateName: 'SourceOpsState',
    requiredMetricIds: ['ops_validation_status', 'ops_live_source_console', 'ops_replay_archive_state'],
    sourcePolicy: 'Expose validation, live source, replay, and missing readiness contracts without treating HTTP 200 as product readiness.'
  }
};
