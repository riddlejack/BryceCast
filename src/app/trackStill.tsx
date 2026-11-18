import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { TrackModelSection } from '../three/TrackModel3D';
import { useCoarsePointer } from './charts';
import { StillWeather } from '../three/weather/StillWeather';
import type { SceneWeather } from '../three/weather/sceneWeather';
import './trackStill.css';

/* ============================================================================
 * A picture of the 3D track model, answering the hand (round 6, Nov 16 2026).
 *
 * Wherever a track map repeats or sits small (the landing's standouts, the
 * years at a venue, cards), the site shows a still of the Tracks page's own
 * interactive model at its opening view, shaded for that race exactly as the
 * model shades it (resolveHeatSections, basis 'field_times', inkGoldDiverging).
 * The stills tools render one per race with a section pack and the plain model
 * per venue (Portfolio/…/site-refresh/stills-tools, "run.sh races"), into
 * public/tracks-3d/stills/, with each venue's projected centreline: the
 * outline's arc parameter t (the one the section anchors use) to a point in the
 * picture. The page draws on that centreline: pointing at a section lights it
 * in its own colour, ringed in ink, over a paper veil, and reads its words
 * (the same TrackModelSection words the 3D model's hover reads); a parent can
 * also light a section (the standouts' median lap) or place a dot at a t.
 * No still for a venue: the caller's fallback (the 2D drawing) shows.
 * ==========================================================================*/

export interface StillIndex {
  v: number;
  basis: string | null;
  venues: Record<string, { plain: Record<string, string>; pale?: Record<string, string>; icon: string; geometry: string; width: number; height: number }>;
  races: Record<string, { slug: string; src: Record<string, string> }>;
}

interface StillGeometry {
  slug: string;
  N: number;
  /** Sample i is the outline's t = i / N, as [x, y] shares of the picture. */
  pts: Array<[number, number]>;
  /** Samples the camera cannot see (a building or the ground in front). */
  hidden: number[];
}

let indexValue: StillIndex | null | undefined;
let indexPromise: Promise<StillIndex | null> | null = null;
export const loadStillIndex = (): Promise<StillIndex | null> => {
  indexPromise ??= fetch('/tracks-3d/stills/index.json')
    .then((response) => (response.ok ? (response.json() as Promise<StillIndex>) : null))
    .catch(() => null)
    .then((value) => {
      indexValue = value;
      return value;
    });
  return indexPromise;
};

/** The stills index, or undefined while it loads (null: none could be read). */
export const useStillIndex = (): StillIndex | null | undefined => {
  const [value, setValue] = useState<StillIndex | null | undefined>(indexValue);
  useEffect(() => {
    if (indexValue !== undefined) return;
    let live = true;
    loadStillIndex().then((loaded) => {
      if (live) setValue(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return value;
};

const geometryCache = new Map<string, Promise<StillGeometry | null>>();
const geometryValues = new Map<string, StillGeometry | null>();
const loadGeometry = (url: string): Promise<StillGeometry | null> => {
  let promise = geometryCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((response) => (response.ok ? (response.json() as Promise<StillGeometry>) : null))
      .catch(() => null)
      .then((value) => {
        geometryValues.set(url, value);
        return value;
      });
    geometryCache.set(url, promise);
  }
  return promise;
};

export interface StillPicture {
  kind: 'race' | 'pale' | 'plain';
  src600: string;
  src1200: string;
  width: number;
  height: number;
  geometry: string;
}

/** The picture for a race: its own shaded still; a race with no comparison
 *  to shade, the model with the whole lap in the pale "not compared" lane (the
 *  plain model's ink band would read as "tougher" beside the heat key). No
 *  race: the venue's plain model. Null where the venue has no model. */
export const stillPictureFor = (index: StillIndex | null | undefined, slug: string | null | undefined, sessionId?: string | null): StillPicture | null => {
  if (!index || !slug) return null;
  const venue = index.venues[slug];
  if (!venue) return null;
  const race = sessionId ? index.races[sessionId] : undefined;
  const kind: StillPicture['kind'] = race && race.slug === slug ? 'race' : sessionId && venue.pale ? 'pale' : 'plain';
  const files = kind === 'race' ? race!.src : kind === 'pale' ? venue.pale! : venue.plain;
  return {
    kind,
    src600: files['600'],
    src1200: files['1200'],
    width: venue.width,
    height: venue.height,
    geometry: venue.geometry
  };
};

/** True when the venue has a 3D still (so a caller can drop its 2D drawing). */
export const hasStill = (index: StillIndex | null | undefined, slug: string | null | undefined): boolean =>
  Boolean(index && slug && index.venues[slug]);

const inSpan = (t: number, [t0, t1]: [number, number]): boolean => (t0 <= t1 ? t >= t0 && t < t1 : t >= t0 || t < t1);

/** A point on the centreline at t, or null where the camera cannot see it. */
const pointAt = (geo: StillGeometry, hidden: Set<number>, t: number): [number, number] | null => {
  const f = ((((t % 1) + 1) % 1) * geo.N) % geo.N;
  const i = Math.floor(f);
  const j = (i + 1) % geo.N;
  if (hidden.has(i) || hidden.has(j)) return null;
  const k = f - i;
  const a = geo.pts[i];
  const b = geo.pts[j];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
};

/** The visible runs of a span, as polylines in picture shares. */
const spanRuns = (geo: StillGeometry, hidden: Set<number>, [t0, t1]: [number, number]): Array<Array<[number, number]>> => {
  const length = ((t1 - t0) % 1 + 1) % 1;
  if (length <= 0) return [];
  const steps = Math.max(2, Math.ceil(length * geo.N * 2));
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  for (let s = 0; s <= steps; s += 1) {
    const p = pointAt(geo, hidden, t0 + (length * s) / steps);
    if (p) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
};

const PALE = '#F1EDE6';

export const TrackStill = ({
  slug,
  sessionId = null,
  sections = [],
  interactive,
  lit = null,
  dotT = null,
  alt,
  sizes = '(max-width: 760px) 100vw, 600px',
  fallback = null,
  eager = false,
  className,
  weather
}: {
  /** The venue (outline slug). */
  slug: string | null | undefined;
  /** The race whose shaded still to show; the venue's plain model if it has none. */
  sessionId?: string | null;
  /** The race's sections as the 3D model reads them: spans, colour, words. */
  sections?: TrackModelSection[];
  /** Point at a section to read it (default: when sections are given). */
  interactive?: boolean;
  /** A section lit from outside (the standouts' median lap), by key. */
  lit?: string | null;
  /** A dot on the centreline at this t (the outline's arc parameter). */
  dotT?: number | null;
  alt: string;
  sizes?: string;
  /** Drawn where the venue has no still (the 2D map). */
  fallback?: ReactNode;
  eager?: boolean;
  className?: string;
  /** The race hour's weather over the picture: 'auto' (the race's own, by
   *  sessionId), a SceneWeather, or null for none. Left out: the page's
   *  (TrackWeatherProvider), else none. */
  weather?: SceneWeather | null | 'auto';
}) => {
  const index = useStillIndex();
  const picture = stillPictureFor(index, slug, sessionId);
  const coarse = useCoarsePointer();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [geo, setGeo] = useState<StillGeometry | null>(picture ? geometryValues.get(picture.geometry) ?? null : null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number; pinned: boolean } | null>(null);
  const lastPointer = useRef('mouse');
  const frame = useRef<number | null>(null);
  const canRead = (interactive ?? sections.length > 0) && sections.length > 0;

  useEffect(() => {
    if (!picture) return;
    let live = true;
    loadGeometry(picture.geometry).then((value) => {
      if (live) setGeo(value);
    });
    return () => {
      live = false;
    };
  }, [picture?.geometry]);

  useEffect(() => {
    const box = wrapRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    setWidth(box.clientWidth);
    return () => observer.disconnect();
  }, [picture !== null]);

  /* A tap elsewhere lets go of a pinned section. */
  useEffect(() => {
    if (!hover?.pinned) return;
    const release = (event: globalThis.PointerEvent) => {
      if (wrapRef.current && event.target instanceof Node && wrapRef.current.contains(event.target)) return;
      setHover(null);
    };
    document.addEventListener('pointerdown', release);
    return () => document.removeEventListener('pointerdown', release);
  }, [hover?.pinned]);

  /* A parent that takes the hand away (the standouts while the lap plays)
   * also lets go of what the hand had lit. */
  useEffect(() => {
    if (!canRead) setHover(null);
  }, [canRead]);

  const hidden = useMemo(() => new Set(geo?.hidden ?? []), [geo]);
  const byKey = useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections]);

  if (index === undefined) return <div className={`track-still track-still--wait${className ? ` ${className}` : ''}`} aria-hidden />;
  if (!picture) return <>{fallback}</>;

  const W = picture.width;
  const H = picture.height;
  /* The band in the still is never under 5 CSS px at the 600 px it was drawn
   * at; the lit section is drawn a little wider, ringed in ink. */
  const k = width > 0 ? Math.max(0.55, Math.min(2.2, width / 600)) : 1;
  const fillW = Math.max(4.5, 7 * k);
  const rimW = fillW + Math.max(2.5, 3 * k);

  const sectionAt = (clientX: number, clientY: number): { key: string; x: number; y: number } | null => {
    const box = wrapRef.current;
    if (!box || !geo) return null;
    const rect = box.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const radius = coarse ? 26 : 16;
    let best = -1;
    let bestDist = radius * radius;
    for (let i = 0; i < geo.N; i += 1) {
      if (hidden.has(i)) continue;
      const dx = geo.pts[i][0] * rect.width - x;
      const dy = geo.pts[i][1] * rect.height - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best < 0) return null;
    const t = best / geo.N;
    const section = sections.find((entry) => entry.spans.some((span) => inSpan(t, span)));
    return section ? { key: section.key, x, y } : null;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    lastPointer.current = event.pointerType;
    if (!canRead || event.pointerType === 'touch' || hover?.pinned) return;
    const { clientX, clientY } = event;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const found = sectionAt(clientX, clientY);
      setHover(found ? { ...found, pinned: false } : null);
    });
  };
  const onPointerLeave = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (lastPointer.current !== 'touch' && !hover?.pinned) setHover(null);
  };
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canRead) return;
    const found = sectionAt(event.clientX, event.clientY);
    if (lastPointer.current === 'touch') setHover(found ? { ...found, pinned: true } : null);
    else if (found) setHover({ ...found, pinned: false });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canRead || !geo) return;
    const order = sections;
    const at = hover ? order.findIndex((section) => section.key === hover.key) : -1;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step) {
      event.preventDefault();
      const next = order[(at + step + order.length) % order.length];
      const span = next.spans[0];
      const mid = pointAt(geo, new Set(), span[0] + ((((span[1] - span[0]) % 1) + 1) % 1) / 2) ?? [0.5, 0.5];
      const rect = wrapRef.current?.getBoundingClientRect();
      setHover({ key: next.key, x: mid[0] * (rect?.width ?? 0), y: mid[1] * (rect?.height ?? 0), pinned: true });
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  };

  const shownKey = hover?.key ?? lit;
  const shown = shownKey ? byKey.get(shownKey) ?? null : null;
  const path = (run: Array<[number, number]>) =>
    run.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join('');
  const dot = geo && dotT !== null ? pointAt(geo, hidden, dotT) : null;
  const tip =
    hover && shown ? (
      <div
        className="track-still__tip"
        role="status"
        /* Above the hand (below it near the top edge), so the tip never sits on
         * the section it reads. */
        style={
          hover.y > 110
            ? { left: Math.max(6, Math.min(hover.x + 12, width - 236)), top: hover.y - 16, transform: 'translateY(-100%)' }
            : { left: Math.max(6, Math.min(hover.x + 12, width - 236)), top: hover.y + 20 }
        }
      >
        <strong>{shown.label}</strong>
        <span>{shown.words}</span>
        {shown.detail ? <span className="track-still__tip-detail">{shown.detail}</span> : null}
      </div>
    ) : null;

  return (
    <div
      ref={wrapRef}
      className={`track-still${canRead ? ' track-still--reads' : ''}${shown ? ' is-lit' : ''}${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: `${W} / ${H}` }}
      onPointerMove={canRead ? onPointerMove : undefined}
      onPointerLeave={canRead ? onPointerLeave : undefined}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType;
      }}
      onClick={canRead ? onClick : undefined}
      onKeyDown={canRead ? onKeyDown : undefined}
      tabIndex={canRead ? 0 : undefined}
      role={canRead ? 'group' : undefined}
      aria-label={canRead ? `${alt} ${coarse ? 'Tap' : 'Point at'} a section, or use the arrow keys, to read it.` : undefined}
    >
      <img
        className="track-still__img"
        src={picture.src1200}
        srcSet={`${picture.src600} 600w, ${picture.src1200} 1200w`}
        sizes={sizes}
        width={W}
        height={H}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
      <StillWeather slug={slug} sessionId={sessionId} weather={weather} centreline={geo?.pts ?? null} aspect={W / H} />
      {geo && (shown || dot) ? (
        <svg className="track-still__over" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {shown ? (
            <>
              <rect className="track-still__veil" x={0} y={0} width={W} height={H} />
              {shown.spans.flatMap((span, spanIndex) =>
                spanRuns(geo, hidden, span).map((run, runIndex) => (
                  <g key={`${spanIndex}-${runIndex}`}>
                    <path d={path(run)} fill="none" stroke="var(--ink)" strokeWidth={rimW} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d={path(run)} fill="none" stroke={shown.color ?? PALE} strokeWidth={fillW} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </g>
                ))
              )}
            </>
          ) : null}
          {dot ? (
            <circle cx={dot[0] * W} cy={dot[1] * H} r={(fillW * 0.85 * W) / Math.max(1, width)} fill="var(--ink)" stroke="var(--paper)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
      ) : null}
      {tip}
    </div>
  );
};

/** The Races list's tiny venue mark: the plain model at icon size, or null. */
export const TrackStillIcon = ({ slug, alt = '', fallback = null }: { slug: string | null | undefined; alt?: string; fallback?: ReactNode }) => {
  const index = useStillIndex();
  const venue = index && slug ? index.venues[slug] : null;
  if (!venue) return <>{fallback}</>;
  return <img className="track-still-icon" src={venue.icon} width={152} height={84} alt={alt} loading="lazy" decoding="async" draggable={false} />;
};
