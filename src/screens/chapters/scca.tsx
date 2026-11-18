/* SCCA, 2019: his first eight races. Four winter weekends across the South,
 * each a Saturday and a Sunday race, in fields that ran from 18 to 32 cars
 * (mixed-class groups on the Orbits sheets). The visual is the field itself:
 * one small dot per car in each race, P1 at the top, and his place lit, so
 * the size of what he started out in reads before any number. */

import { useMemo } from 'react';
import { chartFont, PointerWord, useMeasuredWidth } from '../../app/charts';
import { countWord, dayRange, ordinalWord, weekday, fieldOf, openOf, placeName, rowTip, Signature, tintOf, useEntrance, useRaceCard, useSeriesRows } from './common';

const SERIES = 'series_scca_super_tour';

export const SccaSignature = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const weekends = useMemo(() => {
    const out: Array<{ track: string; rows: typeof rows }> = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.track === row.trackName) last.rows.push(row);
      else out.push({ track: row.trackName, rows: [row] });
    }
    return out;
  }, [rows]);

  if (rows.length === 0) return null;
  const fields = rows.map((row) => fieldOf(row) ?? row.finish);
  const minField = Math.min(...fields);
  const maxField = Math.max(...fields);
  const poleIndex = rows.findIndex((row) => row.start === 1);

  const phone = width > 0 && width < 520;
  const left = 36;
  const right = phone ? 28 : 6;
  const top = 26;
  const step = Math.min(phone ? 6 : 7.2, 230 / Math.max(maxField - 1, 1));
  const gaugeBottom = top + (maxField - 1) * step;
  const weekendW = Math.max((width - left - right) / Math.max(weekends.length, 1), 40);
  const colGap = Math.min(phone ? 30 : 46, weekendW * 0.4);
  const height = gaugeBottom + (phone ? 56 : 58);
  const y = (place: number) => top + (place - 1) * step;
  const fs = 12;

  let order = 0;
  const columns = weekends.flatMap((weekend, w) => {
    const cx = left + weekendW * (w + 0.5);
    return weekend.rows.map((row, i) => {
      const n = weekend.rows.length;
      const x = cx + (i - (n - 1) / 2) * colGap;
      return { row, x, w, i, n, order: order++ };
    });
  });

  return (
    <>
      <p className="chapter-panel__narrative">
        The first {countWord(rows.length)} races on his record: {countWord(weekends.length)} winter weekends across the South, a race on the
        Saturday and one on the Sunday, in fields of {minField} to {maxField} cars
        {poleIndex >= 0 ? <>, and pole for his {ordinalWord(poleIndex + 1)} race</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-scca"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }))}
            foot={
              <>
                One dot per car, P1 at the top; his place in colour. <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`His first ${rows.length} races, each race's field drawn car by car with his place marked`}>
                {[1, 10, 20, 30].filter((place) => place <= maxField).map((place) => (
                  <text key={place} x={left - 10} y={y(place) + 4} textAnchor="end" className="chs-axis">
                    P{place}
                  </text>
                ))}
                {weekends.map((weekend, w) => {
                  const cx = left + weekendW * (w + 0.5);
                  const first = weekend.rows[0].date;
                  const last = weekend.rows[weekend.rows.length - 1].date;
                  return (
                    <g key={weekend.track + w}>
                      <text x={cx} y={gaugeBottom + 36} textAnchor="middle" className="chs-label">
                        {placeName(weekend.track)}
                      </text>
                      <text x={cx} y={gaugeBottom + 52} textAnchor="middle" className="chs-axis">
                        {dayRange(first, last)}
                      </text>
                    </g>
                  );
                })}
                {columns.map(({ row, x, i, n, order: k }) => {
                  const field = fieldOf(row) ?? row.finish;
                  const key = row.sessionId;
                  const hot = card.hot === key;
                  const dim = card.hot !== null && !hot;
                  const delay = reduced ? 0 : k * 110;
                  const labelLeft = n > 1 && i === 0;
                  const prev = columns[k - 1];
                  const crowded = labelLeft && prev && prev.w !== columns[k].w && x - prev.x < 74 && Math.abs(y(prev.row.finish) - y(row.finish)) < 14;
                  const lx = crowded ? x : labelLeft ? x - 9 : x + 9;
                  const ly = crowded ? y(row.finish) + 19 : y(row.finish) + 4;
                  return (
                    <g key={key} style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 160ms ease' }}>
                      {Array.from({ length: field }, (_, p) => (
                        <circle
                          key={p}
                          cx={x}
                          cy={y(p + 1)}
                          r={1.7}
                          className="chs-car"
                          style={{ opacity: settled ? 1 : 0, transition: `opacity 240ms ease ${delay + p * 14}ms` }}
                        />
                      ))}
                      <text x={x} y={gaugeBottom + 18} textAnchor="middle" className="chs-axis">
                        {n > 1 ? weekday(row.date) : ''}
                      </text>
                      {row.start === 1 ? (
                        <g style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${delay + 500}ms` }}>
                          <circle cx={x} cy={y(1)} r={4.4} fill="var(--surface-0)" stroke="var(--ink)" strokeWidth={1} />
                          <text x={x} y={y(1) - 10} textAnchor="middle" className="chs-note">
                            pole
                          </text>
                        </g>
                      ) : null}
                      <g
                        style={{
                          opacity: settled ? 1 : 0,
                          transform: settled ? 'none' : 'translateY(-8px)',
                          transition: `opacity 320ms ease ${delay + 380}ms, transform 520ms cubic-bezier(0.22, 1, 0.36, 1) ${delay + 380}ms`
                        }}
                      >
                        <circle cx={x} cy={y(row.finish)} r={hot ? 5.6 : 4.6} fill={tint} />
                        <text
                          x={lx}
                          y={ly}
                          textAnchor={crowded ? 'middle' : labelLeft ? 'end' : 'start'}
                          fontFamily={chartFont}
                          fontSize={fs}
                          className="chs-place"
                        >
                          P{row.finish}
                        </text>
                      </g>
                      <rect
                        x={x - colGap / 2}
                        y={top - 14}
                        width={colGap}
                        height={gaugeBottom - top + 40}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(key, () => rowTip(row, x, y(row.finish) - 8, y(row.finish) + 8), openOf(row))}
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

