import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/* House chart wrappers — mark specs enforced once (dataviz method):
 * 2px lines, recessive grid, tabular tick labels, tooltip always on,
 * Bryce data always and only in Bryce gold. */

const axisTick = { fill: 'var(--ink-muted)', fontSize: 10.5, fontFamily: 'Inter, system-ui, sans-serif' } as const;

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
        background: 'var(--surface-3)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)'
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
        <Tooltip content={<LapTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }} />
        <Line
          type="stepAfter"
          dataKey="rank"
          stroke="var(--bryce)"
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
          stroke="var(--bryce)"
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
                  fontFamily: 'Archivo, system-ui, sans-serif',
                  fontWeight: 750,
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
