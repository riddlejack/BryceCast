#!/usr/bin/env node
// Track-position pass-placement — BUILD. For every clean 2024-25 INDY NXT race,
// extract every position change to the between-loop interval where it happened,
// classify it (on_track_green / pit_cycle / caution / start_lap / unresolved),
// locate incident candidates, and emit a compact per-race pack plus a summary.
//
// Input: the semantic layer's committed loop-crossing packs (this lane's only
// data source). Ground truth (official lap chart + incidents) is read read-only
// from the master worktree for the per-lap Bryce position context and located
// incidents. Nothing here is user-visible; the validator gates any UI claim.

import {join} from 'node:path';
import {loadPack, extractRace, deriveSFOrder, resolveBryce, buildIntervalStats, locateSlowdown, SOURCE_TIER} from './lib/pass-placement.mjs';
import {loadGroundTruth, mapFeedToCanonical} from './lib/ground-truth.mjs';
import {loadSemanticSummary, cleanRaces, excludedRaces, SESSIONS_DIR, OUTPUT_DIR, writeGzipNdjson, writeJson} from './lib/io.mjs';

const summary = await loadSemanticSummary();
const races = cleanRaces(summary);
const gt = await loadGroundTruth();
const feedToCanon = mapFeedToCanonical(races, gt.raceSessions);

console.log(`Building pass placement for ${races.length} clean 2024-25 NXT races.`);

const index = [];
for (const s of races) {
  const pack = loadPack(SESSIONS_DIR, s.id);
  const race = extractRace(pack);
  const bryce = resolveBryce(pack);
  const canonId = feedToCanon.get(s.id);
  const officialLapChart = canonId ? gt.lapChart.get(canonId) : null;
  const officialIncidents = canonId ? gt.incidents.get(canonId) || [] : [];
  const stats = buildIntervalStats(race);

  // Field-wide pass counts by class + per-lap counts.
  const byClass = {};
  const perLap = new Map();
  for (const p of race.passes) {
    byClass[p.class] = (byClass[p.class] || 0) + 1;
    perLap.set(p.lap, (perLap.get(p.lap) || 0) + 1);
  }

  // Bryce-involving position changes: every one, with the bracketed interval.
  const bryceCar = bryce.car;
  const brycePasses = race.passes
    .filter((p) => p.gainer === bryceCar || p.loser === bryceCar)
    .map((p) => ({
      record: 'bryce_pass',
      lap: p.lap,
      direction: p.gainer === bryceCar ? 'gain' : 'loss',
      bryceCar,
      otherCar: p.gainer === bryceCar ? p.loser : p.gainer,
      fromLoop: p.fromLoop,
      toLoop: p.toLoop,
      intervalLabel: p.intervalLabel,
      class: p.class,
      sourceTier: SOURCE_TIER,
    }));

  // Located-incident candidates: for each official incident, the between-loop
  // interval where the mentioned car(s) lost the most time on that lap
  // (descriptive; the official turn text stays the authority for WHERE).
  const incidentCandidates = [];
  for (const inc of officialIncidents) {
    if (inc.lap == null) continue;
    for (const car of inc.cars.length ? inc.cars : []) {
      const slow = locateSlowdown(stats, car, inc.lap);
      if (slow && slow.ratio >= 1.25) {
        incidentCandidates.push({
          record: 'incident_candidate',
          lap: inc.lap,
          car,
          officialTurn: inc.turn,
          officialReason: inc.reason,
          locatedInterval: slow.intervalLabel,
          slowdownRatio: slow.ratio,
          observedSeconds: slow.observedSeconds,
          medianSeconds: slow.medianSeconds,
          sourceTier: SOURCE_TIER,
        });
      }
    }
  }

  // Per-lap Bryce position track (my derived S/F order + official, where mapped).
  const bryceTrack = [];
  for (let L = 1; L <= race.maxLap; L++) {
    const mine = deriveSFOrder(race, L).get(bryceCar) ?? null;
    const off = officialLapChart && officialLapChart.get(L) ? officialLapChart.get(L).get(bryceCar) ?? null : null;
    if (mine != null || off != null) bryceTrack.push({lap: L, derivedPosition: mine, officialPosition: off});
  }

  const bryceGreen = brycePasses.filter((p) => p.class === 'on_track_green');
  const meta = {
    record: 'race_meta',
    feedSessionId: s.id,
    canonicalSessionId: canonId,
    year: s.year,
    date: s.date,
    venue: s.venue,
    sessionCode: s.sessionCode,
    bryceCar,
    bryceDriver: bryce.driver,
    mainlineGates: race.gates,
    startFinishLoop: race.sf,
    fieldSize: race.cars.length,
    maxLap: race.maxLap,
    passTotals: byClass,
    bryce: {
      totalInvolving: brycePasses.length,
      greenGains: bryceGreen.filter((p) => p.direction === 'gain').length,
      greenLosses: bryceGreen.filter((p) => p.direction === 'loss').length,
      allGains: brycePasses.filter((p) => p.direction === 'gain').length,
      allLosses: brycePasses.filter((p) => p.direction === 'loss').length,
    },
    qualityMasks: s.qualityMasks || [],
    sourceTier: SOURCE_TIER,
    provenanceNote:
      'Derived from RaceTools loop-crossing tables (semantic layer). Passes are geometric (time-gap order flips between physical timing loops); the feed carries no live running order. Placement is bracketed to a between-loop interval — no sub-interval, GPS, or causal claim. Not an official BryceCast fact.',
  };

  const rows = [meta];
  for (const p of race.passes) rows.push({record: 'pass', ...p, sourceTier: SOURCE_TIER});
  for (const b of brycePasses) rows.push(b);
  for (const c of incidentCandidates) rows.push(c);
  for (const t of bryceTrack) rows.push({record: 'bryce_position', ...t});
  await writeGzipNdjson(join(OUTPUT_DIR, 'races', `${s.id}.passes.ndjson.gz`), rows);

  index.push({
    feedSessionId: s.id,
    canonicalSessionId: canonId,
    year: s.year,
    date: s.date,
    venue: s.venue,
    sessionCode: s.sessionCode,
    bryceCar,
    bryceDriver: bryce.driver,
    fieldSize: race.cars.length,
    maxLap: race.maxLap,
    mainlineGateCount: race.gates.length,
    passTotals: byClass,
    totalPasses: race.passes.length,
    bryce: meta.bryce,
    incidentCandidates: incidentCandidates.length,
    pack: `races/${s.id}.passes.ndjson.gz`,
  });

  console.log(
    `  ${s.date} ${s.venue.slice(0, 24).padEnd(24)} #${String(bryceCar).padStart(2)} passes=${String(race.passes.length).padStart(3)} ` +
    `Bryce green ${meta.bryce.greenGains}+/${meta.bryce.greenLosses}- inc=${incidentCandidates.length}`,
  );
}

await writeJson(join(OUTPUT_DIR, 'pass-placement-summary.json'), {
  lane: 'analysis/track-position',
  slice: 'pass-placement-2024-25',
  generatedAt: new Date().toISOString(),
  sourceTier: SOURCE_TIER,
  inputLane: 'analysis/semantic-layer (loop-crossing tables)',
  raceCount: index.length,
  excludedCaptures: excludedRaces(summary).map((s) => ({id: s.id, date: s.date, venue: s.venue, qualityMasks: s.qualityMasks || [], error: s.error || null})),
  provenanceNote:
    'Green-flag on-track passes are the headline class; pit-cycle and caution reshuffles are labelled separately, never mixed. Placement language is always "between the <A> and <B> loops"; the interval labels use the official loop names from the crossings tables.',
  races: index,
});

console.log(`\nDone. ${index.length} races. Summary: output/pass-placement-summary.json`);
