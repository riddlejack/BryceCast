/* Euroformula Open, 2023: the season abroad. Seven rounds across six
 * countries with Motopark, in the smallest fields of his career, and three
 * wins. The visual is the season's route across Europe on the atlas's own
 * land outline (Natural Earth, from the package), round by round, with each
 * round's results beside its number. Mugello, the last round, has no
 * official classification anywhere searched: it stays an open mark, and
 * its card quotes the package's gap note. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import { uiDataPackage } from '../../data/uiDataPackage';
import type { VenueTip } from '../../app/venueCard';
import type { CareerRow } from '../careerExplorer';
import { countWord, fieldOf, lab, openOf, placeName, Signature, tintOf, useEntrance, useRaceCard, useSeriesRows, EASE, ordinalWord } from './common';

const SERIES = 'series_euroformula_open';

/* Mugello is in no career figure, so it has no atlas venue. Its position:
 * Mugello Circuit, 43°59′51″N 11°22′19″E (Wikipedia, "Mugello Circuit"). */
const MUGELLO = { lat: 43.9975, lon: 11.3719, country: 'Italy' };

interface Gap {
  gapId: string;
  description: string;
}
const mugelloGaps = (): Gap[] => {
  const ops = uiDataPackage.screens.sourceOps as unknown as { gapBoundary?: { rows?: Gap[] } };
  return (ops.gapBoundary?.rows ?? []).filter((row) => /euroformula_2023_mugello/.test(row.gapId));
};

interface Stop {
  key: string;
  track: string;
  lat: number;
  lon: number;
  country: string;
  rows: CareerRow[];
  gap: Gap[];
  date: string;
}

export const EuroformulaSignature = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);
  const atlas = lab.atlas;

  const stops = useMemo((): Stop[] => {
    const out: Stop[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.track === row.trackName) {
        last.rows.push(row);
        continue;
      }
      const venue = atlas.venues.find((v) => v.trackName === row.trackName);
      if (!venue) continue;
      out.push({ key: row.trackName, track: row.trackName, lat: venue.lat, lon: venue.lon, country: venue.country, rows: [row], gap: [], date: row.date });
    }
    const gaps = mugelloGaps();
    if (gaps.length) out.push({ key: 'mugello', track: 'Mugello', ...MUGELLO, rows: [], gap: gaps, date: '2023-09-30' });
    return out;
  }, [rows, atlas]);

  if (stops.length === 0) return null;
  const countries = new Set(stops.map((stop) => stop.country)).size;
  const fields = rows.map((row) => fieldOf(row) ?? 0).filter(Boolean);
  const wins = stops.filter((stop) => stop.rows.some((row) => row.finish === 1));
  const campaign = lab.seasonCampaigns?.campaigns?.find((c) => c.seriesId === SERIES) ?? null;
  const rank = campaign?.officialStandingRank ?? null;
  const team = String((lab.resultConversion ?? []).find((row) => row.seriesId === SERIES)?.teamName ?? '').replace(/^Team\s+/, '');

  /* The atlas's equirectangular canvas, cropped to the season and squeezed by cos(latitude) so Europe keeps its shape. */
  const { crop, canvas } = atlas.geometry;
  const kx = canvas.width / (crop.lonMax - crop.lonMin);
  const ky = canvas.height / (crop.latMax - crop.latMin);
  const wrap = (lon: number) => (lon < crop.lonMin ? lon + 360 : lon);
  const px = (lon: number) => (wrap(lon) - crop.lonMin) * kx;
  const py = (lat: number) => (crop.latMax - lat) * ky;
  const pad = 3.2;
  const lonMin = Math.min(...stops.map((s) => s.lon)) - pad * 1.6;
  const lonMax = Math.max(...stops.map((s) => s.lon)) + pad * 1.4;
  const latMin = Math.min(...stops.map((s) => s.lat)) - pad;
  const latMax = Math.max(...stops.map((s) => s.lat)) + pad;
  const squeeze = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const vx0 = px(lonMin);
  const vy0 = py(latMax);
  const vw = px(lonMax) - vx0;
  const vh = py(latMin) - vy0;

  const phone = width > 0 && width < 640;
  const mapW = phone ? width : Math.min(width * 0.56, 470);
  const scale = mapW / (vw * squeeze);
  const mapH = vh * scale;
  const sx = (lon: number) => (px(lon) - vx0) * squeeze * scale;
  const sy = (lat: number) => (py(lat) - vy0) * scale;
  const route = stops.map((stop) => `${sx(stop.lon)},${sy(stop.lat)}`).join(' ');
  const routeLength = stops.slice(1).reduce((sum, stop, i) => sum + Math.hypot(sx(stop.lon) - sx(stops[i].lon), sy(stop.lat) - sy(stops[i].lat)), 0);

  const tipFor = (stop: Stop, i: number, x: number, yy: number): VenueTip => {
    if (stop.rows.length === 0) {
      return {
        x,
        y: yy,
        under: yy + 14,
        venue: null,
        meta: `Euroformula · 2023 · round ${i + 1}`,
        tint,
        title: 'Mugello',
        detail: 'No official classification found; counted in no figure',
        note: stop.gap.map((gap) => gap.description.split(':')[1]?.split('.')[0]?.trim()).filter(Boolean).join(' · ') || null,
        action: null
      };
    }
    const top = [...stop.rows].sort((a, b) => a.finish - b.finish)[0];
    return {
      x,
      y: yy,
      under: yy + 14,
      venue: { sessionId: top.sessionId, trackName: stop.track },
      meta: `Euroformula · 2023 · round ${i + 1}`,
      tint,
      title: placeName(stop.track),
      detail: stop.rows.map((row) => `P${row.finish} of ${fieldOf(row) ?? '?'}`).join(' · '),
      note: stop.country,
      action: 'open his best race there'
    };
  };

  const list = (
    <ol className="chs-euro__list">
      {stops.map((stop, i) => {
        const hot = card.hot === stop.key;
        return (
          <li
            key={stop.key}
            className={`chs-euro__row${hot ? ' chs-euro__row--hot' : ''}${stop.rows.length ? '' : ' chs-euro__row--gap'}`}
            style={{ opacity: settled ? 1 : 0, transition: `opacity 260ms ease ${reduced ? 0 : 300 + i * 220}ms` }}
            {...card.bind(stop.key, () => tipFor(stop, i, sx(stop.lon), sy(stop.lat) - 8), stop.rows.length ? openOf([...stop.rows].sort((a, b) => a.finish - b.finish)[0]) : null)}
          >
            <span className="chs-euro__n">{i + 1}</span>
            <span className="chs-euro__name">{placeName(stop.track)}</span>
            <span className="chs-euro__res">
              {stop.rows.length
                ? stop.rows.map((row) => (
                    <span key={row.sessionId} className={row.finish === 1 ? 'chs-euro__win' : undefined}>
                      P{row.finish}
                    </span>
                  ))
                : <span className="chs-euro__none">no official result</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      <p className="chapter-panel__narrative">
        The season abroad: {countWord(stops.length)} rounds in {countWord(countries)} countries{team ? <> with {team}</> : null}, in the smallest fields of his
        career, {Math.min(...fields)} to {Math.max(...fields)} cars. He won at {wins.map((stop) => withArticle(placeName(stop.track))).join(', ').replace(/, ([^,]*)$/, ' and $1')}
        {rank ? <>, and finished {ordinalWord(rank)} in the championship</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-euro"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => stops.flatMap((stop) => stop.rows.slice(0, 1).map((row) => ({ sessionId: row.sessionId, trackName: stop.track })))}
            foot={
              <>
                The rounds in order, each with his three results. <PointerWord mouse="Hover" touch="Tap" /> a round for its track.
              </>
            }
          >
            {width > 0 ? (
              <div className="chs-euro__layout">
                <svg width={mapW} height={mapH} role="img" aria-label={`Euroformula 2023: the season's ${stops.length} rounds across Europe`}>
                  <defs>
                    <clipPath id="chs-euro-clip">
                      <rect x={0} y={0} width={mapW} height={mapH} rx={6} />
                    </clipPath>
                  </defs>
                  <g clipPath="url(#chs-euro-clip)">
                    <path
                      d={atlas.geometry.landPath}
                      fillRule="evenodd"
                      className="chs-land"
                      transform={`scale(${squeeze * scale} ${scale}) translate(${-vx0} ${-vy0})`}
                    />
                  </g>
                  <polyline
                    points={route}
                    fill="none"
                    stroke="var(--ink)"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray={routeLength}
                    strokeDashoffset={settled ? 0 : routeLength}
                    style={{ transition: `stroke-dashoffset ${reduced ? 0 : 1600}ms ${EASE} 200ms` }}
                  />
                  {stops.map((stop, i) => {
                    const x = sx(stop.lon);
                    const yy = sy(stop.lat);
                    const hot = card.hot === stop.key;
                    const raced = stop.rows.length > 0;
                    const won = stop.rows.some((row) => row.finish === 1);
                    const delay = reduced ? 0 : 300 + i * 220;
                    const labelLeft = x > mapW - 30;
                    return (
                      <g key={stop.key} style={{ opacity: settled ? 1 : 0, transition: `opacity 260ms ease ${delay}ms` }}>
                        {raced ? (
                          <circle cx={x} cy={yy} r={hot ? 6.4 : won ? 5.4 : 4.4} fill={tint} />
                        ) : (
                          <circle cx={x} cy={yy} r={hot ? 5.4 : 4.4} fill="var(--surface-0)" stroke={tint} strokeWidth={1.2} strokeDasharray="2 2" />
                        )}
                        <text x={labelLeft ? x - 9 : x + 9} y={yy + 4} textAnchor={labelLeft ? 'end' : 'start'} className="chs-place" fontSize={12}>
                          {i + 1}
                        </text>
                        <circle
                          cx={x}
                          cy={yy}
                          r={14}
                          fill="transparent"
                          style={{ cursor: raced ? 'pointer' : 'default' }}
                          {...card.bind(stop.key, () => tipFor(stop, i, x, yy - 8), raced ? openOf([...stop.rows].sort((a, b) => a.finish - b.finish)[0]) : null)}
                        />
                      </g>
                    );
                  })}
                </svg>
                {list}
              </div>
            ) : null}
          </Signature>
        </div>
      </div>
    </>
  );
};

/* "the Hungaroring", as people say it. */
const withArticle = (name: string): string => (/^Hungaroring$/.test(name) ? 'the Hungaroring' : name);
