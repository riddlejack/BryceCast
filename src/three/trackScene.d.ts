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
}
export function webglAvailable(): boolean;
export function createTrackScene(options: {
  canvas: HTMLCanvasElement;
  data: TrackModelData;
  coarse?: boolean;
  onHover?: (hover: TrackSceneHover | null) => void;
  onView?: (view: { home: boolean }) => void;
}): Promise<TrackScene>;
