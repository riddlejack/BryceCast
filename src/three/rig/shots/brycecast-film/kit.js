// kit.js — the BryceCast film's kit (builder A): colours, type, the desk and its light, label helpers.
//
// API
//   KIT {bg, ink, muted, bryce, car, clay, asphalt, land, cut, grass, landTint, tree, treeDark, water, building, line,
//        kerbWhite, gravel, fence}                        SPEC "Kit"; SHADES[1..5] the site's five rank buckets
//   FONT, LABEL_PX (34), NUM_PX (34)                     Schibsted Grotesk; labels 400, numerals 500 tabular
//   createStage(rig) -> stage                            the paper desk (y = 0, infinite to the eye), a soft sun with
//                                                        shadows and an ambient; shared by every world module
//     stage.fitShadow(target [x,y,z], size)             fit the sun's shadow box round `target`, `size` metres across
//                                                        (call once per frame from the camera's pose: crisp car shadows
//                                                        close up, the whole slab's shadow wide)
//     stage.sun, stage.desk, stage.lambert(color, opts) one Lambert material calibrated so a level surface in full sun
//                                                        shows its colour exactly (the paper stays #FDFCFA)
//   labels(rig) -> { label, num, box, groundText }
//     label(text, [x, y], {alpha, color, align, base, px, weight})   overlay type (screen-facing; only Bryce's pin and
//                                                        the window's bar labels use it, by the gate's rule)
//     num(...)                                           numerals, hand-set tabular figures
//     groundText(text, {size, color, weight}) -> Mesh    type printed on a surface in the world: a plane lying flat
//                                                        (rotate/position it yourself), `size` = cap height in metres;
//                                                        for ranks on a piece, a flag at a wire, the lap rule's numbers
import { THREE, hex, clamp01, label as rigLabel } from '../../lib/rig.js';

export const KIT = {
  bg: '#FDFCFA', ink: '#1E1C1A', muted: '#6B6560', bryce: '#CC7E16', car: '#3F3B37', clay: '#C24D24',
  asphalt: '#45413D', land: '#ECE8E2', cut: '#DDD8D0', grass: '#357A27', landTint: '#D3E0C3', tree: '#7FA070',
  treeDark: '#5F8A55', water: '#CFDAEA', building: '#FBFAF7', line: '#FFFFFF', kerbWhite: '#F6F4EF', gravel: '#E9E1D0',
  fence: '#8C877F', paddock: '#E8E4DD',
};
// the site's five rank buckets, sampled from its archive page (V5 scenes/src/l11_wires.py SITE_SHADE): 1 slower .. 5 faster
export const SHADES = { 1: '#4a4a4f', 2: '#929196', 3: '#c1c0c0', 4: '#c8b196', 5: '#d9a354' };
// the heat map on the hero model (gate round 1): five clear steps on the dark asphalt, 1 slowest (full ink) .. 5 fastest
// (full gold); the middle grey plainly darker than the land. The site's own shades stay in SHADES (tiles, page matches).
// gate round 4 (Nov 11): slow dark (2) and middle grey (3) were too close at home size; 2 darker, 3 lighter
export const HEAT = { 1: '#1E1C1A', 2: '#3E3A36', 3: '#ADA79F', 4: '#D9AE62', 5: '#CC7E16' };
// the heat map's height by rank, metres a step (gate round 4: 1.2 m could not be seen from `home`)
export const HEAT_STEP = 4.0;
export const FONT = 'Schibsted Grotesk', LABEL_PX = 34, NUM_PX = 34;

// sun: from the south-west-ish, high; the home camera looks toward -z, so shadows fall away and to the right
export const SUN_DIR = new THREE.Vector3(-0.42, 0.82, 0.38).normalize();
const AMB = 0.56;                         // share of the light that is ambient (softness of the shading)

export function createStage(rig) {
  const { scene, renderer } = rig;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Lambert: out = albedo / PI * (ambient + sun * cos). A level surface: cos = SUN_DIR.y. Calibrate to exactly albedo.
  const cosUp = SUN_DIR.y;
  const ambI = Math.PI * AMB, sunI = Math.PI * (1 - AMB) / cosUp;
  const amb = new THREE.AmbientLight(0xffffff, ambI); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffffff, sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.55;            // shadows are soft greys, never black
  scene.add(sun); scene.add(sun.target);
  function fitShadow(target, size) {
    const s = size / 2;
    const c = sun.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s;
    const far = Math.max(400, size * 3);
    c.near = 1; c.far = far * 2;
    sun.position.set(target[0] + SUN_DIR.x * far, target[1] + SUN_DIR.y * far, target[2] + SUN_DIR.z * far);
    sun.target.position.set(target[0], target[1], target[2]);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    c.updateProjectionMatrix();
    // bias scales with texel size
    const texel = size / sun.shadow.mapSize.x;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = texel * 0.8;
  }
  const lambert = (color, o = {}) => new THREE.MeshLambertMaterial({ color: hex(color), ...o });
  // the desk: a large paper plane that only takes shadows (its own colour is the paper's)
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), lambert(KIT.bg));
  desk.receiveShadow = true; desk.position.y = 0; desk.renderOrder = -10;
  scene.add(desk);
  fitShadow([0, 0, 0], 1600);
  return { sun, amb, desk, fitShadow, lambert, sunI, ambI };
}

export function labels(rig) {
  const { ctx } = rig;
  const sans = (px = LABEL_PX, w = 400) => `${w} ${px}px "${FONT}"`;
  function label(text, [x, y], { alpha = 1, color = KIT.ink, align = 'center', base = 'middle', px = LABEL_PX, weight = 400 } = {}) {
    if (alpha <= 0.002) return;
    rigLabel(ctx, text, Math.round(x), Math.round(y), { font: sans(px, weight), color, alpha, align, base });
  }
  function numWidths(txt, px) {
    ctx.save(); ctx.font = sans(px, 500);
    const cw = ctx.measureText('0').width, ws = [...txt].map((ch) => (/[0-9]/.test(ch) ? cw : ctx.measureText(ch).width));
    ctx.restore(); return ws;
  }
  function num(txt, [x, y], { alpha = 1, color = KIT.ink, align = 'center', base = 'middle', px = NUM_PX } = {}) {
    if (alpha <= 0.002) return;
    const ws = numWidths(txt, px), total = ws.reduce((a, b) => a + b, 0);
    let cx = Math.round(align === 'left' ? x : align === 'right' ? x - total : x - total / 2);
    ctx.save(); ctx.globalAlpha = clamp01(alpha); ctx.font = sans(px, 500); ctx.fillStyle = color; ctx.textBaseline = base; ctx.textAlign = 'center';
    [...txt].forEach((ch, k) => { ctx.fillText(ch, cx + ws[k] / 2, Math.round(y)); cx += ws[k]; });
    ctx.restore();
  }
  function box(text, [x, y], { px = LABEL_PX, align = 'center', base = 'middle', weight = 400 } = {}) {
    ctx.save(); ctx.font = sans(px, weight); ctx.textBaseline = base; ctx.textAlign = 'left';
    const m = ctx.measureText(text); ctx.restore();
    const x0 = align === 'left' ? x : align === 'right' ? x - m.width : x - m.width / 2;
    return [Math.floor(x0), Math.floor(y - m.actualBoundingBoxAscent), Math.ceil(x0 + m.width), Math.ceil(y + m.actualBoundingBoxDescent)];
  }
  /** Type printed on a surface: a flat plane (in its local xz plane, reading along +x, top toward -z), cap height `size` m. */
  function groundText(text, { size = 2, color = KIT.ink, weight = 400, numerals = false } = {}) {
    const px = 128, c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = sans(px, weight);
    const w = Math.ceil(g.measureText(text).width + px * 0.8), h = Math.ceil(px * 1.3);   // generous side room: wide caps (T, W) overhang their advance
    c.width = w; c.height = h;
    g.font = sans(px, weight); g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
    if (numerals) g.fontVariantNumeric = 'tabular-nums';
    // the face's capital I carries slab serifs (it read as a slab serif on the loop flags: "I9"); printed in the
    // world, a capital I is drawn as the face's own l cut to cap height, a plain stem
    if (text.includes('I')) {
      g.textAlign = 'left'; let x = w / 2 - g.measureText(text).width / 2;
      const capA = g.measureText('H').actualBoundingBoxAscent, lA = g.measureText('l').actualBoundingBoxAscent;
      const base = h / 2 + capA / 2; g.textBaseline = 'alphabetic';
      for (const ch of text) {
        if (ch === 'I') { const lw = g.measureText('l').width; g.save(); g.translate(x + (g.measureText('I').width - lw) / 2, base); g.scale(1, capA / lA); g.fillText('l', 0, 0); g.restore(); }
        else g.fillText(ch, x, base);
        x += g.measureText(ch).width;
      }
    } else g.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const capPx = px * 0.72, scale = size / capPx;
    const geo = new THREE.PlaneGeometry(w * scale, h * scale).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 5;
    m.userData.width = w * scale;
    return m;
  }
  return { label, num, box, groundText };
}
