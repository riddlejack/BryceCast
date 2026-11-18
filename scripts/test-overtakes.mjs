// Bryce's overtakes are told apart from pit stops, caution reshuffles,
// incidents and flickers of the live order (round 10, November 17, 2026).
//
// Synthetic readings only: nothing here is real timing. The cases are shaped on
// what the 2026 recordings showed (see src/data/overtakeModel.ts): a pass that
// Race Control's count confirms a few seconds later, a car ahead dropping
// behind him on its way to the pits with no count moving and its pit-stop count
// rising later, a swap that flickers back, a reshuffle under yellow, eight cars
// by in two seconds, and a lake-sourced recording with no count at all.
import assert from 'node:assert/strict';
import {
  INCIDENT_BURST,
  bryceMovesOf,
  latestMoveWords,
  passFrameOf,
  raceControlTally,
  readingWords
} from '../src/data/overtakeModel.ts';

const T0 = Date.parse('2030-01-01T12:00:00Z');
const at = (seconds) => T0 + seconds * 1000;

/** A reading: cars in running order, each `[no, name, { passes, passed, pitStops, laps, status }]`. */
const reading = (seconds, flag, cars) =>
  passFrameOf(
    at(seconds),
    flag,
    cars.map(([no, name, extra = {}], index) => ({
      driverId: `d${no}`,
      no,
      lastName: name,
      liveRank: index + 1,
      rank: index + 1,
      status: extra.status ?? 'Active',
      laps: String(extra.laps ?? 1),
      pitStops: extra.pitStops ?? 0,
      passes: 'passes' in extra ? extra.passes : 0,
      passed: 'passed' in extra ? extra.passed : 0,
      bryce: no === '9'
    }))
  );

const B = (extra = {}) => ['9', 'Aron', extra];

// 1. A pass on him, confirmed by the count; then a car ahead pits.
{
  const frames = [
    reading(0, 'GREEN', [['99', 'Rowe'], ['68', 'Correa', { passes: 4 }], B({ passed: 1 }), ['67', 'Fittipaldi']]),
    reading(10, 'GREEN', [['99', 'Rowe'], B({ passed: 1 }), ['68', 'Correa', { passes: 4 }], ['67', 'Fittipaldi']]),
    // Correa by: the live order flips first...
    reading(40, 'GREEN', [['99', 'Rowe'], ['68', 'Correa', { passes: 4 }], B({ passed: 1 }), ['67', 'Fittipaldi']]),
    // ...and Race Control's counts follow at the next loop.
    reading(47, 'GREEN', [['99', 'Rowe'], ['68', 'Correa', { passes: 5 }], B({ passed: 2 }), ['67', 'Fittipaldi']]),
    // Rowe heads for the pits: behind Bryce, no count moves...
    reading(100, 'GREEN', [['68', 'Correa', { passes: 5 }], B({ passed: 2, laps: 2 }), ['67', 'Fittipaldi'], ['99', 'Rowe']]),
    // ...and his pit-stop count rises eleven seconds later.
    reading(111, 'GREEN', [['68', 'Correa', { passes: 5 }], B({ passed: 2, laps: 2 }), ['67', 'Fittipaldi'], ['99', 'Rowe', { pitStops: 1 }]])
  ];
  const result = bryceMovesOf(frames, Number.POSITIVE_INFINITY);
  assert.equal(result.counted, true);
  const byRival = Object.fromEntries(result.moves.map((move) => [`${move.rivalName}@${(move.atMs - T0) / 1000}`, move]));
  // The first frames' swap (Bryce up past Correa at 10 s) has no count behind it: a flicker.
  assert.equal(byRival['Correa@10'].cause, 'unconfirmed');
  assert.equal(byRival['Correa@40'].cause, 'pass');
  assert.equal(byRival['Correa@40'].kind, 'lost');
  assert.equal(byRival['Correa@40'].basis, 'race-control');
  assert.equal(byRival['Rowe@100'].cause, 'pit');
  assert.equal(byRival['Rowe@100'].pitted, 'rival');
  assert.deepEqual(result.passes.map((move) => move.rivalName), ['Correa'], 'only the confirmed pass is a pass');

  assert.equal(latestMoveWords(result.moves, at(50), 2)?.text, '▽ passed by Correa, lap 2');
  assert.equal(latestMoveWords(result.moves, at(50), 2)?.pass, true);
  const afterPit = latestMoveWords(result.moves, at(105), 3);
  assert.equal(afterPit?.text, '▲ up 1 as Rowe pitted, lap 3');
  assert.equal(afterPit?.pass, false, 'a pit stop never reads as a pass');
  assert.equal(afterPit?.tone, 'flat');
  // Long after, nothing recent: the line falls back to the held words.
  assert.equal(latestMoveWords(result.moves, at(105), 9), null);
}

// 2. Live: a swap with no count yet is pending, not a pass and not dropped.
{
  const frames = [
    reading(0, 'GREEN', [['68', 'Correa'], B(), ['67', 'Fittipaldi']]),
    reading(1, 'GREEN', [['68', 'Correa'], ['67', 'Fittipaldi'], B()])
  ];
  const live = bryceMovesOf(frames);
  assert.equal(live.moves[0].cause, 'pending');
  assert.equal(latestMoveWords(live.moves, at(1), 1), null, 'pending says nothing');
  const later = bryceMovesOf([...frames, reading(5, 'GREEN', [['68', 'Correa'], ['67', 'Fittipaldi', { passes: 1 }], B({ passed: 1 })])]);
  assert.equal(later.moves[0].cause, 'pass');
  const stale = bryceMovesOf([...frames, reading(90, 'GREEN', [['68', 'Correa'], ['67', 'Fittipaldi'], B()])]);
  assert.equal(stale.moves[0].cause, 'unconfirmed', 'no count within the minute: not a pass');
}

// 3. Under yellow the order moves, but nobody passed anybody.
{
  const frames = [
    reading(0, 'GREEN', [['10', 'Koolen'], ['29', 'Pierson'], B()]),
    reading(5, 'YELLOW', [B(), ['10', 'Koolen'], ['29', 'Pierson']]),
    reading(9, 'YELLOW', [B({ passes: 2 }), ['10', 'Koolen'], ['29', 'Pierson']])
  ];
  const result = bryceMovesOf(frames, Number.POSITIVE_INFINITY);
  assert.deepEqual(result.moves.map((move) => move.cause), ['caution', 'caution']);
  assert.equal(result.passes.length, 0, 'a count that rises under yellow does not make a caution move a pass');
  assert.equal(latestMoveWords(result.moves, at(9), 1)?.text, '▲ up 2 under the caution, lap 2');
}

// 4. Eight cars by in a second: an incident, not eight overtakes.
{
  const field = ['11', '12', '13', '14', '15', '16', '17', '18'].map((no) => [no, `Car${no}`]);
  const frames = [
    reading(0, 'GREEN', [B(), ...field]),
    reading(1, 'GREEN', [...field, B()]),
    reading(6, 'GREEN', [...field, B({ passed: 8 })])
  ];
  const result = bryceMovesOf(frames, Number.POSITIVE_INFINITY);
  assert.ok(field.length >= INCIDENT_BURST);
  assert.ok(result.moves.every((move) => move.cause === 'incident'));
  assert.equal(result.passes.length, 0);
  assert.equal(latestMoveWords(result.moves, at(6), 1)?.text, '▽ lost 8 places at once, lap 2');
}

// 5. Two passed at one reading read as one line; the count's car goes first.
{
  const frames = [
    reading(0, 'GREEN', [['71', 'Kucharczyk', { passed: 0 }], ['48', 'Abel'], B(), ['12', 'Garcia']]),
    reading(1, 'GREEN', [B(), ['12', 'Garcia'], ['71', 'Kucharczyk'], ['48', 'Abel']]),
    reading(9, 'GREEN', [B({ passes: 2 }), ['12', 'Garcia'], ['71', 'Kucharczyk', { passed: 1 }], ['48', 'Abel', { passed: 1 }]])
  ];
  const result = bryceMovesOf(frames, Number.POSITIVE_INFINITY);
  assert.deepEqual(result.passes.map((move) => move.rivalName).sort(), ['Abel', 'Kucharczyk']);
  assert.equal(latestMoveWords(result.moves, at(9), 1)?.text, '▲ passed Kucharczyk and Abel, lap 2');
  assert.equal(readingWords(result.passes, { glyph: false })?.text, 'passed Kucharczyk and Abel');
}

// 6. One count rise, two candidates: the car whose own count moved is named.
{
  const frames = [
    reading(0, 'GREEN', [['99', 'Rowe'], ['67', 'Fittipaldi'], B()]),
    reading(1, 'GREEN', [['67', 'Fittipaldi'], B(), ['99', 'Rowe']]),
    reading(2, 'GREEN', [B(), ['67', 'Fittipaldi'], ['99', 'Rowe']]),
    reading(20, 'GREEN', [B({ passes: 1 }), ['67', 'Fittipaldi'], ['99', 'Rowe', { passed: 1 }]])
  ];
  const result = bryceMovesOf(frames, Number.POSITIVE_INFINITY);
  assert.deepEqual(result.passes.map((move) => move.rivalName), ['Rowe']);
}

// 7. A recording without Race Control's count: the order alone, carefully.
{
  const none = { passes: null, passed: null, pitStops: null };
  const frames = [
    reading(0, 'GREEN', [['20', 'Nannini', none], B(none), ['14', 'de Tullio', none], ['30', 'Far', none]]),
    reading(90, 'GREEN', [B({ ...none, laps: 2 }), ['20', 'Nannini', none], ['14', 'de Tullio', none], ['30', 'Far', none]]),
    reading(180, 'GREEN', [B({ ...none, laps: 3 }), ['20', 'Nannini', none], ['14', 'de Tullio', none], ['30', 'Far', none]])
  ];
  const result = bryceMovesOf(frames, Number.POSITIVE_INFINITY);
  assert.equal(result.counted, false);
  assert.equal(result.passes.length, 1);
  assert.equal(result.passes[0].basis, 'order');
  // A swap the next reading undoes is not a pass.
  const flicker = bryceMovesOf([frames[0], frames[1], reading(180, 'GREEN', [['20', 'Nannini', none], B(none), ['14', 'de Tullio', none]])], Number.POSITIVE_INFINITY);
  assert.equal(flicker.moves.find((move) => move.kind === 'made')?.cause, 'unconfirmed');
}

// 8. Before the green nothing is a move; the tally reads Race Control's count.
{
  const frames = [reading(0, 'WARM', [B(), ['10', 'Koolen']]), reading(5, 'WARM', [['10', 'Koolen'], B()])];
  assert.equal(bryceMovesOf(frames).moves.length, 0);
  assert.deepEqual(raceControlTally([{ bryce: true, passes: 2, passed: 1 }]), { made: 2, lost: 1 });
  assert.equal(raceControlTally([{ bryce: true, passes: null, passed: '' }]), null);
}

console.log('overtakes: ok');
