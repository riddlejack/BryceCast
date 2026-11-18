import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { chartFont, focusFade, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import type { VenueTip } from '../../app/venueCard';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { chapterTint, raceHref, seriesShort } from '../careerExplorer';
import { DeepTip } from './frame';
import { FLAG_EASE, FlagDot, RUN_W, StartRing, countColour, runColour, runOpacity, type FlagKind } from './flagMarks';
import { tallies, tipOf, type Outcome, type QualiRace } from './qualifyingData';

/* ============================================================================
 * Qualifying to the flag, round 3 (November 18, 2026).
 *
 * Jack: "it loses the positives of the restarts ... The lines coming off of
 * the graph are too thick. The dots are different than the dots everywhere
 * else on the site. This just looks clunky. Also, the lines go through the
 * grid slot line in the middle. We just need a different approach."
 *
 *   FlagSplit (default)  the split: every race one Restarts dot, stacked over
 *                        how many places it moved from where he qualified to
 *                        the flag. Lost places on the left, made-up places on
 *                        the right, held in the middle. No lines at all: on
 *                        reveal every dot leaves the "held" column (his grid
 *                        slot) for where the flag left him. "By series" lifts
 *                        the same dots into one row per chapter.
 *   FlagRuns (?ddquali=runs)  the runs: one row per race, a ring where he
 *                        qualified and a dot where he finished, front of the
 *                        grid on the right, joined by a 1.2 px run; biggest
 *                        gain at the top. The Biggest climbs dive draws its
 *                        five the same way.
 * ==========================================================================*/

const KIND: Record<Outcome, FlagKind> = { ahead: 'gained', held: 'held', behind: 'lost' };
const delta = (race: QualiRace) => race.grid - race.finish;
const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0');

export type SplitLayout = 'all' | 'series';

interface Placed {
  race: QualiRace;
  order: number;
  x: number;
  y: number;
  /** Where the dot starts on reveal: the held column, on its row's baseline. */
  x0: number;
  y0: number;
}

/* ---------- the split ---------- */

export const FlagSplit = ({ races, layout }: { races: QualiRace[]; layout: SplitLayout }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const tap = useTapPreview();
  const { navigate } = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (inView || reduced) setSettled(true);
  }, [inView, reduced]);
  /* After the first play, a layout flip glides quickly with no race-order stagger. */
  useEffect(() => {
    if (!settled || reduced) return undefined;
    const timer = window.setTimeout(() => setMoved(true), 1700);
    return () => window.clearTimeout(timer);
  }, [settled, reduced]);

  const rowsOfSeries = useMemo(() => tallies(races), [races]);
  const dMin = Math.min(...races.map(delta));
  const dMax = Math.max(...races.map(delta));
  const cols = dMax - dMin + 1;

  const phone = width > 0 && width < 640;
  const bySeries = layout === 'series';
  const labelW = bySeries && !phone ? 176 : 0;
  const padL = phone ? 6 : 10;
  const padR = phone ? 6 : 10;
  const plotW = Math.max(120, width - labelW - padL - padR);
  const colPitch = plotW / cols;
  const r = Math.min(6, Math.max(4, colPitch * 0.3));
  const dotPitch = r * 2 + 2.5;
  /* One dot per column: a column's height is its count (two across read as blocks). */
  const across = 1;
  const colX = (d: number) => labelW + padL + (d - dMin + 0.5) * colPitch;

  const groups = useMemo(
    () => (bySeries ? rowsOfSeries.map((row) => ({ key: row.seriesId, tally: row as typeof row | null, races: row.races })) : [{ key: 'all', tally: null, races }]),
    [bySeries, rowsOfSeries, races]
  );

  const raceOrder = useMemo(() => new Map(races.map((race, i) => [race.sessionId, i])), [races]);

  const layoutRows = useMemo(() => {
    const head = bySeries ? (phone ? 26 : 16) : 34;
    const axis = bySeries ? 14 : 0;
    let cursor = 0;
    const placed: Placed[] = [];
    const rows = groups.map((group, g) => {
      const byCol = new Map<number, QualiRace[]>();
      for (const race of group.races) {
        const d = delta(race);
        byCol.set(d, [...(byCol.get(d) ?? []), race]);
      }
      const levels = Math.max(...[...byCol.values()].map((list) => Math.ceil(list.length / across)));
      const top = cursor;
      const base = top + head + levels * dotPitch + 2;
      byCol.forEach((list, d) => {
        list.forEach((race, k) => {
          const col = k % across;
          const level = Math.floor(k / across);
          placed.push({
            race,
            order: raceOrder.get(race.sessionId) ?? 0,
            x: colX(d) + (col - (across - 1) / 2) * dotPitch,
            y: base - r - 2 - level * dotPitch,
            x0: colX(0),
            y0: base - r - 2
          });
        });
      });
      cursor = base + axis + (g < groups.length - 1 ? (phone ? 10 : 14) : 0);
      return { group, top, base };
    });
    return { rows, placed, height: cursor };
  }, [groups, across, dotPitch, r, phone, bySeries, raceOrder, labelW, colPitch, dMin]); // eslint-disable-line react-hooks/exhaustive-deps

  const footH = phone ? 44 : 40;
  const height = layoutRows.height + footH;
  const lastBase = layoutRows.rows[layoutRows.rows.length - 1]?.base ?? 0;

  const find = (event: MouseEvent<Element>): string | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const mx = event.clientX - bounds.left;
    const my = event.clientY - bounds.top;
    let best: { id: string; d: number } | null = null;
    for (const p of layoutRows.placed) {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (!best || d < best.d) best = { id: p.race.sessionId, d };
    }
    if (!best || best.d > r + (coarse ? 12 : 7)) {
      setHovered(null);
      return null;
    }
    setHovered(best.id);
    return best.id;
  };

  const lit = hovered ? layoutRows.placed.find((p) => p.race.sessionId === hovered) ?? null : null;
  const tip: VenueTip | null = lit ? { ...tipOf(lit.race), x: lit.x, y: lit.y - r - 6, over: lit.y - r - 6, under: lit.y + r + 6 } : null;

  const fs = phone ? 12 : 13;
  const totals: Record<Outcome, number> = { ahead: 0, held: 0, behind: 0 };
  for (const race of races) totals[race.outcome] += 1;
  const tickDs = Array.from({ length: cols }, (_, i) => dMin + i).filter((d) => d === dMin || d === dMax || d % 5 === 0);
  const left = colX(dMin) - colPitch / 2;
  const right = colX(dMax) + colPitch / 2;

  return (
    <div ref={viewRef}>
      <div ref={ref} className="ddq-flag">
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={`${races.length} races by places moved from where he qualified to the flag: ${totals.ahead} finished ahead, ${totals.held} held, ${totals.behind} finished behind.`}
            style={{ cursor: hovered ? 'pointer' : 'default', display: 'block' }}
            {...tap.surface({ find, clear: () => setHovered(null), open: (id) => () => navigate(raceHref(id as string)) })}
          >
            {layoutRows.rows.map(({ group, top, base }) => (
              <g key={group.key}>
                <line x1={left} x2={right} y1={base} y2={base} stroke="var(--ink)" strokeOpacity={0.28} strokeWidth={1} />
                {group.tally ? (
                  phone ? (
                    <>
                    <circle cx={left + 4} cy={top + 11.5} r={3.5} fill={chapterTint(group.tally.seriesName)} />
                    <text x={left + 12} y={top + 16} fontFamily={chartFont} fontSize={13}>
                      <tspan fill="var(--ink)" fontWeight={630}>
                        {seriesShort(group.tally.seriesName)}
                      </tspan>
                      <tspan dx={8} fill="var(--ink-muted)">
                        <tspan fill="var(--link)" fontWeight={630}>
                          {group.tally.ahead}
                        </tspan>{' '}
                        of {group.tally.races.length} ahead
                      </tspan>
                    </text>
                    </>
                  ) : (
                    <g fontFamily={chartFont}>
                      <circle cx={5} cy={base - 22} r={4} fill={chapterTint(group.tally.seriesName)} />
                      <text x={16} y={base - 18} fontSize={14} fontWeight={630} fill="var(--ink)">
                        {seriesShort(group.tally.seriesName)}
                      </text>
                      <text x={16} y={base - 1} fontSize={13} fill="var(--ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <tspan fill="var(--link)" fontWeight={630}>
                          {group.tally.ahead}
                        </tspan>{' '}
                        of {group.tally.races.length} ahead
                      </text>
                    </g>
                  )
                ) : null}
              </g>
            ))}

            {/* the three counts, over their sides (one row only) */}
            {!bySeries ? (
              <g fontFamily={chartFont} fontSize={fs} style={{ fontVariantNumeric: 'tabular-nums' }}>
                <text x={left} y={16}>
                  <tspan fill="var(--ink-secondary)">finished behind</tspan>
                  <tspan dx={5} fill={countColour('lost')} fontWeight={630}>
                    {totals.behind}
                  </tspan>
                </text>
                <text x={right} y={16} textAnchor="end">
                  <tspan fill="var(--ink-secondary)">finished ahead</tspan>
                  <tspan dx={5} fill={countColour('gained')} fontWeight={630}>
                    {totals.ahead}
                  </tspan>
                </text>
              </g>
            ) : null}

            {/* the scale, under the last row: places moved, and which way is good */}
            <g fontFamily={chartFont} fontSize={12} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tickDs.map((d) => (
                <text
                  key={d}
                  x={colX(d)}
                  y={lastBase + 16}
                  textAnchor="middle"
                  fill={d === 0 ? 'var(--ink)' : 'var(--ink-muted)'}
                  fontWeight={d === 0 || (lit !== null && d === delta(lit.race)) ? 600 : 400}
                >
                  {d === 0 ? (bySeries ? 'held' : `held ${totals.held}`) : signed(d)}
                </text>
              ))}
              <text x={left} y={lastBase + 34} fill="var(--ink-muted)">
                ← places lost
              </text>
              <text x={right} y={lastBase + 34} textAnchor="end" fill="var(--link)" fontWeight={600}>
                places made up →
              </text>
            </g>

            {/* the races */}
            {layoutRows.placed.map((p) => {
              const kind = KIND[p.race.outcome];
              const at = settled ? { x: p.x, y: p.y } : { x: p.x0, y: p.y0 };
              const delay = reduced ? 0 : moved ? 0 : 140 + p.order * 11;
              const dim = hovered !== null && hovered !== p.race.sessionId;
              return (
                <g
                  key={p.race.sessionId}
                  style={{
                    transform: `translate(${at.x}px, ${at.y}px)`,
                    opacity: settled ? (dim ? focusFade + 0.12 : 1) : 0,
                    transition: reduced
                      ? undefined
                      : `transform ${moved ? 560 : 680}ms ${FLAG_EASE} ${delay}ms, opacity ${dim || hovered ? 140 : 220}ms ease ${dim || hovered ? 0 : delay}ms`
                  }}
                >
                  <FlagDot kind={kind} r={r} lit={hovered === p.race.sessionId} />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
      </div>
    </div>
  );
};

/* ---------- the runs ---------- */

export const FlagRuns = ({ races }: { races: QualiRace[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const tap = useTapPreview();
  const { navigate } = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const settled = inView || reduced;

  const ordered = useMemo(
    () => [...races].sort((a, b) => delta(b) - delta(a) || a.grid - b.grid || a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId)),
    [races]
  );
  const maxPos = Math.max(...races.flatMap((race) => [race.grid, race.finish]));

  const phone = width > 0 && width < 640;
  const padL = phone ? 10 : 16;
  const padR = phone ? 26 : 34;
  const pitch = phone ? 6.5 : 7.5;
  const r = phone ? 2.7 : 3.1;
  const axisH = 30;
  const gapH = 30;
  /* Front of the grid on the right: forward is good. */
  const X = (p: number) => width - padR - ((p - 1) / Math.max(1, maxPos - 1)) * (width - padL - padR);

  const groups = (['ahead', 'held', 'behind'] as Outcome[]).map((outcome) => ({ outcome, list: ordered.filter((race) => race.outcome === outcome) }));
  const rows = useMemo(() => {
    let y = axisH;
    const out: Array<{ race: QualiRace; i: number; y: number }> = [];
    const heads: Array<{ outcome: Outcome; y: number; count: number }> = [];
    let i = 0;
    for (const group of groups) {
      if (!group.list.length) continue;
      heads.push({ outcome: group.outcome, y: y + 16, count: group.list.length });
      y += gapH;
      for (const race of group.list) {
        out.push({ race, i, y: y + pitch / 2 });
        y += pitch;
        i += 1;
      }
    }
    return { out, heads, height: y + 8 };
  }, [ordered, pitch]); // eslint-disable-line react-hooks/exhaustive-deps

  const find = (event: MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const my = event.clientY - bounds.top;
    let best: { i: number; d: number } | null = null;
    for (const row of rows.out) {
      const d = Math.abs(row.y - my);
      if (!best || d < best.d) best = { i: row.i, d };
    }
    if (!best || best.d > pitch / 2 + (coarse ? 3 : 1)) {
      setHovered(null);
      return null;
    }
    setHovered(best.i);
    return best.i;
  };

  const litRow = hovered !== null ? rows.out[hovered] : null;
  const tip: VenueTip | null = litRow
    ? (() => {
        const { race, y } = litRow;
        return { ...tipOf(race), x: (X(race.grid) + X(race.finish)) / 2, y: y - r - 8, over: y - r - 8, under: y + r + 8 };
      })()
    : null;

  const ticks = [1, 5, 10, 15, 20].filter((p) => p <= maxPos);
  const HEAD: Record<Outcome, string> = { ahead: 'finished ahead of where he qualified', held: 'held his grid slot', behind: 'finished behind it' };
  const SHORT: Record<Outcome, string> = { ahead: 'finished ahead', held: 'held', behind: 'finished behind' };
  const fs = phone ? 12 : 13;

  return (
    <div ref={viewRef}>
      <div ref={ref} className="ddq-flag">
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={rows.height}
            role="img"
            aria-label={`${races.length} races, each a run from where he qualified to where he finished, front of the grid on the right.`}
            style={{ cursor: hovered !== null ? 'pointer' : 'default', display: 'block' }}
            {...tap.surface({ find, clear: () => setHovered(null), open: (i) => () => navigate(raceHref(rows.out[i as number].race.sessionId)) })}
          >
            {/* grid positions across the top, faint guides down */}
            <g fontFamily={chartFont} fontSize={12} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {ticks.map((p) => (
                <g key={p}>
                  <line x1={X(p)} x2={X(p)} y1={axisH - 6} y2={rows.height - 8} stroke="var(--grid-hairline)" />
                  <text x={X(p)} y={axisH - 12} textAnchor="middle" fill={p === 1 ? 'var(--ink)' : 'var(--ink-muted)'} fontWeight={p === 1 ? 600 : 400}>
                    P{p}
                  </text>
                </g>
              ))}
              {!phone ? (
                <text x={X(1) + 14} y={axisH - 12} fill="var(--ink-muted)">
                  →
                </text>
              ) : null}
            </g>
            {rows.heads.map((head) => (
              <text key={head.outcome} x={padL} y={head.y + 4} fontFamily={chartFont} fontSize={fs} style={{ fontVariantNumeric: 'tabular-nums' }}>
                <tspan fill={countColour(KIND[head.outcome])} fontWeight={630}>
                  {head.count}
                </tspan>
                <tspan dx={6} fill="var(--ink-secondary)">
                  {phone ? SHORT[head.outcome] : HEAD[head.outcome]}
                </tspan>
              </text>
            ))}
            {litRow ? <rect x={padL - 6} y={litRow.y - pitch / 2} width={width - padL - padR + 18} height={pitch} rx={2} fill="var(--ink)" opacity={0.05} /> : null}
            {rows.out.map(({ race, i, y }) => {
              const kind = KIND[race.outcome];
              const xq = X(race.grid);
              const xf = X(race.finish);
              const delay = reduced ? 0 : 120 + i * 9;
              const dim = hovered !== null && hovered !== i;
              const t = `${560}ms ${FLAG_EASE} ${delay}ms`;
              return (
                <g key={race.sessionId} style={{ opacity: dim ? focusFade + 0.1 : 1, transition: 'opacity 140ms ease' }}>
                  {kind !== 'held' ? (
                    <rect
                      x={Math.min(xq, xf)}
                      width={Math.abs(xf - xq)}
                      y={y - RUN_W / 2}
                      height={RUN_W}
                      fill={runColour(kind)}
                      opacity={runOpacity(kind)}
                      style={{
                        transformBox: 'fill-box',
                        transformOrigin: xf > xq ? 'left center' : 'right center',
                        transform: `scaleX(${settled ? 1 : 0})`,
                        transition: reduced ? undefined : `transform ${t}`
                      }}
                    />
                  ) : null}
                  {kind !== 'held' ? (
                    <g transform={`translate(${xq} ${y})`}>
                      <StartRing r={r} />
                    </g>
                  ) : null}
                  <g style={{ transform: `translate(${settled ? xf : xq}px, ${y}px)`, transition: reduced ? undefined : `transform ${t}` }}>
                    <FlagDot kind={kind} r={r} lit={hovered === i} />
                  </g>
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
      </div>
    </div>
  );
};
