// film-rig: one three.js scene, one perspective camera on hand-placed keys, one clock in film seconds.
// render(t) is a pure function of t: the shot computes every object's state from t, nothing accumulates.
// Pipeline per output frame: S sub-frames (motion blur, optional) x [scene into a supersampled MSAA target ->
// box-filtered down to the output size -> 2D overlay (labels) composited on top] averaged -> canvas -> readPixels.
import * as THREE from '../vendor/three.module.js';
export { THREE };
THREE.ColorManagement.enabled = false; // colours are sRGB values written straight through, as in CSS

// ---------- time and easing ----------
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const seg = (t, t0, t1) => clamp01((t - t0) / (t1 - t0));
export const smooth = (u) => u * u * (3 - 2 * u);
export const linear = (u) => u;

/** Ease from a speed profile v(u) on [0,1], integrated to a lookup table (position 0 -> 1). */
function fromSpeed(v, n = 2048) {
  const lut = new Float64Array(n + 1);
  let acc = 0;
  for (let i = 1; i <= n; i++) { acc += v((i - 0.5) / n); lut[i] = acc; }
  for (let i = 0; i <= n; i++) lut[i] /= acc;
  return (u) => {
    u = clamp01(u) * n;
    const i = Math.min(n - 1, Math.floor(u));
    return lut[i] + (lut[i + 1] - lut[i]) * (u - i);
  };
}
/** Ease-in-out whose speed peaks at `peak` (0..1); sharp sets how gentle the ends are (higher = gentler ends). */
export const easePeak = (peak = 0.45, sharp = 4) => fromSpeed((u) => Math.pow(u, peak * sharp) * Math.pow(1 - u, (1 - peak) * sharp));
/** Trapezoid speed: smooth ramp up over the first `rin`, constant, smooth ramp down over the last `rout`.
 *  Applied to log(distance) this is an exponential zoom that eases out into the hold. */
export const easeRamp = (rin = 0.12, rout = 0.45) => fromSpeed((u) => {
  if (u < rin) return smooth(u / rin);
  if (u > 1 - rout) return smooth((1 - u) / rout);
  return 1;
});
export const easeInOut = easePeak(0.5, 4);

/** A keyed track: keys [[t, value, ease]]; ease shapes the segment that ends at that key. value: number or array. */
export function track(keys) {
  keys = keys.map(([t, v, e]) => [t, v, e || easeInOut]);
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const u = e((t - t0) / (t1 - t0));
        return Array.isArray(v0) ? v0.map((a, k) => lerp(a, v1[k], u)) : lerp(v0, v1, u);
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** Deterministic hash noise in [0,1) from an integer (and a salt). */
export function hash01(i, salt = 0) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------- colour ----------
export const hex = (s) => new THREE.Color(s); // all colour maths here is in sRGB values, as CSS does
export function mixHex(a, b, u) { const c = hex(a); c.lerp(hex(b), u); return c; }

// ---------- the rig ----------
export function createRig({ width = 1920, height = 1080, ssaa = 2, msaa = 4, fov = 30, bg = '#ffffff' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.style.cssText = `width:${width}px;height:${height}px;display:block`;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // no conversion: shaders write sRGB values directly
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  scene.background = hex(bg);
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);

  const hi = new THREE.WebGLRenderTarget(width * ssaa, height * ssaa, { samples: msaa, depthBuffer: true });
  hi.texture.minFilter = THREE.LinearFilter; hi.texture.magFilter = THREE.LinearFilter;
  hi.texture.generateMipmaps = false;
  const accum = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });

  // 2D overlay for type: drawn at output resolution, so text is the browser's own crisp rendering
  const overlay = document.createElement('canvas');
  overlay.width = width; overlay.height = height;
  const ctx = overlay.getContext('2d');
  const overlayTex = new THREE.CanvasTexture(overlay);
  overlayTex.minFilter = THREE.NearestFilter; overlayTex.magFilter = THREE.NearestFilter;
  overlayTex.generateMipmaps = false; overlayTex.colorSpace = THREE.NoColorSpace;

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // box filter: for ssaa 2 one bilinear tap at the centre of each 2x2 block averages all four samples
  const compositeMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: hi.texture }, tOver: { value: overlayTex }, uGain: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / (width * ssaa), 1 / (height * ssaa)) }, uSS: { value: ssaa } },
    vertexShader: vert,
    fragmentShader: `uniform sampler2D tScene, tOver; uniform float uGain, uSS; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec3 c;
        if (uSS > 2.5) { // 3x3 or 4x4: four bilinear taps
          vec2 o = uTexel * (uSS * 0.25);
          c = 0.25 * (texture2D(tScene, vUv + vec2(-o.x,-o.y)).rgb + texture2D(tScene, vUv + vec2(o.x,-o.y)).rgb
                    + texture2D(tScene, vUv + vec2(-o.x,o.y)).rgb + texture2D(tScene, vUv + vec2(o.x,o.y)).rgb);
        } else c = texture2D(tScene, vUv).rgb;
        vec4 o2 = texture2D(tOver, vUv); // CanvasTexture is uploaded with flipY
        c = mix(c, o2.rgb, o2.a);
        gl_FragColor = vec4(c * uGain, uGain);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const addMat = compositeMat.clone();
  addMat.uniforms = compositeMat.uniforms; // shared uniforms
  addMat.blending = THREE.CustomBlending;
  addMat.blendEquation = THREE.AddEquation; addMat.blendSrc = THREE.OneFactor; addMat.blendDst = THREE.OneFactor;
  addMat.transparent = true;
  const copyMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: accum.texture } }, vertexShader: vert,
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }',
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new THREE.Mesh(quadGeo, compositeMat);
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  /** Orbit camera: target, distance D, elevation (deg, 90 = straight down), azimuth (deg, 0 = from +z). */
  const tmpDir = new THREE.Vector3(), tmpUp = new THREE.Vector3();
  function placeCamera({ target, D, elev, azim = 0, fov: f, near, far }) {
    const el = THREE.MathUtils.degToRad(Math.min(elev, 89.99)), az = THREE.MathUtils.degToRad(azim);
    tmpDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    tmpUp.set(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)); // screen up = d(dir)/d(elev)
    camera.position.set(target[0], target[1], target[2]).addScaledVector(tmpDir, D);
    camera.up.copy(tmpUp);
    camera.lookAt(target[0], target[1], target[2]);
    if (f) camera.fov = f;
    camera.near = near ?? D * 0.02; camera.far = far ?? D * 60;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** World point -> output pixel [x, y, visible]. */
  const pv = new THREE.Vector3();
  function project(p) {
    pv.set(p[0], p[1], p[2]).project(camera);
    return [(pv.x * 0.5 + 0.5) * width, (-pv.y * 0.5 + 0.5) * height, pv.z < 1 && pv.z > -1];
  }

  let shotRender = null; // (t, rig) => void: sets the scene and draws the overlay
  let shotPrepare = null; // optional async (t) => void, awaited before each output frame (e.g. to load a footage frame)
  function drawSub(t) {
    ctx.clearRect(0, 0, width, height);
    shotRender(t);
    overlayTex.needsUpdate = true;
    renderer.setRenderTarget(hi);
    renderer.render(scene, camera);
  }
  /** Render output frame at film time t into the canvas. sub > 1: sub-frames over shutter/fps around t, averaged. */
  function renderFrame(t, { sub = 1, shutter = 0.5, fps = 30 } = {}) {
    if (sub <= 1) {
      drawSub(t);
      quad.material = compositeMat; compositeMat.uniforms.uGain.value = 1;
      renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
      return;
    }
    renderer.setRenderTarget(accum); renderer.setClearColor(0x000000, 0); renderer.clear();
    for (let s = 0; s < sub; s++) {
      const ts = t + ((s + 0.5) / sub - 0.5) * (shutter / fps);
      drawSub(ts);
      quad.material = addMat; compositeMat.uniforms.uGain.value = 1 / sub;
      renderer.setRenderTarget(accum); renderer.autoClear = false;
      renderer.render(quadScene, quadCam); renderer.autoClear = true;
    }
    quad.material = copyMat;
    renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
  }

  const gl = renderer.getContext();
  const pixels = new Uint8Array(width * height * 4);
  function readPixels() { gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; }

  /** Step the clock frame by frame and stream raw RGBA frames to the rig's server (which pipes them into ffmpeg). */
  async function exportFrames({ out, fps = 30, from = 0, to, sub = 1, shutter = 0.5, crf = 14 }) {
    const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
    const r = await fetch('/begin', { method: 'POST', body: JSON.stringify({ out, fps, width, height, crf }) });
    if (!r.ok) throw new Error('begin: ' + (await r.text()));
    const t0 = performance.now();
    for (let f = f0; f < f1; f++) {
      if (shotPrepare) await shotPrepare(f / fps);
      renderFrame(f / fps, { sub, shutter, fps });
      const px = readPixels();
      const w = await fetch('/frame', { method: 'POST', body: px });
      if (!w.ok) throw new Error('frame ' + f + ': ' + (await w.text()));
      if (f % 30 === 0) console.log(`frame ${f}/${f1} ${((performance.now() - t0) / (f - f0 + 1)).toFixed(0)} ms/frame`);
    }
    const e = await fetch('/end', { method: 'POST' });
    return { frames: f1 - f0, msPerFrame: (performance.now() - t0) / (f1 - f0), end: await e.text() };
  }
  /** One still as PNG, written by the server to `path` (relative to the rig root). */
  async function still(t, path, opts = {}) {
    if (shotPrepare) await shotPrepare(t);
    renderFrame(t, opts);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const r = await fetch('/png?path=' + encodeURIComponent(path), { method: 'POST', body: blob });
    return r.text();
  }

  return {
    THREE, renderer, scene, camera, canvas, ctx, width, height, placeCamera, project, renderFrame, exportFrames, still,
    setShot(fn) { shotRender = fn; },
    setPrepare(fn) { shotPrepare = fn; },
  };
}

// ---------- overlay type ----------
export async function loadFonts(list) {
  for (const [family, url, desc] of list) {
    const f = new FontFace(family, `url(${url})`, desc || {});
    await f.load(); document.fonts.add(f);
  }
}
/** Draw a label. align: 'center' | 'left' | 'right'; base: 'top' | 'middle' | 'bottom' | 'alphabetic'. */
export function label(ctx, text, x, y, { font, color, alpha = 1, align = 'center', base = 'middle', tracking = 0, lineH = 1.15 } = {}) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  if (tracking) ctx.letterSpacing = tracking + 'px';
  const lines = String(text).split('\n');
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  const y0 = base === 'bottom' ? y - (lines.length - 1) * size * lineH : base === 'middle' ? y - (lines.length - 1) * size * lineH / 2 : y;
  lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * size * lineH));
  ctx.restore();
}
