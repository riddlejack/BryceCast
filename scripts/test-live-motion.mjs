import assert from 'node:assert/strict';
import {
  buildCumulativeLiveBattleFrame,
  isFreshCheckedAt,
  positiveGapSeconds,
  rankChanges,
  resolveStableLabelLanes,
  stableDriverId,
  stableLabelLane,
  timestampWindowDomain
} from '../src/data/liveMotionModel.ts';

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

console.log(JSON.stringify({ ok: true, assertions: 24, model: 'cumulative-liveGap' }, null, 2));
