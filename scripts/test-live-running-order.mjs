import assert from 'node:assert/strict';
import {
  RUNNING_ORDER_HOVER_RADIUS_PX,
  RUNNING_ORDER_WINDOW_MS,
  detectBryceRunningOrderCrossings,
  fullFieldRunningOrderSeries,
  lastRunningOrderChange,
  nearestRunningOrderSegment,
  resolveRunningOrderLadder,
  runningOrderCautionSpans,
  runningOrderDomainFor,
  runningOrderFrameForSample,
  runningOrderGapWords,
  runningOrderPointSegments,
  runningOrderProximityStyle,
  runningOrderTimeDomain
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

console.log(JSON.stringify({
  ok: true,
  assertions: 37,
  model: 'official-rank-space-running-order',
  regressions: ['lapped-upstream-appends', 't+10-now-edge', 't+60-now-edge']
}, null, 2));
