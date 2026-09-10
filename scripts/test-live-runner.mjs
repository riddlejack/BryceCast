import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { acquireLiveRunnerLock, createLiveRunner, releaseLiveRunnerLock } from './lib/live-runner-core.mjs';

const iso = (ms) => new Date(ms).toISOString();

const baseHeartbeat = (overrides = {}) => ({
  eventName: 'Mid-Ohio Sports Car Course',
  EventID: '9001',
  EventSessionID: '9101',
  SessionName: 'Race 1',
  SessionType: 'Race',
  SessionStatus: 'Green',
  Series: 'L',
  currentFlag: 'GREEN',
  lapNumber: '1',
  totalLaps: '35',
  trackName: 'Mid-Ohio',
  trackType: 'R',
  trackLength: '2.258',
  ...overrides
});

const bryceRow = (overrides = {}) => ({
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
  gap: '+1.223',
  liveGap: '+1.223',
  diff: '',
  laps: '1',
  bestLapTime: '',
  bestLap: '',
  lastLapTime: '',
  BestSpeed: '',
  LastSpeed: '',
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

const resultFor = (endpoint, payload, fetchedAt) => ({
  ...endpoint,
  ok: true,
  status: 200,
  contentType: 'application/json',
  lastModified: fetchedAt,
  etag: null,
  bytes: Buffer.byteLength(JSON.stringify(payload)),
  fetchedAt,
  payload,
  error: null
});

const failureFor = (endpoint, message, fetchedAt) => ({
  ...endpoint,
  ok: false,
  status: 0,
  contentType: null,
  lastModified: null,
  etag: null,
  bytes: 0,
  fetchedAt,
  payload: null,
  error: message
});

const trackActivityPayload = (startMs) => ({
  trackactivity: {
    event: [
      {
        eventid: '9001',
        eventname: 'Mid-Ohio Sports Car Course',
        sessions: {
          session: [
            {
              sessionid: '9101',
              sessionlabel: 'Race 1',
              sessiontype: 'Race',
              startdatetime: iso(startMs).replace(/Z$/, ''),
              enddatetime: iso(startMs + 60 * 60 * 1000).replace(/Z$/, ''),
              estimatedgreenflag: iso(startMs + 5 * 60 * 1000).replace(/Z$/, '')
            }
          ]
        }
      }
    ]
  }
});

const schedulePayload = (startMs) => ({
  schedule: {
    race: [
      {
        eventid: '9001',
        name: 'Mid-Ohio Sports Car Course',
        tv: { listing: { datetime: iso(startMs).replace(/Z$/, ''), channel: 'FS1' } }
      }
    ]
  }
});

const driversPayload = {
  drivers: {
    driver: [
      {
        firstname: 'Bryce',
        lastname: 'Aron',
        driverid: '4959',
        rc_driver_id: '2143',
        radiofrequency: '468.0000'
      }
    ]
  }
};

const configPayload = { track_map_url: 'https://example.test/mid-ohio.svg' };

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const makeTempRoot = async () => mkdtemp(join(tmpdir(), 'brycecast-live-runner-test-'));

async function testPhaseMachineStatusRawAndIdentityGuard() {
  const root = await makeTempRoot();
  let nowMs = Date.parse('2026-07-04T16:15:00.000Z');
  const startMs = nowMs + 35 * 60 * 1000;
  let timingCalls = 0;
  const endpointCalls = [];

  const fetchEndpoint = async (endpoint) => {
    endpointCalls.push(endpoint.id);
    const fetchedAt = iso(nowMs);
    if (endpoint.id === 'schedule_nxt') return resultFor(endpoint, schedulePayload(startMs), fetchedAt);
    if (endpoint.id === 'trackactivity_nxt') return resultFor(endpoint, trackActivityPayload(startMs), fetchedAt);
    if (endpoint.id === 'drivers_nxt') return resultFor(endpoint, driversPayload, fetchedAt);
    if (endpoint.id === 'config') return resultFor(endpoint, configPayload, fetchedAt);
    if (endpoint.id === 'timing') {
      timingCalls += 1;
      if (timingCalls === 1) {
        return resultFor(
          endpoint,
          { timing_results: { heartbeat: baseHeartbeat({ currentFlag: 'GREEN', SessionStatus: 'Green', lapNumber: '1' }), Item: [bryceRow()] } },
          fetchedAt
        );
      }
      return resultFor(
        endpoint,
        { timing_results: { heartbeat: baseHeartbeat({ currentFlag: 'COLD', SessionStatus: 'Complete', lapNumber: '35' }), Item: [bryceRow({ rank: '5', laps: '35' })] } },
        fetchedAt
      );
    }
    return failureFor(endpoint, `Unexpected endpoint ${endpoint.id}`, fetchedAt);
  };

  const runner = createLiveRunner({
    root,
    fetchEndpoint,
    processBudgetProvider: async () => ({ checkedAt: iso(nowMs), effectiveProcessLimit: 1000, userProcessCount: 100, spareProcessSlots: 900, critical: false }),
    nowMs: () => nowMs,
    sleep: async (ms) => {
      nowMs += Math.min(ms, 1000);
    },
    pid: 4242,
    cooldownMs: 1,
    idlePollMs: 1,
    armedPollMs: 1,
    livePollMs: 1,
    enrichmentPollMs: 1,
    raw: true
  });

  await runner.run({ maxIterations: 3 });

  const statusPath = join(root, 'data/live/live-runner-status.json');
  const eventsPath = join(root, 'data/live/live-runner-events.jsonl');
  const latestPath = join(root, 'data/live/latest-snapshot.json');
  const publicLatestPath = join(root, 'public/data/live-snapshot.json');
  const lockPath = join(root, 'data/live/live-runner.lock');
  const rawDir = join(root, 'data/live/raw');

  const status = await readJson(statusPath);
  assert.equal(status.pid, 4242);
  assert.equal(status.phase, 'IDLE', 'runner should return to IDLE after cooldown when no same-day upcoming session is pending');
  assert.equal(status.currentSession.eventId, '9001');
  assert.equal(status.currentSession.eventSessionId, '9101');
  assert.equal(status.rowCounts.snapshots, 2, 'live and cooldown timing samples should be persisted');
  assert.equal(status.latestBryce.rank, 5);
  assert.equal(status.latestBryce.lap, '35');
  assert.equal(status.latestBryce.flag, 'COLD');
  assert.equal(status.processBudget.spareProcessSlots, 900);

  const tmpNames = await readdir(join(root, 'data/live'));
  assert(!tmpNames.some((name) => name.includes('live-runner-status') && name.endsWith('.tmp')), 'status writes should not leave temp files behind');

  const events = (await readFile(eventsPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.filter((event) => event.type === 'phase_transition').map((event) => `${event.from}->${event.to}`),
    ['IDLE->LIVE', 'LIVE->COOLDOWN', 'COOLDOWN->IDLE']
  );

  const latest = await readJson(latestPath);
  const publicLatest = await readJson(publicLatestPath);
  assert.equal(latest.bryce.rank, 5);
  assert.deepEqual(publicLatest, latest, 'public latest snapshot should mirror data latest snapshot');

  const rawFiles = await readdir(rawDir);
  assert.equal(rawFiles.length, 1, 'raw capture should rotate per session');
  const rawText = await readFile(join(rawDir, rawFiles[0]), 'utf8');
  assert(rawText.includes('"EventSessionID":"9101"'), 'raw timing capture should include the live session payload');

  await assert.rejects(stat(lockPath), /ENOENT/, 'bounded runner should release its lock on exit');
  assert(endpointCalls.includes('schedule_nxt'), 'IDLE should inspect schedule hints');
  assert(endpointCalls.includes('trackactivity_nxt'), 'IDLE should inspect track activity hints');
  assert(endpointCalls.includes('timing'), 'ARMED/LIVE should inspect timing');

  const wrongRoot = await makeTempRoot();
  let wrongNowMs = Date.parse('2026-07-04T16:45:00.000Z');
  const wrongFetcher = async (endpoint) => {
    const fetchedAt = iso(wrongNowMs);
    if (endpoint.id === 'schedule_nxt') return resultFor(endpoint, schedulePayload(wrongNowMs + 30 * 60 * 1000), fetchedAt);
    if (endpoint.id === 'trackactivity_nxt') return resultFor(endpoint, trackActivityPayload(wrongNowMs + 30 * 60 * 1000), fetchedAt);
    if (endpoint.id === 'timing') {
      return resultFor(
        endpoint,
        {
          timing_results: {
            heartbeat: baseHeartbeat({ Series: 'I', eventName: 'NTT INDYCAR wrong series', currentFlag: 'GREEN', SessionStatus: 'Green' }),
            Item: [bryceRow({ DriverID: '9', firstName: 'Scott', lastName: 'Dixon' })]
          }
        },
        fetchedAt
      );
    }
    return resultFor(endpoint, endpoint.id === 'drivers_nxt' ? driversPayload : endpoint.id === 'config' ? configPayload : {}, fetchedAt);
  };
  const wrongRunner = createLiveRunner({
    root: wrongRoot,
    fetchEndpoint: wrongFetcher,
    processBudgetProvider: async () => ({ checkedAt: iso(wrongNowMs), effectiveProcessLimit: 1000, userProcessCount: 100, spareProcessSlots: 900, critical: false }),
    nowMs: () => wrongNowMs,
    sleep: async (ms) => {
      wrongNowMs += Math.min(ms, 1000);
    },
    pid: 4343,
    idlePollMs: 1,
    armedPollMs: 1,
    livePollMs: 1,
    enrichmentPollMs: 1
  });
  await wrongRunner.run({ maxIterations: 2 });
  const wrongStatus = await readJson(join(wrongRoot, 'data/live/live-runner-status.json'));
  assert.notEqual(wrongStatus.phase, 'LIVE', 'top-series car #9 collision must not arm live capture');
  assert.equal(wrongStatus.latestBryce.rank, null, 'wrong-series car #9 must not be recorded as Bryce');
  assert.equal(wrongStatus.rowCounts.bryceSamples, 0);

  await rm(root, { recursive: true, force: true });
  await rm(wrongRoot, { recursive: true, force: true });
}

async function testIdleDiscoversUnscheduledLiveNxtSession() {
  const root = await makeTempRoot();
  let nowMs = Date.parse('2026-07-02T17:30:00.000Z');
  const futureScheduleMs = Date.parse('2026-07-03T18:00:00.000Z');
  const endpointCalls = [];

  const fetchEndpoint = async (endpoint) => {
    endpointCalls.push(endpoint.id);
    const fetchedAt = iso(nowMs);
    if (endpoint.id === 'schedule_nxt') return resultFor(endpoint, schedulePayload(futureScheduleMs), fetchedAt);
    if (endpoint.id === 'trackactivity_nxt') return resultFor(endpoint, trackActivityPayload(futureScheduleMs), fetchedAt);
    if (endpoint.id === 'drivers_nxt') return resultFor(endpoint, driversPayload, fetchedAt);
    if (endpoint.id === 'config') return resultFor(endpoint, configPayload, fetchedAt);
    if (endpoint.id === 'timing') {
      return resultFor(
        endpoint,
        {
          timing_results: {
            heartbeat: baseHeartbeat({
              eventName: 'INDY NXT by Firestone at Milwaukee Mile',
              EventID: '5540',
              EventSessionID: '6888',
              SessionName: 'Test Session 2',
              SessionType: 'Test',
              SessionStatus: 'Green',
              currentFlag: 'GREEN',
              lapNumber: '0',
              totalLaps: ''
            }),
            Item: [
              bryceRow({
                no: '10',
                DriverID: '9999',
                firstName: 'Other',
                lastName: 'Driver',
                rank: '1',
                liveRank: '1'
              })
            ]
          }
        },
        fetchedAt
      );
    }
    return failureFor(endpoint, `Unexpected endpoint ${endpoint.id}`, fetchedAt);
  };

  const runner = createLiveRunner({
    root,
    fetchEndpoint,
    processBudgetProvider: async () => ({ checkedAt: iso(nowMs), effectiveProcessLimit: 1000, userProcessCount: 100, spareProcessSlots: 900, critical: false }),
    nowMs: () => nowMs,
    sleep: async (ms) => {
      nowMs += Math.min(ms, 1000);
    },
    pid: 4444,
    idlePollMs: 1,
    armedPollMs: 1,
    livePollMs: 1,
    enrichmentPollMs: 1,
    raw: true
  });

  await runner.run({ maxIterations: 1 });

  const status = await readJson(join(root, 'data/live/live-runner-status.json'));
  assert.equal(status.phase, 'LIVE', 'IDLE should enter LIVE from an unscheduled live INDY NXT timing heartbeat');
  assert.equal(status.currentSession.eventId, '5540');
  assert.equal(status.currentSession.eventSessionId, '6888');
  assert.equal(status.currentSession.sessionName, 'Test Session 2');
  assert.equal(status.nextSession.eventId, '9001', 'future scheduled session should remain visible while unscheduled timing is captured');
  assert.equal(status.rowCounts.snapshots, 1, 'unscheduled live timing should persist a snapshot immediately');
  assert.equal(status.rowCounts.rawTimingPayloads, 1, 'unscheduled live timing should persist the raw timing payload immediately');
  assert.equal(status.rowCounts.bryceSamples, 0, 'no-Bryce test session must not create Bryce samples');
  assert.equal(status.latestBryce.rank, null, 'no-Bryce test session must keep Bryce state empty');
  assert.equal(endpointCalls.filter((id) => id === 'timing').length, 1, 'IDLE should add exactly one timing request to the schedule tick');

  const rawFiles = await readdir(join(root, 'data/live/raw'));
  assert.equal(rawFiles.length, 1);
  const rawText = await readFile(join(root, 'data/live/raw', rawFiles[0]), 'utf8');
  assert(rawText.includes('"EventSessionID":"6888"'), 'raw capture should contain the unscheduled live timing session');

  await rm(root, { recursive: true, force: true });
}

async function testCooldownPromotesBackToBackQualifyingGroup() {
  const root = await makeTempRoot();
  let nowMs = Date.parse('2026-09-05T19:11:20.000Z');
  let timingCalls = 0;
  const fetchEndpoint = async (endpoint) => {
    const fetchedAt = iso(nowMs);
    if (endpoint.id === 'schedule_nxt') return resultFor(endpoint, schedulePayload(nowMs + 60 * 60 * 1000), fetchedAt);
    if (endpoint.id === 'trackactivity_nxt') return resultFor(endpoint, trackActivityPayload(nowMs + 60 * 60 * 1000), fetchedAt);
    if (endpoint.id === 'drivers_nxt') return resultFor(endpoint, driversPayload, fetchedAt);
    if (endpoint.id === 'config') return resultFor(endpoint, configPayload, fetchedAt);
    if (endpoint.id !== 'timing') return failureFor(endpoint, `Unexpected endpoint ${endpoint.id}`, fetchedAt);
    timingCalls += 1;
    const groupOne = baseHeartbeat({
      eventName: 'Grand Prix of Monterey Doubleheader',
      EventID: '5542',
      EventSessionID: '6949',
      SessionName: 'Qualifications - Group 1',
      SessionType: 'Q',
      totalLaps: '',
    });
    const heartbeat = timingCalls === 1
      ? groupOne
      : timingCalls === 2
        ? {...groupOne, currentFlag: 'CHECKERED', SessionStatus: 'CHECKERED'}
        : {...groupOne, EventSessionID: '6950', SessionName: 'Qualifications - Group 2'};
    return resultFor(endpoint, {timing_results: {heartbeat, Item: [bryceRow()]}}, fetchedAt);
  };
  const runner = createLiveRunner({
    root,
    fetchEndpoint,
    processBudgetProvider: async () => ({checkedAt: iso(nowMs), critical: false}),
    nowMs: () => nowMs,
    sleep: async (ms) => { nowMs += ms; },
    idlePollMs: 1,
    livePollMs: 1,
    cooldownPollMs: 15_000,
    cooldownMs: 10 * 60 * 1000,
    enrichmentPollMs: 1,
    pid: 4545,
  });

  await runner.run({maxIterations: 3});
  const status = await readJson(join(root, 'data/live/live-runner-status.json'));
  assert.equal(status.phase, 'LIVE', 'new live EventSessionID must interrupt cooldown immediately');
  assert.equal(status.currentSession.eventId, '5542', 'shared doubleheader event ID remains valid');
  assert.equal(status.currentSession.eventSessionId, '6950', 'Group 2 becomes the active session');
  assert.equal(status.rowCounts.snapshots, 3, 'the first Group 2 frame is persisted during the transition');
  const events = (await readFile(join(root, 'data/live/live-runner-events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert(events.some((event) => event.reason === 'new_live_event_session_during_cooldown'));
  await rm(root, {recursive: true, force: true});
}

async function testLockTakeover() {
  const root = await makeTempRoot();
  const lockPath = join(root, 'data/live/live-runner.lock');
  const staleAt = '2026-07-04T15:00:00.000Z';
  const freshAt = '2026-07-04T15:02:30.000Z';
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ pid: 1111, heartbeatAt: staleAt }, null, 2));

  const staleLock = await acquireLiveRunnerLock({
    lockPath,
    pid: 2222,
    nowMs: () => Date.parse('2026-07-04T15:02:01.000Z'),
    staleMs: 60_000
  });
  assert.equal(staleLock.acquired, true);
  assert.equal(staleLock.takeover, true);
  assert.equal((await readJson(lockPath)).pid, 2222);

  await assert.rejects(
    acquireLiveRunnerLock({
      lockPath,
      pid: 3333,
      nowMs: () => Date.parse(freshAt),
      staleMs: 60_000
    }),
    /live-runner lock is fresh/
  );

  await releaseLiveRunnerLock({ lockPath, pid: 2222 });
  await assert.rejects(stat(lockPath), /ENOENT/);
  await rm(root, { recursive: true, force: true });
}

await testPhaseMachineStatusRawAndIdentityGuard();
await testIdleDiscoversUnscheduledLiveNxtSession();
await testCooldownPromotesBackToBackQualifyingGroup();
await testLockTakeover();

console.log(JSON.stringify({ ok: true, assertions: 48 }, null, 2));
