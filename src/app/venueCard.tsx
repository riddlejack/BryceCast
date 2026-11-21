import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { TrackOutline } from '../assets/tracks';
import { useCoarsePointer, type ChartTip } from './charts';
import { TAP_CARD, TapAction, useTouchPlacement, type TapPreview } from './tapPreview';
import { CardStill, useVenuePicture, venueOutlineFor, type VenueRef } from './venuePeek';
import { switchValue } from '../review/switches';
import './venueCard.css';

/* ============================================================================
 * The race card, one grammar for every chart (career round 2, Nov 17 2026).
 *
 * Jack: "Have the hover behavior applied consistently so that the hover shows
 * the track shape across all graphs and all tracks, the same way it does in
 * the Explorer section right now."
 *
 * A mark that is a race or a track hands its card a VenueRef; the card shows
 * that track's 3D still on top (VenuePeek: the race's own shading, else the
 * layout raced that day, else the venue), then a small series line, the
 * race, its numbers, and what a click does. Where no model exists yet it
 * draws the traced 2D outline small beside the title if one exists, and
 * otherwise lays out as a text card: no grey hole. When a model lands in the
 * stills index the same card shows it with no code change.
 *
 * One placement for mouse and finger: centred over the mark, above it, below
 * it when the screen has no room above, and kept 8 px inside the screen (and
 * above the phone's tab bar). On a touch screen, or once a tap has armed a
 * mark, it carries the tap's "Open the race →".
 *
 * Review switch ?peek: (default) the 272 px still; `small` a 208 px still;
 * `off` no stills anywhere, which is also how a venue without a model reads.
 * ==========================================================================*/

export interface VenueTip extends ChartTip {
  /** The race or track under the mark; omit for a mark that is not one. */
  venue?: VenueRef | null;
  /** A short line over the title, "INDY NXT · 2025", with `tint` as its dot. */
  meta?: string | null;
  tint?: string | null;
  /** A quieter line under the detail ("ended early: contact · wet track"). */
  note?: string | null;
  /** A line worth a glance, in the accent ("best in the field that day"). */
  flag?: string | null;
  /** A short list under the title, one row per meeting ("SCCA · Road Atlanta  2"). */
  lines?: VenueTipLine[] | null;
}

export interface VenueTipLine {
  label: string;
  /** Right-aligned figure, "2". */
  value?: string | null;
  tint?: string | null;
}

const LIST_MAX = 5;

type PeekSize = 'large' | 'small' | 'off';
const peekSize = (): PeekSize => {
  try {
    const value = switchValue('peek');
    return value === 'small' || value === 'off' ? value : 'large';
  } catch {
    return 'large';
  }
};

const GUTTER = 8;
const GAP = 10;

/** Above the mark, below it when the screen has no room, centred and inside the screen. */
const usePlacement = (ref: RefObject<HTMLElement | null>, x: number, y: number, under: number, content: unknown): CSSProperties => {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    const parent = card?.offsetParent;
    if (!card || !(parent instanceof HTMLElement)) return;
    const box = parent.getBoundingClientRect();
    const originX = box.left + parent.clientLeft;
    const originY = box.top + parent.clientTop;
    const screenW = document.documentElement.clientWidth || window.innerWidth;
    const tabbar = document.querySelector('.tabbar');
    const tabTop = tabbar ? tabbar.getBoundingClientRect().top : window.innerHeight;
    const floor = Math.min(window.innerHeight, tabTop > 0 ? tabTop : window.innerHeight);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const left = Math.max(GUTTER, Math.min(originX + x - w / 2, screenW - GUTTER - w));
    const markTop = originY + y;
    const markBottom = originY + under;
    const above = markTop - GAP - h;
    const below = markBottom + GAP;
    const roomAbove = above >= GUTTER;
    const roomBelow = below + h <= floor - GUTTER;
    const goBelow = !roomAbove && (roomBelow || floor - markBottom > markTop);
    setPlace((current) => {
      const next = { left: left - originX, top: (goBelow ? below : above) - originY };
      return current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5 ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, under, content]);
  return place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' };
};

/** The traced outline, small: a venue with no 3D model yet still shows its shape. */
const OutlineGlyph = ({ outline }: { outline: TrackOutline }) => (
  <svg className="vcard__outline" viewBox={outline.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden>
    <path d={outline.mainPath} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>
);

const mouseAction = (action: string) => `Click to ${action.charAt(0).toLowerCase()}${action.slice(1)}`;

/**
 * The house race card. Drop-in for ChartTipCard / DeepTip: same `tip`,
 * `width` and `tap`, plus the VenueTip fields. `width` is kept for the API;
 * the card places itself against the screen, not the chart.
 */
export const VenueTipCard = ({ tip, tap }: { tip: VenueTip; width?: number; tap?: TapPreview }) => {
  const coarse = useCoarsePointer();
  const touch = coarse || Boolean(tap && tap.armed !== null);
  const size = peekSize();
  const ref = useRef<HTMLDivElement | null>(null);
  const picture = useVenuePicture(tip.venue ?? {});
  const still = size !== 'off' && tip.venue && picture ? picture : null;
  const outline = !still && tip.venue ? venueOutlineFor(tip.venue) : null;
  const placeKey = `${tip.title}|${tip.detail ?? ''}|${tip.note ?? ''}|${tip.flag ?? ''}|${tip.lines?.length ?? 0}|${still?.src600 ?? ''}|${touch ? 1 : 0}|${tap?.openArmed ? 1 : 0}`;
  const mousePlace = usePlacement(ref, tip.x, tip.over ?? tip.y, tip.under ?? tip.y + 16, placeKey);
  /* On a touch screen the shared placement keeps the card off the chart's marks (proxy review 3). */
  const touchPlace = useTouchPlacement(ref, tip.x, tip.over ?? tip.y, tip.under ?? tip.y + 16, placeKey);
  const place = touch ? touchPlace : mousePlace;
  const kind = still ? `vcard--still vcard--${size}` : outline ? 'vcard--outline' : 'vcard--text';
  const words = (
    <>
      {tip.meta ? (
        <span className="vcard__meta">
          {tip.tint ? <i style={{ background: tip.tint }} aria-hidden /> : null}
          {tip.meta}
        </span>
      ) : null}
      <strong className="vcard__title">{tip.title}</strong>
      {tip.detail ? <span className="vcard__detail">{tip.detail}</span> : null}
      {tip.lines && tip.lines.length ? (
        <ul className="vcard__list">
          {tip.lines.slice(0, tip.lines.length > LIST_MAX ? LIST_MAX - 1 : LIST_MAX).map((line, i) => (
            <li key={i}>
              {line.tint ? <i style={{ background: line.tint }} aria-hidden /> : <i aria-hidden />}
              <span>{line.label}</span>
              {line.value ? <b>{line.value}</b> : null}
            </li>
          ))}
          {tip.lines.length > LIST_MAX ? (
            <li className="vcard__more">
              <i aria-hidden />
              <span>{`and ${tip.lines.length - (LIST_MAX - 1)} more`}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {tip.note ? <span className="vcard__note">{tip.note}</span> : null}
      {tip.flag ? <span className="vcard__flag">{tip.flag}</span> : null}
    </>
  );
  return (
    <div
      ref={ref}
      className={`vcard ${kind}${touch ? ' vcard--touch' : ''}`}
      style={touch && tap ? place : { ...place, pointerEvents: 'none' }}
      role="status"
      {...(touch ? { [TAP_CARD]: '' } : {})}
    >
      {still ? (
        <CardStill className="vcard__still" venue={tip.venue ?? {}} picture={still} />
      ) : null}
      <div className="vcard__body">
        {outline ? (
          <div className="vcard__head">
            <OutlineGlyph outline={outline} />
            <div className="vcard__words">{words}</div>
          </div>
        ) : (
          words
        )}
        {touch ? (
          <TapAction tap={tap} label={tip.action} />
        ) : tip.action ? (
          <span className="vcard__action">{mouseAction(tip.action)}</span>
        ) : null}
      </div>
    </div>
  );
};
