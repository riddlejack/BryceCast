#!/usr/bin/env node
// Lane validator: checks the semantic-layer slice-1 outputs are internally
// consistent, correctly labelled, and that the headline results hold. Exits
// non-zero on any failure. This is the lane's own gate (house-lane pattern).

import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSummary, loadPack} from './lib/pack.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'output');
const failures = [];
const checks = [];
function check(name, cond, detail = '') {
  checks.push({name, ok: !!cond, detail});
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

// 1. Summary + packs.
const summary = await loadSummary();
check('summary.sourceTier is racetools_capture', summary.sourceTier === 'racetools_capture');
check('summary has 143 sessions', summary.sessions.length === 143, `got ${summary.sessions.length}`);
check('every session row carries sourceTier', summary.sessions.every((s) => s.sourceTier === 'racetools_capture'));

// 2. Spot-validate packs (all races + a practice/quali sample).
const sample = summary.sessions.filter((s) => s.sessionType === 'race' && !s.error).slice(0, 8);
for (const s of summary.sessions.filter((x) => ['practice', 'qualifying', 'test'].includes(x.sessionType)).slice(0, 4)) sample.push(s);
for (const s of sample) {
  if (s.error) continue;
  const pack = await loadPack(s.pack);
  check(`${s.id}: has geometry`, !!pack.geometry);
  check(`${s.id}: crossings carry source tier`, pack.loop_crossing.every((c) => c.sourceTier === 'racetools_capture'));
  check(
    `${s.id}: crossings have car/lap/section/time`,
    pack.loop_crossing.every((c) => c.car && c.lapIndex >= 1 && c.sectionLabel && Number.isFinite(c.timeOfDaySeconds)),
  );
  check(`${s.id}: lap rows have lapSeconds`, pack.lap.every((l) => l.lapSeconds == null || Number.isFinite(l.lapSeconds)));
  check(`${s.id}: flags have a state`, pack.flag.every((f) => typeof f.state === 'string'));
  check(`${s.id}: crossing count matches summary`, pack.loop_crossing.length === s.crossingCount, `${pack.loop_crossing.length} vs ${s.crossingCount}`);
}

// 3. Quality masks caught the audit's known defects.
check('log_header_only mask present (IMS 2025 P1 defect)', (summary.qualityMaskCounts.log_header_only || 0) >= 1);
check('full_day_capture mask present (day-spanning duplicates)', (summary.qualityMaskCounts.full_day_capture || 0) >= 1);

// 4. Validation artifacts exist and headline results hold.
const fin = JSON.parse(await readFile(join(OUT, 'validation', 'finishing-order.json'), 'utf8'));
check('axis (a) winner match >= 26/28', fin.winnerMatchCount >= 26, `${fin.winnerMatchCount}/${fin.raceCount}`);
check('axis (a) full-order-exact >= 8', fin.fullOrderExactCount >= 8, `${fin.fullOrderExactCount}`);

const sec = JSON.parse(await readFile(join(OUT, 'validation', 'section-time-residuals.json'), 'utf8'));
check('axis (b) >= 18 races tick-exact median', sec.summary.fullLapRacesTickExactMedian >= 18, `${sec.summary.fullLapRacesTickExactMedian}/${sec.summary.fullLapRaces}`);

const nash = JSON.parse(await readFile(join(OUT, 'nashville', 'loop-inventory.json'), 'utf8'));
check('nashville: feed carries more loops than published (both races)', nash.races.length === 2 && nash.races.every((r) => r.feedCarriesMoreThanPublished));
check('nashville: published fraction ~0.43-0.44', nash.races.every((r) => r.official.publishedLapFractionMedian > 0.4 && r.official.publishedLapFractionMedian < 0.47));

// 5. Slice 2: Timing71 2026 tables + identity crosswalk.
const t71 = JSON.parse(await readFile(join(OUT, 'timing71-2026-summary.json'), 'utf8'));
check('t71: 33 validated 2026 sessions', t71.sessionCount === 33, `${t71.sessionCount}`);
check('t71: every session sourceTier timing71_normalized', t71.sessions.every((s) => s.sourceTier === 'timing71_normalized'));
check('t71: maxLap matches audit coverage for all 33', t71.sessions.every((s) => s.maxLapMatchesCoverage === true));

const cw = JSON.parse(await readFile(join(OUT, 'crosswalk', 'identity-crosswalk-2026.json'), 'utf8'));
check('crosswalk: 33/33 sessions complete', cw.completeSessions === 33, `${cw.completeSessions}`);
check('crosswalk: >=31 sessions strict event scope', cw.sessions.filter((s) => s.strictEventScope).length >= 31);
check('crosswalk: zero ambiguous mappings anywhere', cw.sessions.every((s) => s.counts.ambiguous === 0));

const cwv = JSON.parse(await readFile(join(OUT, 'crosswalk', 'crosswalk-validation.json'), 'utf8'));
check('crosswalk validation: no hard failures', cwv.hardFailures.length === 0, JSON.stringify(cwv.hardFailures.slice(0, 3)));
check('crosswalk validation: zero NO-GO sessions', cwv.noGoCount === 0, `${cwv.noGoCount}`);
check('crosswalk validation: >=5 two-source cross-checks', cwv.twoSourceCrossChecks.length >= 5);
check(
  'crosswalk validation: identity 100% on all non-thin cross-checks',
  cwv.twoSourceCrossChecks.filter((c) => !c.thinCapture).every((c) => c.identity.agree === c.identity.checked),
);

const cap = JSON.parse(await readFile(join(OUT, 'cross-check', 'capture-final-states.json'), 'utf8'));
check('capture extract: present with >=9 NXT sessions', cap.sessions.length >= 9, `${cap.sessions.length}`);
check('capture extract: sourceTier brycecast_capture', cap.sessions.every((s) => s.sourceTier === 'brycecast_capture'));

// Report.
const passed = checks.filter((c) => c.ok).length;
console.log(`\nsemantic-layer validator: ${passed}/${checks.length} checks passed`);
if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('All checks passed.');
