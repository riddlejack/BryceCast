#!/usr/bin/env node
// build-track-models.mjs: the Tracks page's interactive 3D models (site refresh round 5, Nov 16 2026).
//
// For every venue in the stills' venues.json ("built"), writes public/tracks-3d/models/<slug>.json:
//   { v, slug, kind, camera {azim, elev, fill}, map {ns, dir, mirror, rmsM, worstM, u[]}, attribution, poster, model }
// - model: the venue's model file, unchanged (the schema the film rig's createVenue / createCity / createLaguna draw;
//   src/three/rig/ holds read-only copies of those modules).
// - map: the site outline's arc parameter t (the one the section anchors' startT/endT use) carried onto the model's
//   centreline u (lap fraction from the model's own start), by the same fit the stills use (stills-tools/page.js
//   align + uOf): a least-squares similarity of the site outline onto the model centreline over every cyclic shift,
//   both directions, with and without a mirror, then each t refined to the nearest centreline point within 3% of the
//   lap. u[i] is uOf(i / ns). The page reads spans through it with no fitting at run time.
// - camera: the stills' azimuth and elevation (venues.json), fill 0.9: the opening view is the stills' framing.
// and public/tracks-3d/models/index.json (what exists, sizes, fit quality).
//
// Which model a venue uses: venues.json built[slug].loader + .data (a file under stills-tools/) when set, else the film
// rig's own model (Laguna, Road America, Detroit). Improved model files dropped into stills-tools/models/ are picked up
// by re-running this script:
//   node scripts/build-track-models.mjs                  all venues
//   node scripts/build-track-models.mjs --only mid-ohio-sports-car-course,iowa-speedway
//   STILLS=<stills-tools dir> RIG=<film-rig dir> node scripts/build-track-models.mjs
// Reads the stills tools and the rig read-only; writes only public/tracks-3d/models/.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STILLS = process.env.STILLS || join(homedir(), 'Documents/ChatGPT/Portfolio/builds/project-brycecast/site-refresh/stills-tools');
const RIG = process.env.RIG || join(homedir(), 'Documents/ChatGPT/Portfolio/builds/film-rig');
const RIG_DATA = join(RIG, 'shots/brycecast-film/data');
const args = process.argv.slice(2);
// --icons (round 7): the venues.json "icons" venues (models for the bird's-eye icons only), baked into
// stills-tools/out/icon-models/ with their own index, never into public/tracks-3d/models/index.json
const ICONS = args.includes('--icons');
const OUT = ICONS ? join(STILLS, 'out/icon-models') : join(ROOT, 'public/tracks-3d/models');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

const NS = 1200;   // site outline samples (page.js NS)
const NM = 1200;   // model centreline samples (page.js NM)

// the film rig's own models for the three venues it built itself
const RIG_MODELS = {
  'weathertech-raceway-laguna-seca': { kind: 'laguna', file: join(RIG_DATA, 'laguna.json') },
  'road-america': { kind: 'venue', file: join(RIG_DATA, 'venue-road-america.json') },
  'streets-of-detroit': { kind: 'city', file: join(RIG_DATA, 'city-detroit.json') },
};

const venues = Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(STILLS, 'venues.json'), 'utf8'))[ICONS ? 'icons' : 'built']).filter(([k]) => !k.startsWith('_')));
const stillsManifest = JSON.parse(readFileSync(join(ROOT, 'public/tracks-3d/manifest.json'), 'utf8'));

// ---------- centrelines (the same parameterisation the runtime draws with) ----------
function arcSampler(pts) {   // film rig world/city.js arcSampler
  const n = pts.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const L = cum[n];
  const at = (s) => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[(lo + 1) % n], f = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  return { at, length: L };
}
function centreline(kind, data) {
  if (kind === 'laguna') {   // world/laguna.js sample(frac): linear in the sample index
    const T = data.track, N = T.x.length;
    return Array.from({ length: NM }, (_, j) => { const s = (j / NM) * N, i = Math.floor(s) % N, k = (i + 1) % N, u = s - Math.floor(s); return [T.x[i] + (T.x[k] - T.x[i]) * u, T.z[i] + (T.z[k] - T.z[i]) * u]; });
  }
  const arc = arcSampler(data.circuit.pts);
  return Array.from({ length: NM }, (_, j) => arc.at((j / NM) * arc.length));
}

// ---------- the stills' fit (stills-tools/page.js parsePts, resampleClosed, align, uOf), unchanged ----------
function parsePts(d) { const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number), p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; }
function resampleClosed(P, N) {
  const n = P.length, cum = [0]; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[n], out = []; let i = 0;
  for (let k = 0; k < N; k++) { const d = (k / N) * L; while (cum[i + 1] < d) i++; const a = P[i % n], b = P[(i + 1) % n], f = (d - cum[i]) / (cum[i + 1] - cum[i] || 1); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  return out;
}
function align(sitePts, modelPts) {
  const N = sitePts.length, best = { rms: Infinity };
  const mc = modelPts.reduce((s, p) => [s[0] + p[0] / N, s[1] + p[1] / N], [0, 0]);
  const Q = modelPts.map(([x, z]) => [x - mc[0], z - mc[1]]);
  for (const mirror of [false, true]) {
    const S0 = sitePts.map(([x, y]) => (mirror ? [x, -y] : [x, y])), sc = S0.reduce((s, p) => [s[0] + p[0] / N, s[1] + p[1] / N], [0, 0]);
    const S = S0.map(([x, y]) => [x - sc[0], y - sc[1]]); let ss = 0; for (const [x, y] of S) ss += x * x + y * y;
    for (const dir of [1, -1]) for (let k = 0; k < N; k += 1) {
      let re = 0, im = 0, qq = 0;
      for (let i = 0; i < N; i += 2) { const j = (((k + dir * i) % N) + N) % N, [px, py] = S[i], [qx, qy] = Q[j]; re += px * qx + py * qy; im += px * qy - py * qx; qq += qx * qx + qy * qy; }
      const e = qq - (re * re + im * im) / (ss / 2);
      if (e < best.e || best.e === undefined) Object.assign(best, { e, k, dir, mirror, sc, mc, ss });
    }
  }
  const { k, dir, mirror, sc, mc: c } = best;
  const S = sitePts.map(([x, y]) => (mirror ? [x, -y] : [x, y])).map(([x, y]) => [x - sc[0], y - sc[1]]);
  let re = 0, im = 0, ss = 0;
  for (let i = 0; i < N; i++) { const j = (((k + dir * i) % N) + N) % N, [px, py] = S[i], [qx, qy] = Q[j]; re += px * qx + py * qy; im += px * qy - py * qx; ss += px * px + py * py; }
  const ar = re / ss, ai = im / ss;
  const map = ([x, y]) => { const [px, py] = mirror ? [x, -y] : [x, y], sx = px - sc[0], sy = py - sc[1]; return [ar * sx - ai * sy + c[0], ai * sx + ar * sy + c[1]]; };
  let r2 = 0, worst = 0; for (let i = 0; i < N; i++) { const [mx, mz] = map(sitePts[i]), j = (((k + dir * i) % N) + N) % N, d = Math.hypot(mx - modelPts[j][0], mz - modelPts[j][1]); r2 += d * d; worst = Math.max(worst, d); }
  return { k, dir, mirror, scale: Math.hypot(ar, ai), rotDeg: (Math.atan2(ai, ar) * 180) / Math.PI, rms: Math.sqrt(r2 / N), worst, map };
}

mkdirSync(OUT, { recursive: true });
const indexPath = join(OUT, 'index.json');
const index = existsSync(indexPath) && only ? JSON.parse(readFileSync(indexPath, 'utf8')) : { venues: {} };
for (const [slug, vc] of Object.entries(venues)) {
  if (only && !only.has(slug)) continue;
  const src = vc.loader && vc.data ? { kind: vc.loader, file: join(STILLS, vc.data) } : RIG_MODELS[slug];
  if (!src) { console.warn('no model for', slug); continue; }
  const outlineFile = join(ROOT, 'src/assets/tracks', slug + '.json');
  if (!existsSync(outlineFile)) { console.warn('no site outline for', slug); continue; }
  const data = JSON.parse(readFileSync(src.file, 'utf8'));
  const outline = JSON.parse(readFileSync(outlineFile, 'utf8'));
  const modelPts = centreline(src.kind, data);
  const site = resampleClosed(parsePts(outline.mainPath), NS);
  const A = align(site, modelPts);
  const u = new Array(NS); let offMax = 0;
  for (let i = 0; i < NS; i++) {
    const [mx, mz] = A.map(site[i]), j0 = (((A.k + A.dir * i) % NM) + NM) % NM;
    let bj = j0, bd = Infinity;
    for (let dj = -36; dj <= 36; dj++) { const j = (j0 + dj + NM) % NM, d = (modelPts[j][0] - mx) ** 2 + (modelPts[j][1] - mz) ** 2; if (d < bd) { bd = d; bj = j; } }
    u[i] = +(bj / NM).toFixed(5); offMax = Math.max(offMax, Math.sqrt(bd));
  }
  const still = stillsManifest.tracks?.[slug];
  const out = {
    v: 1, slug, name: outline.name, kind: src.kind,
    source: { model: src.file.replace(homedir(), '~'), outline: 'src/assets/tracks/' + slug + '.json', built: new Date().toISOString().slice(0, 10) },
    camera: { azim: vc.azim, elev: vc.elev, fill: 0.9 },
    terrain: Boolean(vc.terrain),
    map: { ns: NS, dir: A.dir, mirror: A.mirror, rotDeg: +A.rotDeg.toFixed(2), metresPerSiteUnit: +A.scale.toFixed(4), rmsM: +A.rms.toFixed(1), worstM: +A.worst.toFixed(1), refinedOffMaxM: +offMax.toFixed(1), u },
    attribution: still?.attribution ?? 'Map data © OpenStreetMap contributors (ODbL 1.0).',
    poster: still?.files?.plain ?? null,
    model: data,
  };
  const text = JSON.stringify(out);
  writeFileSync(join(OUT, slug + '.json'), text);
  const gz = gzipSync(text, { level: 9 }).length;
  index.venues[slug] = { file: `/tracks-3d/models/${slug}.json`, kind: src.kind, bytes: text.length, gzipBytes: gz, rmsM: out.map.rmsM, worstM: out.map.worstM, poster: out.poster, attribution: out.attribution };
  console.log(`${slug.padEnd(42)} ${src.kind.padEnd(6)} ${(text.length / 1024).toFixed(0).padStart(5)} KB  gz ${(gz / 1024).toFixed(0).padStart(4)} KB  fit rms ${out.map.rmsM} m, worst ${out.map.worstM} m, dir ${A.dir}${A.mirror ? ' mirrored' : ''}`);
}
index.generated = new Date().toISOString().slice(0, 10);
index.by = 'scripts/build-track-models.mjs';
writeFileSync(indexPath, JSON.stringify(index, null, 1));
console.log('wrote', OUT);
