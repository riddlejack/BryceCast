import uiDataPackageJson from '../../analysis/ui-data-package/ui-data-package.json';

export interface UiSourceRef {
  key: string;
  path: string;
  note: string;
}

export interface UiCareerRival {
  driverId: string | null;
  driverName: string;
  racesTogether: number | null;
  bryceAhead: number | null;
  bryceBehind: number | null;
  headToHeadWinRate: number | null;
  avgFinishDeltaVsRival: number | null;
  sameTeamRaces: number | null;
  notableRaces: Array<{ label: string; finishDelta: number | null }>;
}

export type UiCareerMomentKind =
  | 'first_car_win'
  | 'first_indy_nxt_race'
  | 'best_indy_nxt_finish'
  | 'daytona_24'
  | 'wwtr_mechanical';

export interface UiCareerMoment {
  sessionId: string;
  shortLabel: string;
  kind: UiCareerMomentKind;
}

export interface UiSeasonLapMix {
  seasonYear: number;
  races: number;
  totalLaps: number;
  top5LapShare: number;
  top10LapShare: number;
  positions: Array<{ position: number; laps: number }>;
}

export type UiCareerConfidenceClass = 'observed_exact' | 'observed_lower_bound' | 'modeled_range' | 'unknown';

export interface UiCareerAtlasSeriesSpan {
  seriesId: string;
  seriesName: string;
  seriesShort: string;
  raceCount: number;
  firstYear: number;
  lastYear: number;
  firstRaceDate: string;
  latestRaceDate: string;
  bestFinish: number | null;
  latestRace: {
    sessionId: string;
    eventId: string;
    raceDate: string;
    raceLabel: string;
    raceHref: string;
  };
}

export interface UiCareerAtlasVenue {
  venueId: string;
  trackName: string;
  trackIds: string[];
  country: string;
  region: 'North America' | 'Europe' | 'Oceania';
  lat: number;
  lon: number;
  projected: { x: number; y: number };
  raceCount: number;
  firstYear: number;
  lastYear: number;
  bestFinish: number | null;
  seriesSpans: UiCareerAtlasSeriesSpan[];
  dominantChapter: UiCareerAtlasSeriesSpan;
  latestRace: {
    sessionId: string;
    eventId: string;
    raceDate: string;
    raceLabel: string;
    raceHref: string;
  };
  coordinateSources: string[];
  confidence: {
    coordinates: 'observed_exact';
    raceCount: 'observed_exact';
    seriesSpans: 'observed_exact';
    bestFinish: 'observed_exact' | 'unknown';
    latestRace: 'observed_exact';
  };
}

export interface UiCareerAtlas {
  schemaVersion: 'brycecast.careerAtlas.v3';
  naturalEarth: {
    dataset: string;
    sourceCommit: string;
    sourceUrl: string;
    downloadPage: string;
    license: 'public_domain';
    licenseUrl: string;
    sourceSha256: string;
  };
  geometry: {
    projection: 'equirectangular_wrapped';
    crop: {
      lonMin: number;
      lonMax: number;
      latMin: number;
      latMax: number;
      paddingLongitudeDegrees: number;
      paddingLatitudeDegrees: number;
    };
    canvas: { width: number; height: number };
    simplification: { method: 'closed_ring_ramer_douglas_peucker'; tolerancePx: number };
    sourceFeatureCount: number;
    sourcePointCount: number;
    clippedPointCount: number;
    simplifiedPointCount: number;
    ringCount: number;
    fillRule: 'evenodd';
    landPath: string;
    landPathSha256: string;
  };
  globe: {
    projection: 'orthographic';
    texture: {
      path: 'analysis/career-atlas/output/world_land_texture.png';
      width: 1024;
      height: 512;
      format: 'png_grayscale_land_mask';
      sha256: string;
      sourceFeatureCount: 127;
    };
    defaultCenter: { longitude: number; latitude: number };
    zoom: { min: 1; max: 32 };
  };
  venues: UiCareerAtlasVenue[];
  venueCount: number;
  raceCount: number;
  confidenceClasses: UiCareerConfidenceClass[];
  caveats: string[];
  sourceRefs: UiSourceRef[];
}

export interface UiRestartCareer {
  totalRestarts: number;
  bryceRestartsCounted: number;
  bryceGained: number;
  bryceHeld: number;
  bryceSlipped: number;
  bryceNet: number;
  avgBryceNetPerRestart: number | null;
  fieldAvgNetPerRestart: number | null;
  restartsBeatFieldMedian: number;
  racesSoleBestInField: number;
  racesWithRestarts: number;
}

export interface UiRestartByRace {
  sessionId: string;
  seasonYear: number | null;
  raceLabel: string;
  trackName: string;
  trackType: string;
  venueSlug: string;
  eventStartDate: string | null;
  roundIndex: number | null;
  restartCount: number | null;
  bryceRestartsCounted: number | null;
  bryceNet: number | null;
  bryceGained: number | null;
  bryceHeld: number | null;
  bryceSlipped: number | null;
  bryceRankInField: number | null;
  fieldSizeRanked: number | null;
  /** Median of every classified driver's summed restart movement this race. */
  fieldMedianNet: number | null;
  /** True when Bryce's day net strictly beat that median — the gold-day flag. */
  bryceBeatFieldTypical: boolean;
  soleBestInField: boolean;
  coBestInField: boolean;
  coverageNote: string;
}

export interface UiRestartByVenue {
  venueSlug: string;
  trackName: string;
  trackType: string;
  seasons: string;
  races: number;
  restarts: number;
  bryceRestartsCounted: number;
  bryceNet: number;
  bryceGained: number;
  bryceHeld: number;
  bryceSlipped: number;
  avgBryceNetPerRestart: number | null;
  fieldAvgNetPerRestart: number | null;
}

export interface UiRestartBySeason {
  seasonYear: number | null;
  races: number;
  restarts: number;
  bryceRestartsCounted: number;
  bryceNet: number;
  bryceGained: number;
  bryceHeld: number;
  bryceSlipped: number;
  avgBryceNetPerRestart: number | null;
  fieldAvgNetPerRestart: number | null;
}

/** The Restart Report Card contract: v1 fed by the lap-chart derivation
 *  (`precision: 'lap-chart'`); per-second lake data later swaps `precision`
 *  and refines the windows with no UI rework. */
export interface UiRestartReport {
  schemaVersion: 'brycecast.restartReport.v1';
  precision: 'lap-chart';
  windowLaps: number | null;
  coverage: {
    indyNxtRaceSessions: number;
    sessionsWithLapChart: number;
    racesWithRestarts: number;
    racesNoCaution: number;
    endOfRaceCautionsExcluded: number;
    racesUncovered: number;
  };
  career: UiRestartCareer;
  byRace: UiRestartByRace[];
  byVenue: UiRestartByVenue[];
  bySeason: UiRestartBySeason[];
  handVerification: Array<{
    sessionId: string;
    raceLabel: string;
    restarts: Array<Record<string, number | string | null>>;
  }>;
  caveats: string[];
  sourceRefs: UiSourceRef[];
}

export interface UiCareerLifeStats {
  schemaVersion: 'brycecast.careerLifeStats.v2';
  personalRaceMileage: {
    raceRows: number;
    coveredRaceRows: number;
    laps: number;
    miles: number;
    confidenceClass: 'observed_exact';
    metricGrain: 'driver_physical_race';
  };
  physicalSessionMileage: {
    sessionRows: number;
    exact: { sessions: number; laps: number; miles: number; confidenceClass: 'observed_exact' };
    lowerBound: { sessions: number; laps: number; miles: number; confidenceClass: 'observed_lower_bound' };
    unknown: { sessions: number; confidenceClass: 'unknown' };
    floor: { laps: number; miles: number; confidenceClass: 'observed_lower_bound' };
    excludedAggregateSessions: number;
    metricGrain: 'driver_physical_session';
  };
  travel: {
    greatCircleMinimum: { miles: number; label: string; confidenceClass: 'observed_exact' };
    routeAdjustedMinimum: {
      lowMiles: number;
      baseMiles: number;
      highMiles: number;
      confidenceClass: 'modeled_range';
      assumptions: { driveProxy: string; flightProxy: string };
    };
    actualTravel: { confidenceClass: 'unknown'; blockedBy: ['seasonBase', 'returnHomeFrequency'] };
  };
  countries: number;
  venues: number;
  longestLeg: { fromTrackName: string; toTrackName: string; miles: number } | null;
  farthestVenuePair: { fromTrackName: string; toTrackName: string; miles: number } | null;
  coverageGaps: string[];
  resourceModels: {
    fuel: { confidenceClass: 'modeled_range'; rows: number; table: string };
    tires: { confidenceClass: 'modeled_range'; rows: number; table: string };
  };
  mileageBreakdowns: Array<{
    dimensionType: 'season' | 'series' | 'session_type' | 'venue' | 'country' | 'confidence_class';
    dimensionValue: string;
    confidenceClass: 'observed_exact' | 'observed_lower_bound' | 'unknown';
    sessionCount: number;
    lapsFloor: number;
    milesFloor: number;
  }>;
  travelModeBreakdown: Array<{
    travelModeProxy: 'same_venue' | 'drive_proxy' | 'flight_proxy';
    legCount: number;
    greatCircleMiles: number;
    routeAdjustedLowMiles: number;
    routeAdjustedBaseMiles: number;
    routeAdjustedHighMiles: number;
    confidenceClass: 'observed_exact' | 'modeled_range';
  }>;
  fuelEstimateRanges: Array<{
    seriesId: string;
    seriesName: string;
    seasonYear: number;
    chassis: string;
    observedMilesFloor: number;
    estimatedFuelLowLiters: number;
    estimatedFuelBaseLiters: number;
    estimatedFuelHighLiters: number;
    confidenceClass: 'modeled_range';
    formula: string;
    sourceUrl: string;
    sensitivityDrivers: string;
  }>;
  tireEstimateRanges: Array<{
    seriesId: string;
    seriesName: string;
    seasonYear: number;
    chassis: string;
    tireSupplier: string;
    observedSessionsWithLaps: number;
    unknownLapSessionsExcluded: number;
    estimatedUniqueTiresLow: number;
    estimatedUniqueTiresBase: number;
    estimatedUniqueTiresHigh: number;
    confidenceClass: 'modeled_range';
    formula: string;
    sourceUrl: string;
    sensitivityDrivers: string;
  }>;
  venueSources: Array<{
    trackName: string;
    trackIds: string[];
    lengthSources: string[];
    coordsSources: string[];
  }>;
  caveats: string[];
  sourceRefs: UiSourceRef[];
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
  /** The WEEKEND's first day (practice/qualifying can run here). Never the
   *  race date — render race-day copy from raceDate. */
  eventStartDate: string;
  /** The race session's own local date from the canonical schedule (e.g. the
   *  Sunday of a Saturday-start weekend). Null when no race session is
   *  scheduled yet; consumers fall back to eventStartDate. */
  raceDate?: string | null;
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

/** Per-race per-lap section observation pack ref (Brief H — Section
 *  Intelligence). venueName/seasonYear ride on the ref so venue-level views
 *  (YoY shapes) can find sibling visits without loading every pack. */
export interface UiSectionLapRef {
  sessionId: string;
  id: string;
  type: 'section_laps';
  venueName: string;
  seasonYear: number | null;
  path: string;
  bytes: number;
  modifiedAt: string;
  sha256: string;
}

export interface UiPassMarkRef {
  sessionId: string;
  id: string;
  type: 'pass_marks';
  venueName: string;
  seasonYear: number | null;
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

/* ---------- venue dossier: this place, other years ---------- */

/** Per-visit near-track conditions. Source-agnostic by design (adapter-contract
 *  law): v1 is Open-Meteo modeled reanalysis; v2 can slot in lake-derived
 *  trackside messages by changing `source`/`sourceType`/`confidence` with no UI
 *  rework. `official` stays false — weather is never presented as official
 *  series weather or track temperature. */
export interface UiVenueDossierConditions {
  observedAt: string | null;
  ambientTempC: number | null;
  ambientTempF: number | null;
  apparentTempC: number | null;
  humidityPct: number | null;
  windSpeedKph: number | null;
  windSpeedMph: number | null;
  windGustKph: number | null;
  windGustMph: number | null;
  windDirectionDeg: number | null;
  windCardinal: string | null;
  sky: string | null;
  wetDry: string | null;
  source: string;
  sourceType: 'modeled_reanalysis' | 'observed_station' | 'trackside_official';
  official: false;
  confidence: string;
  caveat: string;
}

/** A visit measured against Bryce's previous INDY NXT race at the same venue.
 *  A delta is a fact about the day, never a verdict on the drive. */
export interface UiVenueDossierDelta {
  priorSeasonYear: number;
  priorSessionId: string;
  priorRaceLabel: string;
  finishDelta: number | null;
  gridDelta: number | null;
  tempDeltaF: number | null;
  humidityDeltaPct: number | null;
  windSpeedDeltaMph: number | null;
  windDirectionFrom: string | null;
  windDirectionTo: string | null;
  windSwung: boolean;
}

export interface UiVenueDossierVisit {
  sessionId: string;
  seasonYear: number;
  raceInYearIndex: number | null;
  raceLabel: string;
  raceHref: string;
  eventStartDate: string | null;
  result: {
    startPosition: number | null;
    finishPosition: number | null;
    gain: number | null;
    finishPercentile: number | null;
    fieldSize: number | null;
    officialStatus: string | null;
    points: number | null;
  };
  conditions: UiVenueDossierConditions | null;
  deltaVsPrior: UiVenueDossierDelta | null;
}

export interface UiVenueDossierScheduledSession {
  sessionId: string;
  sessionType: string;
  sessionName: string | null;
  scheduledStart: string | null;
  timezone: string | null;
  status: string | null;
}

export interface UiVenueDossierVenue {
  venueId: string;
  trackName: string;
  trackSlug: string | null;
  trackType: string | null;
  drivingDirection: string | null;
  lengthMi: number | null;
  cornerCount: number | null;
  geo: {
    oriented: boolean;
    northOffsetDeg: number | null;
    note: string;
  };
  visits: UiVenueDossierVisit[];
  visitYears: number[];
  upcoming: {
    eventId: string;
    eventName: string;
    eventStartDate: string | null;
    scheduledSessions: UiVenueDossierScheduledSession[];
  } | null;
}

export interface UiVenueDossier {
  schemaVersion: 'brycecast.venueDossier.v1';
  title: string;
  readiness: string;
  venues: UiVenueDossierVenue[];
  venueCount: number;
  caveats: string[];
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
      sectionLapRefs: UiSectionLapRef[];
      passMarkRefs: UiPassMarkRef[];
      seasonIndex: UiSeasonIndexRow[];
      chartFamilies: string[];
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
    careerLab: {
      title: string;
      readiness: string;
      /** Integrity ref for the GB3 depth-layer pack — the loader verifies
       *  sha256 + id against this and fails closed (the raceStory pattern). */
      gb3DeepDiveRef?: {
        id: string;
        type: 'gb3_deep_dive';
        path: string;
        bytes: number;
        modifiedAt: string;
        sha256: string;
      } | null;
      seriesSummary: Array<Record<string, string | number | null>>;
      parityBySeries: Record<string, Array<Record<string, string | number | null>>>;
      resultConversion: Array<Record<string, string | number | null>>;
      resultConversionSample: Array<Record<string, string | number | null>>;
      moments: UiCareerMoment[];
      headToHead: UiCareerRival[];
      lapPositionMix: UiSeasonLapMix[];
      restarts: UiRestartReport;
      atlas: UiCareerAtlas;
      lifeStats: UiCareerLifeStats;
      caveats: string[];
      sourceRefs: UiSourceRef[];
    };
    venueDossier: UiVenueDossier;
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
