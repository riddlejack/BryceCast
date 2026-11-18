// trackScene.js: the Tracks page's interactive 3D track model (site refresh round 5, Nov 16 2026).
//
// One venue's model drawn by the film rig's own world modules (read-only copies under ./rig/, from
// Portfolio/builds/film-rig: lib/rig.js, vendor/three r186, shots/brycecast-film/kit.js and world/{laguna,venues,city,
// cars}.js), in the rig's kit: the paper desk, its sun and soft shadows, colours written straight through as sRGB values.
// The section heat is laid on the track as the stills lay it (Portfolio/.../site-refresh/stills-tools/page.js
// makeBand): one ribbon per span, its ends carried from the site outline's arc parameter onto the model's centreline
// through the table scripts/build-track-models.mjs baked (data.map.u). Unlike the stills, the band covers the whole
// width of the track and sits inside a thin ink edge, so every step of the ramp, the pale greys included, reads as a
// colour laid on the track rather than as bare asphalt (the coordinator's review of round 5). The pit lane is redrawn
// as a quiet, light, thin road, so it never reads as a stretch of the heat.
//
// The camera is the visitor's: it opens on the stills' framing (whole model, 25 degree lens, 90% fill, the venue's
// azimuth and elevation) and moves only when dragged, zoomed or reset. Frames are drawn on demand, never in a loop.
//
//   const scene = await createTrackScene({ canvas, data, coarse, onHover, onView })
//   scene.setSections([{ key, spans: [[startT, endT], ...], color: '#rrggbb' | null, dashed }])   null colour = pale
//   scene.setActive(key | null)      highlight one section (cross-highlight from the bars)
//   scene.resetView(), scene.zoomBy(factor), scene.resize(), scene.dispose(), scene.stats()
//   onHover({ key, x, y, pinned } | null)   key null: a stretch no section covers; x, y CSS px inside the canvas
//   onView({ home: boolean })               after every camera change
//   scene.setWeather(weather | null, { take, reduced })   the race hour's weather on the model (weather/weatherScene.js)
//   scene.windScreen()                      the downwind direction on screen now, [dx, dy] unit, or null
import { THREE, hex } from './rig/lib/rig.js';
import { KIT, createStage } from './rig/shots/brycecast-film/kit.js';
import { createLaguna } from './rig/shots/brycecast-film/world/laguna.js';
import { createVenue } from './rig/shots/brycecast-film/world/venues.js';
import { createCity, trackRibbon } from './rig/shots/brycecast-film/world/city.js';
import { createWeather } from './weather/weatherScene.js';

const FOV = 25;
const PALE = '#F1EDE6';          // a section with no comparison in this scope, and stretches no section covers
const DIM_TO = '#EFEBE4';        // the other sections while one is pointed at
const INK = KIT.ink;
const PIT_ROAD = '#DCD6CC';      // the pit lane: a quiet road, a little darker than the land, never the heat's ink
const PIT_WIDTH = 3.5;           // metres: thinner than the track, so it reads as a side road
const ELEV_MIN = 12, ELEV_MAX = 88;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Round 9 (Jack on the iPhone simulator: "the whole track is grayed out"): three's PCF shadows read the shadow map
// through a depth-compare sampler (sampler2DShadow). Where the GPU has none (the iOS Simulator's Metal is an Apple
// family 2 device, and compare samplers start at family 3), every lookup comes back occluded: the model, the land and
// the paper all drawn in full shadow, about #C0 for #FD. One pixel tells: a depth of 1 compared against 0.5 must
// read lit. Where it does not, the scene takes the basic shadow map, which reads the same depths without the sampler.
let depthCompareWorks = null;
function shadowCompareWorks(renderer) {
  if (depthCompareWorks !== null) return depthCompareWorks;
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.compareFunction = THREE.LessEqualCompare;
  const probe = new THREE.WebGLRenderTarget(1, 1, { depthTexture: depth }), out = new THREE.WebGLRenderTarget(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: depth } }, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform highp sampler2DShadow tDepth; void main() { gl_FragColor = vec4(texture(tDepth, vec3(0.5, 0.5, 0.5))); }',
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), probeScene = new THREE.Scene(), px = new Uint8Array(4);
  quad.frustumCulled = false; probeScene.add(quad);
  const before = renderer.getRenderTarget();
  renderer.setRenderTarget(probe); renderer.clear();   // depth 1: nothing in the way
  renderer.setRenderTarget(out); renderer.render(probeScene, new THREE.OrthographicCamera());
  renderer.readRenderTargetPixels(out, 0, 0, 1, 1, px);
  renderer.setRenderTarget(before);
  quad.geometry.dispose(); mat.dispose(); depth.dispose(); probe.dispose(); out.dispose();
  depthCompareWorks = px[0] > 127;
  return depthCompareWorks;
}

export async function createTrackScene({ canvas, data, coarse = false, onHover = () => {}, onView = () => {} }) {
  const cssW = () => Math.max(1, canvas.clientWidth), cssH = () => Math.max(1, canvas.clientHeight);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(cssW(), cssH(), false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // as the rig: shaders write sRGB values directly
  const scene = new THREE.Scene();
  scene.background = hex(KIT.bg);
  const camera = new THREE.PerspectiveCamera(FOV, cssW() / cssH(), 0.1, 1000);
  // the world modules read rig.scene / rig.camera / rig.width / rig.height (cars' dash rule, laguna's pose helpers)
  const rig = { THREE, renderer, scene, camera, get width() { return cssW(); }, get height() { return cssH(); } };
  const stage = createStage(rig);
  if (coarse) stage.sun.shadow.mapSize.set(2048, 2048);
  if (!shadowCompareWorks(renderer)) renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.shadowMap.autoUpdate = false;   // nothing that casts ever moves: one shadow pass, redone only on resize

  // The rig draws a pit lane as a 7 m (6 m in the city) open ribbon of the track's dark asphalt; from far off it reads
  // as a stretch of the heat's ink. Hide it (it is the only open, line-less track ribbon in the group: same vertex
  // count as the pit polyline) and draw the same line as a thin road in the land's own, slightly darker, paper.
  function replacePit(group, pitPts, heightAt, lift) {
    for (const o of group.children) {
      if (o.isMesh && o.geometry?.attributes?.aTrack && o.geometry.attributes.position.count === pitPts.length * 2) o.visible = false;
    }
    const road = trackRibbon(pitPts, { width: PIT_WIDTH, closed: false, heightAt, lift, lines: false, sf: false, color: PIT_ROAD });
    road.material.polygonOffset = true; road.material.polygonOffsetFactor = -2; road.material.polygonOffsetUnits = -2;
    group.add(road);
  }

  // ---------- the model behind one face: centreline at(u, lateral, lift), band width, slab points for framing ----------
  const M = data.model;
  let model;
  if (data.kind === 'laguna') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(M)], { type: 'application/json' }));
    let L;
    try { L = await createLaguna(rig, stage, { url }); } finally { URL.revokeObjectURL(url); }
    const Wd = L.data.width;
    // the pit lane, its wall, fence and box lines: light and quiet (its lane material is the rig's '#5A5652')
    L.root.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === '5a5652') o.material.color.copy(hex(PIT_ROAD)); });
    model = { north: L.north, at: (u, lat = 0, dy = 0) => L.pointAt(u, lat, dy), half: Wd / 2, bandHalf: Wd / 2 + 0.05, bandDy: 0.012, length: L.lap,
      slab: L.data.slab.outline.map(([x, z]) => [x, L.gridY(x, z), z]).concat(L.data.slab.outline.map(([x, z]) => [x, 0, z])) };
  } else if (data.kind === 'venue') {
    const V = createVenue(rig, M);
    V.field.mesh.visible = false;
    const arc = V.circuit, hw = M.circuit.widthM / 2;
    if (M.pit) replacePit(V.group, M.pit, V.heightAt, 0.5);
    const at = (u, lat = 0, dy = 0) => { const s = u * arc.length, [x, z] = arc.at(s), a = arc.at(s - 1), b = arc.at(s + 1), tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      const px = x + nx * lat, pz = z + nz * lat; return [px, V.heightAt(px, pz) + 0.6 + dy, pz]; };
    model = { at, half: hw, bandHalf: hw + 0.05, bandDy: 0.05, length: arc.length,
      slab: V.outline.map(([x, z]) => [x, V.heightAt(x, z), z]).concat(V.outline.map(([x, z]) => [x, 0, z])) };
  } else if (data.kind === 'city') {
    const C = createCity(rig, M);
    const arc = C.circuit, hw = M.circuit.widthM / 2;
    if (M.pit) replacePit(C.group, M.pit, () => C.top, 0.22);
    const at = (u, lat = 0, dy = 0) => { const s = u * arc.length, [x, z] = arc.at(s), a = arc.at(s - 1), b = arc.at(s + 1), tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      return [x + nx * lat, C.top + 0.3 + dy, z + nz * lat]; };
    const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    model = { at, half: hw, bandHalf: hw + 0.05, bandDy: 0.05, length: arc.length,
      slab: C.outline.map(([x, z]) => [x, C.top, z]).concat(C.outline.map(([x, z]) => [x, 0, z])),
      // the towers count in the framing (their tops), so none is cut by the frame's edge (page.js)
      tops: M.buildings.filter((b) => b.p.every(([x, z]) => inPoly(x, z, C.outline))).flatMap((b) => b.p.map(([x, z]) => [x, C.top + b.h, z])) };
    model.city = C;
  } else {
    throw new Error('unknown model kind ' + data.kind);
  }
  const framePts = model.slab.concat(model.tops || []);
  const centre = model.slab.reduce((s, p) => [s[0] + p[0] / model.slab.length, 0, s[2] + p[2] / model.slab.length], [0, 0, 0]);
  stage.fitShadow(centre, 2600);
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const [x, , z] of model.slab) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }

  // ---------- site t -> model u (baked), and a span's [u0, u1] as page.js makeBand reads it ----------
  const U = data.map.u, NS = data.map.ns, DIR = data.map.dir;
  const uOf = (t) => U[Math.round((((t % 1) + 1) % 1) * NS) % NS];
  const spanU = (t0, t1) => { const a = uOf(t0), b = uOf(t1); const u0 = DIR > 0 ? a : b; let u1 = DIR > 0 ? b : a; if (u1 <= u0) u1 += 1; return [u0, u1]; };

  // ---------- ribbons along the centreline ----------
  // A ribbon from latA to latB metres across the centreline (positive to the left), sampled every metre along and
  // at most ACROSS_M across, so on a venue's terrain it follows the ground across its width as well as along it. With
  // only its two edges sampled, a wide ribbon over a cutting, a crest or a camber is a straight chord: it sinks into
  // the ground on one and floats over a narrower one on the other, which is how the hover's ink rim came up through
  // its fill at Barber (Jack, Nov 16: "highlighted completely black in some sections").
  // The terrain is a bilinear grid of ten metres or more, so a sample every 2 m (at most 8 across) follows it to within
  // millimetres; the city's ground is flat, so its ribbons keep their two edges.
  const ACROSS_M = 2, ACROSS_MAX = data.kind === 'city' ? 1 : 8;
  function stripGeometry(u0, u1, latA, latB, dy, { dashM = 0 } = {}) {
    const lenM = (u1 - u0) * model.length, n = Math.max(2, Math.ceil(lenM / 1.0) + 1), P = [], I = [];
    const m = Math.max(1, Math.min(ACROSS_MAX, Math.ceil(Math.abs(latA - latB) / ACROSS_M))), row = m + 1;
    for (let i = 0; i < n; i++) {
      const u = u0 + ((u1 - u0) * i) / (n - 1);
      for (let j = 0; j <= m; j++) P.push(...model.at(u, latA + ((latB - latA) * j) / m, dy));
      const on = !dashM || Math.floor((u * model.length) / dashM) % 2 === 0;
      if (i && on) for (let j = 0; j < m; j++) { const a = (i - 1) * row + j, b = i * row + j; I.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    // face up whatever the winding (page.js)
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P[b] - P[a], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vz = P[c + 2] - P[a + 2]; if (uz * vx - ux * vz < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const nm = g.attributes.normal.array; for (let i = 0; i < nm.length; i += 3) if (nm[i + 1] < 0) { nm[i] *= -1; nm[i + 1] *= -1; nm[i + 2] *= -1; }
    return g;
  }
  const ribbonGeometry = (u0, u1, halfL, halfR, dy, opts) => stripGeometry(u0, u1, halfL, -halfR, dy, opts);
  const bandMat = (color, offset = -5) => new THREE.MeshLambertMaterial({ color: hex(color), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });

  // Under every section: a thin ink edge the whole lap round, and inside it the pale lane, which is what shows where
  // no section is compared or none is anchored (the key's pale swatch: paper inside an ink edge). The band covers the
  // track's full width; far off (a phone, or zoomed out) it is drawn wider than the track, never under MIN_PX CSS
  // pixels across, and the edge never under EDGE_PX, so the colours still read.
  const MIN_PX = 5, EDGE_PX = 1.1;
  const mppAt = (D) => (2 * D * Math.tan((FOV * Math.PI) / 360)) / cssH();
  let bandHalfNow = model.bandHalf, edgeNow = 0.6;
  const bandHalfFor = (D) => Math.max(model.bandHalf, (MIN_PX / 2) * mppAt(D));
  const edgeFor = (D) => Math.max(0.6, EDGE_PX * mppAt(D));
  const bandRoot = new THREE.Group(); scene.add(bandRoot);
  const edgeMat = new THREE.MeshBasicMaterial({ color: hex(INK), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false });
  const edge = new THREE.Mesh(ribbonGeometry(0, 1, model.bandHalf + edgeNow, model.bandHalf + edgeNow, model.bandDy * 0.4), edgeMat);
  edge.renderOrder = 1; edge.visible = false; bandRoot.add(edge);
  const base = new THREE.Mesh(ribbonGeometry(0, 1, model.bandHalf, model.bandHalf, model.bandDy * 0.5), bandMat(PALE, -4));
  base.receiveShadow = true; base.renderOrder = 2; base.visible = false; bandRoot.add(base);

  // ---------- markers on the track (round 2): a box laid on the asphalt at a site t, e.g. a driver's grid box on the
  // start straight. setMarkers([{ id, t, color, lengthM, widthM, lat, lineM, fill, minPx }]):
  //   t        the site outline's arc parameter (as projectT and the section spans read it)
  //   color    any CSS colour the caller resolves (series colours come from chapterTint / --chapter-*)
  //   lengthM  along the track (default 7), widthM across it (default 3), lat its centre's offset across the track in
  //            metres (positive to the left of the driving direction; a grid's two files sit at about +-2.5)
  //   lineM    the outline's width in metres (default 0.5); fill 0..1 a tint inside it (default 0)
  //   minPx    the box is never drawn smaller than this many CSS px along the track (default 10), so it reads far off
  // Drawn over the heat bands, under the hover; rebuilt when the camera's distance changes the minimum.
  const markerRoot = new THREE.Group(); markerRoot.renderOrder = 6; scene.add(markerRoot);
  let markers = [], markerScale = 1;
  const markerMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color: hex(color), side: THREE.DoubleSide, transparent: opacity < 1, opacity,
    depthWrite: opacity >= 1, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7, toneMapped: false });
  const markerScaleFor = (D) => Math.max(1, ...markers.map((m) => ((m.minPx ?? 10) * mppAt(D)) / (m.lengthM ?? 7)));
  function buildMarkers() {
    for (const o of [...markerRoot.children]) { o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); markerRoot.remove(o); }
    markerScale = markerScaleFor(pose.D);
    for (const mk of markers) {
      if (typeof mk.t !== 'number' || !Number.isFinite(mk.t)) continue;
      const k = markerScale, len = (mk.lengthM ?? 7) * k, wid = (mk.widthM ?? 3) * k, line = Math.max(mk.lineM ?? 0.5, 1.2 * mppAt(pose.D)), lat = mk.lat ?? 0;
      let uc = uOf(mk.t); const du = len / model.length / 2, dl = line / model.length;
      if (uc - du < 0) uc += 1;
      const u0 = uc - du, u1 = uc + du, dy = model.bandDy * 1.6, left = lat + wid / 2, right = lat - wid / 2;
      const g = new THREE.Group(); g.userData.id = mk.id;
      const mat = markerMat(mk.color ?? INK);
      for (const geo of [stripGeometry(u0, u1, left, left - line, dy), stripGeometry(u0, u1, right + line, right, dy),
        stripGeometry(u0, u0 + dl, left, right, dy), stripGeometry(u1 - dl, u1, left, right, dy)]) {
        const m = new THREE.Mesh(geo, mat); m.renderOrder = 6; g.add(m);
      }
      if (mk.fill) { const f = new THREE.Mesh(stripGeometry(u0, u1, left, right, dy * 0.9), markerMat(mk.color ?? INK, Math.min(1, mk.fill))); f.renderOrder = 5; g.add(f); }
      markerRoot.add(g);
    }
    invalidate();
  }
  function setMarkers(list) {
    const next = Array.isArray(list) ? list : [];
    if (JSON.stringify(next) === JSON.stringify(markers)) return;
    markers = next; buildMarkers();
  }

  let sections = [], sectionMeshes = new Map(), spanSig = '', active = null, hoverKey, wx = null;
  const ranges = [];   // [u0, u1, key] for picking
  function setSections(list, force = false) {
    const sig = JSON.stringify(list.map((s) => [s.key, s.spans, Boolean(s.dashed)]));
    sections = list;
    if (sig !== spanSig || force) {
      spanSig = sig;
      for (const g of sectionMeshes.values()) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); g.userData.mat.dispose(); bandRoot.remove(g); }
      sectionMeshes = new Map(); ranges.length = 0;
      for (const s of list) {
        const grp = new THREE.Group(), mat = bandMat(PALE);
        grp.userData.mat = mat;
        for (const [t0, t1] of s.spans) {
          const [u0, u1] = spanU(t0, t1);
          ranges.push([u0, u1, s.key]);
          const m = new THREE.Mesh(ribbonGeometry(u0, u1, bandHalfNow, bandHalfNow, model.bandDy, { dashM: s.dashed ? 7 : 0 }), mat);
          m.receiveShadow = true; m.renderOrder = 3; grp.add(m);
        }
        sectionMeshes.set(s.key, grp); bandRoot.add(grp);
      }
    }
    base.visible = list.length > 0; edge.visible = list.length > 0;
    recolour();
    buildHighlight();
    invalidate();
  }
  function recolour() {
    const focus = hoverKey !== undefined && hoverKey !== null ? hoverKey : active;
    base.material.color.copy(hex(PALE)); if (wx) base.material.color.multiply(wx.bandComp);
    for (const s of sections) {
      const g = sectionMeshes.get(s.key); if (!g) continue;
      const c = hex(s.color || PALE);
      if (focus && focus !== s.key) c.lerp(hex(DIM_TO), 0.62);
      if (wx) c.multiply(wx.bandComp);   // the weather's light lands on the model, never on the heat's colours
      g.userData.mat.color.copy(c);
      // a pale (not compared) section draws no band of its own: the pale lane under it shows
      g.visible = Boolean(s.color) || (focus === s.key);
    }
  }

  // the pointed-at section: drawn wider than the asphalt, in its colour, with an ink rim, so it reads at any distance
  let hiGroup = null;
  function buildHighlight() {
    if (hiGroup) { hiGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); scene.remove(hiGroup); hiGroup = null; }
    const focus = hoverKey !== undefined && hoverKey !== null ? hoverKey : active;
    const s = focus ? sections.find((x) => x.key === focus) : null;
    if (!s) return;
    hiGroup = new THREE.Group();
    const wide = Math.max(model.half + 5, bandHalfNow * 1.8), rim = wide + Math.max(2.5, bandHalfNow * 0.5);
    const fill = new THREE.MeshBasicMaterial({ color: hex(s.color || PALE), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10, toneMapped: false });
    const ink = new THREE.MeshBasicMaterial({ color: hex(INK), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10, toneMapped: false });
    // the rim is two strips beside the fill, sharing its edge vertices, never a wider ribbon under it: the two never
    // overlap, so no slope or depth precision can bring the ink up through the colour. Both follow the ground across
    // (stripGeometry) at the same lift over the section bands.
    const dy = model.bandDy + 0.1;
    for (const [t0, t1] of s.spans) {
      const [u0, u1] = spanU(t0, t1);
      const f = new THREE.Mesh(stripGeometry(u0, u1, wide, -wide, dy), fill); f.renderOrder = 7; hiGroup.add(f);
      for (const [a, b] of [[rim, wide], [-wide, -rim]]) { const r = new THREE.Mesh(stripGeometry(u0, u1, a, b, dy), ink); r.renderOrder = 7; hiGroup.add(r); }
    }
    scene.add(hiGroup);
  }
  function setActive(key) {
    if (key === active) return;
    active = key ?? null; recolour(); buildHighlight(); invalidate();
  }

  // ---------- camera: the stills' framing (page.js frame()), then an orbit the visitor drives ----------
  const scratch = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1e6), v3 = new THREE.Vector3();
  function applyPose(cam, { target, D, elev, azim }) {
    const el = (Math.min(elev, 89.99) * Math.PI) / 180, az = (azim * Math.PI) / 180;
    cam.position.set(target[0] + Math.sin(az) * Math.cos(el) * D, target[1] + Math.sin(el) * D, target[2] + Math.cos(az) * Math.cos(el) * D);
    cam.up.set(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)); cam.lookAt(...target);
    cam.fov = FOV; cam.near = D * 0.02; cam.far = D * 60; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  function bbox(pose, pts, W, H) { scratch.aspect = W / H; applyPose(scratch, pose); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { v3.set(p[0], p[1], p[2]).project(scratch); const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
  function frame(pts, { elev, azim, fill }) {
    const W = cssW(), H = cssH(), offset = [0, 0];   // centred: the page sizes the stage to the model
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
    let pose = { target: c, D: 3000, elev, azim };
    for (let it = 0; it < 14; it++) {
      const [x0, y0, x1, y1] = bbox(pose, pts, W, H), share = Math.max((x1 - x0) / W, (y1 - y0) / H);
      pose = { ...pose, D: (pose.D * share) / fill };
      const [a0, b0, a1, b1] = bbox(pose, pts, W, H), ex = (a0 + a1) / 2 - (W / 2 + offset[0]), ey = (b0 + b1) / 2 - (H / 2 + offset[1]);
      applyPose(scratch, pose);
      const mpp = (2 * pose.D * Math.tan((FOV * Math.PI) / 360)) / H, right = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 1);
      pose = { ...pose, target: [pose.target[0] + (right.x * ex - up.x * ey) * mpp, pose.target[1] + (right.y * ex - up.y * ey) * mpp, pose.target[2] + (right.z * ex - up.z * ey) * mpp] };
    }
    return pose;
  }
  const cam0 = data.camera;
  let home = frame(framePts, { elev: cam0.elev, azim: cam0.azim, fill: cam0.fill ?? 0.9 });
  // the shape the opening view wants (its framed points' box, with the 90% fill's margin), so the page can size the
  // stage to the model rather than leave bands of empty paper above and below a long, low venue
  const naturalAspect = (() => { const [x0, y0, x1, y1] = bbox(home, framePts, 1600, 900); return (x1 - x0) / Math.max(1, (y1 - y0)); })();
  let pose = { ...home, target: [...home.target] };
  let atHome = true;
  const clampPose = () => {
    pose.elev = Math.max(ELEV_MIN, Math.min(ELEV_MAX, pose.elev));
    pose.D = Math.max(home.D * 0.16, Math.min(home.D * 1.45, pose.D));
    pose.target[0] = Math.max(bx0, Math.min(bx1, pose.target[0]));
    pose.target[2] = Math.max(bz0, Math.min(bz1, pose.target[2]));
    pose.azim = ((pose.azim % 360) + 360) % 360;
  };
  function placeCamera() {
    camera.aspect = cssW() / cssH(); applyPose(camera, pose);
    if (model.city) model.city.set(0.5, { t: 0, carAlpha: 0 });   // after the camera, as the film does
  }
  let widthTimer = 0;
  function checkBandWidth() {
    const want = bandHalfFor(pose.D), wantEdge = edgeFor(pose.D);
    const bandMoved = Math.abs(want - bandHalfNow) / bandHalfNow >= 0.15, edgeMoved = Math.abs(wantEdge - edgeNow) / edgeNow >= 0.2;
    if (markers.length && Math.abs(markerScaleFor(pose.D) - markerScale) / markerScale >= 0.15) buildMarkers();
    if (!bandMoved && !edgeMoved) return;
    bandHalfNow = want; edgeNow = wantEdge;
    edge.geometry.dispose(); edge.geometry = ribbonGeometry(0, 1, want + wantEdge, want + wantEdge, model.bandDy * 0.4);
    base.geometry.dispose(); base.geometry = ribbonGeometry(0, 1, want, want, model.bandDy * 0.5);
    if (bandMoved && sections.length) setSections(sections, true); else invalidate();
  }
  let settleTimer = 0;
  function changed() {
    atHome = false; clampPose(); placeCamera(); refreshPick(); invalidate(); onView({ home: false });
    clearTimeout(widthTimer); widthTimer = setTimeout(checkBandWidth, 140);
    clearTimeout(settleTimer); settleTimer = setTimeout(() => { if (!disposed) { wx?.settled({ ...pose, target: [...pose.target] }, atHome); invalidate(); } }, 450);
  }
  function resetView() {
    pose = { ...home, target: [...home.target] }; atHome = true; placeCamera(); invalidate(); onView({ home: true });
    checkBandWidth(); clearTimeout(settleTimer); wx?.relayout();
  }
  function zoomBy(f, at = null) {
    const before = pose.D;
    pose.D = Math.max(home.D * 0.16, Math.min(home.D * 1.45, pose.D * f));
    const k = 1 - pose.D / before;
    if (at && k !== 0) {   // toward the ground point under the pointer
      const g = groundAt(at[0], at[1]);
      if (g) { pose.target[0] += (g.x - pose.target[0]) * k; pose.target[2] += (g.z - pose.target[2]) * k; }
    } else if (!at && f > 1) {   // zooming out by the buttons drifts back toward the middle
      const back = Math.min(1, (pose.D - before) / Math.max(1e-6, home.D - before));
      if (back > 0) for (const i of [0, 2]) pose.target[i] += (home.target[i] - pose.target[i]) * back;
    }
    changed();
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hitV = new THREE.Vector3();
  function groundAt(x, y) {
    ndc.set((x / cssW()) * 2 - 1, -(y / cssH()) * 2 + 1); ray.setFromCamera(ndc, camera);
    plane.set(new THREE.Vector3(0, 1, 0), -pose.target[1]);
    return ray.ray.intersectPlane(plane, hitV) ? hitV.clone() : null;
  }

  // ---------- picking: the nearest centreline sample on screen, then the section whose span holds it ----------
  const PICK_STEP = 3, nPick = Math.ceil(model.length / PICK_STEP), pickU = new Float32Array(nPick), pickW = new Float32Array(nPick * 3), pickS = new Float32Array(nPick * 2);
  for (let i = 0; i < nPick; i++) { const u = i / nPick, p = model.at(u, 0, model.bandDy); pickU[i] = u; pickW.set(p, i * 3); }
  let pickDirty = true;
  function refreshPick() { pickDirty = true; }
  function projectPick() {
    const W = cssW(), H = cssH();
    for (let i = 0; i < nPick; i++) { v3.set(pickW[i * 3], pickW[i * 3 + 1], pickW[i * 3 + 2]).project(camera); pickS[i * 2] = v3.z < 1 ? (v3.x * 0.5 + 0.5) * W : -1e6; pickS[i * 2 + 1] = (-v3.y * 0.5 + 0.5) * H; }
    pickDirty = false;
  }
  function keyAtU(u) {
    for (const [u0, u1, key] of ranges) { if ((u >= u0 && u < u1) || (u + 1 >= u0 && u + 1 < u1)) return key; }
    return null;
  }
  function pick(x, y) {
    if (!sections.length) return undefined;
    if (pickDirty) projectPick();
    const R = coarse ? 26 : 16; let best = -1, bd = R * R;
    for (let i = 0; i < nPick; i++) { const dx = pickS[i * 2] - x, dy = pickS[i * 2 + 1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    if (best < 0) return undefined;
    return keyAtU(pickU[best]);
  }
  let pinned = false;
  function setHover(key, x, y, pin = false) {
    const k = key === undefined ? undefined : key;
    const changedKey = k !== hoverKey;
    hoverKey = k; pinned = pin && k !== undefined;
    if (changedKey) { recolour(); buildHighlight(); invalidate(); }
    onHover(k === undefined ? null : { key: k, x, y, pinned });
  }

  // ---------- input: drag to turn (mouse: both axes; touch: one finger sideways, the page keeps vertical scroll),
  // wheel / pinch to zoom (the wheel only with Ctrl/Cmd held or once the model has been grabbed), keys ----------
  const pointers = new Map();
  let drag = null, engaged = false, pinch = null, hoverQueued = null;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function onDown(e) {
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y });
    engaged = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), D: pose.D }; drag = null; return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x, y, x0: x, y0: y, t0: performance.now(), mode: e.pointerType === 'mouse' ? 'orbit' : 'undecided', id: e.pointerId, type: e.pointerType };
    if (e.pointerType === 'mouse') { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
  }
  function onMove(e) {
    const [x, y] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 10 && d > 10) { const f = pinch.d / d, before = pose.D; pose.D = pinch.D * f; const r = pose.D; pose.D = before; zoomBy(r / before, [(a.x + b.x) / 2, (a.y + b.y) / 2]); }
      return;
    }
    if (drag && drag.id === e.pointerId) {
      const dx = x - drag.x, dy = y - drag.y;
      if (drag.mode === 'undecided') {
        const tx = x - drag.x0, ty = y - drag.y0;
        if (Math.hypot(tx, ty) < 7) return;
        drag.mode = Math.abs(tx) > Math.abs(ty) ? 'spin' : 'none';   // vertical: the page scrolls (touch-action: pan-y)
        if (drag.mode === 'spin') { try { canvas.setPointerCapture(e.pointerId); } catch { /* released */ } }
      }
      if (drag.mode === 'orbit' || drag.mode === 'spin') {
        pose.azim -= dx * (180 / Math.max(480, cssW()));
        if (drag.mode === 'orbit') pose.elev += dy * 0.22;
        drag.x = x; drag.y = y;
        if (hoverKey !== undefined && !pinned) setHover(undefined);
        changed();
      }
      return;
    }
    if (e.pointerType === 'mouse') {   // hover, once per frame
      if (!hoverQueued) requestAnimationFrame(() => { const q = hoverQueued; hoverQueued = null; if (q) setHover(pick(q[0], q[1]), q[0], q[1]); });
      hoverQueued = [x, y];
    }
  }
  function onUp(e) {
    const [x, y] = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && drag.id === e.pointerId) {
      const moved = Math.hypot(x - drag.x0, y - drag.y0), quick = performance.now() - drag.t0 < 450;
      if (moved < 7 && quick) {   // a tap or a click: read the section there (touch keeps it until the next tap)
        const k = pick(x, y);
        setHover(k, x, y, drag.type !== 'mouse');
      }
      drag = null; canvas.style.cursor = '';
    }
  }
  function onCancel(e) { pointers.delete(e.pointerId); if (drag && drag.id === e.pointerId) drag = null; if (pointers.size < 2) pinch = null; canvas.style.cursor = ''; }
  function onLeave(e) { if (e.pointerType === 'mouse') { engaged = false; if (!drag) setHover(undefined); } }
  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey || engaged)) return;   // the page scrolls past the model
    e.preventDefault();
    const [x, y] = local(e);
    const dyPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomBy(Math.exp(dyPx * (e.ctrlKey ? 0.01 : 0.0015)), [x, y]);
  }
  function onTouchMove(e) { if (e.touches.length >= 2) e.preventDefault(); }   // two fingers: the pinch is the model's
  function onKey(e) {
    const k = e.key;
    if (k === 'ArrowLeft') pose.azim += 6; else if (k === 'ArrowRight') pose.azim -= 6;
    else if (k === 'ArrowUp') pose.elev += 4; else if (k === 'ArrowDown') pose.elev -= 4;
    else if (k === '+' || k === '=') return void (zoomBy(0.8), e.preventDefault());
    else if (k === '-' || k === '_') return void (zoomBy(1.25), e.preventDefault());
    else if (k === '0' || k === 'Home') return void (resetView(), e.preventDefault());
    else return;
    e.preventDefault(); changed();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('keydown', onKey);

  // ---------- frames on demand ----------
  let queued = false, disposed = false, frames = 0, lastMs = 0;
  const times = [];
  // the weather's motion (the trees swaying, the arrow's pulse, the sock): frames at most 30 a second, only while the
  // model is on screen and the page is shown; otherwise frames stay on demand
  let onScreen = true, loopId = 0, lastLoop = 0;
  const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); kick(); }) : null;
  seen?.observe(canvas);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  function loop(now) {
    loopId = 0;
    if (disposed || !wx?.animating || !onScreen || document.hidden) return;
    if (now - lastLoop >= 31) { lastLoop = now; wx.tick(now / 1000); invalidate(); }
    loopId = requestAnimationFrame(loop);
  }
  function kick() { if (!loopId && wx?.animating && onScreen && !document.hidden && !disposed) loopId = requestAnimationFrame(loop); }
  function render() {
    queued = false; if (disposed) return;
    const t0 = performance.now();
    renderer.render(scene, camera);
    lastMs = performance.now() - t0; frames++;
    times.push(lastMs); if (times.length > 240) times.shift();
  }
  function invalidate() { if (!queued && !disposed) { queued = true; requestAnimationFrame(render); } }
  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(cssW(), cssH(), false);
    home = frame(framePts, { elev: cam0.elev, azim: cam0.azim, fill: cam0.fill ?? 0.9 });
    if (atHome) pose = { ...home, target: [...home.target] }; else clampPose();
    placeCamera(); refreshPick(); renderer.shadowMap.needsUpdate = true; wx?.relayout(); invalidate(); checkBandWidth();
  }
  placeCamera();
  checkBandWidth();
  wx = createWeather({
    scene, camera, stage, model, invalidate, cssW, cssH, applyPose, centre,
    latLon: data.kind === 'laguna' ? M.originLatLon ?? null : M.meta?.centre ?? null,   // [lat, lon] of the venue, for the race hour's sun
    ribbon: (u0, u1, hl, hr, dy) => ribbonGeometry(u0, u1, hl, hr, dy),
    northWorld: model.north ?? [0, -1],   // venue and city models: x east, north toward -z
    getHome: () => home,
    frameBox: () => ({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 }),
    silhouettes: () => {
      const n = model.slab.length / 2, top = model.slab.slice(0, n), bottom = model.slab.slice(n);
      return [top, bottom];
    },
    shadowsDirty: () => { renderer.shadowMap.needsUpdate = true; },
  });
  renderer.shadowMap.needsUpdate = true;
  renderer.compile(scene, camera);
  render();

  function dispose() {
    disposed = true; clearTimeout(widthTimer); clearTimeout(settleTimer); if (loopId) cancelAnimationFrame(loopId); seen?.disconnect();
    document.removeEventListener('visibilitychange', onVis); wx?.dispose();
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('touchmove', onTouchMove); canvas.removeEventListener('keydown', onKey);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); }
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }
  // ---------- the live page (round 6): screen points along the track, for the overlay that draws the timing loops and
  // the car dots in the page's own SVG (so a dot moving costs no WebGL frame). t is the site outline's arc parameter,
  // lat metres across the track (positive to the left of the driving direction, as model.at reads it).
  function projectT(t, lat = 0) {
    const p = model.at(uOf(t), lat, model.bandDy);
    v3.set(p[0], p[1], p[2]).project(camera);
    if (v3.z >= 1 || v3.z <= -1) return null;
    return [(v3.x * 0.5 + 0.5) * cssW(), (-v3.y * 0.5 + 0.5) * cssH()];
  }

  return {
    setSections, setActive, resetView, zoomBy, resize, dispose, naturalAspect, projectT, trackHalfWidth: model.half, setMarkers,
    setWeather(w, opts) { wx.set(w, opts); recolour(); invalidate(); kick(); },
    windScreen: () => wx.windScreen(),
    weatherInfo: () => wx.info(),
    stats: () => ({ frames, lastMs, times: times.slice(), pose: { ...pose }, home: { ...home }, atHome }),
    // for headless checks: where on screen a section's middle is drawn, and a hover at that point
    screenPointOf(key) {
      const r = ranges.find((x) => x[2] === key); if (!r) return null;
      const p = model.at((r[0] + r[1]) / 2, 0, model.bandDy); v3.set(p[0], p[1], p[2]).project(camera);
      return [(v3.x * 0.5 + 0.5) * cssW(), (-v3.y * 0.5 + 0.5) * cssH()];
    },
    orbitBy(dAzim, dElev) { pose.azim += dAzim; pose.elev += dElev; changed(); },
  };
}
