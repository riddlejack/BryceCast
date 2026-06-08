export type SourceState = 'live' | 'cold' | 'stale' | 'seed' | 'error';

export type TrackType = 'O' | 'R' | 'S' | string;

export interface RaceHeartbeat {
  eventName: string;
  trackName: string;
  trackLength: number;
  trackType: TrackType;
  currentFlag: string;
  totalLaps: string;
  lapNumber: string;
  SessionName: string;
  SessionType: string;
  SessionStatus: string;
  Series?: string;
  EventID: string;
  EventSessionID: string;
  flagTimes?: Record<string, string>;
  flagCounts?: Record<string, string[]>;
}

export interface TimingRow {
  DriverID?: number | string;
  no: string;
  firstName: string;
  lastName: string;
  team: string;
  rank: number;
  liveRank: number;
  startPosition: number;
  marker: string;
  status: string;
  comment: string;
  diff: string;
  gap: string;
  liveGap: string;
  laps: string;
  lapsLed: string;
  bestLapTime: string;
  bestLap: string;
  lastLapTime: string;
  qualTime: string;
  BestSpeed: string;
  LastSpeed: string;
  AverageSpeed: string;
  pitStops: number;
  lastPitLap: number;
  sincePitLap: number;
  onTrack: string;
  Tire: string;
  Passes: number;
  Passed: number;
  totalEntrantPoints: number;
  runningDriverPoints: number;
}

export interface DriverProfile {
  driverid?: string;
  rc_driver_id?: string;
  name: string;
  firstname: string;
  lastname: string;
  number: string;
  team: string;
  headshot: string;
  heroshot: string;
  waistupimage: string;
  carillustration: string;
  endplatesmall: string;
  radiofrequency: string;
  hometown: string;
  residence: string;
  website: string;
  stats: {
    starts: string;
    poles: string;
    wins: string;
    top5: string;
    top10: string;
    avgstart: string;
    avgfinish: string;
    lapsled: string;
    running: string;
    points: string;
  };
}

export interface SourceProbe {
  id: string;
  label: string;
  url: string;
  state: SourceState;
  note: string;
  fetchedAt?: string;
  lastModified?: string | null;
  etag?: string | null;
  bytes?: number;
  checkedAgeSeconds?: number | null;
  modifiedAgeSeconds?: number | null;
  freshnessLabel?: string;
}

export interface RaceSnapshot {
  heartbeat: RaceHeartbeat;
  timingRows: TimingRow[];
  bryce: TimingRow;
  bryceProfile: DriverProfile;
  trackMapUrl?: string;
  broadcastRoute: BroadcastSessionRoute;
  updatedAt: string;
  sourceState: SourceState;
  sourceProbes: SourceProbe[];
}

export type BroadcastNetworkKind = 'video' | 'audio' | 'international' | 'app' | 'fallback';

export interface BroadcastNetwork {
  id: string;
  name: string;
  url: string;
  logoPositive?: string;
  logoNegative?: string;
  kind: BroadcastNetworkKind;
}

export interface BroadcastSessionRoute {
  eventId: string;
  sessionId?: string;
  eventName: string;
  sessionName: string;
  sessionType: string;
  startsAt: string;
  endsAt?: string;
  estimatedGreenFlag?: string;
  primaryVideo?: BroadcastNetwork;
  alternates: BroadcastNetwork[];
  audio: BroadcastNetwork[];
  international: BroadcastNetwork[];
  source: 'trackactivity' | 'schedule' | 'config' | 'seed';
  note: string;
}

export interface RaceLogEndpoint {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  status: number;
  bytes: number;
  fetchedAt?: string;
  lastModified: string | null;
  etag: string | null;
  checkedAgeSeconds?: number | null;
  modifiedAgeSeconds?: number | null;
  freshnessLabel?: string;
  note: string | null;
}

export interface RaceLogSnapshot {
  schemaVersion: number;
  checkedAt: string;
  sessionKey: string;
  eventId: string;
  eventSessionId: string;
  eventName: string;
  trackName: string;
  trackLength: number | null;
  trackType: string;
  sessionName: string;
  sessionType: string;
  sessionStatus: string;
  flag: string;
  lap: string;
  totalLaps: string;
  sourceState: SourceState;
  rowCount: number;
  bryce: {
    no: string;
    rank: number | null;
    liveRank: number | null;
    startPosition: number | null;
    laps: string;
    status: string;
    marker: string;
    comment: string;
    gap: string;
    liveGap: string;
    diff: string;
    bestLapTime: string;
    bestLap: string;
    lastLapTime: string;
    bestSpeed: string;
    lastSpeed: string;
    passes: number | null;
    passed: number | null;
    pitStops: number | null;
    lastPitLap: number | null;
    radiofrequency: string;
  } | null;
  storage: {
    sqlite: string;
    jsonl: string;
    latest: string;
    publicLatest: string;
  };
  trackMapUrl: string;
  endpoints: RaceLogEndpoint[];
}

export interface BryceReplayRow {
  checkedAt: string;
  sessionKey: string;
  elapsedSeconds: number | null;
  sample: number;
  timeLabel: string;
  rank: number | null;
  liveRank: number | null;
  startPosition: number | null;
  positionDelta: number | null;
  laps: string;
  status: string;
  comment: string;
  gap: string;
  liveGap: string;
  diff: string;
  bestLapTime: string;
  lastLapTime: string;
  bestSpeed: number | null;
  lastSpeed: number | null;
  passes: number | null;
  passed: number | null;
  netPasses: number | null;
  pitStops: number | null;
  sourceState: string;
  flag: string;
}

export interface BryceReplaySummary {
  firstCheckedAt: string | null;
  lastCheckedAt: string | null;
  coverageMinutes: number;
  firstRank: number | null;
  lastRank: number | null;
  latestRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  rankDelta: number | null;
  positionDelta: number | null;
  netPasses: number | null;
  latestStatus: string;
  latestGap: string;
  latestLaps: string;
  latestBestLapTime: string;
  latestComment: string;
  latestPassNet: number | null;
  statusEvents: Array<{
    checkedAt: string;
    status: string;
    comment: string;
    rank: number | null;
    gap: string;
  }>;
}

export interface BryceReplayPayload {
  available: boolean;
  sqlite: string;
  generatedAt: string;
  archiveState: 'missing' | 'empty' | 'tiny' | 'ready';
  count: number;
  returned: number;
  selectedCount: number;
  sessionKey: string | null;
  sessions: Array<{
    sessionKey: string;
    samples: number;
    firstCheckedAt: string;
    lastCheckedAt: string;
    eventName?: string;
    sessionName?: string;
  }>;
  summary: BryceReplaySummary;
  rows: BryceReplayRow[];
  warnings: string[];
  error?: string;
}

export interface OnboardCatalogItem {
  id: number;
  channelId: number;
  channelName: string;
  channelPath: string;
  name: string;
  start: string;
  end: string;
  status: string;
  private: boolean;
  seoString: string;
  url: string;
  thumbnail: string;
}

export type OnboardCatalogStatus = 'candidate_found' | 'nxt_driver_level_no_bryce' | 'series_onboards_only' | 'no_onboard_catalog';

export interface OnboardCatalogSnapshot {
  schemaVersion: number;
  checkedAt: string;
  status: OnboardCatalogStatus;
  passGate: boolean;
  note: string;
  counts: {
    onboardItems: number;
    indyNxtItems: number;
    indyNxtDriverLevelItems: number;
    strictBryceMatches: number;
    weakNineMatches: number;
  };
  strictBryceMatches: OnboardCatalogItem[];
  weakNineMatches: OnboardCatalogItem[];
  onboardSample: OnboardCatalogItem[];
  indyNxtSample: OnboardCatalogItem[];
  storage: {
    jsonl: string;
    latest: string;
    publicLatest: string;
  };
}

export interface AlertItem {
  tone: 'green' | 'amber' | 'red' | 'cyan' | 'neutral';
  title: string;
  detail: string;
  stamp: string;
}

export interface HistoryPoint {
  race: string;
  type: 'Street' | 'Road' | 'Oval';
  start: number;
  finish: number;
  bestLapRank: number;
  points: number | null;
  status?: string;
  source?: string;
}

export interface SeasonHistoryPayload {
  checkedAt: string;
  source: string;
  meta?: {
    schemaVersion: string;
    seasonYear: number;
    rows: number;
    officialRows: number;
    provisionalRows: number;
    checkedAt: string | null;
    checkedAgeSeconds: number | null;
    checkedAgeLabel: string;
    source: string;
    sourceFingerprint: string;
  };
  points: HistoryPoint[];
  bryceStanding?: {
    rank: number;
    points: number;
    wins: number;
    top5: number;
    top10: number;
    bestFinish: number;
  };
  yearSummaries: Array<{
    year: number;
    starts: number;
    bestFinish: number;
    top10s: number;
    averageFinish: number;
  }>;
  teammateSummaries: Array<{
    name: string;
    driverId: string;
    year?: number;
    starts: number;
    bestFinish: number;
    top10s?: number;
    averageFinish: number;
  }>;
}

export type PovStatus = 'unproven' | 'available' | 'unavailable' | 'locked' | 'delayed' | 'broadcast_cutaway' | 'postrace_only' | 'inconclusive';

export type PovSource = 'INDYCAR App' | 'INDYCAR LIVE' | 'FOX/FOX One' | 'CGR/INDYCAR/FOX approved monitor' | 'Other authorized surface';

export interface PovProofItem {
  label: string;
  done: boolean;
}

export interface PovState {
  status: PovStatus;
  source: PovSource;
  device: string;
  session: string;
  verifiedAt: string;
  selectorLabel: string;
  latencyNote: string;
  evidenceRef: string;
  liveConfirmedSeconds: number;
  notes: string;
  proofItems: PovProofItem[];
}

export type AudioStatus =
  | 'untested'
  | 'official_race_audio_available'
  | 'bryce_radio_available'
  | 'bryce_radio_absent'
  | 'official_app_locked'
  | 'official_app_silent'
  | 'frequency_only'
  | 'scanner_confirmed'
  | 'sdr_candidate'
  | 'permission_blocked'
  | 'inconclusive';

export type AudioSource =
  | 'INDYCAR App'
  | 'INDYCAR Radio'
  | 'SiriusXM'
  | 'TuneIn'
  | 'Mixlr'
  | 'Published frequency'
  | 'Scanner/SDR'
  | 'Other authorized source';

export interface AudioProofItem {
  label: string;
  done: boolean;
}

export interface AudioState {
  status: AudioStatus;
  source: AudioSource;
  device: string;
  session: string;
  verifiedAt: string;
  selectorLabel: string;
  frequency: string;
  frequencySource: string;
  officialRaceAudioAvailable: boolean;
  permissionBucket: string;
  latencyNote: string;
  evidenceRef: string;
  liveConfirmedSeconds: number;
  notes: string;
  proofItems: AudioProofItem[];
}
