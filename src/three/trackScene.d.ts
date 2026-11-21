/** Types for trackScene.js (plain JS: it drives the film rig's world modules, copied read-only under ./rig/). */
export interface TrackSceneSection {
  key: string;
  /** [startT, endT] on the site outline's arc parameter, as the section anchors carry them. */
  spans: Array<[number, number]>;
  /** The heat colour, or null for a section with no comparison in this scope (drawn pale). */
  color: string | null;
  /** Derived from lap time (drawn dashed, as the 2D map dots it). */
  dashed: boolean;
}
export interface TrackSceneHover {
  /** The section under the pointer, or null on a stretch no section covers. */
  key: string | null;
  x: number;
  y: number;
  pinned: boolean;
}
/** A box laid on the asphalt at a point of the lap (trackScene.js setMarkers). */
export interface TrackSceneMarker {
  id: string;
  /** The site outline's arc parameter, as projectT and the section spans read it. */
  t: number;
  /** A resolved CSS colour (series colours from chapterTint / --chapter-*); the ink when left out. */
  color?: string;
  /** Along the track, metres (default 7). */
  lengthM?: number;
  /** Across the track, metres (default 3). */
  widthM?: number;
  /** The box centre's offset across the track, metres, positive to the left of the driving direction (default 0). */
  lat?: number;
  /** The outline's width, metres (default 0.5; never under about a pixel). */
  lineM?: number;
  /** 0..1, a tint of the colour inside the outline (default 0). */
  fill?: number;
  /** Never drawn under this many CSS px along the track (default 10), so it reads far off. */
  minPx?: number;
}
export interface TrackModelData {
  v: number;
  slug: string;
  name: string;
  kind: 'laguna' | 'venue' | 'city';
  camera: { azim: number; elev: number; fill: number };
  map: { ns: number; dir: number; u: number[]; rmsM: number; worstM: number };
  attribution: string;
  poster: Record<string, string> | null;
  model: unknown;
}
export interface TrackScene {
  /** The opening view's own width to height (its framed box, at 16:9). */
  naturalAspect: number;
  setSections(list: TrackSceneSection[]): void;
  setActive(key: string | null): void;
  resetView(): void;
  zoomBy(factor: number): void;
  resize(): void;
  dispose(): void;
  stats(): { frames: number; lastMs: number; times: number[]; atHome: boolean };
  screenPointOf(key: string): [number, number] | null;
  orbitBy(dAzim: number, dElev: number): void;
  /** Where a point on the track is drawn now, in CSS px inside the canvas: `t` on the site outline's arc parameter,
   *  `lat` metres across the track. Null behind the camera. */
  projectT(t: number, lat?: number): [number, number] | null;
  /** Half the track's width, in metres. */
  trackHalfWidth: number;
  /** The race hour's weather on the model (weather/weatherScene.js); null clears it. */
  setWeather(weather: import('./weather/sceneWeather').SceneWeather | null, opts?: { take?: string; reduced?: boolean; sun?: 'race' | 'fixed' }): void;
  /** Boxes on the track at site positions; [] clears them. */
  setMarkers(markers: TrackSceneMarker[]): void;
  /** The downwind ground direction on screen now, as a unit [dx, dy] in CSS px axes; null in still air or no bearing. */
  windScreen(): [number, number] | null;
  weatherInfo(): Record<string, unknown>;
  /** The slab's outline on screen now (CSS px): its top and bottom rings; `key` changes with the view. */
  screenSilhouette(): { key: string; top: [number, number][]; bottom: [number, number][] };
}
export function webglAvailable(): boolean;
export function createTrackScene(options: {
  canvas: HTMLCanvasElement;
  data: TrackModelData;
  coarse?: boolean;
  onHover?: (hover: TrackSceneHover | null) => void;
  onView?: (view: { home: boolean }) => void;
}): Promise<TrackScene>;
