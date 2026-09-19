// Entirely invented input. Runs the same decoder used by the historical pipeline.
import assert from 'node:assert/strict';
import { parseRaceToolsSession } from '../../analysis/semantic-layer/lib/racetools-semantic.mjs';
const d = '¦';
const record = fields => fields.join(d);
const ticks = seconds => Math.round(seconds * 10_000).toString(16);
const lines = [
  record(['$T', '', '', '', 'Synthetic Circuit', 'road', '', '3', 'S1', '500', 'SF', 'T1', 'S2', '500', 'T1', 'SF', 'P1', '50', 'PI', 'SFP']),
  record(['$U', '', '', '', 'Synthetic Circuit', '', '', '', 'SF', 'T', '0', 'T1', 'T', '500', 'PI', 'P', '900', 'SFP', 'P', '0']),
  '$A¦Green Flag at: 10:00:00.000',
  '$A¦Checkered Flag at: 10:03:05.000'
];
for (const [i, car] of ['1', '2', '3'].entries()) {
  lines.push(record(['$E', '', '', '', car, '', `Synthetic Driver ${car}`]));
  const start = 36000 + i;
  lines.push(record(['$S', '', '', '', car, car, 'S2', ticks(start), ticks(30), '']));
  for (let lap = 1; lap <= 3; lap++) {
    lines.push(record(['$S', '', '', '', car, car, 'S1', ticks(start + lap * 60 - 30), ticks(30), '']));
    const section = car === '1' && lap === 2 ? 'P1' : 'S2';
    lines.push(record(['$S', '', '', '', car, car, section, ticks(start + lap * 60), ticks(section === 'P1' ? 5 : 30), '']));
  }
}
const parsed = parseRaceToolsSession(lines.join('\n'), { id: 'synthetic-three-lap-example', sessionType: 'race' });
assert.equal(parsed.crossings.find(r => r.sectionLabel === 'S1').sectionSeconds, 30);
assert.deepEqual(parsed.geometry.pitLapBoundarySections, ['P1']);
assert.equal(parsed.lapCountByCar['1'], 3, 'A pit-lane finish crossing must count as a completed lap');
assert.equal(parsed.lapCountByCar['2'], 3);
assert.deepEqual(parsed.laps.filter(r => r.car === '1').map(r => r.lapSeconds), [60, 60, 60]);
const missingPit = parseRaceToolsSession(lines.filter(line => !line.startsWith('$S') || line.split(d)[6] !== 'P1').join('\n'), { id: 'synthetic-missing-pit-control', sessionType: 'race' });
assert.equal(missingPit.lapCountByCar['1'], 2, 'Negative control: missing the pit crossing loses a lap');
console.log(JSON.stringify({
  provenance: 'SYNTHETIC: no actual drivers, tracks, sessions, or source archive records',
  method: 'Production RaceTools-format decoder; integer ticks / 10000; named loop endpoints; mainline plus pit finish-plane accounting',
  sectionSeconds: 30,
  completedLapsWithPitCrossing: parsed.lapCountByCar['1'],
  completedLapsIfPitCrossingIsMissing: missingPit.lapCountByCar['1'],
  carOneLapSeconds: parsed.laps.filter(r => r.car === '1').map(r => r.lapSeconds),
  spatialClaim: 'Only named loop crossings. No GPS, inferred trajectory, or instantaneous speed.'
}, null, 2));
