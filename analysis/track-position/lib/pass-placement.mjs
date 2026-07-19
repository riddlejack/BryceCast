// Track-position pass-placement — core extraction over the semantic layer's
// loop-crossing tables (analysis/semantic-layer/output/sessions/*.ndjson.gz).
//
// Method (charter Brief I, now pure extraction). Position on track is fully
// determined by timing-loop crossings; the RaceTools $S records carry NO live
// running order (their position field is the constant starting-grid seed — see
// README), so running order and passes are derived GEOMETRICALLY from the
// crossing timestamps, never read from the feed.
//
// Per race, per lap, the field crosses a chain of physical timing loops (gates)
// that tile the lap. Ordering the cars by crossing time at each gate gives the
// running order at that gate; a pair of cars whose relative order flips between
// two consecutive gates was overtaken in that between-loop interval. Each pass
// is bracketed to [loopA -> loopB] and labelled with the official loop names
// from the crossings tables. Nothing here implies sub-interval precision, GPS,
// or cause.
//
// Source tier of every derived row is the same as its input: racetools_capture
// (a third-party capture; not an official BryceCast fact).

import fs from 'node:fs';
import zlib from 'node:zlib';

export const SOURCE_TIER = 'racetools_capture';

// A loop is a pit path (not a mainline running-order gate) when its name marks
// pit in / pit out / the S/F-pit line. These carry only pitting cars.
const isPitLoop = (l) => /^(P|SFP|PI|PO|PIC)/i.test(l || '');

export function loadPack(sessionsDir, sessionId) {
  const buf = zlib.gunzipSync(fs.readFileSync(`${sessionsDir}/${sessionId}.ndjson.gz`));
  const by = {session_meta: [], geometry: [], flag: [], classification: [], lap: [], loop_crossing: []};
  for (const line of buf.toString('utf8').split('\n')) {
    if (!line) continue;
    const o = JSON.parse(line);
    (by[o.record] = by[o.record] || []).push(o);
  }
  return by;
}

// Resolve Bryce Aron to a car number FOR THIS SESSION, from the classification
// records' names. His car number changes by season (2024 #27, 2025 #9), so it
// is NEVER hardcoded — the name is the identity, the number is per-session.
export function resolveBryce(pack) {
  const c = (pack.classification || []).find((r) => /(^|\s)aron$/i.test((r.lastName || '').trim()) && /bryce/i.test(r.firstName || ''));
  return c ? {car: c.car, driver: `${c.firstName} ${c.lastName}`.trim()} : {car: null, driver: null};
}

// Ordered mainline gates (physical end-loops that tile the lap) by cumulative
// loop distance, S/F first at distance 0. Pit loops excluded.
export function buildGates(geometry) {
  const dist = geometry.loopDistances || {};
  const distOf = (l) => (dist[l] ?? dist[`${l}*`] ?? null);
  const ends = new Set();
  for (const s of geometry.sections || []) if (s.endLoop && !isPitLoop(s.endLoop) && distOf(s.endLoop) != null) ends.add(s.endLoop);
  const gates = [...ends].sort((a, b) => distOf(a) - distOf(b));
  const sf = gates.find((g) => distOf(g) === 0) ?? gates[0] ?? null;
  return {gates, sf, interGates: gates.filter((g) => g !== sf), distOf};
}

// Per-car lap map (racing lap -> lap row) from the semantic laps table.
function lapsByCar(pack) {
  const m = new Map();
  for (const l of pack.lap) {
    if (!m.has(l.car)) m.set(l.car, new Map());
    m.get(l.car).set(l.lap, l);
  }
  return m;
}

// Green intervals / non-green (yellow|red) intervals in local seconds-of-day.
function flagIntervals(pack) {
  const nonGreen = pack.flag
    .filter((f) => f.state === 'yellow' || f.state === 'red')
    .map((f) => [f.startTimeOfDaySeconds, f.endTimeOfDaySeconds ?? Infinity]);
  return {
    overlapsNonGreen: (lo, hi) => nonGreen.some(([a, b]) => a < hi && b > lo),
  };
}

// The full extraction for one race. Returns gates, per-car lap map, the pit-lap
// and green-lap classifications, and the list of detected passes (all classes).
export function extractRace(pack) {
  const geometry = pack.geometry[0];
  const {gates, sf, interGates, distOf} = buildGates(geometry);
  const crossings = pack.loop_crossing;
  const cars = [...new Set(crossings.map((c) => c.car))];
  const lapMap = lapsByCar(pack);
  const {overlapsNonGreen} = flagIntervals(pack);
  const gateSet = new Set(gates);

  // Bucket each car's mainline gate crossings into its racing laps (dedup: a
  // physical loop can be the end of several named sections — keep the earliest
  // crossing tod per gate within the lap window). The rare multi-lap tod
  // collision (car re-crossing a loop within one lapIndex) is resolved by the
  // lap window bound, so each gate maps to one crossing per lap.
  const crossByCar = new Map();
  for (const c of crossings) {
    if (isPitLoop(c.endLoop) || !gateSet.has(c.endLoop)) continue;
    if (!crossByCar.has(c.car)) crossByCar.set(c.car, []);
    crossByCar.get(c.car).push(c);
  }
  const gateCross = new Map(); // car -> Map(lap -> Map(gate -> tod))
  for (const car of cars) {
    const m = new Map();
    gateCross.set(car, m);
    const cc = crossByCar.get(car) || [];
    for (const [L, lap] of lapMap.get(car) || new Map()) {
      const gm = new Map();
      for (const c of cc) {
        if (c.timeOfDaySeconds > lap.startTimeOfDaySeconds && c.timeOfDaySeconds <= lap.endTimeOfDaySeconds) {
          if (!gm.has(c.endLoop) || c.timeOfDaySeconds < gm.get(c.endLoop)) gm.set(c.endLoop, c.timeOfDaySeconds);
        }
      }
      m.set(L, gm);
    }
  }

  // Pit laps per car: a lap whose window contains a pit-loop crossing.
  const pitLoopCross = crossings.filter((c) => isPitLoop(c.endLoop));
  const pitLapByCar = new Map();
  for (const car of cars) {
    const set = new Set();
    const pc = pitLoopCross.filter((c) => c.car === car);
    for (const [L, lap] of lapMap.get(car) || new Map())
      for (const c of pc) if (c.timeOfDaySeconds > lap.startTimeOfDaySeconds && c.timeOfDaySeconds <= lap.endTimeOfDaySeconds) set.add(L);
    pitLapByCar.set(car, set);
  }

  const maxLap = pack.lap.length ? Math.max(...pack.lap.map((l) => l.lap)) : 0;
  const lapRow = (car, L) => (lapMap.get(car) || new Map()).get(L);

  // A pass's class is a property of the LAP context of the two cars.
  function classify(L, a, b) {
    const la = lapRow(a, L), lb = lapRow(b, L);
    if (!la || !lb) return 'unresolved';
    if (L === 1) return 'start_lap';
    if ((pitLapByCar.get(a) || new Set()).has(L) || (pitLapByCar.get(b) || new Set()).has(L)) return 'pit_cycle';
    const lo = Math.min(la.startTimeOfDaySeconds, lb.startTimeOfDaySeconds);
    const hi = Math.max(la.endTimeOfDaySeconds, lb.endTimeOfDaySeconds);
    if (overlapsNonGreen(lo, hi)) return 'caution';
    return 'on_track_green';
  }

  // Chronological gate snapshots inside a lap: [S/F-start, interGates..., S/F-end].
  // S/F-start is the crossing that opened the lap (= previous lap's completion,
  // = this lap row's start tod); S/F-end is the completion of this lap. Ordering
  // by tod at each snapshot gives the running order; a pairwise relative-order
  // flip between consecutive snapshots is a pass, bracketed to that interval.
  const START = '__SFstart', END = '__SFend';
  const seq = [START, ...interGates, END];
  const gateName = (g) => (g === START || g === END ? sf : g);
  const passes = [];
  for (let L = 1; L <= maxLap; L++) {
    const rankAt = seq.map((g) => {
      const rows = [];
      for (const car of cars) {
        let tod = null;
        if (g === START) { const lr = lapRow(car, L); if (lr) tod = lr.startTimeOfDaySeconds; }
        else if (g === END) { const lr = lapRow(car, L); if (lr) tod = lr.endTimeOfDaySeconds; }
        else { const gm = gateCross.get(car).get(L); if (gm && gm.has(g)) tod = gm.get(g); }
        if (tod != null) rows.push({car, tod});
      }
      rows.sort((a, b) => a.tod - b.tod);
      return new Map(rows.map((r, i) => [r.car, i]));
    });
    for (let gi = 0; gi < seq.length - 1; gi++) {
      const A = rankAt[gi], B = rankAt[gi + 1];
      const common = [...A.keys()].filter((c) => B.has(c));
      for (let i = 0; i < common.length; i++) {
        for (let j = i + 1; j < common.length; j++) {
          const x = common[i], y = common[j];
          const xAheadBefore = A.get(x) < A.get(y);
          const xAheadAfter = B.get(x) < B.get(y);
          if (xAheadBefore !== xAheadAfter) {
            const gainer = xAheadAfter ? x : y;
            const loser = xAheadAfter ? y : x;
            passes.push({
              lap: L,
              gainer,
              loser,
              fromLoop: gateName(seq[gi]),
              toLoop: gateName(seq[gi + 1]),
              intervalLabel: `${gateName(seq[gi])}→${gateName(seq[gi + 1])}`,
              class: classify(L, gainer, loser),
            });
          }
        }
      }
    }
  }

  return {geometry, gates, sf, interGates, distOf, cars, lapMap, gateCross, pitLapByCar, overlapsNonGreen, maxLap, lapRow, passes};
}

// Between-loop interval traversal times per car, and each car's own median per
// interval (over its green, non-pit laps) — the baseline a slow lap deviates
// from. Intervals are consecutive mainline gates within a lap.
export function buildIntervalStats(race) {
  const {cars, interGates, sf, gateCross, lapRow, maxLap, pitLapByCar, overlapsNonGreen} = race;
  const seqGates = [sf, ...interGates, sf]; // S/F-start, inter, S/F-end
  const perCarInterval = new Map(); // car -> Map(intervalKey -> {times:[], median})
  for (const car of cars) {
    const byInterval = new Map();
    for (let L = 1; L <= maxLap; L++) {
      const lr = lapRow(car, L);
      if (!lr) continue;
      const pit = (pitLapByCar.get(car) || new Set()).has(L);
      const caution = overlapsNonGreen(lr.startTimeOfDaySeconds, lr.endTimeOfDaySeconds);
      const tod = (g, which) => {
        if (which === 'start') return lr.startTimeOfDaySeconds;
        if (which === 'end') return lr.endTimeOfDaySeconds;
        const gm = gateCross.get(car).get(L);
        return gm && gm.has(g) ? gm.get(g) : null;
      };
      for (let i = 0; i < seqGates.length - 1; i++) {
        const aWhich = i === 0 ? 'start' : 'mid';
        const bWhich = i === seqGates.length - 2 ? 'end' : 'mid';
        const ta = tod(seqGates[i], aWhich);
        const tb = tod(seqGates[i + 1], bWhich);
        if (ta == null || tb == null || tb <= ta) continue;
        const key = `${seqGates[i]}→${seqGates[i + 1]}`;
        if (!byInterval.has(key)) byInterval.set(key, {times: [], greenTimes: []});
        const rec = byInterval.get(key);
        rec.times.push({lap: L, dt: tb - ta});
        if (!pit && !caution && L > 1) rec.greenTimes.push(tb - ta);
      }
    }
    for (const rec of byInterval.values()) {
      const g = rec.greenTimes.slice().sort((a, b) => a - b);
      rec.median = g.length ? g[Math.floor(g.length / 2)] : null;
    }
    perCarInterval.set(car, byInterval);
  }
  return perCarInterval;
}

// For a car on a lap, the between-loop interval where it lost the most time vs
// its own green median (a located-slowdown candidate — descriptive only).
export function locateSlowdown(stats, car, lap) {
  const byInterval = stats.get(car);
  if (!byInterval) return null;
  let best = null;
  for (const [key, rec] of byInterval) {
    if (rec.median == null) continue;
    const hit = rec.times.find((t) => t.lap === lap);
    if (!hit) continue;
    const ratio = hit.dt / rec.median;
    if (!best || ratio > best.ratio) best = {intervalLabel: key, observedSeconds: +hit.dt.toFixed(3), medianSeconds: +rec.median.toFixed(3), ratio: +ratio.toFixed(2)};
  }
  return best;
}

// My S/F running order after each lap, derived independently of pass detection:
// order by completion of that lap (each car's S/F crossing tod). Matches the
// semantic layer's validated finishing-order definition, extended per lap.
export function deriveSFOrder(race, L) {
  const done = [];
  for (const car of race.cars) {
    const lr = race.lapRow(car, L);
    if (lr) done.push({car, tod: lr.endTimeOfDaySeconds});
  }
  done.sort((a, b) => a.tod - b.tod);
  return new Map(done.map((d, i) => [d.car, i + 1]));
}
