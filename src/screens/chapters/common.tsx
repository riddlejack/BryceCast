/* The chapters' signature visuals (Career round 3, November 18, 2026).
 *
 * Jack: "we need to definitely update the chapters. They're very basic. If
 * there's anything unique about all of the previous seasons earlier than
 * Indynext, we need more unique visuals for the chapters."
 *
 * Each chapter before INDY NXT gets one visual built on what only that season
 * had, in place of the three stat tiles and the percentile strip every chapter
 * shared. This file holds what they share: the race rows, the entrance clock,
 * the card, the frame and the words. Every number is read from the validated
 * UI package (Daytona's spells from its IMSA stint pack; SCCA's circuit
 * outlines from the 3D venue models, see circuits.ts); none is typed in by hand.
 *
 * Review switch `?chapters=old` shows round 2's chapters (tiles and strip). */

import { useMemo, useState, type ReactNode } from 'react';
import { useInViewOnce, useReducedMotion } from '../../app/charts';
import { useTapPreview } from '../../app/tapPreview';
import { useRouter } from '../../app/router';
import type { VenueTip } from '../../app/venueCard';
import { useVenuePreload, type VenueRef } from '../../app/venuePeek';
import { wetDryCall } from '../../app/wetDry';
import { uiDataPackage } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { DeepTip } from '../deepDives/frame';
import { raceTipOf } from '../deepDives/raceTip';
import { chapterTint, raceHref, useCareerRows, type CareerRow } from '../careerExplorer';
import { placeNameOf, raceFieldOf, raceTitleOf } from '../raceCardFacts';
import './chapters.css';

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** `?chapters=old`: round 2's chapter summary (three tiles and the strip). */
export const useOldChapters = (): boolean => switchValue('chapters') === 'old';

export const lab = uiDataPackage.screens.careerLab;

/** One series' classified races, oldest first. */
export const useSeriesRows = (seriesId: string): CareerRow[] => {
  const rows = useCareerRows();
  return useMemo(() => rows.filter((row) => row.seriesId === seriesId), [rows, seriesId]);
};

/** The races of a series with no classified finish (DNS, DNF, DSQ), from the package. */
export const unclassifiedOf = (seriesId: string) =>
  (lab.unclassifiedRaces ?? [])
    .filter((race) => race.seriesId === seriesId)
    .map((race) => ({
      sessionId: race.sessionId,
      trackName: race.trackName ?? '',
      date: race.raceDate ?? race.eventStartDate ?? '',
      status: race.status ?? 'dnf',
      start: race.startPosition ?? null,
      field: race.fieldSize ?? null
    }));

/** The race's start on the official sheet, local track time ("2019-06-30T14:36"). */
export const raceClock = (sessionId: string): string | null => {
  const weather = lab.raceWeather?.[sessionId];
  return weather && weather.window.basis === 'session_sheet' ? weather.window.start : null;
};

export const fieldOf = (row: CareerRow): number | null => raceFieldOf(row.sessionId);

/* The names a race fan says, for chart labels where the sheet's full name won't fit. */
const SHORT_PLACES: Array<[RegExp, string]> = [
  [/^Homestead/i, 'Homestead'],
  [/^Sebring/i, 'Sebring'],
  [/^Circuit of the Americas/i, 'COTA'],
  [/Road Atlanta/i, 'Road Atlanta'],
  [/^Watkins Glen/i, 'Watkins Glen'],
  [/^Mid-Ohio/i, 'Mid-Ohio'],
  [/^Virginia International/i, 'VIR'],
  [/^Pittsburgh International/i, 'Pittsburgh'],
  [/^Summit Point/i, 'Summit Point'],
  [/^New Jersey Motorsports/i, 'New Jersey'],
  [/^Brands Hatch/i, 'Brands Hatch'],
  [/^Castle Combe/i, 'Castle Combe'],
  [/^Oulton Park/i, 'Oulton Park'],
  [/^Cadwell Park/i, 'Cadwell Park'],
  [/^Silverstone/i, 'Silverstone'],
  [/^Donington/i, 'Donington'],
  [/^Snetterton/i, 'Snetterton'],
  [/Spa-Francorchamps/i, 'Spa'],
  [/do Algarve|Portim/i, 'Portimão'],
  [/^Hungaroring/i, 'Hungaroring'],
  [/Paul Ricard/i, 'Paul Ricard'],
  [/^Red Bull Ring/i, 'Red Bull Ring'],
  [/Monza/i, 'Monza'],
  [/Mugello/i, 'Mugello'],
  [/^Euromarque/i, 'Euromarque'],
  [/^Highlands/i, 'Highlands'],
  [/^Taupo/i, 'Taupo'],
  [/^Manfeild/i, 'Manfeild'],
  [/^Hampton Downs/i, 'Hampton Downs'],
  [/Indianapolis Raceway Park/i, 'IRP'],
  [/^Daytona/i, 'Daytona']
];

export const placeName = (trackName: string): string =>
  SHORT_PLACES.find(([pattern]) => pattern.test(trackName))?.[1] ?? (placeNameOf(trackName) || trackName);

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m: m - 1, d };
};

/** "Jan 5" */
export const dayLabel = (iso: string): string => {
  const { m, d } = parts(iso);
  return `${MONTH[m]} ${d}`;
};

/** "Jan 5–6", "Jun 29–30", "Jan 31–Feb 1" */
export const dayRange = (first: string, last: string): string => {
  const a = parts(first);
  const b = parts(last);
  if (first.slice(0, 10) === last.slice(0, 10)) return dayLabel(first);
  if (a.m === b.m) return `${MONTH[a.m]} ${a.d}–${b.d}`;
  return `${dayLabel(first)}–${dayLabel(last)}`;
};

export const monthName = (index: number): string => MONTH_LONG[index];
export const monthShort = (index: number): string => MONTH[index];

/** Days since 1970 for an ISO date, for time axes. */
export const dayNumber = (iso: string): number => {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m, d) / 86_400_000;
};

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** Small counts as words, the way the site's copy says them. */
export const countWord = (n: number): string => WORDS[n] ?? String(n);

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** "fifth" */
export const ordinalWord = (n: number): string => ORDINALS[n] ?? `${n}th`;

/** "Sat" for an ISO date. */
export const weekday = (iso: string): string => {
  const { y, m, d } = parts(iso);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m, d)).getUTCDay()];
};

/** "12:43 pm" from "2024-05-25T12:43" (or a minute count past midnight). */
export const clockLabel = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
};

export const minutesOf = (isoLocal: string): number => {
  const [h, m] = isoLocal.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
};

/** True once the visual has scrolled in (or at once, under reduced motion). */
export const useEntrance = <T extends Element>() => {
  const [ref, inView] = useInViewOnce<T>(0.25);
  const reduced = useReducedMotion();
  return [ref, inView || reduced, reduced] as const;
};

/** The house race card for a chart: hover reads, click opens; on touch the
 *  first tap reads and the second (or the card) opens. */
export const useRaceCard = () => {
  const [tip, setTip] = useState<VenueTip | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const tap = useTapPreview();
  const { navigate } = useRouter();
  const bind = (key: string, make: () => VenueTip, open: string | null) =>
    tap.target(key, {
      show: () => {
        setHot(key);
        setTip(make());
      },
      hide: () => {
        setHot(null);
        setTip(null);
      },
      open: open ? () => navigate(open) : null
    });
  /* For a dense chart: the whole stage finds the nearest mark under the pointer. */
  const surface = (
    marks: Array<{ key: string; x: number; y: number; tip: () => VenueTip; open: string | null }>,
    reach = 22
  ) => {
    const byKey = new Map(marks.map((mark) => [mark.key, mark]));
    const clear = () => {
      setHot(null);
      setTip(null);
    };
    return tap.surface({
      find: (event) => {
        const target = event.currentTarget as Element;
        const box = ((target as SVGElement).ownerSVGElement ?? target).getBoundingClientRect();
        const px = event.clientX - box.left;
        const py = event.clientY - box.top;
        let best: (typeof marks)[number] | null = null;
        let bestD = Infinity;
        for (const mark of marks) {
          const d = Math.hypot((mark.x - px) * 1, (mark.y - py) * 0.35);
          if (d < bestD) {
            bestD = d;
            best = mark;
          }
        }
        if (!best || Math.abs(best.x - px) > reach) {
          clear();
          return null;
        }
        setHot(best.key);
        setTip(best.tip());
        return best.key;
      },
      clear,
      open: (key) => {
        const mark = byKey.get(String(key));
        return mark?.open ? () => navigate(mark.open as string) : null;
      }
    });
  };
  return { tip, hot, tap, bind, surface, navigate };
};

/** A race row's card, placed at (x, y), with the race's own still on top. */
/** The track in the call's own words and its tier ("damp track (series report)"), from the one wet/dry call
 * every page reads (app/wetDry.ts); null for a dry race or one with no call. */
export const weatherWords = (sessionId: string): string | null => {
  const call = wetDryCall(lab.raceWeather?.[sessionId]);
  return call && call.state !== 'dry' ? `${call.words} (${call.tierWords})` : null;
};

/** The shared race card, with the weather said the way wetDry.ts says it (raceTip.ts is shared and says "mixed track"). */
export const rowTip = (row: CareerRow, x: number, y: number, under: number, extra: Parameters<typeof raceTipOf>[1] = {}): VenueTip => {
  const ended = row.status !== 'running' ? `ended early: ${row.status}` : null;
  const note = [extra.note !== undefined ? extra.note : ended, weatherWords(row.sessionId)].filter(Boolean).join(' · ') || null;
  return { x, y, under, ...raceTipOf(row, extra), note };
};

export const openOf = (row: CareerRow): string => raceHref(row.sessionId);

/** The card for a race with no classified finish (DNS, DNF, DSQ): its track, how it ended, its weather. */
export const outTip = (race: ReturnType<typeof unclassifiedOf>[number], meta: string, tint: string, x: number, y: number, under: number): VenueTip => ({
  x,
  y,
  under,
  venue: { sessionId: race.sessionId, trackName: race.trackName },
  meta,
  tint,
  title: raceTitleOf(race.sessionId, placeName(race.trackName)),
  detail: `no classified finish (${race.status.toUpperCase()})${race.start ? `, from P${race.start}` : ''}`,
  note: weatherWords(race.sessionId)
});

export const tintOf = (seriesId: string): string => chapterTint(seriesId);

/** The visual's frame: the stage (with a card layer) and at most one short line under it. */
export const Signature = ({
  className,
  children,
  foot,
  tip,
  width,
  tap,
  venues
}: {
  className: string;
  children: ReactNode;
  foot?: ReactNode;
  tip: VenueTip | null;
  width: number;
  tap: ReturnType<typeof useTapPreview>;
  venues?: () => Iterable<VenueRef>;
}) => {
  const preload = useVenuePreload(venues ?? (() => []));
  return (
    <figure className={`chs ${className}`}>
      <div className="chs__stage" onPointerEnter={venues ? preload : undefined}>
        {children}
        {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
      </div>
      {foot ? <figcaption className="chs__foot">{foot}</figcaption> : null}
    </figure>
  );
};
