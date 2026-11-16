import assert from 'node:assert/strict';
import {
  LAP_MATCH_TOLERANCE_SECONDS,
  buildFieldPlan,
  dotT,
  lapTimeSeconds,
  matchFieldRows,
  mergeFieldLapLineCrossings,
  mergeObservedLapTimes,
  sectionAt,
  segmentBases
} from '../src/screens/liveSectionLight.ts';

// The live page's car dots (round 6): pure checks on how the other cars are
// joined to the anonymous rows of the race's section times and placed on the
// timing loops. Run on its own (`node scripts/test-live-dots.mjs`) and from
// the end of scripts/test-live-replay.mjs.

const chain = [
  { familyId: 'a', sectionName: 'S1', label: 'S1', startT: 0.0, endT: 0.3 },
  { familyId: 'b', sectionName: 'S2', label: 'S2', startT: 0.3, endT: 0.7 },
  { familyId: 'c', sectionName: 'S3', label: 'S3', startT: 0.7, endT: 0.0 }
];
const bryce = { usable: true, reason: null, chain, laps: new Map(), tiledShare: 1, segmentOf: new Map(), cumulative: new Map() };

// Two other cars, three laps, one array of section times per lap. Row 0:
// clean laps 1 and 3, a pit lap 2 (one section missing). Row 1: clean laps 1-3.
const row0 = [[20.0, 30.0, 27.5], [20.1, null, 27.6], [20.2, 30.2, 27.4]];
const row1 = [[20.5, 20.4, 20.3], [30.5, 30.4, 30.3], [27.25, 27.35, 27.45]];
const pack = {
  totalLaps: 3,
  sections: chain.map((anchor, column) => ({
    sectionName: anchor.sectionName,
    kind: 'measured',
    laps: [],
    otherCarLaps: [row0.map((sections) => sections[column]), row1.map((sections) => sections[column])]
  }))
};

/* ---------- buildFieldPlan ---------- */
const field = buildFieldPlan(pack, bryce);
assert.equal(field.usable, true);
assert.equal(field.rows.length, 2);
assert.deepEqual([...field.rows[0].laps.keys()], [1, 3], 'a lap with a missing section is not a clean lap');
assert.ok(Math.abs(field.rows[0].lapSum.get(1) - 77.5) < 1e-9);
assert.equal(field.rows[0].segmentOf.get(1), 1);
assert.equal(field.rows[0].segmentOf.get(3), 2, 'a lap without a time starts a new segment');
assert.deepEqual([...field.rows[1].laps.keys()], [1, 2, 3]);

const ragged = { ...pack, sections: pack.sections.map((section, index) => (index === 1 ? { ...section, otherCarLaps: section.otherCarLaps.slice(0, 1) } : section)) };
assert.equal(buildFieldPlan(ragged, bryce).usable, false, 'sections that disagree on the row count join no row');
const bare = { ...pack, sections: pack.sections.map((section) => ({ ...section, otherCarLaps: undefined })) };
assert.equal(buildFieldPlan(bare, bryce).usable, false);
assert.equal(buildFieldPlan(pack, { ...bryce, usable: false }).usable, false);

/* ---------- lap times from the feed ---------- */
assert.equal(lapTimeSeconds('1:17.8725'), 77.8725);
assert.equal(lapTimeSeconds('77.5'), 77.5);
assert.equal(lapTimeSeconds(''), null);
assert.equal(lapTimeSeconds('1 lap'), null);
assert.equal(lapTimeSeconds(null), null);

const idOf = (row) => String(row.driverId ?? '');
const sample = (atMs, cars) => ({ checkedAtMs: atMs, bryceId: '9', rows: cars.map(([driverId, laps, lastLapTime]) => ({ driverId, laps, lastLapTime })) });

/* ---------- mergeObservedLapTimes + matchFieldRows ---------- */
const observed = new Map();
assert.equal(
  mergeObservedLapTimes(observed, [
    sample(1_000, [['9', 1, '1:18.000'], ['A', 1, '1:17.500'], ['B', 1, '1:01.200']]),
    sample(2_000, [['9', 1, '1:18.000'], ['A', 1, '1:17.500'], ['B', 1, '1:01.200']])
  ], idOf),
  true
);
assert.equal(mergeObservedLapTimes(observed, [sample(3_000, [['A', 1, '1:17.500']])], idOf), false, 'nothing new');
// Row 1 sums to 61.2 on lap 1; row 0 to 77.5 on lap 1.
let matches = matchFieldRows(field, observed, new Map(), '9');
assert.equal(matches.get('A'), 0);
assert.equal(matches.get('B'), 1);
assert.equal(matches.has('9'), false, 'Bryce is never a field row');

// Two cars with the same lap time: neither is joined on that lap.
const twins = new Map([['C', new Map([[1, 77.5]])], ['D', new Map([[1, 77.5 + LAP_MATCH_TOLERANCE_SECONDS / 2]])]]);
assert.equal(matchFieldRows(field, twins, new Map(), '9').size, 0, 'an ambiguous lap time joins nothing');

// A later lap that contradicts a join drops it.
const contradicted = new Map([['A', new Map([[1, 77.5], [3, 90.0]])], ['B', new Map([[1, 61.2]])]]);
matches = matchFieldRows(field, contradicted, new Map([['A', 0], ['B', 1]]), '9');
assert.equal(matches.has('A'), false);
assert.equal(matches.get('B'), 1);

/* ---------- mergeFieldLapLineCrossings ---------- */
const kept = new Map();
assert.equal(
  mergeFieldLapLineCrossings(kept, [
    sample(10_000, [['A', 0, ''], ['B', 0, '']]),
    sample(11_000, [['A', 1, ''], ['B', 0, '']]),
    sample(12_000, [['B', 0, '']]), // A missing: its bracket breaks
    sample(13_000, [['A', 2, ''], ['B', 1, '']])
  ], idOf),
  true
);
assert.deepEqual(kept.get('A').get(1), { lap: 1, afterMs: 10_000, atOrBeforeMs: 11_000 });
assert.equal(kept.get('A').has(2), false, 'a car missing from a sample has no bracket across the gap');
assert.deepEqual(kept.get('B').get(1), { lap: 1, afterMs: 12_000, atOrBeforeMs: 13_000 });

/* ---------- placing a field car, and the dot modes ---------- */
// Row 1 crossed the line to start lap 1 at ~12.5 s (the end of lap 0).
const rowPlan = field.rows[1];
const bases = segmentBases(rowPlan, [{ lap: 0, afterMs: 12_000, atOrBeforeMs: 13_000 }]);
assert.equal(bases.get(1), 12_500);
const inS2 = sectionAt(rowPlan, bases, 12_500 + 25_000); // 20.5 s into S1, then S2
assert.equal(inS2.index, 1);
assert.equal(inS2.lap, 1);
assert.equal(dotT(inS2, 12_500 + 25_000, 'loops'), 0.3, 'loops: on the loop it last crossed');
const half = inS2.enteredAtMs + (inS2.leavesAtMs - inS2.enteredAtMs) / 2;
assert.ok(Math.abs(dotT(inS2, half, 'glide') - 0.5) < 1e-9, 'glide: by time between the two crossings');
const inS3 = sectionAt(rowPlan, bases, 12_500 + 61_000);
assert.equal(inS3.index, 2);
assert.ok(Math.abs(dotT(inS3, inS3.enteredAtMs + (inS3.leavesAtMs - inS3.enteredAtMs) / 2, 'glide') - 0.85) < 1e-9, 'a span through the line wraps');
assert.equal(dotT(inS3, inS3.leavesAtMs + 5_000, 'glide') <= 1, true);

console.log(JSON.stringify({ ok: true, test: 'live-dots', checks: ['field-plan', 'lap-time-join', 'line-crossings', 'dot-modes'] }));
