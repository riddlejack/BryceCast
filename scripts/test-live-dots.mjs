import assert from 'node:assert/strict';
import { buildSectionLightPlan, lapTimeSeconds } from '../src/screens/liveSectionLight.ts';
import {
  BASE_TRUST_MS,
  CATCH_UP_MS,
  HOLD_SHARE,
  buildPaceModel,
  chainGeometry,
  distanceAhead,
  estimateBases,
  lapPositionAt,
  paceScale,
  placeBryce,
  placeLap,
  sectionOfShare,
  startPrior,
  tightenBases,
  tOfDistance,
  timeAtLapPosition
} from '../src/screens/liveMarker.ts';
import { buildReplayTimeline, flagPeriodsOf, openingCautionFromTimeline, periodAt, timelineFramesOf } from '../src/data/replayTimeline.ts';
import { isNeutralisedFlag } from '../src/data/replayStart.ts';

// The replay's track (round 7): Bryce's marker placed on the clock by time
// between the timing loops, the cars around him by their gap, the race bar's
// lap axis, and the race timeline the replay reads once. Pure checks. Run on
// its own (`node scripts/test-live-dots.mjs`) and from the end of
// scripts/test-live-replay.mjs.

/* ---------- a three-section circuit, four laps ---------- */

const chain = [
  { familyId: 'a', sectionName: 'S1', label: 'S1', startT: 0.0, endT: 0.3, startLoop: 'SF' },
  { familyId: 'b', sectionName: 'S2', label: 'S2', startT: 0.3, endT: 0.7 },
  { familyId: 'c', sectionName: 'S3', label: 'S3', startT: 0.7, endT: 0.0 }
];
const set = { sections: chain };
// Lap 1 under caution (slow), laps 2-4 green. Lap 3 has no section times
// (it is split by his typical shares). Section times tile the lap.
const laps = [
  { lap: 1, time: 45, clean: 0, flag: 'c', sections: [13.5, 18, 13.5] },
  { lap: 2, time: 30, clean: 1, flag: 'g', sections: [9, 12, 9] },
  { lap: 3, time: 31, clean: 1, flag: 'g', sections: null },
  { lap: 4, time: 30, clean: 1, flag: 'g', sections: [9, 12.2, 8.8] }
];
const tuple = (lap, time, clean, flag) => [lap, 0.5, 5, 20, clean, flag, time, 100];
const pack = {
  totalLaps: 4,
  derivedCoverage: 'fully_timed',
  lapTotals: laps.map((lap) => tuple(lap.lap, lap.time, lap.clean, lap.flag)),
  sections: chain.map((anchor, column) => ({
    sectionName: anchor.sectionName,
    kind: 'measured',
    fieldSeconds: [9.4, 12.6, 9.2],
    laps: laps.filter((lap) => lap.sections).map((lap) => tuple(lap.lap, lap.sections[column], lap.clean, lap.flag))
  }))
};
const plan = buildSectionLightPlan(pack, set, null);
assert.equal(plan.usable, true, plan.reason ?? '');
assert.equal(plan.laps.get(2).clean, true);
assert.equal(plan.laps.get(1).flag, 'c');
assert.equal(plan.laps.get(3).sectionSeconds, null, 'a lap without section times does not tile');
assert.equal(plan.segmentOf.get(1), 1);
assert.equal(plan.segmentOf.get(4), 1, 'every lap has a time: one segment');

const geometry = chainGeometry(chain);
assert.deepEqual(geometry.startShare.map((value) => Math.round(value * 100) / 100), [0, 0.3, 0.7]);
const share = sectionOfShare(geometry, 0.5);
assert.equal(share.index, 1);
assert.ok(Math.abs(share.fraction - 0.5) < 1e-9);

/* ---------- the line crossings, from the frames ---------- */

const START = 1_000_000; // his lap-1 start
const bounds = new Map();
// Formation frames read 0 laps: they say nothing of the start itself.
tightenBases(plan, bounds, [{ atMs: START - 60_000, laps: 0 }]);
assert.equal(bounds.get(1).hi, Infinity, 'a frame reading 0 laps never bounds the start from above');
// Frames 2 s apart: 1 lap done at START+46 s, none at START+44 s.
tightenBases(plan, bounds, [
  { atMs: START + 44_000, laps: 0 },
  { atMs: START + 46_000, laps: 1 }
]);
const b = bounds.get(1);
assert.ok(b.lo <= START && START <= b.hi, 'the bounds hold the true start');
assert.ok(b.hi - b.lo <= 2_001, `bounds as tight as the frames: ${b.hi - b.lo}`);
const estimate = estimateBases(bounds, new Map([[1, START + 10_000]])).get(1);
assert.equal(estimate.fromPrior, false, 'tight bounds win over the prior');
assert.ok(Math.abs(estimate.base - START) <= 1_000);
// Wide bounds and a prior: the prior, clamped into them.
const wide = new Map([[1, { lo: START - 20_000, hi: START + 20_000 }]]);
assert.equal(estimateBases(wide, new Map([[1, START + 3_000]])).get(1).base, START + 3_000);
assert.equal(estimateBases(wide, new Map([[1, START + 90_000]])).get(1).base, START + 20_000);
assert.equal(estimateBases(new Map(), new Map([[1, START]])).get(1).spreadMs, Infinity);
assert.ok(BASE_TRUST_MS >= 6_000);
assert.ok(Math.abs(startPrior(START, 10) - (START + 9 * 370)) < 1e-6);
assert.equal(startPrior(null, 3), null);

/* ---------- his pace ---------- */

const paceLaps = [...plan.laps.values()].map((lap) => ({ lap: lap.lap, lapSeconds: lap.lapSeconds, sectionSeconds: lap.sectionSeconds, clean: lap.clean }));
const pace = buildPaceModel(paceLaps, chain.length, { venue: [9.6, 12.4, 9.1], field: [9.4, 12.6, 9.2] });
assert.equal(pace.fallbackBasis, 'venue');
assert.deepEqual(pace.byLap.get(1), [9.6, 12.4, 9.1], 'before his first clean lap: his venue history');
assert.deepEqual(pace.byLap.get(3), [9, 12, 9], 'after lap 2: his own clean lap');
const after4 = pace.byLap.get(5);
assert.ok(Math.abs(after4[1] - 12.1) < 1e-9 && Math.abs(after4[2] - 8.9) < 1e-9, 'the median of his clean laps so far');
assert.equal(buildPaceModel([], 3, { venue: [1, null, 2], field: [9.4, 12.6, 9.2] }).fallbackBasis, 'field');

/* ---------- placing him ---------- */

const model = {
  geometry,
  plan,
  bases: new Map([[1, { base: START, spreadMs: 0, fromPrior: false }]]),
  pace,
  neutralisedAt: (atMs) => atMs < START + 45_000
};
const lap2 = placeLap(model, 2);
assert.deepEqual(lap2.crossings, [START + 45_000, START + 54_000, START + 66_000, START + 75_000]);
const lap3 = placeLap(model, 3);
assert.equal(lap3.measuredSections, false);
assert.ok(Math.abs(lap3.endMs - lap3.startMs - 31_000) < 1e-6, 'an untimed lap is split by his shares, ending on its line crossing');

// Green, mid-section: he moves by time at his expected pace.
const mid = placeBryce(model, START + 45_000 + 4_500);
assert.equal(mid.lap, 2);
assert.equal(mid.index, 0);
assert.ok(Math.abs(mid.fraction - 4.5 / 9.6) < 1e-9, 'his expected section time is the venue median before his first clean lap');
assert.equal(mid.holding, false);

// Slower than expected: he waits just short of the loop.
const slow = { ...model, pace: { ...pace, byLap: new Map([...pace.byLap].map(([lap, times]) => [lap, times.map((value) => value * 0.5)])) } };
const held = placeBryce(slow, START + 45_000 + 8_900);
assert.equal(held.index, 0);
assert.equal(held.holding, true);
assert.ok(Math.abs(held.fraction - HOLD_SHARE) < 1e-9, 'held at 97% until the timing says he crossed');
// The crossing comes: he catches up from the hold over half a second, never backwards.
let previous = -Infinity;
for (let ms = START + 45_000 + 8_900; ms <= START + 45_000 + 9_000 + CATCH_UP_MS + 200; ms += 25) {
  const place = placeBryce(slow, ms);
  assert.ok(place.distance >= previous - 1e-9, `never backwards at ${ms - START}`);
  previous = place.distance;
}
assert.equal(placeBryce(slow, START + 45_000 + 9_000 + CATCH_UP_MS + 1).index, 1);
// Faster than expected: a crossing that comes early pulls him on, never back.
const fast = { ...model, pace: { ...pace, byLap: new Map([...pace.byLap].map(([lap, times]) => [lap, times.map((value) => value * 1.5)])) } };
previous = -Infinity;
for (let ms = START + 45_000; ms <= START + 75_000; ms += 40) {
  const place = placeBryce(fast, ms);
  assert.ok(place.distance >= previous - 1e-9, `never backwards (fast) at ${ms - START}`);
  previous = place.distance;
}

// Under caution his pace is scaled down; on green it is his own.
assert.ok(paceScale(model, 1, START + 1_000) > 1);
assert.equal(paceScale(model, 2, START + 50_000), 1);
const cautionPlace = placeBryce(model, START + 5_000);
assert.ok(cautionPlace.fraction < 5 / 9.6, 'under caution he moves slower than his green pace');

/* ---------- the cars around him ---------- */

const at = START + 45_000 + 4_500;
const here = placeBryce(model, at);
const ahead = distanceAhead(model, here, 1.2, at);
const behind = distanceAhead(model, here, -0.8, at);
assert.ok(ahead > here.distance && behind < here.distance, 'ahead is ahead, behind is behind');
assert.ok(Math.abs(ahead - here.distance - (1.2 / 9.6) * 0.3) < 1e-9, 'distance at his expected pace in his section');
const order = [3, 1.2, 0, -0.8, -2.5].map((seconds) => distanceAhead(model, here, seconds, at));
assert.deepEqual([...order].sort((x, y) => y - x), order, 'the order on the track is the running order');
// A car a whole lap's worth ahead wraps round to his own place.
const lapAhead = distanceAhead(model, here, pace.lapByLap.get(2), at);
const wrapped = Math.abs(tOfDistance(geometry, lapAhead) - tOfDistance(geometry, here.distance));
assert.ok(Math.min(wrapped, 1 - wrapped) < 1e-6, 'a lapped car wraps');

/* ---------- the race bar's lap axis ---------- */

assert.equal(lapPositionAt(model, START - 5_000, 4), 0);
assert.ok(Math.abs(lapPositionAt(model, START + 45_000 + 15_000, 4) - 1.5) < 1e-9);
assert.equal(timeAtLapPosition(model, 1, 4), START + 45_000, 'lap 2 on the bar is his lap-2 line crossing');
assert.ok(Math.abs(lapPositionAt(model, timeAtLapPosition(model, 2.25, 4), 4) - 2.25) < 1e-9);

/* ---------- the race timeline ---------- */

const frame = (iso, lap, flag, rank = 7, bryceLaps = lap) => ({
  checkedAt: iso,
  lap,
  flag,
  rows: [{ liveRank: 1, laps: lap }, { bryce: true, liveRank: rank, laps: bryceLaps }]
});
const response = {
  frames: [
    frame('2026-09-06T16:40:16.200Z', 0, 'GREEN', 10, 0),
    frame('2026-09-06T16:40:22.356Z', 0, 'YELLOW', 9, 0),
    frame('2026-09-06T16:50:14.366Z', 4, 'GREEN', 7, 4),
    frame('2026-09-06T17:10:00.000Z', 20, 'RED', 8, 20),
    frame('2026-09-06T17:15:00.000Z', 20, 'GREEN', 8, 20),
    frame('2026-09-06T17:22:15.351Z', 30, 'CHECKERED', 9, 30)
  ]
};
const frames = timelineFramesOf(response);
assert.equal(frames[0].bryceRank, 10);
assert.equal(frames[1].bryceLaps, 0);
const periods = flagPeriodsOf(frames);
assert.equal(isNeutralisedFlag('CHECKERED'), false, 'CHECKERED spells RED inside it');
assert.equal(isNeutralisedFlag('RED'), true);
assert.deepEqual(
  periods.map((period) => [period.kind, period.fromLap, period.toLap, period.outAtStart]),
  [['caution', 0, 4, false], ['red', 20, 20, false]],
  'the checkered flag is no red flag'
);
const timeline = buildReplayTimeline(frames, true);
assert.equal(timeline.checkeredMs, Date.parse('2026-09-06T17:22:15.351Z'));
assert.equal(periodAt(timeline, Date.parse('2026-09-06T16:45:00Z'))?.kind, 'caution');
assert.equal(periodAt(timeline, Date.parse('2026-09-06T16:55:00Z')), null);
const opening = openingCautionFromTimeline(timeline, { greenMs: Date.parse('2026-09-06T16:40:16.200Z') });
assert.equal(opening.thrownMs, Date.parse('2026-09-06T16:40:22.356Z'), 'Monterey 2026 Race 2: thrown on lap 1');
assert.equal(opening.restartMs, Date.parse('2026-09-06T16:50:14.366Z'));
assert.equal(opening.requests, 0, 'no further reads');
// A feed that opens under the caution (Timing71): out at the start.
const outAtStart = buildReplayTimeline(
  timelineFramesOf({ frames: [frame('2026-05-31T14:37:46Z', 1, 'YELLOW'), frame('2026-05-31T14:48:33Z', 7, 'GREEN')] }),
  true
);
const out = openingCautionFromTimeline(outAtStart, { greenMs: Date.parse('2026-05-31T14:37:46Z') });
assert.equal(out.outAtStart, true);
assert.equal(out.thrownLap, null);
// A caution first thrown on lap 10 is not an opening caution.
const late = buildReplayTimeline(
  timelineFramesOf({ frames: [frame('2026-01-01T10:00:00Z', 0, 'GREEN'), frame('2026-01-01T10:12:00Z', 9, 'YELLOW'), frame('2026-01-01T10:15:00Z', 11, 'GREEN')] }),
  true
);
assert.equal(openingCautionFromTimeline(late, { greenMs: Date.parse('2026-01-01T10:00:00Z') }), null);

/* ---------- lap times from the feed ---------- */
assert.equal(lapTimeSeconds('1:17.8725'), 77.8725);
assert.equal(lapTimeSeconds('77.5'), 77.5);
assert.equal(lapTimeSeconds('1 lap'), null);

console.log(
  JSON.stringify({
    ok: true,
    test: 'live-dots',
    checks: ['plan', 'line-bounds', 'pace', 'hold-and-catch-up', 'never-backwards', 'cars-by-gap', 'lap-axis', 'timeline']
  })
);

/* ---------- a stale lap count from the breakpoints ---------- */
{
  const kept = new Map();
  // True start at START; a breakpoint at START+80 s still reads 0 laps (lap 1
  // ended at START+45 s). Used whole it would push the start past the truth.
  tightenBases(plan, kept, [{ atMs: START + 80_000, laps: 0, upperOnly: true }, { atMs: START + 44_000, laps: 0 }, { atMs: START + 46_000, laps: 1 }]);
  const bound = kept.get(1);
  assert.ok(bound.lo <= START && START <= bound.hi, 'a stale breakpoint never moves the bounds past the truth');
}
console.log(JSON.stringify({ ok: true, test: 'live-dots', checks: ['stale-breakpoint-laps'] }));

/* ---------- from the green to his first crossing: on the run to the line ---------- */
{
  const rolling = { ...model, greenMs: START - 5_000 };
  assert.equal(placeBryce(model, START - 1_000), null, 'without the green, nothing before his first crossing');
  assert.equal(placeBryce(rolling, START - 6_000), null, 'nothing before the green flag');
  const early = placeBryce(rolling, START - 4_000);
  const late = placeBryce(rolling, START - 500);
  assert.ok(early && late, 'drawn from the green');
  assert.equal(late.lap, 0);
  assert.ok(early.distance < late.distance && late.distance < 0, 'closes on the line, short of it');
  const crossed = placeBryce(rolling, START + 10);
  assert.ok(crossed.lap === 1 && crossed.distance >= late.distance, 'then lap 1, forward');
}
console.log(JSON.stringify({ ok: true, test: 'live-dots', checks: ['run-to-the-line'] }));
