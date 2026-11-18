import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useCoarsePointer } from '../app/charts';
import { TAP_CARD, TapAction, useTouchPlacement, type TapPreview } from '../app/tapPreview';
import { useVenuePicture, type VenueRef } from '../app/venuePeek';
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
 *   - RowPicture: each row's track. The 3D still where the venue has a model
 *     (venuePeek: the race's own still, the layout he raced, the venue), then
 *     the bird's-eye icon, then the 2D line drawing, then an empty slot that
 *     fills as the 3D venue lane's models land. `?racepic=icon` shows round
 *     seven's bird's-eye icons instead, for comparison.
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
      {picture ? <img className="rsc__still" src={picture.src600} width={picture.width} height={picture.height} alt="" decoding="async" /> : null}
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
    <div ref={ref} className="tap-card rsc-tap" style={tap ? place : { ...place, pointerEvents: 'none' }} {...{ [TAP_CARD]: '' }} role="status">
      {picture ? <img className="rsc__still rsc-tap__still" src={picture.src600} width={picture.width} height={picture.height} alt="" decoding="async" /> : null}
      <div className="rsc-tap__body">
        <CardBody {...body} />
      </div>
      <TapAction tap={tap} label={action} />
    </div>
  );
};

/* ---------- the row's track ---------- */

export const RowPicture = ({ venue, muted = false }: { venue: VenueRef; muted?: boolean }) => {
  const look = racePic();
  const picture = useVenuePicture(venue);
  const outline = trackOutlineFor(venue.trackName);
  const line = outline ? (
    <svg viewBox={outline.viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path
        d={outline.mainPath}
        fill="none"
        stroke={muted ? 'var(--ink-muted)' : 'var(--ink-secondary)'}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  ) : null;
  const icon = <TrackIcon slug={outline?.slug} box="row" muted={muted} fallback={line} />;
  return (
    <span className={`race-row__mini race-row__mini--${look}${muted ? ' race-row__mini--muted' : ''}`} aria-hidden>
      {look === 'still' && picture ? (
        <img className="race-row__still" src={picture.src600} width={picture.width} height={picture.height} alt="" loading="lazy" decoding="async" draggable={false} />
      ) : look === 'still' && picture === undefined ? null : (
        icon
      )}
    </span>
  );
};
