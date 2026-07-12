import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import {
  Card,
  Countdown,
  HeroPanel,
  Plate,
  SourcePill,
  StatusChip,
  Unavailable,
  readinessCopy,
  type Tone
} from '../app/components';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { asNumber, asString, formatGap, formatNumber } from '../app/format';
import { Link } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { useNextSession } from '../app/useNextSession';
import { trackOutlineFor } from '../assets/tracks';
import type { LiveReadiness } from '../app/useReadiness';
import {
  buildLiveBattleFrame,
  buildOfficialPointsWindow,
  captureAgeSeconds,
  headToHeadForLiveDriver,
  liveBryceRowOf,
  liveRowsOf,
  positiveGapSeconds,
  type LiveBattleNeighbor,
  type LiveRow
} from '../data/livePageModel';
import { uiDataPackage } from '../data/uiDataPackage';

type Row = Record<string, unknown>;

const heartbeatOf = (payload: LiveReadiness): Row => ((payload.liveTiming as Row)?.heartbeat as Row) ?? {};

const flagTone = (flag: string | null): Tone => {
  const value = (flag ?? '').toUpperCase();
  if (value === 'GREEN') return 'good';
  if (value === 'YELLOW' || value === 'CAUTION') return 'warn';
  if (value === 'RED') return 'bad';
  return 'neutral';
};

const driverLabel = (row: Row | undefined): string | null =>
  row ? asString(row.lastName) ?? asString(row.name) ?? (asString(row.no) ? `Car ${asString(row.no)}` : null) : null;

const secondsLabel = (value: unknown) => {
  const seconds = positiveGapSeconds(value);
  return seconds === null ? 'gap pending' : `+${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
};

const sourceEntries = {
  hero: [
    {
      label: 'Race Control timing feed · car 9 identity guard',
      path: '/api/readiness + /api/timing',
      note: 'Position, lap, flag, gaps, and neighboring drivers come from the active INDY NXT timing payload. Car 9 must match DriverID 2143 or Bryce Aron.'
    }
  ],
  points: [
    {
      label: 'Official Race Control point fields',
      path: '/api/readiness → liveTiming.rows[].runningDriverPoints / totalDriverPoints',
      note: 'Values are displayed and ordered as published. BryceCast does not run a local points model.'
    }
  ],
  tower: [
    { label: 'Race Control timing feed', path: '/api/timing', note: 'Every car in the active session, sorted by Race Control rank.' },
    {
      label: 'INDY NXT head-to-head context',
      path: 'analysis/ui-data-package/ui-data-package.json → upcomingPrep.standingsSnapshot / careerLab.headToHead',
      note: 'Hover context prefers the captured car-number join and falls back to the validated career package; it never changes the live order.'
    }
  ],
  trend: [
    {
      label: 'BryceCast 1-second Race Control archive',
      path: '/api/replay/bryce',
      note: 'Gap-to-leader and flag states are archived as received. Yellow periods are shaded; no GPS or pace model is inferred.'
    }
  ],
  battle: [
    {
      label: 'Race Control timing feed · Bryce-centered intervals',
      path: '/api/readiness → /api/timing rows[].diff / gap',
      note: 'The corridor subtracts each sourced gap-to-leader from Bryce’s. The chart preserves published neighbor identities and starts a new segment whenever the neighbor changes; no GPS position is inferred.'
    }
  ]
};

/* ---------- tiny, append-only gap sparklines ---------- */

interface GapSample {
  checkedAt: string;
  sessionKey: string;
  lap: number | null;
  rank: number | null;
  ahead: number | null;
  behind: number | null;
  aheadNeighbor: LiveBattleNeighbor | null;
  behindNeighbor: LiveBattleNeighbor | null;
}

const useGapSamples = (payload: LiveReadiness | null): GapSample[] => {
  const [samples, setSamples] = useState<GapSample[]>([]);
  useEffect(() => {
    if (!payload || !['ready', 'degraded'].includes(payload.state)) return;
    const rows = liveRowsOf(payload);
    const bryce = liveBryceRowOf(payload);
    const heartbeat = heartbeatOf(payload);
    const frame = buildLiveBattleFrame(payload);
    const rank = asNumber(bryce?.rank);
    if (!bryce || rank === null) return;
    const behind = rows.find((row) => asNumber(row.rank) === rank + 1);
    const next = {
      checkedAt: payload.checkedAt,
      sessionKey: `${asString(heartbeat.eventId) ?? 'event'}-${asString(heartbeat.eventSessionId) ?? 'session'}`,
      lap: asNumber(heartbeat.lap),
      rank,
      ahead: frame?.ahead?.gapSeconds ?? positiveGapSeconds(bryce.gap),
      behind: frame?.behind?.gapSeconds ?? positiveGapSeconds(behind?.gap),
      aheadNeighbor: frame?.ahead ?? null,
      behindNeighbor: frame?.behind ?? null
    };
    setSamples((previous) => {
      if (previous.at(-1)?.checkedAt === next.checkedAt) return previous;
      const last = previous.at(-1);
      const lastTime = last ? Date.parse(last.checkedAt) : Number.NaN;
      const nextTime = Date.parse(next.checkedAt);
      const reset = last && (last.sessionKey !== next.sessionKey || (Number.isFinite(lastTime) && Number.isFinite(nextTime) && nextTime < lastTime));
      return [...(reset ? [] : previous), next].slice(-300);
    });
  }, [payload]);
  return samples;
};

/* ---------- the battle: Bryce-centered spatial reference ---------- */

const BattleCorridor = ({ payload, samples }: { payload: LiveReadiness; samples: GapSample[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const frame = buildLiveBattleFrame(payload);
  const cars = (frame?.cars ?? [])
    .filter((car) => Math.abs(car.offsetSeconds) <= 4)
    .sort((left, right) => left.offsetSeconds - right.offsetSeconds);
  const margin = { left: 36, right: 36 };
  const plotWidth = Math.max(width - margin.left - margin.right, 120);
  const axisY = 82;
  const labelLanes = [50, 120, 33, 139, 17, 158];
  const x = (seconds: number) => margin.left + ((Math.max(-4, Math.min(4, seconds)) + 4) / 8) * plotWidth;
  const rateDetail = (carId: string, side: 'ahead' | 'behind') => {
    if (samples.length < 10) return null;
    const matches = samples.filter((sample) => (side === 'ahead' ? sample.aheadNeighbor : sample.behindNeighbor)?.id === carId);
    const first = matches[0];
    const last = matches.at(-1);
    const firstGap = side === 'ahead' ? first?.ahead : first?.behind;
    const lastGap = side === 'ahead' ? last?.ahead : last?.behind;
    const laps = first?.lap !== null && first?.lap !== undefined && last?.lap !== null && last?.lap !== undefined ? last.lap - first.lap : 0;
    if (firstGap === null || firstGap === undefined || lastGap === null || lastGap === undefined || laps < 1) return null;
    const closing = (firstGap - lastGap) / laps;
    if (Math.abs(closing) < 0.05) return `gap steady over the last ${laps} lap${laps === 1 ? '' : 's'}`;
    return `${closing > 0 ? 'closing' : 'opening'} ${Math.abs(closing).toFixed(1)}s/lap over the last ${laps} lap${laps === 1 ? '' : 's'}`;
  };

  return (
    <div ref={ref} className="live-battle__corridor">
      {width > 0 && frame ? (
        <>
          <svg width={width} height={194} role="img" aria-label="Cars within four seconds of Bryce on a Bryce-centered seconds axis">
            <line x1={margin.left} x2={width - margin.right} y1={axisY} y2={axisY} stroke="var(--axis-baseline)" />
            {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((tick) => (
              <g key={tick}>
                <line x1={x(tick)} x2={x(tick)} y1={axisY - (tick === 0 ? 9 : 5)} y2={axisY + (tick === 0 ? 9 : 5)} stroke={tick === 0 ? 'var(--bryce)' : 'var(--axis-baseline)'} />
                <text x={x(tick)} y={axisY + 23} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>{tick === 0 ? '0' : `${Math.abs(tick)}s`}</text>
              </g>
            ))}
            {cars.map((car, index) => {
              const side = car.offsetSeconds > 0 ? 'ahead' : 'behind';
              const close = Math.abs(car.offsetSeconds) <= 1;
              const labelY = labelLanes[index % labelLanes.length];
              const cx = x(car.offsetSeconds);
              return (
                <g key={car.id}>
                  <text x={cx} y={labelY} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10}>{car.surname}</text>
                  <circle cx={cx} cy={axisY} r={close ? 6.5 : 5} fill="var(--ink-primary)" opacity={close ? 1 : 0.8} stroke="var(--surface-1)" strokeWidth={2} />
                  <circle
                    cx={cx}
                    cy={axisY}
                    r={13}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${car.surname}, ${Math.abs(car.offsetSeconds).toFixed(1)} seconds ${side} of Bryce`}
                    onMouseEnter={() => setTip({
                      x: cx,
                      y: labelY < axisY ? labelY - 3 : labelY + 3,
                      title: car.surname,
                      detail: `+${Math.abs(car.offsetSeconds).toFixed(1)}s ${side}${rateDetail(car.id, side) ? ` · ${rateDetail(car.id, side)}` : ''}`
                    })}
                    onFocus={() => setTip({ x: cx, y: axisY - 19, title: car.surname, detail: `+${Math.abs(car.offsetSeconds).toFixed(1)}s ${side}` })}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                  />
                </g>
              );
            })}
            <g transform={`translate(${x(0)} ${axisY})`}>
              <rect x={-15} y={-11} width={30} height={22} rx={4} fill="var(--bryce)" />
              <text y={1} textAnchor="middle" dominantBaseline="middle" fill="#1d1d1f" fontFamily={chartFont} fontSize={12} fontWeight={750}>№9</text>
            </g>
            <text x={margin.left} y={188} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>behind Bryce</text>
            <text x={width - margin.right} y={188} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>ahead of Bryce</text>
          </svg>
          {tip ? <ChartTipCard tip={tip} width={width} /> : null}
        </>
      ) : (
        <Unavailable>The corridor appears when Race Control publishes sourced gap-to-leader values for Bryce and the field.</Unavailable>
      )}
    </div>
  );
};

interface BattleLinePoint {
  sampleIndex: number;
  value: number;
  checkedAt: string;
  neighbor: LiveBattleNeighbor;
}

const battleSegments = (samples: GapSample[], side: 'ahead' | 'behind') => {
  const segments: Array<{ id: string; surname: string; points: BattleLinePoint[] }> = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex];
    const neighbor = side === 'ahead' ? sample.aheadNeighbor : sample.behindNeighbor;
    const gap = side === 'ahead' ? sample.ahead : sample.behind;
    if (!neighbor || gap === null) continue;
    const previous = segments.at(-1);
    if (!previous || previous.id !== neighbor.id || previous.points.at(-1)!.sampleIndex !== sampleIndex - 1) {
      segments.push({ id: neighbor.id, surname: neighbor.surname, points: [] });
    }
    segments.at(-1)!.points.push({ sampleIndex, value: side === 'ahead' ? gap : -gap, checkedAt: sample.checkedAt, neighbor });
  }
  return segments;
};

const BattleChart = ({ samples }: { samples: GapSample[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const ahead = useMemo(() => battleSegments(samples, 'ahead'), [samples]);
  const behind = useMemo(() => battleSegments(samples, 'behind'), [samples]);
  const height = 244;
  const margin = { top: 18, right: 72, bottom: 31, left: 40 };
  const plotWidth = Math.max(width - margin.left - margin.right, 100);
  const plotHeight = height - margin.top - margin.bottom;
  const maxGap = Math.max(2, Math.ceil(Math.max(...samples.flatMap((sample) => [sample.ahead ?? 0, sample.behind ?? 0]))));
  const x = (index: number) => margin.left + (index / Math.max(samples.length - 1, 1)) * plotWidth;
  const y = (value: number) => margin.top + ((maxGap - value) / (maxGap * 2)) * plotHeight;
  const pathOf = (points: BattleLinePoint[]) => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.sampleIndex)} ${y(point.value)}`).join(' ');
  const elapsed = samples.length >= 2 ? Math.max(0, Date.parse(samples.at(-1)!.checkedAt) - Date.parse(samples[0].checkedAt)) : 0;
  const leftLabel = elapsed >= 60_000 ? `−${Math.max(1, Math.round(elapsed / 60_000))} min` : `−${Math.max(samples.length - 1, 1)}s`;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || samples.length === 0) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const sampleIndex = Math.max(0, Math.min(samples.length - 1, Math.round(((cursorX - margin.left) / plotWidth) * (samples.length - 1))));
    const sample = samples[sampleIndex];
    const details = [
      sample.aheadNeighbor && sample.ahead !== null ? `${sample.aheadNeighbor.surname} +${sample.ahead.toFixed(1)}s ahead` : null,
      sample.behindNeighbor && sample.behind !== null ? `${sample.behindNeighbor.surname} +${sample.behind.toFixed(1)}s behind` : null
    ].filter(Boolean).join(' · ');
    setTip({ x: x(sampleIndex), y: y(0), title: 'Bryce · 0s', detail: details });
  };

  return (
    <div ref={ref} className="live-battle__chart">
      {width > 0 && samples.length >= 2 ? (
        <>
          <svg ref={svgRef} width={width} height={height} role="img" aria-label="Gap to the car ahead and behind centered on Bryce over the latest five minutes" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
            {[maxGap, 0, -maxGap].map((tick) => (
              <g key={tick}>
                <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? 'var(--axis-baseline)' : 'var(--grid-hairline)'} />
                <text x={margin.left - 7} y={y(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>{tick > 0 ? `+${tick}s` : tick < 0 ? `−${Math.abs(tick)}s` : '0'}</text>
              </g>
            ))}
            <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} stroke="var(--bryce)" strokeWidth={2} strokeDasharray="2 5" />
            {[...ahead].map((segment, index) => <path key={`ahead-${segment.id}-${index}`} d={pathOf(segment.points)} fill="none" stroke="#5581c2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="live-line-append" />)}
            {[...behind].map((segment, index) => <path key={`behind-${segment.id}-${index}`} d={pathOf(segment.points)} fill="none" stroke="#2f9377" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="live-line-append" />)}
            {ahead.filter((segment) => segment.points.at(-1)?.sampleIndex === samples.length - 1).map((segment) => {
              const point = segment.points.at(-1)!;
              return <text key={segment.id} x={x(point.sampleIndex) + 7} y={y(point.value)} dominantBaseline="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10.5}>{segment.surname}</text>;
            })}
            {behind.filter((segment) => segment.points.at(-1)?.sampleIndex === samples.length - 1).map((segment) => {
              const point = segment.points.at(-1)!;
              return <text key={segment.id} x={x(point.sampleIndex) + 7} y={y(point.value)} dominantBaseline="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10.5}>{segment.surname}</text>;
            })}
            <g transform={`translate(${margin.left + 17} ${y(0)})`}>
              <rect x={-14} y={-10} width={28} height={20} rx={4} fill="var(--bryce)" />
              <text y={1} textAnchor="middle" dominantBaseline="middle" fill="#1d1d1f" fontFamily={chartFont} fontSize={11} fontWeight={750}>№9</text>
              <text x={20} y={1} dominantBaseline="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10.5}>Bryce</text>
            </g>
            <text x={margin.left} y={height - 7} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>{leftLabel}</text>
            <text x={width - margin.right} y={height - 7} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>now</text>
          </svg>
          {tip ? <ChartTipCard tip={tip} width={width} /> : null}
        </>
      ) : (
        <Unavailable>The line history starts after two live samples. Neighbor changes will begin a new segment rather than joining two drivers.</Unavailable>
      )}
    </div>
  );
};

const BattleModule = ({ payload, samples }: { payload: LiveReadiness; samples: GapSample[] }) => (
  <Card className="live-battle" title="The battle" action={<SourcePill title="The battle" entries={sourceEntries.battle} />}>
    <p className="live-battle__intro">Bryce is the reference point. Cars ahead sit right and above; cars behind sit left and below.</p>
    <BattleCorridor payload={payload} samples={samples} />
    <div className="live-battle__divider" />
    <BattleChart samples={samples} />
    <p className="caption caption--secondary live-battle__caption">blue runs ahead of him, teal behind · lines closing on Bryce’s line mean the gap is shrinking</p>
  </Card>
);

/* ---------- trust rail ---------- */

const TrustRail = ({ payload, fixtureMode }: { payload: LiveReadiness; fixtureMode: boolean }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const copy = readinessCopy[payload.state] ?? { tone: 'neutral' as Tone, label: payload.state, detail: payload.reason };
  const age = captureAgeSeconds(payload);
  const sourceState = asString((payload.liveTiming as Row)?.sourceState) ?? 'unknown';
  return (
    <section className="live-trust" aria-label="Live data trust state">
      <div className="row row--wrap" style={{ gap: 14 }}>
        <StatusChip tone={copy.tone} label={copy.label} live={payload.state === 'ready'} />
        <span className="live-trust__age">
          {fixtureMode ? `fixture · ${payload.state}` : age === null ? 'data age unknown' : `data ${age}s old`}
        </span>
        <span className="live-trust__source">source {sourceState}</span>
      </div>
      <span className="live-trust__detail">{copy.detail}</span>
      <SourcePill title="Live trust state" entries={[{ label: 'Product readiness reducer', path: '/api/readiness', note: payload.reason }]} />
    </section>
  );
};

/* ---------- hero: the race, now ---------- */

const LiveHero = ({ payload, samples }: { payload: LiveReadiness; samples: GapSample[] }) => {
  const weekend = payload.raceWeekend as Row;
  const heartbeat = heartbeatOf(payload);
  const bryce = liveBryceRowOf(payload);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const rank = asNumber(bryce?.rank);
  const outline = trackOutlineFor(asString(heartbeat.trackName ?? weekend.trackName));
  const progress = lap !== null && totalLaps !== null && totalLaps > 0 ? lap / totalLaps : 0;
  const pointsWindow = buildOfficialPointsWindow(liveRowsOf(payload));
  const points = payload.points as Row;
  const historicalRank = asNumber((points.bryce as Row)?.historicalRank);
  const standingMove = historicalRank !== null && pointsWindow ? historicalRank - pointsWindow.bryce.projectedStanding : null;

  const recent = samples.filter((sample) => sample.rank !== null && (lap === null || sample.lap === null || sample.lap >= lap - 5));
  const firstRecent = recent[0];
  const gained = rank !== null && firstRecent?.rank !== null && firstRecent?.rank !== undefined ? firstRecent.rank - rank : 0;
  let positionStory: { text: string; up: boolean } | null = null;
  if (gained > 0 && firstRecent?.lap !== null && firstRecent?.lap !== undefined && lap !== null && lap > firstRecent.lap) {
    positionStory = { text: `▲ up ${gained} in the last ${Math.min(5, lap - firstRecent.lap)} laps`, up: true };
  } else if (rank !== null && lap !== null) {
    let heldFrom = lap;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if (recent[index].rank !== rank) break;
      if (recent[index].lap !== null) heldFrom = Math.min(heldFrom, recent[index].lap!);
    }
    if (lap - heldFrom >= 1) positionStory = { text: `held P${rank} for ${lap - heldFrom + 1} laps`, up: false };
  }

  return (
    <HeroPanel className="live-hero">
      <div className="live-hero__identity">
        <div>
          <span className="kicker">{asString(heartbeat.trackName ?? weekend.trackName) ?? 'Live companion'}</span>
          <h1 className="screen-head__title">{asString(weekend.eventName) ?? asString(heartbeat.eventName) ?? 'INDY NXT'}</h1>
        </div>
        <SourcePill title="The race, now" entries={sourceEntries.hero} />
      </div>
      <div className="hero-race hero-race--week live-hero__body">
        <div className="live-hero__race-state">
          <div className="row row--wrap live-hero__flag-lap">
            {flag ? <StatusChip tone={flagTone(flag)} label={`${flag} flag`} live={flag.toUpperCase() === 'GREEN'} /> : null}
            <span className="live-lap">{lap !== null && totalLaps !== null ? `Lap ${lap} of ${totalLaps}` : asString(heartbeat.sessionName) ?? 'Session live'}</span>
          </div>
          <div className="live-position">
            <Plate size="hero" />
            <div>
              <span className="caption">running position</span>
              <div className="stat__value stat__value--hero live-position__value">{rank !== null ? `P${rank}` : '—'}</div>
              {positionStory ? <span className={`stat__delta${positionStory.up ? ' stat__delta--up' : ''}`}>{positionStory.text}</span> : null}
            </div>
          </div>
        </div>
        <div className="hero-race__art live-hero__art">
          {outline ? <TrackArt outline={outline} showCornerLabels={false} maxHeight={150} progress={progress} /> : null}
          <span className="caption caption--secondary live-hero__art-caption">the outline inks in as laps complete</span>
        </div>
        <div className="live-hero__jumbotron">
          <span className="caption">If the race ended now</span>
          {pointsWindow ? (
            <>
              <div className="row live-hero__standing-row">
                <span className="stat__value stat__value--big">P{pointsWindow.bryce.projectedStanding}</span>
                {standingMove !== null && standingMove !== 0 ? (
                  <span className={`stat__delta ${standingMove > 0 ? 'stat__delta--up' : 'stat__delta--down'}`}>{standingMove > 0 ? `▲ ${standingMove}` : `▽ ${Math.abs(standingMove)}`} vs pre-race</span>
                ) : null}
              </div>
              <div className="live-hero__running-points"><strong>{pointsWindow.bryce.runningDriverPoints}</strong> running points</div>
              <span className="live-points__provisional">provisional · official Race Control feed</span>
            </>
          ) : (
            <Unavailable>Official running points are not published in this state.</Unavailable>
          )}
        </div>
      </div>
    </HeroPanel>
  );
};

/* ---------- Bryce's jumbotron ---------- */

const PointsJumbotron = ({ payload }: { payload: LiveReadiness }) => {
  const rows = liveRowsOf(payload);
  const window = buildOfficialPointsWindow(rows);
  const points = payload.points as Row;
  const liveEligible = ['race_control_live', 'partial'].includes(asString(points.mode) ?? '');

  return (
    <Card
      className="live-points"
      title="If the race ended now"
      action={<SourcePill title="If the race ended now" entries={sourceEntries.points} caveats={['Provisional until official results publish and are reconciled.']} />}
    >
      {liveEligible && window ? (
        <>
          <div className="live-points__main">
            <div>
              <span className="caption">Projected championship standing</span>
              <div className="live-points__standing">P{window.bryce.projectedStanding}</div>
            </div>
            <div>
              <span className="caption">Race Control running points</span>
              <div className="live-points__score">{window.bryce.runningDriverPoints}</div>
              <span className="live-points__provisional">provisional · official Race Control feed</span>
            </div>
          </div>
          <div className="live-points__neighbors" aria-label="Projected championship neighbors">
            {[window.above, window.below].map((row, index) =>
              row ? (
                <div className="live-points__neighbor" key={row.carNo}>
                  <span className="tower__pos">P{row.projectedStanding}</span>
                  <span>{row.driverName}</span>
                  <strong>{row.runningDriverPoints}</strong>
                  <span className="caption caption--secondary">{index === 0 ? 'one spot up' : 'one spot down'}</span>
                </div>
              ) : null
            )}
          </div>
        </>
      ) : (
        <Unavailable>
          Race Control running points aren’t available in this state. The projection appears only when the official feed publishes the field.
        </Unavailable>
      )}
    </Card>
  );
};

/* ---------- full field tower ---------- */

const FieldTower = ({ payload }: { payload: LiveReadiness }) => {
  const rows = useMemo(() => [...liveRowsOf(payload)].sort((left, right) => (asNumber(left.rank) ?? 99) - (asNumber(right.rank) ?? 99)), [payload]);
  const standings = uiDataPackage.screens.upcomingPrep.standingsSnapshot;
  const careerRivals = uiDataPackage.screens.careerLab.headToHead;
  const bryceRank = asNumber(rows.find((row) => row.bryce === true)?.rank);
  if (rows.length === 0) {
    return (
      <Card title="The field" action={<SourcePill title="The field" entries={sourceEntries.tower} />}>
        <Unavailable>The running order appears when Race Control publishes timing rows for Bryce’s session.</Unavailable>
      </Card>
    );
  }

  return (
    <Card flush className="live-field" title="The field" action={<SourcePill title="The field" entries={sourceEntries.tower} />}>
      <div className="tower" role="table" aria-label="Full live running order">
        <div className="tower__row live-field__header" role="row">
          <span>P</span>
          <span>driver</span>
          <span>gap to leader</span>
        </div>
        {rows.map((row, index) => {
          const isBryce = row.bryce === true;
          const rank = asNumber(row.rank);
          const previous = rows[index - 1];
          const teammate = !isBryce && asString(row.team)?.toLowerCase().includes('ganassi');
          const interval = index > 0 ? positiveGapSeconds(row.gap) : null;
          const battleBracket = interval !== null && interval <= 1;
          const bryceBracket = battleBracket && (isBryce || previous?.bryce === true);
          const status = (asString(row.status) ?? '').toLowerCase();
          const running = !status || ['active', 'running', 'run'].includes(status);
          const honestStatus = running ? null : asString(row.comment) || asString(row.status);
          const headToHead =
            bryceRank !== null && rank !== null && Math.abs(rank - bryceRank) <= 2
              ? headToHeadForLiveDriver(row.no, driverLabel(row), standings, careerRivals)
              : null;
          const shared = (headToHead?.bryceAhead ?? 0) + (headToHead?.bryceBehind ?? 0);
          return (
            <div
              key={`${String(row.no)}-${String(row.rank)}`}
              className={`tower__row live-field__row${isBryce ? ' tower__row--bryce' : ''}`}
              role="row"
              tabIndex={headToHead && shared > 0 ? 0 : undefined}
            >
              <span className="tower__pos">{formatNumber(row.rank, 0)}</span>
              <span className="tower__name">
                {isBryce ? <Plate size="row" /> : null}
                {driverLabel(row) ?? '—'}
                {teammate ? <span className="live-field__teammate">teammate</span> : null}
              </span>
              <span className="tower__gap">
                {honestStatus
                  ? honestStatus
                  : rank === 1
                  ? 'leader'
                  : positiveGapSeconds(row.diff) !== null
                    ? `${secondsLabel(row.diff)}`
                    : formatGap(row.diff)}
              </span>
              {battleBracket ? <span className={`live-field__bracket${bryceBracket ? ' live-field__bracket--bryce' : ''}`} aria-label={`${interval!.toFixed(1)} second battle with the car ahead`} /> : null}
              {headToHead && shared > 0 ? (
                <span className="live-field__tip" role="tooltip">
                  Bryce ahead in {headToHead.bryceAhead} of {shared} shared races
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- full-session gap trend ---------- */

interface ReplayTrace {
  sessionKey: string | null;
  rows: LiveRow[];
}

const useReplayTrace = (payload: LiveReadiness | null, fixtureMode: boolean): ReplayTrace | null => {
  const [trace, setTrace] = useState<ReplayTrace | null>(null);
  const heartbeat = payload ? heartbeatOf(payload) : {};
  const sessionKey = !fixtureMode && asString(heartbeat.eventId) && asString(heartbeat.eventSessionId)
    ? `${asString(heartbeat.eventId)}-${asString(heartbeat.eventSessionId)}`
    : null;

  useEffect(() => {
    if (fixtureMode || !payload) {
      const fixtureRows = Array.isArray((payload?.replay as Row)?.rows) ? ((payload?.replay as Row).rows as LiveRow[]) : [];
      setTrace({ sessionKey: asString((payload?.replay as Row)?.sessionKey), rows: fixtureRows });
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const key = sessionKey ? `&sessionKey=${encodeURIComponent(sessionKey)}` : '';
        const response = await fetch(`/api/replay/bryce?limit=500${key}`, { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const data = (await response.json()) as Row;
        if (cancelled || data.available !== true) return;
        setTrace({ sessionKey: asString(data.sessionKey), rows: Array.isArray(data.rows) ? (data.rows as LiveRow[]) : [] });
      } catch {
        // Archive coverage is optional; the module keeps its last good frame.
      }
    };
    void load();
    const timer = window.setInterval(load, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fixtureMode, payload?.state, sessionKey]);
  return trace;
};

const GapTrend = ({ trace }: { trace: ReplayTrace | null }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const points = useMemo(
    () =>
      (trace?.rows ?? [])
        .map((row, index) => ({
          index,
          checkedAt: asString(row.checkedAt),
          gap: positiveGapSeconds(row.diff),
          lap: asNumber(row.laps),
          flag: (asString(row.flag) ?? '').toUpperCase()
        }))
        .filter((point): point is { index: number; checkedAt: string; gap: number; lap: number | null; flag: string } => point.checkedAt !== null && point.gap !== null),
    [trace]
  );
  const height = 220;
  const margin = { top: 18, right: 24, bottom: 28, left: 38 };
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const plotHeight = height - margin.top - margin.bottom;
  const maxGap = Math.max(...points.map((point) => point.gap), 1);
  const x = (index: number) => margin.left + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const y = (gap: number) => margin.top + (1 - gap / maxGap) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.gap)}`).join(' ');
  const lapBoundaries = useMemo(() => {
    const boundaries: Array<{ lap: number; index: number }> = [];
    points.forEach((point, index) => {
      if (point.lap === null || boundaries.at(-1)?.lap === point.lap) return;
      boundaries.push({ lap: point.lap, index });
    });
    if (boundaries.length <= 7) return boundaries;
    const stride = Math.ceil(boundaries.length / 6);
    return boundaries.filter((_, index) => index % stride === 0 || index === boundaries.length - 1);
  }, [points]);

  const cautionBands = useMemo(() => {
    const bands: Array<{ from: number; to: number }> = [];
    points.forEach((point, index) => {
      const caution = point.flag === 'YELLOW' || point.flag === 'CAUTION';
      const last = bands.at(-1);
      if (caution && last && last.to === index - 1) last.to = index;
      else if (caution) bands.push({ from: index, to: index });
    });
    return bands;
  }, [points]);

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(((cursorX - margin.left) / plotWidth) * (points.length - 1))));
    const point = points[index];
    setTip({
      x: x(index),
      y: y(point.gap),
      title: `+${point.gap.toFixed(1)}s to leader`,
      detail: `${new Date(point.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}${point.flag && point.flag !== 'GREEN' ? ` · ${point.flag.toLowerCase()}` : ''}`
    });
  };

  return (
    <Card title="Distance to the leader" action={<SourcePill title="Distance to the leader" entries={sourceEntries.trend} />}>
      <div ref={ref} className="live-gap-chart">
        {points.length >= 2 ? (
          <>
          <p className="caption caption--secondary" style={{ margin: '0 0 4px' }}>
            The full session from our 1-second capture · shaded = caution · gold = now
          </p>
            {width > 0 ? (
              <svg ref={svgRef} width={width} height={height} role="img" aria-label="Bryce gap to the leader over the live session" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
                {cautionBands.map((band, index) => {
                  const left = x(band.from);
                  const right = x(Math.min(band.to + 1, points.length - 1));
                  return <rect key={index} x={left} y={margin.top} width={Math.max(right - left, 2)} height={plotHeight} fill="var(--status-warn-dot)" opacity={0.1} />;
                })}
                {[maxGap, maxGap / 2, 0].map((tick) => (
                  <g key={tick}>
                    <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid-hairline)" />
                    <text x={margin.left - 7} y={y(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
                      {tick === 0 ? 'leader' : `${tick.toFixed(0)}s`}
                    </text>
                  </g>
                ))}
                <path d={path} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="live-line-append" />
                <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.gap)} r={5} fill="var(--bryce)" stroke="var(--surface-1)" strokeWidth={2} className="live-now-dot" />
                {lapBoundaries.length >= 2 ? lapBoundaries.map((boundary) => (
                  <text key={boundary.index} x={x(boundary.index)} y={height - 7} textAnchor={boundary.index === 0 ? 'start' : boundary.index === points.length - 1 ? 'end' : 'middle'} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>L{boundary.lap}</text>
                )) : (
                  <>
                    <text x={margin.left} y={height - 7} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>start</text>
                    <text x={width - margin.right} y={height - 7} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>now</text>
                  </>
                )}
              </svg>
            ) : null}
            {tip ? <ChartTipCard tip={tip} width={width} /> : null}
          </>
        ) : (
          <Unavailable>The distance trace appears after the archive has two sourced gap samples. No pace line is estimated.</Unavailable>
        )}
      </div>
    </Card>
  );
};

/* ---------- honest non-live states ---------- */

const WaitingState = ({ payload }: { payload: LiveReadiness }) => {
  const copy = readinessCopy[payload.state];
  const nextSession = useNextSession();
  const heartbeat = heartbeatOf(payload);
  const onTrackNow = payload.state === 'wrong_series' ? asString(heartbeat.eventName) : null;
  return (
    <HeroPanel>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="kicker">{payload.state === 'pre_session' ? 'The timing feed is waiting' : 'Bryce’s live view is protected'}</span>
          <h1 className="screen-head__title" style={{ marginTop: 8 }}>{copy?.label ?? 'Live companion'}</h1>
        </div>
        <SourcePill title="Live waiting state" entries={[{ label: 'Product readiness reducer', path: '/api/readiness', note: payload.reason }]} />
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '62ch' }}>
        {copy?.detail ?? payload.reason}{onTrackNow ? ` Race Control is currently showing ${onTrackNow}.` : ''}
      </p>
      {nextSession?.startsAt && new Date(nextSession.startsAt).getTime() > Date.now() ? (
        <div style={{ marginTop: 20 }}>
          <span className="caption">Next up · {[nextSession.eventName, nextSession.sessionName].filter(Boolean).join(' · ')}</span>
          <div style={{ marginTop: 8 }}><Countdown to={nextSession.startsAt} /></div>
        </div>
      ) : null}
      <Link to="/race-week" className="live-race-week-link"><CalendarClock size={14} aria-hidden /> Race Week</Link>
    </HeroPanel>
  );
};

/* ---------- screen ---------- */

export const LiveScreen = ({ payload, fixtureMode }: { payload: LiveReadiness | null; fixtureMode: boolean }) => {
  const samples = useGapSamples(payload);
  const trace = useReplayTrace(payload, fixtureMode);
  if (!payload) {
    return (
      <div className="page stack">
        <div className="skeleton" style={{ height: 42 }} />
        <div className="skeleton" style={{ height: 300 }} />
        <div className="grid live-layout"><div className="skeleton" style={{ height: 340 }} /><div className="skeleton" style={{ height: 540 }} /></div>
      </div>
    );
  }

  const liveish = payload.state === 'ready' || payload.state === 'degraded';
  return (
    <div className="page stack live-page">
      <TrustRail payload={payload} fixtureMode={fixtureMode} />
      {liveish ? (
        <>
          <LiveHero payload={payload} samples={samples} />
          <BattleModule payload={payload} samples={samples} />
          <div className="grid live-layout">
            <div className="stack live-layout__main">
              <PointsJumbotron payload={payload} />
              <GapTrend trace={trace} />
            </div>
            <FieldTower payload={payload} />
          </div>
        </>
      ) : (
        <>
          <WaitingState payload={payload} />
          <div className="grid live-layout">
            <PointsJumbotron payload={payload} />
            <GapTrend trace={trace} />
          </div>
        </>
      )}
    </div>
  );
};
