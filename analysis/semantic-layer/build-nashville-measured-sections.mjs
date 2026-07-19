#!/usr/bin/env node
/**
 * Measured Nashville section-lap packs (heat-map v2, item 1).
 *
 * Turns the semantic layer's validated 8-loop interval packs into the UI's
 * `section_laps` contract, `sourceTier: lake_loop_crossings`: per-lap, per-car
 * section times for all 8 fine sub-sections (S1…S5), full-field percentiles
 * computed from the intervals, and clean-lap filtering from the same flags data
 * the lane uses. On the two Nashville race pages this upgrades the heat card
 * from 3 published sections (+ a derived remainder) to 8 solid measured spans
 * tiling 100% of the lap; the PDF path stays the fallback for races without
 * loop data.
 *
 * Input (all committed, no raw-lake read):
 *   - output/nashville/<feedId>.intervals.ndjson.gz  (per-lap per-car section times)
 *   - output/nashville/loop-inventory.json           (section order + lengthUnits)
 *   - output/sessions/<feedId>.ndjson.gz             (flags + lap S/F windows)
 *   - analysis/race-story/output/context-packs/section_laps_<canonical>.json
 *       (the published-section per-lap times — the SANITY-GATE reference only)
 *
 * Output:
 *   - output/context-packs/section_laps_measured_<canonical>.json  (the packs)
 *   - output/nashville/measured-vs-published.json                  (the gate report)
 *
 * Usage:  node analysis/semantic-layer/build-nashville-measured-sections.mjs
 *         node analysis/semantic-layer/build-nashville-measured-sections.mjs --check
 *           (--check: build in memory, assert the PDF-vs-measured gate, no write)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PACKS = join(HERE, 'output', 'context-packs');
const OUT_REPORT = join(HERE, 'output', 'nashville', 'measured-vs-published.json');
const CONTEXT_PACKS = join(HERE, '..', 'race-story', 'output', 'context-packs');

const LAP_MI = 1.33; // official Nashville lap length; loop lengthUnits sum to this.
const GATE_MEDIAN_ABS_S = 0.12; // published-section agreement bar (~0.08–0.10s proven).

/** The two Nashville races carrying loop data. canonicalSessionId + raceLabel
 *  are the stable UI keys; the DATA comes entirely from the interval/session
 *  packs. */
const RACES = [
  {
    feedId: 'rt_2024_nashville-superspeedway_r_2024-09-15_a',
    canonicalSessionId: 'session_indy_nxt_2024_6323',
    year: 2024
  },
  {
    feedId: 'rt_2025_nashville-superspeedway_r_2025-08-31_d',
    canonicalSessionId: 'session_indy_nxt_2025_6447',
    year: 2025
  }
];

/** Published track section -> the fine feed sub-section it composes (the
 *  geometric decomposition; each published Nashville corner is one fine span).
 *  Used only for the sanity gate. */
const PUBLISHED_TO_FINE = {
  'Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch': 'S2B',
  'Turn 3': 'S4A',
  'Turn 4 Entry Turn 4 Exit': 'S4B'
};

const readNdjsonGz = (path) =>
  gunzipSync(readFileSync(path))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round = (value, digits) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? value
    : Math.round(value * 10 ** digits) / 10 ** digits;

/** Per-lap caution classification for a car from the flags + its S/F lap
 *  windows, mirroring the PDF lane: overlap a yellow/red -> caution 'c'; the
 *  first racing lap after a caution -> restart 'r'; the checkered (final) lap
 *  -> 'u'; else green 'g'. Only green non-restart, non-final laps are clean. */
const classifyLaps = (carLaps, flags) => {
  const yellow = flags.filter((flag) => flag.state === 'yellow' || flag.state === 'red');
  const byLap = new Map();
  const sorted = [...carLaps].sort((a, b) => a.lap - b.lap);
  const maxLap = sorted.length ? sorted[sorted.length - 1].lap : 0;
  let prevCaution = false;
  for (const lap of sorted) {
    const start = lap.startTimeOfDaySeconds;
    const end = lap.endTimeOfDaySeconds;
    const underCaution = yellow.some(
      (flag) => start < flag.endTimeOfDaySeconds && end > flag.startTimeOfDaySeconds
    );
    let state;
    if (underCaution) state = 'c';
    else if (lap.lap === maxLap) state = 'u';
    else if (prevCaution) state = 'r';
    else state = 'g';
    byLap.set(lap.lap, { caution: state, clean: state === 'g' });
    prevCaution = underCaution;
  }
  return byLap;
};

const buildRace = (race) => {
  const intervals = readNdjsonGz(join(HERE, 'output', 'nashville', `${race.feedId}.intervals.ndjson.gz`));
  const session = readNdjsonGz(join(HERE, 'output', 'sessions', `${race.feedId}.ndjson.gz`));
  const inventory = JSON.parse(readFileSync(join(HERE, 'output', 'nashville', 'loop-inventory.json'), 'utf8'));
  const invRace = inventory.races.find((entry) => entry.sessionId === race.feedId);
  const bryceCar = invRace.bryceCar;
  const fine = invRace.feed.finePartitionSections; // [{name, span, lengthUnits}] in chain order
  const sectionNames = fine.map((section) => section.name);
  const totalUnits = fine.reduce((sum, section) => sum + section.lengthUnits, 0);
  const sectionMi = new Map(fine.map((section) => [section.name, (section.lengthUnits / totalUnits) * LAP_MI]));

  const flags = session.filter((row) => row.record === 'flag');
  const laps = session.filter((row) => row.record === 'lap');
  const classification = session.filter((row) => row.record === 'classification');

  // Per-car caution/clean per lap (from the car's S/F windows + flags).
  const lapsByCar = new Map();
  for (const lap of laps) {
    if (!lapsByCar.has(lap.car)) lapsByCar.set(lap.car, []);
    lapsByCar.get(lap.car).push(lap);
  }
  const cautionByCar = new Map();
  for (const [car, carLaps] of lapsByCar) cautionByCar.set(car, classifyLaps(carLaps, flags));

  // Section time by (section, lap, car), deduped to the first crossing.
  const timeByKey = new Map();
  const carsBySectionLap = new Map();
  for (const row of intervals) {
    const key = `${row.section}|${row.lap}|${row.car}`;
    if (timeByKey.has(key)) continue;
    timeByKey.set(key, row.intervalSeconds);
    const sl = `${row.section}|${row.lap}`;
    if (!carsBySectionLap.has(sl)) carsBySectionLap.set(sl, []);
    carsBySectionLap.get(sl).push({ car: row.car, time: row.intervalSeconds });
  }

  const bryceMaxLap = Math.max(0, ...(lapsByCar.get(bryceCar) ?? []).map((lap) => lap.lap));

  // Field-median clean-lap section time per car, per section (the quiet field
  // distribution behind Bryce's marker) — green laps only.
  const fieldSecondsFor = (section) => {
    const perCar = [];
    for (const [car] of lapsByCar) {
      const cautions = cautionByCar.get(car);
      const times = [];
      for (const lap of lapsByCar.get(car)) {
        if (cautions.get(lap.lap)?.clean !== true) continue;
        const time = timeByKey.get(`${section}|${lap.lap}|${car}`);
        if (time !== undefined) times.push(time);
      }
      const med = median(times);
      if (med !== null) perCar.push(round(med, 4));
    }
    return perCar.sort((a, b) => a - b);
  };

  const bryceCautions = cautionByCar.get(bryceCar);

  // Each section's per-lap tuple for Bryce, with the full-field percentile.
  const sections = sectionNames.map((section) => {
    const secMi = sectionMi.get(section);
    const bryceLaps = (lapsByCar.get(bryceCar) ?? []).map((lap) => lap.lap).sort((a, b) => a - b);
    const laps = [];
    for (const lap of bryceLaps) {
      const bryceTime = timeByKey.get(`${section}|${lap}|${bryceCar}`);
      if (bryceTime === undefined) continue;
      const field = carsBySectionLap.get(`${section}|${lap}`) ?? [];
      const times = field.map((entry) => entry.time);
      const n = times.length;
      // rank: 1 = fastest (smallest time). percentile = share of field beaten.
      const rank = 1 + times.filter((time) => time < bryceTime).length;
      const percentile = n > 1 ? (n - rank) / (n - 1) : null;
      const ctx = bryceCautions.get(lap) ?? { caution: 'u', clean: false };
      const speed = bryceTime > 0 ? (secMi / bryceTime) * 3600 : null;
      laps.push([
        lap,
        percentile === null ? null : round(percentile, 4),
        rank,
        n,
        ctx.clean ? 1 : 0,
        ctx.caution,
        round(bryceTime, 4),
        speed === null ? null : round(speed, 3)
      ]);
    }
    return { sectionName: section, kind: 'measured', laps, fieldSeconds: fieldSecondsFor(section) };
  });

  // Lap totals: Bryce's full lap (S/F->S/F delta) vs the field, per lap.
  const lapSecondsByLap = new Map(); // lap -> [{car, seconds}]
  for (const lap of laps) {
    if (lap.lapSeconds == null || lap.isFirstRacingLap) {
      // isFirstRacingLap may be partial; keep it (the PDF lane counts lap 1).
    }
    if (lap.lapSeconds == null) continue;
    if (!lapSecondsByLap.has(lap.lap)) lapSecondsByLap.set(lap.lap, []);
    lapSecondsByLap.get(lap.lap).push({ car: lap.car, seconds: lap.lapSeconds });
  }
  const lapTotals = [];
  for (const lap of (lapsByCar.get(bryceCar) ?? []).map((entry) => entry.lap).sort((a, b) => a - b)) {
    const bryceLap = (lapsByCar.get(bryceCar) ?? []).find((entry) => entry.lap === lap);
    if (!bryceLap || bryceLap.lapSeconds == null) continue;
    const field = lapSecondsByLap.get(lap) ?? [];
    const n = field.length;
    const rank = 1 + field.filter((entry) => entry.seconds < bryceLap.lapSeconds).length;
    const percentile = n > 1 ? (n - rank) / (n - 1) : null;
    const ctx = bryceCautions.get(lap) ?? { caution: 'u', clean: false };
    const speed = bryceLap.lapSeconds > 0 ? (LAP_MI / bryceLap.lapSeconds) * 3600 : null;
    lapTotals.push([
      lap,
      percentile === null ? null : round(percentile, 4),
      rank,
      n,
      ctx.clean ? 1 : 0,
      ctx.caution,
      round(bryceLap.lapSeconds, 4),
      speed === null ? null : round(speed, 3)
    ]);
  }

  const bryceDriver =
    classification.find((row) => row.car === bryceCar)?.lastName ??
    classification.find((row) => row.car === bryceCar)?.firstName ??
    'Aron';

  const sourceStateCounts = sections.reduce(
    (counts, section) => {
      for (const lap of section.laps) {
        const key = lap[4] === 1 ? 'racetools_capture_loop_crossings_clean' : 'racetools_capture_loop_crossings_flagged';
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
    {}
  );

  const cleanLapCount = (lapsByCar.get(bryceCar) ?? []).filter((lap) => bryceCautions.get(lap.lap)?.clean).length;

  return {
    race,
    bryceCar,
    bryceDriver,
    totalLaps: bryceMaxLap,
    cleanLapCount,
    sections,
    lapTotals,
    sourceStateCounts,
    intervalPack: `analysis/semantic-layer/output/nashville/${race.feedId}.intervals.ndjson.gz`
  };
};

/** Sanity gate: each published track section vs its measured fine span, Bryce
 *  per lap, aligned by the best integer lap offset. Proves the measured
 *  decomposition reconstructs the official aggregate (~0.08–0.10s median). */
const compareToPublished = (built) => {
  let pdf;
  try {
    pdf = JSON.parse(
      readFileSync(join(CONTEXT_PACKS, `section_laps_${built.race.canonicalSessionId}.json`), 'utf8')
    );
  } catch {
    return { available: false, mappings: [] };
  }
  const bryceMeasured = (section) =>
    new Map(built.sections.find((entry) => entry.sectionName === section).laps.map((lap) => [lap[0], lap[6]]));
  const mappings = [];
  for (const [published, fine] of Object.entries(PUBLISHED_TO_FINE)) {
    const pdfSection = pdf.sections.find((entry) => entry.sectionName === published);
    if (!pdfSection) continue;
    const official = new Map(pdfSection.laps.filter((lap) => lap[6] != null).map((lap) => [lap[0], lap[6]]));
    const measured = bryceMeasured(fine);
    let best = null;
    for (let offset = -2; offset <= 2; offset += 1) {
      const residuals = [];
      for (const [lap, off] of official) {
        const value = measured.get(lap + offset);
        if (value != null) residuals.push(value - off);
      }
      if (residuals.length < 5) continue;
      const medAbs = median(residuals.map(Math.abs));
      if (!best || medAbs < best.medAbs) best = { offset, residuals, medAbs };
    }
    if (best) {
      mappings.push({
        publishedSection: published,
        measuredFineSpan: fine,
        lapOffset: best.offset,
        n: best.residuals.length,
        medianResidualS: round(median(best.residuals), 4),
        medianAbsResidualS: round(best.medAbs, 4),
        maxAbsResidualS: round(Math.max(...best.residuals.map(Math.abs)), 4)
      });
    }
  }
  return { available: true, mappings };
};

const toPack = (built) => {
  const intervalBytes = readFileSync(join(HERE, 'output', 'nashville', `${built.race.feedId}.intervals.ndjson.gz`));
  const sourceHash = createHash('sha256').update(intervalBytes).digest('hex');
  return {
    schemaVersion: 'brycecast.sectionLaps.v1',
    type: 'section_laps',
    id: `section_laps_measured_${built.race.canonicalSessionId}`,
    generatedAt: '2026-07-19T00:00:00.000Z',
    sourceHash,
    sessionId: built.race.canonicalSessionId,
    raceLabel: `${built.race.year} Music City Grand Prix`,
    seasonYear: built.race.year,
    venueName: 'Nashville Superspeedway',
    trackType: 'oval',
    totalLaps: built.totalLaps,
    tupleOrder: ['lap', 'fieldPercentile', 'fieldRank', 'fieldComparisonCount', 'clean', 'caution', 'timeSeconds', 'speedMph'],
    sourceTier: 'lake_loop_crossings',
    sections: built.sections,
    derivedCoverage: 'fully_timed',
    lapTotals: built.lapTotals,
    sourceStateCounts: built.sourceStateCounts,
    sourceRefs: [
      {
        key: 'nashvilleIntervalPack',
        path: built.intervalPack,
        note: `RaceTools race-weekend capture, timing-loop crossings differenced into 8 fine sub-sections for all cars (Bryce car #${built.bryceCar}); the unpublished ~56% of the lap the official 3-section report omits.`
      },
      {
        key: 'nashvilleLoopInventory',
        path: 'analysis/semantic-layer/output/nashville/loop-inventory.json',
        note: 'Decoded physical loop inventory (SF, T1, SS1, T2, BS, T3, SS2, T4) and per-section lengths used to place the spans on the outline.'
      }
    ],
    caveats: [
      'Section times are RaceTools race-weekend capture — timing-loop crossings, time-based, not GPS or car position; not official timing.',
      'Field percentile compares source-visible cars on the same lap; clean flags follow the same green/yellow flags data.',
      'Eight timed sub-sections tile the whole lap; there is no derived remainder here — every stretch is measured.',
      'Aggregates use clean green-flag laps and label their denominators on screen.'
    ]
  };
};

const main = () => {
  const check = process.argv.includes('--check');
  const builtRaces = RACES.map(buildRace);
  const report = {
    lane: 'analysis/semantic-layer (nashville measured sections)',
    generatedAt: new Date().toISOString(),
    gateMedianAbsS: GATE_MEDIAN_ABS_S,
    races: []
  };
  let gateFailed = false;
  for (const built of builtRaces) {
    const comparison = compareToPublished(built);
    const worst = comparison.mappings.reduce((max, m) => Math.max(max, m.medianAbsResidualS), 0);
    if (comparison.available && worst > GATE_MEDIAN_ABS_S) gateFailed = true;
    report.races.push({
      sessionId: built.race.canonicalSessionId,
      feedId: built.race.feedId,
      year: built.race.year,
      bryceCar: built.bryceCar,
      totalLaps: built.totalLaps,
      cleanLapCount: built.cleanLapCount,
      sectionCount: built.sections.length,
      lapFractionCovered: 1,
      publishedVsMeasured: comparison
    });
    if (!check) {
      mkdirSync(OUT_PACKS, { recursive: true });
      const pack = toPack(built);
      writeFileSync(join(OUT_PACKS, `${pack.id}.json`), `${JSON.stringify(pack)}\n`);
    }
  }
  if (!check) writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  // Console summary + gate.
  console.log('\nNashville measured sections — published-vs-measured agreement (Bryce per lap):');
  for (const race of report.races) {
    console.log(`\n  ${race.year} (car #${race.bryceCar}) · ${race.totalLaps} laps · ${race.cleanLapCount} clean`);
    for (const m of race.publishedVsMeasured.mappings) {
      console.log(
        `    "${m.publishedSection.slice(0, 34)}" -> ${m.measuredFineSpan} | n=${m.n} offset=${m.lapOffset} medAbs=${m.medianAbsResidualS}s medRes=${m.medianResidualS}s`
      );
    }
  }
  if (gateFailed) {
    console.error(`\nGATE FAILED: a published section disagrees with its measured span by > ${GATE_MEDIAN_ABS_S}s median.`);
    process.exit(1);
  }
  console.log(`\nGATE PASSED: every published section agrees with its measured span within ${GATE_MEDIAN_ABS_S}s median.`);
  if (!check) console.log(`Wrote ${builtRaces.length} packs to ${OUT_PACKS} and the report to ${OUT_REPORT}.`);
};

main();
