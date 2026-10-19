#!/usr/bin/env node
// Validation axis (b): derived section times vs official Section Results PDFs.
//
// We compute Bryce's section times as DIFFERENCES between his loop-crossing
// timestamps and compare per lap to the parsed official section times. The
// official Section Results come from the same timing system as the feed, so
// agreement shows the extraction chain (raw hex ticks -> loop-crossing
// timestamps -> differenced section times) lost, doubled and misassigned none
// of the crossings compared. It does not measure how accurately the timing
// system times a car.
//
//   * Full-lap check (every race with official lap totals): the S/F -> S/F
//     crossing delta vs the official "Lap" section. Unambiguous boundary. A lap
//     matches when both times are the same value at the feed's 0.0001 s tick.
//   * Published sub-section residual (Nashville): each published track section
//     is mapped to the feed sub-section span whose per-lap series matches best,
//     then residuals are reported for that boundary.
//
// Each feed race is compared with its own official session, taken from the
// timing-coverage ledger (which records the canonical session of every
// RaceTools capture), and with the car Bryce drove in that race, taken from the
// official results in the career dataset. Races that cannot be compared are
// reported with the reason.

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSummary, loadPack} from './lib/pack.mjs';
import {loadOfficialSections} from './lib/official-sections.mjs';
import {loadCanonicalRaces} from './lib/canonical.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'output', 'validation');
const LEDGER_PATH = resolve(HERE, '../../data/historical-data-lake/catalog/timing-coverage-ledger.json');
const BRYCE_DRIVER_ID = 'driver_bryce_aron';
const MIN_OFFICIAL_LAPS = 5;
// Half the feed's 0.0001 s tick: a smaller difference is float noise between
// two equal printed values.
const SAME_TICK = 0.00005;

function stats(residuals) {
  if (!residuals.length) return null;
  const abs = residuals.map(Math.abs).sort((a, b) => a - b);
  const sorted = [...residuals].sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  return {
    n: residuals.length,
    medianResidual: round(sorted[Math.floor(sorted.length / 2)], 4),
    meanResidual: round(mean, 4),
    medianAbsResidual: round(abs[Math.floor(abs.length / 2)], 4),
    p95AbsResidual: round(q(abs, 0.95), 4),
    maxAbsResidual: round(abs[abs.length - 1], 4),
    within_0p05s: residuals.filter((r) => Math.abs(r) <= 0.05).length,
    within_0p2s: residuals.filter((r) => Math.abs(r) <= 0.2).length,
  };
}
const round = (n, d) => (n == null || !Number.isFinite(n) ? n : Math.round(n * 10 ** d) / 10 ** d);

// Bryce's derived per-lap lap times, keyed by lap index.
function bryceLapTimes(pack, car) {
  const m = new Map();
  for (const l of pack.lap) if (l.car === car && !l.isFirstRacingLap && l.lapSeconds != null) m.set(l.lap, l.lapSeconds);
  return m;
}

// Bryce's derived per-lap time for a span = sum of the fine-section crossing
// deltas between the span's start and end loop, per lap. Built from crossings.
function bryceSpanTimes(pack, car, sectionNames) {
  const set = new Set(sectionNames);
  const byLap = new Map();
  for (const c of pack.loop_crossing) {
    if (c.car !== car || !set.has(c.sectionLabel) || c.sectionSeconds == null) continue;
    const cur = byLap.get(c.lapIndex) || {sum: 0, n: 0};
    cur.sum += c.sectionSeconds;
    cur.n += 1;
    byLap.set(c.lapIndex, cur);
  }
  const m = new Map();
  for (const [lap, v] of byLap) if (v.n === sectionNames.length) m.set(lap, round(v.sum, 4));
  return m;
}

// Align two per-lap series by the integer lap offset minimising median |resid|.
function alignResiduals(derived, official) {
  let best = null;
  for (let offset = -2; offset <= 2; offset += 1) {
    const pairs = [];
    for (const [lap, off] of official) {
      const d = derived.get(lap + offset);
      if (d != null) pairs.push({officialLap: lap, derived: d, official: off, residual: d - off});
    }
    if (pairs.length < 5) continue;
    const residuals = pairs.map((p) => p.residual);
    const madAbs = residuals.map(Math.abs).sort((a, b) => a - b)[Math.floor(residuals.length / 2)];
    if (!best || madAbs < best.mad) best = {offset, pairs, residuals, mad: madAbs};
  }
  return best;
}

const summary = await loadSummary();
const official = await loadOfficialSections();
const raceSessions = summary.sessions.filter(
  (s) => s.sessionType === 'race' && !s.error && !(s.qualityMasks || []).some((m) => ['full_day_capture', 'mixed_session_requires_segmentation', 'log_header_only'].includes(m)),
);

// Feed capture id -> the race session(s) the ledger records for it.
const ledger = JSON.parse(await readFile(LEDGER_PATH, 'utf8'));
const ledgerRaceSessions = new Map();
for (const s of ledger.sessions) {
  if (s.sessionType !== 'race') continue;
  for (const src of [s.primarySource, ...(s.sources || [])]) {
    if (src?.tier !== 'racetools_capture' || !src.sourceSessionId) continue;
    if (!ledgerRaceSessions.has(src.sourceSessionId)) ledgerRaceSessions.set(src.sourceSessionId, new Set());
    ledgerRaceSessions.get(src.sourceSessionId).add(s.canonicalSessionId);
  }
}
const canonicalRaces = new Map((await loadCanonicalRaces()).map((r) => [r.sessionId, r]));

// The race's own official session and the car Bryce drove in it, or the reason
// the race cannot be compared.
function resolveRace(race) {
  const ids = [...(ledgerRaceSessions.get(race.id) || [])];
  if (ids.length !== 1) {
    return {reason: ids.length ? `capture is linked to ${ids.length} race sessions in the timing-coverage ledger` : 'capture has no race session in the timing-coverage ledger'};
  }
  const sessionId = ids[0];
  const bryce = (canonicalRaces.get(sessionId)?.results || []).filter((r) => r.driverId === BRYCE_DRIVER_ID);
  if (bryce.length !== 1) return {sessionId, reason: `${bryce.length} official result rows for Bryce in the career dataset`};
  const car = bryce[0].car;
  const off = official.get(sessionId);
  if (!off) return {sessionId, car, reason: 'session absent from the official Section Results'};
  return {sessionId, car, off};
}

// ---- Full-lap residuals (all races with official lap totals) ----
const fullLap = [];
const notCompared = [];
for (const race of raceSessions) {
  const match = resolveRace(race);
  const row = {id: race.id, year: race.year, venue: race.venue, officialSessionId: match.sessionId ?? null, bryceCar: match.car ?? null};
  if (match.reason) {
    notCompared.push({...row, reason: match.reason});
    continue;
  }
  const {off, car} = match;
  const officialLap = new Map();
  for (const [lap, secs] of off.laps) {
    const t = [...secs.values()].find((v) => v.sectionType === 'lap_total');
    if (t) officialLap.set(lap, t.timeSeconds);
  }
  if (officialLap.size < MIN_OFFICIAL_LAPS) {
    notCompared.push({...row, reason: `official Section Results carry ${officialLap.size} lap times`});
    continue;
  }
  const pack = await loadPack(race.pack);
  const derived = bryceLapTimes(pack, car);
  const aligned = alignResiduals(derived, officialLap);
  if (!aligned) {
    notCompared.push({...row, reason: `fewer than 5 feed laps for car #${car} line up with the official laps`});
    continue;
  }
  const differing = aligned.pairs.filter((p) => Math.abs(p.residual) >= SAME_TICK);
  fullLap.push({
    ...row,
    officialRaceLabel: off.raceLabel,
    lapOffset: aligned.offset,
    lapsCompared: aligned.pairs.length,
    lapsMatching: aligned.pairs.length - differing.length,
    lapsDiffering: differing.map((p) => ({
      officialLap: p.officialLap,
      derivedSeconds: round(p.derived, 4),
      officialSeconds: p.official,
      residualSeconds: round(p.residual, 4),
    })),
    residualStats: stats(aligned.residuals),
  });
}

// ---- Nashville published sub-section residuals (auto-mapped span) ----
const nashvilleRaces = raceSessions.filter((s) => /Nashville/i.test(s.venue) && s.sessionCode === 'R');
const fineNashville = ['S1', 'S2A', 'S2B', 'S3A', 'S3B', 'S4A', 'S4B', 'S5'];
const subSection = [];
for (const race of nashvilleRaces) {
  const match = resolveRace(race);
  if (match.reason) continue;
  const {off, car} = match;
  const pack = await loadPack(race.pack);
  const publishedNames = [...new Set([...off.laps.values()].flatMap((m) => [...m.keys()]))].filter((n) => {
    const t = [...off.laps.values()].map((m) => m.get(n)).find(Boolean);
    return t && t.sectionType !== 'lap_total';
  });
  const mappings = [];
  for (const pubName of publishedNames) {
    const officialSeries = new Map();
    for (const [lap, secs] of off.laps) if (secs.get(pubName)) officialSeries.set(lap, secs.get(pubName).timeSeconds);
    // Candidate feed spans = every contiguous run of the fine partition.
    let best = null;
    for (let i = 0; i < fineNashville.length; i += 1) {
      for (let j = i; j < fineNashville.length; j += 1) {
        const span = fineNashville.slice(i, j + 1);
        const derived = bryceSpanTimes(pack, car, span);
        const aligned = alignResiduals(derived, officialSeries);
        if (aligned && (!best || aligned.mad < best.mad)) best = {span, ...aligned};
      }
    }
    if (best)
      mappings.push({
        publishedSection: pubName,
        mappedFeedSpan: best.span.join('+'),
        lapOffset: best.offset,
        residualStats: stats(best.residuals),
      });
  }
  subSection.push({id: race.id, year: race.year, bryceCar: car, mappings});
}

const tickExact = fullLap.filter((r) => r.residualStats.medianAbsResidual === 0).length;
const lapsCompared = fullLap.reduce((n, r) => n + r.lapsCompared, 0);
const lapsMatching = fullLap.reduce((n, r) => n + r.lapsMatching, 0);
const racesWithDifferingLaps = fullLap.filter((r) => r.lapsDiffering.length);
const differingNote = racesWithDifferingLaps.length
  ? `The laps that differ are in ${racesWithDifferingLaps.map((r) => `${r.year} ${r.venue} (${r.lapsDiffering.length})`).join(', ')}; each is listed under lapsDiffering.`
  : 'No lap differs.';
const report = {
  axis: 'b_section_times_vs_official_pdf',
  generatedAt: new Date().toISOString(),
  method:
    "Bryce's section times computed as differences of his loop-crossing timestamps, compared per lap to parsed official Section Results. Each race is compared with its own official session (from the timing-coverage ledger) and the car Bryce drove in it (from the official results in the career dataset). Full-lap uses the S/F->S/F boundary and excludes each race's opening lap; a lap matches when both times are the same value at the feed's 0.0001 s tick. Nashville sub-sections are mapped to the best-matching feed span. The official results come from the same timing system as the feed, so agreement tests the decoding, not the timing system's accuracy.",
  summary: {
    raceSessions: raceSessions.length,
    fullLapRaces: fullLap.length,
    fullLapRacesTickExactMedian: tickExact,
    fullLapRacesEveryLapMatching: fullLap.length - racesWithDifferingLaps.length,
    lapsCompared,
    lapsMatching,
    racesNotCompared: notCompared.length,
    interpretation:
      `${fullLap.length} of the ${raceSessions.length} races have official lap times to check against. In those races ${lapsMatching} of Bryce's ${lapsCompared} laps rebuilt from the timing feed equal the official lap time. ${differingNote} The other ${notCompared.length} races have no usable official lap times (racesNotCompared). The official results come from the same timing system as the feed, so the match shows the feed was decoded without losing, doubling or misassigning one of his start/finish crossings; it does not measure timing accuracy.`,
  },
  fullLapResiduals: fullLap,
  racesNotCompared: notCompared,
  nashvilleSubSectionResiduals: subSection,
};
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'section-time-residuals.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('\nAxis (b): section-time residuals vs official PDFs\n');
console.log('FULL-LAP (S/F->S/F derived delta vs official "Lap"), Bryce per lap:');
console.log('venue\t\t\tyear\tcar\tofficial\t\t\tmatch\tmedRes(s)\tmedAbs(s)\tp95Abs(s)');
for (const r of fullLap) {
  const s = r.residualStats;
  console.log(`${(r.venue || '').slice(0, 20).padEnd(20)}\t${r.year}\t#${r.bryceCar}\t${r.officialSessionId}\t${r.lapsMatching}/${r.lapsCompared}\t${s.medianResidual}\t\t${s.medianAbsResidual}\t\t${s.p95AbsResidual}`);
  for (const d of r.lapsDiffering) console.log(`    official lap ${d.officialLap}: feed ${d.derivedSeconds}s, official ${d.officialSeconds}s, residual ${d.residualSeconds}s`);
}
console.log(`\n${lapsMatching}/${lapsCompared} laps match; ${tickExact}/${fullLap.length} races exact at the median; ${fullLap.length} of ${raceSessions.length} races compared.`);
console.log('\nNOT COMPARED:');
for (const r of notCompared) console.log(`  ${r.id} (${r.officialSessionId ?? 'no session'}): ${r.reason}`);
console.log('\nNASHVILLE published sub-sections (mapped to feed span):');
for (const race of subSection) {
  console.log(`  ${race.year} (car #${race.bryceCar}):`);
  for (const m of race.mappings) {
    const s = m.residualStats;
    console.log(`    "${m.publishedSection.slice(0, 40)}" -> ${m.mappedFeedSpan} | n=${s.n} medAbs=${s.medianAbsResidual}s p95=${s.p95AbsResidual}s`);
  }
}
