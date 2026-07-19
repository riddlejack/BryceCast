#!/usr/bin/env node
// Crosswalk validation — the gate that decides whether 2026 lake data is
// UI-eligible. Four parts, all hard:
//
//  1. TRAP TESTS for the audit's three failure classes:
//     T1 same-season name-format variants ("JM Correa" ~ "Juan Manuel Correa"),
//     T2 season-to-season car-number reuse (#14/#27/#28),
//     T3 cross-series recordings where #9 is two different drivers.
//  2. Race classification: Timing71 final order vs canonical results, all 12 races.
//  3. TWO-SOURCE CROSS-CHECK: Timing71 (third-party normalized) vs BryceCast's
//     own capture (official Race Control feed) for every overlapping session —
//     identity, lap counts, positions.
//  4. GO/NO-GO per 2026 session for UI eligibility.
//
// Exits non-zero on any trap-test failure or hard inconsistency.

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {loadCanonicalIdentityContext, matchDriverName} from './lib/canonical.mjs';

const LANE_DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(LANE_DIR, 'output', 'crosswalk');

const failures = [];
const notes = [];
function assertThat(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  return !!cond;
}

const ctx = await loadCanonicalIdentityContext();
const crosswalk = JSON.parse(await readFile(join(OUT, 'identity-crosswalk-2026.json'), 'utf8'));
const t71Summary = JSON.parse(await readFile(join(LANE_DIR, 'output', 'timing71-2026-summary.json'), 'utf8'));
const capture = JSON.parse(await readFile(join(LANE_DIR, 'output', 'cross-check', 'capture-final-states.json'), 'utf8'));

async function loadPackRecords(pack, record) {
  const text = gunzipSync(await readFile(join(LANE_DIR, 'output', pack))).toString('utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.record === record) rows.push(r);
  }
  return rows;
}

// ---------- 1. TRAP TESTS ----------

// T1: same-season name-format variants. Unit-level: the matcher MUST resolve the
// known variant classes; and MUST NOT cross-match distinct drivers.
{
  const t = (src, given, family, display) => matchDriverName(src, {givenName: given, familyName: family, displayName: display});
  assertThat('T1: "JM Correa" ~ "Juan Manuel Correa" (initials)', t('JM Correa', 'Juan Manuel', 'Correa', 'Juan Manuel Correa').match);
  assertThat('T1: "Juan Manuel Correa" ~ canonical "JM Correa" (reverse)', t('Juan Manuel Correa', 'JM', 'Correa', 'JM Correa').match);
  assertThat('T1: "Seb Murray" ~ "Sebastian Murray" (prefix)', t('Seb Murray', 'Sebastian', 'Murray', 'Sebastian Murray').match);
  assertThat('T1: "Salvador de Alba Jr" ~ "Salvador de Alba" (suffix)', t('Salvador de Alba Jr', 'Salvador', 'de Alba', 'Salvador de Alba').match);
  assertThat('T1 negative: "Max Taylor" !~ "Dennis Hauger"', !t('Max Taylor', 'Dennis', 'Hauger', 'Dennis Hauger').match);
  assertThat('T1 negative: "Nolan Allaer" !~ "Ricardo Escotto" (2026 #76 swap pair)', !t('Nolan Allaer', 'Ricardo', 'Escotto', 'Ricardo Escotto').match);
  assertThat('T1 negative: "Nicolas Stati" !~ "Yuven Sundaramoorthy" (2026 #15 swap pair)', !t('Nicolas Stati', 'Yuven', 'Sundaramoorthy', 'Yuven Sundaramoorthy').match);
  // Real-data: the 2026 crosswalk must carry Correa and Murray with correct ids.
  const allMappings = crosswalk.sessions.flatMap((s) => s.mappings);
  const correa = allMappings.find((m) => /correa/i.test(m.sourceName));
  const murray = allMappings.find((m) => /murray/i.test(m.sourceName));
  assertThat('T1 real: Correa present and mapped', !!correa && correa.driverId != null, JSON.stringify(correa));
  assertThat('T1 real: Correa -> driver_jm_correa', correa?.driverId === 'driver_jm_correa', correa?.driverId);
  assertThat('T1 real: Murray -> driver_seb_murray', murray?.driverId === 'driver_seb_murray', murray?.driverId);
  notes.push('T1 note: canonical 2026 itself uses the short displayed forms ("JM Correa", "Seb Murray"), so 2026 real-data matches are exact; the variant rules are proven at unit level and guard the 2024-25 unification in a later slice.');
}

// T2: season-to-season car-number reuse. For every car number used in BOTH 2025
// and 2026 by different drivers, the event-scoped crosswalk must return the
// 2026 driver — a season-agnostic number join would be wrong.
{
  const y25 = ctx.entrantsByYear.get(2025) ?? new Map();
  const y26 = ctx.entrantsByYear.get(2026) ?? new Map();
  const raceSessions = crosswalk.sessions.filter((s) => s.sessionType === 'race');
  const reused = [];
  for (const [car, ids26] of y26) {
    const ids25 = y25.get(car);
    if (!ids25) continue;
    const only25 = [...ids25].filter((id) => !ids26.has(id));
    if (only25.length === 0) continue;
    reused.push({car, drivers2025: [...ids25], drivers2026: [...ids26]});
    // Every 2026 crosswalk mapping for this car must be a 2026 driver, never a 2025-only one.
    for (const s of raceSessions) {
      const m = s.mappings.find((x) => x.car === car);
      if (!m || !m.driverId) continue;
      assertThat(`T2: #${car} in ${s.t71SessionId} maps to a 2026 driver`, ids26.has(m.driverId), `${m.driverId}`);
      assertThat(`T2: #${car} in ${s.t71SessionId} not a 2025-only driver`, !only25.includes(m.driverId), `${m.driverId}`);
    }
  }
  assertThat('T2: at least 3 reused numbers exist (audit named #14/#27/#28)', reused.length >= 3, `found ${reused.length}`);
  for (const expect of ['14', '27', '28']) {
    assertThat(`T2: #${expect} is a reused number with a different 2026 driver`, reused.some((r) => r.car === expect));
  }
  notes.push(`T2 reused numbers verified: ${reused.map((r) => '#' + r.car).join(', ')}`);
}

// T3: cross-series recordings. The three 2026 NXT races embedded in recordings
// whose manifests name INDYCAR sessions: the extracted roster must be pure NXT
// (every car maps in event scope), #9 must be Bryce, and the decoded winner
// must equal the canonical race winner.
{
  const crossSessionRaces = t71Summary.sessions.filter(
    (s) => s.sessionType === 'race' && s.qualityMasks.includes('cross_session_recording_segmented'),
  );
  assertThat('T3: exactly 3 cross-session race recordings', crossSessionRaces.length === 3, crossSessionRaces.map((s) => s.id).join(','));
  for (const s of crossSessionRaces) {
    const cw = crosswalk.sessions.find((c) => c.t71SessionId === s.id);
    assertThat(`T3: ${s.id} roster is full NXT field`, cw.rosterSize >= 20, `roster=${cw.rosterSize}`);
    assertThat(`T3: ${s.id} crosswalk complete (no INDYCAR leak)`, cw.complete && cw.strictEventScope);
    const nine = cw.mappings.find((m) => m.car === '9');
    assertThat(`T3: ${s.id} #9 -> driver_bryce_aron`, nine?.driverId === 'driver_bryce_aron', nine?.driverId);
    // Winner check against canonical.
    const cls = await loadPackRecords(s.pack, 'classification');
    const canResults = await canonicalResultsFor(cw.canonicalSessionId);
    const canWinner = canResults?.find((r) => r.finishPosition === 1);
    const derWinner = cls.find((c) => c.position === 1);
    assertThat(`T3: ${s.id} winner matches canonical`, !!canWinner && derWinner?.car === String(canWinner.carNumber), `derived #${derWinner?.car} vs canonical #${canWinner?.carNumber}`);
  }
}

async function canonicalResultsFor(sessionId) {
  if (!sessionId) return null;
  const path = process.env.BRYCECAST_CAREER_DATASET || '/Users/example/.codex/worktrees/ac78/Bryce POV access/data/career/career.dataset.json';
  if (!globalThis.__canonData) globalThis.__canonData = JSON.parse(await readFile(path, 'utf8'));
  return globalThis.__canonData.results.filter((r) => r.sessionId === sessionId);
}

// ---------- 2. Race classification vs canonical (all 12 races) ----------
const raceChecks = [];
for (const s of t71Summary.sessions.filter((x) => x.sessionType === 'race')) {
  const cw = crosswalk.sessions.find((c) => c.t71SessionId === s.id);
  const canResults = await canonicalResultsFor(cw.canonicalSessionId);
  if (!canResults || canResults.length === 0) {
    raceChecks.push({id: s.id, matched: false});
    continue;
  }
  const cls = await loadPackRecords(s.pack, 'classification');
  const canByCar = new Map(canResults.map((r) => [String(r.carNumber), r]));
  const canOrder = canResults.filter((r) => r.finishPosition != null).sort((a, b) => a.finishPosition - b.finishPosition);
  let posExact = 0;
  let lapExact = 0;
  let checked = 0;
  for (const c of cls) {
    const can = canByCar.get(c.car);
    if (!can || can.finishPosition == null) continue;
    checked += 1;
    if (c.position === can.finishPosition) posExact += 1;
    if (c.laps === can.lapsCompleted) lapExact += 1;
  }
  const winnerMatch = cls.find((c) => c.position === 1)?.car === String(canOrder[0]?.carNumber);
  const podiumMatch =
    JSON.stringify(cls.slice(0, 3).map((c) => c.car)) === JSON.stringify(canOrder.slice(0, 3).map((r) => String(r.carNumber)));
  raceChecks.push({
    id: s.id,
    matched: true,
    canonicalSessionId: cw.canonicalSessionId,
    fieldSize: canOrder.length,
    winnerMatch,
    podiumMatch,
    positionExact: posExact,
    lapCountExact: lapExact,
    checked,
  });
}
const matchedRaces = raceChecks.filter((r) => r.matched);
assertThat('races: all 12 matched to canonical', matchedRaces.length === 12, `${matchedRaces.length}`);
// A winner/order divergence is only acceptable when it is a confirmed
// AS-RACED vs OFFICIAL-CLASSIFICATION divergence: our own capture (official
// Race Control feed) must agree with the Timing71 final state, proving the
// decode is faithful and the difference is a post-race reclassification
// (e.g. Road America R2 2026: #14 de Tullio DQ'd after winning on the road).
// This check runs after the cross-checks are computed (see below).

// ---------- 3. Two-source cross-check (Timing71 vs BryceCast capture) ----------
const officialToCanonical = new Map(ctx.sessions.filter((s) => s.officialSessionId).map((s) => [String(s.officialSessionId), s]));
const crossChecks = [];
for (const cap of capture.sessions) {
  if (!cap.officialEventSessionId) continue;
  const canSession = officialToCanonical.get(String(cap.officialEventSessionId));
  if (!canSession) continue;
  // Find the T71 session for the same canonical session (races/quali) or the
  // same event+type+date (practice).
  let cw = crosswalk.sessions.find((c) => c.canonicalSessionId === canSession.sessionId);
  if (!cw) {
    cw = crosswalk.sessions.find(
      (c) => c.canonicalEventId === canSession.eventId && c.sessionType === canSession.sessionType && c.date === canSession.date,
    );
  }
  if (!cw) continue;
  const t71Sess = t71Summary.sessions.find((x) => x.id === cw.t71SessionId);
  const cls = await loadPackRecords(t71Sess.pack, 'classification');
  const clsByCar = new Map(cls.map((c) => [c.car, c]));
  let identityAgree = 0;
  let identityChecked = 0;
  let lapAgree = 0;
  let lapWithin1 = 0;
  let lapChecked = 0;
  let posAgree = 0;
  let posChecked = 0;
  const identityMismatches = [];
  for (const row of cap.finalField) {
    const t = clsByCar.get(row.car);
    if (!t) continue;
    const capName = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim();
    identityChecked += 1;
    // Two identity assertions: T71's name and the crosswalk driverId's canonical
    // name must BOTH reconcile with the official capture name.
    const m = cw.mappings.find((x) => x.car === row.car);
    const canonDriver = m?.driverId ? ctx.drivers.get(m.driverId) : null;
    const t71NameOk = matchDriverName(t.driver ?? '', {givenName: '', familyName: '', displayName: capName, ...splitForMatch(capName)}).match;
    const canonNameOk = canonDriver ? matchDriverName(capName, canonDriver).match : false;
    if (t71NameOk && canonNameOk) identityAgree += 1;
    else identityMismatches.push({car: row.car, captureName: capName, t71Name: t.driver, crosswalkDriverId: m?.driverId ?? null});
    if (row.laps != null && t.laps != null) {
      lapChecked += 1;
      if (t.laps === row.laps) lapAgree += 1;
      if (Math.abs(t.laps - row.laps) <= 1) lapWithin1 += 1;
    }
    if (cap.sessionType === 'race' || canSession.sessionType === 'race') {
      if (row.rank != null && t.position != null) {
        posChecked += 1;
        if (t.position === row.rank) posAgree += 1;
      }
    }
  }
  crossChecks.push({
    captureSessionKey: cap.sessionKey,
    canonicalSessionId: canSession.sessionId,
    t71SessionId: cw.t71SessionId,
    sessionType: canSession.sessionType,
    captureSnapshots: cap.snapshotCount,
    thinCapture: cap.snapshotCount < 60,
    identity: {checked: identityChecked, agree: identityAgree, mismatches: identityMismatches},
    laps: {checked: lapChecked, exact: lapAgree, within1: lapWithin1},
    positions: {checked: posChecked, exact: posAgree},
  });
}
function splitForMatch(name) {
  const parts = String(name).trim().split(/\s+/);
  return {givenName: parts.slice(0, -1).join(' '), familyName: parts.slice(-1).join(' ')};
}
assertThat('cross-check: at least 5 overlapping sessions', crossChecks.length >= 5, `${crossChecks.length}`);
for (const c of crossChecks.filter((c) => !c.thinCapture)) {
  assertThat(`cross-check ${c.t71SessionId}: identity 100%`, c.identity.agree === c.identity.checked, `${c.identity.agree}/${c.identity.checked} ${JSON.stringify(c.identity.mismatches.slice(0, 3))}`);
}

// Deferred winner check: divergence from canonical is a hard failure UNLESS the
// capture confirms the as-raced order (official reclassification case).
for (const r of matchedRaces) {
  if (r.winnerMatch) continue;
  const cross = crossChecks.find((c) => c.t71SessionId === r.id);
  const captureConfirms = !!cross && cross.positions.checked > 0 && cross.positions.exact === cross.positions.checked;
  r.divergenceClass = captureConfirms ? 'as_raced_vs_official_classification' : 'unexplained';
  assertThat(
    `races: ${r.id} winner divergence is capture-confirmed as-raced order`,
    captureConfirms,
    'Timing71 final order disagrees with canonical AND is not confirmed by our own capture',
  );
  if (captureConfirms)
    notes.push(
      `Race divergence explained: ${r.id} — Timing71 and the BryceCast capture agree on the as-crossed order (${cross.positions.exact}/${cross.positions.checked}); canonical carries the official post-race reclassification. Classification for UI must come from canonical results; the timing/lap/identity tables remain valid.`,
    );
}

// ---------- 4. GO/NO-GO per 2026 session ----------
const verdicts = [];
for (const s of t71Summary.sessions) {
  const cw = crosswalk.sessions.find((c) => c.t71SessionId === s.id);
  const race = raceChecks.find((r) => r.id === s.id);
  const cross = crossChecks.find((c) => c.t71SessionId === s.id);
  const reasons = [];
  let verdict = 'GO';
  if (!cw.complete) {
    verdict = 'NO-GO';
    reasons.push('crosswalk incomplete (ambiguous/unmapped identities)');
  }
  if (s.qualityMasks.includes('no_bryce_roster_segment')) {
    verdict = 'NO-GO';
    reasons.push('no usable NXT segment decoded');
  }
  if (s.sessionType === 'race' && race?.matched && !race.winnerMatch) {
    if (race.divergenceClass === 'as_raced_vs_official_classification') {
      verdict = 'CONDITIONAL';
      reasons.push(
        'as-raced final state diverges from official classification (post-race reclassification; capture-confirmed) — UI must take classification from canonical results, timing/laps/identity tables are valid',
      );
    } else {
      verdict = 'NO-GO';
      reasons.push('decoded winner disagrees with canonical and is not capture-confirmed');
    }
  }
  if (verdict === 'GO' && !cw.strictEventScope) {
    verdict = 'CONDITIONAL';
    reasons.push('identity via season-scope fallback; awaits canonical event results (Nashville weekend not yet in canonical)');
  }
  if (verdict === 'GO' && s.qualityMasks.includes('no_checkered_flag_detected')) {
    reasons.push('note: no checkered state observed (audit F7 watch item)');
  }
  verdicts.push({
    t71SessionId: s.id,
    sessionType: s.sessionType,
    date: s.date,
    venue: s.venue,
    verdict,
    crossCheck: cross ? (cross.thinCapture ? 'partial(thin capture)' : cross.identity.agree === cross.identity.checked ? 'confirmed' : 'failed') : 'unavailable',
    qualityMasks: s.qualityMasks,
    reasons,
  });
}

const report = {
  artifact: 'crosswalk-validation-2026',
  generatedAt: new Date().toISOString(),
  trapTests: {failures: failures.filter((f) => /^T\d/.test(f)), notes},
  raceClassificationChecks: raceChecks,
  twoSourceCrossChecks: crossChecks,
  goNoGo: verdicts,
  goCount: verdicts.filter((v) => v.verdict === 'GO').length,
  conditionalCount: verdicts.filter((v) => v.verdict === 'CONDITIONAL').length,
  noGoCount: verdicts.filter((v) => v.verdict === 'NO-GO').length,
  hardFailures: failures,
};
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'crosswalk-validation.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('\n=== Crosswalk validation ===');
console.log(`Trap tests: ${failures.filter((f) => /^T\d/.test(f)).length === 0 ? 'ALL PASSED' : 'FAILURES'}`);
for (const n of notes) console.log(`  ${n}`);
console.log(`\nRaces vs canonical: winner ${matchedRaces.filter((r) => r.winnerMatch).length}/${matchedRaces.length}, podium ${matchedRaces.filter((r) => r.podiumMatch).length}/${matchedRaces.length}`);
for (const r of matchedRaces) console.log(`  ${r.id}: win=${r.winnerMatch ? 'Y' : 'N'} pod=${r.podiumMatch ? 'Y' : 'N'} pos ${r.positionExact}/${r.checked} laps ${r.lapCountExact}/${r.checked}`);
console.log(`\nTwo-source cross-checks (${crossChecks.length} overlapping sessions):`);
for (const c of crossChecks)
  console.log(
    `  ${c.t71SessionId} [${c.sessionType}${c.thinCapture ? ', thin' : ''}]: identity ${c.identity.agree}/${c.identity.checked}, laps exact ${c.laps.exact}/${c.laps.checked} (within-1 ${c.laps.within1}), pos ${c.positions.exact}/${c.positions.checked}`,
  );
console.log(`\nGO/NO-GO: GO=${report.goCount} CONDITIONAL=${report.conditionalCount} NO-GO=${report.noGoCount}`);
for (const v of verdicts) console.log(`  ${v.verdict.padEnd(11)} ${v.t71SessionId} [${v.crossCheck}]${v.reasons.length ? ' — ' + v.reasons.join('; ') : ''}`);

if (failures.length) {
  console.error(`\nHARD FAILURES (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll crosswalk validations passed.');
