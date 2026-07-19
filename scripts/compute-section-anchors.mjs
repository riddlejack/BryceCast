/** Dev helper (not shipped, not imported by the app): print the arc-length
 *  fraction t along each oval's SVG mainPath for the start/finish anchor and
 *  every detected corner arc (apex, entry, exit). These t-values seed the
 *  curated section spans in src/assets/tracks/sections/<slug>.ts, which are then
 *  VERIFIED VISUALLY against the debug overlay — never trusted from math alone.
 *
 *  Note: the SVG mainPath is a pure polyline (M x y L x y ...). Its
 *  parameterisation t in [0,1] is the same one the app samples for
 *  nearest-point hover and for stroke-dasharray span drawing, so anchoring the
 *  curated spans to these t-values keeps geometry, hover, and render aligned.
 *
 *  Usage: node scripts/compute-section-anchors.mjs [slug ...]
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const parsePolyline = (d) => {
  // Matches "M x y", "L x y", ignores trailing "Z".
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

/** Cumulative arc-length fraction for each vertex of a closed polyline. */
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
  return { t: t[bestI], index: bestI, dist: Math.sqrt(bestD) };
};

const slugs = process.argv.slice(2);
const ovals =
  slugs.length > 0
    ? slugs
    : ['nashville-superspeedway', 'world-wide-technology-raceway', 'iowa-speedway', 'the-milwaukee-mile'];

for (const slug of ovals) {
  const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${slug}.json`), 'utf8'));
  const points = parsePolyline(asset.mainPath);
  const { t } = cumulativeT(points);
  const fmt = (v) => v.toFixed(4);
  console.log(`\n=== ${asset.name} (${slug}) — ${points.length} vertices, dir ${asset.drivingDirection} ===`);
  if (asset.startFinish) {
    const sf = nearestT(points, t, asset.startFinish);
    console.log(`  S/F        t=${fmt(sf.t)}  (vertex ${sf.index}, snap ${sf.dist.toFixed(1)}px)`);
  }
  asset.cornerArcs.forEach((arc, i) => {
    const apex = nearestT(points, t, arc.apex);
    const entry = nearestT(points, t, arc.entryQuarter);
    const exit = nearestT(points, t, arc.exitQuarter);
    console.log(
      `  arc#${i} ${arc.label ? `"${arc.label}"` : '(unlabelled)'} turn ${arc.turnDeg}°: ` +
        `entry t=${fmt(entry.t)}  apex t=${fmt(apex.t)}  exit t=${fmt(exit.t)}`
    );
  });
}
