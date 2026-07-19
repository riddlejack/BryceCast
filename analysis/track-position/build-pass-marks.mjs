#!/usr/bin/env node
/**
 * Pass-mark UI packs (heat-map v2, item 7).
 *
 * Distils the pass-placement lane into one small JSON pack per GO race for the
 * UI: every `on_track_green` Bryce-involving pass, bracketed to the between-loop
 * interval where it happened, with the other car resolved to a name. The heat
 * map renders each as a quiet open circle at that interval's span; the drawer
 * carries the race's lap-chart concordance. CONDITIONAL races are excluded — no
 * pack, no marks (Iowa 2024/2025, Portland 2025).
 *
 * Input (committed, no lake read):
 *   - output/validation/accuracy.json        (per-race verdict + concordance)
 *   - output/races/<feedId>.passes.ndjson.gz (bryce_pass records)
 *   - ../semantic-layer/output/sessions/<feedId>.ndjson.gz (classification -> names)
 *
 * Output:
 *   - output/context-packs/pass_marks_<canonicalSessionId>.json  (one per GO race)
 *
 * Placement language stays "a pass involving Bryce, placed between timing
 * loops" — no sub-interval precision, no GPS, no causal copy. Pit-cycle and
 * caution reshuffles are NOT drawn; their counts ride the drawer as text.
 *
 * Usage:  node analysis/track-position/build-pass-marks.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PACKS = join(HERE, 'output', 'context-packs');
const SESSIONS = join(HERE, '..', 'semantic-layer', 'output', 'sessions');

const readNdjsonGz = (path) =>
  gunzipSync(readFileSync(path))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

const nameForCars = (feedSessionId) => {
  try {
    const rows = readNdjsonGz(join(SESSIONS, `${feedSessionId}.ndjson.gz`));
    const byCar = new Map();
    for (const row of rows) {
      if (row.record !== 'classification') continue;
      const surname = (row.lastName || row.firstName || '').trim();
      if (surname) byCar.set(String(row.car), surname);
    }
    return byCar;
  } catch {
    return new Map();
  }
};

const main = () => {
  const accuracy = JSON.parse(readFileSync(join(HERE, 'output', 'validation', 'accuracy.json'), 'utf8'));
  const goRaces = accuracy.races.filter((race) => race.verdict === 'GO');
  mkdirSync(OUT_PACKS, { recursive: true });
  const refs = [];

  for (const race of goRaces) {
    const passPack = readNdjsonGz(join(HERE, 'output', 'races', `${race.feedSessionId}.passes.ndjson.gz`));
    const meta = passPack.find((row) => row.record === 'race_meta');
    const names = nameForCars(race.feedSessionId);

    const greenPasses = passPack
      .filter((row) => row.record === 'bryce_pass' && row.class === 'on_track_green')
      .map((row) => ({
        lap: row.lap,
        direction: row.direction, // 'gain' = Bryce past the other car; 'loss' = the other car by him
        otherCar: row.otherCar,
        otherName: names.get(String(row.otherCar)) ?? `Car ${row.otherCar}`,
        fromLoop: row.fromLoop,
        toLoop: row.toLoop,
        intervalLabel: row.intervalLabel
      }))
      .sort((a, b) => a.lap - b.lap);

    const reshuffleCounts = {
      pit_cycle: meta.passTotals?.pit_cycle ?? 0,
      caution: meta.passTotals?.caution ?? 0
    };

    const pack = {
      schemaVersion: 'brycecast.passMarks.v1',
      type: 'pass_marks',
      id: `pass_marks_${meta.canonicalSessionId}`,
      generatedAt: '2026-07-19T00:00:00.000Z',
      sessionId: meta.canonicalSessionId,
      feedSessionId: race.feedSessionId,
      venueName: meta.venue,
      seasonYear: meta.year,
      bryceCar: meta.bryceCar,
      verdict: 'GO',
      pairwiseConcordancePct: race.pairwiseConcordancePct,
      greenPasses,
      reshuffleCounts,
      sourceTier: 'racetools_capture',
      sourceRefs: [
        {
          key: 'passPlacement',
          path: `analysis/track-position/output/races/${race.feedSessionId}.passes.ndjson.gz`,
          note: 'Geometric passes from the RaceTools loop-crossing tables — a relative-order flip between two consecutive physical loops, bracketed to that between-loop interval. The feed carries no live running order.'
        },
        {
          key: 'passPlacementAccuracy',
          path: 'analysis/track-position/output/validation/accuracy.json',
          note: `Pass placement validated ${race.pairwiseConcordancePct}% against the official lap chart (pairwise order concordance).`
        }
      ],
      caveats: [
        'A pass involving Bryce, placed between timing loops — no sub-interval, GPS, or causal claim.',
        'Only green-flag, on-track passes are drawn; pit-cycle and caution reshuffles are counted, not marked.',
        'Not an official BryceCast fact — derived from a third-party RaceTools capture.'
      ]
    };

    writeFileSync(join(OUT_PACKS, `${pack.id}.json`), `${JSON.stringify(pack)}\n`);
    refs.push({
      sessionId: pack.sessionId,
      venueName: pack.venueName,
      seasonYear: pack.seasonYear,
      greenPassCount: greenPasses.length,
      concordance: race.pairwiseConcordancePct
    });
  }

  console.log(`\nPass-mark packs written for ${refs.length} GO races (CONDITIONAL races excluded):`);
  for (const ref of refs.sort((a, b) => a.sessionId.localeCompare(b.sessionId))) {
    console.log(`  ${ref.sessionId}  ${ref.venueName.slice(0, 24).padEnd(24)}  green passes ${ref.greenPassCount}  concordance ${ref.concordance}%`);
  }
};

main();
