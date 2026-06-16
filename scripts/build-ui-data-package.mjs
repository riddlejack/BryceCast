import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { buildPointsProjectionState } from './live-points-state.mjs';

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, 'analysis/ui-data-package/ui-data-package.json');

const sources = {
  manifest: 'analysis/ui-contract/ui-metric-manifest.json',
  uiReadyArtifacts: 'analysis/ui-ready-artifacts.json',
  validationReport: 'data/career/reports/validation-report.json',
  ingestionSummary: 'data/career/reports/ingestion-summary.json',
  coverageMatrix: 'data/career/reports/career-coverage-matrix.json',
  historyBryce: 'public/data/history-bryce.json',
  futureWeekendPrep: 'analysis/indy-nxt-discovery/output/deep_dive/tables/future_weekend_prep_inputs.csv',
  raceDebriefScores: 'analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv',
  fullFieldLapDynamicsByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_race.csv',
  incidentPenaltyContext: 'analysis/indy-nxt-discovery/output/deep_dive/tables/incident_penalty_context.csv',
  teamContextByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv',
  championshipProgression: 'analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv',
  sourceFamilyAudit: 'analysis/indy-nxt-discovery/output/deep_dive/tables/indy_nxt_source_family_audit.csv',
  careerSeriesSummary: 'analysis/career-parity/output/tables/career_series_result_summary.csv',
  careerMetricParity: 'analysis/career-parity/output/tables/career_metric_family_parity.csv',
  careerResultConversion: 'analysis/career-parity/output/tables/career_result_conversion.csv'
};

const requiredSourceKeys = Object.keys(sources);

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some((value) => value !== ''))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
};

const readCsv = (relativePath) => parseCsv(readText(relativePath));

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const textOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const percentOrNull = (value) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 1000) / 10;
};

const byNumericDesc = (field) => (left, right) => (numberOrNull(right[field]) ?? -Infinity) - (numberOrNull(left[field]) ?? -Infinity);
const byNumericAsc = (field) => (left, right) => (numberOrNull(left[field]) ?? Infinity) - (numberOrNull(right[field]) ?? Infinity);

const sourceRef = (key, note) => ({ key, path: sources[key], note });

const coveredByUiFixtures = (contract) => /live-readiness hardening fixtures/i.test(contract);
const uiFixtureCoverageText = (contract) => contract.replace(/^Remaining\s+/i, 'Static UI fixture coverage: ');

const summarizeArtifact = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = fs.statSync(absolutePath);
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

const rowForSession = (rows, sessionId) => rows.find((row) => row.sessionId === sessionId) ?? null;

const debriefCard = ({ debrief, lapDynamics, incidents, team, championship, label }) => ({
  label,
  sessionId: debrief.sessionId,
  raceLabel: debrief.raceLabel,
  seasonYear: numberOrNull(debrief.seasonYear),
  track: {
    name: debrief.trackName,
    type: debrief.trackType
  },
  teamName: debrief.teamName,
  result: {
    startPosition: numberOrNull(debrief.startPosition),
    finishPosition: numberOrNull(debrief.finishPosition),
    positionGain: numberOrNull(debrief.positionGain),
    finishPercentile: percentOrNull(debrief.finishPercentile),
    points: numberOrNull(championship?.bryceRacePoints),
    cumulativePoints: numberOrNull(championship?.bryceCumulativePoints),
    standingRank: numberOrNull(championship?.bryceStandingRank)
  },
  analysis: {
    archetype: debrief.archetype,
    paceIndex: percentOrNull(debrief.paceIndex),
    conversionPercentileDelta: percentOrNull(debrief.conversionPercentileDelta),
    weatherContext: debrief.weatherContext,
    chaosExposureIndex: percentOrNull(debrief.chaosExposureIndex)
  },
  lapStory: lapDynamics
    ? {
        sourceState: lapDynamics.sourceState,
        brycePrimaryStory: lapDynamics.brycePrimaryStory,
        bryceNetLapChartGain: numberOrNull(lapDynamics.bryceNetLapChartGain),
        bryceBestRunningPosition: numberOrNull(lapDynamics.bryceBestRunningPosition),
        bryceWorstRunningPosition: numberOrNull(lapDynamics.bryceWorstRunningPosition),
        fieldLapDrivers: numberOrNull(lapDynamics.fieldLapDrivers),
        topLapChartMover: lapDynamics.topLapChartMover,
        topLapChartGain: numberOrNull(lapDynamics.topLapChartGain),
        mostVolatileDriver: lapDynamics.mostVolatileDriver,
        mostVolatileScore: numberOrNull(lapDynamics.mostVolatileScore)
      }
    : null,
  incidentPenalty: incidents
    ? {
        sourceState: incidents.sourceState,
        sessionIncidentCount: numberOrNull(incidents.sessionIncidentCount),
        sessionPenaltyCount: numberOrNull(incidents.sessionPenaltyCount),
        bryceIncidentCount: numberOrNull(incidents.bryceIncidentCount),
        brycePenaltyCount: numberOrNull(incidents.brycePenaltyCount),
        bryceIncidentDescriptions: textOrNull(incidents.bryceIncidentDescriptions),
        brycePenaltyDescriptions: textOrNull(incidents.brycePenaltyDescriptions)
      }
    : null,
  teamContext: team
    ? {
        sourceState: team.sourceState,
        teamName: team.teamName,
        teamCars: numberOrNull(team.teamCars),
        teammates: textOrNull(team.teammates),
        teamAverageFinish: numberOrNull(team.teamAverageFinish),
        bryceVsTeamAvgFinish: numberOrNull(team.bryceVsTeamAvgFinish),
        bryceTeamFinishRank: numberOrNull(team.bryceTeamFinishRank),
        caveat: team.statusCaveat
      }
    : null,
  sourceState: debrief.sourceState,
  confidence: debrief.confidence,
  caveat: debrief.caveat,
  sourceRefs: [
    sourceRef('raceDebriefScores', 'Derived race debrief score row.'),
    sourceRef('fullFieldLapDynamicsByRace', 'Official lap-chart-derived race-shape row.'),
    sourceRef('incidentPenaltyContext', 'Official incident/penalty context where imported.'),
    sourceRef('teamContextByRace', 'Descriptive team context only.'),
    sourceRef('championshipProgression', 'Official imported points progression.')
  ]
});

const fixtureCheckedAt = 'fixture';

const buildFixtureTimingRows = ({ state, pointsProfile, timingScenario = 'normal' }) => {
  if (state === 'blocked' && timingScenario !== 'no_bryce_active') return [];
  return Array.from({ length: 25 }, (_, index) => {
    const isBryce = index === 0 && state !== 'wrong_series' && timingScenario !== 'no_bryce_active';
    const baseRow = {
      no: isBryce ? '9' : String(index + 1),
      DriverID: isBryce ? '2143' : String(9000 + index),
      firstName: isBryce ? 'Bryce' : 'Fixture',
      lastName: isBryce ? 'Aron' : `Driver ${index + 1}`,
      rank: String(index + 1),
      runningDriverPoints: '',
      totalDriverPoints: '',
      totalEntrantPoints: ''
    };
    if (pointsProfile === 'full') {
      return {
        ...baseRow,
        runningDriverPoints: String(Math.max(0, 25 - index)),
        totalDriverPoints: String(143 - index),
        totalEntrantPoints: String(160 - index)
      };
    }
    if (pointsProfile === 'partial') {
      return index < 8 ? { ...baseRow, runningDriverPoints: String(Math.max(0, 12 - index)) } : baseRow;
    }
    return baseRow;
  });
};

const buildFixtureHeartbeat = (state, timingScenario = 'normal') =>
  state === 'blocked' && timingScenario !== 'no_bryce_active'
    ? null
    : {
        eventName: state === 'wrong_series' ? '10th Annual Bommarito Automotive Group 500' : 'Grand Prix at Road America Race 1',
        EventID: state === 'wrong_series' ? '709' : '710',
        EventSessionID: state === 'wrong_series' ? '6751' : '6762',
        SessionName: 'Race',
        SessionType: 'Race',
        SessionStatus: state === 'pre_session' ? 'Cold' : state === 'stale' ? 'Green' : 'Green',
        Series: state === 'wrong_series' ? 'I' : 'L',
        currentFlag: state === 'pre_session' ? 'COLD' : 'GREEN',
        lapNumber: state === 'pre_session' ? '0' : '12',
        totalLaps: '20',
        trackName: state === 'wrong_series' ? 'World Wide Technology Raceway' : 'Road America',
        trackType: state === 'wrong_series' ? 'O' : 'R',
        trackLength: state === 'wrong_series' ? '1.25' : '4.048'
      };

const summarizeFixtureHeartbeat = (heartbeat) => ({
  eventName: heartbeat?.eventName ?? null,
  eventId: heartbeat?.EventID ?? null,
  eventSessionId: heartbeat?.EventSessionID ?? null,
  sessionName: heartbeat?.SessionName ?? null,
  sessionType: heartbeat?.SessionType ?? null,
  sessionStatus: heartbeat?.SessionStatus ?? null,
  series: heartbeat?.Series ?? null,
  flag: heartbeat?.currentFlag ?? null,
  lap: numberOrNull(heartbeat?.lapNumber),
  totalLaps: numberOrNull(heartbeat?.totalLaps),
  trackName: heartbeat?.trackName ?? null,
  trackType: heartbeat?.trackType ?? null
});

const compactFixtureTimingRow = (row, heartbeat) => ({
  no: row?.no ?? '',
  firstName: row?.firstName ?? '',
  lastName: row?.lastName ?? '',
  name: `${row?.firstName ?? ''} ${row?.lastName ?? ''}`.trim(),
  team: row?.team ?? 'Fixture Team',
  rank: numberOrNull(row?.rank),
  liveRank: numberOrNull(row?.rank),
  startPosition: numberOrNull(row?.startPosition),
  status: row?.status ?? 'Running',
  comment: row?.comment ?? '',
  gap: row?.gap ?? '',
  liveGap: row?.liveGap ?? '',
  diff: row?.diff ?? '',
  laps: row?.laps ?? heartbeat?.lapNumber ?? '',
  bestLapTime: row?.bestLapTime ?? '',
  lastLapTime: row?.lastLapTime ?? '',
  bestSpeed: numberOrNull(row?.BestSpeed),
  lastSpeed: numberOrNull(row?.LastSpeed),
  averageSpeed: numberOrNull(row?.AverageSpeed),
  passes: numberOrNull(row?.Passes),
  passed: numberOrNull(row?.Passed),
  pitStops: numberOrNull(row?.pitStops),
  lastPitLap: numberOrNull(row?.lastPitLap),
  sincePitLap: numberOrNull(row?.sincePitLap),
  tire: row?.Tire ?? '',
  overtakeRemain: numberOrNull(row?.OverTake_Remain),
  overtakeActive: row?.OverTake_Active ?? '',
  lapDistance: numberOrNull(row?.lapDistance),
  liveDiffAhead: row?.liveDiffAhead ?? '',
  liveDiffBehind: row?.liveDiffBehind ?? '',
  runningDriverPoints: numberOrNull(row?.runningDriverPoints),
  totalDriverPoints: numberOrNull(row?.totalDriverPoints),
  totalEntrantPoints: numberOrNull(row?.totalEntrantPoints),
  bryce: row?.DriverID === '2143'
});

const buildFixtureRaceWeekend = ({ state, sourceState, heartbeat }) => ({
  checkedAt: fixtureCheckedAt,
  eventId: state === 'wrong_series' ? null : heartbeat?.EventID ?? null,
  eventSessionId: state === 'wrong_series' ? null : heartbeat?.EventSessionID ?? null,
  eventName: state === 'wrong_series' ? null : heartbeat?.eventName ?? null,
  sessionName: state === 'wrong_series' ? null : heartbeat?.SessionName ?? null,
  sessionType: state === 'wrong_series' ? null : heartbeat?.SessionType ?? null,
  sessionStatus: state === 'wrong_series' ? null : heartbeat?.SessionStatus ?? null,
  trackName: state === 'wrong_series' ? null : heartbeat?.trackName ?? null,
  trackType: state === 'wrong_series' ? null : heartbeat?.trackType ?? null,
  trackLength: state === 'wrong_series' ? null : numberOrNull(heartbeat?.trackLength),
  flag: state === 'wrong_series' ? null : heartbeat?.currentFlag ?? null,
  lap: state === 'wrong_series' ? null : numberOrNull(heartbeat?.lapNumber),
  totalLaps: state === 'wrong_series' ? null : numberOrNull(heartbeat?.totalLaps),
  startsAt: null,
  estimatedGreenFlag: null,
  endsAt: null,
  timezone: 'America/Chicago',
  broadcastRoute: state === 'wrong_series' ? null : { source: 'fixture', alternates: [], audio: [], international: [] },
  sourceState,
  readiness: state
});

const buildFixtureEndpoints = ({ state, timingRows, bryce, weatherState }) => {
  const timingUnavailable = state === 'blocked' && timingRows.length === 0;
  const timingStale = state === 'stale';
  return [
    {
      id: 'timing',
      role: 'primary_timing',
      series: state === 'wrong_series' ? 'INDYCAR Series' : 'INDY NXT',
      cadence: 'fast',
      ok: !timingUnavailable,
      status: timingUnavailable ? null : 200,
      sourceState: timingUnavailable ? 'error' : timingStale ? 'stale' : 'live',
      readinessState: timingUnavailable ? 'unavailable' : state === 'wrong_series' ? 'wrong_session' : timingStale ? 'stale' : 'available',
      checkedAgeSeconds: timingStale ? 12 : 0,
      modifiedAgeSeconds: timingStale ? 120 : 0,
      freshnessLabel: timingUnavailable ? 'timing unavailable' : timingStale ? 'checked 12s ago; modified 2m ago' : 'checked 0s ago; modified 0s ago',
      sourceSummary: { brycePresent: Boolean(bryce), rows: timingRows.length },
      note: timingUnavailable ? 'Synthetic blocked fixture with no reachable timing rows.' : ''
    },
    {
      id: 'drivers_nxt',
      role: 'driver_identity_profile',
      series: 'INDY NXT',
      cadence: 'medium',
      ok: state !== 'blocked',
      status: state === 'blocked' ? null : 200,
      sourceState: state === 'blocked' ? 'error' : 'live',
      readinessState: state === 'blocked' ? 'unavailable' : 'available',
      checkedAgeSeconds: state === 'blocked' ? null : 0,
      modifiedAgeSeconds: state === 'blocked' ? null : 0,
      freshnessLabel: state === 'blocked' ? 'driver profile unavailable' : 'checked 0s ago; modified 0s ago',
      sourceSummary: { bryceProfilePresent: Boolean(bryce) },
      note: ''
    },
    {
      id: 'weather_live',
      role: 'weather_context',
      series: 'external',
      cadence: 'medium',
      ok: weatherState !== 'error',
      status: weatherState === 'error' ? null : 200,
      sourceState: weatherState,
      readinessState: weatherState === 'live' ? 'available' : weatherState === 'partial' ? 'partial' : 'unavailable',
      checkedAgeSeconds: weatherState === 'error' ? null : 0,
      modifiedAgeSeconds: weatherState === 'error' ? null : 0,
      freshnessLabel: weatherState === 'error' ? 'weather unavailable' : `weather ${weatherState}`,
      sourceSummary: { trackId: 'track_road_america' },
      note: 'Synthetic fixture endpoint for live weather display-state coverage.'
    }
  ];
};

const buildFixtureGates = ({ state, timingRows, bryce, points, weatherState, replayState }) => [
  {
    id: 'timing_reachable',
    state: state === 'blocked' && timingRows.length === 0 ? 'fail' : 'pass',
    summary: state === 'blocked' && timingRows.length === 0 ? 'Race Control timing endpoint is unavailable in this fixture.' : 'Race Control timing endpoint is reachable.'
  },
  {
    id: 'indy_nxt_heartbeat',
    state: state === 'wrong_series' || (state === 'blocked' && timingRows.length === 0) ? 'fail' : 'pass',
    summary: state === 'wrong_series' ? 'Timing heartbeat is not INDY NXT.' : state === 'blocked' && timingRows.length === 0 ? 'Timing heartbeat is unavailable.' : 'Timing heartbeat is INDY NXT-compatible.'
  },
  {
    id: 'bryce_identity',
    state: bryce ? 'pass' : 'fail',
    summary: bryce ? 'Bryce car #9 passed driver-id/name guard.' : 'No guarded Bryce car #9 row is present.'
  },
  {
    id: 'timing_freshness',
    state: state === 'stale' ? 'fail' : state === 'pre_session' ? 'warn' : state === 'blocked' && timingRows.length === 0 ? 'fail' : 'pass',
    summary: state === 'stale' ? 'Timing source is stale in this fixture.' : `Timing fixture has ${timingRows.length} row(s).`
  },
  {
    id: 'enrichment_sources',
    state: state === 'degraded' ? 'warn' : state === 'blocked' ? 'fail' : 'pass',
    summary: state === 'degraded' ? 'One enrichment source is partial in this fixture.' : 'Required enrichment sources are available or not blocking.'
  },
  {
    id: 'points_fields',
    state: ['race_control_live', 'partial'].includes(points.mode) ? 'pass' : 'warn',
    summary: bryce ? 'Race Control points fields inspected for Bryce.' : 'Live Bryce points are unavailable without a guarded Bryce row.'
  },
  {
    id: 'weather',
    state: weatherState === 'live' ? 'pass' : weatherState === 'partial' ? 'warn' : 'fail',
    summary: `Weather source is ${weatherState}.`
  },
  {
    id: 'replay_archive',
    state: replayState === 'ready' ? 'pass' : 'warn',
    summary: `Replay archive is ${replayState}.`
  }
];

const replayCounts = {
  ready: 120,
  tiny: 6,
  empty: 0,
  missing: 0,
  repeated_cold: 6
};

const buildReplayFixture = (replayState, warnings = []) => ({
  available: !['missing'].includes(replayState),
  generatedAt: fixtureCheckedAt,
  archiveState: replayState === 'repeated_cold' ? 'tiny' : replayState,
  count: replayCounts[replayState] ?? 0,
  returned: replayState === 'ready' ? 5 : Math.min(5, replayCounts[replayState] ?? 0),
  selectedCount: replayCounts[replayState] ?? 0,
  sessionKey: replayState === 'missing' ? null : 'fixture-road-america-race-1',
  sessions: replayState === 'missing' ? [] : [{ sessionKey: 'fixture-road-america-race-1', count: replayCounts[replayState] ?? 0, firstCheckedAt: fixtureCheckedAt, lastCheckedAt: fixtureCheckedAt }],
  summary: {
    firstRank: replayState === 'ready' ? 8 : null,
    lastRank: replayState === 'ready' ? 6 : null,
    bestRank: replayState === 'ready' ? 5 : null,
    worstRank: replayState === 'ready' ? 10 : null,
    sourceStateCounts: { live: replayState === 'ready' ? 120 : 0, cold: replayState === 'repeated_cold' ? 6 : 0 }
  },
  rows: replayState === 'ready' ? [{ checkedAt: fixtureCheckedAt, rank: 8, liveRank: 8, laps: '12', sourceState: 'live', flag: 'GREEN' }] : [],
  warnings
});

const buildWeatherFixture = (weatherState) => ({
  schemaVersion: 'live-weather.v1',
  checkedAt: fixtureCheckedAt,
  sourceState: weatherState,
  source: 'NWS API',
  track: { id: 'track_road_america', name: 'Road America', latitude: 43.797, longitude: -87.989 },
  point: '43.7970,-87.9890',
  grid: {
    office: weatherState === 'error' ? null : 'MKX',
    gridX: weatherState === 'error' ? null : 72,
    gridY: weatherState === 'error' ? null : 43,
    forecastZone: weatherState === 'error' ? null : 'fixture-forecast-zone',
    county: weatherState === 'error' ? null : 'fixture-county',
    fireWeatherZone: weatherState === 'error' ? null : 'fixture-fire-weather-zone'
  },
  station: weatherState === 'error' ? null : { id: 'fixture-ketb', url: 'https://api.weather.gov/stations/fixture-ketb' },
  observation:
    weatherState === 'error'
      ? null
      : {
          observedAt: fixtureCheckedAt,
          ambientTempF: 72,
          humidityPct: 58,
          dewPointF: 56,
          windSpeedMph: 9,
          windGustMph: weatherState === 'partial' ? null : 16,
          windDirectionDeg: 220,
          precipitationIn: 0,
          rawCondition: weatherState === 'partial' ? 'partly available' : 'clear'
        },
  forecastHourly:
    weatherState === 'error'
      ? []
      : [{ number: 1, name: 'This Hour', startTime: fixtureCheckedAt, endTime: fixtureCheckedAt, isDaytime: true, temperature: 72, temperatureUnit: 'F', probabilityOfPrecipitationPct: weatherState === 'partial' ? null : 10, dewpointC: 13.3, relativeHumidityPct: 58, windSpeed: '9 mph', windDirection: 'SW', shortForecast: 'Clear', detailedForecast: 'Fixture hourly weather.' }],
  forecast:
    weatherState === 'error'
      ? []
      : [{ number: 1, name: 'Race Day', startTime: fixtureCheckedAt, endTime: fixtureCheckedAt, isDaytime: true, temperature: 72, temperatureUnit: 'F', probabilityOfPrecipitationPct: weatherState === 'partial' ? null : 10, dewpointC: 13.3, relativeHumidityPct: 58, windSpeed: '9 mph', windDirection: 'SW', shortForecast: 'Clear', detailedForecast: 'Fixture daily weather.' }],
  alerts: [],
  probes: [
    { id: 'nws_points', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_observation_stations', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_latest_observation', ok: weatherState === 'live', status: weatherState === 'error' ? null : weatherState === 'partial' ? 503 : 200 },
    { id: 'nws_hourly_forecast', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_forecast', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_alerts', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 }
  ],
  cache: { status: 'fixture', ttlSeconds: 300 },
  warnings: weatherState === 'partial' ? ['One weather probe failed in this fixture.'] : weatherState === 'error' ? ['Weather payload unavailable in this fixture.'] : []
});

const buildLiveFixture = ({ state, severity, reason, history, variant = 'base', pointsProfile = 'none', replayState = 'tiny', replayWarnings = [], weatherState = 'live', timingScenario = 'normal' }) => {
  const timingRows = buildFixtureTimingRows({ state, pointsProfile, timingScenario });
  const bryce = timingRows.find((row) => row.DriverID === '2143') ?? null;
  const points = buildPointsProjectionState({ checkedAt: fixtureCheckedAt, timingRows, bryce, readinessState: state, history });
  const heartbeat = buildFixtureHeartbeat(state, timingScenario);
  const sourceState = state === 'blocked' && timingRows.length === 0 ? 'error' : state === 'stale' ? 'stale' : state === 'pre_session' ? 'cold' : 'live';
  const heartbeatSummary = summarizeFixtureHeartbeat(heartbeat);
  const liveTimingRows = timingRows.slice().sort((left, right) => (numberOrNull(left.rank) ?? 999) - (numberOrNull(right.rank) ?? 999)).map((row) => compactFixtureTimingRow(row, heartbeat));
  const identityGuard = { carNumber: '9', rcDriverId: '2143', matchedBy: bryce ? 'driver_id' : null, seriesOk: state !== 'wrong_series' && sourceState !== 'error' };
  const carNineExists = timingRows.some((row) => String(row?.no ?? '').trim() === '9');
  const bryceWarnings = bryce ? [] : [carNineExists ? 'Car #9 exists in this fixture but failed the Bryce INDY NXT identity guard.' : 'No Bryce timing row is present in this fixture.'];

  return {
    schemaVersion: 'live-readiness.v1',
    checkedAt: fixtureCheckedAt,
    variant,
    state,
    severity,
    reason,
    raceWeekend: buildFixtureRaceWeekend({ state, sourceState, heartbeat }),
    liveTiming: {
      checkedAt: fixtureCheckedAt,
      sourceState,
      rowCount: timingRows.length,
      bryceNo: '9',
      heartbeat: heartbeatSummary,
      rows: liveTimingRows
    },
    bryce: {
      checkedAt: fixtureCheckedAt,
      sourceState,
      readiness: state,
      heartbeat: heartbeatSummary,
      bryce: bryce ? compactFixtureTimingRow(bryce, heartbeat) : null,
      profile: bryce
        ? { driverid: '4959', rc_driver_id: '2143', name: 'Bryce Aron', firstname: 'Bryce', lastname: 'Aron', number: '9', team: 'Chip Ganassi Racing' }
        : null,
      identityGuard,
      broadcastRoute: state === 'wrong_series' ? null : { source: 'fixture', alternates: [], audio: [], international: [] },
      warnings: bryceWarnings
    },
    points,
    weather: buildWeatherFixture(weatherState),
    replay: buildReplayFixture(replayState, replayWarnings),
    sources: {
      checkedAt: fixtureCheckedAt,
      endpoints: buildFixtureEndpoints({ state, timingRows, bryce, weatherState }),
      local: { history: { path: sources.historyBryce } }
    },
    gates: buildFixtureGates({ state, timingRows, bryce, points, weatherState, replayState })
  };
};

const buildPackage = () => {
  for (const key of requiredSourceKeys) {
    const relativePath = sources[key];
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      throw new Error(`Missing UI data source ${key}: ${relativePath}`);
    }
  }

  const manifest = readJson(sources.manifest);
  const uiReadyArtifacts = readJson(sources.uiReadyArtifacts);
  const validationReport = readJson(sources.validationReport);
  const ingestionSummary = readJson(sources.ingestionSummary);
  const coverageMatrix = readJson(sources.coverageMatrix);
  const history = readJson(sources.historyBryce);
  const futureWeekendPrep = readCsv(sources.futureWeekendPrep);
  const raceDebriefs = readCsv(sources.raceDebriefScores);
  const lapDynamics = readCsv(sources.fullFieldLapDynamicsByRace);
  const incidents = readCsv(sources.incidentPenaltyContext);
  const teams = readCsv(sources.teamContextByRace);
  const championship = readCsv(sources.championshipProgression);
  const sourceFamilyAudit = readCsv(sources.sourceFamilyAudit);
  const careerSeriesSummary = readCsv(sources.careerSeriesSummary);
  const careerMetricParity = readCsv(sources.careerMetricParity);
  const careerResultConversion = readCsv(sources.careerResultConversion);

  const roadAmericaEvents = futureWeekendPrep
    .filter((row) => row.trackName === 'Road America')
    .map((row) => ({
      eventId: row.eventId,
      eventName: row.eventName,
      eventStartDate: row.eventStartDate,
      trackName: row.trackName,
      trackType: row.trackType,
      trackLengthMi: numberOrNull(row.trackLengthMi),
      cornerCount: numberOrNull(row.cornerCount),
      sameTrack: {
        raceCount: numberOrNull(row.bryceIndyNxtRacesAtTrack),
        avgFinish: numberOrNull(row.sameTrackAvgFinish),
        avgGain: numberOrNull(row.sameTrackAvgGain),
        top10RatePct: percentOrNull(row.sameTrackTop10Rate)
      },
      trackTypeHistory: {
        avgFinish: numberOrNull(row.trackTypeAvgFinish),
        avgGain: numberOrNull(row.trackTypeAvgGain),
        top10RatePct: percentOrNull(row.trackTypeTop10Rate)
      },
      weatherState: row.weatherState,
      sourceState: row.sourceState
    }));

  const latestChampionshipRow = championship.slice().sort((left, right) => (numberOrNull(right.seasonYear) ?? 0) - (numberOrNull(left.seasonYear) ?? 0) || (numberOrNull(right.roundIndex) ?? 0) - (numberOrNull(left.roundIndex) ?? 0))[0];
  const latestDebrief = rowForSession(raceDebriefs, latestChampionshipRow?.sessionId) ?? raceDebriefs.at(-1);
  const bestDebrief = raceDebriefs.slice().sort(byNumericDesc('finishPercentile'))[0];
  const worstDebrief = raceDebriefs.slice().sort(byNumericAsc('finishPercentile'))[0];
  const debriefRows = [latestDebrief, bestDebrief, worstDebrief].map((debrief, index) =>
    debriefCard({
      debrief,
      lapDynamics: rowForSession(lapDynamics, debrief.sessionId),
      incidents: rowForSession(incidents, debrief.sessionId),
      team: rowForSession(teams, debrief.sessionId),
      championship: rowForSession(championship, debrief.sessionId),
      label: ['latestCompleted', 'bestFinishPercentile', 'lowestFinishPercentile'][index]
    })
  );

  const parityBySeries = careerMetricParity.reduce((acc, row) => {
    acc[row.seriesName] ??= [];
    acc[row.seriesName].push({
      metricFamily: row.metricFamily,
      metricLabel: row.metricLabel,
      parityStatus: row.parityStatus,
      uiUse: row.uiUse,
      caveat: row.caveat,
      sourceRowsOrSessions: numberOrNull(row.sourceRowsOrSessions)
    });
    return acc;
  }, {});

  const sourceInventory = Object.fromEntries(Object.entries(sources).map(([key, relativePath]) => [key, summarizeArtifact(relativePath)]));

  return {
    schemaVersion: 'brycecast.uiDataPackage.v1',
    generatedAt: new Date().toISOString(),
    baselineCommit: manifest.baselineCommit,
    sourceInventory,
    packageRules: [
      'This package hydrates UI-ready data for design/build work; it does not replace canonical career ingestion or live API routes.',
      'Live weather, timing, and points remain runtime API data. Static package values are historical/prep context and fixtures.',
      'Every screen object includes source refs and caveat text for source-drawer wiring.',
      'Visual design may change presentation, but should not change these source, confidence, or availability states in component code.'
    ],
    screens: {
      roadAmericaPrep: {
        title: 'Road America Race Weekend Prep',
        readiness: 'partial',
        events: roadAmericaEvents,
        runtimeApiRequirements: ['/api/readiness', '/api/weather/upcoming', '/api/weather/live?trackId=track_road_america'],
        caveats: [
          'Schedule feed timestamps can lack explicit timezone offsets; polished countdowns need runtime normalization.',
          'Weather is NWS current/forecast context, not official INDY NXT session weather or track temperature.'
        ],
        sourceRefs: [sourceRef('futureWeekendPrep', 'Road America prep inputs from INDY NXT analytics.'), sourceRef('manifest', 'UI metric contract and caveats.')]
      },
      liveCompanionFixtures: {
        title: 'Live Companion Fixture States',
        requiredStates: ['wrong_series', 'pre_session', 'ready', 'degraded', 'stale', 'blocked'],
        requiredVariants: ['base', 'no_bryce_archive_ready', 'no_bryce_archive_missing', 'replay_empty', 'replay_repeated_cold'],
        fixtures: [
          buildLiveFixture({ state: 'wrong_series', severity: 'red', reason: 'Current Race Control feed is not Bryce INDY NXT.', history }),
          buildLiveFixture({ state: 'pre_session', severity: 'amber', reason: 'INDY NXT context exists, but green/yellow live Bryce timing is not active.', history }),
          buildLiveFixture({ state: 'ready', severity: 'green', reason: 'Fresh INDY NXT timing has a guarded Bryce row.', history, pointsProfile: 'full', replayState: 'ready' }),
          buildLiveFixture({ state: 'degraded', severity: 'amber', reason: 'Core timing is usable, but one enrichment source is partial.', history, pointsProfile: 'partial', weatherState: 'partial' }),
          buildLiveFixture({ state: 'stale', severity: 'amber', reason: 'Timing data is too old for live Bryce display.', history, replayState: 'ready' }),
          buildLiveFixture({ state: 'blocked', severity: 'red', reason: 'Required live timing context is unavailable.', history, replayState: 'missing', weatherState: 'error' }),
          buildLiveFixture({ state: 'blocked', variant: 'no_bryce_archive_ready', severity: 'red', reason: 'Active INDY NXT timing is available, but no guarded Bryce car #9 row is present.', history, timingScenario: 'no_bryce_active', replayState: 'ready' }),
          buildLiveFixture({ state: 'blocked', variant: 'no_bryce_archive_missing', severity: 'red', reason: 'Active INDY NXT timing is available, but no guarded Bryce car #9 row is present and no usable archive is available.', history, timingScenario: 'no_bryce_active', replayState: 'missing' }),
          buildLiveFixture({ state: 'pre_session', variant: 'replay_empty', severity: 'amber', reason: 'INDY NXT context exists, but the replay archive is empty.', history, replayState: 'empty' }),
          buildLiveFixture({ state: 'pre_session', variant: 'replay_repeated_cold', severity: 'amber', reason: 'INDY NXT context exists, but replay samples are repeated cold-state rows.', history, replayState: 'repeated_cold', replayWarnings: ['Replay samples are repeated cold-state rows and are not enough for race trend analytics.'] })
        ],
        caveats: [
          'These are synthetic readiness fixtures for design and QA. Runtime truth still comes from /api/readiness.',
          'A green fixture is not proof that live INDY NXT session polling has been rehearsed under race conditions.'
        ],
        sourceRefs: [sourceRef('manifest', 'Live companion metric requirements.'), { key: 'api-readiness', path: '/api/readiness', note: 'Runtime source for live product gate.' }]
      },
      raceDebrief: {
        title: 'INDY NXT Race Debrief Seeds',
        readiness: 'available',
        featuredDebriefs: debriefRows,
        chartFamilies: [
          'outcome KPI strip',
          'qualifying-to-finish slope',
          'lap-position story',
          'incident/penalty chips',
          'team-context ranked dots',
          'source drawer'
        ],
        caveats: ['Derived archetype labels are review aids until approved for public UI copy.'],
        sourceRefs: [sourceRef('raceDebriefScores', 'Race debrief seed rows.'), sourceRef('fullFieldLapDynamicsByRace', 'Lap position story rows.')]
      },
      careerLab: {
        title: 'Career Analytics Lab',
        readiness: 'available',
        seriesSummary: careerSeriesSummary.map((row) => ({
          seriesId: row.seriesId,
          seriesName: row.seriesName,
          raceRows: numberOrNull(row.raceRows),
          avgFinish: numberOrNull(row.avgFinish),
          medianFinish: numberOrNull(row.medianFinish),
          avgGain: numberOrNull(row.avgGain),
          avgFinishPercentile: percentOrNull(row.avgFinishPercentile),
          top5RatePct: percentOrNull(row.top5Rate),
          top10RatePct: percentOrNull(row.top10Rate),
          issueLikeStatusRatePct: percentOrNull(row.issueLikeStatusRate)
        })),
        parityBySeries,
        resultConversionSample: careerResultConversion.slice(0, 25),
        caveats: [
          'Career analytics must use metric-family parity states; older series do not expose INDY NXT-grade depth.',
          'Result-conversion samples are source-bounded historical context, not a universal driver-strength model.'
        ],
        sourceRefs: [sourceRef('careerSeriesSummary', 'Series-level performance rows.'), sourceRef('careerMetricParity', 'Metric parity/source-boundary rows.'), sourceRef('careerResultConversion', 'Cross-series result conversion rows.')]
      },
      sourceOps: {
        title: 'Source Ops Baseline',
        validation: {
          ok: validationReport.ok,
          errorCount: validationReport.errorCount,
          warningCount: validationReport.warningCount,
          issues: validationReport.issues ?? []
        },
        ingestion: {
          generatedAt: ingestionSummary.generatedAt,
          openGapCount: ingestionSummary.openGaps?.length ?? 0,
          priorityGaps: ingestionSummary.priorityGaps ?? []
        },
        coverage: {
          totals: coverageMatrix.totals ?? null,
          indyNxt: coverageMatrix.series?.find?.((series) => series.seriesId === 'series_indy_nxt') ?? null
        },
        historyStanding: history.bryceStanding,
        sourceFamilyAudit: sourceFamilyAudit.slice(0, 50),
        caveats: [
          'Source Ops is a secondary/admin surface; it should not become front-page product clutter.',
          'Validation warnings and preserved gaps are transparency states, not automatic UI blockers.'
        ],
        sourceRefs: [sourceRef('validationReport', 'Canonical validation result.'), sourceRef('ingestionSummary', 'Canonical ingestion summary.'), sourceRef('coverageMatrix', 'Canonical coverage matrix.'), sourceRef('historyBryce', 'Compact Bryce history and standings baseline.'), sourceRef('sourceFamilyAudit', 'INDY NXT source family audit rows.')]
      }
    },
    uiReadyArtifacts: {
      stableArtifacts: uiReadyArtifacts.stableArtifacts,
      exploratoryOrDeferred: uiReadyArtifacts.exploratoryOrDeferred,
      missingBackendContracts: uiReadyArtifacts.missingBackendContracts ?? [],
      uiFixtureCoverage: [
        ...(uiReadyArtifacts.uiFixtureCoverage ?? []),
        ...(uiReadyArtifacts.missingBackendContracts ?? []).filter(coveredByUiFixtures).map(uiFixtureCoverageText)
      ]
    }
  };
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const dataPackage = buildPackage();
fs.writeFileSync(outputPath, `${JSON.stringify(dataPackage, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, outputPath), schemaVersion: dataPackage.schemaVersion }, null, 2));
