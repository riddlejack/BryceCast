import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from '../../app/charts';
import { sceneWeatherFor, usePageDrawsWeather, useTrackWeather, weatherTake, type SceneWeather } from './sceneWeather';
import { WeatherRain } from './WeatherRain';
import FRAMES from './stillFrames.json';
import './weather.css';

/* ============================================================================
 * The race hour's weather over a still of the 3D model (the hover cards, the
 * years row): the same look as the live model, made light (career round 2).
 *  - the sky: the picture's colour drained a little under cloud and rain (the
 *    paper is neutral, so it stays paper);
 *  - rain: fine streaks falling, drifting with the wind;
 *  - wind: a small ink arrow laid on the picture's own ground plane (the
 *    still's camera, baked in stillFrames.json, foreshortens it as the model's
 *    ground is), on the side of the picture the track leaves free.
 * Lay it inside the still's positioned box, over the <img>:
 *   <StillWeather slug={slug} sessionId={sessionId} weather="auto" />   the race's own weather
 *   <StillWeather slug={slug} weather={weatherOrNull} />                given outright
 *   <StillWeather slug={slug} sessionId={sessionId} />                  inside a TrackWeatherProvider: as 'auto'
 * ==========================================================================*/

type Frame = { azim: number; elev: number; north: [number, number] };
const frames = FRAMES as unknown as Record<string, Frame>;

/** The downwind direction and the ground's sideways direction, projected into the picture (x right, y down). */
const projectGround = (frame: Frame, fromDeg: number) => {
  const az = (frame.azim * Math.PI) / 180;
  const sinEl = Math.sin((frame.elev * Math.PI) / 180);
  const [nx, nz] = frame.north;
  const ex = -nz;
  const ez = nx;
  const b = ((fromDeg + 180) * Math.PI) / 180;
  const dx = nx * Math.cos(b) + ex * Math.sin(b);
  const dz = nz * Math.cos(b) + ez * Math.sin(b);
  // screen right = (cos az, -sin az) on the ground; toward the camera = (sin az, cos az), drawn down by sin(elev)
  const toScreen = (x: number, z: number): [number, number] => [x * Math.cos(az) - z * Math.sin(az), (x * Math.sin(az) + z * Math.cos(az)) * sinEl];
  return { along: toScreen(dx, dz), across: toScreen(-dz, dx) };
};

/** Picture shares [x, y] of each corner spot, and how clear of the track it is (centreline samples). */
const SPOTS: Array<[number, number]> = [
  [0.9, 0.16],
  [0.1, 0.16],
  [0.1, 0.84],
  [0.9, 0.84]
];

export const StillWeather = ({
  slug,
  sessionId = null,
  weather: given,
  centreline = null,
  aspect = 1200 / 676
}: {
  slug: string | null | undefined;
  /** The race, for weather="auto". */
  sessionId?: string | null;
  /** 'auto': the race's own weather (sessionId); null: none. Left out: inside a
   *  TrackWeatherProvider, the still's own race's weather (so a row of years
   *  shows each year's sky), or the page's for a still of no one race. */
  weather?: SceneWeather | null | 'auto';
  /** The still's projected centreline (shares of the picture), to keep the arrow off the track. */
  centreline?: Array<[number, number]> | null;
  /** The picture's width over height. */
  aspect?: number;
}) => {
  const reduced = useReducedMotion();
  const fromPage = useTrackWeather(given === 'auto' ? undefined : given);
  const pageDraws = usePageDrawsWeather();
  const weather =
    given === 'auto' || (given === undefined && pageDraws && sessionId) ? sceneWeatherFor(sessionId) : fromPage;
  const take = weatherTake();
  const frame = slug ? frames[slug] : undefined;
  const arrow = useMemo(() => {
    if (!weather || !frame || weather.windFromDeg === null || (weather.windKph ?? 0) < 3) return null;
    const { along, across } = projectGround(frame, weather.windFromDeg);
    // the corner the track leaves most room in (the top right first)
    let spot = SPOTS[0];
    if (centreline?.length) {
      let bestRoom = -1;
      for (const [sx, sy] of SPOTS) {
        let room = Infinity;
        for (const [px, py] of centreline) room = Math.min(room, Math.hypot((px - sx) * aspect, py - sy));
        if (room > bestRoom + 0.04) {
          bestRoom = room;
          spot = [sx, sy];
        }
      }
    }
    return { along, across, spot };
  }, [weather, frame, centreline, aspect]);
  if (!weather || take === 'off') return null;

  // the arrow in a 100 x (100 / aspect) box: length by the wind (the live model's rule), its head as wide as the ground lets it look
  const H = 100 / aspect;
  const k = Math.min(1, (weather.windKph ?? 0) / 30);
  const len = 9.5 * (0.62 + 0.38 * k);
  let path: string | null = null;
  if (arrow) {
    const [cx, cy] = [arrow.spot[0] * 100, arrow.spot[1] * H];
    // the ground's own foreshortening, but never under 55% of the full length (an arrow pointing at the camera still reads)
    const scale = 1 / Math.max(0.55, Math.hypot(arrow.along[0], arrow.along[1]));
    const ux = arrow.along[0] * scale;
    const uy = arrow.along[1] * scale;
    const px = arrow.across[0] * scale;
    const py = arrow.across[1] * scale;
    const pt = (s: number, w: number) => `${(cx + ux * s * len + px * w * len).toFixed(2)} ${(cy + uy * s * len + py * w * len).toFixed(2)}`;
    path = `M${pt(-0.5, 0)} L${pt(0.17, 0)} M${pt(0.5, 0)} L${pt(0.12, 0.12)} L${pt(0.17, 0)} L${pt(0.12, -0.12)} Z`;
  }
  return (
    <span className={`wx-still wx-still--${weather.sky}${weather.wet ? ' wx-still--wet' : ''}`} aria-hidden data-wx-still={weather.sky}>
      <span className="wx-still__sky" />
      {weather.rainIntensity > 0 ? <WeatherRain intensity={weather.rainIntensity * 0.8} drift={() => (arrow ? (arrow.along[0] / (Math.hypot(...arrow.along) || 1)) * k * 0.5 : 0)} reduced={reduced} scale={0.6} className="wx-still__rain" /> : null}
      {path ? (
        <svg className="wx-still__arrow" viewBox={`0 0 100 ${H.toFixed(2)}`} preserveAspectRatio="none">
          <path d={path} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </span>
  );
};

/** The still's projected centreline, for StillWeather's spot (null until it loads). */
export const useStillCentreline = (geometryUrl: string | null | undefined): Array<[number, number]> | null => {
  const [pts, setPts] = useState<Array<[number, number]> | null>(null);
  useEffect(() => {
    if (!geometryUrl) return undefined;
    let live = true;
    fetch(geometryUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { pts?: Array<[number, number]> } | null) => {
        if (live) setPts(g?.pts ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [geometryUrl]);
  return pts;
};
