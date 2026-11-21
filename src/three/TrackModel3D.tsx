import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { venueName } from '../app/venueNames';
import { useCoarsePointer, useReducedMotion } from '../app/charts';
import { sunTake, useTrackWeather, weatherCaption, weatherTake, type SceneWeather } from './weather/sceneWeather';
import { WeatherRain } from './weather/WeatherRain';
import type { TrackModelData, TrackScene, TrackSceneHover, TrackSceneMarker } from './trackScene.js';
import { POSTER_SIZES, hasWebgl, loadIndex, loadModel, posterSrcSet, type ModelIndexEntry } from './trackModelLoad';
import './track3d.css';

/* ============================================================================
 * The Tracks page's 3D track model, which is also its section heat map
 * (Jack's review of Nov 16). The model and three.js load only here: this
 * module is itself lazy-loaded by the Tracks layout of SectionHeatCard, and the
 * renderer (./trackScene.js, the film rig's world modules, three r186) is a
 * dynamic import inside it. The Tracks page starts these loads (and the model
 * and its poster) as soon as it knows the venue: trackModelLoad.ts,
 * prefetchTrackModel. Per-venue data is baked by
 * scripts/build-track-models.mjs into public/tracks-3d/models/.
 * Fallback: no WebGL, or no model for the venue, renders `fallback` (the 2D map).
 * ==========================================================================*/

export interface TrackModelSection {
  /** The section's name in the timing data (the bars use the same key). */
  key: string;
  label: string;
  spans: Array<[number, number]>;
  /** Heat colour; null when this scope has no comparison here (drawn pale). */
  color: string | null;
  dashed: boolean;
  /** The words a hover shows: "0.020 s quicker than the field", or why it is not compared. */
  words: string;
  /** A second, quieter line (e.g. "beat 62% of the field this race"). */
  detail?: string | null;
}

type Status = 'checking' | 'fallback' | 'loading' | 'ready';

/** What an overlay drawn over the model (the live page's timing loops and car
 *  dots) needs to place things on the track: where a point of the track is
 *  drawn now. `version` changes with every camera move and resize. */
export interface TrackOverlayView {
  version: number;
  /** CSS px inside the stage for arc parameter `t` on the site outline, `lat`
   *  metres across the track; null behind the camera. */
  project: (t: number, lat?: number) => [number, number] | null;
  /** Half the track's width, in metres. */
  halfWidth: number;
}

export const TrackModel3D = ({
  slug,
  name,
  sections,
  active = null,
  onActiveChange,
  fallback,
  legend,
  caption,
  overlay,
  hint: hintOverride,
  weather: ownWeather,
  markers
}: {
  slug: string;
  name: string;
  sections: TrackModelSection[];
  active?: string | null;
  onActiveChange?: (key: string | null) => void;
  fallback: ReactNode;
  /** The colour key and scope line, shown above the model. */
  legend?: ReactNode;
  /** A sentence before the credits in the caption. */
  caption?: ReactNode;
  /** Drawn over the model once it is ready (the live page's car dots). */
  overlay?: (view: TrackOverlayView) => ReactNode;
  /** Replaces the how-to-turn-it line in the caption. */
  hint?: string;
  /** The race hour's weather to draw on the model (null: none). Left out, the
   *  page's TrackWeatherProvider decides (the Tracks page's selected race). */
  weather?: SceneWeather | null;
  /** Boxes laid on the track at a site t (a driver's grid box on the start straight): see TrackSceneMarker. */
  markers?: TrackSceneMarker[];
}) => {
  const coarse = useCoarsePointer();
  const reduced = useReducedMotion();
  const take = weatherTake();
  const pageWeather = useTrackWeather(ownWeather);
  const weather = take === 'off' ? null : pageWeather;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TrackScene | null>(null);
  const [entry, setEntry] = useState<ModelIndexEntry | null>(null);
  const [status, setStatus] = useState<Status>('checking');
  const [hover, setHover] = useState<TrackSceneHover | null>(null);
  const [atHome, setAtHome] = useState(true);
  const [aspect, setAspect] = useState<number | null>(null);
  const [viewVersion, setViewVersion] = useState(0);
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;
  const project = useCallback((t: number, lat = 0) => sceneRef.current?.projectT(t, lat) ?? null, []);
  /* Only a page that draws over the model re-renders on camera moves. */
  const hasOverlayRef = useRef(Boolean(overlay));
  hasOverlayRef.current = Boolean(overlay);
  const bumpView = useCallback(() => {
    if (hasOverlayRef.current) setViewVersion((value) => value + 1);
  }, []);

  /* Which model, if any, and can this browser draw it. */
  useEffect(() => {
    let live = true;
    setStatus('checking');
    setEntry(null);
    if (!hasWebgl()) {
      setStatus('fallback');
      return;
    }
    loadIndex().then((index) => {
      if (!live) return;
      const found = index?.[slug] ?? null;
      setEntry(found);
      setStatus(found ? 'loading' : 'fallback');
    });
    return () => {
      live = false;
    };
  }, [slug]);

  /* Build the scene once per venue; sections re-shade it below without a reload. */
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  useEffect(() => {
    if (!entry) return;
    let live = true;
    let scene: TrackScene | null = null;
    Promise.all([loadModel<TrackModelData>(entry.file), import('./trackScene.js')])
      .then(async ([data, mod]) => {
        if (!live || !canvasRef.current) return;
        scene = await mod.createTrackScene({
          canvas: canvasRef.current,
          data,
          coarse,
          onHover: (next) => {
            setHover(next);
            onActiveRef.current?.(next?.key ?? null);
          },
          onView: ({ home }) => {
            setAtHome(home);
            bumpView();
          }
        });
        if (!live) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        setAspect(scene.naturalAspect);
        if (import.meta.env.DEV) {
          const w = window as unknown as { __track3d?: TrackScene; __track3dAll?: TrackScene[] };
          w.__track3d = scene;
          w.__track3dAll = [...(w.__track3dAll ?? []).slice(-7), scene];   // for headless checks: every model on the page
        }
        scene.setSections(sectionsRef.current.map(({ key, spans, color, dashed }) => ({ key, spans, color, dashed })));
        setAtHome(true);
        setStatus('ready');
        performance.mark?.('track3d:first-frame');
      })
      .catch((error) => {
        console.error('3D track model failed; showing the 2D map', error);
        if (live) setStatus('fallback');
      });
    return () => {
      live = false;
      sceneRef.current = null;
      scene?.dispose();
      setHover(null);
    };
    // coarse is read once per venue; a pointer change mid-visit keeps the scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const sectionSig = useMemo(
    () => JSON.stringify(sections.map((section) => [section.key, section.spans, section.color, section.dashed])),
    [sections]
  );
  useEffect(() => {
    sceneRef.current?.setSections(sections.map(({ key, spans, color, dashed }) => ({ key, spans, color, dashed })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionSig, status]);

  /* The race hour's weather on the model: its light, wet asphalt, the trees
   * in the wind, and the wind's marker in the world. */
  useEffect(() => {
    if (status !== 'ready') return;
    sceneRef.current?.setWeather(weather, { take, reduced, sun: sunTake() });
  }, [weather, take, reduced, status]);
  const markerSig = JSON.stringify(markers ?? []);
  useEffect(() => {
    if (status !== 'ready') return;
    sceneRef.current?.setMarkers(markers ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSig, status]);
  const windDrift = useCallback(() => {
    const dir = sceneRef.current?.windScreen();
    const kph = weather?.windKph ?? 0;
    return dir ? dir[0] * Math.min(1, kph / 40) * 0.55 : 0;
  }, [weather]);
  // the rain falls over the model only, never on the paper round it
  const rainClip = useCallback(() => sceneRef.current?.screenSilhouette() ?? null, []);

  /* Cross-highlight from the bars: their hover lights the section on the model. */
  useEffect(() => {
    if (!hover) sceneRef.current?.setActive(active);
  }, [active, hover, status]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      sceneRef.current?.resize();
      bumpView();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [status]);

  /* A tap elsewhere on the page lets go of a pinned (tapped) section. */
  useEffect(() => {
    if (!hover?.pinned) return;
    const release = (event: PointerEvent) => {
      if (event.target === canvasRef.current) return;
      setHover(null);
      sceneRef.current?.setActive(null);
      onActiveRef.current?.(null);
    };
    document.addEventListener('pointerdown', release);
    return () => document.removeEventListener('pointerdown', release);
  }, [hover?.pinned]);

  const resetView = useCallback(() => sceneRef.current?.resetView(), []);
  const zoom = useCallback((factor: number) => sceneRef.current?.zoomBy(factor), []);

  if (status === 'fallback') return <>{fallback}</>;

  const hovered = hover ? (hover.key === null ? null : sections.find((section) => section.key === hover.key) ?? null) : null;
  const tip = hover ? (
    <div
      className="track3d__tip"
      role="status"
      style={{
        left: Math.max(8, Math.min(hover.x + 14, (boxRef.current?.clientWidth ?? 600) - 268)),
        top: Math.max(8, hover.y - 64)
      }}
    >
      {hovered ? (
        <>
          <strong>{hovered.label}</strong>
          <span>{hovered.words}</span>
          {hovered.detail ? <span className="track3d__tip-detail">{hovered.detail}</span> : null}
        </>
      ) : (
        <>
          <strong>Between timing loops</strong>
          <span>No section covers this stretch, so it is not compared.</span>
        </>
      )}
    </div>
  ) : null;
  const hint =
    hintOverride ??
    (coarse
      ? 'Drag sideways to turn it, pinch to zoom, tap a section to read it.'
      : 'Drag to turn it, hold ⌘ or Ctrl and scroll to zoom, point at a section to read it.');
  const poster = entry?.poster?.['1200'] ?? null;

  return (
    <figure className="track3d" data-status={status} data-weather={weather ? `${weather.sky}${weather.wet ? ' wet' : ''}` : undefined}>
      {legend ? <div className="track3d__legend">{legend}</div> : null}
      <div
        ref={boxRef}
        className="track3d__stage"
        style={
          aspect
            ? ({
                '--track3d-aspect': Math.max(1.3, Math.min(3.2, aspect)).toFixed(3),
                '--track3d-aspect-phone': Math.max(1.15, Math.min(2.6, aspect)).toFixed(3)
              } as React.CSSProperties)
            : undefined
        }
      >
        {poster && status !== 'ready' ? (
          <img
            className="track3d__poster"
            src={poster}
            srcSet={posterSrcSet(entry?.poster)}
            sizes={POSTER_SIZES}
            alt=""
            aria-hidden
          />
        ) : null}
        <canvas
          ref={canvasRef}
          className="track3d__canvas"
          tabIndex={0}
          aria-label={`${venueName(name)}, a 3D model of the track${sections.length ? ', each section shaded by his pace' : ''}. Arrow keys turn it, plus and minus zoom, 0 goes back to the start view.`}
          role="img"
        />
        {weather && weather.rainIntensity > 0 && status === 'ready' ? (
          <WeatherRain intensity={weather.rainIntensity} drift={windDrift} reduced={reduced} scale={coarse ? 0.8 : 1} clip={rainClip} className="track3d__rain" />
        ) : null}
        {overlay && status === 'ready' && sceneRef.current ? (
          <div className="track3d__overlay">
            {overlay({ version: viewVersion, project, halfWidth: sceneRef.current.trackHalfWidth })}
          </div>
        ) : null}
        {tip}
        <div className="track3d__controls">
          <button type="button" className="track3d__reset" onClick={resetView} disabled={status !== 'ready' || atHome}>
            Back to the start view
          </button>
          <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom in" disabled={status !== 'ready'}>+</button>
          <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom out" disabled={status !== 'ready'}>−</button>
        </div>
      </div>
      <figcaption className="track3d__caption">
        <span className="track3d__hint">{hint}</span>{' '}
        {caption}
        {caption ? ' ' : null}
        {weather ? <span className="track3d__weather" data-track3d-weather>{weatherCaption(weather)} </span> : null}
        {entry?.attribution}
      </figcaption>
    </figure>
  );
};

export default TrackModel3D;
