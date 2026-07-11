import nashvilleSuperspeedway from './nashville-superspeedway.json';

/** Outline-only track line art traced from OpenStreetMap geometry
 *  (docs/CREATIVE_DIRECTION.md locked decision 5). Regenerate with
 *  scripts/build-track-outline.mjs; raw OSM responses are cached in
 *  src/assets/tracks/osm/. ODbL attribution ships on the Data screen. */

export interface TrackCornerArc {
  label: string | null;
  apex: { x: number; y: number };
  entryQuarter: { x: number; y: number };
  exitQuarter: { x: number; y: number };
  turnDeg: number;
}

export interface TrackOutline {
  slug: string;
  name: string;
  lengthMi: number;
  viewBox: string;
  mainPath: string;
  pitPath: string | null;
  startFinish: { x: number; y: number; angleDeg: number } | null;
  drivingDirection: 'clockwise' | 'counterclockwise';
  cornerArcs: TrackCornerArc[];
  source: {
    provider: string;
    license: string;
    attribution: string;
    wayIds: number[];
    cachedResponse: string;
  };
}

const outlines: TrackOutline[] = [nashvilleSuperspeedway as TrackOutline];

const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Look up a traced outline by track name; null when we have not traced it yet
 *  (callers must render a no-art state, never a placeholder shape). */
export const trackOutlineFor = (trackName: string | null | undefined): TrackOutline | null => {
  if (!trackName) return null;
  const target = normalized(trackName);
  return outlines.find((outline) => normalized(outline.name) === target) ?? null;
};

export const trackOutlineAttribution =
  'Track outlines traced from OpenStreetMap data © OpenStreetMap contributors, licensed ODbL 1.0.';
