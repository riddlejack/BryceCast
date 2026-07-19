/** Dev helper (not shipped, not imported by the app): derive the ROAD-COURSE
 *  section anchor spans for src/assets/tracks/sections/<slug>.ts from MEASURED
 *  data — the road/street analogue of scripts/compute-section-anchors.mjs.
 *
 *  Method (Portland, Laguna Seca — Phase 3 Group B):
 *   1. Span LENGTHS are measured: official Section Results speeds are averages,
 *      so timeSeconds × speedMph is CONSTANT per family and equals the section
 *      length (sectionMi / lapMi → t-length). The published families chain in
 *      driving order, which is INCREASING t (verified: the outline tangent at
 *      the S/F point matches the stored startFinish.angleDeg for both venues).
 *   2. Span POSITIONS: the chain leaves ONE untimed gap (the front straight);
 *      the offset is fitted by anchoring the chain to visually-identifiable
 *      CONTROL CORNERS — a named family whose apex is an unambiguous detected
 *      corner arc (Portland: Turn 1 = the 250° Festival-Curves arc, Turn 12 =
 *      the 127° final arc; Laguna: Turn 2 = the 217° Andretti Hairpin, Corkscrew
 *      = the 346° double). Scale is LOCKED to 1 so the true measured lengths (and
 *      thus the honest coverage %) are preserved; the offset is the circular mean
 *      of (arcApexT − familyMidCum). This is the Nashville control-point lesson
 *      (OSM arc-length ≠ real distance; anchor to verified corners) applied to a
 *      chain with more sections than arcs.
 *   3. The result is VERIFIED VISUALLY on the debug overlay
 *      (scripts/build-section-debug.mjs): every detected corner arc must land in
 *      its named span and the S/F tick must fall inside the untimed gap.
 *
 *  Positions may later be superseded by measured timing-loop locations arriving
 *  through the data lake (docs/PHASE3_EXECUTION_CHARTER); the UI consumes the
 *  resolved geometry identically, so that swap is data-only.
 *
 *  Usage: node scripts/compute-road-section-anchors.mjs [slug ...]
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const CSV = 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv';

/** Chain (published-family order = driving order) + control corners per venue.
 *  Each control is [familyName, arcApexT] where arcApexT is the outline t of an
 *  unambiguous detected corner arc for that family (read from the overlay). */
const VENUES = {
  'portland-international-raceway': {
    venue: 'Portland International Raceway',
    chain: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turns 10/11', 'Turn 12'],
    controls: [['Turn 1', 0.5241], ['Turn 12', 0.2325]]
  },
  'weathertech-raceway-laguna-seca': {
    venue: 'WeatherTech Raceway Laguna Seca',
    chain: ['Turn 1 Entry Turn 1 Exit', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 4A', 'Turn 5', 'Turn 5A', 'Turn 6', 'Turn 7', 'Turn 7A', 'Corkscrew', 'Turn 9', 'Turn 10', 'Turn 11'],
    controls: [['Turn 2', 0.3725], ['Corkscrew', 0.9295]]
  }
};

const parsePts = (d) => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const p = [];
  for (let i = 0; i + 1 < nums.length; i += 2) p.push({ x: nums[i], y: nums[i + 1] });
  return p;
};
const cumT = (pts) => {
  const n = pts.length; const seg = new Array(n); let tot = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; seg[i] = Math.hypot(b.x - a.x, b.y - a.y); tot += seg[i]; }
  const t = new Array(n); let acc = 0;
  for (let i = 0; i < n; i++) { t[i] = acc / tot; acc += seg[i]; }
  return t;
};
const nearestT = (pts, t, g) => { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p.x - g.x) ** 2 + (p.y - g.y) ** 2; if (d < bd) { bd = d; bi = i; } }); return t[bi]; };
const median = (v) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const wrap = (v) => ((v % 1) + 1) % 1;

const readLens = (venue) => {
  const text = fs.readFileSync(path.join(repoRoot, CSV), 'utf8').split('\n');
  const H = text[0].split(',');
  const ci = (n) => H.indexOf(n);
  const [iT, iN, iTy, iTi, iSp] = ['trackName', 'sectionName', 'sectionType', 'timeSeconds', 'speedMph'].map(ci);
  const sec = new Map(); const lap = [];
  for (let i = 1; i < text.length; i++) {
    const p = text[i].split(',');
    if (p.length !== H.length || p[iT] !== venue) continue;
    const mi = (Number(p[iTi]) * Number(p[iSp])) / 3600;
    if (!(mi > 0)) continue;
    if (p[iTy] === 'lap_total') lap.push(mi);
    else if (p[iTy] === 'track_section') { if (!sec.has(p[iN])) sec.set(p[iN], []); sec.get(p[iN]).push(mi); }
  }
  return { sec, lap: median(lap) };
};

const run = (slug) => {
  const def = VENUES[slug];
  if (!def) { console.log(`(no road-venue definition for ${slug})`); return; }
  const a = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${slug}.json`), 'utf8'));
  const pts = parsePts(a.mainPath); const t = cumT(pts);
  const sf = nearestT(pts, t, a.startFinish);
  const arcs = a.cornerArcs.map((arc, i) => ({ i, apex: nearestT(pts, t, arc.apex), deg: arc.turnDeg }));
  const { sec, lap } = readLens(def.venue);
  const tlen = def.chain.map((f) => { if (!sec.has(f)) throw new Error(`family "${f}" missing at ${def.venue}`); return median(sec.get(f)) / lap; });
  const cumStart = []; let acc = 0; for (let i = 0; i < def.chain.length; i++) { cumStart.push(acc); acc += tlen[i]; }
  const cumMid = def.chain.map((f, i) => cumStart[i] + tlen[i] / 2);
  const idx = (f) => def.chain.indexOf(f);

  // offset = circular mean of (apex - cumMid) over controls; scale locked = 1
  let sinSum = 0, cosSum = 0;
  def.controls.forEach(([f, apex]) => { const ang = 2 * Math.PI * (apex - cumMid[idx(f)]); sinSum += Math.sin(ang); cosSum += Math.cos(ang); });
  const o = wrap(Math.atan2(sinSum, cosSum) / (2 * Math.PI));
  const T = (c) => wrap(c + o);
  const covered = tlen.reduce((x, y) => x + y, 0);
  const gapStart = wrap(acc + o), gapEnd = T(0);
  const sfInGap = wrap(sf - gapStart) < wrap(gapEnd - gapStart);

  console.log(`\n=== ${def.venue} (${slug}) — dir ${a.drivingDirection} ===`);
  console.log(`  offset o=${o.toFixed(4)}  measured coverage=${(covered * 100).toFixed(1)}%  gap=${(1 - covered).toFixed(4)}`);
  console.log(`  S/F t=${sf.toFixed(4)}  untimed gap=[${gapStart.toFixed(4)}..${gapEnd.toFixed(4)}]  S/F-in-gap=${sfInGap ? 'OK' : 'VIOLATED'}`);
  console.log('  spans:');
  def.chain.forEach((f, i) => console.log(`    { sectionName: '${f.replace(/'/g, "\\'")}', startT: ${T(cumStart[i]).toFixed(4)}, endT: ${T(cumStart[i] + tlen[i]).toFixed(4)} }`));
  console.log('  arc apex -> containing span (verification):');
  arcs.sort((x, y) => x.apex - y.apex).forEach((ar) => {
    let hit = null;
    def.chain.forEach((f, i) => { const s = T(cumStart[i]), e = T(cumStart[i] + tlen[i]); const inside = s <= e ? (ar.apex >= s && ar.apex < e) : (ar.apex >= s || ar.apex < e); if (inside) hit = f; });
    const ctrl = def.controls.find((c) => Math.abs(wrap(c[1] - ar.apex)) < 1e-6);
    console.log(`    arc#${ar.i} apex ${ar.apex.toFixed(4)} (${ar.deg}deg) -> ${hit ?? 'UNTIMED GAP'}${ctrl ? '  [CONTROL: ' + ctrl[0] + ']' : ''}`);
  });
};

const slugs = process.argv.slice(2);
for (const slug of slugs.length ? slugs : Object.keys(VENUES)) run(slug);
