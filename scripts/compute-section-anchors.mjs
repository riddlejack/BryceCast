/** Dev helper (not shipped, not imported by the app): derive the oval section
 *  anchor spans for src/assets/tracks/sections/<slug>.ts from MEASURED data.
 *
 *  Key fact (verified 2026-07-18): official Section Results speeds are average
 *  speeds, so timeSeconds x speedMph is CONSTANT per section family — it IS the
 *  section's length. Lap totals reproduce official lap lengths exactly
 *  (Nashville 1.3300, Iowa 0.8940, Milwaukee 1.0150, WWTR 1.2500 mi). Spans
 *  therefore carry measured t-lengths (sectionMi / lapMi); only the chain's
 *  START offset along the outline is curated, fitted here against the outline's
 *  corner-arc intervals and the S/F-in-untimed-gap constraint, then verified
 *  visually via scripts/build-section-debug.mjs.
 *
 *  Usage: node scripts/compute-section-anchors.mjs [slug ...]
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const CSV = 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv';

/* ---------- path geometry ---------- */

const parsePolyline = (d) => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

const cumulativeT = (points) => {
  const n = points.length;
  const seg = new Array(n).fill(0);
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    seg[i] = Math.hypot(b.x - a.x, b.y - a.y);
    total += seg[i];
  }
  const t = new Array(n).fill(0);
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    t[i] = acc / total;
    acc += seg[i];
  }
  return { t, total };
};

const nearestT = (points, t, target) => {
  let bestI = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  });
  return t[bestI];
};

/* ---------- measured section lengths from the observation table ---------- */

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const readLengths = () => {
  const text = fs.readFileSync(path.join(repoRoot, CSV), 'utf8');
  const lines = text.split('\n');
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  const [iTrack, iType, iFam, iTime, iSpeed] = [
    col('trackName'),
    col('sectionType'),
    col('sectionFamily'),
    col('timeSeconds'),
    col('speedMph')
  ];
  const secMi = new Map(); // track -> fam -> [mi]
  const lapMi = new Map(); // track -> [mi]
  for (let i = 1; i < lines.length; i += 1) {
    // family names contain no commas in this table; simple split is safe
    const parts = lines[i].split(',');
    if (parts.length !== header.length) continue;
    const mi = (Number(parts[iTime]) * Number(parts[iSpeed])) / 3600;
    if (!Number.isFinite(mi) || mi <= 0) continue;
    if (parts[iType] === 'lap_total') {
      if (!lapMi.has(parts[iTrack])) lapMi.set(parts[iTrack], []);
      lapMi.get(parts[iTrack]).push(mi);
    } else if (parts[iType] === 'track_section') {
      if (!secMi.has(parts[iTrack])) secMi.set(parts[iTrack], new Map());
      const fams = secMi.get(parts[iTrack]);
      if (!fams.has(parts[iFam])) fams.set(parts[iFam], []);
      fams.get(parts[iFam]).push(mi);
    }
  }
  return { secMi, lapMi };
};

/* ---------- venue definitions: chain order + arc constraints ---------- */

/** For chained venues the loop names run in driving order; each entry is the
 *  official family name. arcInside rows say which loop-to-loop RANGE
 *  [chainStartIndex, chainEndIndex) must contain which detected corner arc. */
const VENUES = {
  'iowa-speedway': {
    chain: ['T1 to SS1', 'SS1 to T2', 'T2 to BS', 'BS to T3', 'T3 to SS2', 'SS2 to T4'],
    arcInside: [
      [0, 2, 0], // T1..T2 sections contain the turns 1-2 arc
      [3, 6, 1] // BS..T4 sections contain the turns 3-4 arc
    ]
  },
  'the-milwaukee-mile': {
    chain: ['T1 to SS1', 'SS1 to T2', 'T2 to BS', 'BS to T3', 'T3 to SS2', 'SS2 to T4', 'T4 to FS'],
    arcInside: [
      [0, 1, 0], // T1 section contains the T1 arc
      [1, 3, 1], // SS1..BS sections contain the T2 arc
      [3, 6, 2] // BS..T4 sections contain the turns 3-4 arc
    ]
  },
  'world-wide-technology-raceway': {
    chain: ['Turn 1', 'Turn 2', 'BS - T2', 'BS - T3', 'Turn 3', 'Turn 4'],
    arcInside: [
      [0, 2, 0], // T1..T2 sections contain the tight-end arc
      [4, 6, 1] // T3..T4 sections contain the wide-end arc
    ]
  }
};

const wrap = (v) => ((v % 1) + 1) % 1;

const run = (slug) => {
  const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${slug}.json`), 'utf8'));
  const points = parsePolyline(asset.mainPath);
  const { t } = cumulativeT(points);
  const { secMi, lapMi } = readLengths();
  const fmt = (v) => wrap(v).toFixed(4);

  console.log(`\n=== ${asset.name} (${slug}) — dir ${asset.drivingDirection} ===`);
  const sf = asset.startFinish ? nearestT(points, t, asset.startFinish) : null;
  if (sf !== null) console.log(`  S/F t=${fmt(sf)}`);
  const arcs = asset.cornerArcs.map((arc, i) => {
    const entry = nearestT(points, t, arc.entryQuarter);
    const apex = nearestT(points, t, arc.apex);
    const exit = nearestT(points, t, arc.exitQuarter);
    console.log(`  arc#${i} ${arc.label ?? ''} ${arc.turnDeg}°: entry ${fmt(entry)} apex ${fmt(apex)} exit ${fmt(exit)}`);
    return { entry, apex, exit };
  });

  const fams = secMi.get(asset.name);
  const lap = lapMi.get(asset.name) ? median(lapMi.get(asset.name)) : null;
  if (!fams || !lap) {
    console.log('  (no section observations for this venue)');
    return;
  }
  console.log(`  measured lap ${lap.toFixed(4)} mi (asset says ${asset.lengthMi})`);
  const lens = new Map();
  let sum = 0;
  for (const [fam, vals] of fams) {
    const mi = median(vals);
    lens.set(fam, mi);
    sum += mi;
    console.log(`  section "${fam}" len ${mi.toFixed(4)} mi = t-len ${(mi / lap).toFixed(4)} (n=${vals.length})`);
  }
  console.log(`  sections cover ${((100 * sum) / lap).toFixed(1)}% of the lap`);

  const venue = VENUES[slug];
  if (!venue || venue.arcInside.length === 0 || sf === null) return;

  /* Fit the chain-start offset: boundaries are cumulative measured t-lengths;
   * score = min margin across (a) S/F inside the untimed gap and (b) each arc
   * interval inside its required loop-to-loop range. */
  const tLens = venue.chain.map((fam) => {
    const mi = lens.get(fam);
    if (mi === undefined) throw new Error(`family "${fam}" missing at ${asset.name}`);
    return mi / lap;
  });
  const chainLen = tLens.reduce((a, b) => a + b, 0);
  const boundsAt = (o) => {
    const bounds = [o];
    for (const len of tLens) bounds.push(bounds[bounds.length - 1] + len);
    return bounds; // unwrapped cumulative; wrap() when comparing
  };
  let best = null;
  for (let o = 0; o < 1; o += 0.0005) {
    const bounds = boundsAt(o);
    // S/F must sit inside the untimed gap [chain end, chain start]
    const relSf = wrap(sf - bounds[venue.chain.length]);
    const gapLen = 1 - chainLen;
    if (relSf > gapLen) continue; // S/F inside the timed chain: infeasible
    let margin = Math.min(relSf, gapLen - relSf);
    // each arc interval inside its loop-to-loop range
    let feasible = true;
    for (const [i0, i1, arcIndex] of venue.arcInside) {
      const arc = arcs[arcIndex];
      const lo = bounds[i0];
      const rangeLen = bounds[i1] - bounds[i0];
      const relEntry = wrap(arc.entry - lo);
      const relExit = wrap(arc.exit - lo);
      if (relEntry > rangeLen || relExit > rangeLen || relExit < relEntry) {
        feasible = false;
        break;
      }
      margin = Math.min(margin, relEntry, rangeLen - relExit);
    }
    if (feasible && (best === null || margin > best.margin)) best = { offset: o, margin, bounds };
  }
  if (!best) {
    console.log('  FIT: no feasible offset satisfies all constraints — venue stays approximate.');
    return;
  }
  console.log(`  FIT: offset ${best.offset.toFixed(4)} (min margin ${best.margin.toFixed(4)}) — spans:`);
  venue.chain.forEach((fam, i) => {
    console.log(`    { sectionName: '${fam}', startT: ${fmt(best.bounds[i])}, endT: ${fmt(best.bounds[i + 1])} }`);
  });
  console.log(`    untimed gap [${fmt(best.bounds[venue.chain.length])}, ${fmt(best.bounds[0])}] contains S/F ${fmt(sf)}`);
};

const slugs = process.argv.slice(2);
const targets =
  slugs.length > 0
    ? slugs
    : ['nashville-superspeedway', 'iowa-speedway', 'the-milwaukee-mile', 'world-wide-technology-raceway'];
for (const slug of targets) run(slug);
