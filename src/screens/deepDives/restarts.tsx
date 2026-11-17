import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChartTipCard, chartFont, focusFade, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion, type ChartTip } from '../../app/charts';
import { SourcePill } from '../../app/components';
import { ordinal } from '../../app/format';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { TrackStillIcon } from '../../app/trackStill';
import { trackOutlineFor } from '../../assets/tracks';
import { restartBaselineSentence } from '../../data/restartBaseline';
import { uiDataPackage, type UiRestartByRace } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { raceHref } from '../careerExplorer';
import { DeepDive } from './frame';
import './restarts.css';

/* ============================================================================
 * The restarts (deep dive, November 17, 2026).
 *
 * Every INDY NXT restart he ran is one mark: it starts on the line (his place
 * at the green) and moves to where he was two green laps later: up and gold
 * when he gained places, down and ink when he lost them, a ring left on the
 * line when he held. The data carries, per race, how many restarts he gained,
 * held and lost on, and the race's net; it does not carry each restart's own
 * size or order, so every move is one step, and a race's marks are grouped by
 * outcome (said in Sources). Every count is the restart report's own.
 *
 *  ?ddrestarts (default) the moves: the restarts in race order, one small
 *                        multiple per season, each season's tally in place.
 *  ?ddrestarts=tally     the tally: the same 62 marks settle in race order,
 *                        then sort themselves into gained, held and lost.
 * ==========================================================================*/

type Kind = 'gained' | 'held' | 'lost';

interface Mark {
  key: string;
  race: number;
  kind: Kind;
  /** Chronological position among all of his counted restarts. */
  order: number;
}

interface Race {
  row: UiRestartByRace;
  index: number;
  season: number;
  marks: Mark[];
  slug: string | null;
}

const KIND_ORDER: Kind[] = ['gained', 'held', 'lost'];
const LANE_WORD: Record<Kind, string> = { gained: 'gained', held: 'held', lost: 'lost' };

const useRestartData = () => {
  const report = uiDataPackage.screens.careerLab.restarts;
  return useMemo(() => {
    const rows = (report.byRace ?? []).filter((row) => (row.bryceRestartsCounted ?? 0) > 0);
    let order = 0;
    const races: Race[] = rows.map((row, index) => {
      const counts: Record<Kind, number> = {
        gained: row.bryceGained ?? 0,
        held: row.bryceHeld ?? 0,
        lost: row.bryceSlipped ?? 0
      };
      const marks: Mark[] = [];
      for (const kind of KIND_ORDER) {
        for (let k = 0; k < counts[kind]; k += 1) {
          marks.push({ key: `${row.sessionId}-${kind}-${k}`, race: index, kind, order });
          order += 1;
        }
      }
      return { row, index, season: row.seasonYear ?? 0, marks, slug: trackOutlineFor(row.trackName)?.slug ?? null };
    });
    const seasons: Array<{ year: number; races: Race[] }> = [];
    for (const race of races) {
      const last = seasons[seasons.length - 1];
      if (last && last.year === race.season) last.races.push(race);
      else seasons.push({ year: race.season, races: [race] });
    }
    const marks = races.flatMap((race) => race.marks);
    return { report, races, seasons, marks };
  }, [report]);
};

/* ---------- the tip: a race's restarts, read; its 3D still under a mouse ---------- */

const tipLines = (race: Race) => {
  const { row } = race;
  const counted = row.bryceRestartsCounted ?? 0;
  const parts = [
    (row.bryceGained ?? 0) > 0 ? `${row.bryceGained} gained` : null,
    (row.bryceHeld ?? 0) > 0 ? `${row.bryceHeld} held` : null,
    (row.bryceSlipped ?? 0) > 0 ? `${row.bryceSlipped} lost` : null
  ].filter(Boolean);
  const net = row.bryceNet ?? 0;
  const netWords = net > 0 ? `up ${net} place${net === 1 ? '' : 's'} net` : net === 0 ? 'even net' : `back ${Math.abs(net)} place${net === -1 ? '' : 's'} net`;
  const rank = row.bryceRankInField !== null && row.fieldSizeRanked ? `${ordinal(row.bryceRankInField)} of ${row.fieldSizeRanked} on restarts` : null;
  return {
    title: `${row.raceLabel}${row.seasonYear ? ` · ${row.seasonYear}` : ''}`,
    detail: [`${counted} restart${counted === 1 ? '' : 's'}: ${parts.join(', ')}`, netWords, rank].filter(Boolean).join(' · '),
    flag: row.soleBestInField ? 'best in the field that day' : row.bryceBeatFieldTypical ? "beat the field's typical move" : null
  };
};

const MouseCard = ({ race, x, y, width }: { race: Race; x: number; y: number; width: number }) => {
  const lines = tipLines(race);
  return (
    <div className="ddr-tip" style={{ left: Math.min(Math.max(x, 170), Math.max(width - 170, 170)), top: y }} role="status">
      {race.slug ? (
        <span className="ddr-tip__still">
          <TrackStillIcon slug={race.slug} />
        </span>
      ) : null}
      <span className="ddr-tip__words">
        <strong>{lines.title}</strong>
        <span className="ddr-tip__detail">{lines.detail}</span>
        {lines.flag ? <span className="ddr-tip__flag">{lines.flag}</span> : null}
        <span className="ddr-tip__action">click to open the race</span>
      </span>
    </div>
  );
};

/* ---------- one restart, drawn: a ring on the line that moves up or down ---------- */

const EASE = 'cubic-bezier(0.22, 0.9, 0.3, 1)';

const RestartMark = ({
  x,
  midY,
  step,
  r,
  kind,
  settled,
  delay,
  dim
}: {
  x: number;
  midY: number;
  step: number;
  r: number;
  kind: Kind;
  settled: boolean;
  delay: number;
  dim: boolean;
}) => {
  const dy = settled ? (kind === 'gained' ? -step : kind === 'lost' ? step : 0) : 0;
  const moved = settled && kind !== 'held';
  const fill = !moved ? 'var(--paper)' : kind === 'gained' ? 'var(--bryce)' : 'var(--ink)';
  const stroke = kind === 'gained' && moved ? 'var(--amber)' : kind === 'lost' && moved ? 'var(--ink)' : 'var(--grey-ink2)';
  const stemLength = Math.max(step - r, 0);
  return (
    <g style={{ opacity: dim ? focusFade : 1, transition: 'opacity 140ms ease' }}>
      {kind !== 'held' ? (
        <rect
          x={x - 0.6}
          width={1.2}
          y={kind === 'gained' ? midY - stemLength : midY}
          height={stemLength}
          fill={kind === 'gained' ? 'var(--amber)' : 'var(--ink)'}
          opacity={kind === 'gained' ? 0.6 : 0.42}
          style={{
            transformBox: 'fill-box',
            transformOrigin: kind === 'gained' ? 'center bottom' : 'center top',
            transform: `scaleY(${settled ? 1 : 0})`,
            transition: `transform 520ms ${EASE} ${delay}ms`
          }}
        />
      ) : null}
      <circle
        cx={x}
        cy={midY}
        r={r}
        strokeWidth={kind === 'held' ? 1.25 : 1}
        style={{
          fill,
          stroke,
          transform: `translateY(${dy}px)`,
          transition: `transform 520ms ${EASE} ${delay}ms, fill 260ms ease ${delay + 160}ms, stroke 260ms ease ${delay + 160}ms`
        }}
      />
    </g>
  );
};

/* ---------- version 1, the moves: race order, one small multiple per season ---------- */

const RACE_GAP = 1.1;

const MovesChart = () => {
  const { report, seasons, races } = useRestartData();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const settled = inView || reduced;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<(ChartTip & { race: number }) | null>(null);
  const career = report.career;
  const bySeason = new Map((report.bySeason ?? []).map((row) => [row.seasonYear ?? 0, row]));

  const phone = width > 0 && width < 640;
  const layout = useMemo(() => {
    if (width <= 0) return null;
    const unitsOf = (list: Race[]) => list.reduce((sum, race) => sum + race.marks.length, 0) + (list.length - 1) * RACE_GAP;
    const left = phone ? 64 : 92;
    const panelGap = phone ? 0 : 40;
    const slot = phone
      ? (width - left - 6) / Math.max(...seasons.map((season) => unitsOf(season.races)))
      : (width - left - panelGap * (seasons.length - 1) - 6) / seasons.reduce((sum, season) => sum + unitsOf(season.races), 0);
    const r = Math.min(Math.max(slot * 0.36, 2.9), 6);
    const step = Math.min(Math.max(slot * 3.3, 26), 64);
    const head = phone ? 36 : 40;
    const note = 16; // room for an in-place note over the gained row
    const panelHeight = head + note + step * 2 + r * 2 + (phone ? 18 : 14);
    let cursor = left;
    const panels = seasons.map((season, p) => {
      const x0 = phone ? left : cursor;
      const x1 = x0 + unitsOf(season.races) * slot;
      cursor = x1 + panelGap;
      const y0 = phone ? p * panelHeight : 0;
      const midY = y0 + head + note + step + r;
      let u = 0;
      const groups = season.races.map((race) => {
        const xs = race.marks.map(() => {
          const x = x0 + (u + 0.5) * slot;
          u += 1;
          return x;
        });
        u += RACE_GAP;
        return { race, xs, from: xs[0] - slot / 2, to: xs[xs.length - 1] + slot / 2 };
      });
      return { season, x0, x1, y0, midY, groups };
    });
    const height = phone ? panelHeight * seasons.length : panelHeight;
    return { left, slot, r, step, panels, height, panelHeight };
  }, [width, phone, seasons]);

  const clear = () => {
    setHovered(null);
    setTip(null);
  };

  const find = (event: ReactMouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || !layout) return null;
    const mx = event.clientX - bounds.left;
    const my = event.clientY - bounds.top;
    let best: { race: number; d: number; x: number; y: number } | null = null;
    for (const panel of layout.panels) {
      if (my < panel.y0 || my > panel.y0 + layout.panelHeight) continue;
      for (const group of panel.groups) {
        const cx = (group.from + group.to) / 2;
        const d = mx < group.from ? group.from - mx : mx > group.to ? mx - group.to : 0;
        if (!best || d < best.d) best = { race: group.race.index, d, x: cx, y: panel.midY - layout.step - layout.r - 6 };
      }
    }
    if (!best || best.d > layout.slot * 2 + 8) {
      clear();
      return null;
    }
    const lines = tipLines(races[best.race]);
    setHovered(best.race);
    setTip({
      race: best.race,
      x: best.x,
      y: best.y,
      over: best.y,
      under: best.y + layout.step * 2 + layout.r * 2 + 12,
      title: lines.title,
      detail: [lines.detail, lines.flag].filter(Boolean).join(' · '),
      action: 'open the race'
    });
    return best.race;
  };

  const best = races.find((race) => race.row.soleBestInField) ?? null;
  const fs = phone ? 12 : 13;

  return (
    <div ref={viewRef}>
      <div ref={ref} className="ddr-stage">
        {layout ? (
          <svg
            ref={svgRef}
            width={width}
            height={layout.height}
            role="img"
            aria-label={`${career.bryceRestartsCounted} INDY NXT restarts in race order: gained on ${career.bryceGained}, held on ${career.bryceHeld}, lost on ${career.bryceSlipped}.`}
            style={{ cursor: hovered !== null ? 'pointer' : 'default', display: 'block' }}
            {...tap.surface({ find, clear, open: (key) => () => navigate(raceHref(races[key as number].row.sessionId)) })}
          >
            {layout.panels.map((panel, p) => {
              const season = bySeason.get(panel.season.year);
              const showLanes = phone || p === 0;
              /* Lane counts: the career's beside the first season on a wide
               * screen; each season's own where the seasons stack (phone). */
              const counts: Record<Kind, number> =
                phone && season
                  ? { gained: season.bryceGained, held: season.bryceHeld, lost: season.bryceSlipped }
                  : { gained: career.bryceGained, held: career.bryceHeld, lost: career.bryceSlipped };
              return (
                <g key={panel.season.year}>
                  {phone && p > 0 ? <line x1={0} x2={width} y1={panel.y0 + 2} y2={panel.y0 + 2} stroke="var(--grid-hairline)" strokeWidth={1} /> : null}
                  <text x={phone ? 0 : panel.x0} y={panel.y0 + (phone ? 25 : 18)} fontFamily={chartFont} fontSize={phone ? 13.5 : 14}>
                    <tspan fill="var(--ink)" fontWeight={630}>
                      {panel.season.year}
                    </tspan>
                    {season ? (
                      <tspan fill="var(--ink-muted)" dx={8} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {season.bryceGained + season.bryceHeld} of {season.bryceRestartsCounted} held or gained
                      </tspan>
                    ) : null}
                  </text>
                  <line x1={panel.x0} x2={panel.x1} y1={panel.midY} y2={panel.midY} stroke="var(--ink)" strokeOpacity={0.28} strokeWidth={1} />
                  {!phone && p === 0 ? (
                    <text x={layout.left - 18} y={panel.y0 + 18} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={fs}>
                      all {career.bryceRestartsCounted}
                    </text>
                  ) : null}
                  {showLanes
                    ? KIND_ORDER.map((kind) => {
                        const y = panel.midY + (kind === 'gained' ? -layout.step : kind === 'lost' ? layout.step : 0);
                        return (
                          <text key={kind} x={layout.left - (phone ? 10 : 18)} y={y + 4.5} textAnchor="end" fontFamily={chartFont} fontSize={fs}>
                            <tspan fill="var(--ink-secondary)">{LANE_WORD[kind]}</tspan>
                            <tspan dx={5} fill={kind === 'gained' ? 'var(--amber)' : 'var(--ink)'} fontWeight={630} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {counts[kind]}
                            </tspan>
                          </text>
                        );
                      })
                    : null}
                  {panel.groups.map((group) => {
                    const dim = hovered !== null && hovered !== group.race.index;
                    return (
                      <g key={group.race.row.sessionId}>
                        {hovered === group.race.index ? (
                          <rect
                            x={group.from - 2}
                            width={group.to - group.from + 4}
                            y={panel.midY - layout.step - layout.r - 6}
                            height={layout.step * 2 + layout.r * 2 + 12}
                            rx={4}
                            fill="var(--ink)"
                            opacity={0.05}
                          />
                        ) : null}
                        {group.race.marks.map((mark, m) => (
                          <RestartMark
                            key={mark.key}
                            x={group.xs[m]}
                            midY={panel.midY}
                            step={layout.step}
                            r={layout.r}
                            kind={mark.kind}
                            settled={settled}
                            delay={reduced ? 0 : 120 + mark.order * 13}
                            dim={dim}
                          />
                        ))}
                      </g>
                    );
                  })}
                  {best
                    ? (() => {
                        const group = panel.groups.find((g) => g.race.index === best.index);
                        if (!group) return null;
                        const cx = (group.from + group.to) / 2;
                        const label = 'best in the field';
                        const half = label.length * fs * 0.27;
                        const lx = Math.min(Math.max(cx, panel.x0 + half), width - half - 2);
                        const top = panel.midY - layout.step - layout.r;
                        return (
                          <g pointerEvents="none" style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${reduced ? 0 : 1000}ms` }}>
                            <text x={lx} y={top - 10} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={fs - 0.5}>
                              {label}
                            </text>
                            <line x1={cx} x2={cx} y1={top - 7} y2={top - 2} stroke="var(--ink-muted)" strokeWidth={1} />
                          </g>
                        );
                      })()
                    : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip && layout ? (
          coarse || tap.armed !== null ? (
            <ChartTipCard tip={tip} width={width} tap={tap} />
          ) : (
            <MouseCard race={races[tip.race]} x={tip.x} y={tip.y} width={width} />
          )
        ) : null}
      </div>
    </div>
  );
};

/* ---------- version 2, the tally: the 62 marks sort themselves ---------- */

const TallyChart = () => {
  const { report, races, marks } = useRestartData();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<(ChartTip & { race: number }) | null>(null);
  const [sorted, setSorted] = useState(false);
  const settled = inView || reduced;
  const career = report.career;

  /* The marks first settle in race order (moving up, holding, moving down),
   * then sort: the tally builds out of the restarts themselves. */
  useEffect(() => {
    if (!settled) return undefined;
    if (reduced) {
      setSorted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setSorted(true), 760);
    return () => window.clearTimeout(timer);
  }, [settled, reduced]);

  const sortedIndex = useMemo(() => {
    const out = new Map<string, number>();
    let i = 0;
    for (const kind of KIND_ORDER) {
      for (const mark of marks) if (mark.kind === kind) out.set(mark.key, i++);
    }
    return out;
  }, [marks]);

  const phone = width > 0 && width < 640;
  const n = marks.length;
  const rows = phone ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const left = 4;
  const slot = width > 0 ? (width - left * 2) / perRow : 0;
  const r = Math.min(Math.max(slot * 0.3, 3), 6);
  const step = Math.min(Math.max(slot * 1.9, 26), 46);
  const head = 30;
  const foot = phone ? 30 : 40;
  /* Rows after the first carry no label over them, so they sit closer. */
  const rowHeight = step * 2 + r * 2 + foot;
  const height = head + rowHeight * rows;
  const midOf = (row: number) => head + row * rowHeight + step + r;
  const pos = (i: number) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return { x: left + (col + 0.5) * slot, midY: midOf(row), row };
  };

  const counts: Record<Kind, number> = { gained: career.bryceGained, held: career.bryceHeld, lost: career.bryceSlipped };
  const heldOrGained = career.bryceGained + career.bryceHeld;
  const starts: Record<Kind, number> = { gained: 0, held: counts.gained, lost: counts.gained + counts.held };

  const clear = () => {
    setHovered(null);
    setTip(null);
  };
  const find = (event: ReactMouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || slot <= 0) return null;
    const mx = event.clientX - bounds.left;
    const my = event.clientY - bounds.top;
    const row = Math.min(rows - 1, Math.max(0, Math.floor((my - head + foot / 2) / rowHeight)));
    const col = Math.min(perRow - 1, Math.max(0, Math.floor((mx - left) / slot)));
    const i = row * perRow + col;
    const mark = marks.find((m) => (sorted ? sortedIndex.get(m.key) : m.order) === i);
    if (!mark) {
      clear();
      return null;
    }
    const p = pos(i);
    const lines = tipLines(races[mark.race]);
    setHovered(mark.race);
    const y = p.midY - step - r - 6;
    setTip({
      race: mark.race,
      x: p.x,
      y,
      over: y,
      under: p.midY + step + r + 8,
      title: lines.title,
      detail: [lines.detail, lines.flag].filter(Boolean).join(' · '),
      action: 'open the race'
    });
    return mark.race;
  };

  const fs = phone ? 12 : 13;
  /* Spans of a run of sorted slots, split where the run wraps a row. */
  const spans = (from: number, to: number) => {
    const out: Array<{ x0: number; x1: number; row: number }> = [];
    for (let i = from; i < to; i += 1) {
      const p = pos(i);
      const last = out[out.length - 1];
      if (last && last.row === p.row) last.x1 = p.x + slot / 2;
      else out.push({ x0: p.x - slot / 2, x1: p.x + slot / 2, row: p.row });
    }
    return out;
  };
  const labelsOn = sorted ? 1 : 0;
  const bracket = spans(0, heldOrGained);

  return (
    <div ref={viewRef}>
      <div ref={ref} className="ddr-stage">
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={`${career.bryceRestartsCounted} INDY NXT restarts sorted: gained on ${counts.gained}, held on ${counts.held}, lost on ${counts.lost}.`}
            style={{ cursor: hovered !== null ? 'pointer' : 'default', display: 'block' }}
            {...tap.surface({ find, clear, open: (key) => () => navigate(raceHref(races[key as number].row.sessionId)) })}
          >
            {Array.from({ length: rows }, (_, row) => {
              const midY = midOf(row);
              const count = Math.min(perRow, n - row * perRow);
              return <line key={row} x1={left} x2={left + count * slot} y1={midY} y2={midY} stroke="var(--ink)" strokeOpacity={0.28} strokeWidth={1} />;
            })}
            {/* each group's word and count, beside its first mark's row */}
            {KIND_ORDER.map((kind) => {
              const first = spans(starts[kind], starts[kind] + counts[kind])[0];
              if (!first) return null;
              const midY = midOf(first.row);
              const last = spans(starts[kind], starts[kind] + counts[kind]).slice(-1)[0];
              const y = kind === 'gained' ? midY - step - r - 10 : kind === 'held' ? midY - r - 9 : midY + step + r + 22;
              return (
                <text
                  key={kind}
                  x={kind === 'lost' ? last.x1 - 2 : first.x0 + 2}
                  textAnchor={kind === 'lost' ? 'end' : 'start'}
                  y={y}
                  fontFamily={chartFont}
                  fontSize={fs}
                  style={{ opacity: labelsOn, transition: `opacity 300ms ease ${reduced ? 0 : 520}ms` }}
                >
                  <tspan fill="var(--ink-secondary)">{LANE_WORD[kind]}</tspan>
                  <tspan dx={5} fill={kind === 'gained' ? 'var(--amber)' : 'var(--ink)'} fontWeight={630}>
                    {counts[kind]}
                  </tspan>
                </text>
              );
            })}
            {/* held or gained: a hairline bracket under the first 52 */}
            {bracket.map((span, k) => {
              const y = midOf(span.row) + step + r + 8;
              return (
                <g key={k} style={{ opacity: labelsOn, transition: `opacity 300ms ease ${reduced ? 0 : 680}ms` }} pointerEvents="none">
                  <path d={`M${span.x0 + 1},${y - 5} V${y} H${span.x1 - 1} V${y - 5}`} fill="none" stroke="var(--ink)" strokeOpacity={0.5} strokeWidth={1} />
                  {k === bracket.length - 1 ? (
                    <text x={(span.x0 + span.x1) / 2} y={y + 18} textAnchor="middle" fontFamily={chartFont} fontSize={fs} fill="var(--ink)">
                      <tspan fontWeight={630}>{heldOrGained}</tspan>
                      <tspan fill="var(--ink-secondary)"> held or gained</tspan>
                    </text>
                  ) : null}
                </g>
              );
            })}
            {marks.map((mark) => {
              const target = pos(sorted ? sortedIndex.get(mark.key)! : mark.order);
              const home = pos(mark.order);
              const delay = reduced ? 0 : 80 + mark.order * 9;
              return (
                <g
                  key={mark.key}
                  style={{
                    transform: `translate(${target.x - home.x}px, ${target.midY - home.midY}px)`,
                    transition: sorted && !reduced ? `transform 660ms cubic-bezier(0.45, 0, 0.2, 1) ${(mark.order % perRow) * 5}ms` : undefined
                  }}
                >
                  <RestartMark
                    x={home.x}
                    midY={home.midY}
                    step={step}
                    r={r}
                    kind={mark.kind}
                    settled={settled}
                    delay={delay}
                    dim={hovered !== null && hovered !== mark.race}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip && width > 0 ? (
          coarse || tap.armed !== null ? (
            <ChartTipCard tip={tip} width={width} tap={tap} />
          ) : (
            <MouseCard race={races[tip.race]} x={tip.x} y={tip.y} width={width} />
          )
        ) : null}
      </div>
    </div>
  );
};

/* ---------- the section ---------- */

export const RestartsDeepDive = () => {
  const { report, races } = useRestartData();
  const variant = switchValue('ddrestarts') === 'tally' ? 'tally' : 'moves';
  if (races.length < 4) return null;
  const career = report.career;
  const counted = career.bryceRestartsCounted;
  const heldOrGained = career.bryceGained + career.bryceHeld;
  const baseline = report.fieldBaseline ? restartBaselineSentence(report.fieldBaseline, 'series') : null;
  const coverage = report.coverage;
  const raceDays = career.racesSoleBestInField;

  return (
    <DeepDive
      className="ddr"
      figure={
        <>
          {heldOrGained}
          <span className="dd__of"> of {counted}</span>
        </>
      }
      unit="restarts held or gained"
      lede={
        <>
          Every INDY NXT restart he has run, from the green flag to two laps later: <strong className="ddr-gold">gold</strong> he gained places,{' '}
          <strong>ink</strong> he lost them, a ring he held.
        </>
      }
      sources={
        <SourcePill
          title="Restart record across the career"
          entries={[
            {
              label: 'Restart report · per race and rollups',
              path: 'analysis/restart-report/output/summary.json',
              note: `Positions gained over the ${report.windowLaps ?? 2} green laps after each restart, Bryce against the full field, across the ${races.length} INDY NXT races where at least one of his restarts was counted. He gained on ${career.bryceGained}, held on ${career.bryceHeld} and lost on ${career.bryceSlipped} of ${counted}.`
            },
            {
              label: 'How the marks are drawn',
              note: "Each mark is one restart: one step up when he gained places, left on the line when he held, one step down when he lost places. The report carries each race's counts and its net, not each restart's own size or order, so a step is not a number of places, and a race's marks are grouped by outcome rather than in the order they happened. A race's card gives its net and his rank in the field."
            },
            {
              label: 'Against the field',
              note: `He beat the field's typical move on ${career.restartsBeatFieldMedian} of ${counted} restarts, and was the best restarter in the field on ${raceDays} race day${raceDays === 1 ? '' : 's'}, marked in place.`
            },
            {
              label: 'Official caution summaries and lap chart',
              path: 'data/career/career.dataset.json',
              note: `Restarts from the official Results-PDF caution summary; movement from the official lap chart, positions only. Of ${coverage.indyNxtRaceSessions} INDY NXT races, ${coverage.racesNoCaution} had no caution and ${coverage.racesUncovered} have no official lap chart; ${coverage.endOfRaceCautionsExcluded} end-of-race cautions are left out.`
            }
          ]}
          caveats={report.caveats}
        />
      }
      foot={baseline ? `${baseline}.` : null}
    >
      {variant === 'tally' ? <TallyChart /> : <MovesChart />}
    </DeepDive>
  );
};
