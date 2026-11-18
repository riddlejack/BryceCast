import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { SourcePill } from '../../app/components';
import { chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { VenueTipCard, type VenueTip } from '../../app/venueCard';
import { useVenuePreload } from '../../app/venuePeek';
import { uiDataPackage } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { chapterTint, raceHref, useCareerRows, type CareerRow } from '../careerExplorer';
import { DeepDive } from './frame';
import { raceTipOf, venuesOf } from './raceTip';
import { deepRaceTitle } from './raceTitle';
import { ExplorerDeepDiveOld } from './explorerOld';
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
 *
 * Round 3 (November 18, 2026). Jack: "I like the animation of the graph … I
 * don't really like the colors or the visual. I think the spacing is also a
 * little bit weird … the dots are just very basic." The motion is kept as it
 * was. The dots now sit on an even lattice (columns one dot wide, stacked
 * from the row's centre line), every row in a view has the same height, and
 * the header says which way is better. Switch `ddxdots`:
 *   (default) ink — proxy review 3, after Jack's "I don't really like the
 *             colors": the site's own flat dot in soft ink at rest; a series
 *             takes its hue only when one of its dots or its name is pointed
 *             at, or it is followed (as Life in weeks does). Wins gold with an
 *             amber ring, as on Biggest climbs; a hollow dot ended early.
 *   beads   — each dot a small bead in its series colour, lit from
 *             the top left, with a paper rim and a soft shadow;
 *   flat      — the same lattice with flat, quieter dots;
 *   old       — round 2's version.
 * A column is one dot wide, so a dot sits within half a dot of its exact
 * share (under 0.6% at 1440 px); the card always gives the exact finish.
 * ==========================================================================*/

type DotStyle = 'ink' | 'beads' | 'flat';

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

const layoutFor = (width: number, grouping: Grouping, rows: CareerRow[]): Layout => {
  const narrow = width < 640;
  const r = narrow ? 4.4 : clamp(width * 0.0042, 5, 7.4);
  const gap = narrow ? 1.6 : 2.2;
  const pitch = 2 * r + gap;
  const labelW = narrow ? 0 : width >= 900 ? 168 : 128;
  const plotL = labelW + r + (narrow ? 4 : 22);
  const plotR = width - r - (narrow ? 4 : 14);
  const x = (share: number) => plotL + share * (plotR - plotL);
  const axisH = narrow ? 52 : 64;
  const headPad = narrow ? 30 : 24;
  const footPad = narrow ? 10 : 14;

  /* Columns one dot wide across the plot; a race goes to the column nearest its exact share. */
  const columns = Math.max(1, Math.floor((plotR - plotL) / pitch));
  const colX = (share: number) => {
    const index = Math.round(share * columns);
    return { index, x: plotL + (index / columns) * (plotR - plotL) };
  };

  const buckets = new Map<string, CareerRow[]>();
  for (const row of rows) {
    const key = keyFor(grouping, row);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const keys = orderKeys(grouping, [...buckets.keys()], rows);

  /* Stack each column from the centre line out: 0, above, below, two above … */
  const stacks = keys.map((key) => {
    const members = [...buckets.get(key)!].sort((a, b) => a.percentile - b.percentile || a.date.localeCompare(b.date));
    const byCol = new Map<number, CareerRow[]>();
    members.forEach((row) => {
      const { index } = colX(row.percentile);
      byCol.set(index, [...(byCol.get(index) ?? []), row]);
    });
    const tallest = Math.max(...[...byCol.values()].map((list) => list.length));
    return { key, members, byCol, tallest };
  });
  /* Columns stack 0, above, below, two above …: a column of n reaches floor(n / 2) above
   * and floor((n − 1) / 2) below. Every row gets at least one step each way, so short
   * rows keep the same rhythm as tall ones without the empty bands a shared height leaves. */
  const reachOf = (count: number) => ({
    up: Math.max(Math.floor(count / 2), 1) * pitch + r,
    down: Math.max(Math.floor((count - 1) / 2), 1) * pitch + r
  });

  const pos = new Map<string, { x: number; y: number; row: number }>();
  const groups: RowLayout[] = [];
  let cursor = axisH;
  stacks.forEach(({ key, members, byCol, tallest }, index) => {
    const top = cursor;
    const { up, down } = reachOf(tallest);
    const extent = Math.max(up, down);
    const rowH = headPad + up + down + footPad;
    const centerY = top + headPad + up;
    byCol.forEach((list, col) => {
      const cx = plotL + (col / columns) * (plotR - plotL);
      list.forEach((row, at) => {
        const step = Math.ceil(at / 2) * (at % 2 === 1 ? -1 : 1);
        pos.set(row.sessionId, { x: cx, y: centerY + step * pitch, row: index });
      });
    });
    const bottom = top + rowH;
    groups.push({ key, name: displayName(grouping, key), index, top, centerY, extent, bottom, rows: members });
    cursor = bottom;
  });
  void x;
  return { height: cursor + 2, axisH, r, plotL, plotR, labelW, narrow, groups, pos };
};

/* A stable small jitter per race, so the regroup ripples instead of marching. */
const jitter = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return Math.abs(hash) % 90;
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
  animate,
  dots
}: {
  rows: CareerRow[];
  grouping: Grouping;
  focus: Focus | null;
  onFocus: (key: string) => void;
  animate: boolean;
  dots: DotStyle;
}) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const coarse = useCoarsePointer();
  const [hovered, setHovered] = useState<string | null>(null);
  /* ink: the series whose name is under the pointer (Series view). */
  const [labelSeries, setLabelSeries] = useState<string | null>(null);
  const [tip, setTip] = useState<VenueTip | null>(null);
  const preload = useVenuePreload(() => venuesOf(rows));

  const layout = useMemo(() => (width > 0 ? layoutFor(width, grouping, rows) : null), [width, grouping, rows]);
  const seriesIds = useMemo(() => [...new Set(rows.map((row) => row.seriesId))], [rows]);
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
    const words = raceTipOf(row);
    setTip({ x: point.x, y: point.y - layout.r - 2, over: point.y - layout.r - 4, under: point.y + layout.r + 4, ...words, title: deepRaceTitle(row.sessionId, words.title) });
    return best.id;
  };

  /* ink: the one series shown in its hue, if any. A pointed-at dot wins, then a pointed-at name, then the followed series. */
  const litSeries: string | null =
    dots !== 'ink'
      ? null
      : hovered !== null
        ? byId.get(hovered)?.seriesId ?? null
        : labelSeries ?? (focus?.grouping === 'series' ? rows.find((row) => row.seriesShort === focus.key)?.seriesId ?? null : null);
  const SOFT_INK = 'color-mix(in srgb, var(--ink) 55%, var(--paper))';
  const FAINT_INK = 'color-mix(in srgb, var(--ink) 24%, var(--paper))';

  const rowsCount = layout?.groups.length ?? 1;
  const xOf = (share: number) => (layout ? layout.plotL + share * (layout.plotR - layout.plotL) : 0);

  return (
    <div ref={ref} className={`ddx ddx--${dots}${animate ? '' : ' ddx--still'}`} onPointerEnter={preload}>
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
          <defs>
            {/* one bead per series: lit from the top left, its own colour at the middle, a shade at the rim */}
            {seriesIds.map((id) => (
              <radialGradient key={id} id={`ddx-bead-${id}`} cx="0.36" cy="0.3" r="0.78">
                <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${chapterTint(id)} 38%, #fff)` }} />
                <stop offset="0.55" style={{ stopColor: `color-mix(in srgb, ${chapterTint(id)} 88%, var(--paper))` }} />
                <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${chapterTint(id)} 80%, var(--ink))` }} />
              </radialGradient>
            ))}
            <radialGradient id="ddx-bead-win" cx="0.36" cy="0.3" r="0.78">
              <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--bryce) 35%, #fff)' }} />
              <stop offset="0.55" style={{ stopColor: 'var(--bryce)' }} />
              <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--bryce) 78%, var(--ink))' }} />
            </radialGradient>
            <filter id="ddx-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodColor="#1e1c1a" floodOpacity="0.22" />
            </filter>
            <linearGradient id="ddx-better" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--grey-hair)' }} />
              <stop offset="1" style={{ stopColor: 'var(--ink)' }} />
            </linearGradient>
          </defs>

          {/* axis: words at the ends, percentages between, and which way is better */}
          <g className="ddx__axis" fontFamily={chartFont}>
            <rect x={xOf(0)} y={layout.axisH - 12} width={Math.max(xOf(1) - xOf(0), 0)} height={2.5} rx={1.25} fill="url(#ddx-better)" />
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <line
                key={tick}
                x1={xOf(tick)}
                x2={xOf(tick)}
                y1={layout.axisH - 4}
                y2={layout.height - 2}
                stroke={tick === 0.5 ? 'var(--axis-baseline)' : 'var(--grid-hairline)'}
              />
            ))}
            {[0.25, 0.5, 0.75].map((tick) =>
              layout.narrow && tick !== 0.5 ? null : (
                <text key={tick} x={xOf(tick)} y={layout.axisH - 20} textAnchor="middle" className="ddx__tick">
                  {pct(tick)}%
                </text>
              )
            )}
            <text x={xOf(0) - layout.r} y={layout.axisH - 20} textAnchor="start" className="ddx__tick">
              0% <tspan className="ddx__end">beat nobody</tspan>
            </text>
            <text x={xOf(1) + layout.r} y={layout.axisH - 20} textAnchor="end" className="ddx__tick">
              <tspan className="ddx__end">beat everyone · better →</tspan> {layout.narrow ? '' : '100%'}
            </text>
            {layout.narrow ? null : (
              <text x={xOf(0.5)} y={layout.axisH - 40} textAnchor="middle" className="ddx__axis-title">
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
                    <line x1={mx} x2={mx} y1={swarmTop - 5} y2={group.centerY + group.extent + 5} />
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
                  onMouseEnter={() => {
                    if (!coarse && grouping === 'series') setLabelSeries(group.rows[0]?.seriesId ?? null);
                  }}
                  onMouseLeave={() => setLabelSeries(null)}
                  onKeyDown={onKey}
                  style={{ animationDelay: animate ? '0.35s' : '0s' }}
                >
                  {layout.narrow ? (
                    <>
                      <rect x={0} y={group.top + 2} width={Math.min(layout.plotR, 260)} height={22} fill="transparent" />
                      <text
                        x={layout.plotL - layout.r}
                        y={group.top + 17}
                        className="ddx__name"
                        style={litSeries !== null && grouping === 'series' && group.rows[0]?.seriesId === litSeries ? { fill: `color-mix(in srgb, ${chapterTint(litSeries)} 78%, var(--ink))` } : undefined}
                      >
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
                      <text
                        x={layout.labelW}
                        y={group.centerY - 2}
                        textAnchor="end"
                        className="ddx__name"
                        style={litSeries !== null && grouping === 'series' && group.rows[0]?.seriesId === litSeries ? { fill: `color-mix(in srgb, ${chapterTint(litSeries)} 78%, var(--ink))` } : undefined}
                      >
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
          <g className="ddx__dots" filter={dots === 'beads' ? 'url(#ddx-shadow)' : undefined}>
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
                  style={{ transform: `translate(${point.x}px, ${point.y}px)`, transitionDelay: `${delay}ms, 0ms, 0ms, 0ms, 0ms` }}
                  fill={
                    early
                      ? 'var(--paper)'
                      : dots === 'ink'
                        ? win
                          ? 'var(--bryce)'
                          : litSeries === row.seriesId
                            ? tint
                            : litSeries !== null
                              ? FAINT_INK
                              : SOFT_INK
                      : dots === 'beads'
                        ? `url(#ddx-bead-${win ? 'win' : row.seriesId})`
                        : win
                          ? 'var(--bryce)'
                          : `color-mix(in srgb, ${tint} 74%, var(--paper))`
                  }
                  stroke={
                    isHovered
                      ? 'var(--ink)'
                      : win
                        ? 'var(--amber)'
                        : early
                          ? dots === 'ink'
                            ? litSeries === row.seriesId
                              ? tint
                              : litSeries !== null
                                ? FAINT_INK
                                : SOFT_INK
                            : tint
                          : 'var(--paper)'
                  }
                  strokeWidth={isHovered ? 1.6 : win ? 1 : early ? 1.5 : dots === 'beads' ? 0.9 : 0.8}
                />
              );
            })}
          </g>
          {winCount > 0 && !layout.narrow ? (
            <text x={xOf(1) + layout.r} y={layout.axisH - 40} textAnchor="end" className="ddx__wins" fontFamily={chartFont}>
              {winCount} {winCount === 1 ? 'win' : 'wins'} <tspan className="ddx__win-arrow">↓</tspan>
            </text>
          ) : null}
        </svg>
      ) : null}
      {tip ? <VenueTipCard tip={tip} width={width} tap={tap} /> : null}
    </div>
  );
};

/* ---------- the section ---------- */

export const ExplorerDeepDive = () => {
  const dots = switchValue('ddxdots');
  if (dots === 'old') return <ExplorerDeepDiveOld />;
  return <ExplorerDeepDiveNew dots={dots === 'flat' ? 'flat' : dots === 'beads' ? 'beads' : 'ink'} />;
};

const ExplorerDeepDiveNew = ({ dots }: { dots: DotStyle }) => {
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
                note: `${rows.length} races with an official or source-backed finishing position. Each dot sits at the share of the rest of the field he finished ahead of, (field − place) ÷ (field − 1) (a win is 100%). Within a row the dots sit in columns one dot wide, so a dot is within half a dot of its exact share (the card gives the exact finish); up and down only stacks a column. "Typical day" is the median race, taken as the old explorer took it: races sorted by that share, the one at position floor(n / 2), so with an even count it is the upper of the two middle races; a group of one race has no median mark. Gold is a win (P1); a hollow dot is a day that ended early (contact or mechanical).`
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
            {dots === 'ink' ? (coarse ? ' · a tapped race lights its series' : ' · a series shows its colour when you point at it') : ''}
          </>
        }
      >
        <Swarm rows={rows} grouping={shown} focus={focus} onFocus={follow} animate={!reduced} dots={dots} />
      </DeepDive>
    </div>
  );
};
