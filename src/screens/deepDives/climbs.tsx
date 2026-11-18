import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { SourcePill } from '../../app/components';
import {
  PointerOpen,
  chartFont,
  focusFade,
  useInViewOnce,
  useMeasuredWidth,
  useReducedMotion
} from '../../app/charts';
import type { VenueTip } from '../../app/venueCard';
import { useRouter } from '../../app/router';
import { TAP_CARD, useTapPreview, type TapPreview } from '../../app/tapPreview';
import { uiDataPackage } from '../../data/uiDataPackage';
import { getVenueDossier } from '../../data/venueDossier';
import { useGb3DeepDive } from '../../data/gb3DeepDive';
import { switchValue } from '../../review/switches';
import { chapterTint, raceHref, useCareerRows, type CareerRow } from '../careerExplorer';
import { DeepDive, DeepTip } from './frame';
import { raceTipOf, venuesOf } from './raceTip';
import { finishLine, raceFieldOf, raceTitleOf } from '../raceCardFacts';
import { FlagDot, RUN_W, StartRing, runColour, runOpacity } from './flagMarks';
import './climbs.css';

/* ============================================================================
 * Biggest climbs (November 17, 2026). The old five-row table becomes five
 * ladders, one per race, drawn to one scale: each ladder is as long as the
 * field he raced (the classified cars behind the race's finishing percentile),
 * and his marker rises from his grid slot to his finish, once, as the section
 * comes into view. 14 places up a 21-car ladder reads differently from 7 up an
 * 18-car one. `?ddclimbs=rows` lays the same five out as rows: the field as a
 * line of grid slots, front on the right, his marker running forward.
 * Selection is the old component's: the five largest positive gains among the
 * career rows, ties in race-date order (the rows arrive date-sorted and the
 * sort is stable).
 * ==========================================================================*/

type FieldFrom = 'dossier' | 'gb3' | 'percentile';

interface Climb {
  row: CareerRow;
  start: number;
  finish: number;
  gain: number;
  /** Classified cars, or null where no source gives it and it can't be read back. */
  field: number | null;
  fieldFrom: FieldFrom | null;
  /** The ladder's length: the field, or his grid slot when he started behind it. */
  depth: number;
  place: string;
  shortPlace: string;
}

const placeNames: Record<string, string> = {
  'World Wide Technology Raceway': 'WWT Raceway',
  'Brands Hatch Circuit': 'Brands Hatch'
};

/* A phone column is about 65 px wide: the venue's short name. */
const shortPlaceNames: Record<string, string> = {
  'World Wide Technology Raceway': 'WWT',
  'Streets of St. Petersburg': 'St. Pete',
  'Brands Hatch Circuit': 'Brands',
  'Donington Park': 'Donington',
  'Oulton Park': 'Oulton'
};

const placeOf = (trackName: string): string =>
  placeNames[trackName] ??
  trackName
    .replace(/^Streets of /, '')
    .replace(/ Street Circuit$/, '')
    .replace(/ Circuit$/, '');

const shortPlaceOf = (trackName: string): string => shortPlaceNames[trackName] ?? placeOf(trackName);

/** The classified field a share was taken over: the career rows' share is the
 *  field beaten, (field − finish) / (field − 1), so field = (finish − p) / (1 − p).
 *  Only accepted when it lands on a whole number (a win, p = 1, gives none). */
const fieldFromPercentile = (finish: number, percentile: number): number | null => {
  if (!(percentile < 1) || finish < 2) return null;
  const n = (finish - percentile) / (1 - percentile);
  const whole = Math.round(n);
  return Math.abs(n - whole) < 0.05 && whole >= finish ? whole : null;
};

const dossierFields = (): Map<string, number> => {
  const out = new Map<string, number>();
  for (const venue of getVenueDossier().venues) {
    for (const visit of venue.visits) {
      if (visit.result.fieldSize !== null) out.set(visit.sessionId, visit.result.fieldSize);
    }
  }
  return out;
};

const useClimbs = (): Climb[] => {
  const rows = useCareerRows();
  const gb3 = useGb3DeepDive();
  const dossier = useMemo(dossierFields, []);
  return useMemo(() => {
    const gb3Fields = new Map<string, number>();
    if (gb3 && gb3 !== 'failed') {
      for (const result of gb3.raceResults) if (result.fieldSize !== null) gb3Fields.set(result.sessionId, result.fieldSize);
    }
    /* The old BestClimbs rule, unchanged. */
    const best = [...rows]
      .filter((row) => row.gain !== null && row.gain > 0)
      .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))
      .slice(0, 5);
    return best
      .filter((row) => row.start !== null)
      .map((row) => {
        const start = row.start as number;
        const finish = row.finish;
        const gain = row.gain as number;
        let field: number | null;
        let fieldFrom: FieldFrom | null;
        if (dossier.has(row.sessionId)) {
          field = dossier.get(row.sessionId)!;
          fieldFrom = 'dossier';
        } else if (gb3Fields.has(row.sessionId)) {
          field = gb3Fields.get(row.sessionId)!;
          fieldFrom = 'gb3';
        } else {
          field = fieldFromPercentile(finish, row.percentile);
          fieldFrom = field !== null ? 'percentile' : null;
        }
        return {
          row,
          start,
          finish,
          gain,
          field,
          fieldFrom,
          depth: Math.max(start, field ?? start),
          place: placeOf(row.trackName),
          shortPlace: shortPlaceOf(row.trackName)
        };
      });
  }, [rows, gb3, dossier]);
};

/* ---------- the clock: one short play when the section enters view ---------- */

const RISE_MS = 1050;
const STAGGER_MS = 90;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const useClock = (play: boolean, reduced: boolean, count: number): number => {
  const total = RISE_MS + STAGGER_MS * Math.max(count - 1, 0);
  const [elapsed, setElapsed] = useState(reduced ? total : 0);
  useEffect(() => {
    if (reduced) {
      setElapsed(total);
      return undefined;
    }
    if (!play) return undefined;
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(now - t0, total);
      setElapsed(t);
      if (t < total) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [play, reduced, total]);
  return elapsed;
};

const progressOf = (elapsed: number, index: number) => ease(Math.min(Math.max((elapsed - index * STAGGER_MS) / RISE_MS, 0), 1));

/* ---------- shared reading ---------- */

const tipWords = (climb: Climb): Omit<VenueTip, 'x' | 'y'> =>
  raceTipOf(climb.row, {
    detail: [finishLine(climb.start, climb.finish, climb.field ?? raceFieldOf(climb.row.sessionId)), `${climb.gain} places gained`].filter(Boolean).join(' · ')
  });

const ariaFor = (climb: Climb) =>
  `${raceTitleOf(climb.row.sessionId, climb.row.raceLabel)}, ${climb.row.seasonYear ?? ''}: from P${climb.start} to P${climb.finish}, ${climb.gain} places${
    climb.field !== null ? `, ${climb.field} classified` : ''
  }. Open the race.`;

/** One climb's hover/tap/keyboard handlers: hover or a first tap reads it, a
 *  click or second tap opens the race. */
const useClimbHandlers = (climbs: Climb[], tap: TapPreview, setFocus: (index: number | null) => void) => {
  const { navigate } = useRouter();
  return (index: number, show: () => void) => {
    const climb = climbs[index];
    const open = () => navigate(raceHref(climb.row.sessionId));
    const read = () => {
      setFocus(index);
      show();
    };
    const handlers = tap.target(climb.row.sessionId, {
      show: read,
      hide: () => setFocus(null),
      open
    });
    return {
      ...handlers,
      role: 'link' as const,
      tabIndex: 0,
      'aria-label': ariaFor(climb),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Enter') open();
      },
      onFocus: read,
      /* A tap on the card's "Open the race" moves focus to it: keep the card for that click. */
      onBlur: (event: FocusEvent) => {
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest(`[${TAP_CARD}]`)) return;
        setFocus(null);
      }
    };
  };
};

const SeriesLine = ({ climb }: { climb: Climb }) => (
  <span className="climbs__meta">
    <span className="climbs__swatch" style={{ background: chapterTint(climb.row.seriesName) }} aria-hidden />
    <span className="climbs__year">{climb.row.seasonYear ?? ''}</span> <span className="climbs__series">{climb.row.seriesShort}</span>
  </span>
);

const Gain = ({ climb, progress }: { climb: Climb; progress: number }) => (
  <span className="climbs__gain">
    <span className="climbs__gain-num">{Math.round(climb.gain * progress)}</span>
    <span className="climbs__gain-unit">{climb.gain === 1 ? 'place' : 'places'}</span>
  </span>
);

const rungStroke = (passed: boolean, beyond: boolean) => ({
  stroke: passed ? 'var(--ink)' : beyond ? 'var(--grey-ink3)' : 'var(--grey-line)',
  strokeOpacity: passed ? 0.8 : 1,
  strokeWidth: passed ? 1.25 : 1,
  strokeDasharray: beyond ? '2 3' : undefined
});

/** Where an SVG sits inside the chart box, for anchoring the tip card. */
const topWithin = (node: Element | null | undefined, box: Element | null): number =>
  node && box ? node.getBoundingClientRect().top - box.getBoundingClientRect().top : 0;

const ticksTo = (depth: number) => [1, 5, 10, 15, 20, 25, 30, 35, 40].filter((tick) => tick <= depth);

/* ---------- version A: five ladders ---------- */

const Ladders = ({ climbs, width, play, clean = false }: { climbs: Climb[]; width: number; play: boolean; clean?: boolean }) => {
  const reduced = useReducedMotion();
  const elapsed = useClock(play, reduced, climbs.length);
  const tap = useTapPreview();
  const [focus, setFocus] = useState<number | null>(null);
  const [tip, setTip] = useState<VenueTip | null>(null);
  const svgRefs = useRef<Array<SVGSVGElement | null>>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const handlersFor = useClimbHandlers(climbs, tap, (index) => {
    setFocus(index);
    if (index === null) setTip(null);
  });

  const narrow = width < 560;
  /* On a phone the ladders carry their own P labels; the axis would only crowd them. */
  const axisW = narrow ? 0 : 44;
  const colW = (width - axisW) / Math.max(climbs.length, 1);
  const maxDepth = Math.max(...climbs.map((climb) => climb.depth));
  const step = narrow ? 10 : Math.min(15, Math.max(12, colW / 16));
  const top = 10;
  const bottom = 10;
  const height = top + (maxDepth - 1) * step + bottom;
  const y = (position: number) => top + (position - 1) * step;
  const rungW = narrow ? Math.min(colW - 52, 20) : Math.min(Math.max(colW * 0.44, 30), 120);

  const showTip = (index: number) => () => {
    const climb = climbs[index];
    const offset = topWithin(svgRefs.current[index], boxRef.current);
    setTip({
      x: axisW + (index + 0.5) * colW,
      y: offset + y(climb.finish) - 8,
      under: offset + y(climb.finish) + 10,
      ...tipWords(climb)
    });
  };

  return (
    <div
      ref={boxRef}
      className="climbs climbs--ladders"
      style={{
        gridTemplateColumns: axisW > 0 ? `${axisW}px repeat(${climbs.length}, minmax(0, 1fr))` : `repeat(${climbs.length}, minmax(0, 1fr))`
      }}
    >
      {climbs.map((climb, index) => (
        <div
          key={`h-${climb.row.sessionId}`}
          className="climbs__head"
          style={{
            gridColumn: index + (axisW > 0 ? 2 : 1),
            gridRow: 1,
            opacity: focus !== null && focus !== index ? focusFade + 0.3 : 1
          }}
          {...handlersFor(index, showTip(index))}
        >
          <Gain climb={climb} progress={progressOf(elapsed, index)} />
          <span className="climbs__place">{narrow ? climb.shortPlace : climb.place}</span>
          <SeriesLine climb={climb} />
        </div>
      ))}
      {axisW > 0 ? (
        <svg className="climbs__axis" width={axisW} height={height} style={{ gridColumn: 1, gridRow: 2 }} aria-hidden>
          {ticksTo(maxDepth).map((tick) => (
            <text
              key={tick}
              x={axisW - (narrow ? 6 : 10)}
              y={y(tick)}
              dy="0.35em"
              textAnchor="end"
              fontFamily={chartFont}
              fontSize={12}
              fill="var(--ink-muted)"
            >
              P{tick}
            </text>
          ))}
        </svg>
      ) : null}
      {climbs.map((climb, index) => {
        const p = progressOf(elapsed, index);
        const cx = colW / 2;
        const left = cx - rungW / 2;
        const right = cx + rungW / 2;
        const field = climb.field ?? climb.depth;
        const dotY = y(climb.start) + (y(climb.finish) - y(climb.start)) * p;
        const faded = focus !== null && focus !== index;
        return (
          <svg
            key={climb.row.sessionId}
            ref={(node) => {
              svgRefs.current[index] = node;
            }}
            className="climbs__ladder"
            width={colW}
            height={height}
            style={{
              gridColumn: index + (axisW > 0 ? 2 : 1),
              gridRow: 2,
              opacity: faded ? focusFade + 0.3 : 1
            }}
            {...handlersFor(index, showTip(index))}
          >
            <rect x={0} y={0} width={colW} height={height} fill="transparent" />
            {clean ? (
              <>
                {/* one hairline the length of the classified field; dotted where he started behind it */}
                <line x1={cx} x2={cx} y1={y(1)} y2={y(field)} stroke="var(--ink)" strokeOpacity={0.28} />
                {climb.start > field ? <line x1={cx} x2={cx} y1={y(field)} y2={y(climb.start)} stroke="var(--grey-ink3)" strokeDasharray="2 3" /> : null}
                {axisW === 0 ? (
                  <text x={cx} y={y(1) - 9} textAnchor="middle" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)" className="climbs__num">
                    P1
                  </text>
                ) : null}
                <rect
                  x={cx - RUN_W / 2}
                  width={RUN_W}
                  y={dotY}
                  height={Math.max(0, y(climb.start) - dotY)}
                  fill={runColour('gained')}
                  opacity={runOpacity('gained')}
                />
                <g transform={`translate(${cx} ${y(climb.start)})`}>
                  <StartRing r={narrow ? 4 : 4.5} />
                </g>
                <g transform={`translate(${cx} ${dotY})`}>
                  <FlagDot kind="gained" r={narrow ? 5 : 6} lit={focus === index} />
                </g>
              </>
            ) : (
              <>
              {/* the rails run the length of the classified field */}
              <line x1={left} x2={left} y1={y(1) - 4} y2={y(field) + 4} stroke="var(--grey-line)" />
              <line x1={right} x2={right} y1={y(1) - 4} y2={y(field) + 4} stroke="var(--grey-line)" />
              {Array.from({ length: climb.depth }, (_, i) => i + 1).map((position) => (
                <line
                  key={position}
                  x1={left}
                  x2={right}
                  y1={y(position)}
                  y2={y(position)}
                  {...rungStroke(position > climb.finish && position < climb.start && dotY < y(position) - 0.5, position > field)}
                />
              ))}
              {/* the climb, grid slot to flag */}
              <line x1={cx} x2={cx} y1={y(climb.start)} y2={dotY} stroke="var(--bryce)" strokeWidth={4} strokeLinecap="round" />
              <circle
                cx={cx}
                cy={y(climb.start)}
                r={narrow ? 4 : 4.5}
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeOpacity={0.6}
                strokeWidth={1.5}
              />
              <circle cx={cx} cy={dotY} r={narrow ? 5.5 : 6.5} fill="var(--bryce)" stroke="var(--ink)" strokeWidth={1.5} />
              </>
            )}
            <text
              x={left - (narrow ? 3 : 5)}
              y={y(climb.start)}
              dy="0.35em"
              textAnchor="end"
              fontFamily={chartFont}
              fontSize={12}
              fill="var(--ink-muted)"
              className="climbs__num"
            >
              P{climb.start}
            </text>
            <text
              x={right + (narrow ? 3 : 5)}
              y={y(climb.finish)}
              dy="0.35em"
              fontFamily={chartFont}
              fontSize={12}
              fontWeight={620}
              fill="var(--ink)"
              opacity={p}
              className="climbs__num"
            >
              P{climb.finish}
            </text>
          </svg>
        );
      })}
      {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
    </div>
  );
};

/* ---------- version B: five rows, the field as a line of grid slots ---------- */

const Rows = ({ climbs, width, play, clean = false }: { climbs: Climb[]; width: number; play: boolean; clean?: boolean }) => {
  const reduced = useReducedMotion();
  const elapsed = useClock(play, reduced, climbs.length);
  const tap = useTapPreview();
  const [focus, setFocus] = useState<number | null>(null);
  const [tip, setTip] = useState<VenueTip | null>(null);
  const svgRefs = useRef<Array<SVGSVGElement | null>>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const handlersFor = useClimbHandlers(climbs, tap, (index) => {
    setFocus(index);
    if (index === null) setTip(null);
  });

  const narrow = width < 720;
  const labelW = narrow ? 0 : Math.round(Math.min(300, Math.max(230, width * 0.22)));
  const stripW = width - labelW;
  const maxDepth = Math.max(...climbs.map((climb) => climb.depth));
  const padL = 18;
  const padR = 18;
  const stepX = (stripW - padL - padR) / Math.max(maxDepth - 1, 1);
  /* Front of the field on the right: he runs forward. */
  const x = (position: number) => stripW - padR - (position - 1) * stepX;
  const stripH = 50;
  const midY = 16;
  const slotH = 18;
  const columns = narrow ? 'minmax(0, 1fr)' : `${labelW}px minmax(0, 1fr)`;

  const showTip = (index: number) => () => {
    const climb = climbs[index];
    const offset = topWithin(svgRefs.current[index], boxRef.current);
    setTip({
      x: labelW + x(climb.finish),
      y: offset + midY - 10,
      under: offset + midY + 12,
      ...tipWords(climb)
    });
  };

  return (
    <div ref={boxRef} className="climbs climbs--rows">
      <div className="climbs__row climbs__row--axis" style={{ gridTemplateColumns: columns }} aria-hidden>
        {narrow ? null : <span />}
        <svg width={stripW} height={18}>
          {ticksTo(maxDepth).map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={12}
              textAnchor="middle"
              fontFamily={chartFont}
              fontSize={12}
              fill="var(--ink-muted)"
              className="climbs__num"
            >
              P{tick}
            </text>
          ))}
        </svg>
      </div>
      {climbs.map((climb, index) => {
        const p = progressOf(elapsed, index);
        const field = climb.field ?? climb.depth;
        const dotX = x(climb.start) + (x(climb.finish) - x(climb.start)) * p;
        const faded = focus !== null && focus !== index;
        return (
          <div
            key={climb.row.sessionId}
            className="climbs__row"
            style={{
              gridTemplateColumns: columns,
              opacity: faded ? focusFade + 0.3 : 1
            }}
            {...handlersFor(index, showTip(index))}
          >
            <div className="climbs__rowhead">
              <Gain climb={climb} progress={p} />
              <span className="climbs__rowname">
                <span className="climbs__place">{climb.place}</span>
                <SeriesLine climb={climb} />
              </span>
            </div>
            <svg
              ref={(node) => {
                svgRefs.current[index] = node;
              }}
              width={stripW}
              height={stripH}
              className="climbs__strip"
            >
              <rect x={0} y={0} width={stripW} height={stripH} fill="transparent" />
              {clean ? (
                <>
                  {/* one hairline the length of the classified field, front on the right; dotted where he started behind it */}
                  <line x1={x(field)} x2={x(1)} y1={midY} y2={midY} stroke="var(--ink)" strokeOpacity={0.28} />
                  {climb.start > field ? <line x1={x(climb.start)} x2={x(field)} y1={midY} y2={midY} stroke="var(--grey-ink3)" strokeDasharray="2 3" /> : null}
                  <line x1={x(1)} x2={x(1)} y1={midY - 4} y2={midY + 4} stroke="var(--ink)" strokeOpacity={0.4} />
                  <rect x={x(climb.start)} width={Math.max(0, dotX - x(climb.start))} y={midY - RUN_W / 2} height={RUN_W} fill={runColour('gained')} opacity={runOpacity('gained')} />
                  <g transform={`translate(${x(climb.start)} ${midY})`}>
                    <StartRing r={4.5} />
                  </g>
                  <g transform={`translate(${dotX} ${midY})`}>
                    <FlagDot kind="gained" r={6} lit={focus === index} />
                  </g>
                </>
              ) : (
                <>
                <line x1={x(field) - 5} x2={x(1) + 5} y1={midY - slotH / 2} y2={midY - slotH / 2} stroke="var(--grey-line)" />
                <line x1={x(field) - 5} x2={x(1) + 5} y1={midY + slotH / 2} y2={midY + slotH / 2} stroke="var(--grey-line)" />
                {Array.from({ length: climb.depth }, (_, i) => i + 1).map((position) => (
                  <line
                    key={position}
                    x1={x(position)}
                    x2={x(position)}
                    y1={midY - slotH / 2}
                    y2={midY + slotH / 2}
                    {...rungStroke(position > climb.finish && position < climb.start && dotX > x(position) + 0.5, position > field)}
                  />
                ))}
                <line x1={x(climb.start)} x2={dotX} y1={midY} y2={midY} stroke="var(--bryce)" strokeWidth={4} strokeLinecap="round" />
                <circle cx={x(climb.start)} cy={midY} r={4.5} fill="var(--paper)" stroke="var(--ink)" strokeOpacity={0.6} strokeWidth={1.5} />
                <circle cx={dotX} cy={midY} r={6.5} fill="var(--bryce)" stroke="var(--ink)" strokeWidth={1.5} />
                </>
              )}
              <text
                x={x(climb.start)}
                y={midY + slotH / 2 + 16}
                textAnchor="middle"
                fontFamily={chartFont}
                fontSize={12}
                fill="var(--ink-muted)"
                className="climbs__num"
              >
                P{climb.start}
              </text>
              <text
                x={x(climb.finish)}
                y={midY + slotH / 2 + 16}
                textAnchor="middle"
                fontFamily={chartFont}
                fontSize={12}
                fontWeight={620}
                fill="var(--ink)"
                opacity={p}
                className="climbs__num"
              >
                P{climb.finish}
              </text>
            </svg>
          </div>
        );
      })}
      {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
    </div>
  );
};

/* ---------- the section ---------- */

const fieldNote = (climbs: Climb[]): string => {
  const parts = climbs.map((climb) => {
    const name = `${climb.place} ${climb.row.seasonYear ?? ''}`.trim();
    if (climb.field === null) return `${name}: no field size in the sources, so its ladder runs only to his grid slot`;
    const from =
      climb.fieldFrom === 'dossier'
        ? 'from the official INDY NXT result'
        : climb.fieldFrom === 'gb3'
          ? 'from the official 2021 GB3 classification (TSL PDFs)'
          : `read back from the share of the field it beat (P${climb.finish} at ${climb.row.percentile}, which only a ${climb.field}-car classification gives)`;
    const behind =
      climb.start > climb.field
        ? `; he started P${climb.start}, behind the classified field, so the dotted rungs are grid slots below it`
        : '';
    return `${name}: ${climb.field} classified, ${from}${behind}`;
  });
  return `Each ladder is as long as that race's classified field, the cars that share counts. ${parts.join('. ')}.`;
};

export const ClimbsDeepDive = () => {
  const climbs = useClimbs();
  const rows = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const asked = switchValue('ddclimbs');
  const version = asked === 'rise' ? 'rise' : asked === 'old' ? 'ladders' : asked === 'rows' ? 'rows' : 'runs';
  if (climbs.length === 0) return null;
  const top = climbs[0];
  const withStart = rows.filter((row) => row.start !== null && row.gain !== null).length;

  return (
    <DeepDive
      className="dd--climbs"
      venues={() => venuesOf(climbs.map((climb) => climb.row))}
      figure={top.gain}
      unit="places in one race"
      lede={
        <>
          From{' '}
          <strong>
            P{top.start} to P{top.finish}
          </strong>{' '}
          at {raceTitleOf(top.row.sessionId, top.row.raceLabel)}, {top.row.seasonYear}. His five biggest climbs, each drawn to the length of the field he raced.
        </>
      }
      sources={
        <SourcePill
          title="Biggest climbs"
          entries={[
            {
              label: 'Career result rows',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: `Grid slot, finish and places gained per race; ${withStart} of the ${rows.length} races with a sourced result carry both a grid slot and a finish. The five are the largest positive gains, ties in race-date order, as in the old table. A climb is the net change from grid slot to flag, not a count of passes: the inked rungs are the places between, not named cars.`
            },
            {
              label: 'Field sizes',
              path: 'data/career/career.dataset.json (INDY NXT) · analysis/gb3-deep-dive/output/context-packs/gb3-deep-dive-context.json (GB3)',
              note: fieldNote(climbs)
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
      foot={
        <>
          <span className="climbs__key climbs__key--start" aria-hidden /> grid slot{' '}
          <span className="climbs__key climbs__key--finish" aria-hidden /> finish · <PointerOpen what="a climb" then="to open its race" />
        </>
      }
    >
      <div
        ref={(node) => {
          ref.current = node;
          viewRef.current = node;
        }}
        className="climbs__stage"
      >
        {width > 0 ? (
          version === 'runs' || version === 'rows' ? (
            <Rows climbs={climbs} width={width} play={inView} clean={version === 'runs'} />
          ) : (
            <Ladders climbs={climbs} width={width} play={inView} clean={version === 'rise'} />
          )
        ) : null}
      </div>
    </DeepDive>
  );
};
