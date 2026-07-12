/** Batch-trace track outlines from OpenStreetMap for every permanent venue
 *  Bryce has raced in INDY NXT. Discovery per venue: query Overpass within a
 *  small bbox around the track's canonical coordinates, keep highway=raceway
 *  ways, pick the closed loop whose length best matches the known track
 *  length, cache the raw response, then delegate SVG generation to
 *  scripts/build-track-outline.mjs. Street circuits are not traced — the UI
 *  renders a no-art state.
 *
 *  Usage: node scripts/trace-track-outlines.mjs [--only=slug] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const cacheDir = path.join(repoRoot, 'src/assets/tracks/osm');

const arg = (name, fallback = null) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};
const only = arg('only');
const force = process.argv.includes('--force');

/** Permanent venues (name, canonical coordinates, length in km). Nashville is
 *  kept in the list so --force can regenerate everything consistently. */
const venues = [
  { slug: 'nashville-superspeedway', name: 'Nashville Superspeedway', lat: 36.0469, lon: -86.4119, lengthKm: 2.14, cornerLabels: '1·2,3,4' },
  { slug: 'barber-motorsports-park', name: 'Barber Motorsports Park', lat: 33.5325, lon: -86.6189, lengthKm: 3.83 },
  { slug: 'indianapolis-motor-speedway-road-course', name: 'Indianapolis Motor Speedway Road Course', lat: 39.7936, lon: -86.2353, lengthKm: 3.925 },
  { slug: 'iowa-speedway', name: 'Iowa Speedway', lat: 41.6779, lon: -93.0147, lengthKm: 1.439 },
  { slug: 'mid-ohio-sports-car-course', name: 'Mid-Ohio Sports Car Course', lat: 40.6893, lon: -82.6355, lengthKm: 3.634, pad: 0.045 },
  { slug: 'portland-international-raceway', name: 'Portland International Raceway', lat: 45.5939, lon: -122.6946, lengthKm: 3.161 },
  { slug: 'road-america', name: 'Road America', lat: 43.7971, lon: -87.989, lengthKm: 6.515, pad: 0.05 },
  { slug: 'the-milwaukee-mile', name: 'The Milwaukee Mile', lat: 43.0206, lon: -88.0105, lengthKm: 1.633 },
  { slug: 'weathertech-raceway-laguna-seca', name: 'WeatherTech Raceway Laguna Seca', lat: 36.5843, lon: -121.7539, lengthKm: 3.602 },
  { slug: 'world-wide-technology-raceway', name: 'World Wide Technology Raceway', lat: 38.6507, lon: -90.1355, lengthKm: 2.012, pad: 0.045 }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchOverpass = async (lat, lon, pad = 0.025) => {
  const bbox = `${lat - pad},${lon - pad},${lat + pad},${lon + pad}`;
  const query = `[out:json][timeout:25];(way["highway"="raceway"](${bbox}););out geom;`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BryceCast-track-outlines/1.0 (personal racing companion; one-time trace)'
      },
      body: new URLSearchParams({ data: query }).toString()
    });
    if (response.ok) return response.json();
    if (![429, 504].includes(response.status) || attempt === 4) throw new Error(`Overpass ${response.status}`);
    await sleep(10_000 * attempt);
  }
  throw new Error('Overpass retries exhausted');
};

const polylineMeters = (geometry) => {
  let total = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const a = geometry[index - 1];
    const b = geometry[index];
    const dx = (b.lon - a.lon) * 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    const dy = (b.lat - a.lat) * 110_540;
    total += Math.hypot(dx, dy);
  }
  return total;
};

const isClosed = (geometry) => {
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  return Math.abs(first.lat - last.lat) < 1e-7 && Math.abs(first.lon - last.lon) < 1e-7;
};

/** Circuit candidates only: no pit lanes, kart tracks, motocross/rallycross
 *  loops, or dragstrips — venues stack several facilities in one bbox. */
const isCircuitCandidate = (way) =>
  !/pit|kart|access|dragstrip|drag strip/i.test(way.tags?.name ?? '') &&
  !/kart|pit_lane/i.test(way.tags?.raceway ?? '') &&
  !/karting|motocross|rallycross/i.test(way.tags?.sport ?? '');

/** Some circuits live in OSM as several connected way segments (chicane
 *  variants, shared straights). DFS-join segments that meet at endpoints
 *  until a loop closes within 12% of the expected length. */
const assembleLoop = (ways, expected) => {
  const pointKey = (point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;

  /* Chicane links join circuits mid-way, not at endpoints — split every way
   * at coordinates shared with any other way so the DFS sees true junctions. */
  const nodeUse = new Map();
  for (const way of ways) {
    const seen = new Set();
    for (const point of way.geometry) {
      const key = pointKey(point);
      if (seen.has(key)) continue;
      seen.add(key);
      nodeUse.set(key, (nodeUse.get(key) ?? 0) + 1);
    }
  }
  const pieces = [];
  for (const way of ways) {
    let current = [way.geometry[0]];
    for (let index = 1; index < way.geometry.length; index += 1) {
      current.push(way.geometry[index]);
      const isJunction = (nodeUse.get(pointKey(way.geometry[index])) ?? 0) > 1;
      if (isJunction && index < way.geometry.length - 1) {
        pieces.push({ id: way.id, geometry: current });
        current = [way.geometry[index]];
      }
    }
    if (current.length >= 2) pieces.push({ id: way.id, geometry: current });
  }

  const segments = pieces
    .map((way, index) => ({
      index,
      way,
      meters: polylineMeters(way.geometry),
      startKey: pointKey(way.geometry[0]),
      endKey: pointKey(way.geometry[way.geometry.length - 1])
    }))
    /* Longest-first bias: at chicane junctions prefer the primary racing
     * line over short alternate links. */
    .sort((left, right) => right.meters - left.meters)
    .map((segment, index) => ({ ...segment, index }));
  const tolerance = 0.12;
  let found = null;
  let steps = 0;

  const walk = (path, used, currentKey, targetKey, total) => {
    if (found || total > expected * (1 + tolerance) || ++steps > 400_000) return;
    if (currentKey === targetKey && path.length > 1 && Math.abs(total - expected) / expected <= tolerance) {
      found = [...path];
      return;
    }
    for (const segment of segments) {
      if (used.has(segment.index)) continue;
      if (segment.startKey === currentKey) {
        used.add(segment.index);
        path.push({ segment, forward: true });
        walk(path, used, segment.endKey, targetKey, total + segment.meters);
        path.pop();
        used.delete(segment.index);
      } else if (segment.endKey === currentKey) {
        used.add(segment.index);
        path.push({ segment, forward: false });
        walk(path, used, segment.startKey, targetKey, total + segment.meters);
        path.pop();
        used.delete(segment.index);
      }
      if (found) return;
    }
  };

  for (const first of segments) {
    walk([{ segment: first, forward: true }], new Set([first.index]), first.endKey, first.startKey, first.meters);
    if (found) break;
  }
  if (!found) return null;

  const geometry = [];
  for (const { segment, forward } of found) {
    const points = forward ? segment.way.geometry : [...segment.way.geometry].reverse();
    geometry.push(...(geometry.length > 0 ? points.slice(1) : points));
  }
  return { geometry, sourceWayIds: [...new Set(found.map(({ segment }) => segment.way.id))], meters: polylineMeters(geometry) };
};

const run = async () => {
  const report = [];
  for (const venue of venues) {
    if (only && venue.slug !== only) continue;
    const assetPath = path.join(repoRoot, `src/assets/tracks/${venue.slug}.json`);
    if (fs.existsSync(assetPath) && !force) {
      report.push({ slug: venue.slug, state: 'exists' });
      continue;
    }
    const cachePath = path.join(cacheDir, `${venue.slug}.osm.json`);
    try {
      let osm;
      if (fs.existsSync(cachePath) && !force) {
        osm = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      } else {
        osm = await fetchOverpass(venue.lat, venue.lon, venue.pad);
        await sleep(4000);
      }
      /* Keep even 2-node connectors — circuits chain through tiny link ways. */
      const ways = (osm.elements ?? []).filter((element) => Array.isArray(element.geometry) && element.geometry.length >= 2);
      const expected = venue.lengthKm * 1000;
      const closedLoops = ways
        .filter((way) => isClosed(way.geometry) && isCircuitCandidate(way))
        .map((way) => ({ way, meters: polylineMeters(way.geometry) }))
        .sort((a, b) => Math.abs(a.meters - expected) - Math.abs(b.meters - expected));
      let main = closedLoops[0] ?? null;
      let mainElement = main?.way ?? null;
      if (!main || Math.abs(main.meters - expected) / expected > 0.2) {
        const candidates = ways.filter(isCircuitCandidate);
        const joined = assembleLoop(candidates, expected);
        if (!joined) {
          report.push({
            slug: venue.slug,
            state: 'skipped',
            reason: main ? `best loop ${Math.round(main.meters)}m vs expected ${Math.round(expected)}m; no joinable loop` : 'no closed or joinable raceway loop in OSM'
          });
          continue;
        }
        mainElement = {
          type: 'way',
          id: 1,
          tags: { name: venue.name, joined: 'yes', sourceWayIds: joined.sourceWayIds.join(',') },
          geometry: joined.geometry
        };
        main = { way: mainElement, meters: joined.meters };
      }
      const pit = ways.find((way) => /pit/i.test(way.tags?.name ?? '')) ?? null;
      const kept = { ...osm, elements: [mainElement, ...(pit ? [pit] : [])] };
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cachePath, `${JSON.stringify(kept)}\n`);
      const args = [
        'scripts/build-track-outline.mjs',
        `--slug=${venue.slug}`,
        `--name=${venue.name}`,
        `--length-mi=${(venue.lengthKm / 1.609344).toFixed(2)}`,
        `--main=${main.way.id}`,
        ...(pit ? [`--pit=${pit.id}`] : []),
        ...(venue.cornerLabels ? [`--corner-labels=${venue.cornerLabels}`] : [])
      ];
      const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
      if (result.status !== 0) {
        report.push({ slug: venue.slug, state: 'failed', reason: result.stderr.trim().slice(0, 160) });
        continue;
      }
      report.push({ slug: venue.slug, state: 'traced', mainWay: main.way.id, pitWay: pit?.id ?? null, meters: Math.round(main.meters) });
    } catch (error) {
      report.push({ slug: venue.slug, state: 'error', reason: error.message });
    }
  }
  console.log(JSON.stringify(report, null, 2));
};

await run();
