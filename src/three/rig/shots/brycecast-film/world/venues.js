// world/venues.js — neighbour models (builder B): a smaller, plainer version of the hero model for any venue whose
// data V8/tools/osm_venue.py has built (data/venue-<slug>.json; Road America first). A slab cut to an organic outline
// about 170 m outside the track, its real relief (AWS Terrain Tiles / USGS 3DEP, exaggerated x2 as the hero's), the
// real outline at real width from OSM (12 m asphalt, fine white edge lines), woods as sparse low-poly trees, OSM
// buildings as plain blocks, a soft contact shadow on the desk, and a field of cars lapping.
//
// Frame: metres, true scale; centred on the circuit's bounding box, the desk at y = 0, north toward -z.
//
// API
//   loadVenue(url) -> Promise<data>                       e.g. new URL('../data/venue-road-america.json', import.meta.url)
//   createVenue(rig, data, opts?) -> venue                opts: { ve = 2, base = 24 (m of slab under the lowest point),
//                                                          cars = 24, lapTime = 128 (s, drawn), bryce = 9 (index; -1
//                                                          none), parent = rig.scene, spread = 0.7 (the share of a lap
//                                                          the field is strung over; drawn), carColor (the cars' bodies;
//                                                          default the kit's car grey; a light one reads on the asphalt
//                                                          close up) }
//     venue.group, venue.footprint {w, d, x0, z0, x1, z1}  the slab's size (metres) and its extent in the model frame
//     venue.outline                                       the slab's edge [[x, z], ...] (north up, x east)
//     venue.frontEdge                                     [[x, y, z], ...]: the top edge of the slab's +z face (the side
//                                                          the home camera sees), for the lap rule in b06
//     venue.backEdge                                      the same along the -z face (seen from a camera looking up the row)
//     venue.heightAt(x, z)                                y of the slab's top there
//     venue.lapTime, venue.lapAt(t)                       laps the leader has completed at race second t (drawn pace)
//     venue.circuit {at(s), length}                       the centreline by arc length from the start/finish line
//     venue.setGaps(g)                                     the field by hand: car i g[i] m behind (b06's bunches)
//     venue.carPos[i] [x, y, z]                           car i after the last set(); venue.bryce its index (gold)
//     venue.set(t, { stopAt = null, ghost = 0, alpha = 1 })
//        t: race seconds (cars lap at the drawn pace from a strung-out field at t = 0)
//        stopAt: race second at which the cars stop where they are (the recording stopped): for t >= stopAt the
//                field holds its places at stopAt; null = running
//        ghost 0..1: the cars as faint pale see-through cars (b06: "the recording stopped" -> ghost 1; the saved
//                minutes -> ghost 0 again, set t on to the saved laps)
//        alpha: the whole field's strength
// Drawn, not data: lap time (128 s), the cars' spacing and side-to-side placement; the field size (24) is career.json's
// Road America 2026 races. Start/finish: OSM has no start/finish node at Road America; the line is put beside the
// middle of OSM's pit lane (approximate).
import { THREE, hex, hash01, lerp } from '../../../lib/rig.js';
import { KITB, arcSampler, trackRibbon, carField } from './city.js';
import { KIT } from '../kit.js';

export async function loadVenue(url) { return (await fetch(url)).json(); }

export function createVenue(rig, data, opts = {}) {
  const { ve = 2, base = 9, cars: nCars = 24, lapTime = 128, bryce = 9, spread = 0.7, carColor } = opts;   // ve and base as the hero's (laguna.json exag 2, slabT 9)
  const group = new THREE.Group(); group.name = 'venue:' + data.meta.slug; (opts.parent || rig.scene).add(group);
  const G = data.terrain, nx = G.nx, nz = G.nz, H = G.h;
  const hAt = (x, z) => {   // bilinear, metres above the lowest point
    const fx = Math.min(nx - 1.001, Math.max(0, (x - G.x0) / G.step)), fz = Math.min(nz - 1.001, Math.max(0, (z - G.z0) / G.step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  const O = data.outline;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of O) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  // the lowest point inside the slab sits `base` m above the desk
  let hmin = 1e9; for (const [x, z] of O) hmin = Math.min(hmin, hAt(x, z));
  for (const [x, z] of data.circuit.pts) hmin = Math.min(hmin, hAt(x, z));
  const heightAt = (x, z) => base + (hAt(x, z) - hmin) * ve;

  // ----- the top: a 10 m heightfield, painted (land, woods tint, water), cut to the outline by its alpha -----
  const PX = 1.5, TW = Math.ceil((x1 - x0) * PX), TH = Math.ceil((z1 - z0) * PX);
  const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
  const g = cv.getContext('2d');
  const T = (x, z) => [(x - x0) * PX, (z - z0) * PX];
  const poly = (r) => { g.beginPath(); r.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); };
  // the hero's ground (world/laguna.js): pale green land, paddock grey round the buildings, gravel traps, water
  poly(O); g.fillStyle = KIT.landTint; g.fill();
  g.save(); poly(O); g.clip();
  g.fillStyle = KIT.paddock; g.filter = `blur(${Math.round(8 * PX)}px)`;
  for (const b of data.buildings) { const c = b.p.reduce((a, q) => [a[0] + q[0] / b.p.length, a[1] + q[1] / b.p.length], [0, 0]); const [a, bb] = T(c[0], c[1]);
    g.beginPath(); g.arc(a, bb, (b.kind === 'stands' ? 14 : 22) * PX, 0, Math.PI * 2); g.fill(); }
  g.filter = 'none';
  g.fillStyle = KIT.gravel; for (const w of data.gravel || []) { poly(w); g.fill(); }
  g.fillStyle = KIT.water; for (const w of data.water || []) { poly(w); g.fill(); }
  g.restore();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  const gx = Math.ceil((x1 - x0) / 10) + 1, gz = Math.ceil((z1 - z0) / 10) + 1;
  const P = new Float32Array(gx * gz * 3), UV = new Float32Array(gx * gz * 2), I = [];
  for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) {
    const x = Math.min(x1, x0 + i * 10), z = Math.min(z1, z0 + j * 10), k = j * gx + i;
    P.set([x, heightAt(x, z), z], k * 3); UV.set([(x - x0) / (x1 - x0), 1 - (z - z0) / (z1 - z0)], k * 2);
    if (i < gx - 1 && j < gz - 1) I.push(k, k + gx, k + 1, k + 1, k + gx, k + gx + 1);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(P, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); tg.setIndex(I);
  tg.computeVertexNormals();
  const top = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 }));
  top.receiveShadow = true; group.add(top);

  // ----- the cut faces down the outline -----
  {
    const Pw = [], Nw = [];
    const n = O.length;
    let ar = 0; for (let i = 0; i < n; i++) { const a = O[i], b = O[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
    const sg = ar > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = O[i], b = O[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.01) continue;
      const nn = [-sg * dz / l, 0, sg * dx / l];   // outward
      const ya = heightAt(a[0], a[1]), yb = heightAt(b[0], b[1]);
      const A0 = [a[0], 0, a[1]], B0 = [b[0], 0, b[1]], A1 = [a[0], ya, a[1]], B1 = [b[0], yb, b[1]];
      // wind each triangle so its geometric normal agrees with nn
      const tri = (p, q, r) => {
        const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
        const cx = uy * vz - uz * vy, cz = ux * vy - uy * vx;
        if (cx * nn[0] + cz * nn[2] < 0) [q, r] = [r, q];
        Pw.push(...p, ...q, ...r); Nw.push(...nn, ...nn, ...nn);
      };
      tri(A0, B0, B1); tri(A0, B1, A1);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(Pw, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(Nw, 3));
    const walls = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: hex(KITB.cut), side: THREE.DoubleSide }));
    walls.castShadow = true; walls.receiveShadow = true; group.add(walls);
  }
  // a contact shadow on the desk as the hero's: a wide soft layer (about 40 m) and a firm one at the foot (about 7 m)
  {
    const pad = 120, sx0 = x0 - pad, sz0 = z0 - pad, sx1 = x1 + pad, sz1 = z1 + pad;
    const R = 1024, sc = document.createElement('canvas'); sc.width = R; sc.height = Math.round(R * (sz1 - sz0) / (sx1 - sx0));
    const h = sc.getContext('2d'), k = sc.width / (sx1 - sx0);
    h.fillStyle = '#000'; h.fillRect(0, 0, sc.width, sc.height); h.globalCompositeOperation = 'lighter';
    const shape = (blurM, a) => { h.filter = `blur(${Math.max(1, Math.round(blurM * k))}px)`; h.fillStyle = `rgba(255,255,255,${a})`; h.beginPath();
      O.forEach(([x, z], i) => (i ? h.lineTo((x - sx0) * k, (z - sz0) * k) : h.moveTo((x - sx0) * k, (z - sz0) * k))); h.closePath(); h.fill(); };
    shape(40, 0.45); shape(7, 0.55);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.NoColorSpace;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(sx1 - sx0, sz1 - sz0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: st, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.position.set((sx0 + sx1) / 2, 0.05, (sz0 + sz1) / 2); sh.renderOrder = -5; group.add(sh);
  }

  // ----- track, pit lane, trees, buildings -----
  const C = data.circuit, arc = arcSampler(C.pts);
  const ribbon = trackRibbon(C.pts, { width: C.widthM, heightAt, lift: 0.6 });
  ribbon.material.polygonOffset = true; ribbon.material.polygonOffsetFactor = -2; ribbon.material.polygonOffsetUnits = -2;
  group.add(ribbon);
  if (data.pit) {
    const pit = trackRibbon(data.pit, { width: 7, closed: false, heightAt, lift: 0.5, lines: false, sf: false });
    pit.material.polygonOffset = true; pit.material.polygonOffsetFactor = -2; pit.material.polygonOffsetUnits = -2;
    group.add(pit);
  }
  // trees as the hero's: a crown of three overlapping lobes on a short trunk, KIT.tree to KIT.treeDark. OSM's woods are
  // dense (9 m); `treesDrawn` are scattered single trees elsewhere (drawn, as the hero's trees are)
  {
    const pts = data.trees.concat(data.treesDrawn || []), n = pts.length;
    const merge = (geos) => { const P = [], N = []; for (const q of geos) { const g2 = q.toNonIndexed(); g2.computeVertexNormals(); P.push(...g2.attributes.position.array); N.push(...g2.attributes.normal.array); }
      const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return m; };
    const crown = merge([new THREE.IcosahedronGeometry(0.78, 1).translate(0, 0.05, 0), new THREE.IcosahedronGeometry(0.58, 1).translate(0.5, -0.12, 0.18), new THREE.IcosahedronGeometry(0.55, 1).translate(-0.42, -0.08, -0.25)]);
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1, 5).translate(0, 0.5, 0);
    const cm = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
    const tm = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: hex('#8A7B66'), flatShading: true }), n);
    const o = new THREE.Object3D(), c = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const y = heightAt(x, z), r = 3.6 + 2.6 * hash01(i, 3), hh = 2.6 + 1.4 * hash01(i, 5);
      o.position.set(x, y - 0.2, z); o.rotation.set(0, hash01(i, 7) * 6.28, 0); o.scale.set(1, hh + 0.4, 1); o.updateMatrix(); tm.setMatrixAt(i, o.matrix);
      o.position.set(x, y + hh + r * 0.7, z); o.scale.set(r * (1 + 0.15 * hash01(i, 9)), r * 0.85, r); o.updateMatrix(); cm.setMatrixAt(i, o.matrix);
      c.copy(hex(KIT.tree)).lerp(hex(KIT.treeDark), hash01(i, 11)); cm.setColorAt(i, c);
    });
    cm.castShadow = true; cm.receiveShadow = true; tm.castShadow = true; group.add(cm, tm);
  }
  if (data.buildings.length) {
    const Pb = [], Nb = [];
    const push = (p, q, r, n) => { Pb.push(...p, ...q, ...r); Nb.push(...n, ...n, ...n); };
    const inO = ([x, z]) => {   // inside the slab's outline (even-odd)
      let c = false;
      for (let i = 0, j = O.length - 1; i < O.length; j = i++) {
        const [xi, zi] = O[i], [xj, zj] = O[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    for (const b of data.buildings) {
      if (!b.p.every(inO)) continue;   // a building the slab's edge cuts is left out (it would hang over the cut)
      const r = b.p; let yb = 1e9; for (const [x, z] of r) yb = Math.min(yb, heightAt(x, z));
      const y1 = yb + b.h;
      const contour = r.map(([x, z]) => new THREE.Vector2(x, z));
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
        const A = [r[i][0], y1, r[i][1]], B = [r[j][0], y1, r[j][1]], Cc = [r[k][0], y1, r[k][1]];
        const cy = (B[2] - A[2]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[2] - A[2]);
        cy > 0 ? push(A, B, Cc, [0, 1, 0]) : push(A, Cc, B, [0, 1, 0]);
      }
      const sgn = (() => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length]; s += a[0] * c[1] - c[0] * a[1]; } return s > 0 ? 1 : -1; })();
      for (let i = 0; i < r.length; i++) {
        const a = r[i], c = r[(i + 1) % r.length], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.01) continue;
        const n = [sgn * dz / l, 0, -sgn * dx / l];
        const A0 = [a[0], yb - 2, a[1]], C0 = [c[0], yb - 2, c[1]], A1 = [a[0], y1, a[1]], C1 = [c[0], y1, c[1]];
        // winding so that the face's normal is n
        const cr = (p, q, s) => { const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
        const t1 = cr(A0, C0, C1); const ok = t1[0] * n[0] + t1[2] * n[2] > 0;
        if (ok) { push(A0, C0, C1, n); push(A0, C1, A1, n); } else { push(A0, C1, C0, n); push(A0, A1, C1, n); }
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(Pb, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(Nb, 3));
    const bm = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: hex(KITB.building) }));
    // no sun shadow from the blocks: at close range it lay as a grey smear on the pale ground (the gate's rule, Nov 11
    // 04:15: soft contact shadows only)
    bm.castShadow = false; bm.receiveShadow = true; group.add(bm);
  }

  // ----- cars -----
  const field = carField(nCars, { bryce, heightAt: (x, z) => heightAt(x, z) + 0.6, ...(carColor ? { bodyCol: carColor } : {}) });
  group.add(field.mesh);
  const gaps = []; { let s = 0; for (let i = 0; i < nCars; i++) { gaps.push(s); s += 30 + 120 * hash01(i, 31); } const k = arc.length * spread / gaps[nCars - 1]; for (let i = 0; i < nCars; i++) gaps[i] *= k; }
  const side = Array.from({ length: nCars }, (_, i) => (hash01(i, 32) - 0.5) * 4.0);
  const v = arc.length / lapTime;
  const carPos = Array.from({ length: nCars }, () => [0, 0, 0]);   // where each car is after set(): [x, y, z]
  function set(t, { stopAt = null, ghost = 0, alpha = 1 } = {}) {
    const tt = stopAt != null && t > stopAt ? stopAt : t;
    for (let i = 0; i < nCars; i++) {
      const s = arc.length - gaps[i] + v * tt;
      const [x, z, hd] = arc.at(s), [, , hd2] = arc.at(s + 3);
      let dh = hd2 - hd; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
      const hh = hd + dh / 2, nx2 = -Math.sin(hh), nz2 = Math.cos(hh);
      const px = x + nx2 * side[i], pz = z + nz2 * side[i];
      field.place(i, px, pz, hh); carPos[i][0] = px; carPos[i][1] = heightAt(px, pz); carPos[i][2] = pz;
    }
    field.update(rig.camera, rig.height); field.style({ ghost, alpha });   // call set after the camera is placed
  }
  // the top edge of the +z face, as the home camera sees it: for each x, the outline's southernmost point
  const frontEdge = [];
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) {
    let zb = -1e9;
    for (let i = 0; i < O.length; i++) {
      const a = O[i], b = O[(i + 1) % O.length];
      if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
      const z = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); zb = Math.max(zb, z);
    }
    if (zb > -1e9) frontEdge.push([x, heightAt(x, zb), zb]);
  }
  // and of the -z face (the side a camera looking +z, up the row from home, sees first): the northernmost point
  const backEdge = [];
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) {
    let zt = 1e9;
    for (let i = 0; i < O.length; i++) {
      const a = O[i], b = O[(i + 1) % O.length];
      if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
      zt = Math.min(zt, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
    }
    if (zt < 1e9) backEdge.push([x, heightAt(x, zt), zt]);
  }
  set(0);
  return { group, footprint: { w: x1 - x0, d: z1 - z0, x0, z0, x1, z1 }, outline: O, frontEdge, backEdge, heightAt, lapTime,
    lapAt: (t) => Math.max(0, Math.floor(v * t / arc.length)),   // the leader (car 0) crosses the line at t = 0
    circuit: arc, set, data, field, carPos, bryce,
    // setGaps(g): place the field by hand: g[i] metres behind the leader's line for car i (all at the drawn pace)
    setGaps(g) { for (let i = 0; i < nCars; i++) gaps[i] = g[i]; } };
}
