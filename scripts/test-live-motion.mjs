import assert from 'node:assert/strict';
import {
  advanceBattleAxis,
  BATTLE_AXIS_LADDER,
  BATTLE_AXIS_REVERSAL_PERSISTENCE,
  battleAxisExtentSeconds,
  battleAxisFitStep,
  buildCumulativeLiveBattleFrame,
  createBattleAxisState,
  isFreshCheckedAt,
  nextBattleAxisStep,
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
import {
  bestLapDeltaWords,
  buildBestLapDeltas,
  parseLapTimeSeconds,
  resolveLiveSessionKind,
  sessionRankCaption
} from '../src/data/liveSessionModel.ts';

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

/* ---------- Brief P: the battle axis breathes ---------- */

assert.deepEqual([...BATTLE_AXIS_LADDER], [1, 2, 4, 8], 'the quantized ladder is the spec: ±1s, ±2s, ±4s, ±8s');

const offsets = (values) => values.map((offsetSeconds) => ({ offsetSeconds }));
assert.equal(battleAxisExtentSeconds(offsets([0.4, -0.7])), 0.7, 'extent is the widest nearest-car offset');
assert.equal(battleAxisExtentSeconds(offsets([0.4, 1.1, 6.9, -0.7])), 1.1, 'a third car ahead does not vote — only the nearest two per side');
assert.equal(battleAxisExtentSeconds(offsets([12, -0.5])), 0.5, 'a car beyond the top rung can never render, so it never holds the frame wide');
assert.equal(battleAxisExtentSeconds(offsets([9.5, -8.5])), null, 'nothing fittable means no content vote');
assert.equal(battleAxisExtentSeconds([]), null, 'no rivals, no vote');

assert.equal(battleAxisFitStep(0.7), 1, 'a 0.7s pack fits the ±1s rung at 70%');
assert.equal(battleAxisFitStep(0.85), 2, 'over 80% of a rung climbs to the next — landings stay inside the up-trigger');
assert.equal(battleAxisFitStep(3.1), 4);
assert.equal(battleAxisFitStep(7.9), 8, 'the top rung takes whatever remains');
assert.equal(battleAxisFitStep(null), 4, 'no content defaults to the familiar ±4s');

assert.equal(nextBattleAxisStep(4, 2.4).breach, null, 'occupancy 60% sits inside the hysteresis band — no rescale');
assert.equal(nextBattleAxisStep(4, 2.4).changed, false);
assert.equal(nextBattleAxisStep(4, 3.7).breach, 'high', 'occupancy above 90% breaches high');
assert.equal(nextBattleAxisStep(4, 3.7).step, 8, 'a high breach climbs exactly one rung');
assert.equal(nextBattleAxisStep(8, 1.2).step, 4, 'a low breach descends exactly one rung, even when the fit target is further down');
assert.equal(nextBattleAxisStep(8, 3.8).changed, false, 'a low breach whose content cannot fit the lower rung holds — the anti-wobble guard');
assert.equal(nextBattleAxisStep(8, 3.8).breach, 'low', 'the held breach is still reported for the transition log');
assert.equal(nextBattleAxisStep(1, 0.2).changed, false, 'the ladder floor holds the tightest frame');
assert.equal(nextBattleAxisStep(8, 60).changed, false, 'the ladder ceiling holds the widest frame');
assert.equal(nextBattleAxisStep(4, null).changed, false, 'absence of content never rescales');

// The wobble trap that breaks naive threshold-following: content sitting just
// past a rung boundary. Up-breach at ±2s must NOT be followed by a down-move
// at ±4s for the same content.
const wobbleTrap = nextBattleAxisStep(2, 1.81);
assert.equal(wobbleTrap.step, 4, 'occupancy 90.5% climbs to ±4s');
assert.equal(nextBattleAxisStep(4, 1.81).changed, false, 'the same content at ±4s (45%) breaches low but holds — no oscillation');

// The stateful reducer: median smoothing plus breach persistence.
let axisState = createBattleAxisState(0.6);
assert.equal(axisState.step, 1, 'a fresh axis snaps to the best fit without motion');
let advanced = advanceBattleAxis(axisState, 7.5);
assert.equal(advanced.decision.changed, false, 'one spiky sample cannot move the frame (median of recent polls)');
advanced = advanceBattleAxis(advanced.state, 7.5);
advanced = advanceBattleAxis(advanced.state, 7.5);
assert.equal(advanced.decision.changed, false, 'two polls of sustained breach are still short of persistence');
advanced = advanceBattleAxis(advanced.state, 7.5);
assert.equal(advanced.decision.changed, true, 'sustained breach moves the frame after the persistence window');
assert.equal(advanced.decision.step, 2, 'and only one rung per move');
const upState = advanced.state;
assert.equal(upState.lastMove, 'up');
let reversal = advanceBattleAxis(upState, 0.2);
for (let index = 0; index < BATTLE_AXIS_REVERSAL_PERSISTENCE - 2; index += 1) reversal = advanceBattleAxis(reversal.state, 0.2);
assert.equal(reversal.decision.changed, false, 'reversing the last move needs long evidence — no A→B→A across consecutive polls, by construction');

// --- Session-aware live mode: practice / qualifying vs race (task #23) ---
// Session kind comes from the SOURCED payload's Race Control SessionType, never
// the clock. Anything not clearly practice/qualifying stays race — zero
// regression for a real race whose type field is missing or unusual.
const withType = (sessionType, sessionName = '') => ({ liveTiming: { heartbeat: { sessionType, sessionName } }, raceWeekend: {} });
assert.equal(resolveLiveSessionKind(withType('R')), 'race', 'SessionType R is a race');
assert.equal(resolveLiveSessionKind(withType('P')), 'practice', 'SessionType P is practice');
assert.equal(resolveLiveSessionKind(withType('Q')), 'qualifying', 'SessionType Q is qualifying');
assert.equal(resolveLiveSessionKind(withType('W')), 'practice', 'warm-up runs to a practice grammar');
assert.equal(resolveLiveSessionKind(withType('X')), 'race', 'an unknown type never strips a race of its race modules');
assert.equal(resolveLiveSessionKind(withType('', 'Practice 2')), 'practice', 'name falls back only when type is empty');
assert.equal(resolveLiveSessionKind(withType('', 'Qualifying')), 'qualifying', 'name resolves qualifying');
assert.equal(resolveLiveSessionKind(withType('', 'Race')), 'race', 'a named race stays a race');
assert.equal(resolveLiveSessionKind(null), 'race', 'no payload defaults to the untouched race path');
assert.equal(resolveLiveSessionKind({ liveTiming: {}, raceWeekend: { sessionType: 'P' } }), 'practice', 'raceWeekend carries the type when the heartbeat lacks it');
assert.equal(sessionRankCaption('race'), 'running position');
assert.equal(sessionRankCaption('practice'), 'best-lap order');
assert.equal(sessionRankCaption('qualifying'), 'best-lap order');

const near = (value, target) => Math.abs(value - target) < 1e-6;
assert.ok(near(parseLapTimeSeconds('1:05.139'), 65.139), 'M:SS.mmm parses to seconds');
assert.ok(near(parseLapTimeSeconds('58.421'), 58.421), 'a bare seconds string parses');
assert.ok(near(parseLapTimeSeconds('1:02:03.5'), 3723.5), 'H:MM:SS parses');
assert.equal(parseLapTimeSeconds(''), null, 'empty string is not zero');
assert.equal(parseLapTimeSeconds('—'), null, 'a dash is not a lap time');
assert.equal(parseLapTimeSeconds('0'), null, 'a non-positive time never votes');

const lapRow = (no, lastName, team, bestLapTime, bryce = false) => ({ driverId: no, no, firstName: '', lastName, name: lastName, team, bestLapTime, bryce });
const deltas = buildBestLapDeltas([
  lapRow('5', 'One', 'Andretti Global', '1:04.500'),
  lapRow('9', 'Aron', 'Chip Ganassi Racing', '1:04.900', true),
  lapRow('8', 'Mate', 'Chip Ganassi Racing', '1:05.100'),
  lapRow('3', 'NoLap', 'HMD', '') // no best lap — must not vote
]);
assert.ok(deltas, 'best-lap deltas build from sourced best-lap times');
assert.equal(deltas.leader.carNo, '5', 'the fastest best lap is the leader');
assert.equal(deltas.bryceIsFastest, false, 'Bryce is not the session best here');
assert.ok(near(deltas.offSessionBestSeconds, 0.4), 'Bryce sits 0.4s off the session best');
assert.equal(deltas.teammates.length, 1, 'only same-team cars with a best lap are teammates');
assert.equal(deltas.teammates[0].entry.carNo, '8');
assert.ok(near(deltas.teammates[0].bryceAheadSeconds, 0.2), 'Bryce is 0.2s ahead of his teammate');

const bryceFastest = buildBestLapDeltas([
  lapRow('9', 'Aron', 'Chip Ganassi Racing', '1:04.100', true),
  lapRow('5', 'One', 'Andretti Global', '1:04.500')
]);
assert.equal(bryceFastest.bryceIsFastest, true, 'Bryce leads when his best lap is fastest');
assert.equal(bryceFastest.offSessionBestSeconds, null, 'no off-the-best gap when Bryce owns the best lap');
assert.equal(buildBestLapDeltas([]), null, 'no rows, no comparison');

assert.equal(bestLapDeltaWords(0.3), '0.30s ahead', 'positive reads ahead, Bryce-first');
assert.equal(bestLapDeltaWords(-0.15), '0.15s behind', 'negative reads behind');
assert.equal(bestLapDeltaWords(0), 'level', 'a dead heat reads level, never signed zero');

console.log(JSON.stringify({ ok: true, assertions: 116, model: 'session-keyed-live-history + session-aware-live' }, null, 2));
