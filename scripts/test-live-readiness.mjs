import assert from 'node:assert/strict';

import {
  buildPointsProjectionState,
  buildReadinessPayloadFromParts,
  compactTimingRowForReadiness,
  replayArchiveState
} from './api-server.mjs';

const checkedAt = '2026-06-16T18:00:00.000Z';

const heartbeat = (overrides = {}) => ({
  eventName: 'Grand Prix at Road America Race 1',
  EventID: '710',
  EventSessionID: '6762',
  SessionName: 'Race',
  SessionType: 'Race',
  SessionStatus: 'Green',
  Series: 'L',
  currentFlag: 'GREEN',
  lapNumber: '12',
  totalLaps: '20',
  trackName: 'Road America',
  trackType: 'R',
  trackLength: '',
  ...overrides
});

const timingRow = (overrides = {}) => ({
  no: '9',
  DriverID: '2143',
  firstName: 'Bryce',
  lastName: 'Aron',
  team: 'Chip Ganassi Racing',
  rank: '6',
  liveRank: '6',
  startPosition: '8',
  status: 'Running',
  comment: '',
  gap: '+3.221',
  liveGap: '+3.221',
  diff: '',
  laps: '12',
  bestLapTime: '1:58.100',
  lastLapTime: '1:59.000',
  BestSpeed: '122.4',
  LastSpeed: '121.8',
  AverageSpeed: '',
  Passes: '0',
  Passed: '',
  pitStops: '',
  lastPitLap: '',
  sincePitLap: '',
  Tire: '',
  OverTake_Remain: '',
  OverTake_Active: '',
  lapDistance: '',
  liveDiffAhead: '',
  liveDiffBehind: '',
  runningDriverPoints: '',
  totalDriverPoints: '',
  totalEntrantPoints: '',
  ...overrides
});

const sourceReport = (timingReadinessState = 'available') => ({
  checkedAt,
  local: {
    sqlite: { exists: false, freshnessLabel: 'not found' }
  },
  endpoints: [
    {
      id: 'timing',
      role: 'primary_timing',
      sourceState: timingReadinessState === 'available' ? 'live' : 'stale',
      readinessState: timingReadinessState,
      ok: true,
      checkedAgeSeconds: 0,
      modifiedAgeSeconds: 0,
      freshnessLabel: 'checked 0s ago',
      sourceSummary: { brycePresent: timingReadinessState === 'available' }
    },
    {
      id: 'drivers_nxt',
      role: 'driver_identity_profile',
      sourceState: 'live',
      readinessState: 'available',
      ok: true,
      checkedAgeSeconds: 0,
      modifiedAgeSeconds: 0,
      freshnessLabel: 'checked 0s ago'
    }
  ]
});

const history = {
  bryceStanding: { rank: 14, points: 131 },
  points: [{ race: 'WWTR Race 2', points: 20 }]
};

const replay = {
  available: true,
  archiveState: 'ready',
  count: 20,
  returned: 0,
  selectedCount: 0,
  sessionKey: null,
  sessions: [],
  summary: {},
  rows: [],
  warnings: []
};

const weather = {
  schemaVersion: 'live-weather.v1',
  checkedAt,
  sourceState: 'live',
  track: { id: 'track_road_america', name: 'Road America' },
  probes: [{ ok: true, label: 'fixture' }],
  cache: { status: 'miss' }
};

const baseParts = (overrides = {}) => ({
  checkedAt,
  heartbeat: heartbeat(),
  timingRows: [timingRow()],
  bryce: timingRow(),
  bryceProfile: { firstname: 'Bryce', lastname: 'Aron', radiofrequency: '468.0000' },
  broadcastRoute: { source: 'trackactivity', alternates: [], audio: [], international: [] },
  sourceState: 'live',
  sourceReport: sourceReport(),
  history,
  replay,
  weather,
  ...overrides
});

const ready = buildReadinessPayloadFromParts(baseParts());
assert.equal(ready.schemaVersion, 'live-readiness.v1');
assert.equal(ready.state, 'ready');
assert.equal(ready.points.mode, 'historical_fallback');
assert.equal(ready.points.bryce.historicalDriverPoints, 131);
assert.equal(ready.points.bryce.historicalRank, 14);
assert.equal(ready.points.officialModelAvailable, false);
assert.equal(ready.liveTiming.rows[0].passed, null, 'missing numeric source values stay null');
assert.equal(ready.liveTiming.rows[0].passes, 0, 'source-present zero stays zero');
assert.equal(ready.liveTiming.rows[0].firstName, 'Bryce', 'compact timing rows preserve firstName for UI contracts');
assert.equal(ready.liveTiming.rows[0].lastName, 'Aron', 'compact timing rows preserve lastName for UI contracts');

const pendingEnrichment = buildReadinessPayloadFromParts(
  baseParts({
    bryceProfile: { firstname: 'Bryce', lastname: 'Aron', radiofrequency: '' },
    broadcastRoute: {
      eventId: '710',
      sessionId: '6762',
      eventName: 'Grand Prix at Road America Race 1',
      sessionName: 'Race',
      sessionType: 'Race',
      startsAt: '',
      alternates: [],
      audio: [],
      international: [],
      source: 'unavailable',
      note: 'Session route feeds are pending.'
    }
  })
);
assert.equal(pendingEnrichment.state, 'degraded', 'active Bryce timing with pending profile/route enrichment should not be ready');

const nonActiveSession = buildReadinessPayloadFromParts(
  baseParts({
    heartbeat: heartbeat({ currentFlag: 'RED', SessionStatus: 'Red', lapNumber: '0' })
  })
);
assert.equal(nonActiveSession.state, 'pre_session', 'guarded Bryce rows should not enter ready until timing is active-running');
assert.equal(nonActiveSession.points.mode, 'historical_fallback');

const unknownFlagWithLap = buildReadinessPayloadFromParts(
  baseParts({
    heartbeat: heartbeat({ currentFlag: '', SessionStatus: '', lapNumber: '7' })
  })
);
assert.equal(unknownFlagWithLap.state, 'pre_session', 'positive laps alone must not prove active live readiness');
assert.equal(unknownFlagWithLap.points.mode, 'historical_fallback');

const wrongSeries = buildReadinessPayloadFromParts(
  baseParts({
    heartbeat: heartbeat({ Series: 'I', eventName: 'Bommarito Automotive Group 500' }),
    timingRows: [timingRow({ DriverID: '9', firstName: 'Scott', lastName: 'Dixon', totalDriverPoints: '0' })],
    bryce: null,
    sourceReport: sourceReport('wrong_session')
  })
);
assert.equal(wrongSeries.state, 'wrong_series');
assert.equal(wrongSeries.raceWeekend.eventId, null, 'wrong-series heartbeat must not populate product raceWeekend identity');
assert.equal(wrongSeries.raceWeekend.trackName, null, 'wrong-series heartbeat must stay out of product raceWeekend track fields');
assert.equal(wrongSeries.liveTiming.heartbeat.eventName, 'Bommarito Automotive Group 500', 'wrong-series heartbeat remains diagnostic timing context');
assert.equal(wrongSeries.bryce.bryce, null);
assert.equal(wrongSeries.bryce.identityGuard.seriesOk, false);
assert.equal(wrongSeries.points.mode, 'historical_fallback');
assert.equal(wrongSeries.points.fieldCoverage.totalDriverPointsRows, 1, 'source-present zero point value counts as populated');

const livePoints = buildPointsProjectionState({
  checkedAt,
  timingRows: [
    timingRow({ runningDriverPoints: '12', totalDriverPoints: '143', totalEntrantPoints: '160' }),
    timingRow({ no: '10', DriverID: '999', firstName: 'Other', lastName: 'Driver', runningDriverPoints: '0', totalDriverPoints: '', totalEntrantPoints: '88' })
  ],
  bryce: timingRow({ runningDriverPoints: '12', totalDriverPoints: '143', totalEntrantPoints: '160' }),
  readinessState: 'ready',
  history
});
assert.equal(livePoints.mode, 'partial', 'sparse competitor point fields must be partial even when Bryce fields are populated');
assert.equal(livePoints.bryce.runningDriverPoints, 12);
assert.equal(livePoints.bryce.totalDriverPoints, 143);
assert.equal(livePoints.bryce.totalEntrantPoints, 160);
assert.equal(livePoints.fieldCoverage.runningDriverPointsRows, 2, 'zero live points are source-present values');
assert.equal(livePoints.fieldCoverage.totalDriverPointsRows, 1);

const fullCoverageLivePoints = buildPointsProjectionState({
  checkedAt,
  timingRows: [
    timingRow({ runningDriverPoints: '12', totalDriverPoints: '143', totalEntrantPoints: '160' }),
    timingRow({ no: '10', DriverID: '999', firstName: 'Other', lastName: 'Driver', runningDriverPoints: '0', totalDriverPoints: '99', totalEntrantPoints: '88' })
  ],
  bryce: timingRow({ runningDriverPoints: '12', totalDriverPoints: '143', totalEntrantPoints: '160' }),
  readinessState: 'ready',
  history
});
assert.equal(fullCoverageLivePoints.mode, 'race_control_live');

const partialPoints = buildPointsProjectionState({
  checkedAt,
  timingRows: [
    timingRow({ runningDriverPoints: '0', totalDriverPoints: '', totalEntrantPoints: '' }),
    timingRow({ no: '10', DriverID: '999', firstName: 'Other', lastName: 'Driver', runningDriverPoints: '', totalDriverPoints: '', totalEntrantPoints: '' })
  ],
  bryce: timingRow({ runningDriverPoints: '0', totalDriverPoints: '', totalEntrantPoints: '' }),
  readinessState: 'ready',
  history
});
assert.equal(partialPoints.mode, 'partial');
assert.equal(partialPoints.bryce.runningDriverPoints, 0);
assert.equal(partialPoints.bryce.totalDriverPoints, null);
assert.equal(partialPoints.bryce.historicalDriverPoints, 131);

const preSessionPoints = buildPointsProjectionState({
  checkedAt,
  timingRows: [timingRow({ runningDriverPoints: '12', totalDriverPoints: '143', totalEntrantPoints: '160' })],
  bryce: timingRow({ runningDriverPoints: '12', totalDriverPoints: '143', totalEntrantPoints: '160' }),
  readinessState: 'pre_session',
  history
});
assert.equal(preSessionPoints.mode, 'historical_fallback', 'pre-session/cold timing must not be labeled live points');
assert.equal(preSessionPoints.source, 'history_compact');
assert.ok(preSessionPoints.warnings.some((warning) => warning.includes('Live Race Control points are unavailable')));

const stalePayload = buildReadinessPayloadFromParts(
  baseParts({
    sourceReport: {
      ...sourceReport(),
      endpoints: sourceReport().endpoints.map((endpoint) =>
        endpoint.id === 'timing'
          ? { ...endpoint, checkedAgeSeconds: 0, modifiedAgeSeconds: 3600, freshnessLabel: 'checked 0s ago; modified 1h ago' }
          : endpoint
      )
    }
  })
);
assert.equal(stalePayload.state, 'stale', 'old upstream timing payloads must not become ready just because the fetch is fresh');
assert.equal(stalePayload.severity, 'amber');

const sameSeriesNoBryce = buildReadinessPayloadFromParts(
  baseParts({
    timingRows: [timingRow({ no: '10', DriverID: '999', firstName: 'Other', lastName: 'Driver' })],
    bryce: null,
    sourceReport: sourceReport('wrong_session')
  })
);
assert.equal(sameSeriesNoBryce.state, 'blocked', 'active INDY NXT timing without Bryce should block live display');
assert.equal(sameSeriesNoBryce.bryce.identityGuard.seriesOk, true);

const coldSameSeriesNoBryce = buildReadinessPayloadFromParts(
  baseParts({
    heartbeat: heartbeat({ currentFlag: 'RED', SessionStatus: 'Red', lapNumber: '0' }),
    timingRows: [timingRow({ no: '10', DriverID: '999', firstName: 'Other', lastName: 'Driver' })],
    bryce: null,
    sourceReport: sourceReport('wrong_session')
  })
);
assert.equal(coldSameSeriesNoBryce.state, 'pre_session', 'cold INDY NXT timing without Bryce remains a pre-session state');
assert.equal(coldSameSeriesNoBryce.bryce.identityGuard.seriesOk, true);

const compactNulls = compactTimingRowForReadiness(
  timingRow({
    rank: '',
    liveRank: '0',
    startPosition: undefined,
    BestSpeed: '',
    pitStops: '0',
    runningDriverPoints: undefined
  }),
  heartbeat()
);
assert.equal(compactNulls.rank, null);
assert.equal(compactNulls.liveRank, 0);
assert.equal(compactNulls.startPosition, null);
assert.equal(compactNulls.bestSpeed, null);
assert.equal(compactNulls.pitStops, 0);
assert.equal(compactNulls.runningDriverPoints, null);

assert.equal(replayArchiveState(true, 20, 20), 'ready', 'replay readiness should use stored sample count, not preview row count');
assert.equal(replayArchiveState(true, 5, 5), 'tiny');
assert.equal(replayArchiveState(true, 0, 0), 'empty');

console.log(JSON.stringify({ ok: true, assertions: 54 }, null, 2));
