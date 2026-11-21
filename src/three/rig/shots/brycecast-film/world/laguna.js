// world/laguna.js — the hero model: WeatherTech Raceway Laguna Seca as a tabletop model on the paper desk (builder A).
// Data: data/laguna.json (V8/tools/laguna_build.py from OpenStreetMap, ODbL "© OpenStreetMap contributors", and USGS
// 3DEP terrain through the AWS terrain tiles). Units metres, y up, true scale in plan, relief x2. The slab is centred on
// the world's origin; the map is turned about y by `laguna.turnY` (60°) so the Andretti Hairpin faces the home camera
// (+z). North on the model: `laguna.north` (a unit vector in xz).
//
// API
//   const laguna = await createLaguna(rig, stage)      stage from kit.js createStage(rig)
//   laguna.data                         the json (track samples every ds = 2.0002 m from S/F, loops, sections ...)
//   laguna.lap                          3601.82 m (= 141,804 in, the timing length; OSM's 3604.89 m scaled to it)
//   laguna.slot                         one race's slot pitch, 1.25 x the slab's longer side
//   laguna.turnY, laguna.north, laguna.size [w, d]   slab bbox, centred on the origin
//   laguna.pointAt(frac, lateral = 0, lift = 0) -> [x, y, z]   a point on the asphalt: frac = lap fraction from S/F in
//                                       the driving direction (any real; wraps), lateral metres left (+) or right (-) of
//                                       the centreline; on the piece's surface (follows a lifted piece)
//   laguna.headingAt(frac) -> yaw       rotation.y for an object whose nose is +x
//   laguna.pitchAt(frac) -> radians     nose-up positive, the model's slope (relief x2)
//   laguna.lineAt(frac) -> metres       the drawn racing line's lateral offset (elastic band, minimum curvature)
//   laguna.sectionOf(frac) -> 0..15     timing section index (sections[i] runs from loops[i] to loops[i + 1])
//   laguna.loopFrac(i) -> frac          loop i (0 = S/F)
//   laguna.pieces[i].set({lift, tint, tintAmt, strength, visible})   one per timing section (split at the loops):
//                                       lift metres above its seat (soft shadow in the seat), tint colour mixed by
//                                       tintAmt (0..1), strength 1 = full, 0 = stepped back toward the slab
//   laguna.wires[i].set({show, strength})   the timing loop i, a fine wire across the asphalt at its join; wide: true
//                                       adds a 1.2 m band over it (drawn) for far views
//   laguna.set({strength, sectionsStrength})  whole model strength (0..1: steps back toward the paper); reset() to defaults
//   laguna.reset()                      every piece seated, untinted, full; wires hidden; model full; pit lane opaque
//   laguna.setPit({alpha})              (v9, builder T) the pit lane group's opacity 0..1 (1 = default, 0 hides it)
//   laguna.poses                        named camera poses {target, D, elev, azim, fov} (see POSES below)
//   laguna.frame(points, {elev, azim, fov, fill, offset}) -> pose   a pose whose view of `points` fills `fill` of the frame
//   laguna.chase(pos, yaw, {back, up, fov, lookAhead}) -> pose      a chase camera behind a car
//   laguna.gridSlot(p) -> {frac, lateral, pos, yaw}                 grid slot for starting position p (drawn: two by two,
//                                       8 m per place, the first 7 m behind S/F, pole on the left)
//   blendPose(a, b, u, ease) -> pose    eased blend (log distance; angles the short way; target and fov eased)
//
// Drawn, not data: the racing line, kerbs, gravel traps, fences and tyre walls (placed from the track's curvature),
// grid slot spacing, the gantry, the pit wall, trees (OSM maps no woods here), building heights (OSM has none: 6 m,
// grandstands 10 m). Real: track shape and length, elevation, pit lane, buildings' footprints, the ponds, service roads,
// loop positions (inches from S/F), section names.
import { THREE, hex, mixHex, lerp, clamp01, smooth, easeRamp, easePeak, hash01 } from '../../../lib/rig.js';
import { KIT, HEAT } from '../kit.js';

const DATA_URL = new URL(/* @vite-ignore */ '../data/laguna.json', import.meta.url).href;

export function blendPose(a, b, u, { log = easeRamp(0.2, 0.45), ang = easePeak(0.45, 4) } = {}) {
  const ul = log(clamp01(u)), ua = ang(clamp01(u));
  const ad = (x, y) => { let d = y - x; while (d > 180) d -= 360; while (d < -180) d += 360; return x + d * ua; };
  return {
    target: a.target.map((x, k) => lerp(x, b.target[k], ua)),
    D: a.D * Math.pow(b.D / a.D, ul), elev: lerp(a.elev, b.elev, ua), azim: ad(a.azim, b.azim), fov: lerp(a.fov ?? 25, b.fov ?? 25, ua),
  };
}

export async function createLaguna(rig, stage, { url = DATA_URL } = {}) {
  const D = await (await fetch(url)).json();
  const { scene, camera } = rig;
  const root = new THREE.Group(); root.name = 'laguna'; scene.add(root);
  const T = D.track, N = T.x.length, ds = D.ds, LAP = D.lap, W = D.width;
  const lambert = (c, o) => stage.lambert(c, o);

  // ---------- track sampling ----------
  const TX = Float64Array.from(T.x), TZ = Float64Array.from(T.z), TY = Float64Array.from(T.y), TL = Float64Array.from(T.line);
  const tanX = new Float64Array(N), tanZ = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N, dx = TX[b] - TX[a], dz = TZ[b] - TZ[a], l = Math.hypot(dx, dz);
    tanX[i] = dx / l; tanZ[i] = dz / l;
  }
  const wrap = (f) => ((f % 1) + 1) % 1;
  function sample(frac) {
    const s = wrap(frac) * N, i = Math.floor(s) % N, j = (i + 1) % N, u = s - Math.floor(s);
    const tx = lerp(tanX[i], tanX[j], u), tz = lerp(tanZ[i], tanZ[j], u), tl = Math.hypot(tx, tz);
    return { x: lerp(TX[i], TX[j], u), z: lerp(TZ[i], TZ[j], u), y: lerp(TY[i], TY[j], u), tx: tx / tl, tz: tz / tl, line: lerp(TL[i], TL[j], u), i, u };
  }
  // left normal (x east, z south): (tz, -tx)
  const loopsD = D.loops.map((l) => l.d), secD = D.sections.map((s) => [s.d0, s.d1]);
  function sectionOf(frac) { const d = wrap(frac) * LAP; for (let k = 0; k < 16; k++) if (d >= secD[k][0] && d < secD[k][1]) return k; return 15; }
  const loopFrac = (i) => loopsD[i] / LAP;

  // ---------- materials ----------
  const M = {
    land: new THREE.MeshLambertMaterial({ vertexColors: true }),
    cut: lambert(KIT.cut),
    building: lambert(KIT.building, { flatShading: true }),
    water: lambert(KIT.water, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    road: lambert('#D3CDC3', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    pit: lambert('#5A5652', { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    white: lambert(KIT.line, { polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
    wall: lambert('#F3F1EC', { flatShading: true }),
    fence: lambert(KIT.fence),
    tyre: lambert('#4A4643', { flatShading: true }),
    gantry: lambert('#F3F1EC', { flatShading: true }),
    gantryInk: lambert(KIT.ink, { flatShading: true }),
  };

  // ---------- the slab ----------
  const S = D.slab, G = S.grid, nx = G.nx, nz = G.nz;
  const gy = Float32Array.from(G.y);
  const outline = S.outline;
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  function gridY(x, z) {
    const fx = (x - G.x0) / G.step, fz = (z - G.z0) / G.step;
    const j = Math.min(nx - 2, Math.max(0, Math.floor(fx))), i = Math.min(nz - 2, Math.max(0, Math.floor(fz))), u = fx - j, v = fz - i;
    const a = gy[i * nx + j], b = gy[i * nx + j + 1], c = gy[(i + 1) * nx + j], d = gy[(i + 1) * nx + j + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  {
    // grid top: vertices outside the outline snap to their nearest outline point (a clean organic edge)
    const nearestOutline = (x, z) => {
      let best = 1e18, bx = x, bz = z;
      for (let k = 0; k < outline.length; k++) {
        const [ax, az] = outline[k], [cx, cz] = outline[(k + 1) % outline.length];
        const ex = cx - ax, ez = cz - az, t = clamp01(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez));
        const px = ax + ex * t, pz = az + ez * t, d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < best) { best = d; bx = px; bz = pz; }
      }
      return [bx, bz];
    };
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), ins = new Uint8Array(nx * nz);
    const cG = hex(KIT.landTint), cL = hex(KIT.paddock), cS = hex(KIT.gravel), c = new THREE.Color();
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      const k = i * nx + j; let x = G.x0 + j * G.step, z = G.z0 + i * G.step;
      ins[k] = inPoly(x, z, outline) ? 1 : 0;
      pos[k * 3] = x; pos[k * 3 + 2] = z;
    }
    // snap only vertices of cells that touch the inside
    const need = new Uint8Array(nx * nz);
    for (let i = 0; i < nz - 1; i++) for (let j = 0; j < nx - 1; j++) {
      const a = i * nx + j, q = [a, a + 1, a + nx, a + nx + 1];
      if (q.some((v) => ins[v])) q.forEach((v) => (need[v] = 1));
    }
    for (let k = 0; k < nx * nz; k++) {
      if (need[k] && !ins[k]) { const [x, z] = nearestOutline(pos[k * 3], pos[k * 3 + 2]); pos[k * 3] = x; pos[k * 3 + 2] = z; }
      pos[k * 3 + 1] = need[k] ? gridY(pos[k * 3], pos[k * 3 + 2]) : 0;
      const g = G.gravel[k] / 255, l = G.land[k] / 255;
      c.copy(cG).lerp(cL, l).lerp(cS, g * 0.9);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let i = 0; i < nz - 1; i++) for (let j = 0; j < nx - 1; j++) {
      const a = i * nx + j, b = a + 1, cc = a + nx, d = cc + 1;
      if (!(ins[a] || ins[b] || ins[cc] || ins[d])) continue;
      idx.push(a, cc, b, b, cc, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    // normals eased 70% toward straight up (gate, Nov 11): with the relief x2 on a 5 m grid, the steep banks beside the
    // track and the hill flanks facing away from the sun shaded to broad grey gradients that read as smears close up;
    // the slopes still read in wide shots by their contours, trees and the cut edge
    { const nm = geo.attributes.normal.array; for (let k = 0; k < nm.length; k += 3) { const x = nm[k] * 0.3, y = nm[k + 1] * 0.3 + 0.7, z = nm[k + 2] * 0.3, l = Math.hypot(x, y, z) || 1; nm[k] = x / l; nm[k + 1] = y / l; nm[k + 2] = z / l; } }
    // the ground takes shadows but casts none (gate, Nov 11: the relief (x2) shadowing itself under a close shadow box
    // made broad grey smears on the pale ground in close shots; only cars, figure, buildings and walls cast)
    const top = new THREE.Mesh(geo, M.land); top.receiveShadow = true; top.castShadow = false; root.add(top);
    // cut edge: a wall from the outline at the top's height down to the desk
    const n = outline.length, wp = new Float32Array(n * 2 * 3), wi = [];
    for (let k = 0; k < n; k++) {
      const [x, z] = outline[k], y = gridY(x, z);
      wp.set([x, y, z], k * 6); wp.set([x, 0, z], k * 6 + 3);
      const a = k * 2, b = ((k + 1) % n) * 2;
      wi.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
    const wall = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: hex(KIT.cut), side: THREE.DoubleSide }));
    wall.castShadow = true; wall.receiveShadow = true; root.add(wall);
    // a soft contact shadow on the desk round the slab's foot (the outline blurred into the paper)
    const pad = 120, xs = outline.map((p) => p[0]), zs = outline.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
    const R = 1024, cv = document.createElement('canvas'); cv.width = R; cv.height = Math.round(R * (z1 - z0) / (x1 - x0));
    const g = cv.getContext('2d'), sx = cv.width / (x1 - x0);
    // alphaMap reads the green channel: white shape on black. Two layers: a wide soft one (about 40 m) and a firm one
    // close to the foot (about 7 m), so the slab sits on the desk
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'lighter';
    const shape = (blurM, a) => { g.filter = `blur(${Math.max(1, Math.round(blurM * sx))}px)`; g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath();
      outline.forEach(([x, z], k) => (k ? g.lineTo((x - x0) * sx, (z - z0) * sx) : g.moveTo((x - x0) * sx, (z - z0) * sx))); g.closePath(); g.fill(); };
    shape(40, 0.45); shape(7, 0.55);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    // lifted clear of the desk and offset in depth: at `heatHome`'s distance 5 cm was lost to depth fighting (builder F)
    sh.position.set((x0 + x1) / 2, 0.3, (z0 + z1) / 2); sh.renderOrder = -5; root.add(sh);
  }

  // ---------- ribbons ----------
  // ribbon along the track from d0 to d1 (metres), between lateral offsets l0 and l1, raised dy, with optional skirt
  function trackRibbon(d0, d1, l0, l1, dy, { step = 1, skirt = 0, colors = null } = {}) {
    const n = Math.max(2, Math.ceil((d1 - d0) / step) + 1), pos = [], idx = [], col = [];
    for (let k = 0; k < n; k++) {
      const d = d0 + ((d1 - d0) * k) / (n - 1), s = sample(d / LAP), lx = s.tz, lz = -s.tx;
      pos.push(s.x + lx * l0, s.y + dy, s.z + lz * l0, s.x + lx * l1, s.y + dy, s.z + lz * l1);
      if (colors) { const c = colors(d); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
    if (skirt) {   // two side walls down by `skirt` (the piece's cut sides)
      const base = pos.length / 3;
      for (let k = 0; k < n; k++) { const p = k * 6; pos.push(pos[p], pos[p + 1] - skirt, pos[p + 2], pos[p + 3], pos[p + 4] - skirt, pos[p + 5]); if (colors) col.push(...col.slice(k * 6, k * 6 + 6)); }
      for (let k = 1; k < n; k++) {
        const a = (k - 1) * 2, b = base + (k - 1) * 2;
        idx.push(a, b, a + 2, a + 2, b, b + 2);                // l0 side
        idx.push(a + 1, a + 3, b + 1, b + 1, a + 3, b + 3);    // l1 side
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function polyRibbon(P, w, yOf, dy) {   // a road along a polyline [[x, z], ...], width w, height from yOf
    const pos = [], idx = [];
    const n = P.length;
    for (let k = 0; k < n; k++) {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const lx = dz / l, lz = -dx / l, [x, z] = P[k];
      pos.push(x + lx * w / 2, yOf(x + lx * w / 2, z + lz * w / 2) + dy, z + lz * w / 2, x - lx * w / 2, yOf(x - lx * w / 2, z - lz * w / 2) + dy, z - lz * w / 2);
      if (k) { const q = (k - 1) * 2; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const densify = (P, step) => { const out = []; for (let k = 0; k < P.length - 1; k++) { const [ax, az] = P[k], [bx, bz] = P[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step)); for (let i = 0; i < n; i++) out.push([lerp(ax, bx, i / n), lerp(az, bz, i / n)]); } out.push(P[P.length - 1]); return out; };

  // a grandstand (OSM footprint; the rows drawn): its footprint's long axis, rows stepping up from the side nearest
  // the track to 10 m at the back, 0.9 m treads, so it reads as seating from above, not as a blank block
  function standRows(b) {
    const P = b.p, n = P.length, cx = P.reduce((a, q) => a + q[0], 0) / n, cz = P.reduce((a, q) => a + q[1], 0) / n;
    let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of P) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
    let vx = -uz, vz = ux;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of P) { const u = (x - cx) * ux + (z - cz) * uz, v = (x - cx) * vx + (z - cz) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    // the front faces the track: the nearer of the two long sides
    let best = 1e18, tx = 0, tz = 0; for (let k = 0; k < D.track.x.length; k += 4) { const d2 = (D.track.x[k] - cx) ** 2 + (D.track.z[k] - cz) ** 2; if (d2 < best) { best = d2; tx = D.track.x[k]; tz = D.track.z[k]; } }
    if ((tx - cx) * vx + (tz - cz) * vz > 0) { vx = -vx; vz = -vz; const a = -v1; v1 = -v0; v0 = a; }   // +v points away from the track
    const depth = v1 - v0, rows = Math.max(4, Math.round(depth / 0.9)), H = b.h, yb = Math.min(...P.map(([x, z]) => gridY(x, z))) - 0.5;
    const out = [], yaw = Math.atan2(-uz, ux);
    for (let r = 0; r < rows; r++) {
      const va = v0 + (depth * r) / rows, h = 1.0 + ((H - 1.0) * (r + 1)) / rows, len = u1 - u0;
      const mx = cx + ux * (u0 + u1) / 2 + vx * (va + depth) / 2, mz = cz + uz * (u0 + u1) / 2 + vz * (va + depth) / 2;
      const top = Math.max(gridY(mx, mz), yb + 0.5) + h;
      out.push(new THREE.BoxGeometry(len, top - yb, v1 - va).rotateY(yaw).translate(mx, (top + yb) / 2, mz));
    }
    return out;
  }

  // ---------- roads, water, buildings ----------
  for (const r of D.roads) { const m = new THREE.Mesh(polyRibbon(densify(r.p, 3), r.w, gridY, 0.25), M.road); m.receiveShadow = true; root.add(m); }
  for (const w of D.water) {
    const sh = new THREE.Shape(w.p.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, M.water); m.position.y = w.y + 0.2; m.receiveShadow = true; root.add(m);
  }
  {
    const geos = [];
    for (const b of D.buildings) {
      if (b.kind === 'grandstand') { geos.push(...standRows(b)); continue; }
      const sh = new THREE.Shape(b.p.map(([x, z]) => new THREE.Vector2(x, -z)));
      const top = Math.max(...b.p.map(([x, z]) => gridY(x, z))) + b.h;
      const g = new THREE.ExtrudeGeometry(sh, { depth: top - b.y0, bevelEnabled: false }).rotateX(-Math.PI / 2);
      g.translate(0, b.y0, 0); geos.push(g);
    }
    const m = new THREE.Mesh(mergeGeos(geos), M.building); m.castShadow = true; m.receiveShadow = true; root.add(m);
  }

  // ---------- the pit lane, pit wall ----------
  const PIT = D.pit, PN = PIT.x.length;
  const pitGroup = new THREE.Group(); root.add(pitGroup);   // hidden while a piece is lifted (its arc inside the hairpin reads as a second piece)
  // v9 (builder T, additive): the pit lane's own copies of its four materials (identical, so the default picture is
  // unchanged) so `setPit({alpha})` can fade the lane, wall, fence and boxes without touching the track's shared ones.
  const PM = { pit: M.pit.clone(), wall: M.wall.clone(), fence: M.fence.clone(), white: M.white.clone() };
  {
    const P = PIT.x.map((x, k) => [x, PIT.z[k]]);
    const yOf = (() => { const ys = PIT.y; return (x, z) => { let best = 1e18, bi = 0; for (let k = 0; k < PN; k += 1) { const d = (PIT.x[k] - x) ** 2 + (PIT.z[k] - z) ** 2; if (d < best) { best = d; bi = k; } } return ys[bi]; }; })();
    const m = new THREE.Mesh(polyRibbon(P, D.pitWidth, yOf, 0.06), PM.pit); m.receiveShadow = true; pitGroup.add(m);
    // pit wall on the track side of the pit lane, from 40 m after the lane leaves the track to 40 m before it rejoins
    const k0 = 25, k1 = PN - 25, geos = [];
    for (let k = k0; k < k1; k += 1) {
      const a = k, b = k + 1, sd = PIT.side[k];
      const dx = PIT.x[b] - PIT.x[a], dz = PIT.z[b] - PIT.z[a], l = Math.hypot(dx, dz), lx = dz / l, lz = -dx / l;
      const off = -sd * (D.pitWidth / 2 + 0.6);   // pit lane is on the track's left (+1): its wall on the lane's right
      const g = new THREE.BoxGeometry(l + 0.02, 1.1, 0.45);
      g.rotateY(Math.atan2(-dz, dx)); g.translate((PIT.x[a] + PIT.x[b]) / 2 + lx * off, (PIT.y[a] + PIT.y[b]) / 2 + 0.55, (PIT.z[a] + PIT.z[b]) / 2 + lz * off);
      geos.push(g);
    }
    const w = new THREE.Mesh(mergeGeos(geos), PM.wall); w.castShadow = true; w.receiveShadow = true; pitGroup.add(w);
    // the debris fence on the wall (drawn): posts every 3 m and three cables, fine repeated marks at car height
    const fg = []; let acc = 0;
    for (let k = k0; k < k1; k += 1) {
      const a = k, b = k + 1, sd = PIT.side[k];
      const dx = PIT.x[b] - PIT.x[a], dz = PIT.z[b] - PIT.z[a], l = Math.hypot(dx, dz), lx = dz / l, lz = -dx / l, off = -sd * (D.pitWidth / 2 + 0.6);
      const cx = (PIT.x[a] + PIT.x[b]) / 2 + lx * off, cz = (PIT.z[a] + PIT.z[b]) / 2 + lz * off, cy = (PIT.y[a] + PIT.y[b]) / 2 + 1.1, yaw = Math.atan2(-dz, dx);
      fg.push(new THREE.BoxGeometry(l + 0.02, 0.02, 0.02).rotateY(yaw).translate(cx, cy + 2.5, cz));
      acc += l; if (acc >= 4) { acc -= 4; fg.push(new THREE.BoxGeometry(0.035, 2.5, 0.035).translate(cx, cy + 1.25, cz)); }
    }
    const fm = new THREE.Mesh(mergeGeos(fg), PM.fence); fm.castShadow = true; pitGroup.add(fm);
    // pit boxes (drawn): a fine paper-white line across the lane every 12 m along its middle
    const pb = [], PL = []; let s = 0; for (let k = 0; k < PN; k++) { if (k) s += Math.hypot(PIT.x[k] - PIT.x[k - 1], PIT.z[k] - PIT.z[k - 1]); PL.push(s); }
    let nextS = PL[PN - 1] * 0.22;
    for (let k = 1; k < PN - 1 && nextS < PL[PN - 1] * 0.78; k++) {
      if (PL[k] < nextS) continue; nextS += 12;
      const dx = PIT.x[k + 1] - PIT.x[k - 1], dz = PIT.z[k + 1] - PIT.z[k - 1], l = Math.hypot(dx, dz);
      pb.push(new THREE.BoxGeometry(0.25, 0.02, D.pitWidth * 0.9).rotateY(Math.atan2(-dz, dx)).translate(PIT.x[k], PIT.y[k] + 0.08, PIT.z[k]));
    }
    if (pb.length) { const m = new THREE.Mesh(mergeGeos(pb), PM.white); m.receiveShadow = true; pitGroup.add(m); }
  }
  // setPit({alpha}) (v9, builder T, additive): 1 = as v8 (opaque, the default); below 1 the four copies go transparent
  // (no depth write) and the wall and fence stop casting shadows; 0 also hides the group. reset() sets alpha 1 again.
  const pitShadow = pitGroup.children.map((m) => m.castShadow);
  let pitAlpha = 1;
  function setPit({ alpha } = {}) {
    if (alpha === undefined) return api;
    const a = clamp01(alpha), tr = a < 1; pitAlpha = a;
    for (const m of Object.values(PM)) { if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; } m.opacity = a; }
    pitGroup.children.forEach((m, i) => { m.castShadow = pitShadow[i] && !tr; });
    if (a <= 0.001) pitGroup.visible = false;
    return api;
  }

  // ---------- parking (OSM areas and aisles; the rows drawn): faint stall lines so the paddock is not a blank patch ----------
  {
    const segs = [], inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    for (const pk of D.parking) {
      const P = pk.p, n = P.length, cx = P.reduce((a, p) => a + p[0], 0) / n, cz = P.reduce((a, p) => a + p[1], 0) / n;
      let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of P) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
      let r = 0; for (const [x, z] of P) r = Math.max(r, Math.hypot(x - cx, z - cz));
      // the outline
      for (let i = 0; i < n; i++) segs.push([P[i], P[(i + 1) % n], 0.4]);
      // rows (drawn): a fine divider line every 18 m across the lot (stall ticks read as noise at every distance)
      for (let v = -r + 9; v <= r; v += 18) { let run = null;
        for (let u = -r; u <= r + 2; u += 2) {
          const x = cx + ux * u + vx * v, z = cz + uz * u + vz * v, ins = inPoly(P, x, z) && u <= r;
          if (ins && !run) run = [x, z]; else if (!ins && run) { segs.push([run, [x - ux * 2, z - uz * 2], 0.3]); run = null; }
        } }
    }
    const geos = [];
    for (const [[ax, az], [bx2, bz2], w] of segs) {
      const l = Math.hypot(bx2 - ax, bz2 - az); if (l < 0.3) continue;
      const mx = (ax + bx2) / 2, mz = (az + bz2) / 2;
      geos.push(new THREE.BoxGeometry(l, 0.03, w).rotateY(Math.atan2(-(bz2 - az), bx2 - ax)).translate(mx, gridY(mx, mz) + 0.3, mz));
    }
    if (geos.length) { const m = new THREE.Mesh(mergeGeos(geos), lambert('#D3CDC2', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; root.add(m); }
  }

  // ---------- track pieces (16, split at the loops) ----------
  const pieces = [];
  const asphalt = hex(KIT.asphalt), dimTo = hex('#D9D4CC');
  for (let k = 0; k < 16; k++) {
    const [d0, d1] = secD[k];
    const grp = new THREE.Group(); root.add(grp);
    const mat = lambert(KIT.asphalt, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const surf = new THREE.Mesh(trackRibbon(d0, d1, W / 2, -W / 2, 0.02, { step: 1, skirt: 1.6 }), mat);   // the cut sides: deep enough to carry a name (pieceSideText)
    // casts only while raised (gate round 4, ground clean: seated, the ribbon's skirt threw a broad dark band into the
    // relief's hollows, e.g. inside the hairpin)
    surf.receiveShadow = true; surf.castShadow = false; grp.add(surf);
    // white edge lines (0.25 m, 0.35 m in from each edge)
    const lines = new THREE.Group(); grp.add(lines);
    for (const sgn of [1, -1]) {
      const m = new THREE.Mesh(trackRibbon(d0, d1, sgn * (W / 2 - 0.35), sgn * (W / 2 - 0.6), 0.035, { step: 1 }), M.white);
      m.receiveShadow = true; lines.add(m);
    }
    // kerbs on this piece: clay and white stripes, 1.5 m long, 1.3 m wide, just outside the edge line
    const kc = hex(KIT.clay), kw = hex(KIT.kerbWhite);
    for (const kb of D.kerbs) {
      for (const shift of [0, LAP, -LAP]) {
        const a = Math.max(kb.from + shift, d0), b = Math.min(kb.to + shift, d1);
        if (b - a < 0.5) continue;
        const sgn = kb.side, l0 = sgn * (W / 2 - 0.15), l1 = sgn * (W / 2 + 1.15);
        const g = trackRibbon(a, b, l0, l1, 0.08, { step: 0.75, colors: (d) => (Math.floor(d / 1.5) % 2 ? kc : kw) });
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, flatShading: true }));
        m.receiveShadow = true; grp.add(m);
      }
    }
    // the seat's shadow (shows as the piece lifts)
    const seatMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    const seat = new THREE.Mesh(trackRibbon(d0, d1, W / 2 + 2, -W / 2 - 2, 0.03, { step: 2 }), seatMat);
    seat.renderOrder = 2; root.add(seat);
    // the heat map's ink edge lines (one down each side of the ribbon, over the kerbs) and the walls a proud piece
    // stands on (their height follows `proud`)
    const edgeM = new THREE.MeshBasicMaterial({ color: hex(KIT.ink), transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9 });
    const edges = new THREE.Mesh(mergeGeos([trackRibbon(d0, d1, W / 2 + 1.3, W / 2 - 0.2, 0.11, { step: 1 }), trackRibbon(d0, d1, -W / 2 + 0.2, -W / 2 - 1.3, 0.11, { step: 1 })]), edgeM);
    edges.visible = false; edges.renderOrder = 4; grp.add(edges);
    const wallG = trackRibbon(d0, d1, W / 2, -W / 2, 0.0, { step: 2, skirt: 1 }), wallTop = Float32Array.from(wallG.attributes.position.array);
    { const nTop = wallG.attributes.position.count / 2; wallG.setIndex(new THREE.BufferAttribute(wallG.index.array.slice(((nTop / 2) - 1) * 6), 1)); }   // the side walls only
    const walls = new THREE.Mesh(wallG, lambert(KIT.cut, { flatShading: true })); walls.visible = false; walls.castShadow = true; walls.receiveShadow = true; grp.add(walls);
    const setWalls = (h) => { const a = wallG.attributes.position.array, nTop = a.length / 6; for (let i = nTop; i < a.length / 3; i++) a[i * 3 + 1] = wallTop[(i - nTop) * 3 + 1] - h; wallG.attributes.position.needsUpdate = true; wallG.computeBoundingSphere(); };
    const piece = {
      k, name: D.sections[k].name, group: grp, mat, seat, lift: 0, proud: 0, raise: 0,
      // heat 0..1 with rank 1..5: the dark asphalt eases to the rank's step of HEAT (five clear steps: ink slowest,
      // gold fastest) and the ink edge lines come in; proud m: the piece stands that high on cut-coloured walls (the
      // heat map's second reading: fastest highest). tint/tintAmt: any other colour.
      set({ lift, tint, tintAmt, strength, visible, heat, rank, proud } = {}) {
        if (lift !== undefined) this.lift = lift;
        if (proud !== undefined) this.proud = proud;
        if (lift !== undefined || proud !== undefined) {
          this.raise = this.lift + this.proud; grp.position.y = this.raise; surf.castShadow = this.raise > 0.05; seatMat.opacity = 0.22 * clamp01(this.lift / 3);
          walls.visible = this.proud > 0.05; if (walls.visible) setWalls(this.proud);
          pitGroup.visible = !pieces.some((q) => q.lift > 0.5);
        }
        if (rank !== undefined) this.rank = rank;
        if (heat !== undefined) { this.heat = heat; edgeM.opacity = clamp01(heat); edges.visible = heat > 0.01; }
        if (tint !== undefined) this.tint = tint;
        if (tintAmt !== undefined) this.tintAmt = tintAmt;
        if (strength !== undefined) this.strength = strength;
        if (visible !== undefined) grp.visible = visible;
        const c = asphalt.clone();
        if (this.heat && this.rank) c.lerp(hex(HEAT[this.rank]), this.heat);
        if (this.tint && this.tintAmt) c.lerp(hex(this.tint), this.tintAmt);
        c.lerp(dimTo, (1 - (this.strength ?? 1)) * 0.8);
        mat.color.copy(c);
        // the walls a proud piece stands on: its own colour a step darker (lead's gate, Nov 11: not black sides)
        walls.material.color.copy(c).multiplyScalar(0.84);
        lines.visible = (this.strength ?? 1) > 0.3;
        return this;
      },
    };
    pieces.push(piece);
  }

  // ---------- S/F line, grid slots, wires ----------
  {
    const geos = [];
    const sfm = new THREE.Mesh(trackRibbon(LAP - 0.5, LAP + 0.5, W / 2 - 0.6, -W / 2 + 0.6, 0.04, { step: 0.5 }), M.white);
    pieces[15].group.add(sfm);
    // a chequered band either side of the line (small squares: 0.5 m)
    const chk = [];
    for (let row = 0; row < 2; row++) for (let c = 0; c < 22; c++) if ((row + c) % 2 === 0) {
      const d = LAP + 0.5 + row * 0.5, l0 = -W / 2 + 0.6 + c * ((W - 1.2) / 22), l1 = l0 + (W - 1.2) / 22;
      chk.push(trackRibbon(d, d + 0.5, l1, l0, 0.045, { step: 0.5 }));
    }
    const ck = new THREE.Mesh(mergeGeos(chk.map((g) => g.translate(0, 0, 0))), lambert(KIT.ink, { polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }));
    pieces[0].group.add(ck);
    // grid slots (drawn, gate Nov 11): a painted box round each car, 6.4 m by 2.9 m in 15 cm white lines (the car, 5 m by
    // 2 m, sits inside it with its tyres clear of the lines); the slot's number goes ahead of it (paintGridNumbers)
    for (const s of D.slots) {
      const d = s.d, lat = s.lat;
      const k = sectionOf(d / LAP);
      const fr = trackRibbon(d + 3.05, d + 3.2, lat + 1.45, lat - 1.45, 0.04, { step: 0.15 });
      const bk = trackRibbon(d - 3.2, d - 3.05, lat + 1.45, lat - 1.45, 0.04, { step: 0.15 });
      const t1 = trackRibbon(d - 3.2, d + 3.2, lat + 1.45, lat + 1.3, 0.04, { step: 0.4 });
      const t2 = trackRibbon(d - 3.2, d + 3.2, lat - 1.3, lat - 1.45, 0.04, { step: 0.4 });
      const m = new THREE.Mesh(mergeGeos([fr, bk, t1, t2]), M.white); m.receiveShadow = true;
      pieces[k].group.add(m);
    }
  }
  const wires = D.loops.map((l, i) => {
    const d = l.d === 0 ? 0 : l.d;
    const g = trackRibbon(d - 0.025, d + 0.025, W / 2 + 0.6, -W / 2 - 0.6, 0.06, { step: 0.05 });
    const mat = new THREE.MeshBasicMaterial({ color: hex(KIT.ink), transparent: true, opacity: 1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
    const m = new THREE.Mesh(g, mat); m.visible = false; m.renderOrder = 6; root.add(m);
    // wide: a 1.2 m band in the wire's ink drawn over it, for views where the 5 cm wire is under a pixel (drawn, not
    // true scale; b12). Off unless set({wide: true}); reset() turns it off.
    const bg = trackRibbon(d - 0.6, d + 0.6, W / 2 + 0.6, -W / 2 - 0.6, 0.07, { step: 0.3 });
    const bm = new THREE.Mesh(bg, mat); bm.visible = false; bm.renderOrder = 6; root.add(bm);
    let wide = false;
    return { id: l.id, d, mesh: m, set({ show, strength, wide: wd } = {}) { if (wd !== undefined) wide = !!wd; if (show !== undefined) m.visible = show > 0.01, mat.opacity = clamp01(show) * (strength ?? 1); if (strength !== undefined && show === undefined) mat.opacity = strength; bm.visible = m.visible && wide; return this; } };
  });

  // ---------- gantry over S/F ----------
  {
    const s = sample(0), lx = s.tz, lz = -s.tx, yaw = Math.atan2(-s.tz, s.tx);
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = yaw; pieces[0].group.add(g);
    const span = W + 3.0;
    // gate, Nov 11: the real gantry's shape, a box-truss bridge on two lattice towers with the start-light panel
    // hanging at its middle (drawn from photographs of the Laguna Seca S/F bridge; sizes approximate): a bar is a
    // thin flat-shaded box between two points (local: x along the track, y up, z across)
    const bar = (p, q, r, mat = M.gantry) => {
      const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), l = d.length();
      const m = new THREE.Mesh(new THREE.BoxGeometry(r, r, l), mat);
      m.position.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); m.castShadow = true; g.add(m);
    };
    const z0 = -span / 2, z1 = span / 2, yb = 5.9, yt = 7.3, hx = 0.6, ch = 0.2, br = 0.09;
    // the bridge: four chords, then verticals and Warren diagonals on both faces and across top and bottom
    for (const x of [-hx, hx]) for (const y of [yb, yt]) bar([x, y, z0 - 0.5], [x, y, z1 + 0.5], ch);
    const NB = 12;
    for (let k = 0; k <= NB; k++) {
      const z = z0 + ((z1 - z0) * k) / NB, zn = z0 + ((z1 - z0) * (k + 1)) / NB;
      for (const x of [-hx, hx]) bar([x, yb, z], [x, yt, z], br);
      bar([-hx, yt, z], [hx, yt, z], br); bar([-hx, yb, z], [hx, yb, z], br);
      if (k < NB) { const up = k % 2 === 0; for (const x of [-hx, hx]) bar([x, up ? yb : yt, z], [x, up ? yt : yb, zn], br); bar([-hx, yt, z], [hx, yt, zn], br * 0.8); }
    }
    // the towers: four corner posts, ties every 1.2 m and a diagonal on each face
    for (const zc of [z0, z1]) {
      const c = [[-hx, zc - 0.5], [hx, zc - 0.5], [hx, zc + 0.5], [-hx, zc + 0.5]];
      for (const [x, z] of c) bar([x, 0, z], [x, yt, z], ch);
      for (let y = 0.4, i = 0; y < yt - 0.3; y += 1.2, i++) for (let e = 0; e < 4; e++) {
        const [xa, za] = c[e], [xb, zb] = c[(e + 1) % 4];
        bar([xa, y, za], [xb, y, zb], br);
        if (y + 1.2 < yt) bar(i % 2 ? [xa, y, za] : [xb, y, zb], i % 2 ? [xb, y + 1.2, zb] : [xa, y + 1.2, za], br * 0.8);
      }
    }
    // the light panel facing the oncoming cars (-x), hung under the bridge's middle: a dark board with two rows of
    // five lamps (pale when off)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 3.6), M.gantryInk); panel.position.set(-hx - 0.1, yb - 0.2, 0); panel.castShadow = true; g.add(panel);
    for (const sgn of [-1, 1]) bar([-hx - 0.1, yb + 0.45, sgn * 1.2], [-hx - 0.1, yb - 0.1, sgn * 1.2], 0.08, M.gantryInk);
    for (let k = 0; k < 5; k++) for (const y of [yb - 0.0, yb - 0.45]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14).rotateZ(Math.PI / 2), M.wall); l.position.set(-hx - 0.2, y, (k - 2) * 0.62); g.add(l); }
  }

  // ---------- fences, tyre walls (drawn) ----------
  {
    const posts = [], rails = [], tyres = [];
    const runs = [];
    for (const kb of D.kerbs) if (kb.to - kb.from > 20) runs.push([kb.from - 25, kb.to + 25, -kb.side]);
    // the front straight's outside (grandstand side) and the pit straight
    runs.push([LAP - 300, LAP + 40, -1]);
    for (const [a, b, side] of runs) {
      const off = side * (W / 2 + 15), toff = side * (W / 2 + 13.6);
      let prev = null;
      for (let d = a; d <= b; d += 3.2) {
        const s = sample(d / LAP), lx = s.tz, lz = -s.tx, x = s.x + lx * off, z = s.z + lz * off;
        const y = gridY(x, z);
        posts.push([x, y, z]);
        if (prev) rails.push([prev, [x, y, z]]);
        prev = [x, y, z];
        for (let t = 0; t < 3; t++) { const dt = d + t * 1.05; const s2 = sample(dt / LAP), x2 = s2.x + s2.tz * toff, z2 = s2.z - s2.tx * toff; tyres.push([x2, gridY(x2, z2), z2]); }
      }
    }
    const pg = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 5).translate(0, 1.3, 0);
    const pm = new THREE.InstancedMesh(pg, M.fence, posts.length);
    const o = new THREE.Object3D();
    posts.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); });
    pm.castShadow = true; root.add(pm);
    // two thin rails (top and middle) as boxes between posts
    const rg = new THREE.BoxGeometry(1, 0.025, 0.025), rm = new THREE.InstancedMesh(rg, M.fence, rails.length);
    let ri = 0;
    for (const [p, q] of rails) for (const h of [2.55]) {
      const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], l = Math.hypot(dx, dy, dz);
      o.position.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + h, (p[2] + q[2]) / 2);
      o.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, Math.hypot(dx, dz))); o.scale.set(l, 1, 1); o.updateMatrix();
      rm.setMatrixAt(ri++, o.matrix);
    }
    o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    rm.castShadow = true; root.add(rm);
    const tg = new THREE.CylinderGeometry(0.3, 0.3, 0.75, 8).translate(0, 0.375, 0), tm = new THREE.InstancedMesh(tg, M.tyre, tyres.length);
    tyres.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); tm.setMatrixAt(i, o.matrix); });
    tm.castShadow = true; tm.receiveShadow = true; root.add(tm);
  }

  // ---------- trees (drawn) ----------
  {
    // a crown of three overlapping lobes (the coast live oaks round the track are wide and lumpy, not balls)
    const crown = mergeGeos([new THREE.IcosahedronGeometry(0.78, 1).translate(0, 0.05, 0), new THREE.IcosahedronGeometry(0.58, 1).translate(0.5, -0.12, 0.18), new THREE.IcosahedronGeometry(0.55, 1).translate(-0.42, -0.08, -0.25)]);
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1, 5).translate(0, 0.5, 0);
    const n = D.trees.length;
    const cm = new THREE.InstancedMesh(crown, lambert('#ffffff', { flatShading: true }), n), tm = new THREE.InstancedMesh(trunk, lambert('#8A7B66', { flatShading: true }), n);
    const o = new THREE.Object3D(), c = new THREE.Color();
    D.trees.forEach(([x, y, z], i) => {
      const r = 3.2 + 2.2 * hash01(i, 3), h = 2.4 + 1.2 * hash01(i, 5);
      o.position.set(x, y - 0.2, z); o.rotation.set(0, hash01(i, 7) * 6.28, 0); o.scale.set(1, h + 0.4, 1); o.updateMatrix(); tm.setMatrixAt(i, o.matrix);
      o.position.set(x, y + h + r * 0.7, z); o.scale.set(r * (1 + 0.15 * hash01(i, 9)), r * 0.85, r); o.updateMatrix(); cm.setMatrixAt(i, o.matrix);
      c.copy(hex(KIT.tree)).lerp(hex(KIT.treeDark), hash01(i, 11)); cm.setColorAt(i, c);
    });
    cm.castShadow = true; cm.receiveShadow = true; tm.castShadow = true; root.add(cm); root.add(tm);
  }

  // ---------- helpers ----------
  function pointAt(frac, lateral = 0, lift = 0) {
    const s = sample(frac), k = sectionOf(frac);
    return [s.x + s.tz * lateral, s.y + 0.02 + pieces[k].raise + lift, s.z - s.tx * lateral];
  }
  const headingAt = (frac) => { const s = sample(frac); return Math.atan2(-s.tz, s.tx); };
  const pitchAt = (frac) => { const a = sample(frac - 2 / LAP), b = sample(frac + 2 / LAP); return Math.atan2(b.y - a.y, 4); };
  const lineAt = (frac) => sample(frac).line;
  function gridSlot(p) {
    const s = D.slots[p - 1], frac = s.d / LAP;
    return { frac, lateral: s.lat, pos: pointAt(frac, s.lat), yaw: headingAt(frac) };
  }

  // pose fitting: the view of points fills `fill` of the frame (the larger of width/height share), centred + offset px
  const scratch = new THREE.PerspectiveCamera(25, rig.width / rig.height, 0.1, 1e6);
  function applyPose(cam, { target, D: Dist, elev, azim = 0, fov }) {
    const el = (Math.min(elev, 89.99) * Math.PI) / 180, az = (azim * Math.PI) / 180;
    cam.position.set(target[0] + Math.sin(az) * Math.cos(el) * Dist, target[1] + Math.sin(el) * Dist, target[2] + Math.cos(az) * Math.cos(el) * Dist);
    cam.up.set(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));
    cam.lookAt(target[0], target[1], target[2]); if (fov) cam.fov = fov; cam.near = Dist * 0.01; cam.far = Dist * 100;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  const v3 = new THREE.Vector3();
  function bbox(pose, pts) {
    applyPose(scratch, pose); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { v3.set(p[0], p[1], p[2]).project(scratch); const x = (v3.x * 0.5 + 0.5) * rig.width, y = (-v3.y * 0.5 + 0.5) * rig.height; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  // clearRect(pose, {aspect, widths, footer, pad, margin}) -> [x0, y0, x1, y1]: the largest window picture (16:9, its
  // footer `footer` x its height below) in the frame's top right that covers no asphalt (track and pit lane, edge to
  // edge, `pad` px clear), keeping `margin` px from the frame's edges. The window hovers over the slab's far edge or
  // the paper beyond and hides none of the race.
  function clearRect(pose, { aspect = 16 / 9, widths = [0.42, 0.4, 0.38, 0.36, 0.34, 0.32, 0.3, 0.28], footer = 0.17, pad = 14, margin = 46 } = {}) {
    applyPose(scratch, pose);
    const pts = [];
    const add = (x, y, z) => { v3.set(x, y, z).project(scratch); pts.push([(v3.x * 0.5 + 0.5) * rig.width, (-v3.y * 0.5 + 0.5) * rig.height]); };
    for (let d = 0; d < LAP; d += 6) { const f = d / LAP; for (const l of [-W / 2, 0, W / 2]) { const q = pointAt(f, l); add(q[0], q[1], q[2]); } }
    const PT = D.pit; for (let k = 0; k < PT.x.length; k += 2) add(PT.x[k], gridY(PT.x[k], PT.z[k]), PT.z[k]);
    // top right first, then top left (over the paper above the slab's far end)
    for (const wf of widths) {
      const w = wf * rig.width, h = w / aspect, hh = h * (1 + footer);
      for (const right of [true, false]) for (let y0 = margin; y0 + hh <= rig.height * 0.62; y0 += 6) {
        const x0 = right ? rig.width - margin - w : margin, x1 = x0 + w;
        if (!pts.some(([x, y]) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y0 + hh + pad)) return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y0 + h)];
      }
    }
    return [rig.width - margin - 0.28 * rig.width, margin, rig.width - margin, margin + (0.28 * rig.width) / aspect];
  }
  // winRect(pose, {widths, maxHidden, margin, footer}) -> [x0, y0, x1, y1]: the window's picture at the frame's top
  // right, the largest of `widths` (share of the frame's width) that hides at most `maxHidden` asphalt samples (6 m
  // apart, three across): a short far stretch is allowed, bigger wins (lead, Nov 11)
  function winRect(pose, { aspect = 16 / 9, widths = [0.42, 0.4, 0.38, 0.36], maxHidden = 30, footer = 0.17, margin = 46 } = {}) {
    applyPose(scratch, pose);
    const pts = [];
    for (let d = 0; d < LAP; d += 6) { const f = d / LAP; for (const l of [-W / 2, 0, W / 2]) { const q = pointAt(f, l); v3.set(q[0], q[1], q[2]).project(scratch); pts.push([(v3.x * 0.5 + 0.5) * rig.width, (-v3.y * 0.5 + 0.5) * rig.height]); } }
    let pick = null;
    for (const wf of widths) {
      const w = wf * rig.width, h = w / aspect, x1 = rig.width - margin, x0 = x1 - w, y0 = margin, y1 = y0 + h * (1 + footer);
      const hid = pts.filter(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1).length;
      pick = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y0 + h)];
      if (hid <= maxHidden) break;
    }
    return pick;
  }
  function frame(pts, { elev = 30, azim = 0, fov = 25, fill = 0.8, offset = [0, 0], D0, fitW = false } = {}) {
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
    let pose = { target: c, D: D0 || 500, elev, azim, fov };
    for (let it = 0; it < 12; it++) {
      const [x0, y0, x1, y1] = bbox(pose, pts);
      const share = fitW ? (x1 - x0) / rig.width : Math.max((x1 - x0) / rig.width, (y1 - y0) / rig.height);
      pose = { ...pose, D: pose.D * share / fill };
      // move target so the bbox centre lands at the frame centre + offset
      const [a0, b0, a1, b1] = bbox(pose, pts), ex = (a0 + a1) / 2 - (rig.width / 2 + offset[0]), ey = (b0 + b1) / 2 - (rig.height / 2 + offset[1]);
      applyPose(scratch, pose);
      const mpp = (2 * pose.D * Math.tan((pose.fov * Math.PI) / 360)) / rig.height;
      const right = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 1);
      pose = { ...pose, target: [pose.target[0] + (right.x * ex - up.x * ey) * mpp, pose.target[1] + (right.y * ex - up.y * ey) * mpp, pose.target[2] + (right.z * ex - up.z * ey) * mpp] };
    }
    pose.target = pose.target.map((x) => +x.toFixed(3)); pose.D = +pose.D.toFixed(3);
    return pose;
  }
  function chase(pos, yaw, { back = 6, up = 2.5, fov = 50, lookAhead = 8 } = {}) {
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const tgt = [pos[0] + fx * lookAhead, pos[1] + 0.8, pos[2] + fz * lookAhead];
    const cam = [pos[0] - fx * back, pos[1] + up, pos[2] - fz * back];
    const dx = cam[0] - tgt[0], dy = cam[1] - tgt[1], dz = cam[2] - tgt[2], Dd = Math.hypot(dx, dy, dz);
    return { target: tgt, D: Dd, elev: (Math.asin(dy / Dd) * 180) / Math.PI, azim: (Math.atan2(dx, dz) * 180) / Math.PI, fov };
  }

  // ---------- labels in the world ----------
  // pieceText(k, text, labels, {size, color, at = 0.5, lateral = 0}) -> mesh: type printed on piece k's own asphalt
  // (moves and lifts with it), reading along the track, its top turned away from the home camera (+z)
  function pieceText(k, text, labels, { size = 9, color = KIT.line, at = 0.5, lateral = 0 } = {}) {
    const [d0, d1] = secD[k], d = d0 + (d1 - d0) * at, f = d / LAP, s = sample(f);
    const m = labels.groundText(text, { size, color, weight: 500 });
    m.position.set(s.x + s.tz * lateral, s.y + 0.25, s.z - s.tx * lateral);
    let yaw = Math.atan2(-s.tz, s.tx);
    // the text's top is local -z; keep it pointing away from the home camera (world -z), so it reads from +z
    const topZ = -Math.cos(yaw); if (topZ > 0) yaw += Math.PI;
    m.rotation.set(0, yaw, 0); pieces[k].group.add(m);
    return m;
  }
  // wireFlag(i, text, labels, {size, side}) -> group: a small flag on a thin pole at loop i's end, the text printed on
  // it, turned to face the camera about its pole each frame (flag.face(camera))
  function wireFlag(i, text, labels, { size = 1.2, side = 1, pole = 3.2 } = {}) {
    const d = wires[i].d, f = d / LAP, s = sample(f), lat = side * (W / 2 + 2.2);
    const g = new THREE.Group(); g.position.set(s.x + s.tz * lat, gridY(s.x + s.tz * lat, s.z - s.tx * lat), s.z - s.tx * lat); root.add(g);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, pole, 6).translate(0, pole / 2, 0), M.fence); p.castShadow = true; g.add(p);
    const t = labels.groundText(text, { size, color: KIT.ink, weight: 500 }); t.rotation.set(Math.PI / 2, 0, 0);
    const w = t.userData.width, h = size * 1.9;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h), lambert(KIT.building, { side: THREE.DoubleSide })); card.castShadow = true;
    const flag = new THREE.Group(); flag.position.y = pole - h / 2; g.add(flag);
    card.position.x = (w + 0.3) / 2; t.position.set((w + 0.3) / 2, 0, 0.01); t.rotation.set(0, 0, 0); t.geometry = t.geometry.clone().rotateX(Math.PI / 2);
    flag.add(card); flag.add(t);
    g.face = (cam) => { g.rotation.y = Math.atan2(cam.position.x - g.position.x, cam.position.z - g.position.z); };
    return g;
  }

  // pieceBoard(k, text, labels, {size, at, side, post}) -> group: a small board on a short post at piece k's edge
  // (rides with the piece as it lifts), the text on it, turned to face the camera about its post each frame
  // (board.face(camera)); the wire flag's family, so sections and loops are named the same way
  function pieceBoard(k, text, labels, { size = 4.8, at = 0.15, side = 1, post = 5 } = {}) {
    const [d0, d1] = secD[k], d = d0 + (d1 - d0) * at, s = sample(d / LAP), lat = side * (W / 2 + 1.8);
    const g = new THREE.Group(); g.position.set(s.x + s.tz * lat, s.y + 0.02, s.z - s.tx * lat); pieces[k].group.add(g);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, post, 6).translate(0, post / 2, 0), M.fence); p.castShadow = true; g.add(p);
    const t = labels.groundText(text, { size, color: KIT.ink, weight: 500 }), w = t.userData.width, h = size * 2.0;
    t.geometry = t.geometry.clone().rotateX(Math.PI / 2); t.position.set(0, post + h / 2, 0.012);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, h), lambert(KIT.building, { side: THREE.DoubleSide })); card.position.set(0, post + h / 2, 0); card.castShadow = true;
    g.add(card); g.add(t);
    // the board sits on the post's top, square to the camera about the post
    g.face = (cam) => { const wp = new THREE.Vector3(); g.getWorldPosition(wp); g.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z); };
    return g;
  }
  // pieceSideText(k, text, labels, {size}) -> mesh: the name on the piece's cut side (the alternate; reads only when
  // the piece is lifted high enough to show its side)
  function pieceSideText(k, text, labels, { size = 0.75, at = 0.5, side = 1 } = {}) {
    const [d0, d1] = secD[k], d = d0 + (d1 - d0) * at, s = sample(d / LAP), lat = side * (W / 2 + 0.03);
    const m = labels.groundText(text, { size, color: KIT.ink, weight: 500 }); m.geometry = m.geometry.clone().rotateX(Math.PI / 2);
    const yaw = Math.atan2(-s.tz, s.tx) + (side > 0 ? 0 : Math.PI);
    m.position.set(s.x + s.tz * lat, s.y + 0.02 - 0.8, s.z - s.tx * lat); m.rotation.set(0, yaw, 0);
    pieces[k].group.add(m); return m;
  }

  // lapRule(labels, {laps = 35, width = 0.6 x slab}) -> {set({lap, alpha}), group}: a fine rule on the desk along the
  // slab's front edge (+z), filling in ink to `lap` of `laps`, with "lap N" printed on the desk at the fill's end
  // paintGridNumbers(labels, {size, yawDeg}): each slot's starting position in white road paint ahead of its box (cap
  // height 1.1 m, as real grids paint them), reading from a camera at azimuth yawDeg (default: the grid pose's).
  // The composer and dev/world.html call it once.
  let gridNums = null;
  function paintGridNumbers(labels, { size = 1.1, yawDeg = null } = {}) {
    if (gridNums) return gridNums;
    const az = ((yawDeg ?? api.poses.grid.azim) * Math.PI) / 180;
    gridNums = new THREE.Group(); root.add(gridNums);
    for (const s of D.slots) {
      const m = labels.groundText(String(s.pos), { size, color: KIT.building, weight: 600 });
      const p = pointAt((s.d + 3.2 + 0.4 + size * 0.75) / LAP, s.lat, 0.05); m.position.set(p[0], p[1], p[2]); m.rotation.set(0, az, 0);
      pieces[sectionOf(s.d / LAP)].group.add(m);
    }
    return gridNums;
  }
  function lapRule(labels, { laps = 35, share = 0.6, gap = 30, size = 11 } = {}) {
    const ol = D.slab.outline; let zMax = -1e9; for (const [, z] of ol) zMax = Math.max(zMax, z);
    const xs = ol.map(([x]) => x), xMid = (Math.min(...xs) + Math.max(...xs)) / 2, len = (Math.max(...xs) - Math.min(...xs)) * share;
    const z = zMax + gap, x0 = xMid - len / 2, g = new THREE.Group(); root.add(g);
    const lineM = new THREE.MeshBasicMaterial({ color: hex('#BDB7AE'), transparent: true }), fillM = new THREE.MeshBasicMaterial({ color: hex(KIT.ink), transparent: true });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9).rotateX(-Math.PI / 2), lineM); line.position.set(xMid, 0.06, z); g.add(line);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8).translate(0.5, 0, 0).rotateX(-Math.PI / 2), fillM); fill.position.set(x0, 0.07, z); g.add(fill);
    let txt = null, last = null;
    const api = {
      group: g,
      set({ lap = 0, alpha = 1 } = {}) {
        g.visible = alpha > 0.01; lineM.opacity = fillM.opacity = alpha;
        const u = clamp01(lap / laps); fill.scale.x = Math.max(1e-3, len * u);
        const key = Math.round(lap);
        if (key !== last) { if (txt) { g.remove(txt); txt.geometry.dispose(); txt.material.map.dispose(); } txt = labels.groundText(`lap ${key}`, { size, color: KIT.ink, weight: 500 }); g.add(txt); last = key; }
        txt.material.opacity = alpha; txt.position.set(x0 + len * u, 0.08, z + size * 1.6);
        return api;
      },
    };
    return api;
  }

  // ---------- state ----------
  const defaults = () => { pieces.forEach((p) => { p.tint = null; p.tintAmt = 0; p.strength = 1; p.rank = 0; p.set({ heat: 0, lift: 0, proud: 0, visible: true }); }); wires.forEach((w) => w.set({ show: 0, wide: false })); if (pitAlpha !== 1) setPit({ alpha: 1 }); };
  function set({ strength } = {}) { if (strength !== undefined) pieces.forEach((p) => p.set({ strength })); return api; }

  const xs = outline.map((p) => p[0]), zs = outline.map((p) => p[1]);
  const size = [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)];
  const turnY = D.turnY;
  const api = {
    data: D, root, lap: LAP, ds, width: W, size, slot: +(1.25 * Math.max(...size)).toFixed(1), turnY,
    north: [-Math.sin(turnY), Math.round(-Math.cos(turnY) * 1e6) / 1e6],   // map north (0, -1) turned by rotation.y
    paintGridNumbers, winRect, pieces, wires, pieceText, pieceBoard, pieceSideText, wireFlag, lapRule, clearRect, pitGroup, pointAt, headingAt, pitchAt, lineAt, sectionOf, loopFrac, sample, gridY, gridSlot, frame, chase, bbox,
    applyPose, reset: defaults, set, setPit,
  };
  api.north = [-Math.sin(turnY), -Math.cos(turnY)];
  defaults();
  api.poses = makePoses(api);
  return api;
}

// ---------- poses ----------
// Named poses, all plain {target, D, elev, azim, fov}. Car-following poses are taken at a fixed race second noted
// beside them (the composer can call laguna.chase or laguna.frame for moving versions).
function makePoses(L) {
  const P = {};
  const fov = 25;
  // grid: Bryce's slot (he starts 7th, the left column, pit side). A front three-quarter of his car about 10° down,
  // from the pit-wall side (the grandstands and the slab's edge beyond the far side, paper above them): car and figure
  // about 60% of the frame's width; the figure stands on the camera's side (figSide -1 = the car's left).
  const g7 = L.gridSlot(7), f = g7.frac, yaw = L.headingAt(f);
  const fx = Math.cos(yaw), fz = -Math.sin(yaw), lx = fz, lz = -fx;                // forward, left (pit side)
  const hfov = (fv) => 2 * Math.atan(Math.tan((fv * Math.PI) / 360) * (16 / 9));
  const gridPose = ({ a = 50, side = 1, elev = 10, fov = 18, width = 7 / 0.6, dx = 0.6, up = 0 } = {}) => {
    // a: degrees round from the nose toward `side` (+1 left/pit side, -1 right/grandstand side)
    const fig = [g7.pos[0] + fx * 3.3 + lx * 2.2 * side, g7.pos[2] + fz * 3.3 + lz * 2.2 * side];   // where the figure stands (figure.js)
    const tgt = [(g7.pos[0] + fig[0]) / 2 + fx * dx, g7.pos[1] + 0.75 + up, (g7.pos[2] + fig[1]) / 2 + fz * dx];   // up: aim above him so he sits in the lower half and the pit wall, paddock and hills fill the top
    const r = (a * Math.PI) / 180, cx = fx * Math.cos(r) + lx * side * Math.sin(r), cz = fz * Math.cos(r) + lz * side * Math.sin(r);
    const D = width / 2 / Math.tan(hfov(fov) / 2);
    return { target: tgt.map((x) => +x.toFixed(3)), D: +D.toFixed(3), elev, azim: +((Math.atan2(cx, cz) * 180) / Math.PI).toFixed(2), fov, figSide: side > 0 ? -1 : 1 };
  };
  // the pit wall's catch fence stands between a pit-side camera and his car, so both kept views are from the
  // grandstand side: front three-quarter (grid) and rear three-quarter with the gantry ahead (gridRear)
  // Nov 11, gate round 1: every close shot is a tabletop model seen from above three-quarter (30-35° down).
  // grid: Bryce and his car large (about 55% of the width), the camera round toward the nose on the grandstand side and
  // turned along the track, so the cars behind him recede in their slots into the frame
  // Nov 11, gate round 3: pushed in (his car about 40% of the width, the figure standing clear of it off its right
  // front, on the camera's side), a front three-quarter from the grandstand side 30° down, turned so the track's far
  // edge, its white line, the pit wall and the pit lane run across the top third; aimed ahead toward slot 6
  P.grid = gridPose({ a: 72, side: -1, elev: 30, fov: 20, width: 12.5, up: 0.85, dx: 1.0 });
  P.gridB = gridPose({ a: 76, side: -1, elev: 31, fov: 20, width: 12.5, up: 1.3, dx: -2.0 });
  P.gridC = gridPose({ a: 64, side: -1, elev: 30, fov: 20, width: 12, up: 0.9, dx: -1.6 });
  P.gridRear = gridPose({ a: 128, side: -1, elev: 30, fov: 22, width: 9.6, up: 0, dx: 0.2 });
  L.gridPose = gridPose;
  // gridWide: from behind the last row, along the straight (8° off its axis toward the pit side), 30° down, a long lens:
  // the two columns recede toward the gantry
  const slots = []; for (let p = 1; p <= 24; p++) { const s = L.gridSlot(p); slots.push(s.pos, [s.pos[0] + fx * 2.5, s.pos[1] + 1, s.pos[2] + fz * 2.5], [s.pos[0] - fx * 2.5, s.pos[1], s.pos[2] - fz * 2.5]); }
  const gan = L.pointAt(0, 0, 7.3);
  const t8 = Math.tan((8 * Math.PI) / 180), azB = (Math.atan2(-fx + lx * t8, -fz + lz * t8) * 180) / Math.PI;
  P.gridWideFrame = { ...L.frame(slots.concat([gan]), { elev: 30, azim: +azB.toFixed(2), fov: 11, fill: 0.9 }), figSide: P.grid.figSide };
  // (B, C: by hand, a shorter lens close behind the last row: the near rows large, receding to the gantry)
  { const s10 = L.gridSlot(10).pos, azb = (Math.atan2(-fx + lx * t8, -fz + lz * t8) * 180) / Math.PI, hf = (fv) => 2 * Math.atan(Math.tan((fv * Math.PI) / 360) * (16 / 9));
    const s4 = L.gridSlot(4).pos, s6 = L.gridSlot(6).pos;
    P.gridWideB = { target: [s4[0], s4[1] + 1, s4[2]], D: +(26 / Math.tan(hf(26) / 2)).toFixed(2), elev: 30, azim: +azb.toFixed(2), fov: 26, figSide: P.grid.figSide };
    P.gridWideC = { target: [s6[0], s6[1] + 1, s6[2]], D: +(30 / Math.tan(hf(18) / 2)).toFixed(2), elev: 30, azim: +azb.toFixed(2), fov: 18, figSide: P.grid.figSide };
    // the kept view: behind the last row, along the straight, 30° down, an 18° lens: the two columns recede, his car
    // in the middle of the frame (gate round 1)
    P.gridWide = P.gridWideC; }
  P.gridWideFront = { ...L.frame(slots.concat([gan]), { elev: 30, azim: +((Math.atan2(fx + lx * t8, fz + lz * t8) * 180) / Math.PI).toFixed(2), fov: 11, fill: 0.9 }), figSide: P.grid.figSide };
  // home: the whole model about 80% of the frame's width, sitting low with a small margin under it; the window at the
  // top right (screens.js places it with laguna.winRect)
  const ol = L.data.slab.outline.map(([x, z]) => [x, L.gridY(x, z), z]).concat(L.data.slab.outline.map(([x, z]) => [x, 0, z]));
  const lowFrame = (o) => { const f0 = L.frame(ol, { ...o, fitW: true }); const [, y0, , y1] = L.bbox(f0, ol); return L.frame(ol, { ...o, fitW: true, offset: [0, 1080 - 44 - (y1 - y0) / 2 - 540] }); };
  P.home = lowFrame({ elev: 24, azim: -10, fov, fill: 0.8 });
  P.homeB = lowFrame({ elev: 24, azim: 10, fov, fill: 0.8 });
  P.homeC = lowFrame({ elev: 26, azim: 0, fov, fill: 0.8 });
  // heatHome: the whole model, large, margins even (no window)
  P.heatHome = L.frame(ol, { elev: 32, azim: 0, fov, fill: 0.9, offset: [0, 25] });
  // tv: replaced from the window's own place (screens.js poseFor)
  P.tv = { target: [P.home.target[0] + 60, P.home.target[1] + 330, P.home.target[2] - 520], D: P.home.D * 0.62, elev: 12, azim: 0, fov };
  // hairpin: about 120 m wide, 30° down, on the hairpin's tightest point (data checks: 440 m from S/F)
  // (gate, Nov 11: pushed in to 120 m across, aimed on the hairpin's asphalt 405-485 m so it runs edge to edge)
  const hpPts = []; for (let d = 405; d <= 485; d += 5) for (const o of [-1, 1]) hpPts.push(L.pointAt(d / L.lap, o * (L.width / 2 + 1)));
  const hpF = L.frame(hpPts, { elev: 30, azim: -20, fov, fill: 0.9, offset: [0, 160] });
  { const az = (hpF.azim * Math.PI) / 180; P.hairpin = { ...hpF, target: [hpF.target[0] - Math.sin(az) * 14, hpF.target[1], hpF.target[2] - Math.cos(az) * 14], D: +(60 / Math.tan(hfov(fov) / 2)).toFixed(2) }; }
  // corkscrew: from below and to the side so the drop reads (the drop's steepest point: 2496 m)
  // corkscrew: the drop (2,420 to 2,560 m) seen across from its low side, 24° down (lower, the hillside hides it)
  const cks = []; for (let d = 2400; d <= 2580; d += 6) cks.push(L.pointAt(d / L.lap));
  const ckm = L.pointAt(2495 / L.lap), cky = L.headingAt(2495 / L.lap), ckl = [-Math.sin(cky), -Math.cos(cky)];   // left of driving
  const lowSide = L.gridY(ckm[0] + ckl[0] * 80, ckm[2] + ckl[1] * 80) < L.gridY(ckm[0] - ckl[0] * 80, ckm[2] - ckl[1] * 80) ? 1 : -1;
  const ckAz = (Math.atan2(ckl[0] * lowSide, ckl[1] * lowSide) * 180) / Math.PI;
  P.corkscrew = L.frame(cks, { elev: 36, azim: +ckAz.toFixed(2), fov, fill: 0.95, offset: [0, -60] });
  // finish: from the infield (pit) side, 30° down, ahead of the line and turned back toward the cars arriving: the
  // gantry over the line, the three cars large as they cross, the grandstand's stepped rows behind them (46 m across)
  const sf = L.pointAt(0), sy = L.headingAt(0), sfx = Math.cos(sy), sfz = -Math.sin(sy), slx = -Math.sin(sy), slz = -Math.cos(sy);
  const finAt = (a, w, el) => { const fdx = slx * Math.cos(a) + sfx * Math.sin(a), fdz = slz * Math.cos(a) + sfz * Math.sin(a);
    return { target: [sf[0] - sfx * 8, sf[1] + 1.5, sf[2] - sfz * 8], D: +(w / 2 / Math.tan(hfov(fov) / 2)).toFixed(2), elev: el, azim: +((Math.atan2(fdx, fdz) * 180) / Math.PI).toFixed(2), fov }; };
  P.finish = finAt(0.75, 30, 30); P.finishB = finAt(1.3, 32, 30); P.finishC = finAt(1.4, 40, 28);
  // piece: the hairpin's piece (Turn 2, I2 -> I3) lifted 6 m with its two wires; the frame round it
  const pp = []; for (let d = L.data.sections[2].d0 - 20; d <= L.data.sections[2].d1 + 20; d += 8) pp.push(L.pointAt(d / L.lap, 0, 12));
  P.piece = L.frame(pp, { elev: 34, azim: -20, fov, fill: 0.7, offset: [0, 30] });
  return P;
}

function mergeGeos(geos) {
  // merge non-indexed or indexed BufferGeometries with position (+ normal) into one indexed geometry
  let n = 0, m = 0; for (const g of geos) { n += g.attributes.position.count; m += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), idx = new Uint32Array(m); let po = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position.array; pos.set(p, po * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + po; }
    else for (let i = 0; i < g.attributes.position.count; i++) idx[io++] = i + po;
    po += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}
