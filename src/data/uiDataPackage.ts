import uiDataPackageJson from '../../analysis/ui-data-package/ui-data-package.json';

export interface UiSourceRef {
  key: string;
  path: string;
  note: string;
}

export interface UiChartSpec {
  displayPolicy?: string;
  fields?: string[];
  filter?: Record<string, string>;
  id: string;
  source?: string;
  type: string;
}

export interface UiPredictionBand {
  calibrationState: string;
  claimStrength: string;
  confidence: string;
  finishPercentileBand: {
    median: number;
    n: number;
    p25: number;
    p75: number;
  };
  modelPolicy: string;
  scorecardRef: string;
  target: string;
  top10Policy: string;
}

export interface UiTop10PathItem {
  actionableRead: string;
  currentState: string;
  factor: string;
  whyItMatters: string;
}

export interface UiAnalogRace {
  analogType: string;
  analogyBasis: string;
  confidence: string;
  finishPercentile?: number | null;
  finishPosition?: number | null;
  historicalOutcomePolicy?: string;
  positionGain?: number | null;
  raceLabel: string;
  seasonYear?: number | null;
  sessionId: string;
  startPosition?: number | null;
  trackName: string;
  trackType: string;
}

export interface UiUpcomingPrepEvent {
  sourcePayload: string;
  contextPackRef: {
    bytes: number;
    eventId: string;
    id: string;
    modifiedAt: string;
    path: string;
    sha256: string;
    sourceRefs: string[];
    type: 'upcoming_event';
  };
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
    raceCount: number | null;
    avgFinish: number | null;
    avgGain: number | null;
    finishPercentileMedian?: number | null;
    top10RatePct: number | null;
  };
  predictionBand: UiPredictionBand;
  top10Path: UiTop10PathItem[];
  analogRaces: UiAnalogRace[];
  chartSpecs: UiChartSpec[];
  weatherState: string;
  sourceState: string;
}

export interface UiNextEventPrepRace {
  sessionId: string;
  raceLabel: string;
  seasonYear: number | null;
  trackName: string;
  sameTrack: boolean;
  startPosition: number | null;
  finishPosition: number | null;
  positionGain: number | null;
  finishPercentile: number | null;
  officialStatus: string | null;
  fieldSize: number | null;
}

export interface UiNextEventPrepFridayRow {
  sessionId: string;
  raceLabel: string;
  seasonYear: number | null;
  trackName: string;
  sameTrack: boolean;
  bestPracticeRank: number | null;
  bestQualifyingRank: number | null;
  raceStart: number | null;
  raceFinish: number | null;
  officialStatus: string | null;
  practiceFieldMedian: number | null;
}

export interface UiNextEventPrep {
  eventId: string;
  trackType: string;
  trackName: string;
  races: UiNextEventPrepRace[];
  raceSummary: {
    raceCount: number;
    movedForwardCount: number;
    cleanRaceCount: number;
    cleanAvgFinish: number | null;
    cleanAvgGain: number | null;
    cleanTop10Count: number;
    nonRunningStatuses: Array<{ sessionId: string; officialStatus: string | null }>;
  };
  fridaySignal: UiNextEventPrepFridayRow[];
  fridaySummary: {
    weekendCount: number;
    finishBeatBestPractice: number;
    finishMatchedBestPractice: number;
    medianPositionsBetter: number | null;
  };
  sourceState: string;
  caveats: string[];
}

export interface UiStandingsEntry {
  carNo: string;
  driverName: string;
  teamName: string | null;
  points: number;
  isBryce: boolean;
  pointsRankInCapture: number;
  headToHead: {
    racesTogether: number | null;
    bryceAhead: number | null;
    bryceBehind: number | null;
  } | null;
}

export type UiStandingsSnapshot =
  | { available: false; reason: string }
  | {
      available: true;
      capturedAt: string;
      capturePath: string;
      sessionKey: string;
      eventName: string | null;
      sessionName: string | null;
      seriesGuard: { series: string | null; sessionType: string | null; ok: boolean };
      roundsCompleted: number;
      racesRemaining: number;
      bryce: { carNo: string; points: number; pointsRankInCapture: number };
      entries: UiStandingsEntry[];
      sourceState: string;
      caveats: string[];
    };

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

export interface UiRaceStoryRef {
  sessionId: string;
  id: string;
  type: 'race_story';
  path: string;
  bytes: number;
  modifiedAt: string;
  sha256: string;
}

export interface UiSeasonIndexRow {
  sessionId: string;
  raceLabel: string;
  seasonYear: number | null;
  roundIndex: number | null;
  eventStartDate: string | null;
  trackName: string | null;
  trackType: string | null;
  startPosition: number | null;
  finishPosition: number | null;
  points: number | null;
  cumulativePoints: number | null;
  standingRank: number | null;
  officialStatus: string | null;
  pointsBehindLeader: number | null;
  leaderDriver: string | null;
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
  asOfDate: string;
  baselineCommit: string;
  sourceInventory: Record<string, { path: string; bytes: number; modifiedAt: string; sha256: string }>;
  packageRules: string[];
  screens: {
    upcomingPrep: {
      title: string;
      readiness: string;
      nextVenue?: string;
      events: UiUpcomingPrepEvent[];
      nextEventPrep: UiNextEventPrep | null;
      standingsSnapshot: UiStandingsSnapshot;
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
      raceStoryRefs: UiRaceStoryRef[];
      seasonIndex: UiSeasonIndexRow[];
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

/** Back-compat alias for pre-roll-forward call sites. */
export type UiRoadAmericaPrepEvent = UiUpcomingPrepEvent;

export const uiDataPackage = uiDataPackageJson as unknown as UiDataPackage;

export const getLiveReadinessFixture = (state: UiLiveFixture['state'], variant: NonNullable<UiLiveFixture['variant']> = 'base'): UiLiveFixture | null =>
  uiDataPackage.screens.liveCompanionFixtures.fixtures.find((fixture) => fixture.state === state && (fixture.variant ?? 'base') === variant) ?? null;
