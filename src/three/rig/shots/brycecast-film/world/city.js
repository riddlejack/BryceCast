// world/city.js — the street circuit's city (builder B): a slab of downtown Detroit cut to a 1.6 x 1.2 km box, its
// OSM buildings as plain extruded blocks, the Grand Prix circuit in its streets, cars on it. One parameter u (0..1)
// assembles the city, holds it, flies the buildings off and leaves the circuit drawn in the bare streets.
// Data: data/city-detroit.json (V8/tools/osm_city.py; OpenStreetMap, ODbL, "© OpenStreetMap contributors").
//
// Frame: metres, true scale; the model is centred on its own origin, the desk at y = 0, north toward -z, east +x.
//
// API
//   loadCity(url) -> Promise<data>
//   createCity(rig, data, opts?) -> city            opts: { thickness = 36, cars = 24 (field: career.json, Detroit 2026),
//                                                    parent = rig.scene,
//                                                    lapTime = 66 (s, drawn: no lap times in the film's data), bryce = 7
//                                                    (index of the gold car, or -1 for none), trees = true, shadow = true,
//                                                    organic = true (the slab's edge an organic cut `margin` = 60 m
//                                                    outside the circuit and the buildings lining it, as the neighbour
//                                                    slabs'; false: the 1.6 x 1.2 km box), margin = 60 }
//     city.group                                   THREE.Group to add to the scene (createCity adds it to rig.scene);
//                                                  move/turn it to place the model in a slot (it is self-contained)
//     city.footprint {w, d, x0, x1, z0, z1}        the slab's extent in metres (the box, 1600 x 1200, when organic is off)
//     city.outline [[x, z], ...]                   the slab's edge (720 points when organic; the box's corners when off)
//     city.top                                     y of the slab's top (= thickness)
//     city.focus {centre, circuitBox, towers, tile}  points for cameras (tile: {centre, azim, length, width}, the overhead
//                                                  pose that lays the circuit's long axis across the frame); centre of the circuit [x, y, z], the circuit's
//                                                  [x0, z0, x1, z1], the Renaissance Center's top [x, y, z]
//     city.set(u, { t, streetsBack, carAlpha })    everything from u alone (pure: any frame in any order):
//        u 0.00-0.45 assemble: buildings rise out of their footprints in a wave outward from the start/finish line,
//                    each dim (cut-face grey) as it rises, then paper-white
//        u 0.45-0.60 built, holding (cars run; the caller drifts the camera)
//        u 0.60-0.85 fly off: buildings lift away one after another (farthest from the circuit first, the
//                    Renaissance Center last), accelerating upward with a small turn, until far above the slab
//        u 0.85-1.00 bare streets: the other streets step back to half strength; the circuit stays at full
//        t: seconds for the cars (default u x 16); streetsBack: override the step-back 0..1; carAlpha 0..1
//     city.phase                                   the u boundaries above {built: 0.45, flyStart: 0.6, flyEnd: 0.85}
//     city.circuit {at(s) -> [x, z, heading], length}   the centreline by arc length from the start/finish line
//   Light: the film's stage (kit.js createStage: the desk, the sun and its soft shadows); fit its shadow box round the
//   slab (stage.fitShadow(city centre in world, ~2000)). A building's shadow fades out as it lifts (its depth pass is
//   dithered by a per-building shadow strength), so nothing in the shadows pops.
//   Shared pieces venues.js uses: KITB, arcSampler(), trackRibbon(), carField(), deskShadow(), slabWalls(), treeField()
//
// Drawn, not data: the cars' spacing, side-to-side placement and lap time (66 s) are drawn; the field size (24) is
// career.json's Detroit 2026 race. Building heights: OSM height or building:levels x 3.4 m + 1 m where tagged
// (57% of buildings), else three storeys (11.2 m).
import { THREE, hex, clamp01, seg, smooth, lerp, hash01 } from '../../../lib/rig.js';
import { KIT } from '../kit.js';
import { carGeometry, wheelGeometry } from './cars.js';

// the kit (builder A's kit.js), plus the two tints only the city uses
export const KITB = {
  paper: KIT.bg, ink: KIT.ink, muted: KIT.muted, gold: KIT.bryce, car: KIT.car, clay: KIT.clay, asphalt: KIT.asphalt,
  land: KIT.land, cut: KIT.cut, park: KIT.landTint, tree: KIT.tree, water: KIT.water, building: KIT.building, line: KIT.line,
  street: '#E1DCD3',       // streets: a slightly darker paper than the land
};

export async function loadCity(url) { return (await fetch(url)).json(); }

const ease3 = (u) => 1 - Math.pow(1 - clamp01(u), 3);

// ---------- shared pieces ----------
/** Mesh helper that keeps the vertex winding consistent with the given normal. */
function pushTri(P, N, a, b, c, n) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = c; c = t; }
  P.push(...a, ...b, ...c); N.push(...n, ...n, ...n);
}

/** A closed centreline (array of [x, z]) -> cumulative arc length and a sampler. */
export function arcSampler(pts) {
  const n = pts.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const L = cum[n];
  function at(s) {
    s = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[(lo + 1) % n], f = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  return { at, length: L, cum };
}

/** Asphalt ribbon along a closed (or open) centreline at its real width, fine white edge lines drawn in the shader
 *  (never thinner than ~0.7 px: a far line fades instead of breaking up), and a start/finish line across at s = 0.
 *  heightAt(x, z) -> y of the ground under the ribbon. Returns the mesh; its material has uniforms uLine (0..1). */
export function trackRibbon(pts, { width = 12, closed = true, heightAt = () => 0, lift = 0.25, edge = 0.35, inset = 0.45,
  sf = true, color = KITB.asphalt, lines = true } = {}) {
  const n = pts.length, m = closed ? n + 1 : n, hw = width / 2;
  const P = new Float32Array(m * 2 * 3), A = new Float32Array(m * 2 * 2), I = [];
  let s = 0;
  for (let k = 0; k < m; k++) {
    const i = k % n;
    const p = pts[i], a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    if (k > 0) s += Math.hypot(p[0] - pts[(k - 1) % n][0], p[1] - pts[(k - 1) % n][1]);
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1, x = p[0] + nx * hw * sg, z = p[1] + nz * hw * sg;
      P.set([x, heightAt(x, z) + lift, z], (k * 2 + side) * 3);
      A.set([sg, s], (k * 2 + side) * 2);
    }
    if (k < m - 1) { const q = k * 2; I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aTrack', new THREE.BufferAttribute(A, 2));
  g.setIndex(I);
  // wind every triangle to face up (a DoubleSide material flips a back face's normal, which left the asphalt lit by
  // the ambient alone: 57% of its colour), then normals from that winding
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vz = P[c + 2] - P[a + 2];
    if (uz * vx - ux * vz < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }   // y of (u x v) < 0: flip
  }
  g.setIndex(I);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array; for (let i = 0; i < nrm.length; i += 3) { if (nrm[i + 1] < 0) { nrm[i] *= -1; nrm[i + 1] *= -1; nrm[i + 2] *= -1; } }
  const mat = new THREE.MeshLambertMaterial({ color: hex(color), side: THREE.DoubleSide });
  const uni = { uLine: { value: lines ? 1 : 0 }, uHW: { value: hw }, uEdge: { value: edge }, uInset: { value: inset }, uSF: { value: sf ? 1 : 0 },
    uLen: { value: s }, uLineCol: { value: hex(KITB.line) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aTrack; varying vec2 vTrack;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrack = aTrack;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vTrack; uniform float uLine, uHW, uEdge, uInset, uSF, uLen; uniform vec3 uLineCol;
      float fineLine(float d, float hw, float fw){ float he = max(hw, 0.7 * fw); return clamp((he - d) / fw + 0.5, 0.0, 1.0) * (hw / he); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float a = abs(vTrack.x) * uHW;                       // metres from the centreline
        float fw = max(fwidth(a), 1e-4);
        float c = fineLine(abs(a - (uHW - uInset)), uEdge * 0.5, fw) * uLine;
        float sd = min(vTrack.y, uLen - vTrack.y);           // metres from the start/finish line
        float fs = max(fwidth(vTrack.y), 1e-4);
        c = max(c, fineLine(sd, 0.6, fs) * uSF * step(a, uHW - uInset));
        diffuseColor.rgb = mix(diffuseColor.rgb, uLineCol, c);
      }`);
  };
  mat.customProgramCacheKey = () => 'trackRibbon';
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uni;
  return mesh;
}

/** An instanced field of cars (builder A's car model from cars.js: body + wheels, true size, nose +x).
 *  place(i, x, z, heading) puts car i there; style({ghost, alpha}) steps them to faint see-through cars;
 *  update(camera, heightPx) after the camera is placed: a car under `dashPx` (13) long on screen is drawn instead as a
 *  light dash along the track (builder A's rule in cars.js), never shorter than `minPx` (5) nor thinner than 2 px, his
 *  gold for Bryce, so the field reads as moving specks at city and venue scale (the lead's gate, Nov 11). */
export function carField(n, { bryce = -1, heightAt = () => 0, lift = 0.02, dashPx = 13, minPx = 5, maxW = 7, dashCol = '#F2EFEA', bodyCol = KITB.car } = {}) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: false, opacity: 1 });
  const wmat = new THREE.MeshLambertMaterial({ color: hex(KITB.ink), transparent: false, opacity: 1 });
  const body = new THREE.InstancedMesh(carGeometry(), mat, n), wheels = new THREE.InstancedMesh(wheelGeometry(), wmat, n);
  // polygon offset: a far dash sits within the depth buffer's step of the asphalt under it and would sink into it
  const dmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, opacity: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1).translate(0, 0.2, 0), dmat, n);
  const mesh = new THREE.Group(); mesh.add(body, wheels, dash);
  for (const m of [body, wheels]) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; }
  dash.frustumCulled = false;
  const solid = [], ghostCol = hex(bodyCol).lerp(hex(KITB.land), 0.72), goldGhost = hex(KITB.gold).lerp(hex(KITB.land), 0.6);
  const wheelGhost = hex(KITB.ink).lerp(hex(KITB.land), 0.75);
  const dSolid = [], dGhost = hex(dashCol).lerp(hex(KITB.asphalt), 0.55), dGold = hex(KITB.gold).lerp(hex(KITB.asphalt), 0.45);
  for (let i = 0; i < n; i++) {
    const c = hex(i === bryce ? KITB.gold : bodyCol); solid.push(c); body.setColorAt(i, c);
    const d = hex(i === bryce ? KITB.gold : dashCol); dSolid.push(d); dash.setColorAt(i, d);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const P = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, h: 0, s: 1, v: true }));
  const Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  let lastGhost = 0;
  const api = {
    mesh, body, wheels, dash, positions: P,
    place(i, x, z, heading, { scale = 1, visible = true } = {}) {
      const p = P[i]; p.x = x; p.y = heightAt(x, z) + lift; p.z = z; p.h = heading; p.s = scale; p.v = visible;
      q.setFromAxisAngle(up, -heading); pos.set(x, p.y, z); sc.setScalar(visible ? scale : 1e-6);
      m4.compose(pos, q, sc); body.setMatrixAt(i, m4); wheels.setMatrixAt(i, m4); dash.setMatrixAt(i, Z0);
    },
    /** ghost 0..1: solid cars -> faint (pale, see-through) cars; alpha: the field's strength */
    style({ ghost = 0, alpha = 1 } = {}) {
      lastGhost = ghost;
      for (let i = 0; i < n; i++) {
        col.copy(solid[i]).lerp(i === bryce ? goldGhost : ghostCol, ghost); body.setColorAt(i, col);
        col.copy(dSolid[i]).lerp(i === bryce ? dGold : dGhost, ghost); dash.setColorAt(i, col);
      }
      body.instanceColor.needsUpdate = true; dash.instanceColor.needsUpdate = true;
      wmat.color.copy(hex(KITB.ink)).lerp(wheelGhost, ghost);
      for (const m of [mat, wmat, dmat]) {
        m.opacity = alpha * (1 - (m === dmat ? 0.45 : 0.55) * ghost);
        m.transparent = m.opacity < 0.999; m.depthWrite = !m.transparent;
      }
      body.castShadow = wheels.castShadow = ghost < 0.5 && alpha > 0.5;
    },
    /** after the camera is placed: far cars become dashes (see above); without a camera, every car is drawn whole */
    update(camera = null, heightPx = 1080) {
      if (camera) {
        camera.updateMatrixWorld();
        const cp = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), wp = new THREE.Vector3();
        const ppm1 = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));   // px per metre at 1 m
        for (let i = 0; i < n; i++) {
          const p = P[i]; if (!p.v) continue;
          wp.set(p.x, p.y, p.z); if (mesh.parent) mesh.parent.localToWorld(wp);
          const ppm = ppm1 / Math.max(1, cp.distanceTo(wp)), lenPx = 4.9 * p.s * ppm;
          if (lenPx >= dashPx) continue;
          const L = Math.max(6, minPx / ppm), W = Math.min(maxW, Math.max(2, 2 / ppm));
          q.setFromAxisAngle(up, -p.h); pos.set(p.x, p.y, p.z); sc.set(L, Math.min(4, Math.max(1, 0.6 / ppm)), W);
          m4.compose(pos, q, sc); dash.setMatrixAt(i, m4);
          sc.setScalar(1e-6); m4.compose(pos, q, sc); body.setMatrixAt(i, m4); wheels.setMatrixAt(i, m4);
        }
      }
      body.instanceMatrix.needsUpdate = true; wheels.instanceMatrix.needsUpdate = true; dash.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}

/** Soft contact shadow on the desk under a slab of w x d metres (a blurred rectangle). */
export function deskShadow(w, d, { spread = 0.06, opacity = 0.16, shape = null } = {}) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), pad = S * 0.16;
  g.filter = `blur(${Math.round(S * 0.05)}px)`; g.fillStyle = '#000';
  if (shape) { g.beginPath(); shape.forEach(([x, z], i) => { const px = pad + (x / w + 0.5) * (S - 2 * pad), pz = pad + (z / d + 0.5) * (S - 2 * pad); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.fill(); }
  else g.fillRect(pad, pad, S - 2 * pad, S - 2 * pad);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace;
  const k = S / (S - 2 * pad);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * k, d * k).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: hex(KITB.ink), alphaMap: tex, transparent: true, opacity, depthWrite: false }));
  mesh.position.y = 0.05; mesh.renderOrder = -1;
  return mesh;
}

/** The slab's four cut faces from the desk to topAt(x, z) (sampled every `step` m: the face follows the top). */
export function slabWalls(w, d, topAt, { step = 2, color = KITB.cut } = {}) {
  const P = [], N = [];
  const edges = [[[-w / 2, d / 2], [w / 2, d / 2], [0, 0, 1]], [[w / 2, d / 2], [w / 2, -d / 2], [1, 0, 0]],
    [[w / 2, -d / 2], [-w / 2, -d / 2], [0, 0, -1]], [[-w / 2, -d / 2], [-w / 2, d / 2], [-1, 0, 0]]];
  for (const [a, b, n] of edges) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.ceil(L / step);
    for (let i = 0; i < k; i++) {
      const f0 = i / k, f1 = (i + 1) / k;
      const x0 = lerp(a[0], b[0], f0), z0 = lerp(a[1], b[1], f0), x1 = lerp(a[0], b[0], f1), z1 = lerp(a[1], b[1], f1);
      const y0 = topAt(x0, z0), y1 = topAt(x1, z1);
      pushTri(P, N, [x0, 0, z0], [x1, 0, z1], [x1, y1, z1], n); pushTri(P, N, [x0, 0, z0], [x1, y1, z1], [x0, y0, z0], n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: hex(color) }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

/** Cut faces down a closed outline [[x, z], ...] from the desk to topAt(x, z) (each edge split every `step` m). */
export function outlineWalls(O, topAt, { step = 4, color = KITB.cut } = {}) {
  const P = [], N = [], n = O.length;
  let ar = 0; for (let i = 0; i < n; i++) { const a = O[i], b = O[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
  const sg = ar > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = O[i], b = O[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.01) continue;
    const nn = [-sg * dz / l, 0, sg * dx / l], k = Math.max(1, Math.ceil(l / step));
    for (let q = 0; q < k; q++) {
      const x0 = lerp(a[0], b[0], q / k), z0 = lerp(a[1], b[1], q / k), x1 = lerp(a[0], b[0], (q + 1) / k), z1 = lerp(a[1], b[1], (q + 1) / k);
      const y0 = topAt(x0, z0), y1 = topAt(x1, z1);
      pushTri(P, N, [x0, 0, z0], [x1, 0, z1], [x1, y1, z1], nn); pushTri(P, N, [x0, 0, z0], [x1, y1, z1], [x0, y0, z0], nn);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: hex(color), side: THREE.DoubleSide }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

/** Low-poly trees (an icosahedron crown on a short trunk), instanced. */
export function treeField(points, { heightAt = () => 0, size = 1, seed = 3 } = {}) {
  const crown = new THREE.IcosahedronGeometry(1, 0); crown.translate(0, 1.6, 0);
  const geo = crown.toNonIndexed(); geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: hex(KITB.tree), flatShading: true }), points.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  points.forEach(([x, z], i) => {
    const r = (3.2 + 2.2 * hash01(i, seed)) * size;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(i, seed + 1) * 6.28);
    p.set(x, heightAt(x, z), z); s.set(r, r * (1.0 + 0.5 * hash01(i, seed + 2)), r);
    m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** Depth material for shadows whose casters fade: a per-vertex aShade (0..1) dithers the depth pass (4x4 Bayer); the
 *  shadow map's soft filter turns the dither into a partial shadow. */
export function ditheredDepth() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aShade; varying float vShade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = aShade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vShade;
      float bayer4(vec2 p){ ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4;
        int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[i]) + 0.5) / 16.0; }`)
      .replace('void main() {', 'void main() {\n  if (vShade < bayer4(gl_FragCoord.xy)) discard;');
  };
  m.customProgramCacheKey = () => 'ditheredDepth';
  return m;
}

// ---------- the city ----------
export function createCity(rig, data, opts = {}) {
  const { thickness = 36, cars: nCars = 24, lapTime = 66, bryce = 7, trees: withTrees = true, shadow = true, organic = true, margin = 60 } = opts;
  const [W, D] = data.meta.box, TOP = thickness, WD = 3.5;    // WD: the river's surface below the land
  const group = new THREE.Group(); group.name = 'city'; (opts.parent || rig.scene).add(group);
  const inPoly = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

  // ----- the organic cut (opts.organic, default on): the slab's edge runs `margin` m outside the circuit and the
  // buildings that line it (those within 120 m of the centreline), rounded (a 30 m blur of that mask, cut at half), as the
  // neighbour slabs' edges are; clipped to the 1.6 x 1.2 km box. Drawn: the margin and the rounding. Off: the box. -----
  const O = organic ? organicOutline() : [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  const inO = (x, z) => !organic || inPoly(x, z, O);
  const BLD = organic ? data.buildings.filter((b) => b.p.every(([x, z]) => inPoly(x, z, O))) : data.buildings;
  function organicOutline() {
    const K = 0.5, cw = Math.round(W * K), ch = Math.round(D * K), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d'), T = (x, z) => [(x + W / 2) * K, (z + D / 2) * K];
    const path = (r, close = true) => { g.beginPath(); r.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); if (close) g.closePath(); };
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    g.filter = `blur(${Math.round(30 * K)}px)`; g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineCap = 'round';
    path(data.circuit.pts); g.fill(); g.lineWidth = 2 * (margin + 20) * K; g.stroke();
    g.lineWidth = 2 * margin * K;
    for (const b of data.buildings) if (b.dc <= 120) { path(b.p); g.fill(); g.stroke(); }
    const img = g.getImageData(0, 0, cw, ch).data, on = (i, j) => i >= 0 && j >= 0 && i < cw && j < ch && img[(j * cw + i) * 4] > 127;
    // the outer boundary by rays from the circuit's centre (the mask is filled inside the circuit, so it is star-shaped
    // enough): the last cell on each ray that is in, 720 rays, then a light circular smoothing
    let cx = 0, cz = 0; for (const [x, z] of data.circuit.pts) { cx += x; cz += z; } cx /= data.circuit.pts.length; cz /= data.circuit.pts.length;
    const N = 720, R = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * 2 * Math.PI, dx = Math.cos(a), dz = Math.sin(a); let r = 0;
      for (let q = 0; q < 2400; q += 2) { const x = cx + dx * q, z = cz + dz * q; if (Math.abs(x) > W / 2 || Math.abs(z) > D / 2) break; const [i, j] = T(x, z); if (on(Math.floor(i), Math.floor(j))) r = q; }
      R.push(r);
    }
    const Rs = R.map((_, k) => { let s = 0; for (let q = -3; q <= 3; q++) s += R[(k + q + N) % N]; return s / 7; });
    return Rs.map((r, k) => { const a = (k / N) * 2 * Math.PI; return [Math.max(-W / 2, Math.min(W / 2, cx + Math.cos(a) * r)), Math.max(-D / 2, Math.min(D / 2, cz + Math.sin(a) * r))]; });
  }

  // ----- the slab's top: land, parks, streets painted into a texture; water a lower surface seen through it -----
  const PX = 2.56, TW = Math.round(W * PX), TH = Math.round(D * PX);
  function paint(withStreets) {
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const g = cv.getContext('2d');
    const T = (x, z) => [(x + W / 2) * PX, (z + D / 2) * PX];
    const poly = (r) => { g.beginPath(); r.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); };
    g.fillStyle = KITB.land; g.fillRect(0, 0, TW, TH);
    g.fillStyle = KITB.park; for (const r of data.parks) { poly(r); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of data.roads) {
      g.strokeStyle = withStreets ? KITB.street : KITB.land; g.lineWidth = r.w * PX;
      g.beginPath(); r.p.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    }
    if (!withStreets) { // bare: the streets stay as a faint trace (half strength is mixed in the shader)
    }
    g.globalCompositeOperation = 'destination-out';
    for (const r of data.water) { poly(r); g.fill(); }
    for (const r of data.piers) { g.globalCompositeOperation = 'source-over'; g.fillStyle = KITB.land; poly(r); g.fill(); }
    if (organic) { g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#fff'; poly(O); g.fill(); g.globalCompositeOperation = 'source-over'; }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    return tex;
  }
  const texFull = paint(true), texBare = paint(false);
  const topUni = { uBare: { value: texBare }, uBack: { value: 0 } };
  const topMat = new THREE.MeshLambertMaterial({ map: texFull, alphaTest: 0.5, side: THREE.FrontSide });
  topMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, topUni);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uBare; uniform float uBack;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec4 bare = texture2D(uBare, vMapUv); diffuseColor.rgb = mix(diffuseColor.rgb, bare.rgb, uBack); }`);
  };
  topMat.customProgramCacheKey = () => 'cityTop';
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), topMat);
  top.position.y = TOP; top.receiveShadow = true; group.add(top);
  const wmat = new THREE.MeshLambertMaterial({ color: hex(KITB.water) });
  if (organic) {   // the river's surface cut to the same edge
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = Math.round(800 * D / W); const g = cv.getContext('2d'), k = cv.width / W;
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.beginPath();
    O.forEach(([x, z], i) => (i ? g.lineTo((x + W / 2) * k, (z + D / 2) * k) : g.moveTo((x + W / 2) * k, (z + D / 2) * k))); g.closePath(); g.fill();
    const at = new THREE.CanvasTexture(cv); at.colorSpace = THREE.NoColorSpace; wmat.alphaMap = at; wmat.alphaTest = 0.5;
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), wmat);
  water.position.y = TOP - WD; water.receiveShadow = true; group.add(water);

  // point-in-water (for the cut faces and the banks)
  const inWater = (x, z) => data.water.some((r) => inPoly(x, z, r)) && !data.piers.some((r) => inPoly(x, z, r));
  const topAt = (x, z) => (inWater(x * 0.999, z * 0.999) ? TOP - WD : TOP);
  const walls = organic ? outlineWalls(O, topAt) : slabWalls(W, D, topAt);
  group.add(walls);
  // the river banks: a cut face along every water edge inside the box
  {
    const P = [], N = [], e = 0.5;
    for (const r of data.water) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const onEdge = (p) => Math.abs(Math.abs(p[0]) - W / 2) < 0.6 || Math.abs(Math.abs(p[1]) - D / 2) < 0.6;
      if (onEdge(a) && onEdge(b)) continue;
      if (!inO((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.05) continue;
      let n = [dz / l, 0, -dx / l];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (!inPoly(mx + n[0] * e, mz + n[2] * e, r)) n = [-n[0], 0, -n[2]];
      pushTri(P, N, [a[0], TOP - WD, a[1]], [b[0], TOP - WD, b[1]], [b[0], TOP, b[1]], n);
      pushTri(P, N, [a[0], TOP - WD, a[1]], [b[0], TOP, b[1]], [a[0], TOP, a[1]], n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    const banks = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: hex(KITB.cut), side: THREE.DoubleSide }));
    banks.receiveShadow = true; group.add(banks);
  }
  group.add(deskShadow(W, D, organic ? { shape: O } : {}));

  // ----- the circuit, the pit lane, the cars -----
  const C = data.circuit, arc = arcSampler(C.pts);
  const ribbon = trackRibbon(C.pts, { width: C.widthM, heightAt: () => TOP, lift: 0.3 });
  group.add(ribbon);
  if (data.pit) group.add(trackRibbon(data.pit, { width: 6, closed: false, heightAt: () => TOP, lift: 0.22, lines: false, sf: false }));
  const field = carField(nCars, { bryce, heightAt: () => TOP + 0.3, lift: 0.02 });
  group.add(field.mesh);
  // drawn spacing: a stretched-out field, a few close pairs (hash-jittered), side-to-side placement drawn
  const gaps = []; { let s = 0; for (let i = 0; i < nCars; i++) { gaps.push(s); s += 22 + 70 * hash01(i, 11); } const k = arc.length * 0.62 / gaps[nCars - 1]; for (let i = 0; i < nCars; i++) gaps[i] *= k; }
  const side = Array.from({ length: nCars }, (_, i) => (hash01(i, 12) - 0.5) * 4.0);

  // ----- trees -----
  const TREES = organic ? data.trees.filter(([x, z]) => inPoly(x, z, O)) : data.trees;
  if (withTrees && TREES.length) group.add(treeField(TREES, { heightAt: () => TOP }));

  // ----- buildings: one merged mesh, moved per group on the CPU each frame -----
  const groups = new Map();    // key -> {i, cx, cz, ds, dc, h}
  for (const b of BLD) {
    const key = b.g || b.id;
    if (!groups.has(key)) { const c = b.gc || b.c; groups.set(key, { i: groups.size, cx: c[0], cz: c[1], ds: b.ds, dc: b.dc, h: 0 }); }
    const G = groups.get(key); G.h = Math.max(G.h, b.h);
  }
  const GL = [...groups.values()], NG = GL.length;
  const P = [], N = [], GI = [];
  for (const b of BLD) {
    const gi = groups.get(b.g || b.id).i, y0 = TOP + b.b, y1 = TOP + b.h;
    const rings = [b.p, ...(b.holes || [])];
    const n0 = P.length;
    // roof
    const contour = b.p.map(([x, z]) => new THREE.Vector2(x, z)), holes = (b.holes || []).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
    const flat = [...b.p, ...(b.holes || []).flat()];
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holes))
      pushTri(P, N, [flat[i][0], y1, flat[i][1]], [flat[j][0], y1, flat[j][1]], [flat[k][0], y1, flat[k][1]], [0, 1, 0]);
    // walls (outward: away from the solid)
    rings.forEach((r, ri) => {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], c = r[(i + 1) % r.length], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.01) continue;
        let n = [dz / l, 0, -dx / l];
        const mx = (a[0] + c[0]) / 2 + n[0] * 0.05, mz = (a[1] + c[1]) / 2 + n[2] * 0.05;
        const inSolid = inPoly(mx, mz, b.p) && !(b.holes || []).some((h) => inPoly(mx, mz, h));
        if (inSolid) n = [-n[0], 0, -n[2]];
        pushTri(P, N, [a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], n);
        pushTri(P, N, [a[0], y0, a[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], n);
      }
    });
    for (let v = n0 / 3; v < P.length / 3; v++) GI.push(gi);
  }
  const NV = P.length / 3;
  const base = new Float32Array(P), baseN = new Float32Array(N), gidx = new Uint32Array(GI);
  const bgeo = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(new Float32Array(P), 3).setUsage(THREE.DynamicDrawUsage);
  const nrmA = new THREE.BufferAttribute(new Float32Array(N), 3).setUsage(THREE.DynamicDrawUsage);
  const colA = new THREE.BufferAttribute(new Float32Array(NV * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
  const shA = new THREE.BufferAttribute(new Float32Array(NV).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  bgeo.setAttribute('position', posA); bgeo.setAttribute('normal', nrmA); bgeo.setAttribute('color', colA); bgeo.setAttribute('aShade', shA);
  const bmesh = new THREE.Mesh(bgeo, new THREE.MeshLambertMaterial({ vertexColors: true, color: hex(KITB.building) }));
  bmesh.castShadow = shadow; bmesh.receiveShadow = true; bmesh.frustumCulled = false; group.add(bmesh);
  bmesh.customDepthMaterial = ditheredDepth();

  // per-group timing: assemble outward from the start/finish line; fly off from the farthest from the circuit
  const dsMax = Math.max(...GL.map((g) => g.ds)), dcMax = Math.max(...GL.map((g) => g.dc));
  const PH = { built: 0.45, flyStart: 0.6, flyEnd: 0.85 };
  for (const g of GL) {
    const j = hash01(g.i, 21);
    g.a0 = 0.015 + 0.335 * Math.pow(g.ds / dsMax, 0.9) + 0.02 * (j - 0.5); g.a1 = g.a0 + 0.075;
    // the fly-off is one wave: a front that sweeps from the back of the slab (north, -z) toward the river and the home
    // camera, held back near the circuit, so the buildings nearest the track go last (lead's gate, Nov 11: "a clear
    // wave, not scatter")
    const k = 1 - g.dc / dcMax;                                                  // 0 far from the circuit .. 1 on it
    const zf = (g.cz + D / 2) / D;                                               // 0 back edge .. 1 front edge
    g.f0 = PH.flyStart + 0.14 * (0.5 * zf + 0.5 * Math.pow(k, 1.6)) + 0.006 * (hash01(g.i, 22) - 0.5); g.f1 = g.f0 + 0.1;
    const th = hash01(g.i, 23) * Math.PI * 2;
    g.ax = [Math.cos(th), 0, Math.sin(th)];                                      // tumble axis (horizontal)
    g.ang = THREE.MathUtils.degToRad(5 + 8 * hash01(g.i, 24)) * (hash01(g.i, 25) < 0.5 ? -1 : 1);
    const dl = Math.hypot(g.cx, g.cz) || 1; g.dr = [g.cx / dl, g.cz / dl];      // drift: outward from the centre
  }
  const DIM = hex(KITB.cut), WHITE = hex(KITB.building);
  const st = new Float32Array(NG * 16);  // per group: s, lift, drift, cos, sin, axis xyz, pivot y, colour rgb, visible, cx, cz, shadow
  function updateBuildings(u) {
    for (const g of GL) {
      const ea = seg(u, g.a0, g.a1), s = ease3(ea);
      const dim = 1 - smooth(seg(u, g.a1 - 0.015, g.a1 + 0.05));
      const ef = seg(u, g.f0, g.f1);
      const lift = 1500 * Math.pow(ef, 1.8), ang = g.ang * Math.pow(ef, 1.4), drift = 40 * ef * ef;
      const o = g.i * 16;
      st[o] = s; st[o + 1] = lift; st[o + 2] = drift; st[o + 3] = Math.cos(ang); st[o + 4] = Math.sin(ang);
      st[o + 5] = g.ax[0]; st[o + 6] = g.ax[1]; st[o + 7] = g.ax[2]; st[o + 8] = TOP + g.h * 0.5;
      const c = DIM.clone().lerp(WHITE, 1 - dim);
      st[o + 9] = c.r; st[o + 10] = c.g; st[o + 11] = c.b; st[o + 12] = (s > 0 && ef < 1) ? 1 : 0;
      st[o + 13] = g.cx; st[o + 14] = g.cz;
      st[o + 15] = 1 - smooth(seg(lift, 15, 240));      // its shadow fades out over the first 240 m of the lift
    }
    const p = posA.array, nn = nrmA.array, cc = colA.array, sh = shA.array;
    for (let v = 0; v < NV; v++) {
      const o = gidx[v] * 16, k = v * 3;
      if (!st[o + 12]) { p[k] = base[k]; p[k + 1] = TOP - 2; p[k + 2] = base[k + 2]; nn[k] = 0; nn[k + 1] = 1; nn[k + 2] = 0; continue; }
      const s = st[o];
      let x = base[k], y = (TOP - 0.5) + (base[k + 1] - TOP + 0.5) * s, z = base[k + 2];
      let nx = baseN[k], ny = baseN[k + 1], nz = baseN[k + 2];
      if (st[o + 1] > 0 || st[o + 4] !== 0) {
        // rotate about the group's pivot (its centre at mid height) on a horizontal axis (Rodrigues)
        const c = st[o + 3], sn = st[o + 4], ax = st[o + 5], az = st[o + 7], cx = st[o + 13], cy = st[o + 8], cz = st[o + 14];
        const rot = (vx, vy, vz) => {
          const d = ax * vx + az * vz; // axis.y = 0
          const crx = -az * vy, cry = az * vx - ax * vz, crz = ax * vy;   // axis x v with axis = (ax, 0, az)
          return [vx * c + crx * sn + ax * d * (1 - c), vy * c + cry * sn, vz * c + crz * sn + az * d * (1 - c)];
        };
        const r = rot(x - cx, y - cy, z - cz);
        x = r[0] + cx + st[o + 2] * (cx / (Math.hypot(cx, cz) || 1)); y = r[1] + cy + st[o + 1]; z = r[2] + cz + st[o + 2] * (cz / (Math.hypot(cx, cz) || 1));
        [nx, ny, nz] = rot(nx, ny, nz);
      }
      p[k] = x; p[k + 1] = y; p[k + 2] = z; nn[k] = nx; nn[k + 1] = ny; nn[k + 2] = nz;
      cc[k] = st[o + 9]; cc[k + 1] = st[o + 10]; cc[k + 2] = st[o + 11]; sh[v] = st[o + 15];
    }
    posA.needsUpdate = true; nrmA.needsUpdate = true; colA.needsUpdate = true; shA.needsUpdate = true;
  }

  // ----- focus points -----
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of C.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const ren = BLD.filter((b) => b.g === 'r10011997').sort((a, b) => b.h - a.h)[0] || BLD.slice().sort((a, b) => b.h - a.h)[0];
  const focus = { centre: [(x0 + x1) / 2, TOP, (z0 + z1) / 2], circuitBox: [x0, z0, x1, z1], towers: [ren.c[0], TOP + ren.h, ren.c[1]] };
  // the tile view: overhead, the screen turned so the circuit's long axis lies across the frame (its principal axis)
  {
    const P = data.circuit.pts, n = P.length; let mx = 0, mz = 0; for (const [x, z] of P) { mx += x / n; mz += z / n; }
    let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of P) { sxx += (x - mx) ** 2; szz += (z - mz) ** 2; sxz += (x - mx) * (z - mz); }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), c = Math.cos(th), sn = Math.sin(th);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const [x, z] of P) { const a = (x - mx) * c + (z - mz) * sn, b = -(x - mx) * sn + (z - mz) * c; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    focus.tile = { centre: [mx + am * c - bm * sn, TOP, mz + am * sn + bm * c], azim: THREE.MathUtils.radToDeg(-th), length: a1 - a0, width: b1 - b0 };
  }

  function set(u, { t = u * 16, streetsBack = null, carAlpha = 1 } = {}) {
    updateBuildings(u);
    topUni.uBack.value = streetsBack ?? 0.5 * smooth(seg(u, PH.flyEnd, 0.97));
    const v = arc.length / lapTime;
    for (let i = 0; i < nCars; i++) {
      const s = arc.length - gaps[i] + v * t;   // car 0 leads; the field strung out behind it
      const [x, z, hd] = arc.at(s);
      const [, , hd2] = arc.at(s + 3);
      const hh = (hd + hd2) / 2 + (Math.abs(hd2 - hd) > Math.PI ? Math.PI : 0);
      const nx = -Math.sin(hh), nz = Math.cos(hh);
      field.place(i, x + nx * side[i], z + nz * side[i], hh);
    }
    field.update(rig.camera, rig.height); field.style({ alpha: carAlpha });   // call set after the camera is placed
  }

  set(0.5);
  let ox0 = 1e9, ox1 = -1e9, oz0 = 1e9, oz1 = -1e9; for (const [x, z] of O) { ox0 = Math.min(ox0, x); ox1 = Math.max(ox1, x); oz0 = Math.min(oz0, z); oz1 = Math.max(oz1, z); }
  return { group, footprint: { w: ox1 - ox0, d: oz1 - oz0, x0: ox0, x1: ox1, z0: oz0, z1: oz1 }, outline: O, top: TOP, focus, set, phase: PH, circuit: arc, data,
    stats: { buildings: BLD.length, groups: NG, vertices: NV } };
}
