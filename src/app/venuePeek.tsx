import { useCallback, useRef } from 'react';
import { trackOutlineFor, type TrackOutline } from '../assets/tracks';
import { loadStillIndex, stillPictureFor, useStillIndex, type StillIndex, type StillPicture } from './trackStill';

/* ============================================================================
 * The track's 3D still for any venue in the career (career round 2, Nov 17 2026).
 *
 * One lookup every chart's hover card uses, so a mark at a track shows that
 * track's model the way the Career explorer's INDY NXT dots already do.
 *
 * Resolution, first hit wins:
 *   1. the race's own still (index.races[sessionId]), shaded for that race;
 *   2. index.bySession[sessionId]: the layout he raced that day, where a venue
 *      has more than one (Brands Hatch Indy vs GP, Silverstone National vs GP);
 *   3. index.byTrackName[trackName] or index.byTrackId[trackId];
 *   4. the built-in names below for the INDY NXT venues modelled in round 5.
 * The 3D venue lane writes 2 and 3 into public/tracks-3d/stills/index.json as
 * it models the other venues, so marks light up with no code change here.
 * No model: null, and the caller shows its card without a picture.
 * ==========================================================================*/

const BUILT_IN: Record<string, string> = {
  'WeatherTech Raceway Laguna Seca': 'weathertech-raceway-laguna-seca',
  'Road America': 'road-america',
  'Detroit Downtown Street Circuit': 'streets-of-detroit',
  'Streets of Detroit': 'streets-of-detroit',
  'Streets of St. Petersburg': 'streets-of-st-petersburg',
  'Grand Prix of Arlington Street Circuit': 'streets-of-arlington',
  'Streets of Arlington': 'streets-of-arlington',
  'Barber Motorsports Park': 'barber-motorsports-park',
  'Indianapolis Motor Speedway Road Course': 'indianapolis-motor-speedway-road-course',
  'Mid-Ohio Sports Car Course': 'mid-ohio-sports-car-course',
  'Portland International Raceway': 'portland-international-raceway',
  'Iowa Speedway': 'iowa-speedway',
  'World Wide Technology Raceway': 'world-wide-technology-raceway',
  'The Milwaukee Mile': 'the-milwaukee-mile',
  'Nashville Superspeedway': 'nashville-superspeedway'
};

type IndexWithAliases = StillIndex & {
  bySession?: Record<string, string>;
  byTrackName?: Record<string, string>;
  byTrackId?: Record<string, string>;
};

export interface VenueRef {
  sessionId?: string | null;
  trackName?: string | null;
  trackId?: string | null;
  /** A mark that is a venue, not one race (the travel map's dots): the layout
   *  comes from the session as usual, but the picture is the plain model, not
   *  one race's shading. */
  plain?: boolean;
}

/** The model slug for a race or venue, or null where none is modelled. */
export const venueSlugFor = (index: StillIndex | null | undefined, ref: VenueRef): string | null => {
  if (!index) return null;
  const idx = index as IndexWithAliases;
  const { sessionId, trackName, trackId } = ref;
  const slug =
    (sessionId && index.races[sessionId]?.slug) ||
    (sessionId && idx.bySession?.[sessionId]) ||
    (trackName && idx.byTrackName?.[trackName]) ||
    (trackId && idx.byTrackId?.[trackId]) ||
    (trackName && BUILT_IN[trackName]) ||
    null;
  return slug && index.venues[slug] ? slug : null;
};

/** The picture for a race or venue (see stillPictureFor), or null. */
export const venuePictureFor = (index: StillIndex | null | undefined, ref: VenueRef): StillPicture | null =>
  stillPictureFor(index, venueSlugFor(index, ref), ref.plain ? null : ref.sessionId ?? null);

/** Hook form: undefined while the stills index loads, null when no model. */
export const useVenuePicture = (ref: VenueRef): StillPicture | null | undefined => {
  const index = useStillIndex();
  if (index === undefined) return undefined;
  return venuePictureFor(index, ref);
};

/** The still itself, sized by the card; renders nothing without a model. */
export const VenuePeek = ({ className, size = 600, ...ref }: VenueRef & { className?: string; size?: 600 | 1200 }) => {
  const picture = useVenuePicture(ref);
  if (!picture) return null;
  return (
    <img
      className={className ?? 'venue-peek'}
      src={size === 1200 ? picture.src1200 : picture.src600}
      width={picture.width}
      height={picture.height}
      alt=""
      decoding="async"
    />
  );
};

/* ---------- a venue with no model yet ---------- */

/** The traced 2D outline for a venue with no 3D still (null where none is
 *  traced). The hover card draws it small, so a card without a model still
 *  shows the track's shape where one exists. */
export const venueOutlineFor = (ref: VenueRef): TrackOutline | null => trackOutlineFor(ref.trackName ?? null);

/* ---------- warm the stills before the pointer reaches a mark ---------- */

const warmed = new Set<string>();
const keep: HTMLImageElement[] = [];

/** Fetch and decode the stills these marks will show, so a hover card never
 *  waits on a picture. Reads the stills index (lazily, once, as today) and
 *  warms each distinct 600 px still a single time per page. */
export const preloadVenueStills = (refs: Iterable<VenueRef>): void => {
  if (typeof Image === 'undefined') return;
  const list = [...refs];
  if (list.length === 0) return;
  void loadStillIndex().then((index) => {
    if (!index) return;
    for (const ref of list) {
      const picture = venuePictureFor(index, ref);
      if (!picture || warmed.has(picture.src600)) continue;
      warmed.add(picture.src600);
      const image = new Image();
      image.decoding = 'async';
      image.src = picture.src600;
      keep.push(image);
      image.decode?.().catch(() => undefined);
    }
  });
};

/** A chart's onPointerEnter: warms every mark's still the first time the
 *  pointer (or a finger) comes onto the chart. `refs` is read only then. */
export const useVenuePreload = (refs: () => Iterable<VenueRef>) => {
  const latest = useRef(refs);
  latest.current = refs;
  const done = useRef(false);
  return useCallback(() => {
    if (done.current) return;
    const list = [...latest.current()];
    if (list.length === 0) return;
    done.current = true;
    preloadVenueStills(list);
  }, []);
};
