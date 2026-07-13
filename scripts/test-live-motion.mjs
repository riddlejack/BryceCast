import assert from 'node:assert/strict';
import {
  buildCumulativeLiveBattleFrame,
  isFreshCheckedAt,
  positiveGapSeconds,
  rankChanges,
  resolveStableLabelLanes,
  sortRowsForLiveDisplay,
  stableDriverId,
  stableLabelLane,
  timestampWindowDomain
} from '../src/data/liveMotionModel.ts';
import {
  adaptiveNumericTicks,
  adaptiveTimeTicks,
  appendLiveHistoryPayload,
  battleConnectorGeometry,
  contiguousValueSegments,
  createLiveHistoryState,
  dataDrivenGapDomain,
  liveSessionHistoryForPayload,
  sharedLeaderGapSeries,
  shouldAnimateSampleTransition,
  sourcedGapToLeaderSeconds,
  stableSessionTimeDomain
} from '../src/data/liveHistoryModel.ts';

const row = (driverId, no, liveRank, liveGap, lastName) => ({
  driverId,
  no,
  liveRank,
  rank: liveRank,
  liveGap,
  firstName: lastName === 'Aron' ? 'Bryce' : 'Test',
  lastName,
  status: 'Active',
  bryce: driverId === '2143'
});

const rows = [
  row('100', '10', 10, '0.2000', 'AheadTwo'),
  row('101', '11', 11, '0.3000', 'AheadOne'),
  row('2143', '9', 12, '0.4000', 'Aron'),
  row('103', '13', 13, '0.5000', 'BehindOne'),
  row('104', '14', 14, '0.6000', 'BehindTwo')
];

assert.equal(positiveGapSeconds('0.4321'), 0.4321);
assert.equal(positiveGapSeconds('1:12.0000'), null, 'lap-time strings must not become intervals');
assert.equal(positiveGapSeconds('-0.1'), null, 'negative gaps are invalid');
assert.equal(positiveGapSeconds(''), null, 'missing gaps are invalid');
assert.equal(sourcedGapToLeaderSeconds({ liveRank: 1, diff: '0.0000' }), 0, 'the leader may truthfully be zero seconds behind itself');
assert.equal(sourcedGapToLeaderSeconds({ liveRank: 17, diff: '0.0000' }), null, 'a non-leader zero is a missing sentinel, not a leader coordinate');

const frame = buildCumulativeLiveBattleFrame(rows, rows[2]);
assert.ok(frame);
assert.equal(frame.sourceField, 'liveGap');
assert.equal(frame.ahead?.id, '101');
assert.equal(frame.ahead?.gapSeconds, 0.4);
assert.equal(frame.behind?.id, '103');
assert.equal(frame.behind?.gapSeconds, 0.5);
assert.deepEqual(
  frame.cars.map(({ id, offsetSeconds }) => [id, Number(offsetSeconds.toFixed(4))]).sort(),
  [['100', 0.7], ['101', 0.4], ['103', -0.5], ['104', -1.1]].sort()
);

const missingAhead = rows.map((candidate) => ({ ...candidate }));
missingAhead[2].liveGap = '';
const missingFrame = buildCumulativeLiveBattleFrame(missingAhead, missingAhead[2]);
assert.equal(missingFrame?.ahead, null, 'missing Bryce liveGap pauses the ahead chain');
assert.equal(missingFrame?.cars.some((car) => car.offsetSeconds > 0), false, 'missing intervals never fall back to diff/gap or zero');
assert.equal(missingFrame?.behind?.gapSeconds, 0.5, 'the independently valid side remains available');

const reordered = [rows[1], rows[0], rows[2], rows[4], rows[3]].map((candidate, index) => ({ ...candidate, liveRank: index + 10, rank: index + 10 }));
assert.equal(stableDriverId(reordered[0]), '101');
assert.equal(stableLabelLane('101', 8), stableLabelLane('101', 8), 'label lane is identity-stable');
const collisionLanes = resolveStableLabelLanes([
  { id: '1063', surname: 'Roe', x: 140 },
  { id: '2114', surname: 'Monteiro', x: 122 }
], 8);
assert.notEqual(collisionLanes.get('1063'), collisionLanes.get('2114'), 'nearby labels resolve to separate stable lanes');
assert.deepEqual(
  [...resolveStableLabelLanes([
    { id: '2114', surname: 'Monteiro', x: 122 },
    { id: '1063', surname: 'Roe', x: 140 }
  ], 8)],
  [...collisionLanes],
  'rank or render ordering cannot reshuffle resolved lanes'
);
assert.deepEqual(
  rankChanges(rows, reordered).map((change) => change.id).sort(),
  ['100', '101', '103', '104'].sort(),
  'only sourced rank changes are reported'
);

const firstDomain = timestampWindowDomain(['2026-07-04T17:00:00.000Z', '2026-07-04T17:00:01.000Z']);
const appendedDomain = timestampWindowDomain(['2026-07-04T17:00:00.000Z', '2026-07-04T17:00:01.000Z', '2026-07-04T17:00:02.000Z']);
assert.deepEqual(appendedDomain, firstDomain, 'a new early-window sample must not rescale prior x coordinates');
const slidingDomain = timestampWindowDomain(['2026-07-04T17:00:00.000Z', '2026-07-04T17:06:00.000Z']);
assert.equal(slidingDomain?.endMs - slidingDomain?.startMs, 300_000, 'history uses a constant five-minute time scale');

assert.equal(isFreshCheckedAt('2026-07-04T17:00:00.000Z', Date.parse('2026-07-04T17:00:09.999Z')), true);
assert.equal(isFreshCheckedAt('2026-07-04T17:00:00.000Z', Date.parse('2026-07-04T17:00:10.001Z')), false, 'stale payloads are not motion-eligible');

const connectorAbove = battleConnectorGeometry(24, 82, 10, 6.5);
assert.deepEqual(connectorAbove, { y1: 32, y2: 72.5 }, 'connector clears both the label and dot');
const connectorBelow = battleConnectorGeometry(140, 82, 10, 5);
assert.deepEqual(connectorBelow, { y1: 132, y2: 90 }, 'below-axis connector reverses cleanly');
assert.ok(connectorAbove.y1 < connectorAbove.y2 && connectorBelow.y1 > connectorBelow.y2);

assert.deepEqual(dataDrivenGapDomain([8.1, 8.1, 8.1]), [7.6, 8.6], 'constant data receives honest symmetric breathing room');
const narrowDomain = dataDrivenGapDomain([12.1, 12.4, 12.2]);
assert.ok(narrowDomain[0] <= 11.9 && narrowDomain[1] >= 12.6, 'narrow changes retain explicit padded seconds bounds');
assert.deepEqual(dataDrivenGapDomain([null, null]), null);
assert.ok(adaptiveNumericTicks(narrowDomain, 200).length >= 2);

const eightMinuteDomain = stableSessionTimeDomain(['2026-07-04T17:00:00.000Z', '2026-07-04T17:08:00.000Z']);
assert.equal(eightMinuteDomain.endMs - eightMinuteDomain.startMs, 600_000, 'eight minutes uses a ten-minute bucket, not a crushed hour');
const fiftyMinuteDomain = stableSessionTimeDomain(['2026-07-04T17:00:00.000Z', '2026-07-04T17:50:00.000Z']);
assert.equal(fiftyMinuteDomain.endMs - fiftyMinuteDomain.startMs, 3_600_000, 'full race coverage uses the next honest session bucket');
assert.ok(adaptiveTimeTicks(eightMinuteDomain, 900).length > adaptiveTimeTicks(eightMinuteDomain, 280).length, 'desktop receives more time ticks than mobile');

const payloadAt = (checkedAt, session = '6761', mutate = (value) => value) => {
  const timingRows = mutate(rows.map((candidate) => ({ ...candidate, diff: candidate.driverId === '2143' ? '8.1000' : candidate.liveRank < 12 ? '7.4000' : '8.9000' })));
  return {
    schemaVersion: 'live-readiness.v1', checkedAt, state: 'ready', severity: 'green', reason: 'test',
    raceWeekend: { eventId: '5544', eventSessionId: session },
    liveTiming: { heartbeat: { eventId: '5544', eventSessionId: session, lap: 9, flag: 'GREEN' }, rows: timingRows },
    bryce: { bryce: timingRows.find((candidate) => candidate.bryce) }, points: {}, weather: {}, replay: {}, sources: {}, gates: []
  };
};

let historyState = appendLiveHistoryPayload(createLiveHistoryState(), payloadAt('2026-07-04T17:00:00.000Z'));
let sessionHistory = historyState.sessions['5544-6761'];
assert.equal(sessionHistory.samples.length, 1);
assert.deepEqual(sessionHistory.selectedDrivers.map((driver) => driver.id), ['2143', '101', '103'], 'comparison cohort is Bryce plus initially adjacent identities');
historyState = appendLiveHistoryPayload(historyState, payloadAt('2026-07-04T17:00:01.000Z'));
sessionHistory = historyState.sessions['5544-6761'];
assert.equal(sessionHistory.stats.unchangedValues, 1, 'new arrival with unchanged source values is counted but not motion-eligible');
historyState = appendLiveHistoryPayload(historyState, payloadAt('2026-07-04T17:00:01.000Z'));
assert.equal(historyState.sessions['5544-6761'].samples.length, 2, 'duplicate timestamps never duplicate history');
assert.equal(historyState.sessions['5544-6761'].stats.duplicateTimestamps, 1);
historyState = appendLiveHistoryPayload(historyState, payloadAt('2026-07-04T17:00:00.500Z', '6761', (value) => value.map((candidate) => candidate.driverId === '2143' ? { ...candidate, diff: '8.2000' } : candidate)));
sessionHistory = historyState.sessions['5544-6761'];
assert.deepEqual(sessionHistory.samples.map((sample) => sample.checkedAt), ['2026-07-04T17:00:00.000Z', '2026-07-04T17:00:00.500Z', '2026-07-04T17:00:01.000Z']);
assert.equal(sessionHistory.stats.outOfOrderArrivals, 1, 'late samples are sorted before chart consumption');
const selectedBeforeChange = sessionHistory.selectedDrivers.map((driver) => driver.id);
historyState = appendLiveHistoryPayload(historyState, payloadAt('2026-07-04T17:00:02.000Z', '6761', (value) => value.map((candidate) => candidate.driverId === '100' ? { ...candidate, liveRank: 11 } : candidate.driverId === '101' ? { ...candidate, liveRank: 10 } : candidate)));
sessionHistory = historyState.sessions['5544-6761'];
assert.deepEqual(sessionHistory.selectedDrivers.map((driver) => driver.id), selectedBeforeChange, 'neighbor identities never silently swap after rank churn');
const sharedSeries = sharedLeaderGapSeries(sessionHistory);
assert.ok(Math.abs(sharedSeries.find((series) => series.role === 'bryce').points.at(-1).value - 0.6) < 1e-9, 'Bryce moves on cumulative live-ranked intervals from P1, not a fixed zero baseline');
assert.equal(sharedSeries.length, 3);
const missingIntervalState = appendLiveHistoryPayload(historyState, payloadAt('2026-07-04T17:00:03.000Z', '6761', (value) => value.map((candidate) => candidate.driverId === '101' ? { ...candidate, liveGap: '' } : candidate)));
assert.equal(sharedLeaderGapSeries(missingIntervalState.sessions['5544-6761']).find((series) => series.role === 'bryce').points.at(-1).value, null, 'a missing adjacent interval breaks every downstream leader-relative line');

historyState = appendLiveHistoryPayload(historyState, payloadAt('2026-07-05T13:52:41.000Z', '6760'));
assert.equal(historyState.activeSessionKey, '5544-6760');
assert.equal(historyState.sessions['5544-6760'].samples.length, 1, 'event change starts a clean session history');
assert.equal(historyState.sessions['5544-6761'].samples.length, 4, 'prior session remains isolated instead of leaking into the active chart');
assert.equal(liveSessionHistoryForPayload(historyState, payloadAt('2026-07-05T13:52:42.000Z', '9999')), null, 'a new payload cannot render the prior session while its append effect is pending');

assert.deepEqual(contiguousValueSegments([{ value: 1 }, { value: null }, { value: 2 }, { value: 3 }]).map((segment) => segment.length), [1, 2], 'missing values break lines');
const firstSample = historyState.sessions['5544-6761'].samples[0];
const unchangedSample = historyState.sessions['5544-6761'].samples[2];
const changedSample = historyState.sessions['5544-6761'].samples[3];
assert.equal(shouldAnimateSampleTransition(null, firstSample, false), false, 'first frame never animates from arbitrary geometry');
assert.equal(shouldAnimateSampleTransition(firstSample, unchangedSample, false), false, 'unchanged values stay still');
assert.equal(shouldAnimateSampleTransition(unchangedSample, changedSample, false), true, 'later same-session value changes may animate');
assert.equal(shouldAnimateSampleTransition(unchangedSample, changedSample, true), false, 'reduced motion suppresses coordinate transitions');
assert.equal(shouldAnimateSampleTransition(changedSample, historyState.sessions['5544-6760'].samples[0], false), false, 'session changes never animate across events');

assert.deepEqual(sortRowsForLiveDisplay([rows[4], rows[0], rows[2]]).map((candidate) => candidate.driverId), ['100', '2143', '104']);

console.log(JSON.stringify({ ok: true, assertions: 56, model: 'session-keyed-live-history' }, null, 2));
