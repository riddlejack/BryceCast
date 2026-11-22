import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReplaySession } from '../app/useReplaySession';
import { periodAt, type ReplayTimeline } from '../data/replayTimeline';
import { lapPositionAt, timeAtLapPosition, type RaceClockModel } from './liveMarker';
import type { VirtualNow } from './liveTrack';
import { readingWords, type BryceMove, type BryceMoves } from '../data/overtakeModel';

/* ============================================================
   The race bar (round 7): the whole race under the replay's
   controls. Every lap a tick, the cautions shaded, Bryce's
   running position drawn up to the playhead, a playhead to drag,
   a readout on hover, click to jump.
   ============================================================ */

/** Laps on the bar, by Bryce's own line crossings (seeking to lap N lands
 *  where he starts lap N), or plain race time when the race cannot place him. */
export interface LapAxis {
  basis: 'laps' | 'time';
  /** Laps in the race (basis `laps`), or minutes (basis `time`). */
  total: number;
  /** Bar position (0..total) of a moment. */
  posAt: (atMs: number) => number | null;
  /** The moment at a bar position. */
  timeAt: (pos: number) => number | null;
  /** The race start: before it the bar sits at 0. */
  startMs: number;
}

export const lapAxisFor = ({
  model,
  totalLaps,
  startMs,
  endMs
}: {
  model: RaceClockModel | null;
  totalLaps: number | null;
  startMs: number | null;
  endMs: number | null;
}): LapAxis | null => {
  if (startMs === null || endMs === null || !(endMs > startMs)) return null;
  if (model && totalLaps && totalLaps > 0 && timeAtLapPosition(model, 0, totalLaps) !== null) {
    const linear = (atMs: number) => Math.max(0, Math.min(totalLaps, ((atMs - startMs) / (endMs - startMs)) * totalLaps));
    return {
      basis: 'laps',
      total: totalLaps,
      // A lap the model cannot place (no base yet) falls back to race time.
      posAt: (atMs) => (atMs < startMs ? 0 : lapPositionAt(model, atMs, totalLaps) ?? linear(atMs)),
      timeAt: (pos) => timeAtLapPosition(model, pos, totalLaps) ?? startMs + (Math.max(0, Math.min(totalLaps, pos)) / totalLaps) * (endMs - startMs),
      startMs
    };
  }
  const minutes = (endMs - startMs) / 60_000;
  return {
    basis: 'time',
    total: minutes,
    posAt: (atMs) => Math.max(0, Math.min(minutes, (atMs - startMs) / 60_000)),
    timeAt: (pos) => startMs + Math.max(0, Math.min(minutes, pos)) * 60_000,
    startMs
  };
};

/** Where ←/→ go: the start of the next lap, or of the previous one (Shift: five). */
export const lapStepTarget = (axis: LapAxis, nowMs: number, laps: number): number | null => {
  const pos = axis.posAt(nowMs);
  if (pos === null) return null;
  // From lap 13 (position 12.x): → is lap 14's start (13), ← lap 12's (11).
  const current = Math.floor(pos + 1e-6);
  const last = axis.basis === 'laps' ? axis.total - 1 : axis.total;
  return axis.timeAt(Math.max(0, Math.min(last, current + laps)));
};

const flagWordsAt = (timeline: ReplayTimeline | null, axis: LapAxis, atMs: number): string => {
  if (atMs < axis.startMs) return 'before the start';
  const period = periodAt(timeline, atMs);
  if (period) return period.kind === 'red' ? 'red flag' : 'caution';
  if (timeline?.checkeredMs && atMs >= timeline.checkeredMs) return 'finished';
  return 'green';
};

const positionAt = (timeline: ReplayTimeline | null, atMs: number): number | null => {
  let rank: number | null = null;
  for (const frame of timeline?.frames ?? []) {
    if (frame.atMs > atMs) break;
    if (frame.bryceRank !== null) rank = frame.bryceRank;
  }
  return rank;
};

const readoutAt = (timeline: ReplayTimeline | null, axis: LapAxis, pos: number): string => {
  const atMs = axis.timeAt(pos);
  if (atMs === null) return '';
  const where =
    axis.basis === 'laps'
      ? `Lap ${Math.min(axis.total, Math.floor(pos) + 1)}`
      : `${Math.floor(pos)} min in`;
  const rank = atMs >= axis.startMs ? positionAt(timeline, atMs) : null;
  return [where, flagWordsAt(timeline, axis, atMs), rank !== null ? `P${rank}` : null].filter(Boolean).join(' · ');
};

/** What the replay's clock says now, shared by the header and the bar so
 *  the two never disagree, not even while a seek is settling (the clock
 *  moves at once; the archived frame follows). */
export interface ReplayNow {
  atMs: number;
  /** Bar position of the moment (0 before the green). */
  pos: number;
  /** Before the green flag: the formation. */
  beforeGreen: boolean;
  /** His lap by his own line crossings (bar basis `laps`), else null. */
  lap: number | null;
  /** The flag by the race timeline, or null when it is not read yet. */
  flag: 'green' | 'caution' | 'red' | 'finished' | null;
}

const nowAt = (timeline: ReplayTimeline | null, axis: LapAxis, atMs: number): ReplayNow | null => {
  const pos = axis.posAt(atMs);
  if (pos === null) return null;
  const beforeGreen = atMs < axis.startMs;
  const lap = axis.basis === 'laps' && !beforeGreen ? Math.min(axis.total, Math.floor(pos) + 1) : null;
  let flag: ReplayNow['flag'] = null;
  if (!beforeGreen && timeline) {
    const words = flagWordsAt(timeline, axis, atMs);
    flag = words === 'red flag' ? 'red' : words === 'caution' ? 'caution' : words === 'finished' ? 'finished' : 'green';
  }
  return { atMs, pos, beforeGreen, lap, flag };
};

/** The clock's facts, re-rendered when any of them (or the bar position, to
 *  a twentieth of a lap) changes. One loop for the whole desk. */
export const useReplayNow = (axis: LapAxis | null, timeline: ReplayTimeline | null, virtualNow: VirtualNow): ReplayNow | null => {
  const [now, setNow] = useState<ReplayNow | null>(null);
  useEffect(() => {
    if (!axis) {
      setNow(null);
      return undefined;
    }
    let frame = 0;
    let shown = '';
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const atMs = virtualNow();
      const next = atMs === null ? null : nowAt(timeline, axis, atMs);
      const key = next ? `${Math.round(next.pos * 20)}|${next.beforeGreen}|${next.lap}|${next.flag}` : 'none';
      if (key !== shown) {
        shown = key;
        setNow(next);
      }
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [axis, timeline, virtualNow]);
  return now;
};

const HEIGHT = 58;
/** Pointing this close to a change in his place reads it; clicking it starts
 *  this long before it. */
const MARK_REACH_PX = 7;
const MARK_LEAD_MS = 6_000;
const TRACE_TOP = 6;
const TRACE_BOTTOM = 34;
const TICK_Y = 38;
const LABEL_Y = 53;
const PAD_X = 10;

export const RaceBar = ({
  replay,
  axis,
  timeline,
  virtualNow,
  now,
  place,
  moves = null,
  onSeek
}: {
  replay: ReplaySession;
  axis: LapAxis;
  timeline: ReplayTimeline | null;
  virtualNow: VirtualNow;
  /** The desk's shared clock readout (the header reads the same one). */
  now: ReplayNow | null;
  /** His place now, from the same frame the page's header and running
   *  order show (null while that frame is still on its way). Given, the bar's
   *  own readout of now uses it, so the two can never disagree; the trace and
   *  a pointed-at moment read the race timeline. */
  place?: number | null;
  /** His place changes (round 10): each pass a small mark on his trace, and
   *  pointing at any change says what it was. */
  moves?: BryceMoves | null;
  /** Commit a jump to this moment. */
  onSeek: (atMs: number) => void;
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const inner = Math.max(1, width - PAD_X * 2);
  const xOf = useCallback((pos: number) => PAD_X + (Math.max(0, Math.min(axis.total, pos)) / axis.total) * inner, [axis.total, inner]);
  const posOfX = useCallback((x: number) => Math.max(0, Math.min(axis.total, ((x - PAD_X) / inner) * axis.total)), [axis.total, inner]);

  const drawing = useMemo(() => {
    if (width <= 0) return null;
    const ticks: Array<{ x: number; label: string | null }> = [];
    const whole = Math.floor(axis.total);
    const labelEvery = axis.basis === 'laps' ? (axis.total > 60 ? 10 : 5) : 10;
    for (let index = 0; index <= whole; index += 1) {
      // Lap N runs from tick N-1 to tick N; its number sits under its middle.
      const lap = index + 1;
      const label =
        axis.basis === 'laps'
          ? index < axis.total && (lap === 1 || lap % labelEvery === 0)
            ? String(lap)
            : null
          : index % labelEvery === 0
            ? `${index}′`
            : null;
      ticks.push({ x: xOf(index), label });
    }
    const shades = (timeline?.periods ?? [])
      .map((period) => {
        const from = axis.posAt(period.fromMs);
        const to = axis.posAt(period.toMs ?? timeline?.checkeredMs ?? Infinity) ?? axis.total;
        if (from === null) return null;
        const x0 = xOf(from);
        const x1 = Math.max(x0 + 2, xOf(to));
        return { kind: period.kind, x: x0, w: x1 - x0, key: `${period.fromMs}` };
      })
      .filter((shade): shade is NonNullable<typeof shade> => shade !== null);
    const ranks = (timeline?.frames ?? []).filter((frame) => frame.bryceRank !== null && frame.atMs >= axis.startMs);
    const field = Math.max(2, ...ranks.map((frame) => frame.bryceRank ?? 1));
    const yOf = (rank: number) => TRACE_TOP + ((rank - 1) / Math.max(1, field - 1)) * (TRACE_BOTTOM - TRACE_TOP);
    let trace = '';
    let lastY: number | null = null;
    for (const frame of ranks) {
      const pos = axis.posAt(frame.atMs);
      if (pos === null) continue;
      const x = xOf(pos);
      const y = yOf(frame.bryceRank!);
      trace += lastY === null ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` H${x.toFixed(1)} V${y.toFixed(1)}`;
      lastY = y;
    }
    if (lastY !== null) trace += ` H${xOf(axis.total).toFixed(1)}`;
    // One mark per reading and direction: up for passes he made, down for
    // passes on him, at the place he held after it.
    const said = (moves?.moves ?? []).filter((move) => move.cause !== 'unconfirmed' && move.cause !== 'pending');
    const readings = new Map<number, BryceMove[]>();
    for (const move of said) readings.set(move.atMs, [...(readings.get(move.atMs) ?? []), move]);
    const marks: Array<{ key: string; kind: 'made' | 'lost'; x: number; y: number; atMs: number }> = [];
    const points: Array<{ x: number; atMs: number; words: string }> = [];
    for (const [atMs, reading] of readings) {
      const pos = axis.posAt(atMs);
      if (pos === null || atMs < axis.startMs) continue;
      const x = xOf(pos);
      const words = readingWords(reading, { glyph: false });
      if (words) points.push({ x, atMs, words: words.text });
      for (const kind of ['made', 'lost'] as const) {
        const passes = reading.filter((move) => move.cause === 'pass' && move.kind === kind);
        if (passes.length > 0) marks.push({ key: `${atMs}-${kind}`, kind, x, y: yOf(passes[0].place), atMs });
      }
    }
    return { ticks, shades, trace, field, marks, points };
  }, [width, axis, timeline, xOf, moves]);

  // The playhead and the trace's reveal move every frame, off React.
  const headRef = useRef<SVGGElement | null>(null);
  const clipRef = useRef<SVGRectElement | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  dragRef.current = dragPos;
  const nowPos = now?.pos ?? 0;
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = virtualNow();
      const pos = now === null ? null : axis.posAt(now);
      if (pos === null) return;
      const shownPos = dragRef.current ?? pos;
      const x = xOf(shownPos);
      headRef.current?.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      clipRef.current?.setAttribute('width', Math.max(0, xOf(pos) - PAD_X + 0.5).toFixed(1));
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [axis, virtualNow, xOf]);

  const pointerX = (event: React.PointerEvent) => event.clientX - (boxRef.current?.getBoundingClientRect().left ?? 0);
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPos(posOfX(pointerX(event)));
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pos = posOfX(pointerX(event));
    if (dragRef.current !== null) setDragPos(pos);
    else setHoverPos(pos);
  };
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current === null) return;
    const x = pointerX(event);
    const pos = posOfX(x);
    setDragPos(null);
    setHoverPos(null);
    // A click on a change in his place starts a few seconds before it, so it
    // plays out; anywhere else jumps to the moment under the pointer.
    const near = nearPoint(x);
    const atMs = near ? Math.max(axis.startMs, near.atMs - MARK_LEAD_MS) : axis.timeAt(pos);
    if (atMs !== null) onSeek(atMs);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onPointerCancel = () => setDragPos(null);

  const nowMs = virtualNow();
  const period = nowMs !== null ? periodAt(timeline, nowMs) : null;
  // "Skip the caution": under a caution whose restart the timeline knows.
  const skipTo = period && period.toMs !== null && nowMs !== null && nowMs < period.toMs - 1_000 ? period.toMs : null;
  const readPos = dragPos ?? hoverPos;
  // Pointing within a few pixels of a change in his place: what it was.
  const nearPoint = (x: number) =>
    drawing?.points.reduce<{ x: number; atMs: number; words: string } | null>(
      (best, point) => (Math.abs(point.x - x) <= MARK_REACH_PX && (!best || Math.abs(point.x - x) < Math.abs(best.x - x)) ? point : best),
      null
    ) ?? null;
  const pointed = readPos !== null ? nearPoint(xOf(readPos)) : null;
  const readout =
    readPos !== null
      ? [readoutAt(timeline, axis, pointed ? axis.posAt(pointed.atMs) ?? readPos : readPos), pointed?.words].filter(Boolean).join(' · ')
      : now?.beforeGreen
        ? 'Formation lap · before the green'
        : now
          ? [
              axis.basis === 'laps' ? `Lap ${now.lap}` : `${Math.floor(now.pos)} min in`,
              now.flag === 'red' ? 'red flag' : now.flag ?? flagWordsAt(timeline, axis, now.atMs),
              (() => {
                const rank = place !== undefined ? place : positionAt(timeline, now.atMs);
                return rank !== null ? `P${rank}` : null;
              })()
            ]
              .filter(Boolean)
              .join(' · ')
          : '';
  const nowLap = now?.beforeGreen ? 0 : axis.basis === 'laps' ? Math.min(axis.total, Math.floor(nowPos) + 1) : Math.floor(nowPos);
  return (
    <section className="race-bar" aria-label="The whole race" data-race-bar={axis.basis} data-race-bar-lap={nowLap} data-race-bar-dragging={dragPos !== null ? 'true' : 'false'}>
      <div className="race-bar__head">
        <span className={`race-bar__readout${readPos !== null ? ' is-pointing' : ''}`} aria-live="off" data-race-bar-readout>
          {readout}
        </span>
        <span className="race-bar__keys caption caption--secondary">
          {axis.basis === 'laps' ? '← → a lap · Shift five · Space pauses' : 'Space pauses'}
        </span>
        {skipTo !== null ? (
          <button type="button" className="replay-bar__btn race-bar__skip" data-race-bar-skip onClick={() => onSeek(skipTo)}>
            Skip the {period?.kind === 'red' ? 'red flag' : 'caution'}
          </button>
        ) : null}
      </div>
      <div
        ref={boxRef}
        className="race-bar__track"
        role="slider"
        tabIndex={-1}
        aria-label={axis.basis === 'laps' ? 'Race laps' : 'Race time'}
        aria-valuemin={0}
        aria-valuemax={Math.round(axis.total)}
        aria-valuenow={nowLap}
        aria-valuetext={readoutAt(timeline, axis, nowPos)}
      >
        {drawing ? (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="race-bar__svg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={() => setHoverPos(null)}
          >
            <defs>
              <clipPath id="race-bar-played">
                <rect ref={clipRef} x={PAD_X} y={0} width={0} height={HEIGHT} />
              </clipPath>
            </defs>
            <rect x={PAD_X} y={TRACE_TOP - 3} width={inner} height={TRACE_BOTTOM - TRACE_TOP + 6} className="race-bar__ground" />
            {drawing.shades.map((shade) => (
              <rect key={shade.key} x={shade.x} y={TRACE_TOP - 3} width={shade.w} height={TICK_Y - TRACE_TOP + 3} className={`race-bar__shade race-bar__shade--${shade.kind}`} />
            ))}
            {drawing.ticks.map((tick, index) => (
              <g key={index}>
                <line x1={tick.x} x2={tick.x} y1={TICK_Y - (tick.label ? 5 : 3)} y2={TICK_Y + 1} className="race-bar__tick" />
                {tick.label ? (
                  <text x={axis.basis === 'laps' ? xOf(index + 0.5) : tick.x} y={LABEL_Y} textAnchor="middle" className="race-bar__label">
                    {tick.label}
                  </text>
                ) : null}
              </g>
            ))}
            <line x1={PAD_X} x2={PAD_X + inner} y1={TICK_Y + 1} y2={TICK_Y + 1} className="race-bar__axis" />
            {drawing.trace ? <path d={drawing.trace} className="race-bar__trace" clipPath="url(#race-bar-played)" /> : null}
            <g clipPath="url(#race-bar-played)" data-race-bar-passes={drawing.marks.length}>
              {drawing.marks.map((mark) => (
                <path
                  key={mark.key}
                  d={
                    mark.kind === 'made'
                      ? `M${mark.x.toFixed(1)} ${Math.max(0.5, mark.y - 9).toFixed(1)} l4.2 6.4 h-8.4 Z`
                      : `M${mark.x.toFixed(1)} ${(mark.y + 9).toFixed(1)} l4.2 -6.4 h-8.4 Z`
                  }
                  className={`race-bar__pass race-bar__pass--${mark.kind}`}
                />
              ))}
            </g>
            {hoverPos !== null && dragPos === null ? (
              <line x1={xOf(hoverPos)} x2={xOf(hoverPos)} y1={TRACE_TOP - 3} y2={TICK_Y + 1} className="race-bar__hover" />
            ) : null}
            <g ref={headRef} className="race-bar__head-mark">
              <line x1={0} x2={0} y1={TRACE_TOP - 5} y2={TICK_Y + 3} className="race-bar__playhead" />
              <circle cx={0} cy={TICK_Y + 1} r={5.5} className="race-bar__knob" />
            </g>
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
      </div>
    </section>
  );
};
