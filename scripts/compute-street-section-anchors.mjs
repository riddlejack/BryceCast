/** Dev helper (not shipped): derive the street-circuit section anchor spans for
 *  src/assets/tracks/sections/<slug>.ts from MEASURED data, the sibling of
 *  scripts/compute-section-anchors.mjs for the ovals.
 *
 *  The street outlines are rebuilt from RaceTools map polylines
 *  (scripts/build-outline-from-map.mjs), so the outline IS the racing line and
 *  distance→path-t is exact via the per-outline distance table that build step
 *  writes to ~/.brycecast/reports/outlines-maps/<slug>.distmap.json. Section
 *  span LENGTHS are measured (official time × speed, constant per family = the
 *  section's length); the chain ORDER is the per-lap section sequence in the
 *  observation table. Placement:
 *    - Detroit: the 18 loop-to-loop families tile the whole lap, so the chain is
 *      anchored at the S/F line (path-t 0) with zero free parameters.
 *    - Arlington: 23 fine segments cover 94.5% in one driving order; anchored at
 *      the S/F line, the ~5.5% untimed tail is a derived remainder.
 *    - St. Petersburg: 8 corner families cover 72.5% with the untimed straights
 *      interspersed; a single offset is fitted to seat S/F in the untimed gap
 *      and land the most corner arcs inside their sections (approximate).
 *
 *  Usage: node scripts/compute-street-section-anchors.mjs [detroit|arlington|stpete ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = process.cwd();
const CSV = 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};
const wrap = (v) => ((v % 1) + 1) % 1;

/** Measured section lengths (mi) + per-lap driving order + median lap for a venue. */
const readVenue = (venue) => {
  const text = fs.readFileSync(path.join(repoRoot, CSV), 'utf8').split('\n');
  const header = text[0].split(',');
  const col = (name) => header.indexOf(name);
  const [iT, iF, iType, iLap, iSess, iTime, iSpd] = [
    'trackName', 'sectionFamily', 'sectionType', 'lapNumber', 'sessionId', 'timeSeconds', 'speedMph'
  ].map(col);
  const laps = new Map();
  const lens = new Map();
  const lapTotal = [];
  for (let i = 1; i < text.length; i += 1) {
    const p = text[i].split(',');
    if (p.length !== header.length || p[iT] !== venue) continue;
    const mi = (Number(p[iTime]) * Number(p[iSpd])) / 3600;
    if (p[iType] === 'lap_total') {
      if (mi > 0) lapTotal.push(mi);
      continue;
    }
    if (p[iType] !== 'track_section') continue;
    const key = `${p[iSess]}|${p[iLap]}`;
    if (!laps.has(key)) laps.set(key, []);
    laps.get(key).push(p[iF]);
    if (!lens.has(p[iF])) lens.set(p[iF], []);
    if (mi > 0) lens.get(p[iF]).push(mi);
  }
  const pos = new Map();
  for (const seq of laps.values()) seq.forEach((f, idx) => { if (!pos.has(f)) pos.set(f, []); pos.get(f).push(idx); });
  const order = [...pos.keys()].sort((a, b) => median(pos.get(a)) - median(pos.get(b)));
  return { order, lens, lapMi: median(lapTotal) };
};

/** distance-fraction → app path-t, from the outline's distance table. */
const loadDistToT = (slug) => {
  const file = path.join(os.homedir(), `.brycecast/reports/outlines-maps/${slug}.distmap.json`);
  const dm = JSON.parse(fs.readFileSync(file, 'utf8')).distMap;
  return (f) => {
    f = wrap(f);
    for (let i = 0; i < dm.length - 1; i += 1) {
      const [t0, d0] = dm[i];
      const [t1, d1] = dm[i + 1];
      if (f >= d0 && f <= d1) return t0 + ((f - d0) / ((d1 - d0) || 1)) * (t1 - t0);
    }
    return f;
  };
};

/** Corner-arc apex positions (path-t) from the outline asset. */
const arcTs = (slug) => {
  const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${slug}.json`), 'utf8'));
  const nums = asset.mainPath.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i += 1) { const b = pts[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b.x - pts[i].x, b.y - pts[i].y)); }
  const total = cum[n];
  return asset.cornerArcs.map((c) => {
    let bi = 0; let bd = Infinity;
    pts.forEach((p, i) => { const d = (p.x - c.apex.x) ** 2 + (p.y - c.apex.y) ** 2; if (d < bd) { bd = d; bi = i; } });
    return { t: cum[bi] / total, deg: c.turnDeg };
  }).sort((a, b) => a.t - b.t);
};

const printSpans = (slug, chain, lens, lapMi, d2t, startFrac) => {
  let cum = startFrac * lapMi;
  for (const fam of chain) {
    const mi = median(lens.get(fam));
    const s = cum / lapMi; cum += mi; const e = cum / lapMi;
    console.log(`    { sectionName: ${JSON.stringify(fam)}, startT: ${d2t(s).toFixed(4)}, endT: ${d2t(e).toFixed(4)} }, // ${mi.toFixed(4)}mi`);
  }
  const coverage = (cum / lapMi) - startFrac;
  console.log(`  coverage ${(coverage * 100).toFixed(2)}%  remainder ${((1 - coverage) * 100).toFixed(2)}% -> derived [${d2t(cum / lapMi).toFixed(4)}, ${d2t(startFrac).toFixed(4)}]`);
};

const runDetroit = () => {
  const { lens, lapMi } = readVenue('Streets of Detroit');
  const chain = ['SF to I1', 'I1 to I2A', 'I2A to I2', 'I2 to I3', 'I3 to I4', 'I4 to I5', 'I5 to I6', 'I6 to I7', 'I7 to I8', 'I8 to I9', 'I9 to I10', 'I10 to I11', 'I11 to 12', 'I12 to I13', 'Back Str 2', 'I14 to I15', 'I15 to I16', 'I16 to SF'];
  console.log('\n=== Streets of Detroit — full tiling, anchored at S/F (path-t 0) ===');
  printSpans('streets-of-detroit', chain, lens, lapMi, loadDistToT('streets-of-detroit'), 0);
};

const runArlington = () => {
  const { order, lens, lapMi } = readVenue('Streets of Arlington');
  console.log('\n=== Streets of Arlington — near-full tiling, anchored at S/F (path-t 0) ===');
  console.log('  arcs:', JSON.stringify(arcTs('streets-of-arlington').map((a) => +a.t.toFixed(3))));
  printSpans('streets-of-arlington', order, lens, lapMi, loadDistToT('streets-of-arlington'), 0);
};

const runStPete = () => {
  const { order, lens, lapMi } = readVenue('Streets of St. Petersburg');
  const tLens = order.map((f) => median(lens.get(f)) / lapMi);
  const chainLen = tLens.reduce((a, b) => a + b, 0);
  const gapLen = 1 - chainLen;
  const arcs = arcTs('streets-of-st-petersburg');
  /* Fit the single offset (in distance fraction): S/F (frac 0) inside the untimed
   * gap, maximising corner arcs seated inside a measured section. */
  let best = null;
  for (let o = 0; o < 1; o += 0.001) {
    const bounds = [o];
    for (const l of tLens) bounds.push(bounds[bounds.length - 1] + l);
    if (wrap(0 - bounds[order.length]) > gapLen + 1e-9) continue; // S/F not in gap
    let inside = 0;
    let margin = 1;
    for (const arc of arcs) {
      const rel = wrap(arc.t - o);
      if (rel < chainLen) inside += 1;
      else margin = Math.min(margin, wrap(arc.t - bounds[order.length]), wrap(o - arc.t));
    }
    const score = inside * 100 + margin;
    if (!best || score > best.score) best = { o, score, inside };
  }
  console.log('\n=== Streets of St. Petersburg — single-offset fit (approximate) ===');
  console.log(`  arcs: ${JSON.stringify(arcs.map((a) => +a.t.toFixed(3)))}`);
  console.log(`  best offset(distFrac) ${best.o.toFixed(3)}  arcs inside sections ${best.inside}/${arcs.length}`);
  printSpans('streets-of-st-petersburg', order, lens, lapMi, loadDistToT('streets-of-st-petersburg'), best.o);
};

const jobs = { detroit: runDetroit, arlington: runArlington, stpete: runStPete };
const targets = process.argv.slice(2).filter((a) => jobs[a]);
for (const t of (targets.length ? targets : Object.keys(jobs))) jobs[t]();
