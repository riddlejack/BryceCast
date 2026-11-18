import { useEffect, useMemo, useRef, useState } from 'react';
// `?url` (a separate, independently-cacheable asset), not `?inline`: inlining
// this 44 KB PNG as base64 grew it ~33% and folded it into the CareerScreen
// JS chunk, where it compressed far worse alongside code than the PNG's own
// DEFLATE data does on its own, and it had to be re-downloaded on every code
// change to that chunk. As a `?url` asset it's a normal `<img>`-style fetch —
// decoded by the browser's native image pipeline and cached for a year
// (immutable, see scripts/api-server.mjs) independent of app code.
import worldLandTextureUrl from '../../analysis/career-atlas/output/world_land_texture.png?url';
import { SourcePill, Unavailable } from '../app/components';
import { focusFade, useInViewOnce, useMeasuredWidth, useReducedMotion, PointerOpen } from '../app/charts';
import { useRouter } from '../app/router';
import { useTapPreview } from '../app/tapPreview';
import { VenueTipCard, type VenueTip } from '../app/venueCard';
import { useVenuePreload } from '../app/venuePeek';
import {
  uiDataPackage,
  type UiCareerAtlasSeriesSpan,
  type UiCareerAtlasVenue,
  type UiCareerTravelLegs
} from '../data/uiDataPackage';
import { chapterTint, ControlRow, FilterChip } from './careerExplorer';

const formatCount = new Intl.NumberFormat('en-US');
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SPHERE_RADIUS_RATIO = 0.46;
const ZOOM_STEP = 1.55;

const chapterOrder = [
  'series_scca_super_tour',
  'series_frp_f1600',
  'series_rcffs',
  'series_formula_ford',
  'series_gb3',
  'series_euroformula_open',
  'series_froc',
  'series_usf_pro_2000',
  'series_imsa_weathertech',
  'series_indy_nxt'
];

/** Series in career order, for keys and legends across the Career page. */
export const seriesOrder = chapterOrder;

/* One name and colour per series, read from the atlas's series spans. */
const seriesMeta = (() => {
  const meta = new Map<string, { name: string; short: string; tint: string }>();
  for (const venue of uiDataPackage.screens.careerLab.atlas?.venues ?? []) {
    for (const span of venue.seriesSpans) {
      if (!meta.has(span.seriesId)) {
        meta.set(span.seriesId, { name: span.seriesName, short: span.seriesShort, tint: chapterTint(span.seriesName) });
      }
    }
  }
  return meta;
})();

export const seriesMetaById = (seriesId: string): { name: string; short: string; tint: string } =>
  seriesMeta.get(seriesId) ?? { name: seriesId, short: seriesId.replace(/^series_/, ''), tint: 'var(--ink-primary)' };

const regionOrder = ['North America', 'Europe', 'Oceania'] as const;

/* ---------- the travel legs: geometry and timing ---------- */

type Vec3 = { x: number; y: number; z: number };
type TravelLeg = UiCareerTravelLegs['legs'][number];

const toVec = (lat: number, lon: number): Vec3 => {
  const la = lat * DEG_TO_RAD;
  const lo = lon * DEG_TO_RAD;
  return { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
};

const toLatLon = (v: Vec3): { lat: number; lon: number } => ({
  lat: Math.atan2(v.z, Math.hypot(v.x, v.y)) * RAD_TO_DEG,
  lon: Math.atan2(v.y, v.x) * RAD_TO_DEG
});

/** A point along the great circle from a to b, t in 0..1. */
const slerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return a;
  const sinOmega = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
};

/** Projects a point (lat, lon) lifted `lift` globe radii above the surface. */
const projectPoint = (lat: number, lon: number, lift: number, view: GlobeView, width: number, height: number) => {
  const latitude = lat * DEG_TO_RAD;
  const longitudeDelta = wrapLongitude(lon - view.longitude) * DEG_TO_RAD;
  const centerLatitude = view.latitude * DEG_TO_RAD;
  const cosLatitude = Math.cos(latitude);
  const depth = Math.sin(centerLatitude) * Math.sin(latitude) + Math.cos(centerLatitude) * cosLatitude * Math.cos(longitudeDelta);
  const radius = height * SPHERE_RADIUS_RATIO * view.zoom;
  /* Only the near side of the globe is drawn (the visible hemisphere, like a
   * 90° clip angle). A lifted arc near the edge would project past the disc and
   * stop in mid-air, so the lift is capped where the point nears the horizon:
   * the line comes down onto the globe's rim and goes round the back there. */
  const visible = depth > 0;
  const rimLift = visible ? 1 / Math.sqrt(Math.max(1e-6, 1 - depth * depth)) - 1 : 0;
  const r = radius * (1 + Math.min(lift, rimLift));
  const dx = r * cosLatitude * Math.sin(longitudeDelta);
  const dy = -r * (Math.cos(centerLatitude) * Math.sin(latitude) - Math.sin(centerLatitude) * cosLatitude * Math.cos(longitudeDelta));
  return { x: width / 2 + dx, y: height / 2 + dy, visible };
};

/** SVG path for part of a leg (fractions t0..t1), broken where it passes behind the globe. */
const legPath = (leg: TravelLeg, t0: number, t1: number, view: GlobeView, width: number, height: number): string => {
  if (leg.greatCircleMiles <= 0 || t1 <= t0) return '';
  const a = toVec(leg.from.lat, leg.from.lon);
  const b = toVec(leg.to.lat, leg.to.lon);
  const angle = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
  const lift = Math.min(0.24, angle * 0.2);
  const steps = Math.max(6, Math.min(72, Math.ceil((angle * RAD_TO_DEG * (t1 - t0)) / 1.2)));
  let d = '';
  let pen = false;
  for (let step = 0; step <= steps; step += 1) {
    const t = t0 + ((t1 - t0) * step) / steps;
    const { lat, lon } = toLatLon(slerp(a, b, t));
    const point = projectPoint(lat, lon, lift * Math.sin(Math.PI * t), view, width, height);
    if (!point.visible) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    pen = true;
  }
  return d;
};

const legHead = (leg: TravelLeg, t: number): { lat: number; lon: number } =>
  leg.greatCircleMiles <= 0
    ? { lat: leg.to.lat, lon: leg.to.lon }
    : toLatLon(slerp(toVec(leg.from.lat, leg.from.lon), toVec(leg.to.lat, leg.to.lon), t));

const legLift = (leg: TravelLeg, t: number): number => {
  if (leg.greatCircleMiles <= 0) return 0;
  const a = toVec(leg.from.lat, leg.from.lon);
  const b = toVec(leg.to.lat, leg.to.lon);
  const angle = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
  return Math.min(0.24, angle * 0.2) * Math.sin(Math.PI * t);
};

/* Each leg takes time by its length (square root, so an ocean crossing is not
 * forty times a short drive); the whole journey plays in about 13 seconds. */
const LEAD_MS = 700;
const legDuration = (miles: number): number => (miles <= 0 ? 70 : 48 + 5.2 * Math.sqrt(miles));

/** The point the globe turns to while a leg draws: the leg's middle, so both
 *  of its ends sit on the visible side. */
const legCentre = (leg: TravelLeg): { lat: number; lon: number } => legHead(leg, 0.5);

/** Degrees between two points on the globe. */
const arcDegrees = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const va = toVec(a.lat, a.lon);
  const vb = toVec(b.lat, b.lon);
  return Math.acos(Math.max(-1, Math.min(1, va.x * vb.x + va.y * vb.y + va.z * vb.z))) * RAD_TO_DEG;
};

/* Before a leg that needs the globe to turn a long way (Monza to New Zealand,
 * New Zealand to St. Petersburg), the pen waits while the globe turns, so the
 * leg draws on the near side instead of round the back. */
const turnDuration = (degrees: number): number => (degrees < 24 ? 0 : Math.min(1000, degrees * 8));

type JourneyTimeline = { turns: number[]; starts: number[]; total: number };

/** Which leg the clock is on, and how far along it the pen is (0 while the globe turns). */
const legAt = (
  timeline: JourneyTimeline,
  legs: TravelLeg[],
  elapsed: number
): { index: number; t: number } => {
  let index = 0;
  while (index + 1 < legs.length && timeline.turns[index + 1] <= elapsed) index += 1;
  const leg = legs[index];
  if (!leg || elapsed < LEAD_MS) return { index, t: 0 };
  return { index, t: Math.max(0, Math.min(1, (elapsed - timeline.starts[index]) / legDuration(leg.greatCircleMiles))) };
};

const monthYearShort = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const nearestVenueId = (venues: UiCareerAtlasVenue[], lat: number, lon: number): string | null => {
  let best: { id: string; distance: number } | null = null;
  for (const venue of venues) {
    const distance = Math.hypot(venue.lat - lat, wrapLongitude(venue.lon - lon));
    if (!best || distance < best.distance) best = { id: venue.venueId, distance };
  }
  return best && best.distance < 0.05 ? best.id : null;
};

type AtlasRegion = (typeof regionOrder)[number];
type GlobeView = { zoom: number; longitude: number; latitude: number };

interface VenueView {
  venue: UiCareerAtlasVenue;
  chapter: UiCareerAtlasSeriesSpan;
  raceCount: number;
  bestFinish: number | null;
  latestRace: UiCareerAtlasVenue['latestRace'];
}

interface ProjectedVenue {
  view: VenueView;
  x: number;
  y: number;
  radius: number;
  onScreen: boolean;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startView: GlobeView;
  moved: boolean;
}

interface GlobeRenderer {
  draw: (width: number, height: number, view: GlobeView) => void;
  destroy: () => void;
}

interface GlobeResources {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  texture: WebGLTexture;
  uniforms: {
    land: WebGLUniformLocation;
    aspect: WebGLUniformLocation;
    zoom: WebGLUniformLocation;
    longitude: WebGLUniformLocation;
    latitude: WebGLUniformLocation;
  };
}

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_land;
  uniform float u_aspect;
  uniform float u_zoom;
  uniform float u_longitude;
  uniform float u_latitude;

  const float PI = 3.141592653589793;
  const float HALF_PI = 1.5707963267948966;

  void main() {
    vec2 point = vec2((v_uv.x - 0.5) * u_aspect, v_uv.y - 0.5) / (${SPHERE_RADIUS_RATIO.toFixed(2)} * u_zoom);
    float rho = length(point);
    if (rho > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float latitude = u_latitude;
    float longitude = u_longitude;
    if (rho > 0.00001) {
      float angularDistance = asin(clamp(rho, 0.0, 1.0));
      float sinDistance = sin(angularDistance);
      float cosDistance = cos(angularDistance);
      float sinCenterLatitude = sin(u_latitude);
      float cosCenterLatitude = cos(u_latitude);
      latitude = asin(clamp(
        cosDistance * sinCenterLatitude + point.y * sinDistance * cosCenterLatitude / rho,
        -1.0,
        1.0
      ));
      longitude += atan(
        point.x * sinDistance,
        rho * cosCenterLatitude * cosDistance - point.y * sinCenterLatitude * sinDistance
      );
    }

    float textureX = fract((longitude + PI) / (2.0 * PI));
    float textureY = clamp((HALF_PI - latitude) / PI, 0.0, 1.0);
    float landMask = texture2D(u_land, vec2(textureX, textureY)).r;
    float land = smoothstep(0.36, 0.64, landMask);
    vec3 seaColor = vec3(1.0);
    vec3 landColor = vec3(0.9255, 0.9255, 0.9333);
    vec3 color = mix(seaColor, landColor, land);
    color -= smoothstep(0.72, 1.0, rho) * 0.016;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const compileShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL could not allocate a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(detail);
  }
  return shader;
};

const uploadLandTexture = (
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  image: HTMLImageElement | null
) => {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (image) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, image);
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      1,
      1,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0])
    );
  }
};

const createGlobeResources = (
  gl: WebGLRenderingContext,
  loadedImage: HTMLImageElement | null
): GlobeResources => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  let fragmentShader: WebGLShader;
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  } catch (error) {
    gl.deleteShader(vertexShader);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error('WebGL could not allocate the globe program.');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(program) ?? 'unknown program error';
    gl.deleteProgram(program);
    throw new Error(detail);
  }

  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) {
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    gl.deleteProgram(program);
    throw new Error('WebGL could not allocate the globe geometry.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  if (position < 0) {
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    throw new Error('WebGL globe position attribute is unavailable.');
  }
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  uploadLandTexture(gl, texture, loadedImage);

  const uniformEntries = {
    land: gl.getUniformLocation(program, 'u_land'),
    aspect: gl.getUniformLocation(program, 'u_aspect'),
    zoom: gl.getUniformLocation(program, 'u_zoom'),
    longitude: gl.getUniformLocation(program, 'u_longitude'),
    latitude: gl.getUniformLocation(program, 'u_latitude')
  };
  if (Object.values(uniformEntries).some((uniform) => uniform === null)) {
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    throw new Error('WebGL globe uniforms are unavailable.');
  }
  const uniforms = uniformEntries as GlobeResources['uniforms'];
  gl.uniform1i(uniforms.land, 0);
  return { program, buffer, texture, uniforms };
};

const destroyGlobeResources = (gl: WebGLRenderingContext, resources: GlobeResources | null) => {
  if (!resources) return;
  gl.deleteTexture(resources.texture);
  gl.deleteBuffer(resources.buffer);
  gl.deleteProgram(resources.program);
};

const createGlobeRenderer = (
  canvas: HTMLCanvasElement,
  onTextureReady: () => void,
  onError: (message: string) => void
): GlobeRenderer => {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: 'low-power',
    premultipliedAlpha: true
  });
  if (!gl) throw new Error('This browser could not start WebGL.');

  let destroyed = false;
  let contextLost = false;
  let imageReady = false;
  let resources: GlobeResources | null = createGlobeResources(gl, null);
  let lastDraw: { width: number; height: number; view: GlobeView } | null = null;
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    if (destroyed) return;
    imageReady = true;
    if (resources && !contextLost) {
      uploadLandTexture(gl, resources.texture, image);
      if (lastDraw) draw(lastDraw.width, lastDraw.height, lastDraw.view);
    }
    onTextureReady();
  };
  image.onerror = () => {
    if (!destroyed) onError('The bundled world texture could not be decoded.');
  };
  image.src = worldLandTextureUrl;

  const draw = (width: number, height: number, view: GlobeView) => {
    lastDraw = { width, height, view: { ...view } };
    if (destroyed || contextLost || !resources || width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer);
    gl.bindTexture(gl.TEXTURE_2D, resources.texture);
    gl.uniform1f(resources.uniforms.aspect, width / height);
    gl.uniform1f(resources.uniforms.zoom, view.zoom);
    gl.uniform1f(resources.uniforms.longitude, view.longitude * DEG_TO_RAD);
    gl.uniform1f(resources.uniforms.latitude, view.latitude * DEG_TO_RAD);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    resources = null;
    onError('The globe is restoring after a graphics reset.');
  };
  const handleContextRestored = () => {
    if (destroyed) return;
    contextLost = false;
    try {
      resources = createGlobeResources(gl, imageReady ? image : null);
      if (imageReady) {
        onTextureReady();
        if (lastDraw) draw(lastDraw.width, lastDraw.height, lastDraw.view);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The globe could not recover after a graphics reset.');
    }
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  return {
    draw,
    destroy: () => {
      destroyed = true;
      image.onload = null;
      image.onerror = null;
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      destroyGlobeResources(gl, resources);
      resources = null;
    }
  };
};

const wrapLongitude = (longitude: number): number => ((longitude + 180) % 360 + 360) % 360 - 180;
const clampLatitude = (latitude: number): number => Math.max(-85, Math.min(85, latitude));

const splitNamedSource = (source: string): { name: string; url: string } => {
  const separator = source.indexOf(' | ');
  if (separator < 0) return { name: source, url: '' };
  return { name: source.slice(0, separator), url: source.slice(separator + 3) };
};

const yearSpan = (first: number, last: number): string => {
  const short = (year: number) => `’${String(year).slice(-2)}`;
  return first === last ? short(first) : `${short(first)}–${short(last)}`;
};

const chapterLine = (chapter: UiCareerAtlasSeriesSpan): string =>
  `${chapter.seriesShort} ${yearSpan(chapter.firstYear, chapter.lastYear)}`;

const venueAccessibleLabel = (view: VenueView, seriesFiltered: boolean): string => {
  const series = seriesFiltered
    ? `${view.chapter.seriesShort} ${yearSpan(view.chapter.firstYear, view.chapter.lastYear)}`
    : view.venue.seriesSpans
        .map(
          (span) =>
            `${span.seriesShort} ${yearSpan(span.firstYear, span.lastYear)}, ${span.raceCount} ${span.raceCount === 1 ? 'race' : 'races'}`
        )
        .join('; ');
  return `${view.venue.trackName}, ${view.venue.country}. ${view.raceCount} ${view.raceCount === 1 ? 'race' : 'races'} in this filter. ${series}.${
    view.bestFinish === null ? '' : ` Best sourced finish P${view.bestFinish}.`
  } Open the latest applicable race here.`;
};

const fitGlobeToViews = (
  views: VenueView[],
  defaultView: GlobeView,
  minZoom: number,
  maxZoom: number,
  totalVenues: number
): GlobeView => {
  if (views.length === 0 || views.length === totalVenues) return defaultView;
  const vectors = views.map((view) => {
    const latitude = view.venue.lat * DEG_TO_RAD;
    const longitude = view.venue.lon * DEG_TO_RAD;
    return {
      x: Math.cos(latitude) * Math.cos(longitude),
      y: Math.cos(latitude) * Math.sin(longitude),
      z: Math.sin(latitude)
    };
  });
  const sum = vectors.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y, z: total.z + point.z }),
    { x: 0, y: 0, z: 0 }
  );
  const longitude = Math.atan2(sum.y, sum.x);
  const latitude = Math.atan2(sum.z, Math.hypot(sum.x, sum.y));
  const center = {
    x: Math.cos(latitude) * Math.cos(longitude),
    y: Math.cos(latitude) * Math.sin(longitude),
    z: Math.sin(latitude)
  };
  const maximumAngle = Math.max(
    ...vectors.map((point) => Math.acos(Math.max(-1, Math.min(1, point.x * center.x + point.y * center.y + point.z * center.z))))
  );
  const fitZoom = maximumAngle >= Math.PI / 2 ? minZoom : 0.78 / Math.max(Math.sin(maximumAngle), 0.12);
  return {
    longitude: wrapLongitude(longitude * RAD_TO_DEG),
    latitude: clampLatitude(latitude * RAD_TO_DEG),
    zoom: Math.max(minZoom, Math.min(maxZoom, views.length === 1 ? 4 : Math.min(10, fitZoom)))
  };
};

const projectVenue = (
  venueView: VenueView,
  globeView: GlobeView,
  width: number,
  height: number
): ProjectedVenue => {
  const latitude = venueView.venue.lat * DEG_TO_RAD;
  const longitudeDelta = wrapLongitude(venueView.venue.lon - globeView.longitude) * DEG_TO_RAD;
  const centerLatitude = globeView.latitude * DEG_TO_RAD;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinCenterLatitude = Math.sin(centerLatitude);
  const cosCenterLatitude = Math.cos(centerLatitude);
  const cosLongitudeDelta = Math.cos(longitudeDelta);
  const depth = sinCenterLatitude * sinLatitude + cosCenterLatitude * cosLatitude * cosLongitudeDelta;
  const globeRadius = height * SPHERE_RADIUS_RATIO * globeView.zoom;
  const x = width / 2 + globeRadius * cosLatitude * Math.sin(longitudeDelta);
  const y =
    height / 2 -
    globeRadius * (cosCenterLatitude * sinLatitude - sinCenterLatitude * cosLatitude * cosLongitudeDelta);
  const radius = Math.max(4, 3 + Math.sqrt(venueView.raceCount) * 1.05);
  return {
    view: venueView,
    x,
    y,
    radius,
    onScreen: depth > 0 && x >= -radius && x <= width + radius && y >= -radius && y <= height + radius
  };
};

/* The travel map's card for one track (round 2): the track's 3D still where
 * it is modelled (the plain model: a dot is the venue, not one race), the
 * country, the track, the series he raced there and his best day. */
const venueTip = (view: VenueView, point: ProjectedVenue, seriesFiltered: boolean): VenueTip => ({
  x: point.x,
  y: point.y - point.radius - 3,
  over: point.y - point.radius - 3,
  under: point.y + point.radius + 3,
  venue: { sessionId: view.latestRace.sessionId, trackName: view.venue.trackName, trackId: view.venue.trackIds[0] ?? null, plain: true },
  meta: view.venue.country,
  tint: chapterTint(view.chapter.seriesName),
  title: view.venue.trackName,
  detail: (seriesFiltered ? [view.chapter] : view.venue.seriesSpans).map(chapterLine).join(' · '),
  note: [`${formatCount.format(view.raceCount)} ${view.raceCount === 1 ? 'race' : 'races'}`, view.bestFinish === null ? null : `best P${view.bestFinish}`]
    .filter(Boolean)
    .join(' · '),
  action: 'open his latest race here'
});

/* A tip measured in the map's own pixels, moved into its parent's. */
const offsetTip = (tip: VenueTip, map: HTMLElement | null): VenueTip => {
  const dx = map?.offsetLeft ?? 0;
  const dy = map?.offsetTop ?? 0;
  return { ...tip, x: tip.x + dx, y: tip.y + dy, over: (tip.over ?? tip.y) + dy, under: (tip.under ?? tip.y) + dy };
};

/* The travel map. The globe draws each leg of the career, one race meeting's
 * track to the next, in date order, while a counter adds up the miles. It plays
 * once on a clock when it comes into view (never tied to the scroll), then the
 * globe is free to spin. With reduced motion it shows the finished journey. */
const wholeMiles = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/* Digits on a fixed width so a running counter does not jitter; commas and
 * points keep their own narrow width, and the "+" is the accent. */
const FixedDigits = ({ text }: { text: string }) => (
  <>
    {[...text].map((char, index) =>
      char >= '0' && char <= '9' ? (
        <span key={index} className="fixed-digit">
          {char}
        </span>
      ) : (
        <span key={index} className={char === '+' ? 'fixed-plus' : 'fixed-sep'}>
          {char}
        </span>
      )
    )}
  </>
);

export const CareerAtlas = () => {
  const atlas = uiDataPackage.screens.careerLab.atlas;
  const travel = uiDataPackage.screens.careerLab.lifeStats?.travelLegs ?? null;
  const legs = travel?.legs ?? [];
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, stageSeen] = useInViewOnce<HTMLDivElement>(0.35);
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rendererRef = useRef<GlobeRenderer | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const ignoreClickRef = useRef(false);
  const wheelZoomRef = useRef<((event: WheelEvent) => void) | null>(null);
  const { navigate } = useRouter();
  const minZoom = atlas.globe.zoom.min;
  const maxZoom = atlas.globe.zoom.max;
  /* The resting view turns the globe a little north and west of the atlas's
   * own default (20° N, 35° W), so every track in North America and Europe
   * sits on the visible face. */
  const defaultView = useMemo<GlobeView>(
    () => ({
      zoom: minZoom,
      longitude: -46,
      latitude: 32
    }),
    [maxZoom, minZoom]
  );
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  /* Round 9: on a phone the first tap on a track reads it (the ring and the
   * card), the second tap or the card's button opens its latest race. */
  const tap = useTapPreview();
  /* The first time a pointer (or a finger) comes onto the globe, warm the
   * stills of the tracks in the filter, so a card never waits on a picture. */
  const preloadStills = useVenuePreload(() =>
    filteredViews.map((view) => ({ sessionId: view.latestRace.sessionId, trackName: view.venue.trackName, trackId: view.venue.trackIds[0] ?? null, plain: true }))
  );
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<AtlasRegion | null>(null);
  const [globeView, setGlobeView] = useState<GlobeView>(defaultView);
  const [isDragging, setIsDragging] = useState(false);
  const [textureReady, setTextureReady] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  /* ---- the journey's clock ---- */
  const timeline = useMemo<JourneyTimeline>(() => {
    const turns: number[] = [];
    const starts: number[] = [];
    let total = LEAD_MS;
    let previousCentre: { lat: number; lon: number } | null = null;
    for (const leg of legs) {
      turns.push(total);
      const centre = leg.greatCircleMiles > 0 ? legCentre(leg) : { lat: leg.to.lat, lon: leg.to.lon };
      if (previousCentre) total += turnDuration(arcDegrees(previousCentre, centre));
      previousCentre = centre;
      starts.push(total);
      total += legDuration(leg.greatCircleMiles);
    }
    return { turns, starts, total };
  }, [legs]);
  const legVenues = useMemo(
    () =>
      legs.map((leg) => ({
        from: nearestVenueId(atlas.venues, leg.from.lat, leg.from.lon),
        to: nearestVenueId(atlas.venues, leg.to.lat, leg.to.lon)
      })),
    [atlas.venues, legs]
  );
  const [playhead, setPlayhead] = useState<number>(() => (reducedMotion ? Number.POSITIVE_INFINITY : 0));
  const [run, setRun] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const followRef = useRef(true);
  const zoomTargetRef = useRef(1.6);

  useEffect(() => {
    if (reducedMotion) setPlayhead(Number.POSITIVE_INFINITY);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || skipped || legs.length === 0) return undefined;
    if (!stageSeen && run === 0) return undefined;
    followRef.current = true;
    let frame = 0;
    const start = performance.now();
    let last = start;
    let settled = false;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const elapsed = now - start;
      const playing = elapsed < timeline.total;
      setPlayhead(playing ? elapsed : Number.POSITIVE_INFINITY);
      if (followRef.current) {
        let target: GlobeView;
        if (playing) {
          const { index } = legAt(timeline, legs, elapsed);
          const leg = legs[index];
          /* The globe turns to the leg's middle, so the whole leg, start to
           * end, draws on the visible side. */
          const aim =
            elapsed < LEAD_MS
              ? { lat: leg.from.lat, lon: leg.from.lon }
              : leg.greatCircleMiles > 0
                ? legCentre(leg)
                : { lat: leg.to.lat, lon: leg.to.lon };
          if (leg.greatCircleMiles > 0) zoomTargetRef.current = Math.max(1, Math.min(2.3, Math.sqrt(1700 / Math.max(leg.greatCircleMiles, 180))));
          /* Short legs sit a little low in the frame; an ocean crossing is centred
           * exactly, since its ends are already near the rim. */
          const long = leg.greatCircleMiles > 3000;
          target = {
            latitude: clampLatitude(long ? aim.lat : aim.lat * 0.85 + 8),
            longitude: aim.lon,
            zoom: zoomTargetRef.current
          };
        } else {
          target = defaultView;
        }
        const centre = 1 - Math.exp(-dt / 300);
        const zoomEase = 1 - Math.exp(-dt / 760);
        setGlobeView((current) => {
          const next = {
            longitude: wrapLongitude(current.longitude + wrapLongitude(target.longitude - current.longitude) * centre),
            latitude: clampLatitude(current.latitude + (target.latitude - current.latitude) * centre),
            zoom: current.zoom + (target.zoom - current.zoom) * zoomEase
          };
          if (!playing) {
            settled =
              Math.abs(wrapLongitude(target.longitude - next.longitude)) < 0.05 &&
              Math.abs(target.latitude - next.latitude) < 0.05 &&
              Math.abs(target.zoom - next.zoom) < 0.002;
            if (settled) return target;
          }
          return next;
        });
      } else if (!playing) {
        settled = true;
      }
      if (playing || !settled) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [defaultView, legs, reducedMotion, run, skipped, stageSeen, timeline]);

  const finished = !Number.isFinite(playhead);
  let currentIndex = legs.length - 1;
  let currentT = 1;
  if (!finished) {
    const at = legAt(timeline, legs, playhead);
    currentIndex = at.index;
    currentT = at.t;
  }
  const started = finished || playhead >= LEAD_MS;
  const currentLeg = legs[currentIndex] ?? null;
  const milesSoFar = !currentLeg
    ? 0
    : finished
      ? travel?.totalMiles ?? 0
      : !started
        ? 0
        : currentLeg.runningMiles - currentLeg.greatCircleMiles + currentLeg.greatCircleMiles * currentT;
  const visitedVenues = useMemo(() => {
    const visited = new Set<string>();
    if (legs.length === 0) return null;
    if (legVenues[0]?.from) visited.add(legVenues[0].from);
    const doneThrough = finished ? legs.length : currentIndex + (currentT >= 1 ? 1 : 0);
    for (let index = 0; index < doneThrough; index += 1) {
      const id = legVenues[index]?.to;
      if (id) visited.add(id);
    }
    return visited;
  }, [currentIndex, currentT, finished, legVenues, legs.length]);

  const coordinateSourceEntries = useMemo(
    () =>
      atlas.venues.flatMap((venue) =>
        venue.coordinateSources.map((source, index) => {
          const named = splitNamedSource(source);
          return {
            label: `${venue.trackName} · coordinates${venue.coordinateSources.length > 1 ? ` ${index + 1}` : ''}`,
            path: named.url,
            note: named.name
          };
        })
      ),
    [atlas.venues]
  );

  const seriesOptions = useMemo(
    () =>
      [...new Map(atlas.venues.flatMap((venue) => venue.seriesSpans).map((span) => [span.seriesId, span])).values()].sort(
        (left, right) => chapterOrder.indexOf(left.seriesId) - chapterOrder.indexOf(right.seriesId)
      ),
    [atlas.venues]
  );

  const viewsFor = (selectedSeries: string | null, selectedRegion: AtlasRegion | null): VenueView[] =>
    atlas.venues.flatMap((venue) => {
      if (selectedRegion !== null && venue.region !== selectedRegion) return [];
      const selectedSpan = selectedSeries === null ? null : venue.seriesSpans.find((span) => span.seriesId === selectedSeries);
      if (selectedSeries !== null && !selectedSpan) return [];
      return [
        {
          venue,
          chapter: selectedSpan ?? venue.dominantChapter,
          raceCount: selectedSpan?.raceCount ?? venue.raceCount,
          bestFinish: selectedSpan?.bestFinish ?? venue.bestFinish,
          latestRace: selectedSpan?.latestRace ?? venue.latestRace
        }
      ];
    });

  const filteredViews = viewsFor(seriesFilter, regionFilter);
  const filteredRaceCount = filteredViews.reduce((sum, view) => sum + view.raceCount, 0);
  const height = Math.round(Math.max(320, Math.min(780, width * 0.8)));
  const projectedViews = filteredViews.map((view) => projectVenue(view, globeView, width, height));
  const onScreenViews = projectedViews.filter((point) => point.onScreen);
  const activePoint = onScreenViews.find((point) => point.view.venue.venueId === activeVenueId) ?? null;
  const activeView = activePoint?.view ?? null;

  useEffect(() => {
    const map = ref.current;
    if (!map) return;
    const handleWheel = (event: WheelEvent) => wheelZoomRef.current?.(event);
    map.addEventListener('wheel', handleWheel, { passive: false });
    return () => map.removeEventListener('wheel', handleWheel);
  }, [ref]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const renderer = createGlobeRenderer(
        canvas,
        () => {
          setTextureReady(true);
          setRenderError(null);
        },
        (message) => setRenderError(message)
      );
      rendererRef.current = renderer;
      return () => {
        renderer.destroy();
        rendererRef.current = null;
      };
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'The globe renderer could not start.');
    }
  }, []);

  useEffect(() => {
    rendererRef.current?.draw(width, height, globeView);
  }, [globeView, height, textureReady, width]);

  if (!atlas || atlas.venues.length === 0 || atlas.globe.projection !== 'orthographic') {
    return (
      <section className="career-travel">
        <h2 className="career-section-title">The travel map</h2>
        <Unavailable>The career atlas is unavailable until its sourced venue and globe artifacts are rebuilt.</Unavailable>
      </section>
    );
  }

  const clampView = (candidate: GlobeView): GlobeView => ({
    zoom: Math.max(minZoom, Math.min(maxZoom, candidate.zoom)),
    longitude: wrapLongitude(candidate.longitude),
    latitude: clampLatitude(candidate.latitude)
  });

  const takeControl = () => {
    followRef.current = false;
  };

  const applyFilters = (nextSeries: string | null, nextRegion: AtlasRegion | null) => {
    const nextViews = viewsFor(nextSeries, nextRegion);
    takeControl();
    setSeriesFilter(nextSeries);
    setRegionFilter(nextRegion);
    setActiveVenueId(null);
    setGlobeView(fitGlobeToViews(nextViews, defaultView, minZoom, maxZoom, atlas.venueCount));
  };

  const zoomBy = (factor: number) => {
    takeControl();
    setActiveVenueId(null);
    setGlobeView((current) => clampView({ ...current, zoom: current.zoom * factor }));
  };

  /* The wheel scrolls the page. Only a pinch (which arrives as a wheel event
   * with ctrlKey) or a held Cmd/Ctrl zooms the globe, so a big globe never
   * traps the page's scroll. */
  wheelZoomRef.current = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const rotateByPixels = (x: number, y: number) => {
    const degreesPerPixel = RAD_TO_DEG / Math.max(height * SPHERE_RADIUS_RATIO * globeView.zoom, 1);
    takeControl();
    setActiveVenueId(null);
    setGlobeView((current) =>
      clampView({
        ...current,
        longitude: current.longitude - x * degreesPerPixel,
        latitude: current.latitude + y * degreesPerPixel
      })
    );
  };

  const resetView = () => {
    takeControl();
    setActiveVenueId(null);
    setGlobeView(fitGlobeToViews(filteredViews, defaultView, minZoom, maxZoom, atlas.venueCount));
  };

  const replay = () => {
    setActiveVenueId(null);
    setSkipped(false);
    setPlayhead(0);
    setRun((value) => value + 1);
  };

  const skipToEnd = () => {
    setSkipped(true);
    setPlayhead(Number.POSITIVE_INFINITY);
    followRef.current = false;
    setGlobeView(defaultView);
  };

  const nearestVenue = (clientX: number, clientY: number, maxDistance: number): VenueView | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    let nearest: { view: VenueView; distance: number } | null = null;
    for (const point of onScreenViews) {
      const distance = Math.hypot(point.x - localX, point.y - localY);
      if (!nearest || distance < nearest.distance) nearest = { view: point.view, distance };
    }
    return nearest && nearest.distance <= maxDistance ? nearest.view : null;
  };

  const visibleChapters = [...new Map(filteredViews.map((view) => [view.chapter.seriesId, view.chapter])).values()].sort(
    (left, right) => chapterOrder.indexOf(left.seriesId) - chapterOrder.indexOf(right.seriesId)
  );

  /* ---- the legs drawn so far ---- */
  const doneCount = finished ? legs.length : started ? currentIndex : 0;
  const donePath =
    width > 0
      ? legs
          .slice(0, doneCount)
          .map((leg) => legPath(leg, 0, 1, globeView, width, height))
          .join('')
      : '';
  const livePath = !finished && started && currentLeg && width > 0 ? legPath(currentLeg, 0, currentT, globeView, width, height) : '';
  const headPoint =
    !finished && started && currentLeg && width > 0
      ? (() => {
          const head = legHead(currentLeg, currentT);
          return projectPoint(head.lat, head.lon, legLift(currentLeg, currentT), globeView, width, height);
        })()
      : null;
  const filtering = seriesFilter !== null || regionFilter !== null;
  const modeCounts = legs.reduce(
    (acc, leg) => {
      acc[leg.modeProxy] += 1;
      return acc;
    },
    { drive: 0, flight: 0, same_venue: 0 } as Record<TravelLeg['modeProxy'], number>
  );
  const milesFigure = uiDataPackage.screens.careerLab.lifeStats?.figures.find((figure) => figure.id === 'milesBetweenTracks') ?? null;

  return (
    <section className="career-travel career-atlas" aria-labelledby="career-travel-title">
      <div className="career-section-head">
        <h2 id="career-travel-title" className="career-section-title">
          The travel map
        </h2>
        <SourcePill
          title="The travel map"
          entries={[
            {
              label: 'Natural Earth 1:110m land polygons',
              path: atlas.naturalEarth.sourceUrl,
              note: `Pinned at ${atlas.naturalEarth.sourceCommit.slice(0, 12)} · public domain`
            },
            {
              label: 'Natural Earth terms of use',
              path: atlas.naturalEarth.licenseUrl,
              note: 'Natural Earth states that its raster and vector map data are public domain.'
            },
            ...atlas.sourceRefs.map((source) => ({ label: source.key, path: source.path, note: source.note })),
            ...coordinateSourceEntries
          ]}
          caveats={[...(travel ? [travel.how] : []), ...(milesFigure?.caveat ? [milesFigure.caveat] : []), ...atlas.caveats]}
        />
      </div>
      <div ref={stageRef} className="career-travel__stage">
        <div className="career-travel__side">
          <div className="career-travel__counter" aria-live="off">
            <span className="career-travel__miles" aria-label={`${milesFigure?.display ?? ''} miles between tracks`}>
              <FixedDigits
                text={finished ? milesFigure?.display ?? `${wholeMiles.format(travel?.totalMiles ?? 0)}+` : wholeMiles.format(Math.floor(milesSoFar))}
              />
            </span>
            <span className="career-travel__unit">miles between tracks</span>
          </div>
          {travel ? (
            finished ? (
              <div className="career-travel__leg">
                <span className="career-travel__leg-no">
                  {formatCount.format(travel.legCount)} legs, {formatCount.format(atlas.venueCount)} tracks
                </span>
                <span className="career-travel__leg-route">
                  {modeCounts.drive} short enough to drive, {modeCounts.flight} longer, {modeCounts.same_venue} back at the same track
                </span>
              </div>
            ) : currentLeg ? (
              <div className="career-travel__leg">
                <span className="career-travel__leg-no">
                  Leg {currentLeg.index} of {travel.legCount} · {monthYearShort(currentLeg.to.date)}
                </span>
                <span className="career-travel__leg-route">
                  {currentLeg.greatCircleMiles <= 0
                    ? `${currentLeg.to.trackName}, again`
                    : `${currentLeg.from.trackName} to ${currentLeg.to.trackName}`}
                </span>
                <span className="career-travel__leg-miles">
                  {currentLeg.greatCircleMiles <= 0 ? 'same track' : `${wholeMiles.format(currentLeg.greatCircleMiles)} miles`}
                </span>
              </div>
            ) : null
          ) : null}
          <p className="career-travel__how">
            {travel?.how ?? ''} {milesFigure?.caveat ?? ''}
          </p>
          {!reducedMotion && travel ? (
            <div className="career-travel__controls">
              {finished ? (
                <button type="button" className="career-button" onClick={replay}>
                  Play the journey again
                </button>
              ) : (
                <button type="button" className="career-button" onClick={skipToEnd}>
                  Skip to the end
                </button>
              )}
            </div>
          ) : null}
        </div>
        {/* The card sits outside the map, which clips the globe: a track near
         * the map's top edge still gets its whole card, still and all. */}
        <div className="career-travel__globe" style={{ position: 'relative' }}>
          {activeView && activePoint ? (
            <VenueTipCard
              tip={offsetTip(venueTip(activeView, activePoint, seriesFilter !== null), ref.current)}
              width={width}
              tap={tap}
            />
          ) : null}
          <div
            ref={ref}
            className="career-atlas__map career-atlas__map--globe"
            style={{ height }}
            data-atlas-zoom={globeView.zoom.toFixed(2)}
            data-atlas-longitude={globeView.longitude.toFixed(2)}
            data-atlas-latitude={globeView.latitude.toFixed(2)}
            data-atlas-ready={textureReady ? 'true' : 'false'}
            data-travel-finished={finished ? 'true' : 'false'}
            data-travel-leg={finished ? legs.length : currentIndex + 1}
          >
            <canvas ref={canvasRef} className="career-atlas__globe-canvas" aria-hidden="true" />
            {width > 0 ? (
              <svg
                ref={svgRef}
                width={width}
                height={height}
                role="group"
                aria-roledescription="interactive globe"
                tabIndex={0}
                aria-label={`Globe with the ${travel?.legCount ?? 0} legs between his race meetings drawn in order, and ${filteredViews.length} tracks. Drag to spin. Use the zoom buttons, or the plus and minus keys, to zoom.`}
                onPointerEnter={preloadStills}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (drag && drag.pointerId === event.pointerId) {
                    const dx = event.clientX - drag.startClientX;
                    const dy = event.clientY - drag.startClientY;
                    if (!drag.moved && Math.hypot(dx, dy) > 4) {
                      drag.moved = true;
                      /* A spin lets go of a track a tap was reading. */
                      if (tap.armed !== null) tap.dismiss();
                    }
                    if (drag.moved) {
                      const degreesPerPixel = RAD_TO_DEG / Math.max(height * SPHERE_RADIUS_RATIO * drag.startView.zoom, 1);
                      takeControl();
                      setActiveVenueId(null);
                      setGlobeView(
                        clampView({
                          ...drag.startView,
                          longitude: drag.startView.longitude - dx * degreesPerPixel,
                          latitude: drag.startView.latitude + dy * degreesPerPixel
                        })
                      );
                    }
                    return;
                  }
                  if (event.pointerType !== 'touch') {
                    setActiveVenueId(nearestVenue(event.clientX, event.clientY, 30)?.venue.venueId ?? null);
                  }
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  tap.press(event);
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startView: globeView,
                    moved: false
                  };
                  setIsDragging(true);
                  if (event.pointerType === 'touch') {
                    setActiveVenueId(nearestVenue(event.clientX, event.clientY, 38)?.venue.venueId ?? null);
                  }
                }}
                onPointerUp={(event) => {
                  const drag = dragRef.current;
                  if (drag?.pointerId === event.pointerId && drag.moved) {
                    ignoreClickRef.current = true;
                    window.setTimeout(() => {
                      ignoreClickRef.current = false;
                    }, 0);
                  } else if (event.pointerType === 'touch') {
                    const view = nearestVenue(event.clientX, event.clientY, 38);
                    /* A track read by a tap holds still: the globe stops following the journey. */
                    if (view) takeControl();
                    setActiveVenueId(view?.venue.venueId ?? null);
                    tap.settle(
                      event,
                      view?.venue.venueId ?? null,
                      () => setActiveVenueId(null),
                      view ? () => navigate(view.latestRace.raceHref) : null
                    );
                  }
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  dragRef.current = null;
                  setIsDragging(false);
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setIsDragging(false);
                  setActiveVenueId(null);
                }}
                onPointerLeave={(event) => {
                  /* A finger leaves as it lifts: the track it tapped stays read. */
                  if (event.pointerType === 'touch') return;
                  if (!dragRef.current) setActiveVenueId(null);
                }}
                onClick={(event) => {
                  if (ignoreClickRef.current) {
                    ignoreClickRef.current = false;
                    return;
                  }
                  tap.click(event, () => {
                    const view = nearestVenue(event.clientX, event.clientY, 38);
                    if (view) navigate(view.latestRace.raceHref);
                  });
                }}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) return;
                  if (event.key === '+' || event.key === '=') {
                    event.preventDefault();
                    zoomBy(ZOOM_STEP);
                  } else if (event.key === '-') {
                    event.preventDefault();
                    zoomBy(1 / ZOOM_STEP);
                  } else if (event.key === '0' || event.key === 'Escape') {
                    event.preventDefault();
                    resetView();
                  } else if (event.key.startsWith('Arrow')) {
                    event.preventDefault();
                    rotateByPixels(
                      event.key === 'ArrowLeft' ? 42 : event.key === 'ArrowRight' ? -42 : 0,
                      event.key === 'ArrowUp' ? 42 : event.key === 'ArrowDown' ? -42 : 0
                    );
                  }
                }}
                style={{ cursor: isDragging ? 'grabbing' : activeView ? 'pointer' : 'grab', touchAction: 'none' }}
              >
                <circle
                  cx={width / 2}
                  cy={height / 2}
                  r={height * SPHERE_RADIUS_RATIO * globeView.zoom}
                  fill="none"
                  stroke="var(--divider)"
                  strokeWidth={1}
                  aria-hidden="true"
                />
                <g aria-hidden="true" pointerEvents="none" opacity={filtering ? 0.35 : 1}>
                  {donePath ? (
                    <path d={donePath} fill="none" stroke="var(--ink)" strokeOpacity={0.42} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {livePath ? (
                    <path d={livePath} fill="none" stroke="var(--amber)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                </g>
                {onScreenViews.map((point) => {
                  const view = point.view;
                  const active = view.venue.venueId === activeVenueId;
                  const reached = visitedVenues === null || visitedVenues.has(view.venue.venueId);
                  return (
                    <g key={view.venue.venueId}>
                      {active ? (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={point.radius + 3}
                          fill="none"
                          stroke="var(--ink-primary)"
                          strokeWidth={1}
                          pointerEvents="none"
                        />
                      ) : null}
                      <circle
                        data-atlas-venue={view.venue.venueId}
                        data-race-href={view.latestRace.raceHref}
                        data-track-name={view.venue.trackName}
                        data-series-id={view.chapter.seriesId}
                        data-region={view.venue.region}
                        cx={point.x}
                        cy={point.y}
                        r={point.radius}
                        fill={chapterTint(view.chapter.seriesName)}
                        fillOpacity={!reached ? 0.12 : activeVenueId === null || active ? (active ? 1 : 0.85) : focusFade}
                        stroke="var(--surface-0)"
                        strokeWidth={1.5}
                        role="link"
                        tabIndex={0}
                        aria-label={venueAccessibleLabel(view, seriesFilter !== null)}
                        onFocus={() => setActiveVenueId(view.venue.venueId)}
                        onBlur={() => setActiveVenueId(null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            navigate(view.latestRace.raceHref);
                          }
                        }}
                        className="career-atlas__venue"
                      >
                        <title>{venueAccessibleLabel(view, seriesFilter !== null)}</title>
                      </circle>
                    </g>
                  );
                })}
                {headPoint && headPoint.visible ? (
                  <circle cx={headPoint.x} cy={headPoint.y} r={4.5} fill="var(--amber)" stroke="var(--paper)" strokeWidth={1.5} aria-hidden="true" pointerEvents="none" />
                ) : null}
              </svg>
            ) : null}
            {renderError ? (
              <div className="career-atlas__empty">
                <Unavailable>
                  {renderError}{' '}
                  {filteredViews.length > 0
                    ? 'The series and region filters remain available.'
                    : 'No venues match this series and region combination; the filters remain available.'}
                </Unavailable>
              </div>
            ) : filteredViews.length === 0 ? (
              <div className="career-atlas__empty">
                <Unavailable>No venues match this series and region combination.</Unavailable>
              </div>
            ) : null}
            <div className="career-atlas__zoom" role="group" aria-label="Globe zoom controls">
              <button type="button" aria-label="Zoom in" title="Zoom in" disabled={globeView.zoom >= maxZoom} onClick={() => zoomBy(ZOOM_STEP)}>
                +
              </button>
              <button type="button" aria-label="Zoom out" title="Zoom out" disabled={globeView.zoom <= minZoom} onClick={() => zoomBy(1 / ZOOM_STEP)}>
                −
              </button>
              <button type="button" className="career-atlas__zoom-reset" onClick={resetView}>
                Reset
              </button>
            </div>
          </div>
          <div className="career-travel__below">
            <div className="career-atlas__legend" aria-label="Career chapter colors">
              {visibleChapters.map((chapter) => (
                <span key={chapter.seriesId}>
                  <i aria-hidden style={{ background: chapterTint(chapter.seriesName) }} />
                  {chapter.seriesShort}
                </span>
              ))}
            </div>
            <p className="career-travel__hint">
              Each track a dot, sized by its races and coloured by series. Drag to spin, pinch to zoom, <PointerOpen what="a track" then="to open its latest race" />.
            </p>
            <div className="career-atlas__filters">
              <ControlRow label="Series">
                <FilterChip label="All" active={seriesFilter === null} onClick={() => applyFilters(null, regionFilter)} />
                {seriesOptions.map((series) => (
                  <FilterChip
                    key={series.seriesId}
                    label={series.seriesShort}
                    active={seriesFilter === series.seriesId}
                    onClick={() => applyFilters(seriesFilter === series.seriesId ? null : series.seriesId, regionFilter)}
                  />
                ))}
              </ControlRow>
              <ControlRow label="Region">
                <FilterChip label="All" active={regionFilter === null} onClick={() => applyFilters(seriesFilter, null)} />
                {regionOrder.map((region) => (
                  <FilterChip
                    key={region}
                    label={region}
                    active={regionFilter === region}
                    onClick={() => applyFilters(seriesFilter, regionFilter === region ? null : region)}
                  />
                ))}
              </ControlRow>
            </div>
            <p className="career-atlas__status" aria-live="polite">
              <strong>{filteredViews.length}</strong> {filteredViews.length === 1 ? 'track' : 'tracks'} · <strong>{filteredRaceCount}</strong>{' '}
              {filteredRaceCount === 1 ? 'race' : 'races'} in the filter · <strong>{onScreenViews.length}</strong> on screen
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

