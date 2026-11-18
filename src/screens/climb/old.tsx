import { useMemo, useRef, useState } from 'react';
import { Card, SourcePill } from '../../app/components';
import { ChartTipCard, chartFont, useInViewOnce, useMeasuredWidth, useReducedMotion, PointerOpen, type ChartTip } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { uiDataPackage, type UiCareerMoment } from '../../data/uiDataPackage';
import { chapterTint, raceHref, tipFor, useCareerRows } from '../careerExplorer';

/* The climb as it was before career round 2 (`?climb=old`): every race a dot
 * on the finishing percentile, chapter bands, the eleven-race form line and
 * the named moments. Moved here unchanged from careerExplorer.tsx. */

interface ClimbMomentPoint extends UiCareerMoment {
  cx: number;
  cy: number;
}

interface ClimbMomentPlacement extends ClimbMomentPoint {
  side: 'above' | 'below';
  labelWidth: number;
  labelX: number;
  labelY: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

/** Alternating label lanes carry most of the separation. A forward/backward
 * sweep then nudges same-lane labels just enough to keep a measured-width
 * chart collision-free without detaching leaders from their race dots. */
const layoutClimbMoments = ({
  moments,
  width,
  height,
  margin
}: {
  moments: ClimbMomentPoint[];
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}): ClimbMomentPlacement[] => {
  const leftEdge = margin.left;
  const rightEdge = width - margin.right;
  const gap = 8;
  const placements = moments.map((moment, index) => {
    const side = index % 2 === 0 ? 'below' : 'above';
    const labelWidth = Math.max(54, Array.from(moment.shortLabel).length * 5.9 + 4);
    return {
      ...moment,
      side,
      labelWidth,
      labelX: clamp(moment.cx, leftEdge + labelWidth / 2, rightEdge - labelWidth / 2),
      labelY:
        side === 'above'
          ? Math.max(margin.top - 4, moment.cy - 24)
          : Math.min(height - margin.bottom - 8, moment.cy + 30)
    } satisfies ClimbMomentPlacement;
  });

  for (const side of ['above', 'below'] as const) {
    const lane = placements.filter((placement) => placement.side === side).sort((left, right) => left.cx - right.cx);
    let cursor = leftEdge;
    for (const placement of lane) {
      const half = placement.labelWidth / 2;
      placement.labelX = Math.max(placement.labelX, cursor + half);
      cursor = placement.labelX + half + gap;
    }
    cursor = rightEdge;
    for (let index = lane.length - 1; index >= 0; index -= 1) {
      const placement = lane[index];
      const half = placement.labelWidth / 2;
      placement.labelX = Math.min(placement.labelX, cursor - half);
      cursor = placement.labelX - half - gap;
    }
  }

  return placements;
};

/* ---------- the climb: every race, one line, seven years ---------- */

export const OldClimb = () => {
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef] = useInViewOnce<HTMLDivElement>(0.35);
  const reducedMotion = useReducedMotion();
  /* No entrance animation on reading pages (site direction): the line is drawn at rest. */
  const chartShown = true;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const tap = useTapPreview();

  const n = rows.length;
  /* Full width on the page, so the chart grows with it: about a third as tall
   * as it is wide, between 360 and 660 px (a 2560 screen gets real depth). */
  const height = Math.round(Math.max(360, Math.min(660, width * 0.34)));
  const margin = { top: 34, right: 18, bottom: 30, left: 46 };
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const plotHeight = height - margin.top - margin.bottom;
  const x = (index: number) => margin.left + (index / Math.max(n - 1, 1)) * plotWidth;
  const y = (percentile: number) => margin.top + (1 - percentile) * plotHeight;
  const momentPoints = (uiDataPackage.screens.careerLab.moments ?? []).flatMap((moment) => {
    const index = rows.findIndex((row) => row.sessionId === moment.sessionId);
    return index === -1 ? [] : [{ ...moment, cx: x(index), cy: y(rows[index].percentile) }];
  });
  const momentPlacements = layoutClimbMoments({ moments: momentPoints, width, height, margin });

  /* Chapter bands: consecutive runs of the same series. */
  const bands = useMemo(() => {
    const result: Array<{ series: string; from: number; to: number; years: string }> = [];
    rows.forEach((row, index) => {
      const last = result[result.length - 1];
      if (last && last.series === row.seriesShort) {
        last.to = index;
      } else {
        result.push({ series: row.seriesShort, from: index, to: index, years: '' });
      }
    });
    for (const band of result) {
      const fromYear = rows[band.from].seasonYear;
      const toYear = rows[band.to].seasonYear;
      band.years = fromYear === toYear ? `’${String(fromYear).slice(2)}` : `’${String(fromYear).slice(2)}–’${String(toYear).slice(2)}`;
    }
    return result;
  }, [rows]);

  /* Trajectory: 11-race trimmed mean (middle 60%) — robust to hard days
   * without the vertical cliffs a rolling median produces. */
  const trend = useMemo(() => {
    const window = 11;
    const half = Math.floor(window / 2);
    return rows.map((_, index) => {
      const slice = rows
        .slice(Math.max(0, index - half), Math.min(n, index + half + 1))
        .map((row) => row.percentile)
        .sort((a, b) => a - b);
      const trim = Math.floor(slice.length * 0.2);
      const kept = slice.slice(trim, slice.length - trim);
      return kept.reduce((sum, value) => sum + value, 0) / kept.length;
    });
  }, [rows, n]);

  const clearHover = () => {
    setHovered(null);
    setTip(null);
  };

  const onMove = (event: React.MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const mouseX = event.clientX - bounds.left;
    const mouseY = event.clientY - bounds.top;
    let best: { index: number; distance: number } | null = null;
    for (let index = 0; index < n; index += 1) {
      const distance = Math.hypot(x(index) - mouseX, y(rows[index].percentile) - mouseY);
      if (!best || distance < best.distance) best = { index, distance };
    }
    if (!best || best.distance > 28) {
      clearHover();
      return null;
    }
    setHovered(best.index);
    const row = rows[best.index];
    setTip({ x: x(best.index), y: y(row.percentile), ...tipFor(row) });
    return best.index;
  };

  if (n < 10) return null;

  const trendPath = trend.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(value)}`).join(' ');
  const yearTickKept: boolean[] = [];
  {
    let lastX = Number.NEGATIVE_INFINITY;
    rows.forEach((row, index) => {
      const first = index === 0 || row.seasonYear !== rows[index - 1].seasonYear;
      const keep = first && x(index) - lastX >= 44;
      if (keep) lastX = x(index);
      yearTickKept.push(keep);
    });
  }

  return (
    <Card
      title="The climb, race by race"
      action={
        <SourcePill
          title="The climb"
          entries={[
            {
              label: 'Career result conversion · all series',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: `${n} source-backed races with a finishing percentile: the share of the field beaten, which stays honest as field sizes change between series. Named moments use deterministic event-date and finish-position rules; the form line is an eleven-race trimmed mean (middle 60% of the window).`
            },
            {
              label: 'Canonical career results · official status',
              path: 'data/career/career.dataset.json',
              note: 'The 2026 season index supplies WWTR’s official Mechanical status; every moment resolves back to a career result-conversion session.'
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <p className="caption caption--secondary" style={{ margin: '0 0 8px' }}>
        Every race a dot, every chapter its color · rings mark named moments · higher = more of the field beaten · the line
        follows his running form · ○ a day that ended early · <PointerOpen what="any dot" then="to open its race" />
      </p>
      <div ref={viewRef}>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={`Finishing percentile across every career race. Named moments: ${momentPoints
              .map((moment) => moment.shortLabel)
              .join(', ')}.`}
            {...tap.surface({ find: onMove, clear: clearHover, open: (index) => () => navigate(raceHref(rows[index as number].sessionId)) })}
            style={{ cursor: hovered !== null ? 'pointer' : 'default' }}
          >
            {bands.map((band, index) => {
              const from = x(band.from) - (band.from > 0 ? (x(band.from) - x(band.from - 1)) / 2 : margin.left * 0.2);
              const to = x(band.to) + (band.to < n - 1 ? (x(band.to + 1) - x(band.to)) / 2 : 8);
              const wide = to - from >= 96; // label only when it fits without touching neighbors
              return (
                <g key={`${band.series}${band.from}`}>
                  {index % 2 === 1 ? (
                    <rect x={from} y={margin.top - 16} width={to - from} height={plotHeight + 22} fill="rgba(0, 0, 0, 0.028)" />
                  ) : null}
                  {wide && width >= 640 ? (
                    <text x={(from + to) / 2} y={margin.top - 22} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={12.5} fontWeight={550}>
                      {band.series} {band.years}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {[0, 0.5, 1].map((tick) => (
              <g key={tick}>
                <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid-hairline)" />
                <text
                  x={margin.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ink-muted)"
                  fontFamily={chartFont}
                  fontSize={12.5}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {Math.round(tick * 100)}%
                </text>
              </g>
            ))}
            <text x={4} y={margin.top - 22} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={12.5}>
              field beaten
            </text>

            {rows.map((row, index) => {
              const clean = row.status === 'running';
              const tint = chapterTint(row.seriesName);
              return (
                <circle
                  key={row.sessionId + index}
                  cx={x(index)}
                  cy={y(row.percentile)}
                  r={hovered === index ? 5 : 3}
                  fill={clean ? tint : 'var(--surface-1)'}
                  fillOpacity={clean ? (hovered === index ? 1 : 0.5) : 1}
                  stroke={clean ? (hovered === index ? tint : 'none') : tint}
                  strokeWidth={1.3}
                  style={{ transition: 'r 120ms ease' }}
                />
              );
            })}
            {/* The form line draws itself in the first time the chart is seen. */}
            <path
              d={trendPath}
              fill="none"
              stroke="var(--ink-primary)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={chartShown ? 0 : 1}
              style={{ transition: reducedMotion ? 'none' : 'stroke-dashoffset 1200ms cubic-bezier(0.23, 1, 0.32, 1) 150ms' }}
            />

            <g className="climb-moments" aria-hidden="true">
              {momentPlacements.map((moment) => (
                <g key={`${moment.sessionId}/${moment.kind}`} data-moment-kind={moment.kind} data-session-id={moment.sessionId}>
                  <circle
                    className="climb-moment__ring"
                    cx={moment.cx}
                    cy={moment.cy}
                    r={6}
                    fill="none"
                    stroke="var(--ink-primary)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  {width >= 640 ? (
                    <g className="climb-moment__annotation">
                      <line
                        x1={moment.cx}
                        y1={moment.cy + (moment.side === 'below' ? 6 : -6)}
                        x2={moment.labelX}
                        y2={moment.labelY + (moment.side === 'below' ? -8 : 8)}
                        stroke="var(--ink-secondary)"
                        strokeOpacity={0.72}
                        strokeWidth={1}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={moment.labelX}
                        y={moment.labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--ink-secondary)"
                        stroke="var(--surface-1)"
                        strokeWidth={3}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        fontFamily={chartFont}
                        fontSize={12.5}
                      >
                        {moment.shortLabel}
                      </text>
                    </g>
                  ) : null}
                </g>
              ))}
            </g>

            {/* year ticks at each season's first race; on a narrow chart a year
                too close to the one before it is left out rather than overlap */}
            {rows.map((row, index) =>
              (index === 0 || row.seasonYear !== rows[index - 1].seasonYear) && yearTickKept[index] ? (
                <text
                  key={`yr${row.seasonYear}${index}`}
                  x={x(index)}
                  y={height - 8}
                  textAnchor="middle"
                  fill="var(--ink-muted)"
                  fontFamily={chartFont}
                  fontSize={12.5}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.seasonYear}
                </text>
              ) : null
            )}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} tap={tap} /> : null}
      </div>
      </div>
    </Card>
  );
};
