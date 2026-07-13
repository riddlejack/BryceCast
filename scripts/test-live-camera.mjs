import assert from 'node:assert/strict';
import {
  CAMERA_WINDOW_SECONDS,
  cameraDomainFor,
  cameraFrameForSample,
  cameraMembership,
  cameraPointSegments,
  cautionSpans,
  clipCameraSeries,
  comparableCameraRow,
  detectBryceCrossings,
  domainFromCenter,
  easedCameraCenter,
  easedCameraCenterForSession,
  fullFieldCameraSeries,
  proximityStyle,
  resolveLadderCollisions,
  rollingMedian,
  threeLapTrend
} from '../src/data/liveCameraModel.ts';
import { appendLiveHistoryPayload, createLiveHistoryState } from '../src/data/liveHistoryModel.ts';

const baseMs = Date.parse('2026-07-04T17:36:00.000Z');
const row = (driverId, no, liveRank, liveGap, lastName, extras = {}) => ({
  driverId, no, liveRank, rank: liveRank, liveGap, lastName,
  firstName: driverId === '2143' ? 'Bryce' : 'Test',
  status: 'Active', bryce: driverId === '2143', ...extras
});
const payloadAt = (seconds, lap, rows, flag = 'GREEN', session = '6761') => ({
  schemaVersion: 'live-readiness.v1', checkedAt: new Date(baseMs + seconds * 1000).toISOString(),
  state: 'ready', severity: 'green', reason: 'test', raceWeekend: { eventId: '5544', eventSessionId: session },
  liveTiming: { heartbeat: { eventId: '5544', eventSessionId: session, lapNumber: lap, currentFlag: flag }, rows },
  bryce: {}, points: {}, weather: {}, replay: {}, sources: {}, gates: []
});
const field = (bryceRank = 3, rivalRank = 2, bryceGap = 1, rivalGap = 1) => {
  const source = [
    row('leader', '1', 1, '0', 'Leader'),
    row('rival', '7', rivalRank, rivalGap, 'Roe'),
    row('2143', '9', bryceRank, bryceGap, 'Aron'),
    row('tail', '20', 4, '2.0', 'Tail')
  ];
  return source.sort((a, b) => a.liveRank - b.liveRank);
};

let state = createLiveHistoryState();
for (let index = 0; index < 12; index += 1) {
  const crossed = index >= 10;
  state = appendLiveHistoryPayload(state, payloadAt(index * 6, 10 + Math.floor(index / 3), field(crossed ? 2 : 3, crossed ? 3 : 2, crossed ? 0.4 : 1, crossed ? 1.6 : 1)));
}
const history = state.sessions['5544-6761'];
assert.equal(history.samples[0].lap, 10, 'production heartbeat names populate lap');
assert.equal(history.samples[0].flag, 'GREEN', 'production heartbeat names populate flag');

const frame = cameraFrameForSample(history.samples[0]);
assert.deepEqual(frame.map((value) => [value.id, value.value]), [['leader', 0], ['rival', 1], ['2143', 2], ['tail', 4]]);
const missing = { ...history.samples[0], rows: field().map((value) => value.driverId === 'rival' ? { ...value, liveGap: '' } : value) };
assert.deepEqual(cameraFrameForSample(missing).map((value) => value.value), [0, null, null, null], 'missing upstream intervals break every downstream line');
const pitted = { ...history.samples[0], rows: field().map((value) => value.driverId === 'rival' ? { ...value, status: 'In Pit', onTrack: false } : value) };
assert.equal(comparableCameraRow(pitted.rows[1]), false);
assert.deepEqual(cameraFrameForSample(pitted).map((value) => value.value), [0, null, null, null], 'pitted cars leave the seconds scale');
const lapped = { ...history.samples[0], rows: field().map((value) => value.driverId === 'tail' ? { ...value, laps: 19, diff: '1 lap' } : { ...value, laps: 20 }) };
assert.equal(cameraFrameForSample(lapped).find((value) => value.id === 'tail').value, null, 'a sourced completed-lap deficit removes a lapped car from the seconds scale');
assert.match(cameraFrameForSample(lapped).find((value) => value.id === 'tail').status, /1 lap down/);

const series = fullFieldCameraSeries(history);
assert.deepEqual(series.map((entry) => entry.id).sort(), ['2143', 'leader', 'rival', 'tail'].sort(), 'full-field stable identities emerge from the shared store');
assert.ok(series.find((entry) => entry.id === '2143').points.every((point) => point.rank !== null));
const clipped = clipCameraSeries(series[0], baseMs + 30_000, baseMs + 60_000);
assert.equal(clipped.points[0].checkedAtMs, baseMs + 24_000, 'clipping retains the predecessor so lines enter through the edge with history');

const median = rollingMedian([
  { checkedAtMs: baseMs, value: 2 }, { checkedAtMs: baseMs + 10_000, value: 8 },
  { checkedAtMs: baseMs + 30_000, value: 4 }, { checkedAtMs: baseMs + 70_000, value: 10 }
], baseMs + 70_000);
assert.equal(median, 7, 'rolling median uses only the trailing sixty seconds');
const domain = cameraDomainFor(15, 16);
assert.equal(domain.upper - domain.lower, CAMERA_WINDOW_SECONDS);
assert.deepEqual(cameraDomainFor(2, 0.2), { lower: 0, upper: 12, center: 6 }, 'leader boundary clamps the twelve-second camera without negative gaps');
assert.equal(cameraDomainFor(15, 21).upper, 21.5, 'Bryce hard-clamps only near the lower visual edge');
assert.equal(easedCameraCenter(10, 20, true), 20, 'reduced motion removes easing');
assert.equal(easedCameraCenter(10, 20, false), 11.6, 'normal camera motion eases toward the target');
assert.equal(easedCameraCenterForSession('old', 'new', 80, 20, false), 20, 'session changes snap to the new target instead of easing across events');
assert.equal(easedCameraCenterForSession('same', 'same', 10, 20, false), 11.6, 'same-session source changes retain gentle camera easing');
assert.deepEqual(domainFromCenter(2), { lower: 0, upper: 12, center: 6 });

const membershipFrame = [
  { id: 'inside', value: 8 }, { id: 'edge', value: 12.3 }, { id: 'outside', value: 13 }, { id: 'missing', value: null }
];
const retained = cameraMembership(membershipFrame, { lower: 0, upper: 12, center: 6 }, new Set(['edge', 'outside']));
assert.deepEqual([...retained].sort(), ['edge', 'inside'], '0.5-second hysteresis prevents edge flicker without retaining distant cars');
assert.deepEqual(proximityStyle(1.5), { strokeWidth: 2, opacity: 0.9 });
assert.deepEqual(proximityStyle(3.5), { strokeWidth: 1.5, opacity: 0.5 });
assert.deepEqual(proximityStyle(3.51), { strokeWidth: 1, opacity: 0.28 });

const leaderBreakPoints = [
  { checkedAtMs: 1, value: 2, breakBefore: false },
  { checkedAtMs: 2, value: 3, breakBefore: true },
  { checkedAtMs: 3, value: 4, breakBefore: false },
  { checkedAtMs: 4, value: null, breakBefore: false }
];
assert.deepEqual(cameraPointSegments(leaderBreakPoints).map((segment) => segment.length), [1, 2], 'leader changes and missing values create explicit absolute-coordinate breaks');

const crossings = detectBryceCrossings(history);
assert.equal(crossings.length, 1);
assert.equal(crossings[0].rivalId, 'rival');
assert.equal(crossings[0].direction, 'ahead_of');
assert.equal(crossings[0].lap, 13, 'observed rank relationship produces the Bryce crossing marker');

const ladder = resolveLadderCollisions([{ id: 'a', desiredY: 20 }, { id: 'b', desiredY: 23 }, { id: 'c', desiredY: 26 }], 10, 70, 18);
assert.ok(ladder.every((label, index) => index === 0 || label.y - ladder[index - 1].y >= 18));
assert.ok(ladder[0].y >= 10 && ladder.at(-1).y <= 70, 'ladder labels stay collision-free inside the plot');
const tallLadder = resolveLadderCollisions([{ id: 'a', desiredY: 40 }, { id: 'b', desiredY: 43 }, { id: 'c', desiredY: 46 }], 20, 130, 32);
assert.ok(tallLadder.every((label, index) => index === 0 || label.y - tallLadder[index - 1].y >= 32), 'two-line role labels receive rendered-height spacing');

const cautionPoints = history.samples.slice(0, 4).map((sample, index) => ({
  checkedAtMs: sample.checkedAtMs, flag: index < 3 ? 'YELLOW' : 'GREEN'
}));
assert.equal(cautionSpans(cautionPoints).length, 1);
const trendPoints = series.find((entry) => entry.id === '2143').points;
assert.notEqual(threeLapTrend(trendPoints, trendPoints.length - 1), null, 'three-lap trend requires and accepts ten sourced samples');
assert.equal(threeLapTrend(trendPoints.slice(0, 9), 8), null, 'fewer than ten samples suppresses the trend');

const leaderChanged = { ...history, samples: history.samples.map((sample, index) => index === 5 ? { ...sample, rows: sample.rows.map((value) => value.driverId === 'leader' ? { ...value, driverId: 'new-leader' } : value) } : sample) };
const changedSeries = fullFieldCameraSeries(leaderChanged).find((entry) => entry.id === '2143');
assert.equal(changedSeries.points[5].breakBefore, true, 'leader identity change never receives a continuity offset under an absolute axis');

console.log(JSON.stringify({ ok: true, assertions: 39, model: 'leader-referenced-broadcast-camera' }, null, 2));
