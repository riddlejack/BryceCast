import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, SourcePill, Stat, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { asNumber, asString, formatGain, ordinal } from '../app/format';
import { Link, useRouter } from '../app/router';
import { uiDataPackage } from '../data/uiDataPackage';
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
}

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
          date
        };
      })
      .filter((row): row is CareerRow => row !== null)
      .sort((left, right) => left.date.localeCompare(right.date));
  }, []);
};

const tipFor = (row: CareerRow): Omit<ChartTip, 'x' | 'y'> => ({
  title: row.raceLabel,
  detail: [
    row.seriesShort,
    row.start !== null ? `P${row.start} → P${row.finish}` : `finished P${row.finish}`,
    row.status !== 'running' ? row.status : null,
    `beat ${Math.round(row.percentile * 100)}% of the field`
  ]
    .filter(Boolean)
    .join(' · '),
  action: row.sessionId.includes('indy_nxt') ? 'open the race page' : null
});

/* ---------- the climb: every race, one line, seven years ---------- */

export const TheClimb = () => {
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
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
              note: `${n} source-backed races with a finishing percentile — the share of the field beaten, which stays honest as field sizes change between series. The form line is an eleven-race trimmed mean (middle 60% of the window).`
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <p className="caption caption--secondary" style={{ margin: '0 0 8px' }}>
        Every race a dot · higher = more of the field beaten · the line follows his running form · ○ a day that ended early ·
        click an INDY NXT dot
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label="Finishing percentile across every career race"
            onMouseMove={onMove}
            onMouseLeave={clearHover}
            onClick={() => {
              if (hovered !== null && rows[hovered].sessionId.includes('indy_nxt')) {
                navigate(`/races/${encodeURIComponent(rows[hovered].sessionId)}`);
              }
            }}
            style={{ cursor: hovered !== null && rows[hovered].sessionId.includes('indy_nxt') ? 'pointer' : 'default' }}
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
              return (
                <circle
                  key={row.sessionId + index}
                  cx={x(index)}
                  cy={y(row.percentile)}
                  r={hovered === index ? 5 : 3}
                  fill={clean ? 'var(--ink-primary)' : 'var(--surface-1)'}
                  fillOpacity={clean ? (hovered === index ? 1 : 0.38) : 1}
                  stroke={clean ? (hovered === index ? 'var(--ink-primary)' : 'none') : 'var(--ink-muted)'}
                  strokeWidth={1.3}
                  style={{ transition: 'r 120ms ease' }}
                />
              );
            })}
            <path d={trendPath} fill="none" stroke="var(--ink-primary)" strokeWidth={2.2} strokeLinejoin="round" />

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
    </Card>
  );
};

/* ---------- chapter strip: one era's races on the percentile scale ---------- */

export const ChapterStrip = ({ seriesName }: { seriesName: string }) => {
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
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
              fill={row.status === 'running' ? 'var(--ink-primary)' : 'var(--surface-1)'}
              fillOpacity={row.status === 'running' ? 0.4 : 1}
              stroke={row.status === 'running' ? 'none' : 'var(--ink-muted)'}
              strokeWidth={1.2}
              onMouseEnter={() => setTip({ x: x(row.percentile), y: axisY - 6, ...tipFor(row) })}
              onMouseLeave={() => setTip(null)}
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

const trackTypeColor: Record<string, string> = {
  road: 'var(--series-1)',
  oval: 'var(--series-2)',
  street: 'var(--series-3)'
};

const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
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

const ExplorerTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: CareerRow }> }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const gain = row.gain !== null ? formatGain(row.gain) : null;
  return (
    <div style={{ background: 'var(--surface-0)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, maxWidth: 240, boxShadow: '0 6px 20px rgba(0,0,0,0.10)' }}>
      <div style={{ fontWeight: 600 }}>{row.raceLabel}</div>
      <div style={{ color: 'var(--ink-secondary)' }}>
        P{row.start} → P{row.finish}
        {gain ? ` · ${gain.text}` : ''}
      </div>
      <div style={{ color: 'var(--ink-muted)', fontSize: 11.5 }}>{row.trackName}</div>
    </div>
  );
};

type GroupBy = 'series' | 'season' | 'trackType';

const GroupedStrips = ({ rows, groupBy }: { rows: CareerRow[]; groupBy: GroupBy }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [tip, setTip] = useState<ChartTip | null>(null);

  const groups = useMemo(() => {
    const keyFor = (row: CareerRow) =>
      groupBy === 'series' ? row.seriesShort : groupBy === 'season' ? String(row.seasonYear ?? '—') : row.trackType || '—';
    const map = new Map<string, CareerRow[]>();
    for (const row of rows) {
      const key = keyFor(row);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    /* series → career order; season → chronological; track type → fixed */
    const keys = [...map.keys()];
    if (groupBy === 'trackType') {
      keys.sort((a, b) => ['road', 'street', 'oval'].indexOf(a) - ['road', 'street', 'oval'].indexOf(b));
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
                {group.rows.map((row, index) => (
                  <circle
                    key={row.sessionId + index}
                    cx={x(row.percentile)}
                    cy={rowY}
                    r={3.6}
                    fill={row.status === 'running' ? 'var(--ink-primary)' : 'var(--surface-1)'}
                    fillOpacity={row.status === 'running' ? 0.35 : 1}
                    stroke={row.status === 'running' ? 'none' : 'var(--ink-muted)'}
                    strokeWidth={1.2}
                    style={{ cursor: row.sessionId.includes('indy_nxt') ? 'pointer' : 'default' }}
                    onMouseEnter={() => setTip({ x: x(row.percentile), y: rowY - 6, ...tipFor(row) })}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => {
                      if (row.sessionId.includes('indy_nxt')) navigate(`/races/${encodeURIComponent(row.sessionId)}`);
                    }}
                  />
                ))}
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
  const { navigate } = useRouter();
  const [view, setView] = useState<'conversion' | 'grouped'>('conversion');
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

  const maxPosition = useMemo(() => Math.max(24, ...withStart.map((row) => Math.max(row.start ?? 1, row.finish))), [withStart]);
  const gained = withStart.filter((row) => row.start !== null && row.finish < row.start).length;
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
              note: 'Official/source-backed results across all series. Start-position views exclude races without a sourced grid position.'
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <div className="row row--wrap" style={{ gap: 6, marginBottom: 10 }}>
        <FilterChip label="Start → finish" active={view === 'conversion'} onClick={() => setView('conversion')} />
        <FilterChip label="Percentiles, grouped" active={view === 'grouped'} onClick={() => setView('grouped')} />
        {view === 'grouped' ? (
          <span className="row" style={{ gap: 6, marginLeft: 12 }}>
            <span className="caption caption--secondary">group by</span>
            <FilterChip label="series" active={groupBy === 'series'} onClick={() => setGroupBy('series')} />
            <FilterChip label="season" active={groupBy === 'season'} onClick={() => setGroupBy('season')} />
            <FilterChip label="track type" active={groupBy === 'trackType'} onClick={() => setGroupBy('trackType')} />
          </span>
        ) : null}
      </div>

      <div className="row row--wrap" style={{ gap: 6, marginBottom: 6 }}>
        <FilterChip label="All series" active={seriesFilter === null} onClick={() => setSeriesFilter(null)} />
        {seriesNames.map((name) => (
          <FilterChip key={name} label={seriesShort(name)} active={seriesFilter === name} onClick={() => setSeriesFilter(seriesFilter === name ? null : name)} />
        ))}
      </div>
      <div className="row row--wrap" style={{ gap: 6, marginBottom: 8 }}>
        <FilterChip label="All tracks" active={trackFilter === null} onClick={() => setTrackFilter(null)} />
        {(['road', 'street', 'oval'] as const).map((type) => (
          <FilterChip key={type} label={type} active={trackFilter === type} onClick={() => setTrackFilter(trackFilter === type ? null : type)} />
        ))}
      </div>

      {view === 'conversion' ? (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink-secondary)' }}>
            Dots above the line are races where he gained positions —{' '}
            <strong style={{ color: 'var(--ink-primary)' }}>
              {gained} of {withStart.length}
            </strong>{' '}
            in this view.
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 14, right: 14, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="var(--grid-hairline)" />
              <XAxis
                type="number"
                dataKey="start"
                name="Start"
                domain={[1, maxPosition + 1]}
                tickCount={6}
                stroke="var(--ink-muted)"
                fontSize={11}
                label={{ value: 'started', position: 'insideBottomRight', offset: -2, fill: 'var(--ink-muted)', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="finish"
                name="Finish"
                domain={[1, maxPosition + 1]}
                reversed
                tickCount={6}
                stroke="var(--ink-muted)"
                fontSize={11}
                label={{ value: 'finished', angle: -90, position: 'insideLeft', offset: 26, fill: 'var(--ink-muted)', fontSize: 11 }}
              />
              <ReferenceLine
                segment={[
                  { x: 1, y: 1 },
                  { x: maxPosition + 1, y: maxPosition + 1 }
                ]}
                stroke="var(--axis-baseline)"
                strokeDasharray="4 4"
              />
              <Tooltip content={<ExplorerTooltip />} cursor={{ stroke: 'var(--axis-baseline)' }} />
              {(['road', 'street', 'oval'] as const).map((type) => (
                <Scatter
                  key={type}
                  name={type}
                  data={withStart.filter((row) => row.trackType === type)}
                  fill={trackTypeColor[type]}
                  stroke="var(--surface-1)"
                  strokeWidth={1.5}
                  r={5.5}
                  onClick={(point) => {
                    const sessionId = (point as { payload?: CareerRow }).payload?.sessionId ?? (point as unknown as CareerRow).sessionId;
                    if (sessionId?.includes('indy_nxt')) navigate(`/races/${encodeURIComponent(sessionId)}`);
                  }}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <div className="row row--wrap" style={{ gap: 12, marginTop: 4 }}>
            {(['road', 'street', 'oval'] as const).map((type) => (
              <span key={type} className="row" style={{ gap: 5, fontSize: 12, color: 'var(--ink-secondary)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: trackTypeColor[type] }} aria-hidden />
                {type}
              </span>
            ))}
            <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginLeft: 'auto' }}>above the line = positions gained · INDY NXT dots open race pages</span>
          </div>
        </>
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
            ○ a day that ended early · hover any dot · INDY NXT dots open race pages
          </p>
        </>
      )}
    </Card>
  );
};

interface ImsaPack {
  car85Result?: Record<string, unknown>;
  bryceStintContext?: Array<Record<string, unknown>>;
  counts?: Record<string, number>;
}

/** Feature story: the 2025 Rolex 24 at Daytona GTP drive. */
export const DaytonaStory = () => {
  const [pack, setPack] = useState<ImsaPack | null>(null);
  useEffect(() => {
    const loader = packModules['../../analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json'];
    if (!loader) return;
    loader().then((module) => setPack((module as { default: ImsaPack }).default));
  }, []);
  if (!pack?.car85Result) return null;
  const result = pack.car85Result;
  const stints = pack.counts?.bryceStints ?? null;
  return (
    <Card
      className="card--flex"
      title="The Daytona 24"
      action={
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
      }
    >
      <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        January 2025: 24 hours in a {String(result.vehicle ?? 'GTP car')} for {String(result.teamName ?? '')} — sports car
        racing's top class, shared with three co-drivers through the night.
      </p>
      <div className="grid grid--3">
        <Stat label="GTP class finish" value={`P${asNumber(result.classFinishPosition) ?? '—'}`} />
        <Stat label="Laps completed" value={asNumber(result.lapsCompleted) ?? '—'} />
        <Stat label="Bryce stints" value={stints ?? '—'} />
      </div>
      <div className="row row--wrap" style={{ marginTop: 'auto', paddingTop: 12, gap: 8 }}>
        <span className="chip chip--outline">car #85 · {String(result.class ?? 'GTP')}</span>
        <span className="chip chip--outline tnum">best lap {String(result.bestLapTime ?? '—')}</span>
        <span className="chip chip--outline">{asNumber(result.pitStops) ?? '—'} pit stops</span>
      </div>
    </Card>
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
            to={row.sessionId.includes('indy_nxt') ? `/races/${encodeURIComponent(row.sessionId)}` : '/career'}
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
