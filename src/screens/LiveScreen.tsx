import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Flag, Trophy } from 'lucide-react';
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
import { asNumber, asString, formatGap, formatNumber, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import { useNextSession } from '../app/useNextSession';
import type { LiveReadiness } from '../app/useReadiness';
import {
  buildOfficialPointsWindow,
  captureAgeSeconds,
  headToHeadForLiveDriver,
  liveBryceRowOf,
  liveRowsOf,
  positiveGapSeconds,
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
  ]
};

/* ---------- tiny, append-only gap sparklines ---------- */

interface GapSample {
  checkedAt: string;
  ahead: number | null;
  behind: number | null;
}

const useGapSamples = (payload: LiveReadiness | null): GapSample[] => {
  const [samples, setSamples] = useState<GapSample[]>([]);
  useEffect(() => {
    if (!payload || !['ready', 'degraded'].includes(payload.state)) return;
    const rows = liveRowsOf(payload);
    const bryce = liveBryceRowOf(payload);
    const rank = asNumber(bryce?.rank);
    if (!bryce || rank === null) return;
    const behind = rows.find((row) => asNumber(row.rank) === rank + 1);
    const next = {
      checkedAt: payload.checkedAt,
      ahead: positiveGapSeconds(bryce.liveGap ?? bryce.gap),
      behind: positiveGapSeconds(behind?.liveGap ?? behind?.gap)
    };
    setSamples((previous) => {
      if (previous.at(-1)?.checkedAt === next.checkedAt) return previous;
      return [...previous, next].slice(-30);
    });
  }, [payload]);
  return samples;
};

const Sparkline = ({ values, label }: { values: Array<number | null>; label: string }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const clean = values.map((value, index) => ({ value, index })).filter((point): point is { value: number; index: number } => point.value !== null);
  const height = 34;
  const min = Math.min(...clean.map((point) => point.value));
  const max = Math.max(...clean.map((point) => point.value));
  const span = Math.max(max - min, 0.1);
  const x = (index: number) => (index / Math.max(values.length - 1, 1)) * Math.max(width - 2, 1) + 1;
  const y = (value: number) => 5 + (1 - (value - min) / span) * (height - 10);
  const path = clean.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.index)} ${y(point.value)}`).join(' ');
  return (
    <div ref={ref} className={`live-spark${clean.length < 2 ? ' live-spark--empty' : ''}`} aria-label={clean.length < 2 ? `${label}; trend gathering` : undefined}>
      {width > 0 && clean.length >= 2 ? (
        <svg width={width} height={height} role="img" aria-label={label}>
          <path d={path} fill="none" stroke="var(--ink-primary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={x(clean.at(-1)!.index)} cy={y(clean.at(-1)!.value)} r={3.2} fill="var(--bryce)" stroke="var(--surface-1)" strokeWidth={2} />
        </svg>
      ) : null}
    </div>
  );
};

const trendDelta = (values: Array<number | null>) => {
  const clean = values.filter((value): value is number => value !== null);
  if (clean.length < 2) return null;
  const delta = clean.at(-1)! - clean[0];
  if (Math.abs(delta) < 0.05) return { text: '· steady', className: '' };
  return delta > 0
    ? { text: `▲ ${delta.toFixed(1)}s`, className: 'stat__delta--up' }
    : { text: `▽ ${Math.abs(delta).toFixed(1)}s`, className: 'stat__delta--down' };
};

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
  const rows = liveRowsOf(payload);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const rank = asNumber(bryce?.rank);
  const ahead = rank !== null ? rows.find((row) => asNumber(row.rank) === rank - 1) : undefined;
  const behind = rank !== null ? rows.find((row) => asNumber(row.rank) === rank + 1) : undefined;
  const aheadValues = samples.map((sample) => sample.ahead);
  const behindValues = samples.map((sample) => sample.behind);
  const aheadDelta = trendDelta(aheadValues);
  const behindDelta = trendDelta(behindValues);
  const rawTrackType = (asString(weekend.trackType) ?? '').toLowerCase();
  const typeLabel = rawTrackType === 'rc' ? 'Road course' : rawTrackType === 'sc' ? 'Street circuit' : rawTrackType ? trackTypeLabel(rawTrackType) : null;

  return (
    <HeroPanel className="live-hero">
      <div className="live-hero__head">
        <div>
          <span className="kicker">{[typeLabel, asString(weekend.trackName)].filter(Boolean).join(' · ') || 'Live companion'}</span>
          <h1 className="screen-head__title">{asString(weekend.eventName) ?? asString(heartbeat.eventName) ?? 'INDY NXT'}</h1>
        </div>
        <div className="row row--wrap" style={{ justifyContent: 'flex-end' }}>
          {flag ? <StatusChip tone={flagTone(flag)} label={`${flag} flag`} live={flag.toUpperCase() === 'GREEN'} /> : null}
          <span className="live-lap">{lap !== null && totalLaps !== null ? `Lap ${lap} of ${totalLaps}` : asString(heartbeat.sessionName) ?? 'Session live'}</span>
          <SourcePill title="The race, now" entries={sourceEntries.hero} />
        </div>
      </div>

      <div className="live-hero__body">
        <div className="live-position">
          <Plate size="hero" />
          <div>
            <span className="caption">Bryce Aron · running position</span>
            <div className="live-position__value">{rank !== null ? `P${rank}` : '—'}</div>
          </div>
        </div>
        <div className="live-neighbors">
          <div className="live-neighbor">
            <div className="live-neighbor__line">
              <span><strong>{secondsLabel(bryce?.liveGap ?? bryce?.gap)}</strong> to {driverLabel(ahead) ?? 'the car ahead'}</span>
              {aheadDelta ? <span className={`stat__delta ${aheadDelta.className}`}>{aheadDelta.text}</span> : <span className="caption caption--secondary">gathering trend</span>}
            </div>
            <Sparkline values={aheadValues} label="Gap to the car ahead over the latest 30 samples" />
          </div>
          <div className="live-neighbor">
            <div className="live-neighbor__line">
              <span><strong>{secondsLabel(behind?.liveGap ?? behind?.gap)}</strong> to {driverLabel(behind) ?? 'the car behind'}</span>
              {behindDelta ? <span className={`stat__delta ${behindDelta.className}`}>{behindDelta.text}</span> : <span className="caption caption--secondary">gathering trend</span>}
            </div>
            <Sparkline values={behindValues} label="Gap to the car behind over the latest 30 samples" />
          </div>
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
        {rows.map((row) => {
          const isBryce = row.bryce === true;
          const rank = asNumber(row.rank);
          const teammate = !isBryce && asString(row.team)?.toLowerCase().includes('ganassi');
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
                {rank === 1
                  ? 'leader'
                  : positiveGapSeconds(row.diff) !== null
                    ? `${secondsLabel(row.diff)}`
                    : formatGap(row.diff)}
              </span>
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
          flag: (asString(row.flag) ?? '').toUpperCase()
        }))
        .filter((point): point is { index: number; checkedAt: string; gap: number; flag: string } => point.checkedAt !== null && point.gap !== null),
    [trace]
  );
  const height = 220;
  const margin = { top: 18, right: 24, bottom: 28, left: 38 };
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const plotHeight = height - margin.top - margin.bottom;
  const maxGap = Math.max(...points.map((point) => point.gap), 1);
  const x = (index: number) => margin.left + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const y = (gap: number) => margin.top + (gap / maxGap) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.gap)}`).join(' ');

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
    <Card title="Gap to the leader" action={<SourcePill title="Gap to the leader" entries={sourceEntries.trend} />}>
      <div ref={ref} className="live-gap-chart">
        {points.length >= 2 ? (
          <>
          <p className="caption caption--secondary" style={{ margin: '0 0 4px' }}>
            The full session from our 1-second capture · yellow bands are caution periods · gold is now
          </p>
            {width > 0 ? (
              <svg ref={svgRef} width={width} height={height} role="img" aria-label="Bryce gap to the leader over the live session" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
                {cautionBands.map((band, index) => {
                  const left = x(band.from);
                  const right = x(Math.min(band.to + 1, points.length - 1));
                  return <rect key={index} x={left} y={margin.top} width={Math.max(right - left, 2)} height={plotHeight} fill="var(--status-warn-dot)" opacity={0.12} />;
                })}
                {[0, 0.5, 1].map((tick) => (
                  <g key={tick}>
                    <line x1={margin.left} x2={width - margin.right} y1={margin.top + tick * plotHeight} y2={margin.top + tick * plotHeight} stroke="var(--grid-hairline)" />
                    <text x={margin.left - 7} y={margin.top + tick * plotHeight} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
                      {(tick * maxGap).toFixed(0)}s
                    </text>
                  </g>
                ))}
                <path d={path} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.gap)} r={5} fill="var(--bryce)" stroke="var(--surface-1)" strokeWidth={2} />
                <text x={width - margin.right} y={height - 7} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>now</text>
              </svg>
            ) : null}
            {tip ? <ChartTipCard tip={tip} width={width} /> : null}
          </>
        ) : (
          <Unavailable>The session trace appears after the archive has two sourced gap samples. No pace line is estimated.</Unavailable>
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
