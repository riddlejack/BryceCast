/** Regression guard: every OSM-traced outline's northOffsetDeg must agree with
 *  its own cached OpenStreetMap geometry.
 *
 *  The wind arrow and north tick on the track art turn by northOffsetDeg, so a
 *  stale value draws the wind the wrong way with nothing else looking wrong.
 *  That happened at World Wide Technology Raceway: Brief G recorded 104.66° for
 *  the old trace, Brief H retraced the outline (flipped about 180°) without the
 *  field, and the merge kept H's geometry under G's number. The true value is
 *  about 281.5°.
 *
 *  This check does not reuse build-track-outline.mjs. It fits each asset's SVG
 *  vertices onto a local-tangent-plane projection of the cached OSM nodes
 *  (least-squares rotation + uniform scale + translation, no reflection) and
 *  reads off where true north lands in the SVG. Needs only tracked files. */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const tracksDir = path.join(repoRoot, 'src/assets/tracks');

/* Correct venues fit within ~0.2°; the WWTR error was ~177°. */
const MAX_NORTH_ERROR_DEG = 1;
/* A fit worse than this means the SVG and OSM vertices don't correspond. */
const MAX_RMS_M = 5;
const EARTH_RADIUS_M = 6_371_008.8;

const parsePath = (d) => [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

/* Closed-form 2-D Procrustes: rotation (counter-clockwise, y-up) and RMS
 * residual of the best similarity transform taking src onto dst. */
const fitSimilarity = (src, dst) => {
  const mean = (points) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  });
  const ms = mean(src);
  const md = mean(dst);
  const a = src.map((point) => ({ x: point.x - ms.x, y: point.y - ms.y }));
  const b = dst.map((point) => ({ x: point.x - md.x, y: point.y - md.y }));
  let dot = 0;
  let cross = 0;
  let norm = 0;
  a.forEach((p, i) => {
    dot += p.x * b[i].x + p.y * b[i].y;
    cross += p.x * b[i].y - p.y * b[i].x;
    norm += p.x * p.x + p.y * p.y;
  });
  const theta = Math.atan2(cross, dot);
  const scale = Math.hypot(dot, cross) / norm;
  const residual = a.reduce((sum, p, i) => {
    const x = scale * (p.x * Math.cos(theta) - p.y * Math.sin(theta));
    const y = scale * (p.x * Math.sin(theta) + p.y * Math.cos(theta));
    return sum + (x - b[i].x) ** 2 + (y - b[i].y) ** 2;
  }, 0);
  return { theta, rmsM: Math.sqrt(residual / a.length) };
};

const failures = [];
const rows = [];

for (const file of fs.readdirSync(tracksDir).filter((name) => name.endsWith('.json')).sort()) {
  const asset = JSON.parse(fs.readFileSync(path.join(tracksDir, file), 'utf8'));
  if (asset.source?.provider !== 'OpenStreetMap') continue;
  if (typeof asset.northOffsetDeg !== 'number') {
    failures.push(`${asset.slug}: OSM-traced outline has no northOffsetDeg`);
    continue;
  }

  const osm = JSON.parse(fs.readFileSync(path.join(repoRoot, asset.source.cachedResponse), 'utf8'));
  const wayById = new Map(osm.elements.map((element) => [element.id, element]));
  const [mainWayId, pitWayId] = asset.source.wayIds;
  const mainGeo = wayById.get(mainWayId)?.geometry;
  const pitGeo = pitWayId ? (wayById.get(pitWayId)?.geometry ?? null) : [];
  if (!mainGeo || !pitGeo) {
    failures.push(`${asset.slug}: way ${mainGeo ? pitWayId : mainWayId} missing from ${asset.source.cachedResponse}`);
    continue;
  }

  const all = [...mainGeo, ...pitGeo];
  const lat0 = all.reduce((sum, node) => sum + node.lat, 0) / all.length;
  const lon0 = all.reduce((sum, node) => sum + node.lon, 0) / all.length;
  const toRad = (deg) => (deg * Math.PI) / 180;
  /* East = +x, north = +y, metres. */
  const project = ({ lat, lon }) => ({
    x: toRad(lon - lon0) * EARTH_RADIUS_M * Math.cos(toRad(lat0)),
    y: toRad(lat - lat0) * EARTH_RADIUS_M
  });
  let main = mainGeo.map(project);
  const closing = main[main.length - 1];
  if (Math.abs(main[0].x - closing.x) < 1e-6 && Math.abs(main[0].y - closing.y) < 1e-6) main = main.slice(0, -1);
  const pit = pitGeo.map(project);

  const svgMain = parsePath(asset.mainPath);
  const svgPit = asset.pitPath ? parsePath(asset.pitPath) : [];
  if (svgMain.length !== main.length || svgPit.length !== pit.length) {
    failures.push(
      `${asset.slug}: SVG has ${svgMain.length}+${svgPit.length} vertices, cached OSM ${main.length}+${pit.length}; ` +
        'the outline was not built from this cache'
    );
    continue;
  }

  /* SVG is y-down; (x, −y) is y-up like the projection, so no reflection is
   * needed. The fit rotates SVG onto the map by theta, so map north (0, 1) sits
   * at (sin θ, cos θ) in y-up SVG: θ degrees clockwise from SVG up. */
  const { theta, rmsM } = fitSimilarity(
    [...svgMain, ...svgPit].map(({ x, y }) => ({ x, y: -y })),
    [...main, ...pit]
  );
  const fittedDeg = (((theta * 180) / Math.PI) % 360 + 360) % 360;
  const errorDeg = ((fittedDeg - asset.northOffsetDeg + 540) % 360) - 180;
  rows.push({ slug: asset.slug, stored: asset.northOffsetDeg, fitted: Math.round(fittedDeg * 100) / 100, errorDeg: Math.round(errorDeg * 100) / 100, rmsM: Math.round(rmsM * 100) / 100 });

  if (rmsM > MAX_RMS_M) failures.push(`${asset.slug}: SVG-to-OSM fit RMS ${rmsM.toFixed(2)} m exceeds ${MAX_RMS_M} m`);
  if (Math.abs(errorDeg) > MAX_NORTH_ERROR_DEG) {
    failures.push(
      `${asset.slug}: northOffsetDeg ${asset.northOffsetDeg} but the outline fits its OSM cache at ${fittedDeg.toFixed(2)}° ` +
        `(off by ${errorDeg.toFixed(2)}°). Rebuild it with scripts/build-track-outline.mjs.`
    );
  }
}

console.table(rows);
if (rows.length === 0) failures.push('no OSM-traced outlines found');
if (failures.length > 0) {
  console.error(`test-track-orientation: ${failures.length} failure(s)\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`test-track-orientation: ${rows.length} OSM outlines agree with their cached geometry to within ${MAX_NORTH_ERROR_DEG}°`);
