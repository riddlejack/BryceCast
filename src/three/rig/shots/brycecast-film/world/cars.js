// world/cars.js — the race on the hero model: 24 INDY NXT cars at true scale driven by the timing data (builder A).
// Data: V5/data/race/monterey-2026-r1.json, copied slim to data/race.json by V8/tools/laguna_race.py (every car every
// second: arc fraction of the site's outline x 1e4, running position, laps; pits; Bryce = car 9).
//
// Along-track position is data: the arc is mapped back to metres from S/F through the 16 loops (the data was built
// linear in inches between loops, so this inverse is exact), and interpolated linearly between whole seconds. Side to
// side is drawn: each car on the model's racing line (laguna.lineAt), and a car within 7 m behind another eases across
// to run beside it instead of through it (full 2.3 m apart by 4 m). In a pit window, when the data's along-track place
// lies between pit entry and pit exit, the car is drawn on the pit lane at the same fraction of the way along it.
//
// API
//   const cars = await createCars(rig, stage, laguna, labels)
//   cars.set(raceSeconds, { pin = 'P6' | 'Bryce' | null, tag = null, strength = 1, only = null, grid = 0, helmet9 = true,
//                           pinAlpha = 1, ride = false })
//       ride: the cars ride on the track pieces as they are raised (heat map's proud, lift) instead of at ground level
//       raceSeconds: race clock (0 = leader across S/F at the green). Cars off track are hidden.
//       pin 'P6': Bryce's pin reads "Bryce" and his running position at that second ("P6"); 'Bryce': the name only.
//       tag: a second, smaller line on the pin ("location 0"). only: [car numbers] at full strength, the rest stepped
//       back (strength applies to those not in `only`, or to all if only is null). grid: 0..1 blends every car from its
//       race place to its starting grid slot (1 = all on the grid, before the green). helmet9 false hides the helmet
//       in Bryce's car (while the figure stands beside it). Call after the camera is placed (the pin is projected).
//   cars.state(no) -> { frac, d, lateral, pos, yaw, pos: [x,y,z], visible, rank, lap }   after set()
//   cars.rank(no, s) -> running position (data)            cars.lapOf(no, s) -> laps completed (data)
//   cars.name(no, text, { side = +1, strength = 1 }) -> handle   a screen-facing name by the car (as Bryce's pin: same
//       type, ink, a hair-thin leader to the outside of the corner), drawn each set(); handle.set({ alpha, text }) / remove()
//   cars.bracket(noA, noB, text, { side = -1, size = 1.2 }) -> handle   a fine bracket on the asphalt between two cars
//       along the track with a short number beside it; follows them each set(); handle.set({ alpha, text }) / remove()
//   cars.marks                                            race seconds of the race's moments (see RACE MARKS below)
//   cars.ambient(tg)                                      a mid-race clock tied to film time (laps 8 to 30, wrapping)
//   cars.timeAtLoop(no, loopId, lap) -> race s            when a car crossed a loop on a lap (interpolated from the 1 Hz
//                                                         arc; for receipts use V5 crossings)
import { THREE, hex, lerp, clamp01, smooth } from '../../../lib/rig.js';
import { KIT } from '../kit.js';

const RACE_URL = new URL(/* @vite-ignore */ '../data/race.json', import.meta.url).href;

// ---------- the car model (nose +x, ground at y = 0) ----------
// INDY NXT (Dallara IL-15) proportions, low-poly: 4.9 m long, 1.9 m wide over the wheels, wheelbase 3.0 m (front axle
// x = +1.45, rear x = -1.55), wheels r 0.33 (0.30 wide front, 0.38 rear). Body parts carry a shade in a vertex colour
// (1 body, 0.62 wings: a darker tone of the car's colour; 0.3 floor; 0.16 the cockpit opening) that multiplies the
// car's instance colour.
function box8(x0, x1, a, b) {   // a, b: {y0, y1, z0, z1} at x0 and x1: a tapered box, 12 triangles
  const v = [
    [x0, a.y0, a.z0], [x0, a.y0, a.z1], [x0, a.y1, a.z1], [x0, a.y1, a.z0],
    [x1, b.y0, b.z0], [x1, b.y0, b.z1], [x1, b.y1, b.z1], [x1, b.y1, b.z0],
  ];
  const f = [[0, 1, 2, 3], [5, 4, 7, 6], [3, 2, 6, 7], [1, 0, 4, 5], [0, 3, 7, 4], [2, 1, 5, 6]];
  const out = [];
  for (const [p, q, r, s] of f) out.push(v[p], v[r], v[q], v[p], v[s], v[r]);
  return out;
}
const quadBox = (x0, x1, a, b) => box8(x0, x1, { y0: a.y0, y1: a.y1, z0: -a.w, z1: a.w }, { y0: b.y0, y1: b.y1, z0: -b.w, z1: b.w });
const bx = (x0, x1, y0, y1, w) => quadBox(x0, x1, { y0, y1, w }, { y0, y1, w });
function offZ(tris, dz) { return tris.map(([x, y, z]) => [x, y, z + dz]); }
const mirrorZ = (tris) => tris.map(([x, y, z]) => [x, y, -z]).reduce((o, p, i, a) => (i % 3 === 0 ? o.concat([a[i], a[i + 2], a[i + 1]]) : o), []);
function geoFrom(tris, shades) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  if (shades) g.setAttribute('color', new THREE.Float32BufferAttribute(shades.flatMap((v) => [v, v, v]), 3));
  g.computeVertexNormals(); return g;
}
function cyl(r, w, x, y, z, seg = 14) {   // a cylinder across the car (axis z), centred at x, y, z
  const p = new THREE.CylinderGeometry(r, r, w, seg).rotateX(Math.PI / 2).toNonIndexed().attributes.position.array, t = [];
  for (let i = 0; i < p.length; i += 9) t.push([p[i] + x, p[i + 1] + y, p[i + 2] + z], [p[i + 3] + x, p[i + 4] + y, p[i + 5] + z], [p[i + 6] + x, p[i + 7] + y, p[i + 8] + z]);
  return t;
}
function rod(p, q, r) {   // a thin square prism from p to q (r: half-thickness)
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l = Math.hypot(...d) || 1, u = d.map((x) => x / l);
  const a = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const n1 = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]], l1 = Math.hypot(...n1); n1.forEach((x, i) => (n1[i] = x / l1));
  const n2 = [u[1] * n1[2] - u[2] * n1[1], u[2] * n1[0] - u[0] * n1[2], u[0] * n1[1] - u[1] * n1[0]];
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([s1, s2]) => [0, 1, 2].map((i) => (n1[i] * s1 + n2[i] * s2) * r));
  const P = c.map((o) => [p[0] + o[0], p[1] + o[1], p[2] + o[2]]), Q = c.map((o) => [q[0] + o[0], q[1] + o[1], q[2] + o[2]]), t = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; t.push(P[i], Q[i], Q[j], P[i], Q[j], P[j]); }
  return t;
}
export function carGeometry() {
  // Nov 11 (gate round 1): the side-on silhouette of the real car: a tall tub with the cockpit's raised sides, a
  // sloping nose, sidepods with volume (the intake at their front), the airbox over the roll hoop above the driver's
  // head, the engine cover falling to the gearbox, the halo, wing endplates. Shades: 1 body, 0.62 wings and endplates
  // (a darker tone of the car's colour), 0.3 floor and fine parts, 0.16 openings.
  const tris = [], sh = [];
  const add = (t, v) => { tris.push(...t); for (let i = 0; i < t.length; i++) sh.push(v); };
  const both = (t, v) => { add(t, v); add(mirrorZ(t), v); };
  // floor and diffuser
  add(bx(-1.7, 1.25, 0.04, 0.09, 0.64), 0.3);
  add(quadBox(-2.15, -1.7, { y0: 0.06, y1: 0.26, w: 0.44 }, { y0: 0.04, y1: 0.09, w: 0.44 }), 0.3);
  // the tub (survival cell) 0.62 m tall at the cockpit, and the nose sloping down to its tip ahead of the front wing
  add(quadBox(-0.62, 0.95, { y0: 0.09, y1: 0.7, w: 0.31 }, { y0: 0.1, y1: 0.66, w: 0.27 }), 1);
  add(quadBox(0.95, 2.3, { y0: 0.1, y1: 0.66, w: 0.27 }, { y0: 0.2, y1: 0.34, w: 0.07 }), 1);
  // the cockpit opening, dark, and its raised sides (head surround) either side of the helmet
  add(quadBox(-0.5, 0.36, { y0: 0.7, y1: 0.715, w: 0.2 }, { y0: 0.66, y1: 0.675, w: 0.17 }), 0.16);
  both(box8(-0.62, -0.05, { y0: 0.66, y1: 0.8, z0: 0.18, z1: 0.31 }, { y0: 0.66, y1: 0.7, z0: 0.18, z1: 0.3 }), 1);
  // sidepods: deep at the front (the intake), falling and narrowing to the gearbox
  both(box8(-1.15, 0.5, { y0: 0.1, y1: 0.36, z0: 0.3, z1: 0.48 }, { y0: 0.1, y1: 0.55, z0: 0.3, z1: 0.74 }), 1);
  both(box8(0.5, 0.53, { y0: 0.16, y1: 0.5, z0: 0.34, z1: 0.7 }, { y0: 0.16, y1: 0.5, z0: 0.34, z1: 0.7 }), 0.16);   // the intake mouth
  // the airbox over the roll hoop (above the helmet: to 1.04 m), its dark mouth, and the engine cover falling to the tail
  add(quadBox(-0.95, -0.6, { y0: 0.7, y1: 1.0, w: 0.16 }, { y0: 0.7, y1: 1.04, w: 0.12 }), 1);
  add(bx(-0.6, -0.58, 0.88, 1.0, 0.08), 0.16);
  add(quadBox(-2.05, -0.95, { y0: 0.1, y1: 0.44, w: 0.13 }, { y0: 0.1, y1: 0.98, w: 0.2 }), 1);
  add(quadBox(-1.9, -0.95, { y0: 0.44, y1: 0.66, w: 0.012 }, { y0: 0.98, y1: 1.0, w: 0.012 }), 0.62);   // the fin
  // the halo: a centre pillar on the tub ahead of the cockpit, a hoop round the driver's head to the roll hoop
  const H = [[0.42, 0.66, 0], [0.32, 0.86, 0], [0.16, 0.89, 0.15], [-0.12, 0.89, 0.24], [-0.4, 0.86, 0.25], [-0.62, 0.8, 0.2]];
  add(rod(H[0], H[1], 0.025), 0.3);
  for (const zs of [1, -1]) for (let i = 1; i < H.length - 1; i++) add(rod([H[i][0], H[i][1], H[i][2] * zs], [H[i + 1][0], H[i + 1][1], H[i + 1][2] * zs], 0.028), 0.3);
  // front wing: wide main plane low under the nose, a flap, tall endplates
  add(bx(2.0, 2.42, 0.07, 0.1, 0.92), 0.62);
  both(offZ(quadBox(1.95, 2.2, { y0: 0.12, y1: 0.15, w: 0.25 }, { y0: 0.1, y1: 0.125, w: 0.25 }), 0.62), 0.62);
  both(offZ(bx(1.92, 2.46, 0.04, 0.3, 0.014), 0.92), 0.62);
  add(bx(2.12, 2.26, 0.1, 0.22, 0.03), 0.62);
  // rear wing: two elements 1.5 m wide on big endplates behind the rear axle, a centre pillar
  add(quadBox(-2.48, -2.14, { y0: 0.9, y1: 0.95, w: 0.74 }, { y0: 0.86, y1: 0.9, w: 0.74 }), 0.62);
  add(quadBox(-2.38, -2.2, { y0: 0.76, y1: 0.79, w: 0.74 }, { y0: 0.74, y1: 0.76, w: 0.74 }), 0.62);
  both(offZ(bx(-2.52, -2.08, 0.42, 1.0, 0.014), 0.76), 0.62);
  add(bx(-2.22, -2.12, 0.42, 0.88, 0.03), 0.62);
  // mirrors on stalks off the sidepods' front
  both(offZ(bx(0.2, 0.32, 0.6, 0.7, 0.06), 0.46), 1);
  both(rod([0.26, 0.5, 0.36], [0.26, 0.6, 0.46], 0.012), 0.3);
  // suspension: thin wishbones from the tub to each upright
  for (const [x, zi, zo] of [[1.45, 0.25, 0.66], [-1.55, 0.25, 0.58]]) for (const y of [0.24, 0.42]) both([...rod([x + 0.12, y, zi], [x, y, zo], 0.016), ...rod([x - 0.12, y, zi], [x, y, zo], 0.016)], 0.3);
  return geoFrom(tris, sh);
}
export function wheelGeometry() {   // four dark tyres standing clear of the body, and the axles across the car
  const t = [];
  for (const z of [0.8, -0.8]) t.push(...cyl(0.33, 0.3, 1.45, 0.33, z, 18));
  for (const z of [0.76, -0.76]) t.push(...cyl(0.33, 0.38, -1.55, 0.33, z, 18));
  t.push(...cyl(0.028, 1.3, 1.45, 0.33, 0, 6), ...cyl(0.028, 1.18, -1.55, 0.33, 0, 6));
  return geoFrom(t);
}
export function hubGeometry() {     // a small pale rim on each tyre's outer face (a ring, not a disc)
  const t = [];
  for (const [x, z, w] of [[1.45, 0.8, 0.3], [1.45, -0.8, 0.3], [-1.55, 0.76, 0.38], [-1.55, -0.76, 0.38]]) {
    const g = new THREE.RingGeometry(0.17, 0.215, 18); if (z < 0) g.rotateY(Math.PI);
    const p = g.toNonIndexed().attributes.position.array, zz = z + Math.sign(z) * (w / 2 + 0.004);
    for (let i = 0; i < p.length; i += 3) t.push([p[i] + x, p[i + 1] + 0.33, p[i + 2] + zz]);
  }
  return geoFrom(t);
}
// the car's number (Bryce's: data, race.json cars[].no) on the nose and both sidepods, ink on his gold
export function numberDecals(no) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.font = '700 210px "Schibsted Grotesk"'; g.fillStyle = '#1E1C1A'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(no), 128, 140);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const grp = new THREE.Group();
  // nose: lying on the nose's top (it falls 0.23 m per metre), the number's top toward the tip
  const nose = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat); nose.rotation.set(-Math.PI / 2, 0, Math.PI / 2, 'XYZ');
  const ng = new THREE.Group(); ng.position.set(1.42, 0.566, 0); ng.rotation.z = -Math.atan(0.23); ng.add(nose); grp.add(ng);
  // sidepods: on the outer faces, which flare out 0.26 m over their 1.65 m (front deeper)
  for (const zs of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat); const sg = new THREE.Group();
    sg.position.set(-0.28, 0.3, zs * 0.625); sg.rotation.y = (zs > 0 ? 0 : Math.PI) + zs * Math.atan(0.26 / 1.65); sg.add(m); grp.add(sg);
  }
  grp.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return grp;
}

export async function createCars(rig, stage, laguna, labels) {
  const R = await (await fetch(RACE_URL)).json();
  const { scene, camera } = rig;
  const LAP = laguna.lap, W = laguna.width;
  const cars = R.cars.map((c) => c.no);
  const n = cars.length, idx9 = R.cars.findIndex((c) => c.bryce);
  const byNo = Object.fromEntries(R.cars.map((c, i) => [c.no, i]));
  // loop t (outline) -> inches, unwrapped from S/F
  const LT = R.loops.map((l) => (l.t >= R.loops[0].t ? l.t : l.t + 1)), LIN = R.loops.map((l) => l.inches);
  LT.push(R.loops[0].t + 1); LIN.push(R.lapInches);
  function tToD(t) {
    let tu = t >= R.loops[0].t ? t : t + 1;
    let i = 0; while (i < 15 && tu >= LT[i + 1]) i++;
    return ((LIN[i] + ((tu - LT[i]) / (LT[i + 1] - LT[i])) * (LIN[i + 1] - LIN[i])) * 0.0254) % LAP;
  }
  const NS = R.n;
  const dAt = (k, s) => { const a = R.arc[cars[k]][s]; return a === null || a === undefined ? null : tToD(a / 1e4); };
  // past the data's last second (the timing feed stops at 3131 s, 0.2 s before Bryce's finish and 0.5 s before
  // Taylor's), a car runs on at its last second's speed for up to 8 s (drawn), so the finish can be shown crossing the
  // line: only after the winner's checker, never for a car that stopped mid-race
  const FIN = R.raceClock.winnerCheckerS;
  function runOn(k, t) {
    for (let s = Math.floor(t); s > Math.floor(t) - 10; s--) {
      const a = dAt(k, s), p = dAt(k, s - 1); if (a === null || p === null) continue;
      if (t - s > 8) return null;
      let v = a - p; if (v < -LAP / 2) v += LAP; if (v <= 0) return null;
      return ((a + v * (t - s)) % LAP + LAP) % LAP;
    }
    return null;
  }
  function along(k, t) {   // metres from S/F (0..LAP) at race second t, or null
    if (t < 0) { const a = dAt(k, 0), b = dAt(k, 1); if (a === null || b === null) return null; let v = b - a; if (v < 0) v += LAP; return ((a + v * t) % LAP + LAP) % LAP; }
    const s0 = Math.floor(t), s1 = s0 + 1, u = t - s0;
    if (s0 >= NS) return null;
    const a = dAt(k, s0); if (a === null) return t >= FIN ? runOn(k, t) : null;
    if (s1 >= NS) return a;
    const b = dAt(k, s1); if (b === null) return t >= FIN ? runOn(k, t) : u < 0.5 ? a : null;
    let v = b - a; if (v < -LAP / 2) v += LAP; if (v > LAP / 2) v -= LAP;
    return ((a + v * u) % LAP + LAP) % LAP;
  }
  const at = (series, no, t) => series[no][Math.max(0, Math.min(NS - 1, Math.floor(t)))];
  const rank = (no, t) => at(R.pos, no, t), lapOf = (no, t) => at(R.lap, no, t);

  // ---------- meshes ----------
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true });
  const body = new THREE.InstancedMesh(carGeometry(), bodyMat, n);
  const wheels = new THREE.InstancedMesh(wheelGeometry(), new THREE.MeshLambertMaterial({ color: hex('#2A2724'), flatShading: true }), n);
  const helm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.14, 1).scale(1.12, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
  const rims = new THREE.InstancedMesh(hubGeometry(), new THREE.MeshLambertMaterial({ color: hex('#D8D3CB'), flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), n);
  // far away (a car under about 13 px long on screen) each car is drawn as a dash along the track instead: near true
  // length (6 m), 2 m wide (never fatter than a lane), so the field reads as moving specks; light on the dark asphalt
  // (set's `dash` colour; pass a dark one over the heat map's pale road), his gold
  const dashM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 0.5, 2).translate(0, 0.25, 0), dashM, n);
  dash.frustumCulled = false; scene.add(dash);
  for (const m of [body, wheels, helm, rims]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  const decals = numberDecals(R.cars[idx9].no); decals.matrixAutoUpdate = false; scene.add(decals);
  const baseCol = cars.map((no, i) => (i === idx9 ? hex(KIT.bryce) : hex(KIT.car).offsetHSL(0, 0, (((i * 37) % 7) - 3) * 0.012)));
  const dimTo = hex('#D9D4CC');
  // helmets: white, his gold (as on the figure)
  for (let k = 0; k < n; k++) helm.setColorAt(k, k === idx9 ? hex(KIT.bryce) : hex(KIT.kerbWhite));

  // ---------- pit lane polyline ----------
  const PIT = laguna.data.pit, PN = PIT.x.length, pacc = [0];
  for (let k = 1; k < PN; k++) pacc.push(pacc[k - 1] + Math.hypot(PIT.x[k] - PIT.x[k - 1], PIT.z[k] - PIT.z[k - 1]));
  function pitPoint(u) {
    const s = clamp01(u) * pacc[PN - 1]; let k = 1; while (k < PN - 1 && pacc[k] < s) k++;
    const v = (s - pacc[k - 1]) / (pacc[k] - pacc[k - 1]);
    const x = lerp(PIT.x[k - 1], PIT.x[k], v), z = lerp(PIT.z[k - 1], PIT.z[k], v), y = lerp(PIT.y[k - 1], PIT.y[k], v);
    return { pos: [x, y + 0.08, z], yaw: Math.atan2(-(PIT.z[k] - PIT.z[k - 1]), PIT.x[k] - PIT.x[k - 1]) };
  }
  const pitIn = PIT.inD, pitOut = PIT.outD, pitSpan = ((pitOut - pitIn) % LAP + LAP) % LAP;
  // the pit wall's track face as a lateral limit (laguna.js places the wall from the pit lane's line, so along the
  // front straight it stands inside the track's width): a racing car's centre stays 1.15 m clear of it, else the white
  // blocks are drawn through the car (the coordinator, Nov 11: "two cars beside the pit wall drawn white")
  const WN = 2400, wallHi = new Float32Array(WN).fill(1e9), wallLo = new Float32Array(WN).fill(-1e9);
  {
    const C = [], Lv = [];
    for (let i = 0; i < WN; i++) { const p0 = laguna.pointAt(i / WN, 0), p1 = laguna.pointAt(i / WN, 1); C.push(p0); Lv.push([p1[0] - p0[0], p1[2] - p0[2]]); }
    const PW = laguna.data.pitWidth;
    for (let k = 25; k < PN - 26; k++) for (const v of [0, 0.5]) {
      const ax = lerp(PIT.x[k], PIT.x[k + 1], v), az = lerp(PIT.z[k], PIT.z[k + 1], v);
      const dx = PIT.x[k + 1] - PIT.x[k], dz = PIT.z[k + 1] - PIT.z[k], l = Math.hypot(dx, dz) || 1, off = -PIT.side[k] * (PW / 2 + 0.6);
      const wx = ax + (dz / l) * off, wz = az + (-dx / l) * off;
      let bi = 0, bd = 1e18; for (let i = 0; i < WN; i++) { const d = (C[i][0] - wx) ** 2 + (C[i][2] - wz) ** 2; if (d < bd) { bd = d; bi = i; } }
      const lat = (wx - C[bi][0]) * Lv[bi][0] + (wz - C[bi][2]) * Lv[bi][1];
      if (Math.abs(lat) > W / 2 + 3) continue;
      for (let j = -4; j <= 4; j++) {
        const i = (bi + j + WN) % WN;
        if (lat > 0) wallHi[i] = Math.min(wallHi[i], lat - 0.225 - 1.15); else wallLo[i] = Math.max(wallLo[i], lat + 0.225 + 1.15);
      }
    }
  }

  // ---------- state per frame ----------
  const S = cars.map(() => ({}));
  const o = new THREE.Object3D(), oh = new THREE.Object3D(), c = new THREE.Color(), Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  const names = new Set(), brackets = new Set();
  let lastT = 0;
  // the inside car of a close pair: INSIDE (drawn, the gate's call for the lap-2 hairpin pass: Bryce inside, Correa
  // outside), else whichever was behind the last time they were 8 m apart or more (looked back in 0.25 s steps)
  const INSIDE = { '68|9': '9', '9|68': '9' };
  function insideOf(a, b, t) {
    const named = INSIDE[a.no + '|' + b.no]; if (named) return named === a.no ? a : b;
    for (let dt = 0.25; dt <= 8; dt += 0.25) {
      const da = along(a.k, t - dt), db = along(b.k, t - dt); if (da === null || db === null) break;
      let g = db - da; if (g > LAP / 2) g -= LAP; if (g < -LAP / 2) g += LAP;
      if (Math.abs(g) >= 8) return g > 0 ? a : b;   // a was behind b
    }
    return a;
  }
  const hisMark = new THREE.Color(), asphaltCol = hex(KIT.asphalt);
  function set(t, { pin = 'P6', tag = null, strength = 1, only = null, grid = 0, helmet9 = true, pinAlpha = 1, dash: dashCol = '#F2EFEA', dashPx = 13, markPx = null, ride = false, tagPx = 22, tagNumAlpha = 1, avoid = [], place = null, fade = null } = {}) {
    tagStyle.px = tagPx; tagStyle.numAlpha = tagNumAlpha; avoidRects = avoid;
    const ppm = rig.height / (2 * Math.tan((camera.fov * Math.PI) / 360));   // px per metre at 1 m from the camera
    const dc = hex(dashCol);
    lastT = t;
    // along-track places
    const list = [];
    for (let k = 0; k < n; k++) {
      const st = S[k]; st.k = k; st.no = cars[k]; st.pit = false;
      // place (v9, builder P, additive; default null = unchanged): place(no) -> metres from S/F on the racing line (no
      // pit lane), null (hidden), or undefined (the data at t, as without it)
      const pd = place ? place(cars[k]) : undefined;
      if (pd !== undefined) { st.d = pd === null ? null : ((pd % LAP) + LAP) % LAP; st.visible = st.d !== null; if (st.visible) list.push(st); continue; }
      st.d = along(k, t);
      st.visible = st.d !== null;
      if (st.visible) {
        const pits = R.cars[k].pit || [];
        for (const [a, b] of pits) if (a !== null && b !== null && t >= a && t <= b) {
          const q = ((st.d - pitIn) % LAP + LAP) % LAP;
          if (q <= pitSpan) { st.pit = true; st.pitU = q / pitSpan; }
        }
        if (!st.pit) list.push(st);
      }
    }
    // lateral: racing line, then cars within 7 m of the car ahead ease beside it (drawn)
    list.sort((a, b) => b.d - a.d);
    // front to back from the car with the most open road ahead, so a pair across the S/F line (the start) is placed in
    // order too: the car ahead is always placed before the car behind it
    if (list.length > 1) {
      let j0 = 0, best = -1;
      for (let i = 0; i < list.length; i++) { const g = i ? list[i - 1].d - list[i].d : list[list.length - 1].d + LAP - list[0].d; if (g > best) { best = g; j0 = i; } }
      if (j0) list.push(...list.splice(0, j0));
    }
    for (const st of list) { if (!st.side) st.cs = 0; st.side = 0; st.lat = undefined; }
    const lim = W / 2 - 1.15;
    for (let i = 0; i < list.length; i++) {
      const st = list[i], f = st.d / LAP; let lat = laguna.lineAt(f);
      // this place's lateral limits: the track's edges, and the pit wall's face where it stands inside the track
      const wi = Math.floor((((f % 1) + 1) % 1) * WN) % WN, hiL = Math.min(lim, wallHi[wi]), loL = Math.max(-lim, wallLo[wi]);
      // the nearest car ahead (circular)
      let ahead = null, gap = 1e9;
      for (let j = 0; j < list.length; j++) { if (j === i) continue; let g = list[j].d - st.d; if (g < 0) g += LAP; if (g < gap) { gap = g; ahead = list[j]; } }
      if (ahead && gap < 8 && ahead.lat !== undefined) {
        // side by side (drawn): two cars within a car's length and a half along the track sit a clear car's width
        // apart (3 m centre to centre), fully by 6.5 m, eased in from 8 m (the review gate, Nov 11: cars drawn
        // through each other read as a crash). Which car takes which side is fixed for the whole encounter, so they
        // never swap through each other as their order flips: INSIDE names it for a pair (drawn), else the car that
        // was behind when they closed up takes the inside of the bend (the side the track turns to over 80 m)
        const w = smooth(clamp01((8 - gap) / 1.5)), turn = laguna.headingAt(f + 40 / LAP) - laguna.headingAt(f - 40 / LAP);
        const tw = Math.atan2(Math.sin(turn), Math.cos(turn)), ins = tw >= 0 ? 1 : -1;
        if (ahead.side) {
          // a file (the start): the car ahead already sits beside the one in front of it, so this one takes the other
          // column, 3 m across from it (never moving it again, which drew the third car through the second), so a
          // close file runs as two columns as on a real start (the lead, 05:47)
          // the side is kept from frame to frame (no jump); first toward the track's centre, and flipped only when the
          // other side has no room
          let cs = st.cs || (ahead.lat > (loL + hiL) / 2 ? -1 : 1);
          if (ahead.lat + cs * 3 > hiL + 0.3 || ahead.lat + cs * 3 < loL - 0.3) cs = -cs;
          const tgt = Math.max(loL, Math.min(hiL, ahead.lat + cs * 3));
          lat = lerp(lat, tgt, w); st.cs = cs; st.side = cs; st.lat = Math.max(loL, Math.min(hiL, lat)); continue;
        }
        const inner = insideOf(st, ahead, t);
        // the pair's middle kept 1.5 m inside the limits (the wall's too), so by the wall the second car sits a full
        // 3 m toward the centre rather than both pressed into one file (the lead, 05:47)
        const mid = Math.max(loL + 1.5, Math.min(hiL - 1.5, (ahead.lat + lat) / 2));
        const latIn = mid + ins * 1.5, latOut = mid - ins * 1.5;   // 3 m centre to centre: a clear metre between them
        if (inner === st) { lat = lerp(lat, latIn, w); ahead.lat = lerp(ahead.lat, latOut, w); st.side = ins; ahead.side = -ins; }
        else { lat = lerp(lat, latOut, w); ahead.lat = lerp(ahead.lat, latIn, w); st.side = -ins; ahead.side = ins; }
      }
      st.lat = Math.max(loL, Math.min(hiL, lat));
    }
    for (let k = 0; k < n; k++) {
      const st = S[k];
      if (!st.visible) { if (k === idx9) decals.visible = false; o.scale.set(0, 0, 0); o.updateMatrix(); body.setMatrixAt(k, o.matrix); wheels.setMatrixAt(k, o.matrix); rims.setMatrixAt(k, o.matrix); helm.setMatrixAt(k, o.matrix); dash.setMatrixAt(k, o.matrix); o.scale.set(1, 1, 1); continue; }
      let pos, yaw, pitch = 0;
      if (st.pit) { const p = pitPoint(st.pitU); pos = p.pos; yaw = p.yaw; }
      else {
        const f = st.d / LAP; pos = laguna.pointAt(f, st.lat); yaw = laguna.headingAt(f); pitch = laguna.pitchAt(f);
        if (ride) {   // on the raised pieces, eased over 8 m across a joint (a step between two pieces' heights)
          let r = 0; for (const o of [-4, -2, 0, 2, 4]) r += laguna.pieces[laguna.sectionOf(f + o / LAP)].raise || 0;
          pos = [pos[0], pos[1] + r / 5, pos[2]];
        }
      }
      if (grid > 0) {
        const gs = laguna.gridSlot(R.cars[k].start);
        const u = smooth(clamp01(grid));
        pos = pos.map((x, q) => lerp(x, gs.pos[q], u)); yaw = u > 0.5 ? gs.yaw : yaw; pitch = lerp(pitch, laguna.pitchAt(gs.frac), u);
        if (grid >= 1) { st.d = gs.frac * LAP; st.lat = gs.lateral; }
      }
      st.pos = pos; st.yaw = yaw; st.frac = st.d / LAP;
      o.position.set(pos[0], pos[1], pos[2]); o.rotation.set(0, yaw, pitch, 'YXZ'); o.rotation.order = 'YZX'; o.rotation.set(0, yaw, pitch);
      o.updateMatrix();
      const dist9 = Math.max(1, camera.position.distanceTo(o.position));
      const far = markPx ? true : (4.9 * ppm) / dist9 < dashPx;
      st.dashed = far;
      // markPx {len, w, his, hisCol, h} (v9, additive; h = the other cars' marker height factor, default 1 = 0.5 m, 4 = his height, so they do not sink into the asphalt from far off): every car a marker of a fixed size on screen (px), his `his` times larger
      // fade(no) -> 0..1 (v9, builder P, additive; markers only): the marker's colour eases to the asphalt's, gone at 1
      const fd = markPx && fade ? clamp01(fade(cars[k]) || 0) : 0;
      if (markPx && fd >= 0.999) dash.setMatrixAt(k, Z0);
      else if (markPx) { const m = dist9 / ppm, f = k === idx9 ? (markPx.his || 1) : 1; o.scale.set((markPx.len * m * f) / 6, k === idx9 ? 4 : (markPx.h || 1), (markPx.w * m * f) / 2); o.updateMatrix(); dash.setMatrixAt(k, o.matrix); o.scale.set(1, 1, 1); o.updateMatrix(); }
      else dash.setMatrixAt(k, far ? o.matrix : Z0);
      if (far) { o.scale.set(0, 0, 0); o.updateMatrix(); }
      body.setMatrixAt(k, o.matrix); wheels.setMatrixAt(k, o.matrix); rims.setMatrixAt(k, o.matrix);
      if (k === idx9) { decals.visible = !far; decals.matrix.copy(o.matrix); decals.matrixWorldNeedsUpdate = true; }
      if (far) { o.scale.set(1, 1, 1); o.updateMatrix(); }
      oh.position.set(-0.22, 0.84, 0); oh.updateMatrix(); oh.matrix.premultiply(o.matrix);
      if (far || (k === idx9 && !helmet9)) helm.setMatrixAt(k, Z0); else helm.setMatrixAt(k, oh.matrix);
      const full = only ? only.includes(cars[k]) : true;
      const sgt = full ? (only ? 1 : strength) : strength;
      c.copy(baseCol[k]).lerp(dimTo, (1 - sgt) * 0.75); body.setColorAt(k, c);
      c.copy(k === idx9 ? (markPx && markPx.hisCol ? hisMark.set(markPx.hisCol) : baseCol[k]) : (markPx && markPx.col ? hisMark.set(markPx.col) : dc)).lerp(dimTo, (1 - sgt) * 0.75);
      if (fd > 0) c.lerp(asphaltCol, fd);
      dash.setColorAt(k, c);
    }
    body.instanceMatrix.needsUpdate = wheels.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = helm.instanceMatrix.needsUpdate = true;
    body.instanceColor.needsUpdate = true; dash.instanceColor.needsUpdate = dash.instanceMatrix.needsUpdate = true;
    drawn.length = 0; for (const r of avoidRects) drawn.push(r);
    for (const h of names) h.update();
    for (const h of brackets) h.update();
    // Bryce's pin: a hair-thin ink leader from his car to his name, run off the asphalt (gate round 1: ink type over
    // dark asphalt is unreadable) to beyond the track's edge on the side that points up the frame, or the side away
    // from a named car beside him; far away (the track a thin line) straight up, 74 px
    const b = S[idx9];
    if (pin && b.visible && pinAlpha > 0.002) {
      let avoid = 0;
      for (const h of names) if (h.lastSide && h.alpha > 0.01) { const o2 = S[byNo[h.no]]; if (o2.visible && b.pos && Math.hypot(o2.pos[0] - b.pos[0], o2.pos[2] - b.pos[2]) < 30) avoid = h.lastSide; }
      let cs = [1, -1].map((sd) => callout(b, sd)).filter(Boolean);
      { const clear = cs.filter((c) => !segHits(c)); if (clear.length) cs = clear; }   // a leader never crosses a board
      let cB = null;
      if (cs.length) {
        if (avoid) cB = cs.find((c) => c.side === -avoid) || cs[0];
        else cB = cs.reduce((m, c) => (c.dy < m.dy ? c : m));
        if (cB.dy > 0.35 && !avoid) cB = callout(b, 0);   // a named car beside him: keep to the other side, label beside the end
      } else cB = callout(b, 0);
      if (cB) {
        const txt = 'Bryce', parts = [{ text: txt, color: KIT.ink }];
        if (pin !== 'Bryce') parts.push({ text: pin === 'P6' || pin === true ? 'P' + rank('9', t) : String(pin), color: KIT.bryce, num: true });
        drawCallout(cB, parts, pinAlpha, tag);
      }
    }
    return api;
  }
  const pv = new THREE.Vector3();
  function project(p) { pv.set(p[0], p[1], p[2]).project(camera); return [(pv.x * 0.5 + 0.5) * rig.width, (-pv.y * 0.5 + 0.5) * rig.height, pv.z < 1 && pv.z > -1]; }
  // callout(st, side, minLen): a leader from a car to beyond the track's edge on `side` (+1 the track's left; 0 or a
  // track too thin on screen: straight up), at least minLen px, ending 26 px past the edge, so its label sits on grass
  // or paper, never on the asphalt
  function callout(st, side, minLen = 74, beyond = 5) {
    const p0 = project([st.pos[0], st.pos[1] + 1.15, st.pos[2]]); if (!p0[2]) return null;
    // lead's gate (Nov 11): a pin whose car is out of the frame is hidden
    if (p0[0] < 0 || p0[0] > rig.width || p0[1] < 0 || p0[1] > rig.height) return null;
    let dx = 0, dy = -1, L0 = 0;
    if (side) {
      const pe = project(laguna.pointAt(st.frac, side * (W / 2 + beyond), 1.15)), ex = pe[0] - p0[0], ey = pe[1] - p0[1], l = Math.hypot(ex, ey);
      if (pe[2] && l >= 40) { dx = ex / l; dy = ey / l; L0 = l; }
    }
    const len = Math.max(minLen, L0 + 26), ex = p0[0] + dx * len, ey = p0[1] + dy * len;
    if (side && (ex < 150 || ex > rig.width - 150 || ey < 60 || ey > rig.height - 40)) return null;   // its label would leave the frame
    return { side, x0: p0[0] + dx * 6, y0: p0[1] + dy * 6, x1: p0[0] + dx * len, y1: p0[1] + dy * len, dx, dy };
  }
  // the leader and its label: above its end when it points up the frame, else beside it, reading away from the car
  // labels drawn this frame (their boxes), so a later label never prints over an earlier one (lead's gate, Nov 11)
  const drawn = [];
  // set(..., {avoid: [[x0, y0, x1, y1], ...]}): screen boxes (a beat's boards) that labels step clear of and leaders
  // avoid where they can; tagPx / tagNumAlpha: the tag's size and its trailing number's alpha (a tick's blink)
  let avoidRects = [];
  const tagStyle = { px: 22, numAlpha: 1 };
  function segHits(c) {
    for (let k = 1; k <= 12; k++) {
      const u = k / 12, x = c.x0 + (c.x1 - c.x0) * u, y = c.y0 + (c.y1 - c.y0) * u;
      if (avoidRects.some((r) => x > r[0] && x < r[2] && y > r[1] && y < r[3])) return true;
    }
    return false;
  }
  function drawCallout(c, parts, alpha, tag) {
    const ctx = rig.ctx, px = 30, gapW = 10;
    const ws = parts.map((q) => { const bb = labels.box(q.text, [0, 0], { px }); return bb[2] - bb[0]; });
    const total = ws.reduce((a, w) => a + w, 0) + gapW * (parts.length - 1);
    let x, y, base;
    if (c.dy < -0.6) { x = c.x1 - total / 2; y = c.y1 - 8; base = 'bottom'; }
    else if (c.dx >= 0) { x = c.x1 + 8; y = c.y1; base = 'middle'; }
    else { x = c.x1 - 8 - total; y = c.y1; base = 'middle'; }
    x = Math.max(16, Math.min(rig.width - 16 - total, x));   // the label kept inside the frame
    // clear of the labels already drawn: step up (or down, near the top) a line at a time, the leader following
    const box = (yy) => { const top = base === 'bottom' ? yy - px - 4 : yy - px / 2 - 4; return [x - 6, top - (tag ? tagStyle.px + 10 : 0), x + total + 6, top + px + 8]; };
    const hit = (r) => drawn.some((q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3]);
    let dyL = 0;
    for (let k = 1; k <= 6 && hit(box(y + dyL)); k++) dyL = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (px + 10);
    if (y + dyL < 40 || y + dyL > rig.height - 20) dyL = 0;
    y += dyL; drawn.push(box(y));
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = KIT.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Math.round(c.x0) + 0.5, Math.round(c.y0) + 0.5); ctx.lineTo(Math.round(c.x1) + 0.5, Math.round(c.y1 + dyL) + 0.5); ctx.stroke(); ctx.restore();
    x = Math.round(x); y = Math.round(y);
    parts.forEach((q, i) => { (q.num ? labels.num : labels.label)(q.text, [x, y], { align: 'left', base, px, alpha, color: q.color }); x += ws[i] + gapW; });
    if (tag && tagStyle.px <= 22) labels.label(tag, [Math.round(c.dy < -0.6 ? c.x1 : x - (total + gapW) / 2), y - (base === 'bottom' ? 38 : 30)], { base: 'bottom', px: 22, alpha, color: KIT.muted });
    else if (tag) {
      // the large tag (b07, lead's gate): its words in ink at tagPx, a trailing number in the numerals face, Bryce's colour
      const tp = tagStyle.px, m = /^(.*?)\s*(\d+)$/.exec(tag), words = m ? m[1] : tag, num = m ? m[2] : null;
      const ty = y - (base === 'bottom' ? px + 12 : px / 2 + 10);
      const ww = labels.box(words, [0, 0], { px: tp }), w1 = ww[2] - ww[0];
      const wn = num ? labels.box(num, [0, 0], { px: tp * 1.15 }) : [0, 0, 0, 0], w2 = wn[2] - wn[0];
      const tot = w1 + (num ? 10 + w2 : 0), tx = Math.round(Math.max(16, Math.min(rig.width - 16 - tot, c.dy < -0.6 ? c.x1 - tot / 2 : x)));
      labels.label(words, [tx, ty], { align: 'left', base: 'bottom', px: tp, alpha, color: KIT.ink });
      if (num) labels.num(num, [tx + w1 + 10, ty], { align: 'left', base: 'bottom', px: Math.round(tp * 1.15), alpha: alpha * tagStyle.numAlpha, color: KIT.bryce });
    }
  }

  // ---------- names and brackets on the asphalt ----------
  // a name by a car: screen-facing like Bryce's pin (same type, ink, a hair-thin leader), the leader running out to
  // the outside of the corner the car is in (on a straight, to `side`: +1 the track's left), so it clears the car,
  // the pin and the car beside it. Drawn on the overlay each set().
  // gate round 3 (Nov 11): the name sits close beside its car on the grass side nearest it (the edge on the side of
  // the car's line), on a short leader ending just past the kerb, never across the track
  function name(no, text, { side = 1, strength = 1, len = 34 } = {}) {
    const h = {
      alpha: 1, text, no, lastSide: 0,
      update() {
        h.lastSide = 0;
        const st = S[byNo[no]]; if (!st.visible || h.alpha <= 0.01 || st.dashed) return;
        const out = Math.abs(st.lat || 0) > 0.3 ? Math.sign(st.lat) : side;
        let c = callout(st, out, len, 1.5); if (!c || segHits(c)) c = callout(st, -out, len, 1.5) || c || callout(st, 0, len); if (!c) return;
        // a named car beside Bryce's: the leader goes the side away from his car (so the name never sits on his car)
        const b9 = S[idx9];
        if (no !== cars[idx9] && b9.visible && b9.pos && st.pos && Math.hypot(b9.pos[0] - st.pos[0], b9.pos[2] - st.pos[2]) < 8) {
          const p9 = project([b9.pos[0], b9.pos[1] + 0.6, b9.pos[2]]);
          const near = (q) => { let m = 1e9; for (let k = 2; k <= 12; k++) { const u = k / 12; m = Math.min(m, Math.hypot(q.x0 + (q.x1 - q.x0) * u - p9[0], q.y0 + (q.y1 - q.y0) * u - p9[1])); } return m; };
          const alts = [callout(st, out, len, 1.5), callout(st, -out, len, 1.5), callout(st, 0, len)].filter(Boolean);
          if (alts.length) c = alts.reduce((m, q) => (near(q) > near(m) ? q : m));
        }
        h.lastSide = c.side || out;
        drawCallout(c, [{ text: h.text, color: KIT.ink }], h.alpha * strength);
      },
      set({ alpha, text: t2 } = {}) { if (alpha !== undefined) h.alpha = alpha; if (t2 !== undefined) h.text = t2; return h; },
      remove() { names.delete(h); },
    };
    names.add(h); return h;
  }
  // lat: put it on the asphalt at that lateral (m) instead of the verge; color: paper where it lies on asphalt.
  // label 'board' (gate, Nov 11): the number stands on a small board at the bracket's middle, turned to face the
  // camera (the corner boards' family: paper card, ink type); 'paint' lays it on the asphalt along the track
  function bracket(a, b, text, { side = -1, size = 1.2, lat: latQ = null, color = KIT.ink, label = 'paint' } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color: hex(color), transparent: true, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9 });
    const geo = new THREE.BufferGeometry(); const NSEG = 24;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((NSEG + 1) * 2 * 3 + 16 * 3), 3));
    const idx = []; for (let k = 0; k < NSEG; k++) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
    const t0 = (NSEG + 1) * 2; for (let e = 0; e < 2; e++) { const q = t0 + e * 4; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
    geo.setIndex(idx);
    const line = new THREE.Mesh(geo, mat); line.frustumCulled = false; line.renderOrder = 7; scene.add(line);
    const board = label === 'board';
    // paper-white whatever the light (the coordinator, Nov 11: a lit card read mid-grey); it still casts its soft shadow
    const cardMat = new THREE.MeshBasicMaterial({ color: hex(KIT.building), side: THREE.DoubleSide, transparent: true });
    function makeText(t) {
      if (!board) return labels.groundText(t, { size, color });
      const g = new THREE.Group(), m = labels.groundText(t, { size, color: KIT.ink }), w = m.userData.width, h = size * 1.9, post = 0.5;
      m.geometry = m.geometry.clone().rotateX(Math.PI / 2); m.position.set(0, post + h / 2, 0.012);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, h), cardMat); card.position.set(0, post + h / 2, 0); card.castShadow = true;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, post, 6).translate(0, post / 2, 0), cardMat); p.castShadow = true;
      g.add(p, card, m); g.material = m.material; return g;
    }
    let txt = makeText(text); scene.add(txt);
    const h = {
      alpha: 1, text,
      update() {
        const A = S[byNo[a]], B = S[byNo[b]]; const vis = A.visible && B.visible && h.alpha > 0.01; line.visible = txt.visible = vis; if (!vis) return;
        let d0 = B.d, d1 = A.d; if (d1 < d0 - LAP / 2) d1 += LAP; if (d1 - d0 > LAP / 2) { const s = d0; d0 = d1; d1 = s + LAP; }
        const lat = latQ ?? side * (W / 2 + 1.7), w = 0.1, P = geo.attributes.position.array;   // on the verge beyond the kerb (ink over grass, never over asphalt)
        for (let k = 0; k <= NSEG; k++) {
          const f = (d0 + ((d1 - d0) * k) / NSEG) / LAP, p1 = laguna.pointAt(f, lat + w, 0.07), p2 = laguna.pointAt(f, lat - w, 0.07);
          P.set(p1, k * 6); P.set(p2, k * 6 + 3);
        }
        [d0, d1].forEach((d, e) => { const f = d / LAP, q = (t0 + e * 4) * 3; P.set(laguna.pointAt(f - 0.1 / LAP, lat + side * 0.0 + 1.0, 0.07), q); P.set(laguna.pointAt(f - 0.1 / LAP, lat - 1.0, 0.07), q + 3); P.set(laguna.pointAt(f + 0.1 / LAP, lat + 1.0, 0.07), q + 6); P.set(laguna.pointAt(f + 0.1 / LAP, lat - 1.0, 0.07), q + 9); });
        geo.attributes.position.needsUpdate = true; mat.opacity = h.alpha;
        const fm = (d0 + d1) / 2 / LAP;
        if (board) {
          const pb = laguna.pointAt(fm, lat, 0.02); txt.position.set(pb[0], pb[1], pb[2]);
          txt.rotation.set(0, Math.atan2(camera.position.x - pb[0], camera.position.z - pb[2]), 0);
          txt.material.opacity = h.alpha; cardMat.opacity = h.alpha; return;
        }
        const pt = laguna.pointAt(fm, latQ !== null ? latQ - side * size * 1.4 : side * (W / 2 + 1.7 + size * 1.4), 0.3);   // 0.3 m up: a flat plane on a graded straight sinks under the asphalt at its ends
        txt.position.set(pt[0], pt[1], pt[2]);
        let yaw = laguna.headingAt(fm);
        const cx = camera.position.x - pt[0], cz = camera.position.z - pt[2];
        if (cx * Math.sin(yaw) + cz * Math.cos(yaw) < 0) yaw += Math.PI;
        txt.rotation.set(0, yaw, 0); txt.material.opacity = h.alpha;
      },
      set({ alpha, text: t2 } = {}) {
        if (alpha !== undefined) h.alpha = alpha;
        if (t2 !== undefined && t2 !== h.text) { scene.remove(txt); txt = makeText(t2); scene.add(txt); h.text = t2; }
        h.update(); return h;
      },
      remove() { scene.remove(line); scene.remove(txt); brackets.delete(h); },
    };
    brackets.add(h); h.update(); return h;
  }

  // ---------- race marks (race seconds) ----------
  const crossing = (no, loopD, fromS, toS) => {   // first second-interval where car `no` passes loopD (m), interpolated
    const k = byNo[no];
    for (let s = Math.max(0, Math.floor(fromS)); s < Math.min(NS - 1, toS); s++) {
      const a = dAt(k, s), b = dAt(k, s + 1); if (a === null || b === null) continue;
      let v = b - a; if (v < -LAP / 2) v += LAP;
      let q = loopD - a; if (q < 0) q += LAP;
      if (q <= v && v > 0) return s + q / v;
    }
    return null;
  };
  const marks = {
    // green: race clock 0 = leader #29 across S/F at the green (monterey-2026-r1.json raceClock.zeroIs)
    green: 0,
    // lap1End: Bryce (car 9) completes lap 1: first S/F crossing after 10 s from his 1 Hz arcs
    lap1End: +crossing('9', 0, 10, 200).toFixed(3),
    // pass: Correa (#68) passes Bryce in Turn 2 on lap 2: the passes list's tx 96.6 s (correa-pass-lap2.json: crossing
    // I3 at 96.5953 s for #68, 96.943 s for car 9; between I2 at 87.2 s and I3)
    pass: R.passes.find((p) => p.car === '68').tx,
    // pit: the car ahead (#99 Myles Rowe) enters the pit lane on lap 2; its pit window opens at 139.0 s (cars[].pit,
    // "from the in-lap's last mainline loop (I10)"); Bryce's position changes at 149.9 s (CHECK-1.md)
    pit: R.cars.find((c) => c.no === '99').pit[0][0],
    // lap3: Bryce starts lap 3: his second S/F crossing after lap1End
    lap3: null,
    // flag: the winner's checker (raceClock.winnerCheckerS)
    flag: R.raceClock.winnerCheckerS,
    // bryceFinish: Bryce across the line at the flag (raceClock.bryceFinishS)
    bryceFinish: R.raceClock.bryceFinishS,
  };
  marks.lap3 = +crossing('9', 0, marks.lap1End + 30, marks.lap1End + 200).toFixed(3);
  // the mid-race clock for ambient beats: laps 8 to 30 of the leader, wrapping (race s 532 .. 2282, from CLOCK.md's
  // header join: lap 8 header at 532 s; the yellows at 949.7-1237.3 and 1386.6-1763.3 and 1895.5-2504.7 are avoided by
  // running 280 s of green from 600 s: 600 .. 880 s)
  const AMB0 = 600, AMBLEN = 280;
  const ambient = (tg) => AMB0 + (((tg % AMBLEN) + AMBLEN) % AMBLEN);

  // the hairpin pass on lap 2: the second #68's along-track place passes car 9's (both interpolated between loops)
  let passS = null;
  for (let t = 86; t < 98; t += 0.02) { const a = along(byNo['68'], t), b9 = along(idx9, t); if (a !== null && b9 !== null && a - b9 > 0 && a - b9 < 50) { passS = +t.toFixed(2); break; } }
  marks.passOnTrack = passS;   // drawn moment inside the section (data: between I2 87.2 s and I3 96.6 s)
  // hideMarks(): every name and bracket to alpha 0 (the composer's world.reset() calls it each frame, so a beat's names
  // show only while that beat sets them)
  const hideMarks = () => { for (const h of names) h.alpha = 0; for (const h of brackets) h.alpha = 0; };
  const api = { set, hideMarks, state: (no) => S[byNo[no]], rank, lapOf, name, bracket, marks, ambient, crossing, along: (no, t) => along(byNo[no], t), meshes: { body, wheels, helm, rims, dash }, race: R, idx9 };
  attachPoses(laguna, api);
  return api;
}

// ---------- car poses (added to laguna.poses / laguna.posesAt) ----------
// Plain poses at the race second named in laguna.poseSeconds; laguna.posesAt[name](raceS) follows the race.
const rig16x9 = 16 / 9;
function attachPoses(L, C) {
  const st = (no, s) => { C.set(s, { pin: null }); return C.state(no); };
  const A = {};
  // ride (gate, Nov 11): a high chase, 9 m back and 4.5 m up, pitched down so the horizon sits near the frame's top
  A.ride = (s) => { const b = st('9', s); return L.chase(b.pos, b.yaw, { back: 9, up: 5.5, fov: 50, lookAhead: 1.5 }); };
  // wire: loop 12 (I9) and his car coming up to it; from ahead and to the side, 24° down, the wire, both edges, the
  // flag and the car in one frame
  A.wire = (s) => { const b = st('9', s), f = L.loopFrac(12), y = L.headingAt(f), fx = Math.cos(y), fz = -Math.sin(y), lx = -Math.sin(y), lz = -Math.cos(y);
    const pts = [L.pointAt(f, L.width / 2 + 3), L.pointAt(f, -L.width / 2 - 3), L.pointAt(f - 22 / L.lap, 0), [b.pos[0], b.pos[1] + 1, b.pos[2]], L.pointAt(f, L.width / 2 + 2.2, 3.2)];
    const dx = fx * Math.cos(1.0) + lx * Math.sin(1.0), dz = fz * Math.cos(1.0) + lz * Math.sin(1.0);
    return L.frame(pts, { elev: 24, azim: (Math.atan2(dx, dz) * 180) / Math.PI, fov: 30, fill: 0.78 }); };
  // train (gate, Nov 11): a three-quarter chase from above and behind, 32° down, about 60 m of track across, aimed
  // 4 m ahead of him. At 1,256 s (lap 16, Turns 3-4, 19 s after the restart) seven cars run nose to tail within 56 m
  // round him (race.json: -22, -19, -7, 0, +14, +18, +34 m)
  A.train = (s) => { const b = st('9', s), fx = Math.cos(b.yaw), fz = -Math.sin(b.yaw), lx = -Math.sin(b.yaw), lz = -Math.cos(b.yaw), r = 0.6;
    const dx = -fx * Math.cos(r) + lx * Math.sin(r), dz = -fz * Math.cos(r) + lz * Math.sin(r), hf = 2 * Math.atan(Math.tan((28 * Math.PI) / 360) * (rig16x9));
    return { target: [b.pos[0] + fx * 4, b.pos[1] + 0.5, b.pos[2] + fz * 4], D: +(30 / Math.tan(hf / 2)).toFixed(2), elev: 32, azim: (Math.atan2(dx, dz) * 180) / Math.PI, fov: 28 }; };
  A.corkscrew = (s) => { const b = st('9', s); const base = L.poses.corkscrew; return { ...base, target: [b.pos[0] * 0.5 + base.target[0] * 0.5, b.pos[1] * 0.5 + base.target[1] * 0.5, b.pos[2] * 0.5 + base.target[2] * 0.5] }; };
  L.posesAt = A;
  // his last lap (he takes the flag at 3,131.3 s): over the Corkscrew's crest (2,440 m) for ride, mid-drop (2,495 m) for
  // corkscrew, 0.2 s before loop 12 (I9) for wire
  const lastLap = (d) => C.crossing('9', d, C.marks.bryceFinish - 84, C.marks.bryceFinish);
  L.poseSeconds = { train: 1256, ride: +(lastLap(2440) - 0.6).toFixed(2), wire: +(lastLap(L.data.loops[12].d) - 0.2).toFixed(2), corkscrew: +lastLap(2495).toFixed(2), hairpin: C.marks.passOnTrack, finish: 3131.2 };
  console.log('poseSeconds', JSON.stringify(L.poseSeconds));
  for (const k of ['train', 'ride', 'wire']) L.poses[k] = A[k](L.poseSeconds[k]);
}
