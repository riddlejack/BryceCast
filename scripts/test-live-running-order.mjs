import assert from 'node:assert/strict';
import {
  RUNNING_ORDER_HOVER_RADIUS_PX,
  RUNNING_ORDER_WINDOW_MS,
  bestLapGapWords,
  detectBryceRunningOrderCrossings,
  fullFieldRunningOrderSeries,
  lastRunningOrderChange,
  nearestRunningOrderSegment,
  orderGapWords,
  resolveRunningOrderLadder,
  runningOrderCautionSpans,
  runningOrderDomainFor,
  runningOrderFrameForSample,
  runningOrderGapWords,
  runningOrderIdentityStyle,
  runningOrderPointSegments,
  runningOrderProximityStyle,
  runningOrderGapThresholdMs,
  runningOrderTimeDomain,
  sampleGapThresholdMs
} from '../src/data/liveRunningOrderModel.ts';
import { appendLiveHistoryPayload, createLiveHistoryState } from '../src/data/liveHistoryModel.ts';

const baseMs = Date.parse('2026-07-04T17:20:00.000Z');
const row = (driverId, no, liveRank, liveGap, lastName, extras = {}) => ({
  driverId,
  no,
  liveRank,
  rank: liveRank,
  liveGap,
  lastName,
  firstName: driverId === '2143' ? 'Bryce' : 'Test',
  startPosition: liveRank,
  status: 'Active',
  bryce: driverId === '2143',
  ...extras
});
const field = (bryceRank = 3, rivalRank = 2, extras = {}) => [
  row('leader', '1', 1, '0', 'Leader'),
  row('rival', '7', rivalRank, '1.0', 'Allaer', extras.rival),
  row('2143', '9', bryceRank, '0.6', 'Aron', extras.bryce),
  row('tail', '20', 4, '1.3', 'Tail', extras.tail),
  row('deep', '21', 5, '0.9', 'Deep')
].sort((left, right) => left.liveRank - right.liveRank || left.driverId.localeCompare(right.driverId));
const payloadAt = (seconds, lap, rows, flag = 'GREEN', session = '6761') => ({
  schemaVersion: 'live-readiness.v1',
  checkedAt: new Date(baseMs + seconds * 1_000).toISOString(),
  state: 'ready',
  severity: 'green',
  reason: 'test',
  raceWeekend: { eventId: '5544', eventSessionId: session },
  liveTiming: { heartbeat: { eventId: '5544', eventSessionId: session, lapNumber: lap, currentFlag: flag }, rows },
  bryce: {},
  points: {},
  weather: {},
  replay: {},
  sources: {},
  gates: []
});

const historyFrom = (seconds, rowsFor = () => field(), flagFor = () => 'GREEN') => {
  let state = createLiveHistoryState();
  seconds.forEach((second, index) => {
    state = appendLiveHistoryPayload(state, payloadAt(second, 10 + Math.floor(index / 4), rowsFor(index), flagFor(index)), 1_000);
  });
  return state.sessions['5544-6761'];
};

const history = historyFrom(
  Array.from({ length: 13 }, (_, index) => index * 5),
  (index) => field(index >= 10 ? 2 : 3, index >= 10 ? 3 : 2)
);
const frame = runningOrderFrameForSample(history.samples[0]);
assert.deepEqual(frame.map((entry) => [entry.id, entry.rank]), [
  ['leader', 1], ['rival', 2], ['2143', 3], ['tail', 4], ['deep', 5]
], 'the y coordinate is the official integer running rank');
assert.equal(frame.find((entry) => entry.id === 'rival').startPosition, 2, 'official starting position is retained as a stable visual-identity seed');

assert.deepEqual(runningOrderIdentityStyle('rival', 1), { name: 'solid', dashArray: null });
assert.deepEqual(runningOrderIdentityStyle('rival', 2), { name: 'long-dash', dashArray: '10 4' });
assert.deepEqual(runningOrderIdentityStyle('rival', 4), { name: 'dotted', dashArray: '1 4' });
assert.deepEqual(runningOrderIdentityStyle('rival', null), runningOrderIdentityStyle('rival', null), 'DriverID fallback is deterministic');
assert.notDeepEqual(runningOrderIdentityStyle('rival', 2), runningOrderIdentityStyle('rival', 3), 'neighboring grid positions receive different neutral rhythms');
assert.notDeepEqual(runningOrderIdentityStyle('taylor', 10), runningOrderIdentityStyle('roe', 22), 'rotating grid blocks avoid a repeated rhythm for common twelve-place reshuffles');
assert.equal(fullFieldRunningOrderSeries(history).find((entry) => entry.id === 'rival').startPosition, 2, 'the first sourced grid position keeps the visual identity stable through later rank changes');

const lappedHistory = historyFrom([0, 1, 2, 3], () => field(3, 2, {
  rival: { laps: 9, diff: '1 lap', status: 'Running' },
  bryce: { laps: 10 }
}));
const lappedSeries = fullFieldRunningOrderSeries(lappedHistory).find((entry) => entry.id === 'rival');
assert.equal(lappedSeries.points.length, 4, 'history keeps appending while a lapped car is upstream of Bryce');
assert.ok(lappedSeries.points.every((point) => point.rank === 2 && point.breakBefore === false), 'lapped status never erases an official rank');

const startup10 = historyFrom([0, 5, 10]);
const startup60 = historyFrom(Array.from({ length: 13 }, (_, index) => index * 5));
const domain10 = runningOrderTimeDomain(startup10, startup10.samples.at(-1).checkedAt);
const domain60 = runningOrderTimeDomain(startup60, startup60.samples.at(-1).checkedAt);
assert.equal(domain10.endMs, startup10.samples.at(-1).checkedAtMs);
assert.equal(domain10.endMs - domain10.startMs, 10_000, 'at t+10 the chart grows to the real now edge without a reserved five-minute gulf');
assert.equal(domain10.growing, true);
assert.equal(domain60.endMs - domain60.startMs, 60_000, 'at t+60 the chart still grows to the real now edge without reserved space');
assert.equal(domain60.growing, true);
const mature = historyFrom(Array.from({ length: 63 }, (_, index) => index * 5));
const matureDomain = runningOrderTimeDomain(mature, mature.samples.at(-1).checkedAt);
assert.equal(matureDomain.endMs - matureDomain.startMs, RUNNING_ORDER_WINDOW_MS, 'the mature chart is an exact trailing five-minute window');

const latestByDriver = fullFieldRunningOrderSeries(startup60).map((entry) => entry.points.at(-1).checkedAtMs);
assert.ok(latestByDriver.every((checkedAtMs) => checkedAtMs === domain60.endMs), 'all currently published lines terminate at the one shared replay/source now');
const waitingClockMs = startup10.samples.at(-1).checkedAtMs + 16_000;
const waitingDomain = runningOrderTimeDomain(startup10, new Date(waitingClockMs).toISOString());
assert.equal(waitingDomain.waiting, true);
assert.equal(waitingDomain.endMs, waitingClockMs, 'a missing ordering poll advances only the shared clock and exposes waiting state');

const gapHistory = historyFrom([0, 1, 2, 8]);
const gapSeries = fullFieldRunningOrderSeries(gapHistory);
assert.ok(gapSeries.every((entry) => entry.points[3].breakBefore), 'one missing-order cadence gap breaks every line');
assert.ok(gapSeries.every((entry) => runningOrderPointSegments(entry.points).length === 2), 'no line bridges the missing ordering interval');

assert.deepEqual(runningOrderDomainFor(18, 22), { lower: 15, upper: 21, center: 18 }, 'seven whole rank lanes center on Bryce');
assert.deepEqual(runningOrderDomainFor(2, 22), { lower: 1, upper: 7, center: 4 }, 'the seven-lane camera clamps at the front of the field');
assert.deepEqual(runningOrderDomainFor(21, 22), { lower: 16, upper: 22, center: 19 }, 'the seven-lane camera clamps at the back of the field');
assert.deepEqual(runningOrderProximityStyle(1), { strokeWidth: 2, opacity: 0.85 });
assert.deepEqual(runningOrderProximityStyle(3), { strokeWidth: 1.5, opacity: 0.5 });
assert.deepEqual(runningOrderProximityStyle(4), { strokeWidth: 1, opacity: 0.3 });
assert.deepEqual(runningOrderProximityStyle(1, true), { strokeWidth: 1, opacity: 0.3 }, 'edge treatment wins over proximity');

const crossings = detectBryceRunningOrderCrossings(history);
assert.equal(crossings.length, 1);
assert.equal(crossings[0].rivalName, 'Allaer');
assert.equal(crossings[0].direction, 'ahead_of');
assert.equal(crossings[0].lap, 12, 'the crossing is sourced from the observed whole-rank step');
assert.deepEqual(lastRunningOrderChange(history, '2143'), { text: 'passed Allaer', lap: 12 });

const gaps = runningOrderGapWords(history.samples[0], 'rival');
assert.match(gaps, /^\d+\.\d+s ahead of Bryce$/, 'gap wording is spatial and names Bryce');
assert.equal(runningOrderGapWords(history.samples[0], 'unknown'), '—', 'unavailable corridor intervals stay unavailable');

// Best-lap currency (practice / qualifying). The lanes stay best-lap order, the
// gap compares each car's best lap directly (never the on-track interval that
// would imply track position), and the change verbs read as order moves.
const lapField = () => [
  row('leader', '1', 1, '0', 'Leader', { bestLapTime: '1:04.200' }),
  row('2143', '9', 2, '0.6', 'Aron', { bestLapTime: '1:04.500' }),
  row('rival', '7', 3, '1.0', 'Allaer', { bestLapTime: '1:04.900' })
].sort((left, right) => left.liveRank - right.liveRank || left.driverId.localeCompare(right.driverId));
const lapSample = historyFrom([0, 1], () => lapField()).samples.at(-1);
assert.equal(bestLapGapWords(lapSample, 'leader'), '0.30s ahead of Bryce', 'best-lap gap compares best laps, faster reads ahead of Bryce');
assert.equal(bestLapGapWords(lapSample, 'rival'), '0.40s behind Bryce', 'a slower best lap reads behind Bryce');
assert.equal(bestLapGapWords(lapSample, '2143'), 'Bryce', 'Bryce is never gapped against himself');
assert.equal(orderGapWords(lapSample, 'leader', 'bestLap'), bestLapGapWords(lapSample, 'leader'), 'best-lap currency routes to the best-lap gap');
assert.equal(orderGapWords(history.samples[0], 'rival', 'interval'), runningOrderGapWords(history.samples[0], 'rival'), 'interval currency keeps the sourced on-track gap');
assert.deepEqual(
  lastRunningOrderChange(history, '2143', history.samples.length - 1, 'bestLap'),
  { text: 'moved ahead of Allaer', lap: 12 },
  'best-lap change verbs read as order moves, never on-track overtakes'
);

const collisions = resolveRunningOrderLadder([
  { id: 'b', carNo: '2', name: 'B', bryce: false, rank: 4, status: null },
  { id: 'a', carNo: '1', name: 'A', bryce: false, rank: 4, status: null },
  { id: '2143', carNo: '9', name: 'Aron', bryce: true, rank: 5, status: null }
], { lower: 2, upper: 8, center: 5 });
assert.deepEqual(collisions.slice(0, 2).map((entry) => entry.yOffset), [-4, 4], 'duplicate official lanes receive an exact eight-pixel separation');

const segments = [
  { driverId: 'a', x1: 20, y1: 30, x2: 100, y2: 30, checkedAtMs: 1, rank: 4, kind: 'horizontal' },
  { driverId: 'a', x1: 100, y1: 30, x2: 100, y2: 60, checkedAtMs: 2, rank: 5, kind: 'vertical' }
];
assert.equal(nearestRunningOrderSegment(segments, 50, 42)?.driverId, 'a', 'a real rendered horizontal segment is hoverable within fourteen pixels');
assert.equal(nearestRunningOrderSegment(segments, 112, 48)?.kind, 'vertical', 'the vertical step is part of the hover geometry');
assert.equal(nearestRunningOrderSegment(segments, 50, 45), null, 'empty plot space remains empty beyond fourteen pixels');
assert.equal(RUNNING_ORDER_HOVER_RADIUS_PX, 14);

const cautions = runningOrderCautionSpans(historyFrom([0, 5, 10, 15], () => field(), (index) => index < 3 ? 'YELLOW' : 'GREEN').samples);
assert.deepEqual(cautions, [{ startMs: baseMs, endMs: baseMs + 15_000 }], 'contiguous caution samples become one source-backed span');

/* ---------- replay playback rate: continuity across 1x / 4x / 16x ----------
 *
 * A replaying client polls once a second whatever the speed, so one poll covers
 * `1s x speed` of SOURCE time. That is sparse sampling of a continuous archive,
 * not a hole in it. The live cadence heuristic cannot see the difference — it
 * estimates from the observed deltas and excludes anything past ten seconds, so
 * at 16x its estimate collapsed to the 3s floor and EVERY arriving sample was
 * drawn as an outage; after a speed change its median stayed at the old rate
 * until the new samples outnumbered the old ones (~121 polls, about two minutes
 * of playback), breaking the line the whole time. This is what the owner saw as
 * "it breaks the data connection and there's a big gap in the running order".
 *
 * The replay payload now states the rate it was resolved at, so the bar is set
 * from what the client asked for. Live samples carry no such statement and keep
 * the window-derived rule, which is what still catches a real feed outage. */
const replayPayloadAt = (seconds, speed, rows = field()) => {
  const payload = payloadAt(seconds, 10 + Math.floor(seconds / 60), rows);
  return {
    ...payload,
    replay: {
      simulation: {
        active: true,
        mode: 'archived_replay',
        sessionKey: '5544-6761',
        archiveCheckedAt: payload.checkedAt,
        speed
      }
    }
  };
};

/** Poll once a second of WALL time at `speed`, from `startSecond` of source time. */
const playAt = (state, startSecond, speed, polls, rowsFor = () => field()) => {
  let second = startSecond;
  for (let index = 0; index < polls; index += 1) {
    state = appendLiveHistoryPayload(state, replayPayloadAt(second, speed, rowsFor(second)), 2_000);
    second += speed;
  }
  return { state, second };
};

const bryceLineOf = (session) => fullFieldRunningOrderSeries(session).find((entry) => entry.bryce);
const breaksIn = (session) => bryceLineOf(session).points.filter((point) => point.breakBefore).length;

// Steady 16x: 16s between samples, every one of them continuous archive.
{
  const { state } = playAt(createLiveHistoryState(), 0, 16, 25);
  const session = state.sessions['5544-6761'];
  assert.equal(session.samples.length, 25, 'a 16x replay accumulates a sample per poll');
  assert.equal(breaksIn(session), 0, '16x playback draws one continuous line, not 25 isolated points');
  assert.equal(runningOrderPointSegments(bryceLineOf(session).points).length, 1, '16x playback is a single rank-space segment');
}

// Every speed change, up and down. None of them may break the line, and none of
// them may reset what has already been drawn.
{
  let state = createLiveHistoryState();
  let second = 0;
  const lengths = [];
  for (const speed of [1, 4, 16, 4, 1, 16]) {
    ({ state, second } = playAt(state, second, speed, 20));
    const session = state.sessions['5544-6761'];
    lengths.push(session.samples.length);
    assert.equal(breaksIn(session), 0, `changing to ${speed}x keeps the running order continuous`);
  }
  assert.deepEqual(lengths, [20, 40, 60, 80, 100, 120], 'a speed change never resets the accumulated window');
  const session = state.sessions['5544-6761'];
  assert.equal(runningOrderPointSegments(bryceLineOf(session).points).length, 1, '1x->4x->16x->4x->1x->16x is one unbroken line');
}

// The honest half: a real archive outage must STILL break, at any speed. Six
// minutes of missing source is not sparse sampling by any rate we offer.
{
  let state = createLiveHistoryState();
  let second = 0;
  ({ state, second } = playAt(state, second, 16, 10));
  ({ state } = playAt(state, second + 360, 16, 6));
  const session = state.sessions['5544-6761'];
  assert.equal(breaksIn(session), 1, 'a genuine source outage still breaks the line during a 16x replay');
}

// A live page is untouched: no rate is stated, the existing rule decides.
{
  const liveHistory = historyFrom([0, 1, 2, 3, 4]);
  assert.equal(breaksIn(liveHistory), 0, 'a 1s live feed stays continuous');
  const outage = historyFrom([0, 1, 2, 3, 60]);
  assert.equal(breaksIn(outage), 1, 'a live feed outage still breaks, unchanged');
  assert.equal(
    sampleGapThresholdMs(liveHistory.samples[2], runningOrderGapThresholdMs(liveHistory)),
    runningOrderGapThresholdMs(liveHistory),
    'a live sample falls back to the window-derived threshold'
  );
  assert.equal(sampleGapThresholdMs({ expectedCadenceMs: 16_000 }, 3_000), 48_000, 'a 16x sample is judged against 16x');
  assert.equal(
    sampleGapThresholdMs({ expectedCadenceMs: 1_000 }, 3_000, { expectedCadenceMs: 16_000 }),
    48_000,
    'a speed change is judged against the wider of the two rates that bracket the span'
  );
}

// The handover from a server-supplied frame (a seed breakpoint, or a subsampled
// catch-up point) to the client's own next poll: the server chose that
// timestamp, so the distance to the next poll says nothing about the archive.
{
  let state = createLiveHistoryState();
  ({ state } = playAt(state, 0, 1, 3));
  const session = state.sessions['5544-6761'];
  const seedFrame = (offsetMs, archiveGapBefore) => ({
    ...session.samples[0],
    checkedAt: new Date(baseMs + offsetMs).toISOString(),
    checkedAtMs: baseMs + offsetMs,
    archiveGapBefore
  });
  const withSeed = { ...session, samples: [seedFrame(-120_000, false), seedFrame(-9_000, false), ...session.samples] };
  assert.equal(breaksIn(withSeed), 0, 'a seeded frame hands over to the first live poll without a break');
  const withGap = { ...session, samples: [seedFrame(-120_000, false), seedFrame(-9_000, true), ...session.samples] };
  assert.equal(breaksIn(withGap), 1, 'a server-verified archive gap still breaks, and only that one span');
}

console.log(JSON.stringify({
  ok: true,
  assertions: 62,
  model: 'official-rank-space-running-order',
  regressions: ['lapped-upstream-appends', 't+10-now-edge', 't+60-now-edge', '16x-line-shatter', 'speed-change-gap', 'speed-change-history-reset']
}, null, 2));
