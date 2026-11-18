/* GB3, 2021–22: his only two full seasons in one series before INDY NXT
 * (Formula Ford spans 2019–20, but 2019 was the Festival alone). Both
 * seasons ran the same six circuits, with a new team the second time
 * (Carlin, then Hitech Pulse-Eight) and deeper grids. The visual sets each
 * circuit's best result in 2021 against the same circuit a year later. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { CareerRow } from '../careerExplorer';
import { countWord, fieldOf, lab, openOf, placeName, Signature, tintOf, useEntrance, useRaceCard, useSeriesRows, EASE } from './common';

const SERIES = 'series_gb3';

const teamOf = (() => {
  let map: Map<number, string> | null = null;
  return (year: number): string => {
    if (!map) {
      map = new Map();
      for (const row of lab.resultConversion ?? []) {
        if (row.seriesId === SERIES && row.teamName) map.set(Number(row.seasonYear), String(row.teamName));
      }
    }
    return map.get(year) ?? '';
  };
})();

const best = (rows: CareerRow[]): CareerRow => [...rows].sort((a, b) => a.finish - b.finish || a.date.localeCompare(b.date))[0];

/* Spread label centres apart (at least `gap`) while keeping each as near its mark as it can. */
const relax = (ys: number[], gap: number): number[] => {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((item) => item.y);
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let k = 1; k < out.length; k += 1) {
      const overlap = gap - (out[k] - out[k - 1]);
      if (overlap > 0.1) {
        out[k - 1] -= overlap / 2;
        out[k] += overlap / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const result = new Array<number>(ys.length);
  order.forEach((item, k) => {
    result[item.i] = out[k];
  });
  return result;
};

export const Gb3Signature = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const model = useMemo(() => {
    const years = [...new Set(rows.map((row) => row.seasonYear ?? 0))].filter(Boolean).sort();
    if (years.length < 2) return null;
    const [y1, y2] = years;
    const tracks = [...new Set(rows.map((row) => row.trackName))];
    const venues = tracks
      .map((track) => {
        const a = rows.filter((row) => row.trackName === track && row.seasonYear === y1);
        const b = rows.filter((row) => row.trackName === track && row.seasonYear === y2);
        if (!a.length || !b.length) return null;
        return { track, a, b, bestA: best(a), bestB: best(b) };
      })
      .filter((venue): venue is NonNullable<typeof venue> => venue !== null)
      .sort((p, q) => p.bestB.finish - q.bestB.finish);
    const fields = (year: number) => rows.filter((row) => row.seasonYear === year).map((row) => fieldOf(row) ?? 0);
    const median = (values: number[]) => [...values].sort((p, q) => p - q)[Math.floor(values.length / 2)];
    return { y1, y2, venues, field1: median(fields(y1)), field2: median(fields(y2)) };
  }, [rows]);

  if (!model) return null;
  const { y1, y2, venues, field1, field2 } = model;
  const better = venues.filter((venue) => venue.bestB.finish < venue.bestA.finish).length;
  const worst = Math.max(...venues.flatMap((venue) => [venue.bestA.finish, venue.bestB.finish]));
  const win = venues.find((venue) => venue.bestB.finish === 1 || venue.bestA.finish === 1);

  const phone = width > 0 && width < 520;
  const chartW = Math.min(width, 640);
  const labelW = phone ? 104 : 150;
  const x1 = labelW + 26;
  const x2 = chartW - (phone ? 40 : 130);
  const top = 46;
  const step = phone ? 15 : 17;
  const y = (place: number) => top + (place - 1) * step;
  const height = y(worst) + 26;
  const leftYs = relax(venues.map((venue) => y(venue.bestA.finish)), 17);
  const rightYs = relax(venues.map((venue) => y(venue.bestB.finish)), 17);
  const team1 = teamOf(y1);
  const team2 = teamOf(y2).replace(' Pulse-Eight', '');

  const tipFor = (venue: (typeof venues)[number], ty: number) => {
    const top = venue.bestB.finish <= venue.bestA.finish ? venue.bestB : venue.bestA;
    return {
      x: (x1 + x2) / 2,
      y: ty - 8,
      under: ty + 8,
      venue: { sessionId: top.sessionId, trackName: venue.track },
      meta: `GB3 · ${y1}–${String(y2).slice(2)}`,
      tint,
      title: placeName(venue.track),
      detail: `${y1}: best P${venue.bestA.finish} in ${venue.a.length} races · ${y2}: best P${venue.bestB.finish} in ${venue.b.length}`,
      note: null,
      action: 'open his best race there'
    };
  };

  return (
    <>
      <p className="chapter-panel__narrative">
        His only two full seasons in one series before INDY NXT: the same {countWord(venues.length)} circuits two years running, with {team1} and then {team2}, and grids
        that grew from about {field1} cars to {field2}. A year on, his best result improved at {countWord(better)} of the {countWord(venues.length)}
        {win ? <>, and {placeName(win.track)} gave him his first GB3 win</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-gb3"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => venues.map((venue) => ({ sessionId: venue.bestB.sessionId, trackName: venue.track }))}
            foot={
              <>
                His best finish at each circuit, {y1} against {y2}; P1 at the top, so a line that rises got better. <PointerWord mouse="Hover" touch="Tap" /> a circuit
                for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={chartW} height={height} role="img" aria-label={`GB3: his best finish at each of ${venues.length} circuits in ${y1} and ${y2}`}>
                <text x={x1} y={14} textAnchor="middle" className="chs-label">
                  {y1}
                </text>
                <text x={x1} y={30} textAnchor="middle" className="chs-axis">
                  {team1}
                </text>
                <text x={x2} y={14} textAnchor="middle" className="chs-label">
                  {y2}
                </text>
                <text x={x2} y={30} textAnchor="middle" className="chs-axis">
                  {team2}
                </text>
                <line x1={x1} x2={x1} y1={top - 6} y2={height - 14} className="chs-hair" strokeOpacity={0.1} />
                <line x1={x2} x2={x2} y1={top - 6} y2={height - 14} className="chs-hair" strokeOpacity={0.1} />
                {venues.map((venue, i) => {
                  const ya = y(venue.bestA.finish);
                  const yb = y(venue.bestB.finish);
                  const up = venue.bestB.finish < venue.bestA.finish;
                  const hot = card.hot === venue.track;
                  const dim = card.hot !== null && !hot;
                  const delay = reduced ? 0 : 200 + i * 120;
                  const length = Math.hypot(x2 - x1, yb - ya);
                  return (
                    <g key={venue.track} style={{ opacity: dim ? 0.3 : 1, transition: 'opacity 160ms ease' }}>
                      <line
                        x1={x1}
                        y1={ya}
                        x2={x2}
                        y2={yb}
                        stroke={tint}
                        strokeOpacity={up ? 1 : 0.4}
                        strokeWidth={hot ? 1.8 : 1.2}
                        strokeDasharray={length}
                        strokeDashoffset={settled ? 0 : length}
                        style={{ transition: `stroke-dashoffset 760ms ${EASE} ${delay}ms` }}
                      />
                      <circle cx={x1} cy={ya} r={4} fill={tint} fillOpacity={0.45} />
                      <circle cx={x2} cy={yb} r={hot ? 5.4 : 4.4} fill={tint} style={{ opacity: settled ? 1 : 0, transition: `opacity 220ms ease ${delay + 700}ms` }} />
                      {Math.abs(leftYs[i] - ya) > 2 ? <line x1={x1 - 8} x2={x1 - 16} y1={ya} y2={leftYs[i]} className="chs-hair" /> : null}
                      <text x={x1 - 18} y={leftYs[i] + 4} textAnchor="end" className="chs-label">
                        {placeName(venue.track)}
                        <tspan className="chs-axis" dx={6}>
                          P{venue.bestA.finish}
                        </tspan>
                      </text>
                      <text
                        x={x2 + 12}
                        y={rightYs[i] + 4}
                        className="chs-place"
                        fontSize={12}
                        style={{ opacity: settled ? 1 : 0, transition: `opacity 220ms ease ${delay + 700}ms` }}
                      >
                        P{venue.bestB.finish}
                        {venue.bestB.finish === 1 && !phone ? <tspan className="chs-note" dx={6}>first GB3 win</tspan> : null}
                      </text>
                      <rect
                        x={0}
                        y={Math.min(ya, yb) - 8}
                        width={chartW}
                        height={Math.abs(yb - ya) + 16}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(venue.track, () => tipFor(venue, Math.min(ya, yb)), openOf(venue.bestB.finish <= venue.bestA.finish ? venue.bestB : venue.bestA))}
                      />
                    </g>
                  );
                })}
              </svg>
            ) : null}
          </Signature>
        </div>
      </div>
    </>
  );
};
