/** Dev helper (not shipped, not imported by the app): derive + VISUALLY VERIFY
 *  the road-course section anchor spans for src/assets/tracks/sections/<slug>.ts.
 *
 *  Unlike the ovals (scripts/compute-section-anchors.mjs), road-course PDF
 *  section families are bounded by NAMED timing loops (I1, I3A, …) whose real
 *  distance-along-track lives in the data lake's track-map catalog
 *  (data/historical-data-lake/catalog/track-map-definitions.json). We join a
 *  venue to its map package by INI Track.Name + SHA-256 (NEVER filename —
 *  consumerGuard), read each loop's LapDistance, and re-reference the chain to
 *  the S/F line. Each family span = [startLoop LapDistance … endLoop LapDistance].
 *
 *  Distance→t: OSM outline arc-length is NOT proportional to real track distance
 *  (the Nashville wiring lesson). We map real distance to the outline's [0,1]
 *  arc-length param by PIECEWISE-LINEAR interpolation between visually-verified
 *  control points {dist(SF-frame, m), t}. With no control points we fall back to
 *  pure proportional (t = tSF + dist/lap) — the baseline to eyeball and correct.
 *
 *  Writes one debug HTML per venue to ~/.brycecast/reports/anchors-a/ so spans
 *  can be checked against the corner arcs (each turn family should hug its named
 *  corner; S/F on the S/F straight; boundaries on straights).
 *
 *  Usage: node scripts/roadcourse-anchor-lab.mjs [venueKey ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = process.cwd();
const CATALOG = 'data/historical-data-lake/catalog/track-map-definitions.json';

/* ---------- venue configs (family → boundary loops, from the CSV + map join) ---------- */

const VENUES = {
  'road-america': {
    slug: 'road-america',
    packageSha: 'b54ec608641f9d76b0f83f2c8f38f9d0d5d6c6d0e6b9f9c2f9d0a1b2c3d4e5f6', // resolved by prefix below
    packageShaPrefix: 'b54ec608',
    // PDF families are literally loop-to-loop; boundary loops live in the
    // 45-section (control line I13A) package. startLoop/endLoop are the first
    // and last loops named in the family.
    families: [
      { sectionName: 'SF to I1B', label: 'S/F→I1B', startLoop: 'SF', endLoop: 'I1B' },
      { sectionName: 'I1B to I1', label: 'I1B→I1', startLoop: 'I1B', endLoop: 'I1' },
      { sectionName: 'I1 to I2', label: 'I1→I2', startLoop: 'I1', endLoop: 'I2' },
      { sectionName: 'I2 to I3', label: 'I2→I3', startLoop: 'I2', endLoop: 'I3' },
      { sectionName: 'I3 to I3A', label: 'I3→I3A', startLoop: 'I3', endLoop: 'I3A' },
      { sectionName: 'I3A to I4', label: 'I3A→I4', startLoop: 'I3A', endLoop: 'I4' },
      { sectionName: 'I4 to I4A', label: 'I4→I4A', startLoop: 'I4', endLoop: 'I4A' },
      { sectionName: 'I4A to I5', label: 'I4A→I5', startLoop: 'I4A', endLoop: 'I5' },
      { sectionName: 'I5 to I6', label: 'I5→I6', startLoop: 'I5', endLoop: 'I6' },
      { sectionName: 'I6 to I7', label: 'I6→I7', startLoop: 'I6', endLoop: 'I7' },
      { sectionName: 'I7 to I8', label: 'I7→I8', startLoop: 'I7', endLoop: 'I8' },
      { sectionName: 'I8 to I9', label: 'I8→I9', startLoop: 'I8', endLoop: 'I9' },
      { sectionName: 'I9 to I10', label: 'I9→I10', startLoop: 'I9', endLoop: 'I10' },
      // Combined-label families: the measured PDF length uniquely fingerprints
      // the real timed sub-section (I11→I11B len 0.2566mi; I13→I13A len 0.1085mi),
      // the rest of the named loop range is absorbed by the pack's untimed
      // remainder. Anchor to the fingerprinted sub-span; sectionName stays the
      // full pack string (the join key).
      { sectionName: 'I10 to I11 I11 to I11B', label: 'I11→I11B', startLoop: 'I11', endLoop: 'I11B' },
      { sectionName: 'I11B to I12 I12 to I13 I13 to I13A I13A to I14 I14 to I15C I15C to I15', label: 'I13→I13A', startLoop: 'I13', endLoop: 'I13A' },
      { sectionName: 'I15 to SF', label: 'I15→S/F', startLoop: 'I15', endLoop: 'SF' }
    ],
    controlPoints: []
  },
  'barber-motorsports-park': {
    slug: 'barber-motorsports-park',
    packageShaPrefix: '809f49c3',
    // Turn-named families; joined to map sections by matching the map section's
    // `length` field to the measured PDF family length (sub-4-decimal match).
    families: [
      { sectionName: 'Turns 1-3', label: 'Turns 1–3', startLoop: 'I1', endLoop: 'I2' },
      { sectionName: 'Turn 4', label: 'Turn 4', startLoop: 'I2', endLoop: 'I3A' },
      { sectionName: 'Turns 5-6', label: 'Turns 5–6', startLoop: 'I3A', endLoop: 'I3' },
      { sectionName: 'Turn 7', label: 'Turn 7', startLoop: 'I3', endLoop: 'I4' },
      { sectionName: 'Turns 8-9', label: 'Turns 8–9', startLoop: 'I4', endLoop: 'I5A' },
      { sectionName: 'Turn 10', label: 'Turn 10', startLoop: 'I5A', endLoop: 'I5' },
      { sectionName: 'Turn 11', label: 'Turn 11', startLoop: 'I5', endLoop: 'I6' },
      { sectionName: 'Turns 12-13 Turns 14-16', label: 'T12–16', startLoop: 'I6', endLoop: 'I7' },
      { sectionName: 'Turn 17', label: 'Turn 17', startLoop: 'I8', endLoop: 'SF' }
    ],
    controlPoints: []
  },
  'indianapolis-motor-speedway-road-course': {
    slug: 'indianapolis-motor-speedway-road-course',
    packageShaPrefix: 'd65435a5',
    families: [], // see report: the 35-section IMS map package is a 3.41-mi config
    controlPoints: []
  }
};

/* ---------- geometry ---------- */

const parsePoints = (d) => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

const geometryFor = (mainPath) => {
  const points = parsePoints(mainPath);
  const n = points.length;
  const cum = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cum[n] || 1;
  const pointAtT = (t) => {
    const d = ((((t % 1) + 1) % 1) * total);
    let i = 0;
    while (i < n && cum[i + 1] < d) i += 1;
    const a = points[i % n];
    const b = points[(i + 1) % n];
    const segLen = cum[i + 1] - cum[i] || 1;
    const frac = (d - cum[i]) / segLen;
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  };
  const nearestT = (q) => {
    let bi = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    });
    return cum[bi] / total;
  };
  return { pointAtT, nearestT };
};

const wrap = (v) => ((v % 1) + 1) % 1;
const spanLen = (start, end) => ((end - start + 1) % 1) || (end === start ? 0 : 1);
const spanMid = (start, end) => wrap(start + spanLen(start, end) / 2);
const dashesFor = (start, end) =>
  start <= end
    ? [{ arr: `${end - start} 2`, off: -start }]
    : [
        { arr: `${1 - start} 2`, off: -start },
        { arr: `${end} 2`, off: 0 }
      ];

/* ---------- loop distances from the map package ---------- */

const loadCatalog = () => JSON.parse(fs.readFileSync(path.join(repoRoot, CATALOG), 'utf8'));

const loopDistancesSF = (catalog, shaPrefix) => {
  const map = catalog.maps.find((m) => m.packageSha256.startsWith(shaPrefix));
  if (!map) throw new Error(`no map package for sha ${shaPrefix}`);
  const lap = Math.max(...map.timingSections.map((s) => s.lapDistance || 0));
  // loopPos_raw[endLoop] = section.lapDistance (distance-along-track of the end loop)
  const raw = new Map();
  for (const s of map.timingSections) {
    if (s.lapDistance == null) continue;
    if (!raw.has(s.end)) raw.set(s.end, s.lapDistance);
  }
  const sfRaw = raw.get('SF');
  if (sfRaw == null) throw new Error(`no SF loop in package ${shaPrefix}`);
  const sf = new Map();
  for (const [loop, d] of raw) sf.set(loop, wrap((d - sfRaw) / lap) * lap);
  return { lap, sf, iniTrackName: map.iniTrackName, lengthMiles: map.lengthMiles, controlLine: map.controlLine };
};

/* ---------- distance → t (control-point interpolation) ---------- */

const makeDistToT = (tSF, lap, controlPoints) => {
  if (!controlPoints || controlPoints.length === 0) {
    return (dist) => wrap(tSF + dist / lap);
  }
  // control points: [{dist, t}] in SF-frame; add the S/F endpoints (0 and lap)
  const cps = [{ dist: 0, t: tSF }, ...controlPoints, { dist: lap, t: tSF + 1 }]
    .map((c) => ({ dist: c.dist, t: c.t }))
    .sort((a, b) => a.dist - b.dist);
  return (dist) => {
    const d = ((dist % lap) + lap) % lap;
    let i = 0;
    while (i < cps.length - 1 && cps[i + 1].dist < d) i += 1;
    const a = cps[i];
    const b = cps[Math.min(i + 1, cps.length - 1)];
    const span = b.dist - a.dist || 1;
    const frac = (d - a.dist) / span;
    return wrap(a.t + (b.t - a.t) * frac);
  };
};

/* ---------- per-venue compute + render ---------- */

const DIAG = ['#0066cc', '#e09a2f', '#2f9377', '#b05a73', '#5581c2', '#b98a3f', '#2e9ac2', '#7a5bb0', '#c2582e', '#3f8f4f'];

const run = (venueKey) => {
  const cfg = VENUES[venueKey];
  const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${cfg.slug}.json`), 'utf8'));
  const { pointAtT, nearestT } = geometryFor(asset.mainPath);
  const tSF = asset.startFinish ? nearestT(asset.startFinish) : 0;
  const catalog = loadCatalog();
  const { lap, sf, iniTrackName, lengthMiles, controlLine } = loopDistancesSF(catalog, cfg.packageShaPrefix);
  const distToT = makeDistToT(tSF, lap, cfg.controlPoints);

  console.log(`\n=== ${asset.name} (${cfg.slug}) ===`);
  console.log(`  map: ini="${iniTrackName}" control=${controlLine} lap=${lap.toFixed(1)}m (${(lap / 1609.344).toFixed(4)}mi) assetLen=${asset.lengthMi}mi`);
  console.log(`  S/F t=${tSF.toFixed(4)}  outline pts, ${asset.cornerArcs.length} corner arcs`);

  const spans = cfg.families.map((fam, index) => {
    const dStart = sf.get(fam.startLoop);
    const dEnd = sf.get(fam.endLoop);
    if (dStart == null || dEnd == null) {
      console.log(`  !! family "${fam.sectionName}" missing loop ${dStart == null ? fam.startLoop : fam.endLoop} — OMIT`);
      return null;
    }
    const startT = distToT(dStart);
    const endT = distToT(dEnd);
    const lenMi = wrap((dEnd - dStart) / lap) * lap / 1609.344;
    console.log(
      `  [${index + 1}] "${fam.label}"  ${fam.startLoop}(${dStart.toFixed(0)}m)→${fam.endLoop}(${dEnd.toFixed(0)}m)  len=${lenMi.toFixed(4)}mi  t ${startT.toFixed(4)}→${endT.toFixed(4)}`
    );
    return { ...fam, startT, endT, color: DIAG[index % DIAG.length] };
  }).filter(Boolean);

  const covered = spans.reduce((s, sp) => s + spanLen(sp.startT, sp.endT), 0);
  console.log(`  coverage: ${spans.length} families, ${(covered * 100).toFixed(1)}% of the lap`);

  // render
  const [, , vw] = asset.viewBox.split(' ').map(Number);
  const px = (v) => (v / 760) * vw;
  const spanPaths = spans
    .map((sp) => {
      const paths = dashesFor(sp.startT, sp.endT)
        .map(
          (d) =>
            `<path d="${asset.mainPath}" fill="none" pathLength="1" stroke="${sp.color}" stroke-width="${px(6)}" stroke-linecap="round" stroke-dasharray="${d.arr}" stroke-dashoffset="${d.off}" opacity="0.85"/>`
        )
        .join('');
      const mid = pointAtT(spanMid(sp.startT, sp.endT));
      const label = `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle" font-size="${px(12)}" font-family="system-ui" font-weight="700" fill="#111">${spans.indexOf(sp) + 1}</text>`;
      return paths + label;
    })
    .join('');
  const cornerMarks = asset.cornerArcs
    .map((arc, i) => {
      const dot = (p, r, fill) => `<circle cx="${p.x}" cy="${p.y}" r="${px(r)}" fill="${fill}"/>`;
      return (
        dot(arc.apex, 4, '#d62828') +
        dot(arc.entryQuarter, 2.5, '#888') +
        dot(arc.exitQuarter, 2.5, '#888') +
        `<text x="${arc.apex.x}" y="${arc.apex.y - px(9)}" text-anchor="middle" font-size="${px(11)}" font-family="system-ui" fill="#d62828">a${i}</text>`
      );
    })
    .join('');
  const sfMark = asset.startFinish
    ? `<g transform="translate(${asset.startFinish.x} ${asset.startFinish.y}) rotate(${asset.startFinish.angleDeg + 90})"><line x1="${-px(12)}" x2="${px(12)}" stroke="#f5b63f" stroke-width="${px(5)}" stroke-linecap="round"/></g><text x="${asset.startFinish.x}" y="${asset.startFinish.y + px(16)}" text-anchor="middle" font-size="${px(11)}" font-family="system-ui" fill="#b8860b">S/F</text>`
    : '';
  const legend = spans
    .map(
      (sp, i) =>
        `<div class="row"><span class="sw" style="background:${sp.color}"></span><b>${i + 1}</b> <code>${sp.sectionName}</code> → “${sp.label}” <span class="t">${sp.startLoop}→${sp.endLoop} · t ${sp.startT.toFixed(3)}–${sp.endT.toFixed(3)}</span></div>`
    )
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><title>${asset.name} — anchor lab</title>
<style>body{font-family:system-ui;margin:20px;background:#fafafa;color:#1d1d1f}
h1{font-size:17px}h2{font-size:13px;color:#666;font-weight:400;margin:4px 0 12px}
svg{background:#fff;border:1px solid #eee;max-width:100%;height:auto}
.legend{margin-top:12px;font-size:12px;display:grid;gap:4px}.row{display:flex;gap:8px;align-items:center}
.sw{width:14px;height:14px;border-radius:3px}code{background:#f2f2f4;padding:1px 5px;border-radius:4px}
.t{color:#888;margin-left:auto}</style>
<h1>${asset.name} — road-course section anchor lab</h1>
<h2>map ini “${iniTrackName}” · control ${controlLine} · lap ${(lap / 1609.344).toFixed(4)} mi · ${spans.length} families · ${(covered * 100).toFixed(1)}% covered · ${cfg.controlPoints.length ? cfg.controlPoints.length + ' control pts' : 'proportional (no control pts)'}</h2>
<svg viewBox="${asset.viewBox}" width="820">
  <path d="${asset.mainPath}" fill="none" stroke="#ccc" stroke-width="${px(2)}" stroke-linejoin="round"/>
  ${spanPaths}${sfMark}${cornerMarks}
</svg>
<div class="legend">${legend}</div>`;
  const outDir = path.join(os.homedir(), '.brycecast/reports/anchors-a');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${cfg.slug}-anchor-lab.html`);
  fs.writeFileSync(outPath, html);
  // machine-readable spans for exact transcription into the anchor .ts file
  const jsonOut = spans.map((sp, i) => ({
    familyId: `${cfg.slug.split('-').map((w) => w[0]).join('')}-${i + 1}`,
    sectionName: sp.sectionName,
    label: sp.label,
    startLoop: sp.startLoop,
    endLoop: sp.endLoop,
    startT: Number(sp.startT.toFixed(4)),
    endT: Number(sp.endT.toFixed(4))
  }));
  fs.writeFileSync(path.join(outDir, `${cfg.slug}.anchors.json`), JSON.stringify({ coveragePct: Number((covered * 100).toFixed(1)), lapMeters: Number(lap.toFixed(2)), tSF: Number(tSF.toFixed(4)), sections: jsonOut }, null, 2));
  console.log(`  wrote ${outPath}`);
  return { spans, tSF, lap };
};

const keys = process.argv.slice(2);
const targets = keys.length ? keys : ['road-america', 'barber-motorsports-park'];
for (const k of targets) run(k);
