/** Build an outline-only track asset from cached OpenStreetMap geometry.
 *
 * Locked decision (docs/CREATIVE_DIRECTION.md #5): track maps are thin-line
 * OSM tracings — no fills, no fake GPS. Raw OSM responses are cached in
 * src/assets/tracks/osm/ so rebuilds never need the network; the ODbL
 * attribution line ships on the Data screen.
 *
 * Usage:
 *   node scripts/build-track-outline.mjs --slug=nashville-superspeedway \
 *     --name="Nashville Superspeedway" --length-mi=1.33 --main=185563917 --pit=358925177 \
 *     --corner-labels="1·2,3,4"
 *
 * --corner-labels names each detected corner arc in driving order from the
 * start/finish line (verify against the rendered debug output before trusting).
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const arg = (name, fallback = null) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const slug = arg('slug');
const trackName = arg('name');
const lengthMi = Number(arg('length-mi'));
const mainWayId = Number(arg('main'));
const pitWayId = arg('pit') ? Number(arg('pit')) : null;
if (!slug || !trackName || !Number.isFinite(lengthMi) || !Number.isFinite(mainWayId)) {
  console.error('Required: --slug --name --length-mi --main [--pit]');
  process.exit(1);
}

const osmPath = path.join(repoRoot, `src/assets/tracks/osm/${slug}.osm.json`);
const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));
const wayById = new Map(osm.elements.map((element) => [element.id, element]));
const mainWay = wayById.get(mainWayId);
const pitWay = pitWayId ? wayById.get(pitWayId) : null;
if (!mainWay) throw new Error(`Main way ${mainWayId} not in ${osmPath}`);

/* ---------- project lon/lat to a flat plane (meters-ish) ---------- */

const allPoints = [...mainWay.geometry, ...(pitWay?.geometry ?? [])];
const midLat = allPoints.reduce((sum, point) => sum + point.lat, 0) / allPoints.length;
const cosLat = Math.cos((midLat * Math.PI) / 180);
const project = ({ lat, lon }) => ({ x: lon * cosLat * 111_320, y: -lat * 110_540 });

let main = mainWay.geometry.map(project);
let pit = (pitWay?.geometry ?? []).map(project);

/* Drop the duplicated closing node; the SVG path closes with Z. */
const first = main[0];
const last = main[main.length - 1];
const closed = Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
if (closed) main = main.slice(0, -1);

/* ---------- rotate so the start/finish straight reads as "the bottom" ---------- */

const centroid = (points) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length
});
const mainCenter = centroid(main);

/* Start/finish ≈ the main-loop point nearest the pit lane's midpoint,
 * found before rotation so the anchor is geometry, not orientation. */
let rawSfIndex = 0;
if (pit.length > 0) {
  const pitMid = pit[Math.floor(pit.length / 2)];
  let best = Infinity;
  main.forEach((point, index) => {
    const distance = (point.x - pitMid.x) ** 2 + (point.y - pitMid.y) ** 2;
    if (distance < best) {
      best = distance;
      rawSfIndex = index;
    }
  });
}
/* Lay the loop's principal (long) axis horizontal, then flip 180° if the
 * start/finish ends up in the top half — frontstretch reads as "the bottom". */
let sxx = 0;
let syy = 0;
let sxy = 0;
for (const point of main) {
  const dx = point.x - mainCenter.x;
  const dy = point.y - mainCenter.y;
  sxx += dx * dx;
  syy += dy * dy;
  sxy += dx * dy;
}
const rotation = -0.5 * Math.atan2(2 * sxy, sxx - syy);
const rotateBy = (angle) => ({ x, y }) => ({
  x: mainCenter.x + (x - mainCenter.x) * Math.cos(angle) - (y - mainCenter.y) * Math.sin(angle),
  y: mainCenter.y + (x - mainCenter.x) * Math.sin(angle) + (y - mainCenter.y) * Math.cos(angle)
});
main = main.map(rotateBy(rotation));
pit = pit.map(rotateBy(rotation));
if (pit.length > 0 && main[rawSfIndex].y < mainCenter.y) {
  main = main.map(rotateBy(Math.PI));
  pit = pit.map(rotateBy(Math.PI));
}

/* ---------- fit into a 1000-wide viewBox with padding ---------- */

const PAD = 24;
const WIDTH = 1000;
const xs = [...main, ...pit].map((point) => point.x);
const ys = [...main, ...pit].map((point) => point.y);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const scale = (WIDTH - PAD * 2) / (maxX - minX);
const height = Math.round((maxY - minY) * scale + PAD * 2);
const fit = ({ x, y }) => ({
  x: Math.round(((x - minX) * scale + PAD) * 10) / 10,
  y: Math.round(((y - minY) * scale + PAD) * 10) / 10
});
main = main.map(fit);
pit = pit.map(fit);

const toPath = (points, close) =>
  `M${points.map((point) => `${point.x} ${point.y}`).join(' L')}${close ? ' Z' : ''}`;

/* ---------- start/finish marker (index found pre-rotation) ---------- */

let startFinish = null;
const sfIndex = rawSfIndex;
if (pit.length > 0) {
  const at = main[sfIndex];
  const next = main[(sfIndex + 1) % main.length];
  const angle = Math.atan2(next.y - at.y, next.x - at.x);
  startFinish = { x: at.x, y: at.y, angleDeg: Math.round((angle * 180) / Math.PI) };
}

/* ---------- corner arcs: contiguous high-curvature runs, in driving order ---------- */

const turnAngleAt = (index) => {
  const prev = main[(index - 1 + main.length) % main.length];
  const here = main[index];
  const next = main[(index + 1) % main.length];
  const a1 = Math.atan2(here.y - prev.y, here.x - prev.x);
  const a2 = Math.atan2(next.y - here.y, next.x - here.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
};

/* Walk from start/finish in node order (OSM oneway = driving direction). */
const order = main.map((_, offset) => (sfIndex + offset) % main.length);
const totalTurn = order.reduce((sum, index) => sum + turnAngleAt(index), 0);
const threshold = 0.02; // radians per node ≈ sustained arc
const runs = [];
let run = null;
for (const index of order) {
  const magnitude = Math.abs(turnAngleAt(index));
  if (magnitude > threshold) {
    run ??= { indices: [], turn: 0 };
    run.indices.push(index);
    run.turn += Math.abs(turnAngleAt(index));
  } else if (run) {
    runs.push(run);
    run = null;
  }
}
if (run) runs.push(run);
const cornerLabels = (arg('corner-labels') ?? '').split(',').filter(Boolean);
const arcs = runs
  .filter((entry) => entry.turn > Math.PI / 4)
  .map((entry, index) => {
    const mid = main[entry.indices[Math.floor(entry.indices.length / 2)]];
    const q1 = main[entry.indices[Math.floor(entry.indices.length * 0.25)]];
    const q3 = main[entry.indices[Math.floor(entry.indices.length * 0.75)]];
    return {
      label: cornerLabels[index] ?? null,
      apex: mid,
      entryQuarter: q1,
      exitQuarter: q3,
      turnDeg: Math.round((entry.turn * 180) / Math.PI)
    };
  });

const asset = {
  slug,
  name: trackName,
  lengthMi,
  viewBox: `0 0 ${WIDTH} ${height}`,
  mainPath: toPath(main, true),
  pitPath: pit.length > 0 ? toPath(pit, false) : null,
  startFinish,
  drivingDirection: totalTurn < 0 ? 'counterclockwise' : 'clockwise',
  cornerArcs: arcs,
  source: {
    provider: 'OpenStreetMap',
    license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors',
    wayIds: [mainWayId, ...(pitWayId ? [pitWayId] : [])],
    cachedResponse: `src/assets/tracks/osm/${slug}.osm.json`
  }
};

const outPath = path.join(repoRoot, `src/assets/tracks/${slug}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(asset, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, outPath), nodes: main.length, arcs: arcs.length, direction: asset.drivingDirection, viewBox: asset.viewBox }, null, 2));
