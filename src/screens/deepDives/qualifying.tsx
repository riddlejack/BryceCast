import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import conversionCsv from '../../../analysis/qualifying-layer/output/tables/quali_race_conversion.csv?raw';
import { SourcePill } from '../../app/components';
import { chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion, type ChartTip } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { uiDataPackage } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { QualiConversion, chapterTint, raceHref, seriesShort, useCareerRows } from '../careerExplorer';
import { DeepDive, DeepTip } from './frame';
import './qualifying.css';

/* ============================================================
 * Qualifying to the flag (November 17, 2026)
 *
 * Jack: "It currently sucks right now. There's text everywhere. The chart
 * itself isn't to the same standard as the rest of the site."
 *
 * Every race where qualifying set his start (77 of 173), drawn one by one.
 * The rows are the qualifying layer's own per-race table
 * (analysis/qualifying-layer/output/tables/quali_race_conversion.csv, the
 * file the UI package's totals are built from). They are checked against the
 * package's career and per-series totals at load; if they ever disagree the
 * section falls back to the old per-series chart rather than show a second
 * set of numbers.
 *
 *   default            grid against flag: x = where he qualified, y = where he
 *                      finished; above the line he made up ground. Dots rise
 *                      from their grid slot to the flag on reveal.
 *   ?ddquali=ladder    the races in order, one stroke each from the grid slot
 *                      to the flag, chapters labelled in place.
 * ============================================================ */

type Outcome = 'ahead' | 'held' | 'behind';

interface QualiRace {
  sessionId: string;
  seriesId: string;
  seriesName: string;
  seasonYear: number;
  label: string;
  date: string;
  grid: number;
  gridField: number;
  finish: number;
  finishField: number;
  outcome: Outcome;
}

/* A small quote-aware CSV reader: one event name carries a comma. */
const parseCsv = (text: string): Array<Record<string, string>> => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((cells) => Object.fromEntries(head.map((key, index) => [key, cells[index] ?? ''])));
};

const OUTCOMES: Outcome[] = ['ahead', 'held', 'behind'];

/** The 77 races, joined to the career rows for their names and dates, or null when they disagree with the package. */
const useQualiRaces = (): QualiRace[] | null => {
  const careerRows = useCareerRows();
  return useMemo(() => {
    const layer = uiDataPackage.screens.careerLab.qualifyingLayer;
    const nameById = new Map((layer.bySeries ?? []).map((row) => [row.seriesId, row.seriesName]));
    const careerById = new Map(careerRows.map((row) => [row.sessionId, row]));
    const races: QualiRace[] = [];
    for (const raw of parseCsv(conversionCsv)) {
      const grid = Number(raw.qualiRank);
      const finish = Number(raw.finish);
      const outcome = raw.conversionOutcome as Outcome;
      if (!Number.isFinite(grid) || !Number.isFinite(finish) || !OUTCOMES.includes(outcome)) return null;
      const career = careerById.get(raw.raceSessionId);
      races.push({
        sessionId: raw.raceSessionId,
        seriesId: raw.seriesId,
        seriesName: nameById.get(raw.seriesId) ?? raw.seriesName,
        seasonYear: Number(raw.seasonYear),
        label: career?.raceLabel ?? `${raw.eventName} · ${raw.raceLabel}`,
        date: career?.date ?? `${raw.seasonYear}-01-01`,
        grid,
        gridField: Number(raw.qualiFieldSize),
        finish,
        finishField: Number(raw.raceFieldSize),
        outcome
      });
    }
    // The checks: career totals, then every series' totals, exactly as the package has them.
    const career = layer.career;
    const count = (list: QualiRace[], outcome: Outcome) => list.filter((race) => race.outcome === outcome).length;
    if (races.length !== career.conversionRaces) return null;
    if (count(races, 'ahead') !== career.finishedAhead || count(races, 'held') !== career.held || count(races, 'behind') !== career.finishedBehind) return null;
    for (const row of layer.bySeries ?? []) {
      const mine = races.filter((race) => race.seriesId === row.seriesId);
      if (mine.length !== row.conversionRaces) return null;
      if (count(mine, 'ahead') !== row.finishedAhead || count(mine, 'held') !== row.held || count(mine, 'behind') !== row.finishedBehind) return null;
    }
    // the outcome agrees with the two positions it is read from
    for (const race of races) {
      const read: Outcome = race.finish < race.grid ? 'ahead' : race.finish === race.grid ? 'held' : 'behind';
      if (read !== race.outcome) return null;
    }
    return races.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  }, [careerRows]);
};

const placesWord = (n: number) => `${n} place${n === 1 ? '' : 's'}`;

const tipOf = (race: QualiRace): Omit<ChartTip, 'x' | 'y'> => {
  const delta = race.grid - race.finish;
  return {
    title: race.label,
    detail: [
      `${seriesShort(race.seriesName)} ${race.seasonYear}`,
      `qualified P${race.grid}${race.gridField ? ` of ${race.gridField}` : ''}`,
      `finished P${race.finish}`,
      delta > 0 ? `made up ${placesWord(delta)}` : delta < 0 ? `gave back ${placesWord(-delta)}` : 'held his slot'
    ].join(' · '),
    action: 'open the race page'
  };
};

const easeOutCubic = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Milliseconds since the chart first came into view (Infinity when motion is off or done). */
const useRevealClock = (active: boolean, reduced: boolean, totalMs: number): number => {
  const [elapsed, setElapsed] = useState(reduced ? Number.POSITIVE_INFINITY : 0);
  useEffect(() => {
    if (reduced) {
      setElapsed(Number.POSITIVE_INFINITY);
      return undefined;
    }
    if (!active) return undefined;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const ms = now - start;
      if (ms >= totalMs) {
        setElapsed(Number.POSITIVE_INFINITY);
        return;
      }
      setElapsed(ms);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, totalMs]);
  return elapsed;
};

const posTicks = (max: number) => [1, 5, 10, 15, 20, 25, 30, 35].filter((p) => p <= max);

/* ---------- each chapter's own count ---------- */

interface SeriesTally {
  seriesId: string;
  seriesName: string;
  races: QualiRace[];
  ahead: number;
  held: number;
  behind: number;
}

const tallies = (races: QualiRace[]): SeriesTally[] => {
  const order = (uiDataPackage.screens.careerLab.qualifyingLayer.bySeries ?? []).filter((row) => row.conversionRaces > 0);
  return order.map((row) => ({
    seriesId: row.seriesId,
    seriesName: row.seriesName,
    races: races.filter((race) => race.seriesId === row.seriesId),
    ahead: row.finishedAhead,
    held: row.held,
    behind: row.finishedBehind
  }));
};

const SeriesKey = ({ rows, focus, onFocus }: { rows: SeriesTally[]; focus: string | null; onFocus: (seriesId: string | null) => void }) => (
  <ul className="ddq-key" aria-label="By series">
    {rows.map((row) => {
      const on = focus === null || focus === row.seriesId;
      const sorted = [...row.races].sort((a, b) => OUTCOMES.indexOf(a.outcome) - OUTCOMES.indexOf(b.outcome));
      return (
        <li key={row.seriesId}>
          <button
            type="button"
            className={`ddq-key__row${on ? '' : ' ddq-key__row--off'}${focus === row.seriesId ? ' ddq-key__row--on' : ''}`}
            aria-pressed={focus === row.seriesId}
            onMouseEnter={() => onFocus(row.seriesId)}
            onMouseLeave={() => onFocus(null)}
            onClick={() => onFocus(focus === row.seriesId ? null : row.seriesId)}
          >
            <span className="ddq-key__name">
              <span className="ddq-key__swatch" style={{ background: chapterTint(row.seriesName) }} />
              {seriesShort(row.seriesName)}
            </span>
            <span className="ddq-key__strip" aria-hidden>
              {sorted.map((race) => (
                <span key={race.sessionId} className={`ddq-key__mark ddq-key__mark--${race.outcome}`} />
              ))}
            </span>
            <span className="ddq-key__count">
              <span className="ddq-key__up">{row.ahead} up</span>
              {row.held ? <span className="ddq-key__held">{row.held} held</span> : null}
              {row.behind ? <span className="ddq-key__down">{row.behind} down</span> : null}
              <span className="ddq-key__of">of {row.races.length}</span>
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);

/* ---------- version A: grid against flag ---------- */

const GridAgainstFlag = ({ races }: { races: QualiRace[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const tap = useTapPreview();
  const { navigate } = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const elapsed = useRevealClock(inView, reduced, 1500);

  const rows = useMemo(() => tallies(races), [races]);
  const maxPos = Math.max(...races.flatMap((race) => [race.grid, race.finish]));

  const size = Math.min(width, 640);
  const margin = { top: 34, right: 10, bottom: 46, left: 40 };
  const side = Math.max(160, size - margin.left - margin.right);
  const pad = 10;
  const at = (p: number) => pad + ((p - 1) / Math.max(1, maxPos - 1)) * (side - 2 * pad);
  const X = (p: number) => margin.left + at(p);
  const Y = (p: number) => margin.top + at(p);
  const height = margin.top + side + margin.bottom;
  const r = coarse || width < 520 ? 5 : 5.5;

  /* Races on the same grid slot and finish sit side by side. */
  const points = useMemo(() => {
    const seen = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const race of races) totals.set(`${race.grid}:${race.finish}`, (totals.get(`${race.grid}:${race.finish}`) ?? 0) + 1);
    return races.map((race, index) => {
      const key = `${race.grid}:${race.finish}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const n = totals.get(key) ?? 1;
      const nudge = (k - (n - 1) / 2) * (r * 1.7);
      const delay = (index / races.length) * 600;
      return { race, index, nudge, delay };
    });
  }, [races, r]);

  const progressOf = (delay: number) => (Number.isFinite(elapsed) ? easeOutCubic((elapsed - delay) / 800) : 1);

  const tip: ChartTip | null =
    hovered !== null
      ? (() => {
          const { race, nudge } = points[hovered];
          const x = X(race.grid) + nudge;
          const y = Y(race.finish);
          return { ...tipOf(race), x, y: y - r - 4, over: y - r - 4, under: y + r + 4 };
        })()
      : null;

  const find = (event: MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const mx = event.clientX - bounds.left;
    const my = event.clientY - bounds.top;
    let best: { index: number; d: number } | null = null;
    for (const point of points) {
      if (focus !== null && point.race.seriesId !== focus) continue;
      const d = Math.hypot(X(point.race.grid) + point.nudge - mx, Y(point.race.finish) - my);
      if (!best || d < best.d) best = { index: point.index, d };
    }
    if (!best || best.d > (coarse ? 22 : 14)) {
      setHovered(null);
      return null;
    }
    setHovered(best.index);
    return best.index;
  };

  const ticks = posTicks(maxPos);
  const x1 = X(1);
  const xN = X(maxPos);
  const y1 = Y(1);
  const yN = Y(maxPos);
  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const hoveredRace = hoveredPoint?.race ?? null;
  const diagAngle = (Math.atan2(yN - y1, xN - x1) * 180) / Math.PI;
  const labelAt = 0.8;
  const diagLabelX = x1 + (xN - x1) * labelAt;
  const diagLabelY = y1 + (yN - y1) * labelAt;

  return (
    <div className="ddq-a" ref={viewRef}>
      <div className="ddq-a__plot" ref={ref}>
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={size}
            height={height}
            role="img"
            aria-label={`${races.length} races: where he qualified against where he finished. Above the diagonal he finished ahead of his grid slot.`}
            {...tap.surface({
              find,
              clear: () => setHovered(null),
              open: (index) => () => navigate(raceHref(points[index as number].race.sessionId))
            })}
          >
            {/* the half where he made up ground */}
            <polygon points={`${x1},${y1} ${xN},${y1} ${xN},${yN}`} fill="var(--bryce)" opacity={0.12} />
            {ticks.map((p) => (
              <g key={p}>
                <line x1={X(p)} x2={X(p)} y1={y1 - pad} y2={yN + pad} stroke="var(--grid-hairline)" />
                <line x1={x1 - pad} x2={xN + pad} y1={Y(p)} y2={Y(p)} stroke="var(--grid-hairline)" />
                {hoveredRace?.grid !== p ? (
                  <text x={X(p)} y={yN + pad + 16} textAnchor="middle" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
                    P{p}
                  </text>
                ) : null}
                {hoveredRace?.finish !== p ? (
                  <text x={x1 - pad - 6} y={Y(p) + 4} textAnchor="end" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
                    P{p}
                  </text>
                ) : null}
              </g>
            ))}
            {/* the hovered race's own slot and finish, read off the axes */}
            {hoveredPoint && hoveredRace ? (
              <g>
                <g stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3" opacity={0.45}>
                  <line x1={X(hoveredRace.grid) + hoveredPoint.nudge} x2={X(hoveredRace.grid) + hoveredPoint.nudge} y1={Y(hoveredRace.finish)} y2={yN + pad} />
                  <line x1={x1 - pad} x2={X(hoveredRace.grid) + hoveredPoint.nudge} y1={Y(hoveredRace.finish)} y2={Y(hoveredRace.finish)} />
                </g>
                <rect x={X(hoveredRace.grid) - 17} y={yN + pad + 3} width={34} height={18} rx={4} fill="var(--ink)" />
                <text x={X(hoveredRace.grid)} y={yN + pad + 16} textAnchor="middle" fontFamily={chartFont} fontSize={12} fontWeight={600} fill="var(--paper)">
                  P{hoveredRace.grid}
                </text>
                <rect x={x1 - pad - 38} y={Y(hoveredRace.finish) - 9} width={34} height={18} rx={4} fill="var(--ink)" />
                <text x={x1 - pad - 21} y={Y(hoveredRace.finish) + 4} textAnchor="middle" fontFamily={chartFont} fontSize={12} fontWeight={600} fill="var(--paper)">
                  P{hoveredRace.finish}
                </text>
              </g>
            ) : null}
            {/* axis titles, in place */}
            <text x={4} y={margin.top - 16} textAnchor="start" fontFamily={chartFont} fontSize={12.5} fill="var(--ink-secondary)" fontWeight={600}>
              Finished ↓
            </text>
            <text x={xN + pad} y={yN + pad + 38} textAnchor="end" fontFamily={chartFont} fontSize={12.5} fill="var(--ink-secondary)" fontWeight={600}>
              Qualified →
            </text>
            {/* the line where he held his slot, and the two halves, named */}
            <line x1={x1} y1={y1} x2={xN} y2={yN} stroke="var(--ink)" strokeWidth={1} opacity={0.4} />
            <text
              x={diagLabelX}
              y={diagLabelY}
              dy={16}
              textAnchor="middle"
              fontFamily={chartFont}
              fontSize={12}
              fill="var(--ink-secondary)"
              transform={`rotate(${diagAngle} ${diagLabelX} ${diagLabelY})`}
            >
              finished where he qualified
            </text>
            <text x={xN - 4} y={y1 + 18} textAnchor="end" fontFamily={chartFont} fontSize={14} fontWeight={600} fill="var(--link)">
              Made up ground
            </text>
            <text x={x1 + 4} y={yN - 10} textAnchor="start" fontFamily={chartFont} fontSize={14} fontWeight={600} fill="var(--ink-muted)">
              Gave ground
            </text>

            {/* each race: a stem from its grid slot (on the line) to where it finished */}
            {points.map(({ race, nudge, delay, index }) => {
              const t = progressOf(delay);
              const x = X(race.grid) + nudge;
              const yStart = Y(race.grid);
              const y = yStart + (Y(race.finish) - yStart) * t;
              const dim = (focus !== null && race.seriesId !== focus) || (hovered !== null && hovered !== index);
              const stem = race.outcome === 'ahead' ? 'var(--amber)' : 'var(--grey-ink3)';
              return (
                <g key={race.sessionId} opacity={dim ? 0.16 : 1} style={{ transition: 'opacity 160ms ease' }}>
                  {race.outcome !== 'held' ? <line x1={x} x2={x} y1={yStart} y2={y} stroke={stem} strokeWidth={1.5} strokeLinecap="round" opacity={0.85} /> : null}
                  <circle
                    cx={x}
                    cy={y}
                    r={hovered === index ? r + 2 : r}
                    fill={chapterTint(race.seriesName)}
                    stroke={hovered === index ? 'var(--ink)' : 'var(--paper)'}
                    strokeWidth={hovered === index ? 2 : 1.5}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <DeepTip tip={tip} width={size} tap={tap} /> : null}
      </div>
      <SeriesKey rows={rows} focus={focus} onFocus={setFocus} />
    </div>
  );
};

/* ---------- version B: the ladder, race by race ---------- */

const PHONE_SHORT: Record<string, string> = {
  'Formula Ford': 'FF',
  Euroformula: 'Euro',
  'FR Oceania': 'FRO',
  'USF Pro 2000': 'USF'
};

const Ladder = ({ races }: { races: QualiRace[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const tap = useTapPreview();
  const { navigate } = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const elapsed = useRevealClock(inView, reduced, 1900);

  const rows = useMemo(() => tallies(races), [races]);
  const ordered = useMemo(() => rows.flatMap((row) => row.races), [rows]);
  const maxPos = Math.max(...races.flatMap((race) => [race.grid, race.finish]));
  const phone = width < 640;
  const marginX = { right: 8, left: 36 };
  const plotH = phone ? 300 : 380;
  const gap = phone ? 8 : 18;
  const innerW = Math.max(100, width - marginX.left - marginX.right - gap * (rows.length - 1));
  const cw = innerW / Math.max(1, ordered.length);
  const bands = useMemo(() => {
    let x = marginX.left;
    return rows.map((row) => {
      const start = x;
      const w = row.races.length * cw;
      x += w + gap;
      return { row, start, w };
    });
  }, [rows, cw, gap, marginX.left]);

  const xs = useMemo(() => bands.flatMap((band) => band.row.races.map((_, i) => band.start + (i + 0.5) * cw)), [bands, cw]);

  /* chapter labels: centred on their band, dropped a line when they would touch */
  const labels = useMemo(() => {
    const placed: Array<{ x: number; line: number; w: number }> = [];
    return bands.map((band) => {
      const short = seriesShort(band.row.seriesName);
      const text = phone ? PHONE_SHORT[short] ?? short : short;
      const w = text.length * 7 + 10;
      const cx = Math.min(Math.max(band.start + band.w / 2, marginX.left + w / 2), width - marginX.right - w / 2);
      let line = 0;
      while (placed.some((p) => p.line === line && Math.abs(p.x - cx) < (p.w + w) / 2 + 6)) line += 1;
      placed.push({ x: cx, line, w });
      return { band, text, cx, line };
    });
  }, [bands, width, phone, marginX.left, marginX.right]);
  const lines = Math.max(1, ...labels.map((label) => label.line + 1));
  const labelBlock = phone ? lines * 15 : 30;
  const margin = { ...marginX, top: 22 + labelBlock + 12, bottom: 12 };
  const height = margin.top + plotH + margin.bottom;
  const Y = (p: number) => margin.top + 6 + ((p - 1) / Math.max(1, maxPos - 1)) * (plotH - 12);

  const best = useMemo(() => {
    let pick = 0;
    ordered.forEach((race, i) => {
      if (race.grid - race.finish > ordered[pick].grid - ordered[pick].finish) pick = i;
    });
    return pick;
  }, [ordered]);

  const strokeW = Math.max(1.5, Math.min(4, cw * 0.42));
  const dotR = Math.max(2.4, Math.min(4.5, cw * 0.42));

  const find = (event: MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const mx = event.clientX - bounds.left;
    const my = event.clientY - bounds.top;
    if (my < margin.top - 8 || my > height) {
      setHovered(null);
      return null;
    }
    let pick = -1;
    let dist = Number.POSITIVE_INFINITY;
    xs.forEach((x, i) => {
      const d = Math.abs(x - mx);
      if (d < dist) {
        dist = d;
        pick = i;
      }
    });
    if (pick < 0 || dist > Math.max(cw, coarse ? 12 : 8)) {
      setHovered(null);
      return null;
    }
    setHovered(pick);
    return pick;
  };

  const tip: ChartTip | null =
    hovered !== null
      ? (() => {
          const race = ordered[hovered];
          const top = Y(Math.min(race.grid, race.finish));
          const bottom = Y(Math.max(race.grid, race.finish));
          return { ...tipOf(race), x: xs[hovered], y: top - 8, over: top - 8, under: bottom + 8 };
        })()
      : null;

  const bestRace = ordered[best];
  const bestX = xs[best];
  const bestLeft = bestX > width * 0.6;

  return (
    <div className="ddq-b" ref={viewRef}>
      <div ref={ref} style={{ position: 'relative' }}>
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={`${races.length} races in order, each a stroke from where he qualified to where he finished.`}
            {...tap.surface({ find, clear: () => setHovered(null), open: (i) => () => navigate(raceHref(ordered[i as number].sessionId)) })}
          >
            {posTicks(maxPos).map((p) => (
              <g key={p}>
                <line x1={margin.left - 4} x2={width - margin.right} y1={Y(p)} y2={Y(p)} stroke="var(--grid-hairline)" />
                <text x={margin.left - 8} y={Y(p) + 4} textAnchor="end" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
                  P{p}
                </text>
              </g>
            ))}
            {labels.map(({ band, text, cx, line }) => {
              const y = 22 + line * 15;
              return (
                <g key={band.row.seriesId}>
                  <rect x={band.start} y={margin.top - 8} width={Math.max(2, band.w)} height={2} fill={chapterTint(band.row.seriesName)} />
                  <text x={cx} y={y} textAnchor="middle" fontFamily={chartFont} fontSize={12} fontWeight={600} fill="var(--ink)">
                    {text}
                  </text>
                  {!phone ? (
                    <text x={cx} y={y + 15} textAnchor="middle" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
                      <tspan fill="var(--link)" fontWeight={600}>
                        {band.row.ahead} up
                      </tspan>
                      {band.row.behind ? ` · ${band.row.behind} down` : ''}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {hovered !== null ? <rect x={xs[hovered] - Math.max(cw, 6) / 2} y={margin.top - 4} width={Math.max(cw, 6)} height={plotH + 8} fill="var(--grey-wash)" /> : null}
            {ordered.map((race, i) => {
              const x = xs[i];
              const delay = (i / ordered.length) * 1100;
              const t = Number.isFinite(elapsed) ? easeOutCubic((elapsed - delay) / 600) : 1;
              const y0 = Y(race.grid);
              const y = y0 + (Y(race.finish) - y0) * t;
              const dim = hovered !== null && hovered !== i;
              const tickW = Math.max(4, Math.min(10, cw * 0.9));
              return (
                <g key={race.sessionId} opacity={dim ? 0.3 : 1}>
                  <line x1={x - tickW / 2} x2={x + tickW / 2} y1={y0} y2={y0} stroke="var(--ink)" strokeWidth={1.5} opacity={0.55} />
                  {race.outcome === 'held' ? (
                    <circle cx={x} cy={y0} r={dotR} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.4} opacity={t} />
                  ) : (
                    <>
                      <line
                        x1={x}
                        x2={x}
                        y1={y0}
                        y2={y}
                        stroke={race.outcome === 'ahead' ? 'var(--amber)' : 'var(--grey-ink3)'}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                        opacity={race.outcome === 'ahead' ? 0.95 : 0.7}
                      />
                      <circle cx={x} cy={y} r={dotR} fill={race.outcome === 'ahead' ? 'var(--amber)' : 'var(--grey-ink2)'} />
                    </>
                  )}
                </g>
              );
            })}
            {/* how to read one stroke, on the biggest climb */}
            {bestRace && hovered === null && !phone ? (
              <g fontFamily={chartFont} fontSize={12} fill="var(--ink-secondary)" stroke="var(--paper)" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
                <text x={bestX + (bestLeft ? -10 : 10)} y={Y(bestRace.grid) + 4} textAnchor={bestLeft ? 'end' : 'start'}>
                  qualified P{bestRace.grid}
                </text>
                <text x={bestX + (bestLeft ? -10 : 10)} y={Y(bestRace.finish) + 4} textAnchor={bestLeft ? 'end' : 'start'} fill="var(--link)" fontWeight={600}>
                  finished P{bestRace.finish}
                </text>
              </g>
            ) : null}
          </svg>
        ) : null}
        {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
      </div>
    </div>
  );
};

/* ---------- the section ---------- */

const OCCURRENCE_WORDS: Record<number, string> = { 1: 'once', 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times' };

export const QualifyingDeepDive = () => {
  const races = useQualiRaces();
  const layer = uiDataPackage.screens.careerLab.qualifyingLayer;
  const view = switchValue('ddquali') === 'ladder' ? 'ladder' : 'grid';
  if (!races) return <QualiConversion />;

  const career = layer.career;
  const coverage = layer.coverage;
  const excluded = coverage.excludedReasons;
  const best = layer.bestQualifying;
  const bestLine =
    career.bestQualiRank != null
      ? `best qualifying P${career.bestQualiRank}${
          best ? `, ${OCCURRENCE_WORDS[best.occurrences] ?? `${best.occurrences} times`}${best.seriesName ? ` in ${best.seriesName}${best.seasonYear ? ` ${best.seasonYear}` : ''}` : ''}` : ''
        }`
      : null;

  return (
    <DeepDive
      className="ddq"
      figure={
        <>
          {career.finishedAhead}
          <span className="dd__of"> of {career.conversionRaces}</span>
        </>
      }
      unit="races finished ahead of where he qualified"
      lede={
        <>
          {view === 'grid' ? 'Each dot is one race: where he qualified, against where he finished.' : 'Each stroke is one race, from where he qualified to where he finished.'}{' '}
          He held his slot in <strong>{career.held}</strong> and gave ground in <strong>{career.finishedBehind}</strong>.
        </>
      }
      sources={
        <SourcePill
          title="Qualifying to the flag"
          entries={[
            {
              label: 'Qualifying layer · per race',
              path: 'analysis/qualifying-layer/output/tables/quali_race_conversion.csv',
              note: `${coverage.conversionRaces} of ${coverage.bryceRaces} races connect qualifying to the flag, each with a confirmed grid. The other ${coverage.excludedRaces}: ${excluded.no_grid_column} have no sourced grid, ${excluded.reverse_grid_no_quali_match} use a reverse grid, ${excluded.no_qualifying_in_event} have no qualifying result, and ${excluded.no_finish} have no classified finish. The page checks these rows against the career and per-series totals as it loads.`
            },
            {
              label: 'Qualifying layer · per series and conversion',
              path: 'analysis/qualifying-layer/output/summary.json',
              note: `${career.qualifyingAppearances} qualifying sessions across ${coverage.seriesWithQualifying} series. Made up ground ${career.finishedAhead}, held ${career.held}, gave ground ${career.finishedBehind}, of ${career.conversionRaces}.`
            },
            {
              label: 'Two qualifying source families, never blended',
              path: 'analysis/qualifying-layer/output/tables/quali_sessions.csv',
              note: 'Each qualifying result uses one official source: the qualifying sheet when available, otherwise the session result. One family per session, its field size the denominator.'
            }
          ]}
          caveats={layer.caveats}
        />
      }
      foot={
        <>
          {career.qualifyingAppearances} qualifying sessions in {coverage.seriesWithQualifying} series{bestLine ? `; ${bestLine}` : ''}.
        </>
      }
    >
      {view === 'ladder' ? <Ladder races={races} /> : <GridAgainstFlag races={races} />}
    </DeepDive>
  );
};
