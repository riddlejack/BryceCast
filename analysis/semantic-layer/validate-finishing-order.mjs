#!/usr/bin/env node
// Validation axis (a): derive finishing order, winner, and lap counts PURELY
// from the loop-crossing / laps tables, and compare to the canonical dataset.
//
// The derivation is deliberately independent of the feed's own classification
// records: order = (racing laps completed desc, time of final S/F crossing asc).
// Racing laps come from S/F-line crossings after the green flag. Matching the
// canonical winner/podium/lap-counts from crossings alone proves the whole
// extraction chain (hex ticks -> crossings -> laps -> order).

import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSummary, loadPack} from './lib/pack.mjs';
import {loadCanonicalRaces, normVenue} from './lib/canonical.mjs';

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'output', 'validation');

function deriveOrderFromTables(pack) {
  const green = pack.session_meta ? null : null;
  const greenTod = (pack.flag.find((f) => f.state === 'green') || {}).startTimeOfDaySeconds ?? null;

  // racing laps per car = count of lap rows (laps table already excludes
  // pre-green formation crossings).
  const racingLaps = new Map();
  for (const l of pack.lap) racingLaps.set(l.car, Math.max(racingLaps.get(l.car) || 0, l.lap));

  // final S/F crossing time per car (their last completed racing lap).
  const finalSf = new Map();
  for (const c of pack.loop_crossing) {
    if (!c.isLapBoundary) continue;
    if (greenTod !== null && c.timeOfDaySeconds <= greenTod) continue;
    finalSf.set(c.car, Math.max(finalSf.get(c.car) || 0, c.timeOfDaySeconds));
  }

  const cars = [...new Set([...racingLaps.keys()])].filter((car) => (racingLaps.get(car) || 0) > 0);
  cars.sort((a, b) => (racingLaps.get(b) || 0) - (racingLaps.get(a) || 0) || (finalSf.get(a) || 1e12) - (finalSf.get(b) || 1e12));
  return cars.map((car, i) => ({
    derivedPosition: i + 1,
    car,
    derivedLaps: racingLaps.get(car) || 0,
    finalSfTod: finalSf.get(car) ?? null,
  }));
}

function compare(derived, canonical) {
  const canByCar = new Map(canonical.results.map((r) => [r.car, r]));
  const derByCar = new Map(derived.map((d) => [d.car, d]));
  const canOrder = canonical.results
    .filter((r) => r.finishPosition != null)
    .slice()
    .sort((a, b) => a.finishPosition - b.finishPosition);

  let exactPos = 0;
  let lapMatches = 0;
  let lapWithin1 = 0;
  let lapChecked = 0;
  const lapMismatches = [];
  for (let i = 0; i < canOrder.length; i += 1) {
    const c = canOrder[i];
    const d = derByCar.get(c.car);
    if (d && d.derivedPosition === c.finishPosition) exactPos += 1;
    if (d && c.lapsCompleted != null) {
      lapChecked += 1;
      if (d.derivedLaps === c.lapsCompleted) lapMatches += 1;
      if (Math.abs(d.derivedLaps - c.lapsCompleted) <= 1) lapWithin1 += 1;
      if (d.derivedLaps !== c.lapsCompleted) lapMismatches.push({car: c.car, derived: d.derivedLaps, canonical: c.lapsCompleted, status: c.status});
    }
  }

  const derWinner = derived[0]?.car ?? null;
  const canWinner = canOrder[0]?.car ?? null;
  const derPodium = derived.slice(0, 3).map((d) => d.car);
  const canPodium = canOrder.slice(0, 3).map((r) => r.car);
  return {
    canonicalSessionId: canonical.sessionId,
    fieldSize: canOrder.length,
    winnerMatch: derWinner === canWinner,
    derivedWinner: derWinner,
    canonicalWinner: canWinner,
    podiumMatch: JSON.stringify(derPodium) === JSON.stringify(canPodium),
    derivedPodium: derPodium,
    canonicalPodium: canPodium,
    exactPositionMatches: exactPos,
    positionsMatchFraction: canOrder.length ? Number((exactPos / canOrder.length).toFixed(3)) : null,
    lapCountMatches: lapMatches,
    lapCountWithin1: lapWithin1,
    lapCountChecked: lapChecked,
    lapCountMismatches: lapMismatches,
  };
}

// Secondary cross-check: the feed's OWN final classification ($O/$C) vs
// canonical. This is not a crossing derivation (it reads the timing system's
// answer), but it confirms the capture is complete and correctly parsed.
function compareFeedClassification(pack, canonical) {
  const canByCar = new Map(canonical.results.map((r) => [r.car, r]));
  let posMatch = 0;
  let lapMatch = 0;
  let checked = 0;
  for (const cls of pack.classification) {
    const c = canByCar.get(cls.car);
    if (!c || c.finishPosition == null) continue;
    checked += 1;
    if (cls.position === c.finishPosition) posMatch += 1;
    if (cls.laps === c.lapsCompleted) lapMatch += 1;
  }
  return {checked, positionMatches: posMatch, lapMatches: lapMatch};
}

const summary = await loadSummary();
// Validate the CLEAN race captures. Sessions carrying the audit's known-defect
// masks (full_day_capture = a day-spanning duplicate containing multiple
// sessions/series; mixed_session = needs segmentation) are excluded from the
// clean-order check and reported separately; a heartbeat_gap alone (e.g. a
// red-flag race) is still a valid race and kept.
const DEFECT_MASKS = new Set(['full_day_capture', 'mixed_session_requires_segmentation', 'log_header_only']);
const excludedRaces = summary.sessions.filter(
  (s) => s.sessionType === 'race' && !s.error && (s.qualityMasks || []).some((m) => DEFECT_MASKS.has(m)),
);
const races = summary.sessions.filter(
  (s) => s.sessionType === 'race' && !s.error && !(s.qualityMasks || []).some((m) => DEFECT_MASKS.has(m)),
);
const canonical = await loadCanonicalRaces();

// Assign each canonical race to at most one feed race, tiered so doubleheaders
// pair by race number (robust to the feed and canonical dating a doubleheader's
// two races differently) while single races pair by exact date.
function feedRaceNumber(session) {
  const m = /^R(\d+)$/i.exec(session.sessionCode);
  return m ? Number(m[1]) : 1;
}
const usedCanonical = new Set();
function pick(pred) {
  const c = canonical.find((r) => r.results.length && !usedCanonical.has(r.sessionId) && pred(r));
  if (c) usedCanonical.add(c.sessionId);
  return c || null;
}
const canonBySession = new Map();
for (const s of races.slice().sort((a, b) => a.date.localeCompare(b.date) || feedRaceNumber(a) - feedRaceNumber(b))) {
  const vk = normVenue(s.venue);
  const rn = feedRaceNumber(s);
  const can =
    pick((r) => r.date === s.date && r.venueKey === vk && r.raceNumber === rn) ||
    pick((r) => r.year === s.year && r.venueKey === vk && r.raceNumber === rn && r.raceNumber != null) ||
    pick((r) => r.date === s.date && r.venueKey === vk) ||
    pick((r) => r.date === s.date) ||
    pick((r) => r.year === s.year && r.venueKey === vk);
  if (can) canonBySession.set(s.id, can);
}

const rows = [];
for (const s of races) {
  const pack = await loadPack(s.pack);
  const can = canonBySession.get(s.id);
  if (!can) {
    rows.push({id: s.id, year: s.year, venue: s.venue, matched: false});
    continue;
  }
  const derived = deriveOrderFromTables(pack);
  rows.push({
    id: s.id,
    year: s.year,
    date: s.date,
    venue: s.venue,
    matched: true,
    qualityMasks: s.qualityMasks,
    ...compare(derived, can),
    feedClassificationVsCanonical: compareFeedClassification(pack, can),
  });
}

const clean = rows.filter((r) => r.matched);
const report = {
  axis: 'a_finishing_order_vs_canonical',
  generatedAt: new Date().toISOString(),
  method:
    'Order derived from loop-crossing tables only: (racing laps completed desc, final S/F crossing time asc). Compared to canonical career.dataset.json finishing order and lap counts.',
  raceCount: clean.length,
  winnerMatchCount: clean.filter((r) => r.winnerMatch).length,
  podiumMatchCount: clean.filter((r) => r.podiumMatch).length,
  fullOrderExactCount: clean.filter((r) => r.exactPositionMatches === r.fieldSize).length,
  lapCountExactSessions: clean.filter((r) => r.lapCountMatches === r.lapCountChecked).length,
  lapCountWithin1Sessions: clean.filter((r) => r.lapCountWithin1 === r.lapCountChecked).length,
  lapCarsExact: clean.reduce((a, r) => a + r.lapCountMatches, 0),
  lapCarsWithin1: clean.reduce((a, r) => a + r.lapCountWithin1, 0),
  lapCarsChecked: clean.reduce((a, r) => a + r.lapCountChecked, 0),
  feedClassificationExactSessions: clean.filter(
    (r) => r.feedClassificationVsCanonical && r.feedClassificationVsCanonical.positionMatches === r.feedClassificationVsCanonical.checked,
  ).length,
  excludedDefectiveCaptures: excludedRaces.map((s) => ({id: s.id, date: s.date, venue: s.venue, qualityMasks: s.qualityMasks})),
  note:
    'Order/winner/lap counts are DERIVED from loop-crossing tables. Lap-count exact parity is limited by start-line, cool-down, timed-race and red-flag procedure the official system resolves with pit/timed logic beyond raw crossings; within-1 agreement and the feed-classification cross-check bound that gap. Known-defective captures (full_day_capture / mixed_session / log_header_only) are excluded here and listed under excludedDefectiveCaptures.',
  results: rows,
};
await mkdir(OUTPUT_DIR, {recursive: true});
await writeFile(join(OUTPUT_DIR, 'finishing-order.json'), `${JSON.stringify(report, null, 2)}\n`);

// Console table.
console.log(`\nAxis (a): finishing order vs canonical — ${clean.length} races`);
console.log(`winner: ${report.winnerMatchCount}/${clean.length} | podium: ${report.podiumMatchCount}/${clean.length} | full-order-exact: ${report.fullOrderExactCount}/${clean.length}`);
console.log(`lap counts (derived from crossings): cars exact ${report.lapCarsExact}/${report.lapCarsChecked}, within-1 ${report.lapCarsWithin1}/${report.lapCarsChecked}; within-1 sessions ${report.lapCountWithin1Sessions}/${clean.length}`);
console.log(`feed-classification cross-check (position exact): ${report.feedClassificationExactSessions}/${clean.length} sessions`);
console.log('\ndate\t\tvenue\t\t\twin\tpod\tpos/N\tlapEx\tlapW1');
for (const r of clean) {
  console.log(
    `${r.date}\t${(r.venue || '').slice(0, 22).padEnd(22)}\t${r.winnerMatch ? 'Y' : 'N'}\t${r.podiumMatch ? 'Y' : 'N'}\t${r.exactPositionMatches}/${r.fieldSize}\t${r.lapCountMatches}/${r.lapCountChecked}\t${r.lapCountWithin1}/${r.lapCountChecked}`,
  );
}
