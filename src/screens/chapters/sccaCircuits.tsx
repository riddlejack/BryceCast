/* SCCA, 2019: the first eight races on his record, four winter weekends across
 * the South. The visual is the four circuits themselves, top-down, north up and
 * all at one scale, so Sebring's 6.0 km reads against Homestead's 3.7 km before
 * any number; each traces itself in date order, with his Saturday and Sunday
 * underneath. Outlines: circuits.ts (the 3D venue models' OpenStreetMap
 * centrelines); lengths: each model's own sourced official length. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { CareerRow } from '../careerExplorer';
import { CIRCUITS, type Circuit } from './circuits';
import { countWord, dayRange, fieldOf, ordinalWord, openOf, placeName, rowTip, Signature, tintOf, useEntrance, useRaceCard, useSeriesRows, weekday, EASE } from './common';

const SERIES = 'series_scca_super_tour';

const pathOf = (pts: Array<[number, number]>, scale: number, ox: number, oy: number) =>
  `M${pts.map(([x, y]) => `${(ox + x * scale).toFixed(1)},${(oy + y * scale).toFixed(1)}`).join('L')}Z`;

const lengthOf = (pts: Array<[number, number]>) =>
  pts.reduce((sum, [x, y], i) => {
    const [px, py] = pts[(i + pts.length - 1) % pts.length];
    return sum + Math.hypot(x - px, y - py);
  }, 0);

export const SccaCircuits = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const weekends = useMemo(() => {
    const out: Array<{ track: string; rows: CareerRow[]; circuit: Circuit | null }> = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.track === row.trackName) last.rows.push(row);
      else out.push({ track: row.trackName, rows: [row], circuit: CIRCUITS.find((c) => c.trackName === row.trackName) ?? null });
    }
    return out.map((weekend) => {
      const pts = weekend.circuit?.pts ?? [];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const box = pts.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null;
      return { ...weekend, box, drawn: lengthOf(pts) };
    });
  }, [rows]);

  if (rows.length === 0 || weekends.some((weekend) => !weekend.box)) return null;
  const fields = rows.map((row) => fieldOf(row) ?? row.finish);
  const poleIndex = rows.findIndex((row) => row.start === 1);
  const sorted = [...weekends].sort((a, b) => (b.circuit?.officialM ?? 0) - (a.circuit?.officialM ?? 0));
  const longest = sorted[0];
  const shortest = sorted[sorted.length - 1];
  const km = (m: number) => (m / 1000).toFixed(1);

  const phone = width > 0 && width < 520;
  const cols = phone ? 2 : weekends.length;
  const cellW = width / cols;
  const pad = phone ? 10 : 18;
  const headH = 40;
  const lineH = 18;
  const shapeH = phone ? 120 : 150;
  const footH = 12 + lineH * 2 + (phone ? 4 : 8);
  const cellH = headH + shapeH + footH + (phone ? 14 : 0);
  /* One scale for all four: the largest extent fits its cell. */
  const scale = Math.min(
    ...weekends.map((weekend) => {
      const box = weekend.box!;
      return Math.min((cellW - pad * 2) / (box.x1 - box.x0), shapeH / (box.y1 - box.y0));
    })
  );
  const rowsOfCells = Math.ceil(weekends.length / cols);
  const height = rowsOfCells * cellH + 26;
  const scaleBar = 1000 * scale;

  const resultLine = (row: CareerRow) => {
    const field = fieldOf(row);
    return `P${row.finish}${field ? ` of ${field}` : ''}`;
  };

  return (
    <>
      <p className="chapter-panel__narrative">
        The first {countWord(rows.length)} races on his record: {countWord(weekends.length)} winter weekends across the South, a race on the Saturday and one on
        the Sunday, at circuits from {placeName(shortest.track)}’s {km(shortest.circuit!.officialM)} km to {placeName(longest.track)}’s{' '}
        {km(longest.circuit!.officialM)}, in fields of {Math.min(...fields)} to {Math.max(...fields)} cars
        {poleIndex >= 0 ? <>, and pole for his {ordinalWord(poleIndex + 1)} race</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-circuits"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }))}
            foot={
              <>
                The four circuits from above, north up, all at one scale. <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`The four circuits of his first ${rows.length} races, drawn at one scale, with his finish in each race`}>
                {weekends.map((weekend, w) => {
                  const col = w % cols;
                  const line = Math.floor(w / cols);
                  const x0 = col * cellW;
                  const y0 = line * cellH;
                  const box = weekend.box!;
                  const ox = x0 + cellW / 2 - ((box.x0 + box.x1) / 2) * scale;
                  const oy = y0 + headH + shapeH / 2 - ((box.y0 + box.y1) / 2) * scale;
                  const length = weekend.drawn * scale;
                  const delay = reduced ? 0 : 200 + w * 520;
                  const hot = weekend.rows.some((row) => row.sessionId === card.hot);
                  const first = weekend.rows[0];
                  const last = weekend.rows[weekend.rows.length - 1];
                  return (
                    <g key={weekend.track}>
                      <text x={x0 + cellW / 2} y={y0 + 14} textAnchor="middle" className="chs-axis">
                        {dayRange(first.date, last.date)}
                      </text>
                      <text x={x0 + cellW / 2} y={y0 + 31} textAnchor="middle" className="chs-label">
                        {placeName(weekend.track)}
                      </text>
                      <path
                        d={pathOf(weekend.circuit!.pts, scale, ox, oy)}
                        fill="none"
                        stroke={hot ? tint : 'var(--ink)'}
                        strokeOpacity={hot ? 1 : 0.62}
                        strokeWidth={hot ? 2 : 1.4}
                        strokeLinejoin="round"
                        strokeDasharray={length}
                        strokeDashoffset={settled ? 0 : length}
                        style={{ transition: `stroke-dashoffset 1100ms ${EASE} ${delay}ms, stroke 160ms ease` }}
                      />
                      <rect
                        x={x0 + pad}
                        y={y0 + headH}
                        width={cellW - pad * 2}
                        height={shapeH}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(first.sessionId, () => rowTip(first, x0 + cellW / 2, y0 + headH + 4, y0 + headH + shapeH - 4), openOf(first))}
                      />
                      {weekend.rows.map((row, i) => {
                        const ly = y0 + headH + shapeH + 12 + lineH * (i + 0.7);
                        const rowHot = card.hot === row.sessionId;
                        return (
                          <g key={row.sessionId} style={{ opacity: settled ? 1 : 0, transition: `opacity 260ms ease ${delay + 700 + i * 120}ms` }}>
                            <text x={x0 + cellW / 2 - 6} y={ly} textAnchor="end" className="chs-axis">
                              {weekday(row.date)}
                            </text>
                            <text x={x0 + cellW / 2 + 2} y={ly} className="chs-place" fontSize={13} fill={rowHot ? tint : undefined}>
                              {resultLine(row)}
                              {row.start === 1 && !phone ? (
                                <tspan className="chs-note" dx={6}>
                                  from pole
                                </tspan>
                              ) : null}
                            </text>
                            <rect
                              x={x0 + pad}
                              y={ly - 13}
                              width={cellW - pad * 2}
                              height={lineH}
                              fill="transparent"
                              style={{ cursor: 'pointer' }}
                              {...card.bind(row.sessionId, () => rowTip(row, x0 + cellW / 2, ly - 14, ly + 6), openOf(row))}
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                <g transform={`translate(${phone ? 4 : pad}, ${height - 12})`} style={{ opacity: settled ? 1 : 0, transition: 'opacity 300ms ease 400ms' }}>
                  <line x1={0} x2={scaleBar} y1={0} y2={0} stroke="var(--ink)" strokeOpacity={0.5} strokeWidth={1} />
                  <line x1={0} x2={0} y1={-3} y2={3} stroke="var(--ink)" strokeOpacity={0.5} />
                  <line x1={scaleBar} x2={scaleBar} y1={-3} y2={3} stroke="var(--ink)" strokeOpacity={0.5} />
                  <text x={scaleBar + 6} y={4} className="chs-axis">
                    1 km
                  </text>
                </g>
              </svg>
            ) : null}
          </Signature>
        </div>
      </div>
    </>
  );
};
