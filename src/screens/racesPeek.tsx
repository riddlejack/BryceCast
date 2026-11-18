import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCoarsePointer } from '../app/charts';
import { TAP_CARD, TapAction, useTouchPlacement, type TapPreview } from '../app/tapPreview';
import { CardStill, useVenuePicture, type VenueRef } from '../app/venuePeek';
import type { StillPicture } from '../app/trackStill';
import { TrackIcon } from '../app/trackArt';
import { trackOutlineFor } from '../assets/tracks';
import { switchValue } from '../review/switches';

/* ============================================================================
 * The Races page's track pictures (career round 2, November 17, 2026).
 *
 *   - RaceStillCard: the card a season-spine dot shows, in the Career
 *     explorer's grammar (.ddx-card): the track's 3D still on top, then the
 *     series swatch and year, the race, its numbers. On a phone the same card
 *     sits where the touch card sits, with the "Open the race" button.
 *   - RowPicture: each row's track, the lap drawn bold in ink over the
 *     venue's 3D still (see below). `?racepic=icon` shows round seven's
 *     bird's-eye icons instead, for comparison.
 * ==========================================================================*/

export type RacePic = 'still' | 'icon';
export const racePic = (): RacePic => (switchValue('racepic') === 'icon' ? 'icon' : 'still');

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export interface RaceStillCardProps {
  venue: VenueRef;
  /** The mark's centre in the container, and its radius. */
  x: number;
  y: number;
  r: number;
  /** The container's width. */
  width: number;
  swatch: string;
  meta: string;
  title: string;
  nums: ReactNode;
  note?: string | null;
  action?: string;
  tap?: TapPreview;
}

export const RaceStillCard = (props: RaceStillCardProps) => {
  const coarse = useCoarsePointer();
  if (coarse || (props.tap && props.tap.armed !== null)) return <TouchStillCard {...props} />;
  return <MouseStillCard {...props} />;
};

const CardBody = ({ swatch, meta, title, nums, note }: Pick<RaceStillCardProps, 'swatch' | 'meta' | 'title' | 'nums' | 'note'>) => (
  <>
    <span className="rsc__meta">
      <i style={{ background: swatch }} />
      {meta}
    </span>
    <strong className="rsc__title">{title}</strong>
    <span className="rsc__nums">{nums}</span>
    {note ? <span className="rsc__note">{note}</span> : null}
  </>
);

const MouseStillCard = ({ venue, x, y, r, width, action = 'open the race', ...body }: RaceStillCardProps) => {
  const picture = useVenuePicture(venue);
  const ref = useRef<HTMLDivElement | null>(null);
  /* Where the chart sits on the screen: the card opens above the dot whenever
   * the screen has room for it there (it may rise over the chart's heading),
   * below it only near the top of the screen. */
  const [parentTop, setParentTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.offsetParent;
    if (parent instanceof HTMLElement) setParentTop(parent.getBoundingClientRect().top);
  }, [x, y]);
  const cardW = picture ? 272 : 240;
  const cardH = picture ? Math.round((cardW * picture.height) / picture.width) + 98 : 98;
  const navRoom = 76;
  const below = parentTop === null ? y - r - 12 < cardH : parentTop + y - r - 12 - cardH < navRoom;
  return (
    <div
      ref={ref}
      className={`rsc${below ? ' rsc--below' : ''}`}
      style={{
        left: clamp(x, cardW / 2 + 2, Math.max(width - cardW / 2 - 2, cardW / 2 + 2)),
        top: below ? y + r + 10 : y - r - 10,
        width: cardW
      }}
      role="status"
    >
      {picture ? <CardStill className="rsc__still" venue={venue} picture={picture} /> : null}
      <div className="rsc__body">
        <CardBody {...body} />
        <span className="rsc__action">Click to {action}</span>
      </div>
    </div>
  );
};

const TouchStillCard = ({ venue, x, y, r, action = 'open the race', tap, ...body }: RaceStillCardProps) => {
  const picture = useVenuePicture(venue);
  const ref = useRef<HTMLDivElement | null>(null);
  const place = useTouchPlacement(ref, x, y - r, y + r, `${body.title}|${picture?.src600 ?? ''}|${tap?.openArmed ? 1 : 0}`);
  return (
    <div ref={ref} className="tap-card rsc-tap" style={place} {...{ [TAP_CARD]: '' }} role="status">
      {picture ? <CardStill className="rsc__still rsc-tap__still" venue={venue} picture={picture} /> : null}
      <div className="rsc-tap__body">
        <CardBody {...body} />
      </div>
      <TapAction tap={tap} label={action} />
    </div>
  );
};

/* ---------- the row's track ----------
 * Proxy review 1, fault 3: at row size the still's own racing line is a pale
 * hair and the track barely reads. Round 7's icon read because the line was
 * bold, and Jack picked "3D from straight above, track drawn in bold". So the
 * row draws the lap itself, bold in ink, on the still's projected centreline
 * (the same geometry TrackStill draws on), over the venue's plain still
 * cropped to the track. A venue with no model: round 7's icon, else the 2D
 * line, else a quiet stand-in, so an opened year never shows an empty hole.
 * Models the 3D lane adds reach the rows through the stills index aliases. */

interface StillGeometry {
  N: number;
  pts: Array<[number, number]>;
}

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

const useGeometry = (url: string | null): StillGeometry | null | undefined => {
  const [value, setValue] = useState<StillGeometry | null | undefined>(url ? geometryValues.get(url) : null);
  useEffect(() => {
    if (!url) {
      setValue(null);
      return;
    }
    if (geometryValues.has(url)) {
      setValue(geometryValues.get(url));
      return;
    }
    let live = true;
    loadGeometry(url).then((loaded) => {
      if (live) setValue(loaded);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return value;
};

/** The slot's shape (104 x 58 on a wide screen, 64 x 36 on a phone). */
const SLOT = 104 / 58;

const BoldStill = ({ picture }: { picture: StillPicture }) => {
  const geo = useGeometry(picture.geometry);
  const W = picture.width;
  const H = picture.height;
  const crop = useMemo(() => {
    if (!geo || geo.pts.length < 3) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of geo.pts) {
      x0 = Math.min(x0, x * W);
      x1 = Math.max(x1, x * W);
      y0 = Math.min(y0, y * H);
      y1 = Math.max(y1, y * H);
    }
    /* The track's box, a margin round it, widened to the slot's shape. */
    const pad = Math.max(x1 - x0, y1 - y0) * 0.09;
    let w = x1 - x0 + pad * 2;
    let h = y1 - y0 + pad * 2;
    if (w / h < SLOT) w = h * SLOT;
    else h = w / SLOT;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const d = geo.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join('') + 'Z';
    return { box: `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`, d };
  }, [geo, W, H]);
  if (!crop) {
    /* Until the line's geometry arrives (or where it can't be read): the still. */
    return <img className="race-row__still" src={picture.src600} width={W} height={H} alt="" loading="lazy" decoding="async" draggable={false} />;
  }
  return (
    <svg className="race-row__still race-row__still--bold" viewBox={crop.box} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <image href={picture.src600} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
      <path d={crop.d} fill="none" stroke="var(--paper)" strokeOpacity={0.75} strokeWidth={5.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={crop.d} fill="none" stroke="var(--ink)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const RowPicture = ({ venue, muted = false }: { venue: VenueRef; muted?: boolean }) => {
  const look = racePic();
  /* The row is a mark for the venue, not the race's heat: the plain model. */
  const picture = useVenuePicture({ ...venue, plain: true });
  const outline = trackOutlineFor(venue.trackName);
  const standIn = <span className="race-row__standin" />;
  const line = outline ? (
    <svg viewBox={outline.viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path
        d={outline.mainPath}
        fill="none"
        stroke={muted ? 'var(--ink-muted)' : 'var(--ink)'}
        strokeWidth={2.4}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    standIn
  );
  const icon = <TrackIcon slug={outline?.slug} box="row" muted={muted} fallback={line} />;
  return (
    <span className={`race-row__mini race-row__mini--${look}${muted ? ' race-row__mini--muted' : ''}`} aria-hidden>
      {look === 'still' && picture ? <BoldStill picture={picture} /> : look === 'still' && picture === undefined ? standIn : icon}
    </span>
  );
};
