/** The 24 hours, in depth — the Daytona chapter's stint timeline and the
 *  car-85 co-driver roster, one tap down.
 *
 *  Two honest, descriptive stories: WHEN through the twenty-four hours Bryce was
 *  in the car (his ten stints across the race's laps), and WHO shared the No. 85
 *  with him. Co-drivers appear by name with contribution facts only — laps,
 *  stints, share of the car — never a pace verdict between drivers (per-driver
 *  pace stays out; the four's closeness is stated collectively). No running-order
 *  trace, no strategy root cause, no forecast — the pack holds none of those. */

import { useMemo, useState } from 'react';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { Plate } from '../app/components';
import {
  useImsaDaytonaStint,
  type ImsaDaytonaStintPack,
  type ImsaStint
} from '../data/imsaDaytonaStint';

const secs = (value: number | null): string => (value === null ? '—' : `${value.toFixed(1)}s`);

/* ---------- 1 · The stint timeline: his 24 hours ---------- */

const StintTimeline = ({ pack }: { pack: ImsaDaytonaStintPack }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const totalLaps = pack.car85Result.lapsCompleted ?? 780;
  const stints = useMemo(() => [...pack.bryceStintContext].sort((a, b) => a.startLap - b.startLap), [pack]);
  const bryceLaps = stints.reduce((sum, stint) => sum + stint.lapCount, 0);

  /* The axis is RACE DISTANCE (laps), not a clock: lap number maps precisely to
   * x, and the sourced hour-of-race for each stint lives in its tooltip. An
   * earlier version labeled this axis 0–24h from lap number, which assumes a
   * constant lap rate — false under cautions and pit cycles, and the pack's own
   * integer session hours are too coarse to place stints (four fall in hour 12).
   * So the axis is honest distance; the time story stays in the copy and tips. */
  const height = 84;
  const top = 26;
  const barH = 16;
  const gutterL = 4;
  const gutterR = 4;
  const plotL = gutterL;
  const plotR = Math.max(width - gutterR, plotL + 60);
  const x = (lap: number) => plotL + (lap / totalLaps) * (plotR - plotL);
  const distanceTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(fraction * totalLaps));

  const tipFor = (stint: ImsaStint): ChartTip => {
    const mid = (x(stint.startLap) + x(stint.endLap)) / 2;
    const clean = stint.medianValidNonPitLapSeconds !== null ? ` · ${secs(stint.medianValidNonPitLapSeconds)} typical lap` : '';
    return {
      x: mid,
      y: top - 6,
      title: `Stint ${stint.driverStintIndex} · hour ${stint.startSessionHour}`,
      detail: `laps ${stint.startLap}–${stint.endLap} · ${stint.lapCount} laps${clean}`
    };
  };

  return (
    <div>
      <h3 className="display" style={{ fontSize: 15, margin: '0 0 2px' }}>
        His twenty-four hours
      </h3>
      <p className="imsa-copy">
        Bryce drove <strong>{bryceLaps}</strong> of the car’s <strong>{totalLaps}</strong> laps across{' '}
        <strong>{stints.length}</strong> stints — in the evening, through the small hours, and again at dawn.
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label="Where in the race distance Bryce was in the No. 85 car, across the car's completed laps">
            {/* the full race as a quiet track */}
            <rect x={plotL} y={top} width={plotR - plotL} height={barH} rx={5} fill="var(--surface-1)" />
            {/* race-distance ticks */}
            {distanceTicks.map((lap, index) => {
              const lx = x(lap);
              return (
                <g key={lap}>
                  <line x1={lx} x2={lx} y1={top - 5} y2={top + barH + 5} stroke="var(--grid-hairline)" strokeWidth={1} />
                  <text x={lx} y={top + barH + 18} textAnchor={index === 0 ? 'start' : index === distanceTicks.length - 1 ? 'end' : 'middle'} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10}>
                    {index === 0 ? 'start' : index === distanceTicks.length - 1 ? `${lap} laps` : `lap ${lap}`}
                  </text>
                </g>
              );
            })}
            {/* his stints */}
            {stints.map((stint) => {
              const sx = x(stint.startLap);
              const ex = x(stint.endLap);
              const w = Math.max(ex - sx, 2.5);
              const focused = hovered === null || hovered === stint.stintId;
              return (
                <rect
                  key={stint.stintId}
                  x={sx}
                  y={top}
                  width={w}
                  height={barH}
                  rx={3}
                  fill="var(--chapter-imsa)"
                  fillOpacity={focused ? 0.9 : 0.35}
                  style={{ cursor: 'pointer', transition: 'fill-opacity 150ms ease' }}
                  onMouseEnter={() => {
                    setHovered(stint.stintId);
                    setTip(tipFor(stint));
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                    setTip(null);
                  }}
                />
              );
            })}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      <p className="imsa-caption">
        Each blue block is one of his stints, placed by race distance across the car’s {totalLaps} laps; the gaps are his
        co-drivers at the wheel. Stint boundaries come from pit in/out laps on the official time card. Hover a stint for its hour
        of the race, laps, and typical green pace.
      </p>
    </div>
  );
};

/* ---------- 2 · Who shared the No. 85 ---------- */

const CoDriverRoster = ({ pack }: { pack: ImsaDaytonaStintPack }) => {
  const drivers = useMemo(
    () => [...pack.car85CodriverPace].sort((a, b) => b.lapShareOfCar85 - a.lapShareOfCar85),
    [pack]
  );
  if (drivers.length === 0) return null;
  const maxShare = Math.max(...drivers.map((driver) => driver.lapShareOfCar85));
  /* Collective closeness, stated once — never a per-driver pace ranking. */
  const best20s = drivers.map((driver) => driver.best20LapAverageSeconds).filter((value): value is number => value !== null);
  const spread = best20s.length > 1 ? Math.max(...best20s) - Math.min(...best20s) : null;

  return (
    <div>
      <h3 className="display" style={{ fontSize: 15, margin: '0 0 2px' }}>
        Who shared the No. 85
      </h3>
      <p className="imsa-copy">
        Four drivers took turns in the Porsche 963 through the night. The share is each driver’s portion of the car’s laps.
      </p>
      <div className="imsa-roster">
        {drivers.map((driver) => {
          const isBryce = driver.role === 'Bryce';
          const pct = Math.round(driver.lapShareOfCar85 * 100);
          return (
            <div key={driver.driverName} className={`imsa-roster__row${isBryce ? ' imsa-roster__row--bryce' : ''}`}>
              <span className="imsa-roster__name">
                {isBryce ? <Plate size="row" /> : null}
                {driver.driverName}
                <span className="tnum">{driver.stintCount} stints</span>
              </span>
              <span className="imsa-roster__track" aria-hidden>
                <span className="imsa-roster__fill" style={{ width: `${Math.max(8, Math.round((driver.lapShareOfCar85 / maxShare) * 100))}%` }} />
              </span>
              <span className="imsa-roster__meta">
                {driver.lapCount} laps · {pct}%
              </span>
            </div>
          );
        })}
      </div>
      <p className="imsa-caption">
        Laps and stints from the official time card. Bryce took the No. 85 for {drivers.find((d) => d.role === 'Bryce')?.stintCount ?? 10} stints
        {spread !== null ? `, and the four drivers’ best twenty-lap averages fell within about ${spread.toFixed(1)}s of one another` : ''}.
        These are contribution facts, not a ranking between drivers.
      </p>
    </div>
  );
};

/* ---------- the depth layer ---------- */

export const DaytonaDepthLayer = () => {
  const pack = useImsaDaytonaStint();
  if (pack === 'failed') {
    return (
      <p className="imsa-caption" style={{ margin: 0 }}>
        The Daytona time-card records failed their integrity check against the source inventory, so they are not shown.
      </p>
    );
  }
  if (!pack) {
    return <p className="imsa-caption" style={{ margin: 0 }}>Opening the Daytona time cards…</p>;
  }
  return (
    <div className="imsa-depth stack">
      <StintTimeline pack={pack} />
      <CoDriverRoster pack={pack} />
    </div>
  );
};
