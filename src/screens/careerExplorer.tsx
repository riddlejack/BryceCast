import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Card, SourcePill, Stat, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useInViewOnce, useMeasuredWidth, type ChartTip } from '../app/charts';
import { asNumber, asString, ordinal } from '../app/format';
import { Link, useRouter } from '../app/router';
import { uiDataPackage, type UiCareerMoment } from '../data/uiDataPackage';
import { packModules } from '../data/packModules';

export interface CareerRow {
  raceLabel: string;
  sessionId: string;
  seriesName: string;
  seriesShort: string;
  seasonYear: number | null;
  trackType: string;
  trackName: string;
  start: number | null;
  finish: number;
  gain: number | null;
  percentile: number;
  status: string;
  date: string;
  wetDry: string | null;
}

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

/** INDY NXT races have full debrief pages; every other race gets the light career sheet. */
export const raceHref = (sessionId: string): string =>
  sessionId.includes('indy_nxt') ? `/races/${encodeURIComponent(sessionId)}` : `/career/race/${encodeURIComponent(sessionId)}`;

/* Multi-race rounds share one label ("Round 4 - Spa-Francorchamps"); the race
 * number lives in the session id, so surface it whenever a label repeats. */
const raceNumberOf = (sessionId: string): number | null => {
  const match = sessionId.match(/race[_-]?(\d+)/i);
  return match ? Number(match[1]) : null;
};

const seriesShortNames: Record<string, string> = {
  'F1600 Championship Series': 'F1600',
  'Formula Ford': 'Formula Ford',
  'GB3 Championship': 'GB3',
  'Euroformula Open': 'Euroformula',
  'Castrol Toyota Formula Regional Oceania Championship': 'FR Oceania',
  'IMSA WeatherTech SportsCar Championship': 'IMSA',
  'INDY NXT': 'INDY NXT'
};

export const seriesShort = (name: string): string => seriesShortNames[name] ?? name;

/* Chapter identity color: one quiet tint per era, ink for the current chapter.
 * Values live in theme.css and passed the dataviz six-checks validator. */
const chapterTints: Record<string, string> = {
  'F1600 Championship Series': 'var(--chapter-f1600)',
  'Formula Ford': 'var(--chapter-ff)',
  'GB3 Championship': 'var(--chapter-gb3)',
  'Euroformula Open': 'var(--chapter-euro)',
  'Castrol Toyota Formula Regional Oceania Championship': 'var(--chapter-fro)',
  'IMSA WeatherTech SportsCar Championship': 'var(--chapter-imsa)',
  'INDY NXT': 'var(--ink-primary)'
};

export const chapterTint = (seriesName: string): string => chapterTints[seriesName] ?? 'var(--ink-primary)';

const shortToSeriesName = Object.fromEntries(Object.entries(seriesShortNames).map(([full, short]) => [short, full]));

export const chapterTintForShort = (shortName: string): string => chapterTint(shortToSeriesName[shortName] ?? shortName);

/** All 141 career races, chronological, straight from the validated package. */
export const useCareerRows = (): CareerRow[] => {
  return useMemo(() => {
    const raw = uiDataPackage.screens.careerLab.resultConversion ?? [];
    return raw
      .map((row): CareerRow | null => {
        const finish = asNumber(row.finishPosition);
        const percentile = asNumber(row.finishPercentile);
        const date = asString(row.eventStartDate);
        if (finish === null || percentile === null || date === null) return null;
        return {
          raceLabel: (asString(row.raceLabel) ?? '').replace(/^\d{4}\s+/, ''),
          sessionId: asString(row.sessionId) ?? '',
          seriesName: asString(row.seriesName) ?? '',
          seriesShort: seriesShort(asString(row.seriesName) ?? ''),
          seasonYear: asNumber(row.seasonYear),
          trackType: (asString(row.trackType) ?? '').toLowerCase(),
          trackName: asString(row.trackName) ?? '',
          start: asNumber(row.startPosition),
          finish,
          gain: asNumber(row.positionGain),
          percentile,
          status: asString(row.status) ?? 'running',
          date,
          wetDry: asString(row.wetDry)
        };
      })
      .filter((row): row is CareerRow => row !== null)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((row, _, all) => {
        if (all.filter((other) => other.raceLabel === row.raceLabel).length < 2) return row;
        const raceNumber = raceNumberOf(row.sessionId);
        return raceNumber !== null ? { ...row, raceLabel: `${row.raceLabel} · Race ${raceNumber}` } : row;
      });
  }, []);
};

export const tipFor = (row: CareerRow): Omit<ChartTip, 'x' | 'y'> => ({
  title: row.raceLabel,
  detail: [
    row.seriesShort,
    row.start !== null ? `P${row.start} → P${row.finish}` : `finished P${row.finish}`,
    row.status !== 'running' ? row.status : null,
    row.wetDry && row.wetDry !== 'dry' ? `${row.wetDry} track` : null,
    `beat ${Math.round(row.percentile * 100)}% of the field`
  ]
    .filter(Boolean)
    .join(' · '),
  action: 'open the race page'
});

/* ---------- the climb: every race, one line, seven years ---------- */

export const TheClimb = () => {
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, chartSeen] = useInViewOnce<HTMLDivElement>(0.35);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const n = rows.length;
  const height = 340;
  const margin = { top: 30, right: 18, bottom: 26, left: 40 };
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

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const mouseX = event.clientX - bounds.left;
    const mouseY = event.clientY - bounds.top;
    let best: { index: number; distance: number } | null = null;
    for (let index = 0; index < n; index += 1) {
      const distance = Math.hypot(x(index) - mouseX, y(rows[index].percentile) - mouseY);
      if (!best || distance < best.distance) best = { index, distance };
    }
    if (!best || best.distance > 28) {
      clearHover();
      return;
    }
    setHovered(best.index);
    const row = rows[best.index];
    setTip({ x: x(best.index), y: y(row.percentile), ...tipFor(row) });
  };

  if (n < 10) return null;

  const trendPath = trend.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(value)}`).join(' ');

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
              note: `${n} source-backed races with a finishing percentile — the share of the field beaten, which stays honest as field sizes change between series. Named moments use deterministic event-date and finish-position rules; the form line is an eleven-race trimmed mean (middle 60% of the window).`
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
        follows his running form · ○ a day that ended early · click any dot to open its race
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
            onMouseMove={onMove}
            onMouseLeave={clearHover}
            onClick={() => {
              if (hovered !== null) navigate(raceHref(rows[hovered].sessionId));
            }}
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
                    <text x={(from + to) / 2} y={margin.top - 20} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11} fontWeight={550}>
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
                  fontSize={10.5}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {Math.round(tick * 100)}%
                </text>
              </g>
            ))}
            <text x={4} y={margin.top - 20} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
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
              strokeDashoffset={chartSeen ? 0 : 1}
              style={{ transition: 'stroke-dashoffset 1200ms cubic-bezier(0.23, 1, 0.32, 1) 150ms' }}
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
                        fontSize={10.5}
                      >
                        {moment.shortLabel}
                      </text>
                    </g>
                  ) : null}
                </g>
              ))}
            </g>

            {/* year ticks at each season's first race */}
            {rows.map((row, index) =>
              index === 0 || row.seasonYear !== rows[index - 1].seasonYear ? (
                <text
                  key={`yr${row.seasonYear}${index}`}
                  x={x(index)}
                  y={height - 8}
                  textAnchor="middle"
                  fill="var(--ink-muted)"
                  fontFamily={chartFont}
                  fontSize={10.5}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.seasonYear}
                </text>
              ) : null
            )}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      </div>
    </Card>
  );
};

/* ---------- chapter strip: one era's races on the percentile scale ---------- */

export const ChapterStrip = ({ seriesName }: { seriesName: string }) => {
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const chapterRows = useMemo(() => rows.filter((row) => row.seriesName === seriesName), [rows, seriesName]);
  if (chapterRows.length === 0) return null;

  const height = 40;
  const axisY = 22;
  const x = (percentile: number) => 8 + percentile * (width - 16);
  const sorted = [...chapterRows].sort((a, b) => a.percentile - b.percentile);
  const median = sorted[Math.floor(sorted.length / 2)].percentile;

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`${seriesName} finishing percentiles`}>
          <line x1={8} x2={width - 8} y1={axisY} y2={axisY} stroke="var(--grid-hairline)" strokeWidth={1.5} />
          {chapterRows.map((row, index) => (
            <circle
              key={row.sessionId + index}
              cx={x(row.percentile)}
              cy={axisY}
              r={3.4}
              fill={row.status === 'running' ? chapterTint(row.seriesName) : 'var(--surface-1)'}
              fillOpacity={row.status === 'running' ? 0.5 : 1}
              stroke={row.status === 'running' ? 'none' : chapterTint(row.seriesName)}
              strokeWidth={1.2}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTip({ x: x(row.percentile), y: axisY - 6, ...tipFor(row) })}
              onMouseLeave={() => setTip(null)}
              onClick={() => navigate(raceHref(row.sessionId))}
            />
          ))}
          <rect x={x(median) - 1.75} y={axisY - 9} width={3.5} height={18} rx={1.75} fill="var(--bryce)" />
          <text x={8} y={height - 1} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
            tougher days
          </text>
          <text x={width - 8} y={height - 1} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
            stronger days
          </text>
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

/* ---------- the explorer: curated playground over all 141 races ---------- */

export const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className="chip"
    style={
      active
        ? { cursor: 'pointer', background: 'var(--ink-primary)', color: '#fff', borderColor: 'transparent' }
        : { cursor: 'pointer', color: 'var(--ink-secondary)' }
    }
  >
    {label}
  </button>
);

/** One labeled row of controls, so each kind of filtering names itself. */
export const ControlRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
    <span className="caption caption--secondary" style={{ width: 62, flex: 'none', paddingTop: 6 }}>
      {label}
    </span>
    <span className="row row--wrap" style={{ gap: 6 }}>
      {children}
    </span>
  </div>
);

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  wrap = false
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  /** Let a long option set flow onto a second line on narrow screens. */
  wrap?: boolean;
}) => (
  <div className={`segmented${wrap ? ' segmented--wrap' : ''}`} role="tablist">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="tab"
        aria-selected={option.value === value}
        className={`segmented__option${option.value === value ? ' segmented__option--active' : ''}`}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/* Start → finish, house-drawn: both axes in grid positions (P1 top-left),
 * the dashed diagonal is "finished where he started", dots above it are
 * places gained. Axes fit the filtered rows so small series read large. */
const ConversionPlot = ({ rows }: { rows: CareerRow[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const height = 340;
  const margin = { top: 22, right: 18, bottom: 38, left: 44 };
  const maxPosition = useMemo(() => Math.max(8, ...rows.map((row) => Math.max(row.start ?? 1, row.finish))) + 1, [rows]);
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const plotHeight = height - margin.top - margin.bottom;
  const x = (position: number) => margin.left + ((position - 1) / (maxPosition - 1)) * plotWidth;
  const y = (position: number) => margin.top + ((position - 1) / (maxPosition - 1)) * plotHeight;

  const tickStep = Math.max(1, Math.ceil((maxPosition - 1) / 5));
  const ticks = useMemo(() => {
    const values = [1];
    for (let value = 1 + tickStep; value <= maxPosition; value += tickStep) values.push(value);
    return values;
  }, [maxPosition, tickStep]);

  const clearHover = () => {
    setHovered(null);
    setTip(null);
  };

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const mouseX = event.clientX - bounds.left;
    const mouseY = event.clientY - bounds.top;
    let best: { index: number; distance: number } | null = null;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.start === null) continue;
      const distance = Math.hypot(x(row.start) - mouseX, y(row.finish) - mouseY);
      if (!best || distance < best.distance) best = { index, distance };
    }
    if (!best || best.distance > 24) {
      clearHover();
      return;
    }
    setHovered(best.index);
    const row = rows[best.index];
    setTip({ x: x(row.start ?? 1), y: y(row.finish), ...tipFor(row) });
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label="Start position against finish position for every filtered race"
          onMouseMove={onMove}
          onMouseLeave={clearHover}
          onClick={() => {
            if (hovered !== null) navigate(raceHref(rows[hovered].sessionId));
          }}
          style={{ cursor: hovered !== null ? 'pointer' : 'default' }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={margin.top} y2={height - margin.bottom} stroke="var(--grid-hairline)" />
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid-hairline)" />
              <text
                x={x(tick)}
                y={height - margin.bottom + 16}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
              <text
                x={margin.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
            </g>
          ))}
          <text x={width - margin.right} y={height - margin.bottom + 30} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
            started
          </text>
          <text x={margin.left - 34} y={margin.top - 8} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
            finished
          </text>
          <line
            x1={x(1)}
            y1={y(1)}
            x2={x(maxPosition)}
            y2={y(maxPosition)}
            stroke="var(--axis-baseline)"
            strokeDasharray="4 4"
          />
          {rows.map((row, index) => {
            if (row.start === null) return null;
            const clean = row.status === 'running';
            const win = row.finish === 1;
            const focused = hovered === index;
            return (
              <circle
                key={row.sessionId + index}
                cx={x(row.start)}
                cy={y(row.finish)}
                r={focused ? 5.5 : 3.6}
                fill={win ? 'var(--bryce)' : clean ? 'var(--ink-primary)' : 'var(--surface-1)'}
                fillOpacity={win ? 1 : clean ? (focused ? 1 : 0.38) : 1}
                stroke={win ? 'var(--ink-primary)' : clean ? (focused ? 'var(--ink-primary)' : 'none') : 'var(--ink-muted)'}
                strokeWidth={win ? 1 : 1.3}
                style={{ transition: 'r 120ms ease' }}
              />
            );
          })}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

type GroupBy = 'series' | 'season' | 'trackType' | 'conditions';

const GroupedStrips = ({ rows, groupBy }: { rows: CareerRow[]; groupBy: GroupBy }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [tip, setTip] = useState<ChartTip | null>(null);

  const groups = useMemo(() => {
    const keyFor = (row: CareerRow) =>
      groupBy === 'series'
        ? row.seriesShort
        : groupBy === 'season'
          ? String(row.seasonYear ?? '—')
          : groupBy === 'conditions'
            ? row.wetDry === null
              ? 'no report'
              : row.wetDry === 'dry'
                ? 'dry'
                : 'wet or mixed'
            : row.trackType || '—';
    const map = new Map<string, CareerRow[]>();
    for (const row of rows) {
      const key = keyFor(row);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    /* series → career order; season → chronological; track type + conditions → fixed */
    const keys = [...map.keys()];
    if (groupBy === 'trackType') {
      keys.sort((a, b) => ['road', 'street', 'oval'].indexOf(a) - ['road', 'street', 'oval'].indexOf(b));
    } else if (groupBy === 'conditions') {
      const order = ['dry', 'wet or mixed', 'no report'];
      keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    } else if (groupBy === 'season') {
      keys.sort();
    } else {
      const firstIndex = (key: string) => rows.findIndex((row) => row.seriesShort === key);
      keys.sort((a, b) => firstIndex(a) - firstIndex(b));
    }
    return keys.map((key) => ({ key, rows: map.get(key)! }));
  }, [rows, groupBy]);

  const labelWidth = width < 560 ? 78 : 110;
  const rowHeight = 34;
  const axisHeight = 20;
  const height = axisHeight + groups.length * rowHeight + 4;
  const plotLeft = labelWidth + 8;
  const x = (percentile: number) => plotLeft + percentile * Math.max(width - plotLeft - 44, 60);

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Finishing percentile by group">
          {[0, 0.5, 1].map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={axisHeight - 4} y2={height - 2} stroke="var(--grid-hairline)" />
              <text
                x={x(tick)}
                y={axisHeight - 8}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {Math.round(tick * 100)}%
              </text>
            </g>
          ))}
          {groups.map((group, groupIndex) => {
            const rowY = axisHeight + groupIndex * rowHeight + rowHeight / 2;
            const sorted = [...group.rows].sort((a, b) => a.percentile - b.percentile);
            const median = sorted[Math.floor(sorted.length / 2)].percentile;
            return (
              <g key={group.key}>
                <text
                  x={labelWidth}
                  y={rowY}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ink-secondary)"
                  fontFamily={chartFont}
                  fontSize={12}
                  fontWeight={520}
                >
                  {group.key}
                </text>
                {group.rows.map((row, index) => {
                  /* Color = chapter identity, so it only paints when lanes ARE series. */
                  const tint = groupBy === 'series' ? chapterTint(row.seriesName) : 'var(--ink-primary)';
                  return (
                    <circle
                      key={row.sessionId + index}
                      cx={x(row.percentile)}
                      cy={rowY}
                      r={3.6}
                      fill={row.status === 'running' ? tint : 'var(--surface-1)'}
                      fillOpacity={row.status === 'running' ? (groupBy === 'series' ? 0.5 : 0.35) : 1}
                      stroke={row.status === 'running' ? 'none' : tint}
                      strokeWidth={1.2}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setTip({ x: x(row.percentile), y: rowY - 6, ...tipFor(row) })}
                      onMouseLeave={() => setTip(null)}
                      onClick={() => navigate(raceHref(row.sessionId))}
                    />
                  );
                })}
                <rect x={x(median) - 1.75} y={rowY - 10} width={3.5} height={20} rx={1.75} fill="var(--bryce)" />
                <text
                  x={width - 6}
                  y={rowY}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ink-muted)"
                  fontFamily={chartFont}
                  fontSize={10.5}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {group.rows.length}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

export const CareerExplorer = () => {
  const rows = useCareerRows();
  const [view, setView] = useState<'grouped' | 'conversion'>('grouped');
  const [groupBy, setGroupBy] = useState<GroupBy>('series');
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<string | null>(null);

  const seriesNames = useMemo(() => [...new Set(rows.map((row) => row.seriesName))], [rows]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) => (seriesFilter === null || row.seriesName === seriesFilter) && (trackFilter === null || row.trackType === trackFilter)
      ),
    [rows, seriesFilter, trackFilter]
  );
  const withStart = useMemo(() => filtered.filter((row) => row.start !== null), [filtered]);

  const gained = withStart.filter((row) => row.start !== null && row.finish < row.start).length;
  const wins = withStart.filter((row) => row.finish === 1).length;
  const withoutStart = filtered.length - withStart.length;
  const seriesWithoutStart = useMemo(
    () => [...new Set(filtered.filter((row) => row.start === null).map((row) => row.seriesShort))],
    [filtered]
  );
  const medianPct = useMemo(() => {
    if (filtered.length === 0) return null;
    const sorted = [...filtered].sort((a, b) => a.percentile - b.percentile);
    return Math.round(sorted[Math.floor(sorted.length / 2)].percentile * 100);
  }, [filtered]);

  if (rows.length === 0) {
    return (
      <Card title="The explorer">
        <Unavailable>Result conversion data unavailable.</Unavailable>
      </Card>
    );
  }

  return (
    <Card
      title="The explorer"
      action={
        <SourcePill
          title="Career explorer"
          entries={[
            {
              label: 'Career result conversion table',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: 'Official/source-backed results across all series. Start-position views exclude races without a sourced grid position; condition lanes come from official series reports plus labeled modeled observations.'
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <div className="stack" style={{ gap: 8, marginBottom: 6 }}>
        <ControlRow label="View">
          <Segmented
            options={[
              { value: 'grouped', label: 'Percentiles, grouped' },
              { value: 'conversion', label: 'Start → finish' }
            ]}
            value={view}
            onChange={setView}
          />
        </ControlRow>
        {view === 'grouped' ? (
          <ControlRow label="Group by">
            <FilterChip label="series" active={groupBy === 'series'} onClick={() => setGroupBy('series')} />
            <FilterChip label="season" active={groupBy === 'season'} onClick={() => setGroupBy('season')} />
            <FilterChip label="track type" active={groupBy === 'trackType'} onClick={() => setGroupBy('trackType')} />
            <FilterChip label="conditions" active={groupBy === 'conditions'} onClick={() => setGroupBy('conditions')} />
          </ControlRow>
        ) : null}
      </div>

      <div className="stack" style={{ gap: 8, marginBottom: 10, borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
        <ControlRow label="Series">
          <FilterChip label="All" active={seriesFilter === null} onClick={() => setSeriesFilter(null)} />
          {seriesNames.map((name) => (
            <FilterChip key={name} label={seriesShort(name)} active={seriesFilter === name} onClick={() => setSeriesFilter(seriesFilter === name ? null : name)} />
          ))}
        </ControlRow>
        <ControlRow label="Track">
          <FilterChip label="All" active={trackFilter === null} onClick={() => setTrackFilter(null)} />
          {(['road', 'street', 'oval'] as const).map((type) => (
            <FilterChip key={type} label={type} active={trackFilter === type} onClick={() => setTrackFilter(trackFilter === type ? null : type)} />
          ))}
        </ControlRow>
      </div>

      {view === 'conversion' ? (
        withStart.length === 0 ? (
          <Unavailable>
            {seriesWithoutStart.join(' and ')} time cards don’t carry a sourced grid position, so there’s no start → finish view
            here — the percentile view still holds every race.
          </Unavailable>
        ) : (
          <>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink-secondary)' }}>
              Dots above the line are races where he gained positions —{' '}
              <strong style={{ color: 'var(--ink-primary)' }}>
                {gained} of {withStart.length}
              </strong>{' '}
              in this view.
            </p>
            <ConversionPlot rows={withStart} />
            <p className="caption caption--secondary" style={{ margin: '6px 0 0' }}>
              {wins > 0 ? 'gold marks a win · ' : ''}○ a day that ended early · click any dot to open its race
              {withoutStart > 0
                ? ` · ${withoutStart} ${withoutStart === 1 ? 'race' : 'races'} without a sourced grid position (${seriesWithoutStart.join(', ')}) not drawn`
                : ''}
            </p>
          </>
        )
      ) : (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink-secondary)' }}>
            {filtered.length} races in this view
            {medianPct !== null ? (
              <>
                {' '}
                · typical day beat <strong style={{ color: 'var(--ink-primary)' }}>{medianPct}%</strong> of the field
              </>
            ) : null}
            . Gold ticks mark each group’s median.
          </p>
          <GroupedStrips rows={filtered} groupBy={groupBy} />
          <p className="caption caption--secondary" style={{ margin: '6px 0 0' }}>
            ○ a day that ended early · hover any dot · click any dot to open its race
            {groupBy === 'conditions' ? ' · condition lanes cover races with a sourced report' : ''}
          </p>
        </>
      )}
    </Card>
  );
};

/* ---------- the rivals: every shared INDY NXT grid, one record each ---------- */

interface RivalDot {
  name: string;
  share: number;
  races: number;
  ahead: number;
  behind: number;
  teammates: number;
  x: number;
  y: number;
  r: number;
}

/** Greedy beeswarm: place big dots first on the centerline, nudge collisions
 *  outward symmetrically. Pixel-space so labels stay crisp. */
const layoutBeeswarm = (
  dots: Array<Omit<RivalDot, 'y'>>,
  centerY: number,
  maxHeight: number
): RivalDot[] => {
  const placed: RivalDot[] = [];
  const sorted = [...dots].sort((a, b) => b.r - a.r);
  for (const dot of sorted) {
    let bestY = centerY;
    for (let step = 0; step < 40; step += 1) {
      const magnitude = Math.ceil(step / 2) * 4;
      const candidate = centerY + (step % 2 === 0 ? magnitude : -magnitude);
      if (Math.abs(candidate - centerY) > maxHeight / 2 - dot.r) continue;
      const collides = placed.some((other) => Math.hypot(other.x - dot.x, other.y - candidate) < other.r + dot.r + 1.5);
      if (!collides) {
        bestY = candidate;
        break;
      }
    }
    placed.push({ ...dot, y: bestY });
  }
  return placed;
};

/* Diverging record color: ink pole (rival leads) → neutral gray (even) →
 * gold pole (Bryce leads). Gold keeps its one meaning — Bryce's side. */
const lerpChannel = (from: number, to: number, t: number) => Math.round(from + (to - from) * t);
const lerpHex = (from: string, to: string, t: number): string => {
  const parse = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  return `rgb(${lerpChannel(r1, r2, t)}, ${lerpChannel(g1, g2, t)}, ${lerpChannel(b1, b2, t)})`;
};
const recordColor = (share: number): string =>
  share < 0.5 ? lerpHex('#3a3a3f', '#c6c6cb', share * 2) : lerpHex('#c6c6cb', '#e09a2f', (share - 0.5) * 2);

export const RivalsCard = () => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [swarmRef, swarmSeen] = useInViewOnce<HTMLDivElement>(0.3);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const rivals = uiDataPackage.screens.careerLab.headToHead ?? [];

  /* Five shared races is the honest floor — below that a record is a coin flip. */
  const charted = useMemo(
    () =>
      rivals.filter(
        (rival) => (rival.racesTogether ?? 0) >= 5 && rival.bryceAhead !== null && rival.bryceBehind !== null
      ),
    [rivals]
  );
  const smallSample = rivals.length - charted.length;

  const height = 210;
  const margin = { left: 14, right: 14, top: 26, bottom: 30 };
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const centerY = margin.top + (height - margin.top - margin.bottom) / 2;

  const dots = useMemo(() => {
    if (width === 0) return [];
    const raw = charted.map((rival) => {
      const races = rival.racesTogether ?? 0;
      const ahead = rival.bryceAhead ?? 0;
      const share = ahead / races;
      return {
        name: rival.driverName,
        share,
        races,
        ahead,
        behind: rival.bryceBehind ?? 0,
        teammates: rival.sameTeamRaces ?? 0,
        x: margin.left + share * plotWidth,
        /* Slightly super-root scale so shared history reads at a glance. */
        r: 3 + Math.pow(races, 0.72) * 0.95
      };
    });
    return layoutBeeswarm(raw, centerY, height - margin.top - margin.bottom);
  }, [charted, width, plotWidth, centerY]);

  /* Assembly order: a left-to-right sweep, so the chart builds along its axis. */
  const assemblyRank = useMemo(() => {
    const order = [...dots].sort((left, right) => left.x - right.x).map((dot) => dot.name);
    return new Map(order.map((name, index) => [name, index]));
  }, [dots]);

  const mostShared = charted[0] ?? null;
  const topRivals = charted.slice(0, 6);

  if (charted.length === 0) return null;

  const tipForRival = (dot: RivalDot): ChartTip => ({
    x: dot.x,
    y: dot.y - dot.r,
    title: dot.name,
    detail: [
      `Bryce ahead in ${dot.ahead} of ${dot.races} shared races`,
      dot.teammates >= 5 ? `teammates for ${dot.teammates} of them` : null
    ]
      .filter(Boolean)
      .join(' · '),
    action: null
  });

  return (
    <Card
      title="The rivals"
      action={
        <SourcePill
          title="The rivals"
          entries={[
            {
              label: 'INDY NXT head-to-head records',
              path: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv',
              note: 'Official classified finishes for every driver Bryce has shared an INDY NXT grid with, 2024–26. Counts races where both cars were classified; the chart holds rivals with five or more shared races.'
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--ink-secondary)' }}>
        {charted.length} drivers have shared an INDY NXT grid with Bryce five or more times.
        {mostShared ? (
          <>
            {' '}
            Nobody more than <strong style={{ color: 'var(--ink-primary)' }}>{mostShared.driverName}</strong> — Bryce ahead in{' '}
            <strong style={{ color: 'var(--ink-primary)' }}>
              {mostShared.bryceAhead} of {mostShared.racesTogether}
            </strong>
            .
          </>
        ) : null}
      </p>
      <div ref={swarmRef}>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label="Head-to-head record against every regular INDY NXT rival">
            <line x1={margin.left + plotWidth / 2} x2={margin.left + plotWidth / 2} y1={margin.top - 6} y2={height - margin.bottom + 2} stroke="var(--axis-baseline)" strokeDasharray="4 4" />
            <text x={margin.left + plotWidth / 2} y={margin.top - 12} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
              even
            </text>
            <text x={margin.left} y={height - 8} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
              rival usually ahead
            </text>
            <text x={width - margin.right} y={height - 8} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
              Bryce usually ahead
            </text>
            {dots.map((dot) => {
              const delay = (assemblyRank.get(dot.name) ?? 0) * 16;
              return (
                <circle
                  key={dot.name}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.r}
                  fill={recordColor(dot.share)}
                  fillOpacity={tip && tip.title === dot.name ? 1 : 0.82}
                  stroke={tip && tip.title === dot.name ? 'var(--ink-primary)' : 'none'}
                  strokeWidth={1.2}
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    transform: swarmSeen ? 'scale(1)' : 'scale(0.55)',
                    opacity: swarmSeen ? 1 : 0,
                    transition: `transform 460ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms, opacity 340ms ease ${delay}ms, fill-opacity 150ms ease`
                  }}
                  onMouseEnter={() => setTip(tipForRival(dot))}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      </div>
      <p className="caption caption--secondary" style={{ margin: '4px 0 0' }}>
        Bigger circle = more shared grids · deeper gold = Bryce leads the record, deeper ink = the rival does · hover for the
        record{smallSample > 0 ? ` · ${smallSample} more drivers shared fewer than five races` : ''}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 14, gap: 12 }}>
        {topRivals.map((rival) => {
          const ahead = rival.bryceAhead ?? 0;
          const behind = rival.bryceBehind ?? 0;
          const share = ahead + behind > 0 ? ahead / (ahead + behind) : 0.5;
          return (
            <div key={rival.driverName}>
              <div className="row row--between" style={{ fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ fontWeight: 570 }}>{rival.driverName}</span>
                <span className="tnum" style={{ color: 'var(--ink-secondary)', whiteSpace: 'nowrap' }}>
                  {ahead}–{behind}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${share * 100}%`, background: '#e09a2f' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${share * 100}%`, right: 0, background: '#6e6e73', opacity: 0.55 }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1.5, background: 'var(--surface-0)' }} />
              </div>
              <div className="caption caption--secondary" style={{ marginTop: 3 }}>
                {(rival.sameTeamRaces ?? 0) >= 5
                  ? `teammates for ${rival.sameTeamRaces} of ${rival.racesTogether}`
                  : `${rival.racesTogether} shared grids`}
              </div>
            </div>
          );
        })}
      </div>
      <p className="caption caption--secondary" style={{ margin: '8px 0 0' }}>
        Records read Bryce first — the gold stretch is his share of the record, the notch is even
      </p>
    </Card>
  );
};

/* ---------- rain days: the career, split by sourced track conditions ---------- */

const ConditionLane = ({
  label,
  laneRows,
  width,
  onTip
}: {
  label: string;
  laneRows: CareerRow[];
  width: number;
  onTip: (tip: ChartTip | null) => void;
}) => {
  const { navigate } = useRouter();
  const height = 44;
  const axisY = 26;
  const x = (percentile: number) => 8 + percentile * (width - 16);
  const sorted = [...laneRows].sort((a, b) => a.percentile - b.percentile);
  const median = sorted[Math.floor(sorted.length / 2)].percentile;
  return (
    <svg width={width} height={height} role="img" aria-label={`${label} finishing percentiles`}>
      <text x={8} y={11} fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11.5} fontWeight={550}>
        {label}
      </text>
      <text x={width - 8} y={11} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5} style={{ fontVariantNumeric: 'tabular-nums' }}>
        median {Math.round(median * 100)}%
      </text>
      <line x1={8} x2={width - 8} y1={axisY} y2={axisY} stroke="var(--grid-hairline)" strokeWidth={1.5} />
      {laneRows.map((row, index) => (
        <circle
          key={row.sessionId + index}
          cx={x(row.percentile)}
          cy={axisY}
          r={3.4}
          fill={row.status === 'running' ? 'var(--ink-primary)' : 'var(--surface-1)'}
          fillOpacity={row.status === 'running' ? 0.4 : 1}
          stroke={row.status === 'running' ? 'none' : 'var(--ink-muted)'}
          strokeWidth={1.2}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => onTip({ x: x(row.percentile), y: axisY - 6, ...tipFor(row) })}
          onMouseLeave={() => onTip(null)}
          onClick={() => navigate(raceHref(row.sessionId))}
        />
      ))}
      <rect x={x(median) - 1.75} y={axisY - 9} width={3.5} height={18} rx={1.75} fill="var(--bryce)" />
    </svg>
  );
};

export const RainDays = () => {
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [dryTip, setDryTip] = useState<ChartTip | null>(null);
  const [wetTip, setWetTip] = useState<ChartTip | null>(null);

  const reported = useMemo(() => rows.filter((row) => row.wetDry !== null), [rows]);
  const dry = useMemo(() => reported.filter((row) => row.wetDry === 'dry'), [reported]);
  const wet = useMemo(() => reported.filter((row) => row.wetDry !== 'dry'), [reported]);
  if (dry.length < 5 || wet.length < 5) return null;

  const medianOf = (laneRows: CareerRow[]) => {
    const sorted = [...laneRows].sort((a, b) => a.percentile - b.percentile);
    return Math.round(sorted[Math.floor(sorted.length / 2)].percentile * 100);
  };
  const dryMedian = medianOf(dry);
  const wetMedian = medianOf(wet);

  return (
    <Card
      className="card--flex"
      title="Rain days"
      action={
        <SourcePill
          title="Rain days"
          entries={[
            {
              label: 'Per-session condition reports',
              path: 'analysis/context-event-narrative-layer/output/weather_condition_context.csv',
              note: `Official series weather lines plus labeled modeled observations, joined by session. ${reported.length} of ${rows.length} career races carry a sourced report; the rest stay out of both lanes.`
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        {wetMedian > dryMedian ? (
          <>
            When the sky got involved, his typical day got <strong style={{ color: 'var(--ink-primary)' }}>better</strong>: on
            wet or mixed days he beat <strong style={{ color: 'var(--ink-primary)' }}>{wetMedian}%</strong> of the field,
            against {dryMedian}% on dry ones.
          </>
        ) : (
          <>
            His typical dry day beat <strong style={{ color: 'var(--ink-primary)' }}>{dryMedian}%</strong> of the field; wet or
            mixed days sit at <strong style={{ color: 'var(--ink-primary)' }}>{wetMedian}%</strong>.
          </>
        )}
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <div className="stack" style={{ gap: 2 }}>
            <div style={{ position: 'relative' }}>
              <ConditionLane label={`Dry · ${dry.length} races`} laneRows={dry} width={width} onTip={setDryTip} />
              {dryTip ? <ChartTipCard tip={dryTip} width={width} /> : null}
            </div>
            <div style={{ position: 'relative' }}>
              <ConditionLane label={`Wet, damp or drying · ${wet.length} races`} laneRows={wet} width={width} onTip={setWetTip} />
              {wetTip ? <ChartTipCard tip={wetTip} width={width} /> : null}
            </div>
          </div>
        ) : null}
      </div>
      <p className="caption caption--secondary" style={{ margin: 'auto 0 0', paddingTop: 10 }}>
        Gold ticks mark each lane’s median · ○ a day that ended early · click any dot to open its race
      </p>
    </Card>
  );
};

interface ImsaPack {
  car85Result?: Record<string, unknown>;
  bryceStintContext?: Array<Record<string, unknown>>;
  counts?: Record<string, number>;
}

export const useImsaPack = (): ImsaPack | null => {
  const [pack, setPack] = useState<ImsaPack | null>(null);
  useEffect(() => {
    const loader = packModules['../../analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json'];
    if (!loader) return;
    loader().then((module) => setPack((module as { default: ImsaPack }).default));
  }, []);
  return pack;
};

export const DaytonaSourcePill = () => (
  <SourcePill
    title="Rolex 24 at Daytona 2025"
    entries={[
      {
        label: 'Official IMSA / Al Kamel time cards',
        path: 'analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json',
        note: '37,885 official lap rows across the field; stint boundaries derived from pit in/out laps.'
      }
    ]}
  />
);

/** The one-race chapter told as the race it was: 24 hours at Daytona in a GTP
 *  prototype. Replaces the percentile strip — one dot on a strip says nothing. */
export const DaytonaChapterBody = () => {
  const pack = useImsaPack();
  if (!pack?.car85Result) return null;
  const result = pack.car85Result;
  const stints = pack.counts?.bryceStints ?? null;
  return (
    <>
      <div className="row" style={{ gap: 26, marginTop: 12, flexWrap: 'wrap' }}>
        <Stat label="GTP class finish" value={`P${asNumber(result.classFinishPosition) ?? '—'}`} />
        <Stat label="Laps completed" value={asNumber(result.lapsCompleted) ?? '—'} />
        <Stat label="Bryce stints" value={stints ?? '—'} />
      </div>
      <div className="row row--wrap" style={{ marginTop: 12, gap: 8 }}>
        <span className="chip chip--outline">
          car #85 · {String(result.vehicle ?? 'GTP car')} · {String(result.teamName ?? '')}
        </span>
        <span className="chip chip--outline tnum">best lap {String(result.bestLapTime ?? '—')}</span>
        <span className="chip chip--outline">{asNumber(result.pitStops) ?? '—'} pit stops</span>
      </div>
    </>
  );
};

/** Positive storytelling: the biggest single-race climbs of Bryce's career. */
export const BestClimbs = () => {
  const rows = useCareerRows();
  if (rows.length === 0) return null;
  const best = [...rows]
    .filter((row) => row.gain !== null && row.gain > 0)
    .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))
    .slice(0, 5);
  if (best.length === 0) return null;
  return (
    <Card className="card--flex" title="Biggest climbs" flush>
      <div className="tower">
        {best.map((row) => (
          <Link
            key={row.sessionId}
            to={raceHref(row.sessionId)}
            className="tower__row"
            style={{ gridTemplateColumns: '64px 1fr auto' }}
          >
            <span className="stat__delta stat__delta--up figure" style={{ fontSize: 17 }}>
              ▲ {row.gain}
            </span>
            <span className="tower__name" style={{ whiteSpace: 'normal' }}>
              {row.raceLabel}
              <span className="tower__team"> {row.seasonYear ?? ''}</span>
            </span>
            <span className="tower__gap">
              P{row.start} → P{row.finish}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
};

/** Career-wide bests, computed from the same 141 rows the charts draw. */
export const CareerBests = () => {
  const rows = useCareerRows();
  if (rows.length === 0) return null;
  const wins = rows.filter((row) => row.finish === 1).length;
  const podiums = rows.filter((row) => row.finish <= 3).length;
  const topTens = rows.filter((row) => row.finish <= 10).length;
  return (
    <div className="row row--wrap" style={{ gap: 26 }}>
      <Stat label="Career races" value={rows.length} />
      <Stat label="Wins" value={wins} />
      <Stat label="Podiums" value={podiums} />
      <Stat label="Top-10s" value={topTens} />
      <Stat label="Typical day" value={`${ordinal(Math.round([...rows].sort((a, b) => a.percentile - b.percentile)[Math.floor(rows.length / 2)].percentile * 100))} pctile`} />
    </div>
  );
};
