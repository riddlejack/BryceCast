import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/* House chart wrappers — mark specs enforced once (dataviz method):
 * 2px lines, recessive grid, tabular tick labels, tooltip always on,
 * Bryce data always and only in Bryce gold. */

const axisTick = { fill: 'var(--ink-muted)', fontSize: 10.5, fontFamily: '-apple-system, system-ui, sans-serif' } as const;

/* ---------- house tokens for hand-rolled SVG charts ---------- */

export const chartFont = '-apple-system, system-ui, sans-serif';
/** Quiet connector/context ink for marks that support, not carry, the story. */
export const inkConnector = 'rgba(29, 29, 31, 0.32)';
/** Opacity for de-focused rows/lines while a sibling is hovered. */
export const focusFade = 0.22;

const lerpChannel = (from: number, to: number, t: number) => Math.round(from + (to - from) * t);
const lerpHex = (from: string, to: string, t: number): string => {
  const [r1, g1, b1] = [1, 3, 5].map((index) => parseInt(from.slice(index, index + 2), 16));
  const [r2, g2, b2] = [1, 3, 5].map((index) => parseInt(to.slice(index, index + 2), 16));
  return `rgb(${lerpChannel(r1, r2, t)}, ${lerpChannel(g1, g2, t)}, ${lerpChannel(b1, b2, t)})`;
};

/** The house diverging ramp (dataviz method): deep ink ↔ neutral ↔ Bryce gold.
 *  ONE meaning per use, keyed in a caption — deeper gold = stronger, deeper ink
 *  = tougher. Never red-to-green (red is reserved for status-down). Mirrors the
 *  rivals `recordColor()`; shared here so the heat map and the rivals swarm read
 *  as one scale. `t` in [0,1] (e.g. a percentile of the field beaten). */
export const inkGoldDiverging = (t: number): string => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? lerpHex('#3a3a3f', '#c6c6cb', clamped * 2)
    : lerpHex('#c6c6cb', '#e09a2f', (clamped - 0.5) * 2);
};

/** Measure a container so SVG charts render in pixel space (crisp text at any
 *  size). Returns [ref, width]. */
export const useMeasuredWidth = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((previous) => (Math.abs(previous - next) > 0.5 ? next : previous));
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/** True once the element has entered the viewport — for one-time chart
 *  assembly moments (a line drawing in, dots settling into place). */
export const useInViewOnce = <T extends Element>(threshold = 0.2) => {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
};

/** True when the viewer (or a static/QA capture) asks for reduced motion. Charts
 *  that gate their MARKS behind an in-view entrance animation must OR this in, so
 *  the final, fully-rendered state is the fallback — otherwise a reduced-motion
 *  reader or a headless screenshot sees an empty plot (the rivals-swarm bug). */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
};

/** True when the primary input can't hover — a touch screen. Chart captions that
 *  instruct an interaction must swap "Hover" for "Tap" on these devices; hover is
 *  simply unavailable, so the copy would otherwise ask for a gesture that can't
 *  happen. Defaults to hover-capable so desktop and static QA captures read
 *  "Hover" unless the device explicitly reports a coarse, hoverless pointer. */
export const useCoarsePointer = (): boolean => {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(hover: none) and (pointer: coarse)');
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return coarse;
};

/* ---------- house hover tooltip (white card, no delay, mark-anchored) ---------- */

export interface ChartTip {
  x: number;
  y: number;
  title: string;
  detail?: string | null;
  action?: string | null;
}

export const ChartTipCard = ({ tip, width }: { tip: ChartTip; width: number }) => (
  <div
    style={{
      position: 'absolute',
      left: Math.min(Math.max(tip.x, 90), Math.max(width - 90, 90)),
      top: tip.y,
      transform: 'translate(-50%, calc(-100% - 10px))',
      background: 'var(--surface-0)',
      border: '1px solid var(--divider)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 12,
      lineHeight: 1.45,
      whiteSpace: 'nowrap',
      boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
      pointerEvents: 'none',
      zIndex: 5,
      fontVariantNumeric: 'tabular-nums'
    }}
  >
    <strong>{tip.title}</strong>
    {tip.detail ? <span style={{ color: 'var(--ink-secondary)' }}> · {tip.detail}</span> : null}
    {tip.action ? <div style={{ color: 'var(--link)', fontSize: 11.5 }}>{tip.action}</div> : null}
  </div>
);

export interface LapPoint {
  lap: number;
  rank: number;
  flag?: string | null;
}

const LapTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: LapPoint }> }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        background: 'var(--surface-0)',
        border: '1px solid var(--divider)',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 6px 20px rgba(0,0,0,0.10)'
      }}
    >
      <strong>Lap {point.lap}</strong> · P{point.rank}
      {point.flag && point.flag !== 'GREEN' ? <span style={{ color: 'var(--ink-secondary)' }}> · {point.flag.toLowerCase()}</span> : null}
    </div>
  );
};

/** Bryce position by lap. Inverted Y (P1 on top). Single series — no legend. */
export const LapStoryChart = ({ points, height = 190 }: { points: LapPoint[]; height?: number }) => {
  if (points.length < 2) return null;
  const ranks = points.map((point) => point.rank);
  const worst = Math.max(...ranks);
  const best = Math.min(...ranks);
  /* Frame Bryce's actual range (with breathing room), not P1..field —
   * a P14–P16 battle should read as movement, not a flat floor. */
  const yMin = Math.max(1, best - 2);
  const yMax = Math.min(Math.max(worst + 2, yMin + 4), 30);
  const lastLap = points[points.length - 1].lap;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 2, left: -18 }}>
        <CartesianGrid stroke="var(--grid-hairline)" vertical={false} />
        <XAxis
          dataKey="lap"
          type="number"
          domain={[0, Math.max(lastLap, 2)]}
          tickCount={Math.min(8, Math.max(lastLap, 2) + 1)}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: 'var(--axis-baseline)' }}
          allowDecimals={false}
        />
        <YAxis
          reversed
          domain={[yMin, yMax]}
          tick={axisTick}
          tickFormatter={(value: number) => `P${value}`}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tickCount={5}
        />
        <Tooltip content={<LapTooltip />} cursor={{ stroke: 'var(--axis-baseline)', strokeDasharray: '3 3' }} />
        <Line
          type="stepAfter"
          dataKey="rank"
          stroke="var(--ink-primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4.5, fill: 'var(--bryce)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* Start → finish slope for race debriefs. Two points, one driver: gold. */
export const SlopeChart = ({ start, finish, height = 150 }: { start: number; finish: number; height?: number }) => {
  const points = [
    { stage: 0, rank: start },
    { stage: 1, rank: finish }
  ];
  const worst = Math.max(start, finish);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 14, right: 46, bottom: 4, left: 46 }}>
        <XAxis
          dataKey="stage"
          type="number"
          domain={[0, 1]}
          ticks={[0, 1]}
          tickFormatter={(value: number) => (value === 0 ? 'Start' : 'Finish')}
          tick={{ ...axisTick, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--axis-baseline)' }}
        />
        <YAxis reversed domain={[1, Math.min(worst + 2, 30)]} hide />
        <Line
          type="linear"
          dataKey="rank"
          stroke="var(--axis-baseline)"
          strokeWidth={2.5}
          isAnimationActive={false}
          dot={{ r: 5, fill: 'var(--bryce)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
          label={(props: { x?: number | string; y?: number | string; index?: number }) => {
            const index = props.index ?? 0;
            return (
              <text
                x={Number(props.x ?? 0)}
                y={Number(props.y ?? 0)}
                dx={index === 0 ? -12 : 12}
                dy={4}
                textAnchor={index === 0 ? 'end' : 'start'}
                style={{
                  fill: 'var(--ink-primary)',
                  fontFamily: '-apple-system, system-ui, sans-serif',
                  fontWeight: 650,
                  fontSize: 16,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {`P${points[index].rank}`}
              </text>
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
