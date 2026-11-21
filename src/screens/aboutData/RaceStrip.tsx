import { useMemo, useState, type PointerEvent } from 'react';
import { chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import { VenueTipCard, type VenueTip } from '../../app/venueCard';
import { useVenuePreload, type VenueRef } from '../../app/venuePeek';
import { venueOfWeek } from '../venueOfDates';
import { meetingNameOf } from '../raceCardFacts';
import { careerRecord, monthYear, racesBySeries, seriesInfo } from './career';
import './raceStrip.css';

/* About's opening picture: every race of the record as one short stroke on a
 * line from his first car race to his latest, stacked where a weekend held
 * more than one, in its series' Career colour. Point at (or tap) a weekend to
 * read it. The key under it is the races by series (the same counts as the
 * Career odometer). */

type Mark = { x: number; monday: string; races: Array<{ seriesId: string; eventName: string; raceCount: number; bestFinish: number | null }> };

const DAY = 86_400_000;
const time = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

export const SeriesKey = () => (
  <ul className="rs-key" aria-label="Races by series">
    {racesBySeries.map((row) => {
      const info = seriesInfo(row.seriesId);
      return (
        <li key={row.seriesId}>
          <span className="rs-key__swatch" style={{ background: info.tint }} aria-hidden />
          {info.short} <span className="rs-key__n tnum">{row.races}</span>
        </li>
      );
    })}
  </ul>
);

export const RaceStrip = () => {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.15);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const [hover, setHover] = useState<number | null>(null);
  const shown = inView || reduced;
  const preload = useVenuePreload(() => (careerRecord?.weeks ?? []).map((week) => venueOfWeek(week.monday)).filter((ref): ref is VenueRef => ref !== null));

  const weeks = careerRecord?.weeks ?? [];
  const phone = width > 0 && width < 560;
  const H = phone ? 92 : width > 1500 ? 132 : 118;
  const base = H - 26;
  const step = phone ? 12 : width > 1500 ? 19 : 16;
  const t0 = weeks.length ? time(weeks[0].monday) : 0;
  const t1 = weeks.length ? time(weeks[weeks.length - 1].monday) + 7 * DAY : 1;
  const pad = 2;
  const xOf = (t: number) => pad + ((t - t0) / (t1 - t0)) * Math.max(0, width - pad * 2);
  const tick = Math.max(1.25, Math.min(3, (width / Math.max(1, weeks.length)) * 0.85));

  const marks = useMemo<Mark[]>(
    () =>
      weeks
        .filter((week) => week.races.some((race) => race.raceCount > 0))
        .map((week) => ({ x: xOf(time(week.monday) + 3 * DAY), monday: week.monday, races: week.races.filter((race) => race.raceCount > 0) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeks, width]
  );

  if (!careerRecord || weeks.length === 0) return null;

  const years: number[] = [];
  for (let year = careerRecord.firstYear; year <= careerRecord.lastYear; year += 1) years.push(year);

  const nearest = (clientX: number, rect: DOMRect): number | null => {
    const x = clientX - rect.left;
    let best = -1;
    let bestDistance = Infinity;
    marks.forEach((mark, index) => {
      const distance = Math.abs(mark.x - x);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best >= 0 && bestDistance <= (coarse ? 18 : 16) ? best : null;
  };

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') return;
    setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect()));
  };
  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return;
    const next = nearest(event.clientX, event.currentTarget.getBoundingClientRect());
    setHover((current) => (next === current ? null : next));
  };

  let tip: VenueTip | null = null;
  if (hover !== null && marks[hover]) {
    const mark = marks[hover];
    const total = mark.races.reduce((sum, race) => sum + race.raceCount, 0);
    const places = [...new Set(mark.races.map((race) => meetingNameOf(race.eventName)))].join(' and ');
    const series = [...new Set(mark.races.map((race) => seriesInfo(race.seriesId).short))].join(' and ');
    const tint = mark.races.length ? seriesInfo(mark.races[0].seriesId).tint : null;
    const finishes = mark.races.map((race) => race.bestFinish).filter((value): value is number => value !== null);
    const best = finishes.length ? Math.min(...finishes) : null;
    tip = {
      x: mark.x,
      y: base - total * step - 6,
      venue: venueOfWeek(mark.monday),
      meta: `${series} · ${monthYear(mark.monday)}`,
      tint,
      title: places,
      detail: `${total} ${total === 1 ? 'race' : 'races'}${best !== null ? ` · best P${best}` : ''}`
    };
  }

  return (
    <div ref={viewRef} className="rs">
      <div ref={wrapRef} className="rs__stage" style={{ height: H }}>
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Every race from ${careerRecord.from} to ${careerRecord.to}, one stroke each, stacked by weekend.`}
            onPointerEnter={preload}
            onPointerMove={onMove}
            onPointerLeave={() => !coarse && setHover(null)}
            onPointerDown={onDown}
            style={{ display: 'block', touchAction: 'pan-y' }}
          >
            {years.map((year) => {
              const raw = xOf(Date.UTC(year, 0, 1));
              const x = year === years[0] ? Math.max(0, raw) : raw;
              if (x < 0 || x > width - 20) return null;
              return (
                <g key={year}>
                  <line x1={x} x2={x} y1={base + 2} y2={base + 8} stroke="var(--grey-line)" />
                  <text x={x + 4} y={base + 20} fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
                    {phone ? `’${String(year).slice(2)}` : year}
                  </text>
                </g>
              );
            })}
            <line x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} stroke="var(--grey-line)" />
            {marks.map((mark, index) => {
              let level = 0;
              const dim = hover !== null && hover !== index;
              return (
                <g
                  key={mark.monday}
                  className="rs__week"
                  style={{
                    transform: shown ? 'scaleY(1)' : 'scaleY(0)',
                    transformOrigin: `0 ${base}px`,
                    transitionDelay: reduced ? '0ms' : `${Math.round((mark.x / Math.max(1, width)) * 1100)}ms`
                  }}
                >
                  <g className="rs__fade" style={{ opacity: dim ? 0.3 : 1 }}>
                  {mark.races.flatMap((race) =>
                    Array.from({ length: race.raceCount }, (_, k) => {
                      const y = base - (level + 1) * step + 2;
                      level += 1;
                      return (
                        <rect
                          key={`${race.eventName}-${k}`}
                          x={mark.x - tick / 2}
                          y={y}
                          width={tick}
                          height={step - 3}
                          rx={Math.min(1, tick / 2)}
                          fill={seriesInfo(race.seriesId).tint}
                        />
                      );
                    })
                  )}
                  </g>
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <VenueTipCard tip={tip} width={width} /> : null}
      </div>
      <SeriesKey />
    </div>
  );
};

/* The alternative (?ddabout=bar): the same races as one bar, series by series. */
export const SeriesBar = () => {
  const total = racesBySeries.reduce((sum, row) => sum + row.races, 0);
  if (total === 0) return null;
  return (
    <div className="rs">
      <div className="rs-bar" role="img" aria-label={`Races by series: ${racesBySeries.map((row) => `${seriesInfo(row.seriesId).short} ${row.races}`).join(', ')}.`}>
        {racesBySeries.map((row) => {
          const info = seriesInfo(row.seriesId);
          return (
            <span
              key={row.seriesId}
              className="rs-bar__seg"
              style={{ flexGrow: row.races, background: info.tint }}
              title={`${info.name}: ${row.races} ${row.races === 1 ? 'race' : 'races'}`}
            >
            </span>
          );
        })}
      </div>
      <SeriesKey />
    </div>
  );
};
