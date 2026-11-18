import { useEffect, useMemo, useRef, useState } from 'react';
import { chartFont, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { beatShare } from '../../app/raceFacts';
import { switchValue } from '../../review/switches';
import { RaceStillCard } from '../racesPeek';
import { RainStreaks, wetFor } from '../raceWet';
import type { SeasonMark } from './seasonMarks';
import './seasonCharts.css';

/* ============================================================================
 * A season on the Races page, made for his season (career round 3, Nov 18).
 *
 * Jack: the 2019-2023 graphs "look like boring basic Excel graphs", and the
 * 2024-2026 ones "should be tweaked slightly". Both now draw one picture in
 * the site's own marks (the climb's dots, thin ink lines, labels on leaders):
 *
 *   - every race is its field: a hairline from P1 down to the last car
 *     classified, with a tick at the back, so P3 of 11 and P3 of 32 read apart;
 *   - his dot sits where he finished in it, in the series' tint; it rises from
 *     the back of the field to its place as the season draws in;
 *   - races sit together by weekend, the venue named under each weekend, so
 *     the season reads as the places he went; the 3D still on hover or tap;
 *   - one thin ink line runs through each weekend's average, so what changed
 *     across the year reads without studying the dots;
 *   - a win (earlier years) or an INDY NXT top 5 is ringed in ink; a first win
 *     in a series is named over its dot; ✕ is a race with no classified finish.
 *
 * Switch `racescharts`: field (default) | share (each field drawn the same
 * height: the share of the other cars he beat, as the Career climb measures
 * it) | old (round 2's charts).
 * ==========================================================================*/

export type SeasonLook = 'field' | 'share' | 'old';
export const seasonLook = (): SeasonLook => {
  const value = switchValue('racescharts');
  return value === 'share' || value === 'old' ? value : 'field';
};

const DRAW_MS = 1500;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

interface Weekend {
  from: number;
  to: number;
  label: string;
  marks: number[];
}

/** Races at one venue within four days of the weekend's first race share a weekend. */
const weekendsOf = (marks: SeasonMark[]): Weekend[] => {
  const out: Weekend[] = [];
  marks.forEach((mark, index) => {
    const last = out[out.length - 1];
    const first = last ? marks[last.marks[0]] : null;
    const days = first && mark.day && first.day ? (Date.parse(mark.day) - Date.parse(first.day)) / 86_400_000 : Infinity;
    if (last && first && first.venueShort === mark.venueShort && days >= 0 && days <= 4) {
      last.marks.push(index);
      last.to = index;
    } else {
      out.push({ from: index, to: index, label: mark.venueShort, marks: [index] });
    }
  });
  return out;
};

const useDrawProgress = (start: boolean, reduced: boolean): number => {
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setP(1);
      return;
    }
    if (!start) return;
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = clamp01((now - t0) / DRAW_MS);
      setP(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, reduced]);
  return p;
};

/** A label's width, near enough to keep two from touching. */
const textW = (text: string, size: number) => text.length * size * 0.56;

export const FieldSeason = ({
  marks,
  label,
  look = seasonLook()
}: {
  marks: SeasonMark[];
  label: string;
  look?: SeasonLook;
}) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.25);
  const reduced = useReducedMotion();
  const p = useDrawProgress(inView, reduced);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const tap = useTapPreview();
  const weekends = useMemo(() => weekendsOf(marks), [marks]);
  const n = marks.length;

  const phone = width > 0 && width < 560;
  const share = look === 'share';
  const standingRows = marks.map((mark) => mark.standing).filter((value): value is number => value !== null);
  const hasStanding = standingRows.length > 1;
  const hasNone = marks.some((mark) => mark.finish === null);
  const hasMoments = !phone && marks.some((mark) => mark.moment);

  /* ---------- geometry ---------- */
  const fs = phone ? 12.5 : 13.5;
  const margin = { top: hasMoments ? 40 : 14, right: 12, left: hasNone ? (phone ? 60 : 70) : phone ? 40 : 54 };
  const maxPlace = Math.max(5, ...marks.map((mark) => Math.max(mark.field ?? 0, mark.finish ?? 0)));
  const plotH = phone ? 148 : share ? 176 : Math.min(230, Math.max(160, maxPlace * 6.4));
  const plotTop = margin.top;
  const plotBottom = plotTop + plotH;
  const laneY = plotBottom + 22;
  const bracketY = (hasNone ? laneY : plotBottom) + 14;

  /* x: a slot per race, a wider gap between weekends; slots stop growing at a
   * comfortable width so a short year (four races) doesn't sprawl. */
  const gap = phone ? 0.9 : 1.5;
  const units = n + Math.max(weekends.length - 1, 0) * gap;
  const plotW = Math.max(width - margin.left - margin.right, 80);
  const unit = Math.min(plotW / Math.max(units, 1), phone ? 30 : 96);
  const xs: number[] = [];
  {
    let cursor = margin.left + unit / 2;
    weekends.forEach((weekend, w) => {
      if (w > 0) cursor += gap * unit;
      weekend.marks.forEach((index) => {
        xs[index] = cursor;
        cursor += unit;
      });
    });
  }
  const r = phone ? 3.6 : 4.4;

  const yPlace = (place: number) => plotTop + ((place - 1) / Math.max(maxPlace - 1, 1)) * plotH;
  const yShare = (s: number) => plotTop + (1 - s) * plotH;
  /** Where the dot settles; null: no classified finish (it sits in the lane). */
  const yOf = (mark: SeasonMark): number | null => {
    if (mark.finish === null) return null;
    if (!share) return yPlace(mark.finish);
    const s = beatShare(mark.finish, mark.field);
    return s !== null ? yShare(s) : mark.finish === 1 ? yShare(1) : null;
  };
  /** Where it rises from: the back of its field. */
  const yBack = (mark: SeasonMark): number => (share ? plotBottom : mark.field ? yPlace(mark.field) : plotBottom);

  /* each race's moment in the draw */
  const raceT = (index: number) => ease(clamp01((p - (index / Math.max(n, 1)) * 0.62) / 0.38));
  const lineT = clamp01((p - 0.25) / 0.75);

  /* the weekend line: each weekend's average, through the weekend's middle */
  const formPts = weekends
    .map((weekend) => {
      const ys = weekend.marks.map((index) => yOf(marks[index])).filter((value): value is number => value !== null);
      if (!ys.length) return null;
      return { x: (xs[weekend.from] + xs[weekend.to]) / 2, y: ys.reduce((a, b) => a + b, 0) / ys.length };
    })
    .filter((value): value is { x: number; y: number } => value !== null);
  const formD = formPts.map((pt, k) => `${k ? 'L' : 'M'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');

  /* weekend names, two rows at most; a name that fits neither is left to the card */
  const labelRows: Array<Array<[number, number]>> = [[], []];
  const placed = weekends.map((weekend) => {
    const cx = (xs[weekend.from] + xs[weekend.to]) / 2;
    const w = textW(weekend.label, fs - 0.5) + 10;
    const lo = Math.max(cx - w / 2, 2);
    const hi = Math.min(lo + w, Math.max(width - 2, lo + w));
    for (let row = 0; row < (phone ? 2 : 2); row += 1) {
      if (labelRows[row].every(([a, b]) => hi <= a || lo >= b)) {
        labelRows[row].push([lo, hi]);
        return { cx: Math.min(Math.max(cx, w / 2 - 4), width - w / 2 + 4), row };
      }
    }
    return null;
  });
  const usedRows = placed.some((value) => value?.row === 1) ? 2 : 1;
  const labelsBottom = bracketY + 6 + usedRows * (fs + 5);

  /* standing (INDY NXT): its own thin panel under the weekends */
  const standTop = labelsBottom + 34;
  const standH = phone ? 54 : 66;
  const standMin = hasStanding ? Math.max(1, Math.min(...standingRows) - 1) : 1;
  const standMax = hasStanding ? Math.max(...standingRows) + 1 : 2;
  const yStand = (rank: number) => standTop + ((rank - standMin) / Math.max(standMax - standMin, 1)) * standH;
  const height = hasStanding ? standTop + standH + 12 : labelsBottom + 4;

  /* moments, labelled over their dots on leaders (the climb's notes) */
  const notes = useMemo(() => {
    if (!hasMoments || width === 0) return [];
    const rows: Array<Array<[number, number]>> = [];
    const out: Array<{ index: number; text: string; x: number; row: number }> = [];
    marks.forEach((mark, index) => {
      if (!mark.moment) return;
      const w = textW(mark.moment, 12.5) + 8;
      const x = Math.min(Math.max(xs[index] - 6, margin.left), width - w);
      let row = 0;
      while (rows[row] && !rows[row].every(([a, b]) => x + w <= a || x >= b)) row += 1;
      (rows[row] ??= []).push([x, x + w]);
      out.push({ index, text: mark.moment, x, row });
    });
    return out;
    // xs is derived from width and marks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoments, width, marks]);

  /* ---------- pointer ---------- */
  const find = (event: React.MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || n === 0) return null;
    const mx = event.clientX - bounds.left;
    if (mx < xs[0] - unit - 8 || mx > xs[n - 1] + unit + 8) {
      setHovered(null);
      return null;
    }
    let best = 0;
    for (let i = 1; i < n; i += 1) if (Math.abs(xs[i] - mx) < Math.abs(xs[best] - mx)) best = i;
    setHovered(best);
    return best;
  };

  const hoveredMark = hovered !== null ? marks[hovered] : null;
  const hoveredWeekend = hovered !== null ? weekends.findIndex((weekend) => hovered >= weekend.from && hovered <= weekend.to) : -1;
  const placeTicks = [1, 5, 10, 15, 20, 25, 30, 35].filter((tick) => tick <= maxPlace && (maxPlace <= 15 || tick !== 5));

  if (n === 0) return null;

  return (
    <div ref={ref} className="fseason" style={{ width: '100%', position: 'relative' }}>
      <div ref={viewRef}>
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={label}
            {...tap.surface({
              find,
              clear: () => setHovered(null),
              open: (index) => () => navigate(marks[index as number].href)
            })}
            style={{ cursor: hovered !== null ? 'pointer' : 'default', display: 'block' }}
          >
            {/* the axis: front of the field at the top */}
            {share ? (
              <g fontFamily={chartFont} fontSize={fs - 0.5} fill="var(--ink-muted)">
                <line x1={margin.left - 4} x2={width - margin.right} y1={yShare(1)} y2={yShare(1)} stroke="var(--grid-hairline)" />
                <line x1={margin.left - 4} x2={width - margin.right} y1={yShare(0.5)} y2={yShare(0.5)} stroke="var(--axis-baseline)" strokeDasharray="2 4" />
                <line x1={margin.left - 4} x2={width - margin.right} y1={yShare(0)} y2={yShare(0)} stroke="var(--grid-hairline)" />
                <text x={margin.left - 10} y={yShare(1)} textAnchor="end" dominantBaseline="middle">won</text>
                <text x={margin.left - 10} y={yShare(0.5)} textAnchor="end" dominantBaseline="middle">half</text>
                <text x={margin.left - 10} y={yShare(0)} textAnchor="end" dominantBaseline="middle">last</text>
              </g>
            ) : (
              <g fontFamily={chartFont} fontSize={fs - 0.5} fill="var(--ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {placeTicks.map((tick) => (
                  <g key={tick}>
                    <line x1={margin.left - 4} x2={width - margin.right} y1={yPlace(tick)} y2={yPlace(tick)} stroke="var(--grid-hairline)" />
                    <text x={margin.left - 10} y={yPlace(tick)} textAnchor="end" dominantBaseline="middle" fill={tick === 1 ? 'var(--ink-secondary)' : undefined}>
                      P{tick}
                    </text>
                  </g>
                ))}
              </g>
            )}
            {hasNone ? (
              <text x={margin.left - 10} y={laneY} textAnchor="end" dominantBaseline="middle" fontFamily={chartFont} fontSize={Math.max(12, fs - 1)} fill="var(--ink-muted)">
                no finish
              </text>
            ) : null}

            {/* the hovered race's column, quiet */}
            {hovered !== null ? (
              <line
                x1={xs[hovered]}
                x2={xs[hovered]}
                y1={plotTop - 4}
                y2={hasStanding ? standTop + standH : bracketY - 6}
                stroke="var(--axis-baseline)"
                strokeDasharray="2 3"
                pointerEvents="none"
              />
            ) : null}
            {/* the cars he beat: a hairline from his dot down to the back of
                that race's field, with a tick at the back. It trails the dot up
                as the dot climbs from the back to its place. */}
            {marks.map((mark, index) => {
              const settle = yOf(mark);
              if (!mark.field || settle === null) return null;
              const t = raceT(index);
              if (t <= 0) return null;
              const lit = hovered === index;
              const dim = hoveredWeekend >= 0 && !(index >= weekends[hoveredWeekend].from && index <= weekends[hoveredWeekend].to);
              const back = yBack(mark);
              const dotY = back + (settle - back) * t;
              return (
                <g key={`f${mark.id}`} stroke={lit ? 'var(--ink)' : 'var(--grey-line)'} strokeWidth={1} opacity={dim ? 0.45 : 1} strokeLinecap="round">
                  {back - dotY > 1 ? <line x1={xs[index]} x2={xs[index]} y1={dotY} y2={back} /> : null}
                  {share ? null : <line x1={xs[index] - 3} x2={xs[index] + 3} y1={back} y2={back} />}
                </g>
              );
            })}

            {/* the weekend line */}
            {formPts.length > 1 && lineT > 0 ? (
              <path
                d={formD}
                fill="none"
                stroke="var(--ink)"
                strokeOpacity={hoveredWeekend >= 0 ? 0.25 : 0.42}
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - lineT}
              />
            ) : null}

            {/* his finishes */}
            {marks.map((mark, index) => {
              const t = raceT(index);
              if (t <= 0) return null;
              const lit = hovered === index;
              const dim = hoveredWeekend >= 0 && !(index >= weekends[hoveredWeekend].from && index <= weekends[hoveredWeekend].to);
              const cx = xs[index];
              const settle = yOf(mark);
              const rr = lit ? r + 1.8 : r;
              if (settle === null) {
                const k = (lit ? 4.4 : 3.2) * Math.min(1, t * 1.5);
                return (
                  <g key={mark.id} data-mark={index} stroke={mark.tint} strokeWidth={lit ? 2 : 1.6} strokeLinecap="round" opacity={dim ? 0.45 : 1}>
                    <line x1={cx - k} x2={cx + k} y1={laneY - k} y2={laneY + k} />
                    <line x1={cx - k} x2={cx + k} y1={laneY + k} y2={laneY - k} />
                  </g>
                );
              }
              const cy = yBack(mark) + (settle - yBack(mark)) * t;
              const wet = t >= 1 ? wetFor(mark.id) : null;
              return (
                <g key={mark.id} data-mark={index} opacity={(dim ? 0.45 : 1) * Math.min(1, t * 3)}>
                  {mark.ring && t >= 1 ? <circle cx={cx} cy={cy} r={rr + 3.2} fill="none" stroke="var(--ink)" strokeWidth={1.2} /> : null}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={rr}
                    fill={mark.clean ? mark.tint : 'var(--paper)'}
                    fillOpacity={mark.clean ? (lit ? 1 : 0.88) : 1}
                    stroke={mark.clean ? (lit ? 'var(--ink)' : 'var(--paper)') : mark.tint}
                    strokeWidth={mark.clean ? (lit ? 1.5 : 0.9) : 1.5}
                  />
                  {wet ? <RainStreaks cx={cx} cy={cy} r={mark.ring ? rr + 3.2 : rr} read={wet} /> : null}
                </g>
              );
            })}

            {/* moments */}
            {notes.map((note) => {
              const mark = marks[note.index];
              const y = yOf(mark);
              if (y === null || p < 1) return null;
              const ly = plotTop - 12 - note.row * 15;
              const top = y - r - (mark.ring ? 5 : 2);
              return (
                <g key={`m${mark.id}`} className="fseason__note" aria-hidden>
                  <line x1={xs[note.index]} x2={xs[note.index]} y1={top} y2={ly + 4} stroke="var(--ink-secondary)" strokeOpacity={0.5} strokeWidth={1} />
                  <text
                    x={note.x}
                    y={ly}
                    fontFamily={chartFont}
                    fontSize={12.5}
                    fill="var(--ink-secondary)"
                    stroke="var(--paper)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {note.text}
                  </text>
                </g>
              );
            })}

            {/* the weekends: a bracket under each, the venue named */}
            {weekends.map((weekend, w) => {
              const x0 = xs[weekend.from];
              const x1 = xs[weekend.to];
              const lit = hoveredWeekend === w;
              const where = placed[w];
              return (
                <g key={`w${w}`}>
                  <path
                    d={x1 > x0 ? `M${x0 - 3} ${bracketY - 5} V${bracketY} H${x1 + 3} V${bracketY - 5}` : `M${x0} ${bracketY - 5} V${bracketY}`}
                    fill="none"
                    stroke="var(--ink)"
                    strokeOpacity={lit ? 0.75 : 0.28}
                    strokeWidth={1}
                  />
                  {where ? (
                    <text
                      x={where.cx}
                      y={bracketY + 6 + (where.row + 1) * (fs + 5) - 5}
                      textAnchor="middle"
                      fontFamily={chartFont}
                      fontSize={fs - 0.5}
                      fontWeight={lit ? 600 : 400}
                      fill={lit ? 'var(--ink)' : 'var(--ink-muted)'}
                    >
                      {weekend.label}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* the championship (INDY NXT) */}
            {hasStanding ? (
              <g>
                <text x={margin.left - 4} y={standTop - 14} fontFamily={chartFont} fontSize={fs} fontWeight={550} fill="var(--ink-secondary)">
                  Championship standing
                </text>
                {(() => {
                  let d = '';
                  let lastX = 0;
                  let lastY = 0;
                  marks.forEach((mark, index) => {
                    if (mark.standing === null) return;
                    const px = xs[index];
                    const py = yStand(mark.standing);
                    d += d ? ` H${px} V${py}` : `M${px} ${py}`;
                    lastX = px;
                    lastY = py;
                  });
                  const final = [...marks].reverse().find((mark) => mark.standing !== null)?.standing ?? null;
                  return (
                    <>
                      {[standMin + 1, standMax - 1]
                        .filter((tick, k, all) => all.indexOf(tick) === k)
                        .map((tick) => (
                          <g key={`s${tick}`}>
                            <line x1={margin.left - 4} x2={width - margin.right} y1={yStand(tick)} y2={yStand(tick)} stroke="var(--grid-hairline)" />
                            <text x={margin.left - 10} y={yStand(tick)} textAnchor="end" dominantBaseline="middle" fontFamily={chartFont} fontSize={fs - 0.5} fill="var(--ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              P{tick}
                            </text>
                          </g>
                        ))}
                      <path
                        d={d}
                        fill="none"
                        stroke="var(--ink-secondary)"
                        strokeWidth={1.3}
                        strokeLinejoin="round"
                        pathLength={1}
                        strokeDasharray="1 1"
                        strokeDashoffset={1 - lineT}
                      />
                      {hovered !== null && marks[hovered].standing !== null ? (
                        <circle cx={xs[hovered]} cy={yStand(marks[hovered].standing as number)} r={3.4} fill="var(--ink)" />
                      ) : lineT >= 1 && final !== null ? (
                        <circle cx={lastX} cy={lastY} r={3} fill="var(--ink-secondary)" />
                      ) : null}
                    </>
                  );
                })()}
              </g>
            ) : null}

          </svg>
        ) : null}
      </div>
      {hoveredMark && hovered !== null ? (
        <RaceStillCard
          venue={hoveredMark.card.venue}
          x={xs[hovered]}
          y={yOf(hoveredMark) ?? laneY}
          r={r + 3}
          width={width}
          swatch={hoveredMark.tint}
          meta={hoveredMark.card.meta}
          title={hoveredMark.card.title}
          nums={hoveredMark.card.nums}
          note={hoveredMark.card.note}
          action={hoveredMark.card.action}
          tap={tap}
        />
      ) : null}
    </div>
  );
};
