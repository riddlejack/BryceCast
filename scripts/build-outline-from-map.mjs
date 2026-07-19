/** Build an outline-only track asset from a RaceTools static track-map package.
 *
 * Companion to scripts/build-track-outline.mjs (which traces permanent circuits
 * from cached OpenStreetMap geometry). Street circuits have no clean OSM way, so
 * their line art is derived from the lake map package's own track-centreline
 * polyline (index, cumulative_distance_m, x_m, y_m, width, flag @ ~1 m). The
 * package is joined by INI Track.Name + SHA-256 (never filename) and verified
 * here against an expected SHA before anything is read.
 *
 * Source-terms law (data/historical-data-lake/PERMISSIONS_AND_SOURCE_TERMS.md):
 * the raw RaceTools archive stays git-ignored. Only this DERIVED, simplified
 * line art plus the package SHA-256 (metadata) ship — never the source payload.
 * The build therefore reads the CSV from the git-ignored lake zip at generation
 * time; rebuilds need the lake present (unlike the OSM builder, which caches).
 *
 * Geographic caveat: the map-local x/y frame carries NO trustworthy north
 * (the [GPS] origins are untrusted and at least one is mislabelled — Detroit's
 * is Portland's, Toronto's Mid-Ohio's). So northOffsetDeg is OMITTED: wind-on-
 * shape honestly renders nothing, exactly as for the image-traced street
 * circuits this replaces.
 *
 * Usage:
 *   node scripts/build-outline-from-map.mjs \
 *     --slug=streets-of-detroit --name="Streets of Detroit" \
 *     --zip="<lake>/raw/views/racetools/maps/Detroit_2023.zip" \
 *     --csv=Detroit_2023.csv --sha=d96f8806aec4... \
 *     --ini-track-name="Detroit Street Circuit" [--tolerance=1.4] [--length-mi=1.645]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const arg = (name, fallback = null) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const slug = arg('slug');
const trackName = arg('name');
const zipPath = arg('zip');
const csvEntry = arg('csv');
const expectedSha = (arg('sha') ?? '').toLowerCase();
const iniTrackName = arg('ini-track-name') ?? trackName;
const tolerance = Number(arg('tolerance') ?? 1.4); // RDP epsilon in the 1000-wide SVG space
const lengthOverride = arg('length-mi') ? Number(arg('length-mi')) : null;
const cornerLabels = (arg('corner-labels') ?? '').split(',').filter(Boolean);
if (!slug || !trackName || !zipPath || !csvEntry) {
  console.error('Required: --slug --name --zip --csv [--sha --ini-track-name --tolerance --length-mi]');
  process.exit(1);
}

/* ---------- verify the package by SHA-256, then read the CSV from the zip ---------- */

const zipBytes = fs.readFileSync(zipPath);
const actualSha = crypto.createHash('sha256').update(zipBytes).digest('hex');
if (expectedSha && actualSha.toLowerCase() !== expectedSha) {
  throw new Error(`SHA mismatch for ${zipPath}\n  expected ${expectedSha}\n  actual   ${actualSha}`);
}
const csvText = execFileSync('unzip', ['-p', zipPath, csvEntry], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

/* CSV columns: index, cumulative_distance_m, x_m, y_m, width, flag(T/F), ... */
const rawPoints = csvText
  .trim()
  .split('\n')
  .map((line) => line.split(','))
  .filter((cols) => cols.length >= 4 && cols[0].trim() !== '')
  .map((cols) => ({ d: Number(cols[1]), x: Number(cols[2]), y: Number(cols[3]) }))
  .filter((p) => Number.isFinite(p.d) && Number.isFinite(p.x) && Number.isFinite(p.y));

const totalDistM = rawPoints[rawPoints.length - 1].d;
const lengthMi = lengthOverride ?? Math.round((totalDistM / 1609.344) * 1000) / 1000;

/* Drop a duplicated closing node (the SVG path closes with Z). Toronto's
 * polyline returns exactly to (0,0); the others leave a ~1 m final segment. */
let pts = rawPoints.slice();
const g0 = pts[0];
const gl = pts[pts.length - 1];
if (Math.hypot(gl.x - g0.x, gl.y - g0.y) < 0.5) pts = pts.slice(0, -1);

/* ---------- planar frame ----------
 * Match the OSM builder's handedness: it projects north as −y (y = −lat) so the
 * SVG keeps real chirality after the y-down fit. The RaceTools local plane is
 * y≈north-up, so we negate y the same way; every later step (PCA rotate, 180°
 * flip, uniform fit) is chirality-preserving, so the drawn loop matches reality
 * and build-track-outline's driving-direction test stays valid. */
let main = pts.map((p) => ({ x: p.x, y: -p.y, d: p.d }));

const centroid = (points) => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length
});
const mainCenter = centroid(main);

/* S/F is the polyline datum: distance 0 = the package control line (canon). */
const rawSfIndex = 0;

/* Lay the principal (long) axis horizontal, then flip 180° so the S/F reads in
 * the bottom half (frontstretch as "the bottom"), exactly like the OSM builder. */
let sxx = 0;
let syy = 0;
let sxy = 0;
for (const p of main) {
  const dx = p.x - mainCenter.x;
  const dy = p.y - mainCenter.y;
  sxx += dx * dx;
  syy += dy * dy;
  sxy += dx * dy;
}
const rotation = -0.5 * Math.atan2(2 * sxy, sxx - syy);
const rotateBy = (angle) => ({ x, y, d }) => ({
  x: mainCenter.x + (x - mainCenter.x) * Math.cos(angle) - (y - mainCenter.y) * Math.sin(angle),
  y: mainCenter.y + (x - mainCenter.x) * Math.sin(angle) + (y - mainCenter.y) * Math.cos(angle),
  d
});
main = main.map(rotateBy(rotation));
if (main[rawSfIndex].y < mainCenter.y) {
  main = main.map(rotateBy(Math.PI));
}

/* ---------- fit into a 1000-wide viewBox with padding ---------- */
const PAD = 24;
const WIDTH = 1000;
const xs = main.map((p) => p.x);
const ys = main.map((p) => p.y);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const scale = (WIDTH - PAD * 2) / (maxX - minX);
const height = Math.round((maxY - minY) * scale + PAD * 2);
const fit = ({ x, y, d }) => ({
  x: Math.round(((x - minX) * scale + PAD) * 10) / 10,
  y: Math.round(((y - minY) * scale + PAD) * 10) / 10,
  d
});
main = main.map(fit);

/* ---------- Ramer–Douglas–Peucker simplification (keeps the S/F node) ----------
 * Simplify the closed loop as two open chains split at the S/F node so index 0
 * is never dropped and the closing seam stays put. Each retained node keeps its
 * original cumulative distance for the anchoring pass. */
const perpDist = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
};
const rdp = (points, eps) => {
  if (points.length < 3) return points.slice();
  let idx = -1;
  let max = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = perpDist(points[i], points[0], points[points.length - 1]);
    if (dist > max) {
      max = dist;
      idx = i;
    }
  }
  if (max > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
};
/* Split at the S/F node (index 0) and at the far node, simplify both arcs. */
const half = Math.floor(main.length / 2);
const arcA = rdp(main.slice(0, half + 1), tolerance);
const arcB = rdp(main.slice(half), tolerance);
let simplified = arcA.slice(0, -1).concat(arcB.slice(0, -1)); // drop shared seam nodes
if (simplified.length < 3) simplified = main.slice();

const toPath = (points, close) =>
  `M${points.map((p) => `${p.x} ${p.y}`).join(' L')}${close ? ' Z' : ''}`;

/* ---------- start/finish marker (node 0 = distance 0) ---------- */
const sfAt = simplified[0];
const sfNext = simplified[1 % simplified.length];
const sfAngle = Math.atan2(sfNext.y - sfAt.y, sfNext.x - sfAt.x);
const startFinish = { x: sfAt.x, y: sfAt.y, angleDeg: Math.round((sfAngle * 180) / Math.PI) };

/* ---------- corner arcs: contiguous high-curvature runs, in driving order ---------- */
const turnAngleAt = (points, index) => {
  const prev = points[(index - 1 + points.length) % points.length];
  const here = points[index];
  const next = points[(index + 1) % points.length];
  const a1 = Math.atan2(here.y - prev.y, here.x - prev.x);
  const a2 = Math.atan2(next.y - here.y, next.x - here.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
};
const order = simplified.map((_, offset) => offset % simplified.length);
const totalTurn = order.reduce((sum, index) => sum + turnAngleAt(simplified, index), 0);
/* Sign-aware corner grouping: one arc per real corner. A corner is a run of
 * same-signed turning nodes; a short sub-threshold gap (a straight kink) is
 * tolerated inside it, but a sign flip (e.g. a chicane's second apex) starts a
 * new arc. This keeps angular street corners (each a hard single-node turn) and
 * smooth sweepers (many gentle nodes) both readable, instead of lumping a whole
 * curvy side into one 400° "arc". Walk 1.5 laps so a corner straddling the S/F
 * seam is captured once. */
const perNode = 0.035; // rad/node to count as "turning"
const gapTol = 2; // sub-threshold nodes tolerated inside one corner
const raw = [];
let cur = null;
let gap = 0;
const N = simplified.length;
for (let step = 0; step <= N + Math.floor(N / 2); step += 1) {
  const index = step % N;
  const turn = turnAngleAt(simplified, index);
  const sign = Math.sign(turn);
  if (Math.abs(turn) > perNode) {
    if (cur && cur.sign === sign) {
      cur.indices.push(index);
      cur.turn += turn;
      gap = 0;
    } else {
      if (cur) raw.push(cur);
      cur = { sign, indices: [index], turn };
      gap = 0;
    }
  } else if (cur) {
    gap += 1;
    if (gap > gapTol) {
      raw.push(cur);
      cur = null;
      gap = 0;
    }
  }
  if (step >= N && cur && cur.indices.includes(index) && index === (order[0] ?? 0)) break;
}
if (cur) raw.push(cur);
/* Dedupe corners seen twice across the 1.5-lap walk (same apex node). */
const seenApex = new Set();
const arcs = raw
  .filter((entry) => Math.abs(entry.turn) > Math.PI / 5) // > 36° net
  .map((entry) => {
    const mid = simplified[entry.indices[Math.floor(entry.indices.length / 2)]];
    const q1 = simplified[entry.indices[Math.floor(entry.indices.length * 0.25)]];
    const q3 = simplified[entry.indices[Math.floor(entry.indices.length * 0.75)]];
    return {
      apexNode: entry.indices[Math.floor(entry.indices.length / 2)],
      apex: { x: mid.x, y: mid.y },
      entryQuarter: { x: q1.x, y: q1.y },
      exitQuarter: { x: q3.x, y: q3.y },
      turnDeg: Math.round((Math.abs(entry.turn) * 180) / Math.PI)
    };
  })
  .filter((arc) => {
    if (seenApex.has(arc.apexNode)) return false;
    seenApex.add(arc.apexNode);
    return true;
  })
  .sort((a, b) => a.apexNode - b.apexNode)
  .map((arc, index) => ({
    label: cornerLabels[index] ?? null,
    apex: arc.apex,
    entryQuarter: arc.entryQuarter,
    exitQuarter: arc.exitQuarter,
    turnDeg: arc.turnDeg
  }));

const asset = {
  slug,
  name: trackName,
  lengthMi,
  viewBox: `0 0 ${WIDTH} ${height}`,
  mainPath: toPath(simplified, true),
  pitPath: null,
  startFinish,
  drivingDirection: totalTurn < 0 ? 'counterclockwise' : 'clockwise',
  cornerArcs: arcs,
  source: {
    provider: 'RaceTools static track-map package',
    license:
      'Used by direct permission for private, non-commercial use; raw archive git-ignored (data/historical-data-lake/PERMISSIONS_AND_SOURCE_TERMS.md).',
    attribution: 'Outline derived from the RaceTools track-map centreline polyline',
    wayIds: [],
    cachedResponse: `racetools:${iniTrackName} @ sha256:${actualSha}`
  }
};

const outPath = path.join(repoRoot, `src/assets/tracks/${slug}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(asset, null, 2)}\n`);

/* ---------- distance↔path sidecar (dev-only, git-ignored reports dir) ----------
 * The app parameterises mainPath by chord length (pathLength=1). Section anchors
 * live at TRUE cumulative distance. On curves the simplified chord underestimates
 * true arc, so map distance→path-t exactly via each retained node's carried
 * distance. Written outside the repo; the committed artefact is the .json above. */
const cum = [0];
for (let i = 0; i < simplified.length; i += 1) {
  const a = simplified[i];
  const b = simplified[(i + 1) % simplified.length];
  cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
}
const chordTotal = cum[simplified.length] || 1;
const distMap = simplified.map((p, i) => [
  Math.round((cum[i] / chordTotal) * 1e6) / 1e6, // path-t (chord fraction)
  Math.round((p.d / totalDistM) * 1e6) / 1e6 // true distance fraction
]);
const reportsDir = path.join(process.env.HOME ?? '', '.brycecast/reports/outlines-maps');
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(
  path.join(reportsDir, `${slug}.distmap.json`),
  `${JSON.stringify({ slug, totalDistM, chordTotalPx: Math.round(chordTotal), sfPathT: 0, distMap }, null, 0)}\n`
);
console.log(
  JSON.stringify(
    {
      ok: true,
      wrote: path.relative(repoRoot, outPath),
      rawNodes: rawPoints.length,
      simplifiedNodes: simplified.length,
      arcs: arcs.length,
      direction: asset.drivingDirection,
      lengthMi,
      totalDistM: Math.round(totalDistM * 10) / 10,
      viewBox: asset.viewBox,
      sha: actualSha.slice(0, 12)
    },
    null,
    2
  )
);
