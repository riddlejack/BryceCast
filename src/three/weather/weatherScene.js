// weather/weatherScene.js: the race hour's weather on the 3D track model (career round 2, Nov 17 2026).
//
// Jack (Nov 17): "if it was raining that day or sunny or windy … show that naturally on the actual 3D models … for the
// wind, in addition to any subtle blowing of the shrubs, maybe there could just be a little arrow pointing in the
// direction of the wind … part of the 3D viewer." Everything here is laid on the scene trackScene.js built; the film
// rig's world modules (./rig/) are never edited.
//
//   sky      the light: a warm sun with crisp shadows (clear), softer (partly cloudy), a soft diffuse light with no hard
//            shadows and a greyer land (overcast), darker again under rain. The paper desk and the section heat bands
//            are compensated so they keep their exact colours: the weather lands on the model, never on the page's
//            paper or on the data.
//   wet      the asphalt darker, with a soft sheen that moves as the camera turns (a reflection, so it never reads as
//            a stretch of the heat), in faint patches where water would stand.
//   wind     the trees lean and sway downwind, gust fronts rolling across the woods at a pace set by the wind; and one
//            of two markers in the world (switch wx): an ink arrow printed on the paper beside the model ('arrow', the
//            default), or a windsock by the start/finish line ('sock'). Both point the way the air moves, on the
//            model's true north.
//
//   const wx = createWeather(ctx)        ctx: see trackScene.js
//   sun      the sun stands where it stood at the race hour (sun.js, from the venue's latitude and longitude and the
//            source's race hour; switch wxsun=fixed keeps the kit's sun), so a morning race at Barber is lit from the
//            east and an evening one at IMS from low in the west. It is never drawn under 15 degrees (shadows longer
//            than that cross the whole model); the light a low sun loses on level ground is half made up by the sky
//            (the ambient), and the paper and the bands are compensated as for the sky. Cloud still softens it.
//
//   wx.set(weather | null, { take, reduced, sun })    weather: a SceneWeather (src/three/weather/sceneWeather.tsx);
//                                                      sun: 'race' (default) or 'fixed'
//   wx.animating                          true while something moves (sway, the sock's flutter)
//   wx.tick(seconds)                      advance the motion; trackScene renders after it
//   wx.bandComp                           a THREE.Color the band colours are multiplied by
//   wx.windScreen()                       [dx, dy] the downwind ground direction on screen now (unit), or null
//   wx.relayout()                         after a resize (the arrow finds its spot in the new home framing)
//   wx.dispose()
import { THREE, hex } from '../rig/lib/rig.js';
import { KIT, SUN_DIR, labels } from '../rig/shots/brycecast-film/kit.js';
import { solarPosition } from './sun.js';

const ASPHALT = ['45413d'];
const PRESET = {
  //            sun share, ambient share (1 = the kit's calibration), colours, shadow strength and softness
  clear:    { sun: 1.0,  amb: 1.0,  sunCol: '#FFF3E2', ambCol: '#FFFFFF', shadow: 0.62, radius: 3 },
  partly:   { sun: 0.78, amb: 1.12, sunCol: '#FFF7EE', ambCol: '#FBFCFD', shadow: 0.4, radius: 4 },
  overcast: { sun: 0.3,  amb: 1.44, sunCol: '#F6F7F8', ambCol: '#F5F6F8', shadow: 0.1, radius: 8 },
  rain:     { sun: 0.18, amb: 1.44, sunCol: '#F1F3F6', ambCol: '#F0F2F5', shadow: 0.05, radius: 8 },
  storm:    { sun: 0.1,  amb: 1.42, sunCol: '#ECEFF3', ambCol: '#EBEEF2', shadow: 0.03, radius: 8 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createWeather(ctx) {
  const { scene, camera, stage, model, invalidate, cssW, cssH, ribbon, northWorld, getHome, frameBox, latLon = null } = ctx;
  const SUN_MIN_ELEV = 15;
  const sunDir = SUN_DIR.clone();
  let sunNow = null;   // { azimuthDeg, elevationDeg, drawnElevDeg, at } while the race's own sun is drawn
  const sunBase = { color: stage.sun.color.clone(), intensity: stage.sun.intensity, shadow: stage.sun.shadow.intensity, radius: stage.sun.shadow.radius };
  const ambBase = { color: stage.amb.color.clone(), intensity: stage.amb.intensity };
  const ambShare = stage.ambI / Math.PI, sunShare = (stage.sunI * SUN_DIR.y) / Math.PI;
  const deskBase = stage.desk.material.color.clone();
  const bandComp = new THREE.Color(1, 1, 1);

  // the asphalt materials (the rig's ribbons carry an aTrack attribute; laguna's pieces are lambert in the kit's grey)
  const asphalt = [];
  // the tree crowns: instanced, flat-shaded, non-indexed (the merged lobes, or the city's icosahedra)
  const crowns = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.isMeshLambertMaterial && m.color && (o.geometry?.attributes?.aTrack ? o.visible : ASPHALT.includes(m.color.getHexString()))) {
      if (!asphalt.some((a) => a.m === m)) asphalt.push({ m, base: m.color.clone() });
    }
    if (o.isInstancedMesh && m.flatShading && !o.geometry.index && o.castShadow) crowns.push(o);
  });

  // ---------- tree sway: a vertex offset after the instance matrix, scaled by height up the crown ----------
  const swayU = { uTime: { value: 0 }, uLean: { value: 0 }, uSway: { value: 0 }, uWaveK: { value: 0.06 }, uWaveW: { value: 1.5 } };
  const swayMats = [];
  for (const mesh of crowns) {
    const g = mesh.geometry; g.computeBoundingBox();
    const u = { ...swayU, uWind: { value: new THREE.Vector2(1, 0) }, uY0: { value: g.boundingBox.min.y }, uY1: { value: g.boundingBox.max.y } };
    const m = mesh.material;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uLean, uSway, uWaveK, uWaveW, uY0, uY1; uniform vec2 uWind;')
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
            vec2 wxP = instanceMatrix[3].xz;
          #else
            vec2 wxP = vec2(0.0);
          #endif
          {
            float hgt = clamp((transformed.y - uY0) / max(1e-3, uY1 - uY0), 0.0, 1.0);
            float ph = dot(wxP, uWind) * uWaveK - uTime * uWaveW;
            float gust = 0.5 + 0.5 * sin(ph); gust *= gust;
            float flutter = sin(uTime * 4.7 + wxP.x * 0.61 + wxP.y * 1.13 + transformed.x * 2.3) * 0.14;
            mvPosition.xz += uWind * (uLean + uSway * (gust + flutter)) * (0.25 + 0.75 * hgt);
          }
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'wx-sway';
    m.needsUpdate = true;
    swayMats.push({ mesh, u });
  }

  // ---------- the wet sheen: an additive layer over the whole lap, a soft reflection of the sky ----------
  const sheenMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uAmt: { value: 0 }, uSky: { value: new THREE.Color('#D9DEE4') }, uSharp: { value: 10 } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec3 uSun, uSky; uniform float uAmt, uSharp; varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
        float spec = pow(max(dot(R, uSun), 0.0), uSharp);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 1.5);
        float pud = smoothstep(0.5, 0.85, n(vW.xz * 0.045) * 0.65 + n(vW.xz * 0.17) * 0.35);
        float a = uAmt * (0.6 * spec + 0.45 * fres + 0.32 * pud * (0.5 + spec));
        gl_FragColor = vec4(uSky * a, 1.0);
      }`,
    // screen blending: the sheen lifts the dark asphalt and the dark heat steps, and all but leaves the pale ones be,
    // so no colour of the heat washes out to paper
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12, side: THREE.DoubleSide,
  });
  // as wide as the band drawn over the track (wider than the track itself far off, so the sheen reads at the opening
  // view as well as up close); rebuilt when the band is
  let sheen = null, sheenHalf = 0;
  function ensureSheen() {
    const half = Math.max(model.half, ctx.bandHalf ? ctx.bandHalf() : model.half);
    if (sheen && Math.abs(half - sheenHalf) < 1e-3) return;
    if (sheen) { sheen.geometry.dispose(); sheen.geometry = ribbon(0, 1, half, half, model.bandDy + 0.16); }
    else { sheen = new THREE.Mesh(ribbon(0, 1, half, half, model.bandDy + 0.16), sheenMat); sheen.renderOrder = 8; scene.add(sheen); }
    sheenHalf = half;
  }

  // ---------- wind markers ----------
  const span = (() => { const b = frameBox(); return Math.max(b.x1 - b.x0, b.z1 - b.z0); })();
  const marker = new THREE.Group(); marker.visible = false; scene.add(marker);
  let markerKind = null, markerParts = null;
  const T = labels({});
  const inkCol = hex(KIT.ink);

  // the arrow: one flat quad on the paper, drawn as a signed-distance arrow (crisp at any distance), plus its words
  const arrowMat = new THREE.ShaderMaterial({
    uniforms: { uInk: { value: inkCol }, uTime: { value: 0 }, uFlow: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uInk; uniform float uTime, uFlow; varying vec2 vUv;
      float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      float sdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
        vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
        vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0), pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0), pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
        float s = sign(e0.x * e2.y - e0.y * e2.x);
        vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
        return -sqrt(d.x) * sign(d.y);
      }
      void main() {
        // x along the flow 0..1 (tip at 1), y across -0.2..0.2 (the quad is 1 x 0.4 of the arrow's length)
        vec2 p = vec2(vUv.x, (vUv.y - 0.5) * 0.4);
        float shaft = sdSeg(p, vec2(0.04, 0.0), vec2(0.70, 0.0)) - 0.016;
        float head = sdTri(p, vec2(0.98, 0.0), vec2(0.64, 0.105), vec2(0.64, -0.105));
        float d = min(shaft, head);
        float w = fwidth(d) * 0.8;
        float a = 1.0 - smoothstep(-w, w, d);
        // a soft light travelling down the shaft at the wind's pace (the air moving), never brighter than the paper's grey
        float pulse = uFlow > 0.0 ? 0.5 + 0.5 * sin((vUv.x * 2.2 - uTime * uFlow) * 6.2831) : 0.0;
        vec3 col = mix(uInk, vec3(0.62, 0.60, 0.57), 0.32 * pulse * step(vUv.x, 0.70));
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a * 0.88);
      }`,
    transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  const plateMat = new THREE.MeshBasicMaterial({ color: hex(KIT.bg), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  function buildArrow(w) {
    const g = new THREE.Group();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.4).rotateX(-Math.PI / 2), arrowMat);
    quad.renderOrder = 6; g.add(quad);
    // the words in three lengths, longest first: where the paper beside the model is tight (a phone, a stage framed
    // close) a shorter one still sits by the arrow; the caption under the stage always has them in full
    const texts = [];
    const mph = w.windKph !== null ? Math.round(w.windKph / 1.609344) : null;
    const gust = w.gustKph !== null ? Math.round(w.gustKph / 1.609344) : null;
    if (mph !== null) {
      const gusty = gust !== null && gust > mph + 4;
      const all = gusty ? [`Wind ${mph} mph, gusts ${gust}`, `${mph} mph, gusts ${gust}`, `${mph} mph`] : [`Wind ${mph} mph`, `${mph} mph`];
      for (const words of all) {
        const t = T.groundText(words, { size: 1, color: KIT.muted, weight: 450 });
        t.renderOrder = 6; t.visible = false; g.add(t); texts.push(t);
        // the type's own width, without the side room the kit leaves on its texture (0.8 of its pixel size, in caps)
        t.userData.ink = t.userData.width - 1.11;
        // where no paper is free beside the model (a phone's tight stage), the words lie on a small paper plate over
        // its edge, so they still read beside their arrow
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(t.userData.ink + 1.1, 2).rotateX(-Math.PI / 2), plateMat);
        plate.position.y = -0.02; plate.renderOrder = 5; plate.visible = false; t.add(plate); t.userData.plate = plate;
      }
    }
    return { group: g, quad, texts };
  }

  // the windsock: a pole and a striped sock by the start/finish line, at the model's scale (the trees are drawn
  // larger than life too); the sock hangs in still air and stands out level by about 28 km/h
  function buildSock() {
    const H = clamp(span * 0.032, 26, 64), g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.012, H * 0.016, H, 6).translate(0, H / 2, 0), stage.lambert(KIT.fence));
    pole.castShadow = false; g.add(pole);
    const pivot = new THREE.Group(); pivot.position.y = H * 0.97; g.add(pivot);
    const L = H * 0.46, r0 = H * 0.085, r1 = H * 0.04, bands = 5;
    const sock = new THREE.Group(); pivot.add(sock);
    for (let i = 0; i < bands; i++) {
      const a = i / bands, b = (i + 1) / bands, ra = r0 + (r1 - r0) * a, rb = r0 + (r1 - r0) * b;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, L / bands, 14, 1, true).rotateZ(-Math.PI / 2).translate(L * (a + b) / 2, 0, 0),
        stage.lambert(i % 2 ? KIT.kerbWhite : '#E26A2C', { side: THREE.DoubleSide }));
      sock.add(seg);
    }
    return { group: g, pivot, sock, H };
  }

  let weather = null, take = 'arrow', reduced = false, flow = 0, disposed = false;
  const downWorld = new THREE.Vector2(1, 0);
  let hasDir = false;
  let lastPlace = [];   // the placement's tries, for headless checks

  // ---------- where the arrow lies: free paper in the home framing, clear of the slab and of the stage's buttons ----------
  const v3 = new THREE.Vector3(), scratch = new THREE.PerspectiveCamera(25, 1, 0.1, 1e6);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), hitV = new THREE.Vector3();
  // home: the opening view (the arrow always shows there); a turned or zoomed view (strict): the arrow moves to clear
  // paper in that view, or steps out of it where the model fills the frame
  function placeArrow(home = getHome(), strict = false) {
    if (!markerParts?.quad) return;
    const W = cssW(), Hh = cssH();
    scratch.aspect = W / Hh; ctx.applyPose(scratch, home);
    const proj = (p) => { v3.set(p[0], p[1], p[2]).project(scratch); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * Hh]; };
    const polys = ctx.silhouettes().map((ring) => ring.map(proj));
    const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const mpp = (2 * home.D * Math.tan((25 * Math.PI) / 360)) / Hh;
    const phone = W < 560;
    // how the downwind direction lies on screen in this view: the arrow's height on screen per pixel of its length,
    // so the words sit just under its lowest point whichever way it points
    const c0 = proj([ctx.centre[0], 0.3, ctx.centre[2]]), c1 = proj([ctx.centre[0] + downWorld.x * 100, 0.3, ctx.centre[2] + downWorld.y * 100]);
    const sy = Math.abs(c1[1] - c0[1]) * mpp / 100, sx = Math.abs(c1[0] - c0[0]) * mpp / 100;
    const top = Math.max(22, Hh * 0.06);
    // the arrow with its words (a little shorter if it must be), and only where no words fit at all, the arrow alone;
    // on a phone the words are smaller but never under 12 px type
    const capPx = phone ? 9 : 11.5;
    const tries = [];
    for (const tx of markerParts.texts) tries.push({ text: tx, k: 1 }, { text: tx, k: 0.72 });
    for (const tx of markerParts.texts) tries.push({ text: tx, k: 0.72, plate: true });
    tries.push({ text: null, k: 1 }, { text: null, k: 0.72 });
    let best = null, showText = null, showPlate = false, lenPx = 0;
    lastPlace = [];
    for (const t of tries) {
      const len = clamp(W * 0.085, phone ? 40 : 54, 128) * t.k * (0.62 + 0.38 * clamp((weather?.windKph ?? 0) / 30, 0, 1)), rch = len * 0.56;
      // (with a little to spare: the head is wider than the shaft and the near end is drawn larger)
      const halfH = 1.15 * (0.5 * len * sy + 0.11 * len * Math.max(0.3, sx)), halfX = 1.15 * (0.5 * len * sx + 0.11 * len);
      const tw = t.text ? t.text.userData.ink * capPx + (t.plate ? 14 : 10) : 0;
      // the words under the arrow, else above it, else beside it: always next to it, never across the picture
      // (under or above: centred on it, or flush with its left or right end where a corner is tight)
      const below = halfH + 5 + capPx * 0.75, flush = Math.max(0, tw / 2 - halfX);
      const offs = t.text
        ? [[0, below, 0], [-flush, below, 0.2], [flush, below, 0.2], [0, -below, 0.4], [-flush, -below, 0.5], [flush, -below, 0.5],
          [halfX + 8 + tw / 2, 0, 0.8], [-(halfX + 8 + tw / 2), 0, 0.8]]
        : [[0, 0, 0]];
      let found = null;
      for (let gy = 0; gy <= 14; gy++) for (let gx = 0; gx <= 18; gx++) {
        const x = W * (0.04 + 0.92 * gx / 18), y = Hh * (0.06 + 0.86 * gy / 14);
        let ring = 0;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * rch, py = y + Math.sin(a) * rch;
          for (const P of polys) if (inPoly(px, py, P)) ring++;
        }
        for (const P of polys) if (inPoly(x, y, P)) ring += 6;
        for (const [ox, oy, pref] of offs) {
          const cx = x + ox, cy = y + oy, th = t.text ? capPx * 0.8 : 0;
          const x0 = Math.min(x - halfX, cx - tw / 2), x1 = Math.max(x + halfX, cx + tw / 2);
          const y0 = Math.min(y - halfH, cy - th), y1 = Math.max(y + halfH, cy + th);
          if (x1 > W - 12 || x0 < 12 || y0 < top || y1 > Hh - 10) continue;
          // the buttons sit in the bottom right corner
          if (x1 > W - (phone ? 150 : 230) && y1 > Hh - 64) continue;
          let clash = ring;
          // words on a plate may lie over the model's edge; it still costs a little, so the plate covers as little as it can
          let over = 0;
          if (t.text) for (let k = -4; k <= 4; k++) for (const dy of [-0.7, 0, 0.7]) for (const P of polys) if (inPoly(cx + (k * tw) / 8, cy + dy * capPx, P)) over++;
          if (t.plate) { if (over > 40) continue; } else clash += 2 * over;
          // the top right first (where a map keeps its north arrow), then nearer the model; words under the arrow first
          const score = clash * 10 + (t.plate ? over * 0.05 : 0) + (1 - x / W) * 0.6 + (y / Hh) * 0.8 + pref;
          if (!found || score < found.score) found = { score, x, y, clash, ox, oy };
        }
      }
      lastPlace.push(found ? { text: t.text?.userData.width ?? 0, plate: Boolean(t.plate), k: t.k, x: Math.round(found.x), y: Math.round(found.y), clash: found.clash, ox: Math.round(found.ox), oy: Math.round(found.oy) } : { text: t.text?.userData.width ?? 0, k: t.k, none: true });
      if (found && (!best || found.score < best.score - (best.clash === 0 ? 0 : 5))) { best = found; showText = t.text; showPlate = Boolean(t.plate); lenPx = len; }
      if (found && found.clash === 0) break;
    }
    if (!best || (strict && best.clash > 0)) { if (strict) markerParts.group.visible = false; return; }
    markerParts.group.visible = true;
    // the spot, the arrow's length and the words' size from where it lands: nearer the camera a metre is more pixels
    const hit = (x, y) => { ndc.set((x / W) * 2 - 1, -(y / Hh) * 2 + 1); ray.setFromCamera(ndc, scratch); return ray.ray.intersectPlane(deskPlane, new THREE.Vector3()); };
    const at = hit(best.x, best.y);
    if (!at) return;
    const local = mpp * (scratch.position.distanceTo(at) / home.D);
    const az = (home.azim * Math.PI) / 180;
    markerParts.group.position.set(at.x, 0.3, at.z);
    const L = lenPx * local;
    markerParts.quad.scale.set(L, 1, L);
    markerParts.quad.rotation.y = Math.atan2(-downWorld.y, downWorld.x);   // the quad's +x onto the downwind direction
    for (const tx of markerParts.texts) { tx.visible = false; tx.userData.plate.visible = false; }
    if (showText) {
      const under = hit(best.x + best.ox, best.y + best.oy);
      showText.visible = Boolean(under); showText.userData.plate.visible = showPlate;
      // on its plate the words lie over the model's edge: drawn over the slab's rim and trees, never cut by them
      for (const m of [showText.material, plateMat]) if (m.depthTest === showPlate) { m.depthTest = !showPlate; m.needsUpdate = true; }
      if (under) {
        // upright on screen wherever it lies: the baseline along the camera's right (level on screen everywhere), and
        // the letters' up along the ground line that the camera sees as vertical at that point, so they never lean
        // like italics toward the middle of the picture
        const s = capPx * mpp * (scratch.position.distanceTo(under) / home.D);   // capPx: chosen above with the spot
        const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
        const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
        const camUp = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 1);
        const rayDir = under.clone().sub(scratch.position).normalize();
        const g = new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(camUp, rayDir), new THREE.Vector3(0, 1, 0));
        const along = g.dot(fwd);
        // a low camera squashes type lying on the ground; it is drawn a little taller to read at its natural shape
        // from the opening view (part way: turned to look straight down, it is never much stretched)
        const tall = Math.pow(1 / Math.max(0.35, -rayDir.y), 0.6);
        const up = Math.abs(along) > 1e-3 ? g.multiplyScalar(tall / along) : fwd.clone().multiplyScalar(tall);
        const t = showText;
        t.matrixAutoUpdate = false;
        t.matrix.makeBasis(right.multiplyScalar(s), new THREE.Vector3(0, 1, 0), up.multiplyScalar(-s));
        t.matrix.setPosition(under.x - at.x, 0, under.z - at.z);
        t.matrixWorldNeedsUpdate = true;
      }
    }
  }
  function placeSock() {
    if (!markerParts?.pivot) return;
    const lat = model.half + 16, p = model.at(0.012, lat, 0), q = model.at(0.012, -lat, 0);
    // the side of the line that stands lower on screen is usually the paddock side seen from home; either is fine,
    // pick the one farther from the slab's middle so the sock stands on open ground
    const c = ctx.centre;
    const pick = Math.hypot(p[0] - c[0], p[2] - c[2]) > Math.hypot(q[0] - c[0], q[2] - c[2]) ? p : q;
    markerParts.group.position.set(pick[0], pick[1] - 0.6, pick[2]);
  }

  function clearMarker() {
    if (!markerParts) return;
    markerParts.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== arrowMat && o.material !== plateMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    marker.remove(markerParts.group); markerParts = null; markerKind = null;
  }

  // the printed words use the site's face; until it has loaded, the canvas would print a fallback, so the arrow is
  // built again once it has
  const FACE = '450 128px "Schibsted Grotesk"';
  let fontWait = null;
  const fontReady = () => { try { return document.fonts.check(FACE); } catch { return true; } };

  function set(w, opts = {}) {
    weather = w; take = opts.take ?? 'arrow'; reduced = Boolean(opts.reduced);
    const sunMode = opts.sun ?? 'race';
    if (w && !fontReady() && !fontWait) {
      fontWait = document.fonts.load(FACE).catch(() => null).then(() => { if (!disposed && weather === w && markerKind === 'arrow') set(w, opts); });
    }
    const P = PRESET[w?.sky] ?? null;
    // light
    const sun = stage.sun, amb = stage.amb;
    if (!P) {
      sun.color.copy(sunBase.color); sun.intensity = sunBase.intensity; sun.shadow.intensity = sunBase.shadow; sun.shadow.radius = sunBase.radius;
      amb.color.copy(ambBase.color); amb.intensity = ambBase.intensity;
    } else {
      sun.color.copy(hex(P.sunCol)); sun.intensity = sunBase.intensity * P.sun; sun.shadow.intensity = P.shadow; sun.shadow.radius = P.radius;
      amb.color.copy(hex(P.ambCol)); amb.intensity = ambBase.intensity * P.amb;
    }
    // the race hour's sun: its bearing on the model's true north, its height (never under SUN_MIN_ELEV for the look)
    sunNow = null; sunDir.copy(SUN_DIR);
    if (P && sunMode !== 'fixed' && w?.raceAt && latLon) {
      const pos = solarPosition(latLon[0], latLon[1], w.raceAt.utcMs);
      if (pos.elevationDeg > 0) {
        const drawn = Math.max(SUN_MIN_ELEV, pos.elevationDeg), el = (drawn * Math.PI) / 180, az = (pos.azimuthDeg * Math.PI) / 180;
        const [nx, nz] = northWorld, ex = -nz, ez = nx;
        const hx = nx * Math.cos(az) + ex * Math.sin(az), hz = nz * Math.cos(az) + ez * Math.sin(az);
        sunDir.set(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
        sunNow = { azimuthDeg: +pos.azimuthDeg.toFixed(1), elevationDeg: +pos.elevationDeg.toFixed(1), drawnElevDeg: +drawn.toFixed(1), at: w.raceAt.local, zone: w.raceAt.zone };
      }
    }
    const tgt = sun.target.position, dist = sun.position.distanceTo(tgt) || 1000;
    sun.position.set(tgt.x + sunDir.x * dist, tgt.y + sunDir.y * dist, tgt.z + sunDir.z * dist);
    sun.updateMatrixWorld();
    // what a level surface loses of the sun when it stands lower than the kit's: half of it comes back from the sky
    const lowK = sunDir.y / SUN_DIR.y;
    // (a sun higher than the kit's gives level ground more; the sky gives that much less, so a clear noon stays the kit's)
    const lost = sunShare * (1 - lowK) * (sun.intensity / sunBase.intensity);
    amb.intensity += ambBase.intensity * ((lost > 0 ? 0.5 * lost : lost) / ambShare);
    // what a level surface now shows of its colour, per channel; the paper and the bands are divided by it
    const f = new THREE.Color(
      amb.color.r * ambShare * (amb.intensity / ambBase.intensity) + sun.color.r * sunShare * lowK * (sun.intensity / sunBase.intensity),
      amb.color.g * ambShare * (amb.intensity / ambBase.intensity) + sun.color.g * sunShare * lowK * (sun.intensity / sunBase.intensity),
      amb.color.b * ambShare * (amb.intensity / ambBase.intensity) + sun.color.b * sunShare * lowK * (sun.intensity / sunBase.intensity));
    bandComp.setRGB(1 / f.r, 1 / f.g, 1 / f.b);
    stage.desk.material.color.copy(deskBase).multiply(bandComp);
    // wet asphalt
    const wet = Boolean(w?.wet);
    const wetK = !wet ? 0 : w.sky === 'storm' || w.sky === 'rain' ? clamp(0.55 + (w.rainIntensity ?? 0.4) * 0.45, 0.55, 1) : 0.45;
    for (const a of asphalt) a.m.color.copy(a.base).multiplyScalar(1 - 0.3 * wetK);
    if (wet) {
      ensureSheen(); sheen.visible = true;
      // the bright sky the wet track mirrors: set where the opening view sees its reflection mid-model, so the sheen
      // lies on the far stretches at first and slides along the track as the camera turns
      const h = getHome(), az = (h.azim * Math.PI) / 180, el = (Math.min(h.elev + 6, 80) * Math.PI) / 180;
      sheenMat.uniforms.uSun.value.set(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      sheenMat.uniforms.uAmt.value = 0.3 + 0.2 * wetK; sheenMat.uniforms.uSharp.value = 5;
    }
    else if (sheen) sheen.visible = false;
    // wind
    const kph = w?.windKph ?? 0, gustK = clamp(((w?.gustKph ?? kph) - kph) / 30, 0, 1);
    hasDir = Boolean(w && w.windFromDeg !== null && kph >= 3);
    if (hasDir) {
      const b = ((w.windFromDeg + 180) * Math.PI) / 180, [nx, nz] = northWorld, ex = -nz, ez = nx;
      downWorld.set(nx * Math.cos(b) + ex * Math.sin(b), nz * Math.cos(b) + ez * Math.sin(b)).normalize();
    }
    const k = clamp(kph / 40, 0, 1);
    swayU.uLean.value = hasDir ? 0.7 * k : 0;
    swayU.uSway.value = hasDir && !reduced ? (0.35 + 0.6 * gustK) * k : 0;
    swayU.uWaveW.value = 0.9 + 1.6 * k;
    const inv = new THREE.Matrix4();
    for (const { mesh, u } of swayMats) {
      mesh.updateMatrixWorld(); inv.copy(mesh.matrixWorld).invert();
      const d = new THREE.Vector3(downWorld.x, 0, downWorld.y).transformDirection(inv);
      u.uWind.value.set(d.x, d.z).normalize();
    }
    flow = hasDir && !reduced ? 0.25 + 0.9 * k : 0;
    arrowMat.uniforms.uFlow.value = flow;
    // the marker
    const wantKind = hasDir && take !== 'off' ? (take === 'sock' ? 'sock' : 'arrow') : null;
    clearMarker();
    if (wantKind === 'arrow') { markerParts = buildArrow(w); marker.add(markerParts.group); placeArrow(); }
    else if (wantKind === 'sock') { markerParts = buildSock(); marker.add(markerParts.group); placeSock(); }
    markerKind = wantKind; marker.visible = Boolean(wantKind);
    if (markerKind === 'sock') poseSock(0);
    ctx.shadowsDirty();
    invalidate();
  }

  function poseSock(t) {
    if (!markerParts?.pivot) return;
    const kph = weather?.windKph ?? 0, k = clamp(kph / 28, 0, 1);
    const yaw = Math.atan2(-downWorld.y, downWorld.x);
    const flut = reduced ? 0 : Math.sin(t * (3 + 5 * k)) * 0.06 * k + Math.sin(t * 7.3) * 0.03 * k;
    const droop = (1 - k) * 1.25 + (reduced ? 0 : Math.sin(t * 2.1) * 0.05 * k);
    markerParts.pivot.rotation.set(0, yaw + flut, 0);
    markerParts.sock.rotation.set(0, 0, -droop);
  }

  return {
    set,
    get animating() { return Boolean(weather) && !reduced && (swayU.uSway.value > 0 || flow > 0 || markerKind === 'sock'); },
    tick(t) { swayU.uTime.value = t; arrowMat.uniforms.uTime.value = t; if (markerKind === 'sock') poseSock(t); },
    bandComp,
    windScreen() {
      if (!hasDir) return null;
      const c = model.at(0.25, 0, 0);
      const a = new THREE.Vector3(c[0], c[1], c[2]).project(camera), b = new THREE.Vector3(c[0] + downWorld.x * 50, c[1], c[2] + downWorld.y * 50).project(camera);
      const dx = (b.x - a.x) * cssW(), dy = -(b.y - a.y) * cssH(), l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    },
    relayout() { if (markerKind === 'arrow') placeArrow(); },
    // the band over the track changed width (zoom): the sheen follows it
    bandChanged() { if (sheen && sheen.visible) { ensureSheen(); invalidate(); } },
    // after the camera settles: keep the arrow in view, on clear paper (it stays where it lies while it is)
    settled(pose, atHome) {
      if (markerKind !== 'arrow' || !markerParts) return;
      if (atHome) { placeArrow(); return; }
      const W = cssW(), Hh = cssH(), p = markerParts.group.position;
      v3.set(p.x, p.y, p.z).project(camera);
      const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * Hh;
      let clear = markerParts.group.visible && v3.z < 1 && x > 40 && x < W - 40 && y > 30 && y < Hh - 30;
      if (clear) {
        const inPoly = (px, py, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; };
        const polys = ctx.silhouettes().map((ring) => ring.map((q) => { v3.set(q[0], q[1], q[2]).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * Hh]; }));
        clear = !polys.some((P) => inPoly(x, y, P));
      }
      if (!clear) placeArrow(pose, true);
    },
    dispose() {
      disposed = true; clearMarker(); arrowMat.dispose(); plateMat.dispose(); sheenMat.dispose(); if (sheen) sheen.geometry.dispose();
    },
    info: () => ({ place: lastPlace, sun: sunNow, sky: weather?.sky ?? null, wet: Boolean(weather?.wet), marker: markerKind, down: hasDir ? [downWorld.x, downWorld.y] : null,
      markerAt: markerParts ? markerParts.group.position.toArray() : null, crowns: crowns.length, asphalt: asphalt.length }),
  };
}
