/** Trace a track outline from an official INDYCAR black-outline PNG — for
 *  street circuits, which OSM does not tag as raceways (they're ordinary
 *  streets 51 weeks a year). The image is cached in src/assets/tracks/maps/
 *  for provenance; the traced asset matches the OSM-derived TrackOutline
 *  shape (no start/finish tick or corner arcs — the image doesn't carry them).
 *
 *  Usage: node scripts/trace-track-from-image.mjs --slug=streets-of-detroit \
 *    --name="Streets of Detroit" --length-mi=1.645 --image=<official png url>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const repoRoot = process.cwd();

const arg = (name, fallback = null) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const slug = arg('slug');
const trackName = arg('name');
const lengthMi = Number(arg('length-mi'));
const imageUrl = arg('image');
if (!slug || !trackName || !imageUrl) {
  console.error('Required: --slug --name --length-mi --image');
  process.exit(1);
}

const mapsDir = path.join(repoRoot, 'src/assets/tracks/maps');
fs.mkdirSync(mapsDir, { recursive: true });
const imagePath = path.join(mapsDir, `${slug}.png`);
if (!fs.existsSync(imagePath)) {
  execSync(`curl -sL --max-time 30 -o ${JSON.stringify(imagePath)} ${JSON.stringify(imageUrl)}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`file://${imagePath}`);
  const contour = await page.evaluate(async () => {
    const img = document.querySelector('img');
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const dark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      if (r + g + b < 450) dark[i] = 1;
    }
    // largest connected component (BFS, 8-neighborhood)
    const label = new Int32Array(w * h).fill(-1);
    let bestLabel = -1;
    let bestSize = 0;
    let next = 0;
    const stack = [];
    for (let start = 0; start < w * h; start += 1) {
      if (!dark[start] || label[start] !== -1) continue;
      let size = 0;
      stack.push(start);
      label[start] = next;
      while (stack.length) {
        const p = stack.pop();
        size += 1;
        const px = p % w;
        const py = (p / w) | 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (dark[q] && label[q] === -1) {
              label[q] = next;
              stack.push(q);
            }
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestLabel = next;
      }
      next += 1;
    }
    const inComp = (x, y) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === bestLabel;
    // Moore-neighbor boundary trace from the topmost-leftmost component pixel
    let sx = -1;
    let sy = -1;
    outer: for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (inComp(x, y)) {
          sx = x;
          sy = y;
          break outer;
        }
      }
    }
    const dirs = [
      [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]
    ];
    const points = [];
    let cx = sx;
    let cy = sy;
    let dir = 6; // came from below
    for (let step = 0; step < 200000; step += 1) {
      points.push([cx, cy]);
      let found = false;
      for (let k = 0; k < 8; k += 1) {
        const d = (dir + 6 + k) % 8; // start search 90° counterclockwise from entry
        const nx = cx + dirs[d][0];
        const ny = cy + dirs[d][1];
        if (inComp(nx, ny)) {
          cx = nx;
          cy = ny;
          dir = d;
          found = true;
          break;
        }
      }
      if (!found) break;
      if (cx === sx && cy === sy && points.length > 10) break;
    }
    return { points, width: w, height: h, componentSize: bestSize };
  });

  if (!contour || contour.points.length < 60) {
    throw new Error(`contour too small: ${contour?.points.length ?? 0} points`);
  }

  /* Ramer–Douglas–Peucker simplification. */
  const rdp = (points, epsilon) => {
    if (points.length < 3) return points;
    const [startPoint] = points;
    const endPoint = points[points.length - 1];
    let maxDistance = 0;
    let maxIndex = 0;
    const dx = endPoint[0] - startPoint[0];
    const dy = endPoint[1] - startPoint[1];
    const norm = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < points.length - 1; i += 1) {
      const distance = Math.abs(dy * points[i][0] - dx * points[i][1] + endPoint[0] * startPoint[1] - endPoint[1] * startPoint[0]) / norm;
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxDistance <= epsilon) return [startPoint, endPoint];
    const left = rdp(points.slice(0, maxIndex + 1), epsilon);
    const right = rdp(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  };

  const simplified = rdp(contour.points, Math.max(1.5, contour.width / 700));

  const PAD = 24;
  const WIDTH = 1000;
  const xs = simplified.map((point) => point[0]);
  const ys = simplified.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = (WIDTH - PAD * 2) / (maxX - minX);
  const height = Math.round((maxY - minY) * scale + PAD * 2);
  const fitted = simplified.map(([x, y]) => [
    Math.round(((x - minX) * scale + PAD) * 10) / 10,
    Math.round(((y - minY) * scale + PAD) * 10) / 10
  ]);

  const asset = {
    slug,
    name: trackName,
    lengthMi: Number.isFinite(lengthMi) ? lengthMi : null,
    viewBox: `0 0 ${WIDTH} ${height}`,
    mainPath: `M${fitted.map(([x, y]) => `${x} ${y}`).join(' L')} Z`,
    pitPath: null,
    startFinish: null,
    drivingDirection: null,
    cornerArcs: [],
    source: {
      provider: 'INDYCAR official track outline',
      license: 'traced shape of a public circuit layout',
      attribution: 'Outline traced from the official INDYCAR track map',
      wayIds: [],
      cachedResponse: `src/assets/tracks/maps/${slug}.png`,
      imageUrl
    }
  };

  const outPath = path.join(repoRoot, `src/assets/tracks/${slug}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(asset)}\n`);
  console.log(
    JSON.stringify({ ok: true, wrote: path.relative(repoRoot, outPath), contourPoints: contour.points.length, simplified: fitted.length, component: contour.componentSize }, null, 2)
  );
} finally {
  await browser.close();
}
