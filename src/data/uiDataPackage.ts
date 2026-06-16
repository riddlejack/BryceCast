import uiDataPackageJson from '../../analysis/ui-data-package/ui-data-package.json';

export interface UiSourceRef {
  key: string;
  path: string;
  note: string;
}

export interface UiRoadAmericaPrepEvent {
  eventId: string;
  eventName: string;
  eventStartDate: string;
  trackName: string;
  trackType: string;
  trackLengthMi: number | null;
  cornerCount: number | null;
  sameTrack: {
    raceCount: number | null;
    avgFinish: number | null;
    avgGain: number | null;
    top10RatePct: number | null;
  };
  trackTypeHistory: {
    avgFinish: number | null;
    avgGain: number | null;
    top10RatePct: number | null;
  };
  weatherState: string;
  sourceState: string;
}

export interface UiLiveFixture {
  schemaVersion: 'live-readiness.v1';
  checkedAt: string;
  variant?: 'base' | 'no_bryce_archive_ready' | 'no_bryce_archive_missing' | 'replay_empty' | 'replay_repeated_cold';
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

export interface UiDebriefSeed {
  label: string;
  sessionId: string;
  raceLabel: string;
  seasonYear: number | null;
  track: {
    name: string;
    type: string;
  };
  result: Record<string, number | null>;
  analysis: Record<string, string | number | null>;
  lapStory: Record<string, string | number | null> | null;
  incidentPenalty: Record<string, string | number | null> | null;
  teamContext: Record<string, string | number | null> | null;
  sourceState: string;
  confidence: string;
  caveat: string;
  sourceRefs: UiSourceRef[];
}

export interface UiDataPackageArtifacts {
  stableArtifacts: Array<Record<string, string>>;
  exploratoryOrDeferred: Array<Record<string, string>>;
  missingBackendContracts: string[];
  uiFixtureCoverage: string[];
}

export interface UiDataPackage {
  schemaVersion: 'brycecast.uiDataPackage.v1';
  generatedAt: string;
  baselineCommit: string;
  sourceInventory: Record<string, { path: string; bytes: number; modifiedAt: string; sha256: string }>;
  packageRules: string[];
  screens: {
    roadAmericaPrep: {
      title: string;
      readiness: string;
      events: UiRoadAmericaPrepEvent[];
      runtimeApiRequirements: string[];
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
    liveCompanionFixtures: {
      title: string;
      requiredStates: UiLiveFixture['state'][];
      requiredVariants: Array<NonNullable<UiLiveFixture['variant']>>;
      fixtures: UiLiveFixture[];
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
    raceDebrief: {
      title: string;
      readiness: string;
      featuredDebriefs: UiDebriefSeed[];
      chartFamilies: string[];
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
    careerLab: {
      title: string;
      readiness: string;
      seriesSummary: Array<Record<string, string | number | null>>;
      parityBySeries: Record<string, Array<Record<string, string | number | null>>>;
      resultConversionSample: Array<Record<string, string>>;
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
    sourceOps: {
      title: string;
      validation: Record<string, unknown>;
      ingestion: Record<string, unknown>;
      coverage: Record<string, unknown>;
      historyStanding: Record<string, unknown>;
      sourceFamilyAudit: Array<Record<string, string>>;
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
  };
  uiReadyArtifacts: UiDataPackageArtifacts;
}

export const uiDataPackage = uiDataPackageJson as UiDataPackage;

export const getLiveReadinessFixture = (state: UiLiveFixture['state'], variant: NonNullable<UiLiveFixture['variant']> = 'base'): UiLiveFixture | null =>
  uiDataPackage.screens.liveCompanionFixtures.fixtures.find((fixture) => fixture.state === state && (fixture.variant ?? 'base') === variant) ?? null;
