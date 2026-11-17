import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { SourcePill } from '../../app/components';
import { ChartTipCard, chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion, type ChartTip } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { stillPictureFor, useStillIndex } from '../../app/trackStill';
import { uiDataPackage } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { chapterTint, raceHref, tipFor, useCareerRows, type CareerRow } from '../careerExplorer';
import { DeepDive } from './frame';
import './explorer.css';

/* ============================================================================
 * The explorer (November 17, 2026). Every race in the result-conversion table
 * as one dot in its series colour, placed exactly at the share of the field he
 * finished ahead of. One control regroups the same dots (series, season, track,
 * weather) and they travel to their new rows; each row's typical day (median)
 * is marked and labelled in place. A group's name follows that group through
 * the other views. The old "Start → finish" plot is dropped: Qualifying to the
 * flag and Biggest climbs already tell grid against flag.
 *
 * Numbers: count = rows from useCareerRows(); median = the old explorer's
 * method exactly (sorted ascending, element floor(n / 2), rounded to a whole
 * percent), for the headline and for every row.
 *
 * Switch `ddexplorer`: default opens as one pile that splits into the series
 * rows on a clock; `one` opens on the single pile and leaves the split to him.
 * ==========================================================================*/

type Grouping = 'all' | 'series' | 'season' | 'track' | 'weather';

const GROUPINGS: Array<{ value: Grouping; label: string }> = [
  { value: 'all', label: 'All races' },
  { value: 'series', label: 'Series' },
  { value: 'season', label: 'Season' },
  { value: 'track', label: 'Track' },
  { value: 'weather', label: 'Weather' }
];

/* The old explorer's lane keys, unchanged (so its counts and medians carry over). */
const keyFor = (grouping: Grouping, row: CareerRow): string => {
  switch (grouping) {
    case 'all':
      return 'all';
    case 'series':
      return row.seriesShort;
    case 'season':
      return String(row.seasonYear ?? '—');
    case 'weather':
      return row.wetDry === null ? 'no report' : row.wetDry === 'dry' ? 'dry' : 'wet or mixed';
    case 'track':
    default:
      return row.trackType || '—';
  }
};

const TRACK_NAMES: Record<string, string> = { road: 'Road courses', street: 'Street circuits', oval: 'Ovals' };
const WEATHER_NAMES: Record<string, string> = { dry: 'Dry', 'wet or mixed': 'Wet or mixed', 'no report': 'No report' };

const displayName = (grouping: Grouping, key: string): string =>
  grouping === 'all' ? 'Every race' : grouping === 'track' ? TRACK_NAMES[key] ?? key : grouping === 'weather' ? WEATHER_NAMES[key] ?? key : key;

/** "45 GB3 races", "17 races in 2026", "12 races on ovals". */
const scopeWords = (grouping: Grouping, key: string, count: number): string => {
  const races = count === 1 ? 'race' : 'races';
  switch (grouping) {
    case 'series':
      return `${count} ${key} ${races}`;
    case 'season':
      return `${count} ${races} in ${key}`;
    case 'track':
      return key === 'road'
        ? `${count} ${races} on road courses`
        : key === 'street'
          ? `${count} ${races} on street circuits`
          : key === 'oval'
            ? `${count} ${races} on ovals`
            : `${count} ${races}`;
    case 'weather':
      return key === 'no report' ? `${count} ${races} with no weather report` : `${count} ${key} ${races}`;
    default:
      return `${count} ${races}`;
  }
};

const orderKeys = (grouping: Grouping, keys: string[], all: CareerRow[]): string[] => {
  const sorted = [...keys];
  if (grouping === 'track') {
    const order = ['road', 'street', 'oval'];
    sorted.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else if (grouping === 'weather') {
    const order = ['dry', 'wet or mixed', 'no report'];
    sorted.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else if (grouping === 'season') {
    sorted.sort();
  } else if (grouping === 'series') {
    const first = (key: string) => all.findIndex((row) => row.seriesShort === key);
    sorted.sort((a, b) => first(a) - first(b));
  }
  return sorted;
};

/** The old explorer's median: sorted ascending, element floor(n / 2). */
const medianShare = (rows: CareerRow[]): number | null => {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.percentile - b.percentile);
  return sorted[Math.floor(sorted.length / 2)].percentile;
};
const pct = (share: number) => Math.round(share * 100);

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/* ---------- layout: rows of beeswarms, x exact, y only to keep dots apart ---------- */

interface RowLayout {
  key: string;
  name: string;
  index: number;
  top: number;
  centerY: number;
  extent: number;
  bottom: number;
  rows: CareerRow[];
}

interface Layout {
  height: number;
  axisH: number;
  r: number;
  plotL: number;
  plotR: number;
  labelW: number;
  narrow: boolean;
  groups: RowLayout[];
  pos: Map<string, { x: number; y: number; row: number }>;
}

/** Classic beeswarm: dots left to right, each at the offset nearest the centre
 *  line that touches no dot already placed. */
const swarm = (xs: number[], r: number, gap: number): number[] => {
  const order = xs.map((x, index) => ({ x, index })).sort((a, b) => a.x - b.x);
  const placed: Array<{ x: number; y: number }> = [];
  const ys = new Array<number>(xs.length).fill(0);
  const d = 2 * r + gap;
  for (const { x, index } of order) {
    const near = placed.filter((other) => Math.abs(other.x - x) < d);
    const candidates = [0];
    for (const other of near) {
      const dy = Math.sqrt(d * d - (other.x - x) ** 2);
      candidates.push(other.y + dy, other.y - dy);
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    let chosen = 0;
    for (const y of candidates) {
      if (near.every((other) => Math.hypot(other.x - x, other.y - y) >= d - 0.01)) {
        chosen = y;
        break;
      }
    }
    placed.push({ x, y: chosen });
    ys[index] = chosen;
  }
  return ys;
};

const layoutFor = (width: number, grouping: Grouping, rows: CareerRow[]): Layout => {
  const narrow = width < 640;
  const r = clamp(width * 0.004, 4.3, 7);
  const gap = 1.4;
  const labelW = narrow ? 0 : width >= 900 ? 168 : 128;
  const plotL = labelW + r + (narrow ? 4 : 14);
  const plotR = width - r - (narrow ? 4 : 14);
  const x = (share: number) => plotL + share * (plotR - plotL);
  const axisH = narrow ? 40 : 52;
  const headPad = narrow ? 26 : 24;
  const footPad = narrow ? 12 : 16;
  const minRow = narrow ? 0 : 50;

  const buckets = new Map<string, CareerRow[]>();
  for (const row of rows) {
    const key = keyFor(grouping, row);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const keys = orderKeys(grouping, [...buckets.keys()], rows);
  const pos = new Map<string, { x: number; y: number; row: number }>();
  const groups: RowLayout[] = [];
  let cursor = axisH;
  keys.forEach((key, index) => {
    const members = buckets.get(key)!;
    const xs = members.map((row) => x(row.percentile));
    const ys = swarm(xs, r, gap);
    const extent = Math.max(...ys.map(Math.abs)) + r;
    const top = cursor;
    let centerY = top + headPad + extent;
    let bottom = centerY + extent + footPad;
    if (bottom - top < minRow) {
      const pad = (minRow - (bottom - top)) / 2;
      centerY += pad;
      bottom += pad * 2;
    }
    members.forEach((row, at) => pos.set(row.sessionId, { x: xs[at], y: centerY + ys[at], row: index }));
    groups.push({ key, name: displayName(grouping, key), index, top, centerY, extent, bottom, rows: members });
    cursor = bottom;
  });
  return { height: cursor + 2, axisH, r, plotL, plotR, labelW, narrow, groups, pos };
};

/* A stable small jitter per race, so the regroup ripples instead of marching. */
const jitter = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return Math.abs(hash) % 90;
};

/* ---------- the mouse card: the race, its numbers, its 3D still where one exists ---------- */

const MouseCard = ({ row, x, y, r, width }: { row: CareerRow; x: number; y: number; r: number; width: number }) => {
  const index = useStillIndex();
  const raceStill = index ? index.races[row.sessionId] : undefined;
  const still = raceStill ? stillPictureFor(index, raceStill.slug, row.sessionId) : null;
  const cardW = still ? 260 : 236;
  const cardH = still ? 250 : 104;
  const below = y - r - 12 < cardH;
  const notes = [
    row.status !== 'running' ? `ended early: ${row.status}` : null,
    row.wetDry && row.wetDry !== 'dry' ? `${row.wetDry} track` : null
  ].filter(Boolean);
  return (
    <div
      className={`ddx-card${below ? ' ddx-card--below' : ''}`}
      style={{
        left: clamp(x, cardW / 2 + 2, Math.max(width - cardW / 2 - 2, cardW / 2 + 2)),
        top: below ? y + r + 10 : y - r - 10,
        width: cardW
      }}
      aria-hidden
    >
      {still ? (
        <img className="ddx-card__still" src={still.src600} width={still.width} height={still.height} alt="" decoding="async" />
      ) : null}
      <div className="ddx-card__body">
        <span className="ddx-card__meta">
          <i style={{ background: chapterTint(row.seriesName) }} />
          {row.seriesShort} · {row.seasonYear ?? '—'}
        </span>
        <strong className="ddx-card__title">{row.raceLabel}</strong>
        <span className="ddx-card__nums">
          {row.start !== null ? `P${row.start} → P${row.finish}` : `finished P${row.finish}`} · beat <b>{pct(row.percentile)}%</b> of the
          field
        </span>
        {notes.length ? <span className="ddx-card__note">{notes.join(' · ')}</span> : null}
        <span className="ddx-card__action">Click to open the race</span>
      </div>
    </div>
  );
};

/* ---------- the chart ---------- */

interface Focus {
  grouping: Grouping;
  key: string;
}

const Swarm = ({
  rows,
  grouping,
  focus,
  onFocus,
  animate
}: {
  rows: CareerRow[];
  grouping: Grouping;
  focus: Focus | null;
  onFocus: (key: string) => void;
  animate: boolean;
}) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const coarse = useCoarsePointer();
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const layout = useMemo(() => (width > 0 ? layoutFor(width, grouping, rows) : null), [width, grouping, rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.sessionId, row])), [rows]);
  const inFocus = (row: CareerRow) => focus === null || keyFor(focus.grouping, row) === focus.key;
  const winCount = rows.filter((row) => row.finish === 1 && inFocus(row)).length;

  const clear = () => {
    setHovered(null);
    setTip(null);
  };
  const find = (event: MouseEvent<Element>): string | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || !layout) return null;
    const mx = event.clientX - bounds.left;
    const my = event.clientY - bounds.top;
    let best: { id: string; distance: number } | null = null;
    for (const [id, point] of layout.pos) {
      const distance = Math.hypot(point.x - mx, point.y - my);
      if (!best || distance < best.distance) best = { id, distance };
    }
    const reach = coarse || tap.armed !== null ? 22 : Math.max(layout.r * 2.4, 13);
    if (!best || best.distance > reach) {
      clear();
      return null;
    }
    const point = layout.pos.get(best.id)!;
    const row = byId.get(best.id)!;
    setHovered(best.id);
    setTip({ x: point.x, y: point.y - layout.r - 2, over: point.y - layout.r - 4, under: point.y + layout.r + 4, ...tipFor(row) });
    return best.id;
  };

  const rowsCount = layout?.groups.length ?? 1;
  const hoveredRow = hovered ? byId.get(hovered) ?? null : null;
  const hoveredPoint = hovered && layout ? layout.pos.get(hovered) ?? null : null;
  const xOf = (share: number) => (layout ? layout.plotL + share * (layout.plotR - layout.plotL) : 0);
  const mouseCard = !coarse && tap.armed === null && hoveredRow && hoveredPoint && layout ? { row: hoveredRow, point: hoveredPoint } : null;

  return (
    <div ref={ref} className={`ddx${animate ? '' : ' ddx--still'}`}>
      {layout ? (
        <svg
          ref={svgRef}
          className="ddx__svg"
          width={width}
          height={layout.height}
          style={{ height: layout.height }}
          role="img"
          aria-label={`${rows.length} races, each placed by the share of the field he finished ahead of${grouping === 'all' ? '' : `, grouped by ${grouping}`}`}
          {...tap.surface({ find, clear, open: (id) => () => navigate(raceHref(String(id))) })}
          data-hovering={hovered ? '' : undefined}
          data-following={focus ? '' : undefined}
        >
          {/* axis: words at the ends, percentages between */}
          <g className="ddx__axis" fontFamily={chartFont}>
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <line
                key={tick}
                x1={xOf(tick)}
                x2={xOf(tick)}
                y1={layout.axisH - 8}
                y2={layout.height - 2}
                stroke={tick === 0.5 ? 'var(--axis-baseline)' : 'var(--grid-hairline)'}
              />
            ))}
            {[0.25, 0.5, 0.75].map((tick) =>
              layout.narrow && tick !== 0.5 ? null : (
                <text key={tick} x={xOf(tick)} y={layout.axisH - 15} textAnchor="middle" className="ddx__tick">
                  {pct(tick)}%
                </text>
              )
            )}
            <text x={xOf(0) - layout.r} y={layout.axisH - 15} textAnchor="start" className="ddx__tick">
              0% <tspan className="ddx__end">beat nobody</tspan>
            </text>
            <text x={xOf(1) + layout.r} y={layout.axisH - 15} textAnchor="end" className="ddx__tick">
              <tspan className="ddx__end">beat everyone</tspan> 100%
            </text>
            {layout.narrow ? null : (
              <text x={xOf(0.5)} y={layout.axisH - 34} textAnchor="middle" className="ddx__axis-title">
                share of the field he finished ahead of
              </text>
            )}
          </g>

          {/* rows: name, count, typical day */}
          {layout.groups.map((group) => {
            const followed = focus !== null ? group.rows.filter(inFocus) : group.rows;
            const median = followed.length >= 2 ? medianShare(followed) : null;
            const isFocused = focus !== null && focus.grouping === grouping && focus.key === group.key;
            const dimmed = focus !== null && followed.length === 0;
            const countWords =
              focus !== null && focus.grouping !== grouping
                ? `${followed.length} of ${group.rows.length}`
                : `${group.rows.length} ${group.rows.length === 1 ? 'race' : 'races'}`;
            const canFocus = grouping !== 'all';
            const toggle = () => {
              if (canFocus) onFocus(group.key);
            };
            const onKey = (event: KeyboardEvent<SVGGElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
              }
            };
            const mx = median !== null ? xOf(median) : 0;
            const swarmTop = group.centerY - group.extent;
            const medianWords = median === null ? null : group.index === 0 ? `typical day: beat ${pct(median)}%` : `${pct(median)}%`;
            return (
              <g key={`${grouping}:${group.key}`} className={`ddx__row${dimmed ? ' ddx__row--dim' : ''}`}>
                {median !== null ? (
                  <g className="ddx__median" style={{ animationDelay: animate ? '0.8s' : '0s' }}>
                    <line x1={mx} x2={mx} y1={swarmTop - 5} y2={group.centerY + group.extent + 4} />
                    {layout.narrow ? null : (
                      <text x={mx} y={swarmTop - 9} textAnchor={mx > layout.plotR - 80 ? 'end' : 'middle'}>
                        {medianWords}
                      </text>
                    )}
                  </g>
                ) : null}
                <g
                  className={`ddx__label${canFocus ? ' ddx__label--button' : ''}${isFocused ? ' ddx__label--on' : ''}`}
                  role={canFocus ? 'button' : undefined}
                  tabIndex={canFocus ? 0 : undefined}
                  aria-pressed={canFocus ? isFocused : undefined}
                  aria-label={canFocus ? `${isFocused ? 'Stop following' : 'Follow'} ${group.name}` : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle();
                  }}
                  onPointerUp={(event) => event.stopPropagation()}
                  onMouseMove={(event) => {
                    event.stopPropagation();
                    if (!coarse) clear();
                  }}
                  onKeyDown={onKey}
                  style={{ animationDelay: animate ? '0.35s' : '0s' }}
                >
                  {layout.narrow ? (
                    <>
                      <rect x={0} y={group.top + 2} width={Math.min(layout.plotR, 260)} height={22} fill="transparent" />
                      <text x={layout.plotL - layout.r} y={group.top + 17} className="ddx__name">
                        {group.name}
                        <tspan className="ddx__count" dx={7}>
                          {countWords}
                          {median !== null ? ` · typical ${pct(median)}%` : ''}
                        </tspan>
                      </text>
                      {isFocused ? <rect x={layout.plotL - layout.r} y={group.top + 21} width={18} height={2} rx={1} className="ddx__on-bar" /> : null}
                    </>
                  ) : (
                    <>
                      <rect x={0} y={group.centerY - 20} width={layout.labelW} height={40} fill="transparent" />
                      <text x={layout.labelW} y={group.centerY - 2} textAnchor="end" className="ddx__name">
                        {group.name}
                      </text>
                      <text x={layout.labelW} y={group.centerY + 15} textAnchor="end" className="ddx__count">
                        {countWords}
                      </text>
                      {isFocused ? <rect x={layout.labelW + 6} y={group.centerY - 12} width={2} height={24} rx={1} className="ddx__on-bar" /> : null}
                    </>
                  )}
                </g>
              </g>
            );
          })}

          {/* the dots: one per race, keyed by race, so a regroup moves them */}
          <g className="ddx__dots">
            {rows.map((row) => {
              const point = layout.pos.get(row.sessionId);
              if (!point) return null;
              const tint = chapterTint(row.seriesName);
              const win = row.finish === 1;
              const early = row.status !== 'running';
              const lit = inFocus(row);
              const isHovered = hovered === row.sessionId;
              const delay = animate ? (point.row / Math.max(rowsCount - 1, 1)) * 240 + jitter(row.sessionId) : 0;
              return (
                <circle
                  key={row.sessionId}
                  className={`ddx__dot${lit ? '' : ' ddx__dot--out'}${isHovered ? ' ddx__dot--hover' : ''}`}
                  cx={0}
                  cy={0}
                  r={isHovered ? layout.r + 2 : layout.r}
                  style={{ transform: `translate(${point.x}px, ${point.y}px)`, transitionDelay: `${delay}ms, 0ms, 0ms` }}
                  fill={win ? 'var(--bryce)' : early ? 'var(--paper)' : tint}
                  fillOpacity={win || early ? 1 : 0.8}
                  stroke={win || isHovered ? 'var(--ink)' : early ? tint : 'none'}
                  strokeWidth={win ? 1 : 1.5}
                />
              );
            })}
          </g>
          {winCount > 0 && !layout.narrow ? (
            <text x={xOf(1) + layout.r} y={layout.axisH - 34} textAnchor="end" className="ddx__wins" fontFamily={chartFont}>
              {winCount} {winCount === 1 ? 'win' : 'wins'} <tspan className="ddx__win-arrow">↓</tspan>
            </text>
          ) : null}
        </svg>
      ) : null}
      {mouseCard ? <MouseCard row={mouseCard.row} x={mouseCard.point.x} y={mouseCard.point.y} r={layout!.r} width={width} /> : null}
      {tip && !mouseCard ? <ChartTipCard tip={tip} width={width} tap={tap} /> : null}
    </div>
  );
};

/* ---------- the section ---------- */

export const ExplorerDeepDive = () => {
  const rows = useCareerRows();
  const coarse = useCoarsePointer();
  const reduced = useReducedMotion();
  const [opening] = useState<Grouping>(() => (switchValue('ddexplorer') === 'one' ? 'all' : 'series'));
  const [grouping, setGrouping] = useState<Grouping>(opening);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.2);
  const [split, setSplit] = useState(false);

  /* The opening move, once, on a clock: the whole career as one pile, then it
   * splits into its series. Reduced motion lands on the split directly. */
  useEffect(() => {
    if (!inView || split) return undefined;
    const timer = window.setTimeout(() => setSplit(true), reduced ? 0 : 450);
    return () => window.clearTimeout(timer);
  }, [inView, split, reduced]);
  const shown: Grouping = split || reduced ? grouping : 'all';

  const followed = useMemo(() => (focus ? rows.filter((row) => keyFor(focus.grouping, row) === focus.key) : rows), [rows, focus]);
  const median = medianShare(followed);
  const noReport = rows.filter((row) => row.wetDry === null).length;
  const firstYear = rows.reduce<number | null>(
    (low, row) => (row.seasonYear !== null && (low === null || row.seasonYear < low) ? row.seasonYear : low),
    null
  );

  if (rows.length === 0) {
    return (
      <DeepDive lede="The result-conversion table could not be read, so there are no races to place.">
        <span />
      </DeepDive>
    );
  }

  const choose = (next: Grouping) => {
    setSplit(true);
    setGrouping(next);
  };
  const follow = (key: string) =>
    setFocus((current) => (current && current.grouping === shown && current.key === key ? null : { grouping: shown, key }));

  return (
    <div ref={viewRef}>
      <DeepDive
        className="dd--explorer"
        figure={median !== null ? `${pct(median)}%` : '—'}
        unit="of the field beaten on a typical day"
        lede={
          <>
            <strong>{focus ? scopeWords(focus.grouping, focus.key, followed.length) : `${rows.length} races`}</strong>
            {focus ? ` of ${rows.length}` : firstYear !== null ? ` since ${firstYear}` : ''}, one dot each, placed by the share of the field he
            finished ahead of.
          </>
        }
        sources={
          <SourcePill
            title="The explorer"
            entries={[
              {
                label: 'Career result conversion table',
                path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
                note: `${rows.length} races with an official or source-backed finishing position. Each dot sits at his finish percentile: the share of the rest of the field he finished ahead of (a win is 100%). Within a row a dot moves up or down only to clear its neighbours; across is exact. "Typical day" is the median race, taken as the old explorer took it: races sorted by that share, the one at position floor(n / 2), so with an even count it is the upper of the two middle races; a group of one race has no median mark. Gold is a win (P1); a hollow dot is a day that ended early (contact or mechanical).`
              },
              {
                label: 'Weather rows',
                note: `Wet, damp and drying share one row, "wet or mixed". Conditions come from official series reports plus labelled modeled observations; the ${noReport} races with no sourced report sit in their own row rather than being guessed.`
              },
              {
                label: 'Start → finish',
                note: 'The old explorer also plotted grid position against finish. That view now lives in Qualifying to the flag and Biggest climbs.'
              }
            ]}
            caveats={uiDataPackage.screens.careerLab.caveats}
          />
        }
        controls={
          <>
            <div className="segmented ddx-seg" role="tablist" aria-label="Group the races by">
              {GROUPINGS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={option.value === grouping}
                  className={`segmented__option${option.value === grouping ? ' segmented__option--active' : ''}`}
                  onClick={() => choose(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {focus ? (
              <button
                type="button"
                className="ddx-follow"
                onClick={() => setFocus(null)}
                aria-label={`Stop following ${displayName(focus.grouping, focus.key)}`}
              >
                Following <b>{displayName(focus.grouping, focus.key)}</b>
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </>
        }
        foot={
          <>
            <span className="ddx-key ddx-key--win" aria-hidden /> a win <span className="ddx-key ddx-key--early" aria-hidden /> a day
            that ended early ·{' '}
            {coarse
              ? 'tap a dot to read its race, a name to follow it'
              : 'hover a dot to read its race, click to open it · click a name to follow it'}
          </>
        }
      >
        <Swarm rows={rows} grouping={shown} focus={focus} onFocus={follow} animate={!reduced} />
      </DeepDive>
    </div>
  );
};
