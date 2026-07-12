import barberMotorsportsPark from './barber-motorsports-park.json';
import indianapolisMotorSpeedwayRoadCourse from './indianapolis-motor-speedway-road-course.json';
import iowaSpeedway from './iowa-speedway.json';
import midOhioSportsCarCourse from './mid-ohio-sports-car-course.json';
import nashvilleSuperspeedway from './nashville-superspeedway.json';
import portlandInternationalRaceway from './portland-international-raceway.json';
import roadAmerica from './road-america.json';
import streetsOfArlington from './streets-of-arlington.json';
import streetsOfDetroit from './streets-of-detroit.json';
import streetsOfStPetersburg from './streets-of-st-petersburg.json';
import theMilwaukeeMile from './the-milwaukee-mile.json';
import weathertechRacewayLagunaSeca from './weathertech-raceway-laguna-seca.json';
import worldWideTechnologyRaceway from './world-wide-technology-raceway.json';

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
  drivingDirection: 'clockwise' | 'counterclockwise' | null;
  cornerArcs: TrackCornerArc[];
  source: {
    provider: string;
    license: string;
    attribution: string;
    wayIds: number[];
    cachedResponse: string;
  };
}

const outlines: TrackOutline[] = [
  barberMotorsportsPark,
  indianapolisMotorSpeedwayRoadCourse,
  iowaSpeedway,
  midOhioSportsCarCourse,
  nashvilleSuperspeedway,
  portlandInternationalRaceway,
  roadAmerica,
  streetsOfArlington,
  streetsOfDetroit,
  streetsOfStPetersburg,
  theMilwaukeeMile,
  weathertechRacewayLagunaSeca,
  worldWideTechnologyRaceway
] as TrackOutline[];

const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Analytics packs sometimes name venues differently than the canonical
 *  tracks table; map known synonyms onto asset slugs. */
const aliasSlugs: Record<string, string> = {
  'detroit downtown street circuit': 'streets-of-detroit',
  'grand prix of arlington street circuit': 'streets-of-arlington'
};

/** Look up a traced outline by track name; null when we have not traced it yet
 *  (callers must render a no-art state, never a placeholder shape). */
export const trackOutlineFor = (trackName: string | null | undefined): TrackOutline | null => {
  if (!trackName) return null;
  const target = normalized(trackName);
  const aliasSlug = aliasSlugs[target];
  if (aliasSlug) return outlines.find((outline) => outline.slug === aliasSlug) ?? null;
  return outlines.find((outline) => normalized(outline.name) === target) ?? null;
};

export const trackOutlineAttribution =
  'Permanent-circuit outlines traced from OpenStreetMap data © OpenStreetMap contributors (ODbL 1.0); street-circuit outlines traced from official INDYCAR track maps.';
