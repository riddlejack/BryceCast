import { useEffect, useMemo, useRef, useState } from 'react';
// `?url` (a separate, independently-cacheable asset), not `?inline`: inlining
// this 44 KB PNG as base64 grew it ~33% and folded it into the CareerScreen
// JS chunk, where it compressed far worse alongside code than the PNG's own
// DEFLATE data does on its own, and it had to be re-downloaded on every code
// change to that chunk. As a `?url` asset it's a normal `<img>`-style fetch —
// decoded by the browser's native image pipeline and cached for a year
// (immutable, see scripts/api-server.mjs) independent of app code.
import worldLandTextureUrl from '../../analysis/career-atlas/output/world_land_texture.png?url';
import { Card, SourcePill, Unavailable } from '../app/components';
import { focusFade, useMeasuredWidth } from '../app/charts';
import { useRouter } from '../app/router';
import {
  uiDataPackage,
  type UiCareerAtlasSeriesSpan,
  type UiCareerAtlasVenue
} from '../data/uiDataPackage';
import { chapterTint, ControlRow, FilterChip } from './careerExplorer';

const formatCount = new Intl.NumberFormat('en-US');
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SPHERE_RADIUS_RATIO = 0.46;
const ZOOM_STEP = 1.55;

const chapterOrder = [
  'series_frp_f1600',
  'series_formula_ford',
  'series_gb3',
  'series_euroformula_open',
  'series_froc',
  'series_imsa_weathertech',
  'series_indy_nxt'
];

const regionOrder = ['North America', 'Europe', 'Oceania'] as const;

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

const venueDetail = (view: VenueView): string =>
  [
    `${formatCount.format(view.raceCount)} ${view.raceCount === 1 ? 'race' : 'races'}`,
    chapterLine(view.chapter),
    view.bestFinish === null ? null : `best P${view.bestFinish}`,
    view.venue.country
  ]
    .filter(Boolean)
    .join(' · ');

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

const AtlasTipCard = ({ view, x, y, width }: { view: VenueView; x: number; y: number; width: number }) => {
  const cardWidth = Math.min(330, Math.max(width - 16, 190));
  const left = Math.min(Math.max(x, cardWidth / 2 + 4), Math.max(width - cardWidth / 2 - 4, cardWidth / 2 + 4));
  const below = y < 84;
  return (
    <div
      className="career-atlas__tip"
      role="status"
      aria-live="polite"
      style={{
        left,
        top: y,
        width: cardWidth,
        transform: below ? 'translate(-50%, 12px)' : 'translate(-50%, calc(-100% - 12px))'
      }}
    >
      <strong>{view.venue.trackName}</strong>
      <span>{venueDetail(view)}</span>
      <span className="career-atlas__tip-action">open the latest applicable race</span>
    </div>
  );
};

export const CareerAtlas = () => {
  const atlas = uiDataPackage.screens.careerLab.atlas;
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rendererRef = useRef<GlobeRenderer | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const ignoreClickRef = useRef(false);
  const wheelZoomRef = useRef<((event: WheelEvent) => void) | null>(null);
  const { navigate } = useRouter();
  const minZoom = atlas.globe.zoom.min;
  const maxZoom = atlas.globe.zoom.max;
  const defaultView = useMemo<GlobeView>(
    () => ({
      zoom: minZoom,
      longitude: atlas.globe.defaultCenter.longitude,
      latitude: atlas.globe.defaultCenter.latitude
    }),
    [atlas.globe.defaultCenter.latitude, atlas.globe.defaultCenter.longitude, minZoom]
  );
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<AtlasRegion | null>(null);
  const [globeView, setGlobeView] = useState<GlobeView>(defaultView);
  const [isDragging, setIsDragging] = useState(false);
  const [textureReady, setTextureReady] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

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
  const height = Math.max(240, Math.min(540, width * 0.58));
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
      <Card title="The map">
        <Unavailable>The career atlas is unavailable until its sourced venue and globe artifacts are rebuilt.</Unavailable>
      </Card>
    );
  }

  const clampView = (candidate: GlobeView): GlobeView => ({
    zoom: Math.max(minZoom, Math.min(maxZoom, candidate.zoom)),
    longitude: wrapLongitude(candidate.longitude),
    latitude: clampLatitude(candidate.latitude)
  });

  const applyFilters = (nextSeries: string | null, nextRegion: AtlasRegion | null) => {
    const nextViews = viewsFor(nextSeries, nextRegion);
    setSeriesFilter(nextSeries);
    setRegionFilter(nextRegion);
    setActiveVenueId(null);
    setGlobeView(fitGlobeToViews(nextViews, defaultView, minZoom, maxZoom, atlas.venueCount));
  };

  const zoomBy = (factor: number) => {
    setActiveVenueId(null);
    setGlobeView((current) => clampView({ ...current, zoom: current.zoom * factor }));
  };

  wheelZoomRef.current = (event) => {
    event.preventDefault();
    event.stopPropagation();
    zoomBy(event.deltaY < 0 ? 1.18 : 1 / 1.18);
  };

  const rotateByPixels = (x: number, y: number) => {
    const degreesPerPixel = RAD_TO_DEG / Math.max(height * SPHERE_RADIUS_RATIO * globeView.zoom, 1);
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
    setActiveVenueId(null);
    setGlobeView(fitGlobeToViews(filteredViews, defaultView, minZoom, maxZoom, atlas.venueCount));
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

  return (
    <Card
      title="The map"
      className="career-atlas"
      action={
        <SourcePill
          title="The career atlas"
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
          caveats={atlas.caveats}
        />
      }
    >
      <p className="career-atlas__intro">
        {formatCount.format(atlas.venueCount)} venues, {formatCount.format(atlas.raceCount)} races. Filter the career, then spin and zoom the full globe.
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
        <strong>{filteredViews.length}</strong> {filteredViews.length === 1 ? 'venue' : 'venues'} · <strong>{filteredRaceCount}</strong>{' '}
        {filteredRaceCount === 1 ? 'race' : 'races'} in the filter · <strong>{onScreenViews.length}</strong> on screen
      </p>
      <div
        ref={ref}
        className="career-atlas__map career-atlas__map--globe"
        style={{ height }}
        data-atlas-zoom={globeView.zoom.toFixed(2)}
        data-atlas-longitude={globeView.longitude.toFixed(2)}
        data-atlas-latitude={globeView.latitude.toFixed(2)}
        data-atlas-ready={textureReady ? 'true' : 'false'}
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
            aria-label={`Career venue globe with ${filteredViews.length} sourced venues and ${filteredRaceCount} races in the current filter; ${onScreenViews.length} venues are on screen. Drag to spin. Use the controls or mouse wheel to zoom.`}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (drag && drag.pointerId === event.pointerId) {
                const dx = event.clientX - drag.startClientX;
                const dy = event.clientY - drag.startClientY;
                if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
                if (drag.moved) {
                  const degreesPerPixel = RAD_TO_DEG / Math.max(height * SPHERE_RADIUS_RATIO * drag.startView.zoom, 1);
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
            onPointerLeave={() => {
              if (!dragRef.current) setActiveVenueId(null);
            }}
            onClick={(event) => {
              if (ignoreClickRef.current) {
                ignoreClickRef.current = false;
                return;
              }
              const view = nearestVenue(event.clientX, event.clientY, 38);
              if (view) navigate(view.latestRace.raceHref);
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
            {onScreenViews.map((point) => {
              const view = point.view;
              const active = view.venue.venueId === activeVenueId;
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
                    fillOpacity={activeVenueId === null || active ? (active ? 1 : 0.7) : focusFade}
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
        {activeView && activePoint ? (
          <AtlasTipCard view={activeView} x={activePoint.x} y={activePoint.y} width={width} />
        ) : null}
        <div className="career-atlas__map-hint" aria-hidden>
          drag to spin · scroll to zoom
        </div>
        <div className="career-atlas__zoom" role="group" aria-label="Globe zoom controls">
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={globeView.zoom >= maxZoom}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={globeView.zoom <= minZoom}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            −
          </button>
          <button type="button" className="career-atlas__zoom-reset" onClick={resetView}>
            Reset
          </button>
        </div>
      </div>
      <div className="career-atlas__legend" aria-label="Career chapter colors">
        {visibleChapters.map((chapter) => (
          <span key={chapter.seriesId}>
            <i aria-hidden style={{ background: chapterTint(chapter.seriesName) }} />
            {chapter.seriesShort}
          </span>
        ))}
      </div>
      <p className="caption caption--secondary career-atlas__caption">
        Every venue a dot · sized by races in filter · colored by chapter · click to open the latest applicable race
      </p>
    </Card>
  );
};
