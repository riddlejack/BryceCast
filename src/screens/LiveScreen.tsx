import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ExternalLink, History, Radio, RotateCcw, Tv, X } from 'lucide-react';
import {
  Card,
  Countdown,
  HeroPanel,
  Plate,
  SourcePill,
  StatusChip,
  TickerValue,
  Unavailable,
  readinessCopy,
  type Tone
} from '../app/components';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { asNumber, asString, formatGap, formatNumber } from '../app/format';
import { Link } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { LiveRunningOrder } from './LiveRunningOrder';
import { useNextSession } from '../app/useNextSession';
import { trackOutlineFor } from '../assets/tracks';
import type { LiveReadiness } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import type { ReplaySessionInfo } from '../data/replayAvailable';
import { loadRaceStory } from '../data/raceStory';
import {
  buildLiveBattleFrame,
  buildOfficialPointsWindow,
  captureAgeSeconds,
  headToHeadForLiveDriver,
  livePosition,
  liveBryceRowOf,
  liveRowsOf,
  positiveGapSeconds,
  rankChanges,
  resolveStableLabelLanes,
  sortRowsForLiveDisplay,
  stableDriverId,
  timestampWindowDomain,
  type LiveBattleNeighbor,
  type LiveRow
} from '../data/livePageModel';
import {
  adaptiveNumericTicks,
  adaptiveTimeTicks,
  battleConnectorGeometry,
  buildBattleFrameForSample,
  contiguousValueSegments,
  dataDrivenGapDomain,
  sharedLeaderGapSeries,
  shouldAnimateSampleTransition,
  sourcedGapToLeaderSeconds,
  liveSourceCheckedAtOf,
  type LiveHistoryPoint,
  type LiveSessionHistory
} from '../data/liveHistoryModel';
import { uiDataPackage } from '../data/uiDataPackage';

type Row = Record<string, unknown>;

const heartbeatOf = (payload: LiveReadiness): Row => ((payload.liveTiming as Row)?.heartbeat as Row) ?? {};

const replaySimulationOf = (payload: LiveReadiness): Row | null => {
  const simulation = (payload.replay as Row | undefined)?.simulation;
  return simulation && typeof simulation === 'object' && !Array.isArray(simulation) ? (simulation as Row) : null;
};

const isSimulatedReplayPayload = (payload: LiveReadiness): boolean => replaySimulationOf(payload)?.active === true;

const pointsProvenanceLabel = (payload: LiveReadiness): string =>
  isSimulatedReplayPayload(payload) ? 'simulated · archived Race Control values' : 'provisional · official Race Control feed';

const isCautionFlag = (flag: string | null | undefined) => {
  const value = (flag ?? '').toUpperCase();
  return value.includes('YELLOW') || value.includes('CAUTION') || value === 'FCY';
};

const isRedFlag = (flag: string | null | undefined) => (flag ?? '').toUpperCase().includes('RED');

const flagTone = (flag: string | null): Tone => {
  const value = (flag ?? '').toUpperCase();
  if (value === 'GREEN') return 'good';
  if (isCautionFlag(value)) return 'warn';
  if (isRedFlag(value)) return 'bad';
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
      note: 'Position, lap, flag, gaps, and neighboring drivers come from the active INDY NXT timing payload. Car 9 must match source driver identity 2143 or Bryce Aron.'
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
    { label: 'Race Control timing feed', path: '/api/timing', note: 'Every car in the active session, sorted by liveRank with published rank as the explicit fallback.' },
    {
      label: 'INDY NXT head-to-head context',
      path: 'analysis/ui-data-package/ui-data-package.json → upcomingPrep.standingsSnapshot / careerLab.headToHead',
      note: 'Hover context prefers the captured car-number join and falls back to the validated career package; it never changes the live order.'
    }
  ],
  trend: [
    {
      label: 'Race Control timing feed · leader-gap intervals',
      path: '/api/readiness → liveTiming.rows[].liveGap',
      note: 'The chart sums adjacent intervals from P1 to Bryce on every sourced payload. Smaller gaps plot higher. It shares the session-keyed store and ordering used by the battle and field; missing intervals break the line.'
    }
  ],
  battle: [
    {
      label: 'Race Control timing feed · Bryce-centered corridor',
      path: '/api/readiness → liveTiming.rows[].liveGap',
      note: 'The corridor walks Race Control’s live interval to the preceding ranked car around Bryce. Missing intervals break the chain; no gap is filled with zero and no GPS position is inferred.'
    },
    {
      label: 'Race Control timing feed · official running order',
      path: '/api/readiness → liveTiming.rows[].liveRank / rank',
      note: 'Every lower-chart lane is an official running position. A lapped car keeps its position lane. When Race Control ordering disappears, every line breaks until it returns.'
    },
    {
      label: 'Session-keyed in-memory history',
      path: 'AppV3 → useLiveSessionHistory',
      note: 'The shared history survives route navigation, deduplicates source timestamps, sorts late arrivals, and isolates sessions. The source clock sets both each sample’s horizontal position and the right edge. A hard browser reload starts a new window.'
    }
  ],
  watch: [
    {
      label: 'Session-matched official broadcast route',
      path: '/api/readiness → raceWeekend.broadcastRoute',
      note: 'The route is matched by EventSessionID from the official track-activity feed.'
    },
    {
      label: 'Official embed audit',
      path: 'analysis/live-watch-routes/RESEARCH.md',
      note: 'No official embeddable full-session INDY NXT stream was found for 2026, so BryceCast deep-links instead.'
    }
  ]
};

/* ---------- one session-keyed history feeds both charts ---------- */

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

const gapSamplesFromHistory = (history: LiveSessionHistory | null): GapSample[] =>
  (history?.samples ?? []).map((sample) => {
    const bryce = sample.rows.find((row) => stableDriverId(row) === sample.bryceId) ?? null;
    const frame = buildBattleFrameForSample(sample);
    return {
      checkedAt: sample.checkedAt,
      sessionKey: sample.sessionKey,
      lap: sample.lap,
      rank: bryce ? livePosition(bryce) : null,
      ahead: frame?.ahead?.gapSeconds ?? null,
      behind: frame?.behind?.gapSeconds ?? null,
      aheadNeighbor: frame?.ahead ?? null,
      behindNeighbor: frame?.behind ?? null
    };
  });

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
};

/* ---------- the battle: Bryce-centered spatial reference ---------- */

const BattleCorridor = ({ payload, samples, history }: { payload: LiveReadiness; samples: GapSample[]; history: LiveSessionHistory | null }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const previousSample = useRef(history?.samples.at(-1) ?? null);
  const currentSample = history?.samples.at(-1) ?? null;
  const animateCoordinates = shouldAnimateSampleTransition(previousSample.current, currentSample, reducedMotion);
  useLayoutEffect(() => {
    previousSample.current = currentSample;
  }, [currentSample]);
  const frame = buildLiveBattleFrame(payload);
  const cars = (frame?.cars ?? [])
    .filter((car) => Math.abs(car.offsetSeconds) <= 4)
    .sort((left, right) => left.id.localeCompare(right.id));
  const margin = { left: 36, right: 36 };
  const plotWidth = Math.max(width - margin.left - margin.right, 120);
  const axisY = 82;
  const labelLanes = [17, 34, 51, 67, 116, 133, 150, 167];
  const x = (seconds: number) => margin.left + ((Math.max(-4, Math.min(4, seconds)) + 4) / 8) * plotWidth;
  const lanesByDriver = resolveStableLabelLanes(
    cars.map((car) => ({ id: car.id, surname: car.surname, x: x(car.offsetSeconds) })),
    labelLanes.length
  );
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
            {cars.map((car) => {
              const side = car.offsetSeconds > 0 ? 'ahead' : 'behind';
              const sideCopy = side === 'ahead' ? 'ahead of Bryce' : 'behind Bryce';
              const close = Math.abs(car.offsetSeconds) <= 1;
              const labelLane = lanesByDriver.get(car.id) ?? 0;
              const labelY = labelLanes[labelLane];
              const cx = x(car.offsetSeconds);
              const connector = battleConnectorGeometry(labelY, axisY, 10, close ? 6.5 : 5);
              return (
                <g
                  key={car.id}
                  className={`live-battle__car${animateCoordinates ? ' live-battle__car--motion' : ''}`}
                  data-driver-id={car.id}
                  data-label-lane={labelLane}
                  data-offset-seconds={car.offsetSeconds.toFixed(4)}
                  transform={`translate(${cx} 0)`}
                >
                  <line
                    className="live-battle__connector"
                    x1={0}
                    x2={0}
                    y1={connector.y1}
                    y2={connector.y2}
                    data-connector-driver-id={car.id}
                  />
                  <text x={0} y={labelY} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10}>{car.surname}</text>
                  <circle cx={0} cy={axisY} r={close ? 6.5 : 5} fill="var(--ink-primary)" opacity={close ? 1 : 0.8} stroke="var(--surface-1)" strokeWidth={2} />
                  <circle
                    cx={0}
                    cy={axisY}
                    r={13}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${car.surname}, ${Math.abs(car.offsetSeconds).toFixed(1)} seconds ${sideCopy}`}
                    onMouseEnter={() => setTip({
                      x: cx,
                      y: labelY < axisY ? labelY - 3 : labelY + 3,
                      title: car.surname,
                      detail: `${Math.abs(car.offsetSeconds).toFixed(1)}s ${sideCopy}${rateDetail(car.id, side) ? ` · ${rateDetail(car.id, side)}` : ''}`
                    })}
                    onFocus={() => setTip({ x: cx, y: axisY - 19, title: car.surname, detail: `${Math.abs(car.offsetSeconds).toFixed(1)}s ${sideCopy}` })}
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

const stepPath = (points: LiveHistoryPoint[], x: (value: number) => number, y: (value: number) => number): string =>
  points.reduce((path, point, index) => {
    if (point.value === null) return path;
    if (index === 0) return `M${x(point.checkedAtMs)} ${y(point.value)}`;
    const previous = points[index - 1];
    return `${path}H${x(point.checkedAtMs)}V${y(point.value)}`;
  }, '');

const timeTickLabel = (value: number, spanMs: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: spanMs > 300_000 ? 'numeric' : undefined,
    minute: '2-digit',
    second: spanMs <= 300_000 ? '2-digit' : undefined
  });

const BattleModule = ({ payload, samples, history }: { payload: LiveReadiness; samples: GapSample[]; history: LiveSessionHistory | null }) => {
  const flag = asString(heartbeatOf(payload).currentFlag ?? heartbeatOf(payload).flag ?? (payload.raceWeekend as Row).flag);
  const mode = isRedFlag(flag)
    ? 'Session stopped — red flag'
    : isCautionFlag(flag)
      ? 'Field bunched under caution — gaps compress until the restart'
      : null;
  return (
    <Card className="live-battle" title="The battle" action={<SourcePill title="The battle" entries={sourceEntries.battle} />}>
      <p className="live-battle__intro">The pack around Bryce — every line a car's running position, gold is Bryce.</p>
      <div className={`live-battle__mode${mode ? ' live-battle__mode--active' : ''}`} aria-live="polite">{mode ?? '\u00a0'}</div>
      <BattleCorridor payload={payload} samples={samples} history={history} />
      <div className="live-battle__divider" />
      <p className="live-battle__shared-title">The running order</p>
      <LiveRunningOrder history={history} clockCheckedAt={liveSourceCheckedAtOf(payload)} />
      <p className="caption caption--secondary live-battle__caption">Five minutes of official running position · gold is Bryce · neutral line patterns stay with each driver · shaded = caution · ○ an overtake involving Bryce</p>
    </Card>
  );
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
  const replaySimulation = replaySimulationOf(payload);
  const simulatedReplay = replaySimulation?.active === true;
  const replayLabel = asString(replaySimulation?.label) ?? 'Simulated replay';
  const detail = simulatedReplay
    ? 'Archived Race Control replay — not official live data.'
    : copy.detail;
  return (
    <section className="live-trust" aria-label="Live data trust state">
      <div className="row row--wrap" style={{ gap: 14 }}>
        <StatusChip tone={simulatedReplay ? 'neutral' : copy.tone} label={simulatedReplay ? replayLabel : copy.label} live={!simulatedReplay && payload.state === 'ready'} />
        <span className="live-trust__age">
          {fixtureMode ? `fixture · ${payload.state}` : simulatedReplay ? 'archived session · simulated clock' : age === null ? 'data age unknown' : `data ${age}s old`}
        </span>
        <span className="live-trust__source">source {simulatedReplay ? 'archived Race Control' : sourceState}</span>
      </div>
      <span className="live-trust__detail">{detail}</span>
      <SourcePill title="Live trust state" entries={[{ label: 'Product readiness reducer', path: '/api/readiness', note: simulatedReplay ? detail : payload.reason }]} />
    </section>
  );
};

/* ---------- hero: the race, now ---------- */

const LiveHero = ({ payload, samples, replayEnded = false }: { payload: LiveReadiness; samples: GapSample[]; replayEnded?: boolean }) => {
  const weekend = payload.raceWeekend as Row;
  const heartbeat = heartbeatOf(payload);
  const bryce = liveBryceRowOf(payload);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const rank = bryce ? livePosition(bryce) : null;
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
            {replayEnded ? (
              <StatusChip tone="neutral" label="Race complete · as raced" />
            ) : flag ? (
              <StatusChip tone={flagTone(flag)} label={`${flag} flag`} live={flag.toUpperCase() === 'GREEN'} />
            ) : null}
            <TickerValue className="live-lap" value={lap !== null && totalLaps !== null ? `Lap ${lap} of ${totalLaps}` : asString(heartbeat.sessionName) ?? 'Session live'} valueKey={`${lap ?? 'na'}-${totalLaps ?? 'na'}`} />
          </div>
          <div className="live-position">
            <Plate size="hero" />
            <div>
              <span className="caption">running position</span>
              <TickerValue className="stat__value stat__value--hero live-position__value" value={rank !== null ? `P${rank}` : '—'} valueKey={rank ?? 'na'} />
              {positionStory ? <span className={`stat__delta${positionStory.up ? ' stat__delta--up' : ''}`}>{positionStory.text}</span> : null}
            </div>
          </div>
        </div>
        <div className="hero-race__art live-hero__art">
          {outline ? <TrackArt outline={outline} showCornerLabels={false} maxHeight={150} /> : null}
          <span className="caption caption--secondary live-hero__art-caption">full circuit outline · no car-position data</span>
          <div className="live-lap-progress__meta">
            <span>Race completion</span>
            <span>{lap !== null && totalLaps !== null ? `${lap} / ${totalLaps} laps` : 'lap pending'}</span>
          </div>
          <div
            className="live-lap-progress"
            role="progressbar"
            aria-label="Race completion by completed lap"
            aria-valuemin={0}
            aria-valuemax={totalLaps ?? 0}
            aria-valuenow={lap ?? 0}
          >
            <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
          </div>
        </div>
        <div className="live-hero__jumbotron">
          <span className="caption">If the race ended now</span>
          {pointsWindow ? (
            <>
              <div className="row live-hero__standing-row">
                <TickerValue className="stat__value stat__value--big" value={`P${pointsWindow.bryce.projectedStanding}`} valueKey={pointsWindow.bryce.projectedStanding} />
                {standingMove !== null && standingMove !== 0 ? (
                  <span className={`stat__delta ${standingMove > 0 ? 'stat__delta--up' : 'stat__delta--down'}`}>{standingMove > 0 ? `▲ ${standingMove}` : `▽ ${Math.abs(standingMove)}`} vs pre-race</span>
                ) : null}
              </div>
              <div className="live-hero__running-points"><TickerValue className="live-hero__points-number" value={pointsWindow.bryce.runningDriverPoints} valueKey={pointsWindow.bryce.runningDriverPoints} /> running points</div>
              <span className="live-points__provisional">{pointsProvenanceLabel(payload)}</span>
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
              <TickerValue className="stat__value stat__value--big live-points__standing" value={`P${window.bryce.projectedStanding}`} valueKey={window.bryce.projectedStanding} />
            </div>
            <div>
              <span className="caption">Race Control running points</span>
              <TickerValue className="stat__value stat__value--big live-points__score" value={window.bryce.runningDriverPoints} valueKey={window.bryce.runningDriverPoints} />
              <span className="live-points__provisional">{pointsProvenanceLabel(payload)}</span>
            </div>
          </div>
          <div className="live-points__neighbors" aria-label="Projected championship neighbors">
            {[window.above, window.below].map((row, index) =>
              row ? (
                <div className="live-points__neighbor" key={row.carNo}>
                  <span className="tower__pos">P{row.projectedStanding}</span>
                  <span>{row.driverName}</span>
                  <strong><TickerValue value={row.runningDriverPoints} valueKey={row.runningDriverPoints} /></strong>
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

const useFieldRankChanges = (rows: LiveRow[]) => {
  const previousRows = useRef<LiveRow[]>([]);
  const clearTimer = useRef<number | null>(null);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    const changes = rankChanges(previousRows.current, rows);
    if (changes.length > 0) {
      setChangedIds(new Set(changes.map((change) => change.id)));
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setChangedIds(new Set()), 1_000);
    }
    previousRows.current = rows;
  }, [rows]);

  useEffect(() => () => {
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
  }, []);

  return changedIds;
};

const FieldTower = ({ payload }: { payload: LiveReadiness }) => {
  const rows = useMemo(() => sortRowsForLiveDisplay(liveRowsOf(payload)) as LiveRow[], [payload]);
  const changedIds = useFieldRankChanges(rows);
  const standings = uiDataPackage.screens.upcomingPrep.standingsSnapshot;
  const careerRivals = uiDataPackage.screens.careerLab.headToHead;
  const bryceRank = livePosition(rows.find((row) => row.bryce === true) ?? {});
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
          const rowId = stableDriverId(row);
          const isBryce = row.bryce === true;
          const rank = livePosition(row);
          const previous = rows[index - 1];
          const teammate = !isBryce && asString(row.team)?.toLowerCase().includes('ganassi');
          const interval = index > 0 ? positiveGapSeconds(row.liveGap) : null;
          const battleBracket = interval !== null && interval <= 1;
          const bryceBracket = battleBracket && (isBryce || previous?.bryce === true);
          const status = (asString(row.status) ?? '').toLowerCase();
          const running = !status || ['active', 'running', 'run'].includes(status);
          const honestStatus = running ? null : asString(row.comment) || asString(row.status);
          const sourcedLeaderGap = sourcedGapToLeaderSeconds(row);
          const displayGap = honestStatus
            ? honestStatus
            : rank === 1
              ? 'leader'
              : sourcedLeaderGap !== null
                ? secondsLabel(sourcedLeaderGap)
                : positiveGapSeconds(row.diff) === 0
                  ? 'gap pending'
                  : formatGap(row.diff);
          const headToHead =
            bryceRank !== null && rank !== null && Math.abs(rank - bryceRank) <= 2
              ? headToHeadForLiveDriver(row.no, driverLabel(row), standings, careerRivals)
              : null;
          const shared = (headToHead?.bryceAhead ?? 0) + (headToHead?.bryceBehind ?? 0);
          return (
            <div
              key={rowId}
              data-driver-id={rowId}
              data-live-rank={rank ?? ''}
              className={`tower__row live-field__row${isBryce ? ' tower__row--bryce' : ''}${changedIds.has(rowId) ? ' live-field__row--rank-change' : ''}`}
              role="row"
              tabIndex={headToHead && shared > 0 ? 0 : undefined}
            >
              <span className="tower__pos">{formatNumber(rank, 0)}</span>
              <span className="tower__name">
                {isBryce ? <Plate size="row" /> : null}
                {driverLabel(row) ?? '—'}
                {teammate ? <span className="live-field__teammate">teammate</span> : null}
              </span>
              <span className="tower__gap">
                <TickerValue value={displayGap} valueKey={displayGap} />
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

/* ---------- Bryce distance on the same session-keyed liveGap frame ---------- */

interface SessionGapPoint extends LiveHistoryPoint {
  lap: number | null;
  flag: string;
}

const gapTrendPointsFromHistory = (history: LiveSessionHistory | null): SessionGapPoint[] => {
  if (!history) return [];
  const bryceSeries = sharedLeaderGapSeries(history).find((series) => series.role === 'bryce');
  if (!bryceSeries) return [];
  return bryceSeries.points.map((point, index) => ({
    ...point,
    lap: history.samples[index]?.lap ?? null,
    flag: history.samples[index]?.flag.toUpperCase() ?? ''
  }));
};

const GapTrend = ({ history }: { history: LiveSessionHistory | null }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const points = useMemo(() => gapTrendPointsFromHistory(history), [history]);
  const valuePoints = points.filter((point): point is SessionGapPoint & { value: number } => point.value !== null);
  const height = 236;
  const margin = { top: 18, right: 18, bottom: 31, left: 49 };
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const plotHeight = height - margin.top - margin.bottom;
  const sessionDomain = useMemo(() => timestampWindowDomain(points.map((point) => point.checkedAt)), [points]);
  const gapDomain = useMemo(() => dataDrivenGapDomain(points.map((point) => point.value)), [points]);
  const x = (checkedAtMs: number) => {
    if (!sessionDomain) return margin.left;
    return margin.left + ((checkedAtMs - sessionDomain.startMs) / (sessionDomain.endMs - sessionDomain.startMs)) * plotWidth;
  };
  const y = (gap: number) =>
    gapDomain ? margin.top + ((gap - gapDomain[0]) / (gapDomain[1] - gapDomain[0])) * plotHeight : margin.top + plotHeight / 2;
  const xTicks = sessionDomain ? adaptiveTimeTicks(sessionDomain, plotWidth) : [];
  const yTicks = gapDomain ? adaptiveNumericTicks(gapDomain, plotHeight) : [];
  const segments = contiguousValueSegments(points);
  const lapBoundaries = useMemo(() => {
    const boundaries: Array<{ lap: number; checkedAtMs: number }> = [];
    points.forEach((point) => {
      if (point.lap === null || boundaries.at(-1)?.lap === point.lap) return;
      boundaries.push({ lap: point.lap, checkedAtMs: point.checkedAtMs });
    });
    if (boundaries.length <= 7) return boundaries;
    const stride = Math.ceil(boundaries.length / 6);
    return boundaries.filter((_, index) => index % stride === 0 || index === boundaries.length - 1);
  }, [points]);

  const cautionBands = useMemo(() => {
    const bands: Array<{ from: number; to: number }> = [];
    points.forEach((point, index) => {
      const caution = isCautionFlag(point.flag);
      const last = bands.at(-1);
      if (caution && last && last.to === index - 1) last.to = index;
      else if (caution) bands.push({ from: index, to: index });
    });
    return bands;
  }, [points]);

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0 || !sessionDomain) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorTime = sessionDomain.startMs + Math.max(0, Math.min(1, (cursorX - margin.left) / plotWidth)) * (sessionDomain.endMs - sessionDomain.startMs);
    const point = points.reduce((closest, candidate) => Math.abs(candidate.checkedAtMs - cursorTime) < Math.abs(closest.checkedAtMs - cursorTime) ? candidate : closest);
    setTip({
      x: x(point.checkedAtMs),
      y: point.value === null ? margin.top + 12 : y(point.value),
      title: point.value === null ? 'Gap unavailable' : `+${point.value.toFixed(1)}s to leader`,
      detail: `${new Date(point.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}${point.flag && point.flag !== 'GREEN' ? ` · ${point.flag.toLowerCase()}` : ''}`
    });
  };

  const latestArrival = history?.samples.at(-1) ?? null;
  const latestValue = valuePoints.at(-1) ?? null;
  const spanMs = sessionDomain ? sessionDomain.endMs - sessionDomain.startMs : 0;

  return (
    <Card title="Distance to the leader" action={<SourcePill title="Distance to the leader" entries={sourceEntries.trend} />}>
      <div ref={ref} className="live-gap-chart">
        {points.length >= 2 && valuePoints.length >= 2 && sessionDomain && gapDomain ? (
          <>
            <div className="live-gap-chart__status" aria-live="polite">
              <strong>{latestValue ? `+${latestValue.value.toFixed(2)}s` : 'gap unavailable'}</strong>
              <span>{latestValue ? `current source ${new Date(latestValue.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'distance sample pending'}</span>
              <span>{latestArrival ? `latest 1s poll ${new Date(latestArrival.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'live poll pending'}</span>
              {history ? <span>{history.stats.arrivals} polls · {history.stats.valueChanges} payload changed · {history.stats.unchangedValues} unchanged</span> : null}
            </div>
            <p className="caption caption--secondary live-gap-chart__caption">
              Latest five minutes · Bryce’s sourced gap to P1 · smaller is higher · shaded = caution
            </p>
            {width > 0 ? (
              <svg
                ref={svgRef}
                width={width}
                height={height}
                role="img"
                aria-label="Bryce’s sourced gap to the leader over the latest five minutes, with smaller gaps plotted higher"
                data-time-domain-start={new Date(sessionDomain.startMs).toISOString()}
                data-time-domain-end={new Date(sessionDomain.endMs).toISOString()}
                data-gap-domain-min={gapDomain[0]}
                data-gap-domain-max={gapDomain[1]}
                data-missing-point-count={points.filter((point) => point.value === null).length}
                data-sample-count={points.length}
                data-live-arrival-count={history?.stats.arrivals ?? 0}
                data-chart-semantics="leader-gap-from-live-ranked-intervals"
                onMouseMove={onMove}
                onMouseLeave={() => setTip(null)}
              >
                {cautionBands.map((band, index) => {
                  const left = x(points[band.from].checkedAtMs);
                  const rightIndex = Math.min(band.to + 1, points.length - 1);
                  const right = x(points[rightIndex].checkedAtMs);
                  return <rect key={index} x={left} y={margin.top} width={Math.max(right - left, 2)} height={plotHeight} fill="var(--status-warn-dot)" opacity={0.1} />;
                })}
                {yTicks.map((tick) => (
                  <g key={tick}>
                    <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid-hairline)" />
                    <text x={margin.left - 7} y={y(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
                      {`${tick.toFixed(tick < 10 ? 1 : 0)}s`}
                    </text>
                  </g>
                ))}
                {segments.map((segment, index) => <path key={index} d={stepPath(segment, x, y)} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
                {latestValue ? <circle cx={x(latestValue.checkedAtMs)} cy={y(latestValue.value)} r={5} fill="var(--bryce)" stroke="var(--surface-1)" strokeWidth={2} /> : null}
                {xTicks.map((tick, index) => (
                  <text key={tick} x={x(tick)} y={height - 7} textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>{timeTickLabel(tick, spanMs)}</text>
                ))}
                {lapBoundaries.map((boundary) => (
                  <text key={`${boundary.lap}-${boundary.checkedAtMs}`} x={x(boundary.checkedAtMs)} y={margin.top + 11} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>L{boundary.lap}</text>
                ))}
              </svg>
            ) : null}
            {tip ? <ChartTipCard tip={tip} width={width} /> : null}
          </>
        ) : (
          <Unavailable>The distance trace appears after two sourced gap-to-leader values. Missing values remain breaks; no pace line is estimated.</Unavailable>
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

/* ---------- watch along: official routes, never a proxied broadcast ---------- */

const WatchAlong = ({ payload }: { payload: LiveReadiness }) => {
  const route = ((payload.raceWeekend as Row)?.broadcastRoute as Row) ?? null;
  const primary = (route?.primaryVideo as Row) ?? null;
  const audio = Array.isArray(route?.audio) ? (route.audio as Row[]) : [];
  const international = Array.isArray(route?.international) ? (route.international as Row[]) : [];
  const officialRoutes = [primary, ...audio.slice(0, 2), ...international.slice(0, 1)].filter((entry): entry is Row => Boolean(entry && asString(entry.url)));

  return (
    <Card
      className="live-watch"
      title={<><Tv size={15} aria-hidden /> Watch along</>}
      action={<SourcePill title="Watch along" entries={sourceEntries.watch} caveats={['Broadcast access and picture-in-picture support depend on the viewer’s service, device, and territory.']} />}
    >
      {officialRoutes.length > 0 ? (
        <div className="live-watch__routes">
          {officialRoutes.map((entry, index) => {
            const audioRoute = asString(entry.kind) === 'audio';
            return (
              <a key={asString(entry.id) ?? `${asString(entry.name)}-${index}`} href={asString(entry.url)!} target="_blank" rel="noreferrer" className="live-watch__route">
                {audioRoute ? <Radio size={15} aria-hidden /> : <Tv size={15} aria-hidden />}
                <span>{audioRoute ? 'Listen on' : index === 0 ? 'Watch on' : 'Open'} {asString(entry.name) ?? 'official coverage'}</span>
                <ExternalLink size={13} aria-hidden />
              </a>
            );
          })}
        </div>
      ) : (
        <Unavailable>The official session feed has not published a watch route for this state. It appears here only after EventSessionID matching.</Unavailable>
      )}
      <p className="live-watch__pip">start the broadcast, then pop it out — picture-in-picture sits nicely over this page.</p>
    </Card>
  );
};

/* ---------- the time machine: replay control bar + cueing state ---------- */

const durationLabel = (session: ReplaySessionInfo | null): string | null => {
  if (!session?.durationSeconds) return null;
  const minutes = Math.round(session.durationSeconds / 60);
  return `${minutes} min replay`;
};

/** Unmistakably a replay of archived data — no green live dot, its own quiet
 *  frame — with speed, restart-from-green, and an exit back to the race page. */
const ReplayBar = ({ replay, payload }: { replay: ReplaySession; payload: LiveReadiness | null }) => {
  const heartbeat = payload ? heartbeatOf(payload) : {};
  const venue = asString(heartbeat.trackName) ?? replay.venue ?? replay.session?.eventName ?? 'archived race';
  const year = replay.seasonYear ? ` ${replay.seasonYear}` : '';
  return (
    <section className="replay-bar" aria-label="Race replay controls" data-replay-speed={replay.speed}>
      <div className="replay-bar__id">
        <span className="replay-bar__chip"><History size={13} aria-hidden /> Replay</span>
        <span className="replay-bar__where">
          {venue}
          {year} · <span className="replay-bar__speed-read">{replay.speed}×</span>
        </span>
      </div>
      <div className="replay-bar__controls">
        <div className="segmented replay-bar__speeds" role="group" aria-label="Replay speed">
          {replay.speeds.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`segmented__option${speed === replay.speed ? ' segmented__option--active' : ''}`}
              onClick={() => replay.setSpeed(speed)}
              aria-pressed={speed === replay.speed}
            >
              {speed}×
            </button>
          ))}
        </div>
        <button type="button" className="replay-bar__btn" onClick={replay.restart}>
          <RotateCcw size={13} aria-hidden /> Restart
        </button>
        <button type="button" className="replay-bar__btn replay-bar__btn--exit" onClick={replay.exit}>
          <X size={13} aria-hidden /> Exit replay
        </button>
      </div>
    </section>
  );
};

/** Honest hand-off when the server live-guard preempts a running replay: the
 *  real Race Control feed is live now, so we say so plainly and let the live
 *  page below render reality. */
const ReplayEndedByLiveNote = () => (
  <section className="replay-ended-note" role="status">
    <span className="replay-bar__chip"><History size={13} aria-hidden /> Replay ended</span>
    <span>A live session is on — this is the real Race Control feed now.</span>
  </section>
);

const ReplayCueing = ({ session }: { session: ReplaySessionInfo | null }) => {
  const duration = durationLabel(session);
  return (
    <HeroPanel>
      <span className="kicker">Cueing up the replay</span>
      <h1 className="screen-head__title" style={{ marginTop: 8 }}>{session?.eventName ?? 'Archived race'}</h1>
      <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
        Rewinding to the green flag from our own one-second capture{duration ? ` · ${duration}` : ''}. The page below will
        move exactly as it did on the day.
      </p>
    </HeroPanel>
  );
};

/** Honest dead-end when a replay cannot start — an unwatchable/unknown capture,
 *  the overlay disabled, the service unreachable, or the server refusing. It
 *  always carries the reason and an exit back to the race, so a family tap can
 *  never sit forever on "Cueing up the replay." */
const ReplayRefused = ({ replay }: { replay: ReplaySession }) => (
  <HeroPanel>
    <span className="kicker">This replay can’t start</span>
    <h1 className="screen-head__title" style={{ marginTop: 8 }}>{replay.session?.eventName ?? 'Archived race'}</h1>
    <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
      {replay.refusedReason ?? 'The replay service did not start playback.'}
    </p>
    <div style={{ marginTop: 18 }}>
      <button type="button" className="replay-bar__btn replay-bar__btn--exit" onClick={replay.exit}>
        <X size={13} aria-hidden /> Back to the race
      </button>
    </div>
  </HeroPanel>
);

/* ---------- post-checkered honesty: as-raced order vs official classification ---------- */

/** True once the archived session has run its full distance and gone cold —
 *  the flag is no longer green or caution and the lap counter has reached the
 *  total. Presentation-layer only; readiness semantics are untouched. */
const isPostCheckeredPayload = (payload: LiveReadiness): boolean => {
  const heartbeat = heartbeatOf(payload);
  const weekend = payload.raceWeekend as Row;
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  return (
    lap !== null && totalLaps !== null && totalLaps > 0 && lap >= totalLaps && !isCautionFlag(flag) && (flag ?? '').toUpperCase() !== 'GREEN'
  );
};

const normalizeName = (value: string | null | undefined) =>
  (value ?? '').toLowerCase().replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim();

const lastToken = (value: string) => value.split(' ').filter(Boolean).at(-1) ?? '';

/** Lenient "same winner" test: only a clearly different name trips the note, so
 *  a name-format difference never invents a stewards story. */
const winnersLikelySame = (asRaced: string, official: string) => {
  const a = normalizeName(asRaced);
  const b = normalizeName(official);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a) || lastToken(a) === lastToken(b);
};

/** One quiet line, only when the replay's on-road leader at the flag differs from
 *  the canonical classification (e.g. Road America 2026 R2, a post-race DQ). The
 *  house rule: classification comes from canonical results, the replay shows the
 *  as-raced truth. Not a general stewards feature — just this computed line. */
const ReplayClassificationNote = ({ payload, canonicalSessionId }: { payload: LiveReadiness; canonicalSessionId: string | null }) => {
  const [officialWinner, setOfficialWinner] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setOfficialWinner(null);
    if (!canonicalSessionId) return undefined;
    loadRaceStory(canonicalSessionId)
      .then((story) => {
        if (cancelled || !story) return;
        setOfficialWinner(story.lapChart.drivers.find((driver) => driver.finishPosition === 1)?.driverName ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canonicalSessionId]);

  if (!isPostCheckeredPayload(payload) || !officialWinner) return null;

  const rows = sortRowsForLiveDisplay(liveRowsOf(payload)) as LiveRow[];
  const leader = rows.find((row) => livePosition(row) === 1) ?? rows[0];
  const asRacedLeader = leader ? driverLabel(leader) : null;
  if (!asRacedLeader || winnersLikelySame(asRacedLeader, officialWinner)) return null;

  return (
    <p className="replay-classification" role="note">
      As raced. The official classification changed after post-race review; the race page carries the final result.
    </p>
  );
};

/* ---------- screen ---------- */

export const LiveScreen = ({
  payload,
  fixtureMode,
  history,
  replay = null
}: {
  payload: LiveReadiness | null;
  fixtureMode: boolean;
  history: LiveSessionHistory | null;
  replay?: ReplaySession | null;
}) => {
  const samples = useMemo(() => gapSamplesFromHistory(history), [history]);
  // A replay that a live session preempted is no longer "active": the page drops
  // the replay chrome and cueing and renders the real feed with an honest note.
  const replayEndedByLive = Boolean(replay?.endedByLive);
  // A replay the overlay could not engage (refusal, unwatchable/unknown capture,
  // service unreachable) is rendered as an honest, exitable dead-end — never a
  // cue-up that never clears, and never a silent fall-through to the live feed.
  const replayRefused = Boolean(replay?.refusedReason) && !replayEndedByLive;
  const replayActive = Boolean(replay && !replay.unavailable && !replayRefused && !replayEndedByLive);
  const replaySimulated = payload ? isSimulatedReplayPayload(payload) : false;
  // Until the virtual clock's first archived payload arrives, hold a calm
  // cue-up state instead of flashing whatever the live feed happens to say.
  const cueing = replayActive && !replaySimulated;

  if (replayRefused && replay) {
    return (
      <div className="page stack live-page" data-replay-active="false">
        <ReplayRefused replay={replay} />
      </div>
    );
  }

  if (!payload || cueing) {
    return (
      <div className="page stack live-page" data-replay-active={replayActive ? 'true' : 'false'}>
        {replayEndedByLive ? <ReplayEndedByLiveNote /> : null}
        {replayActive && replay ? <ReplayBar replay={replay} payload={payload} /> : null}
        {replayActive && replay ? (
          <ReplayCueing session={replay.session} />
        ) : (
          <>
            <div className="skeleton" style={{ height: 42 }} />
            <div className="skeleton" style={{ height: 300 }} />
            <div className="grid live-layout"><div className="skeleton" style={{ height: 340 }} /><div className="skeleton" style={{ height: 540 }} /></div>
          </>
        )}
      </div>
    );
  }

  const liveish = payload.state === 'ready' || payload.state === 'degraded';
  // Replay-scoped presentation override: a finished-race replay must never read
  // "pre-session". When the archive has run its distance and gone cold, the race
  // layout stays up with a "Race complete · as raced" hero. Display-layer only —
  // readiness semantics and fixture states are untouched.
  const replayEnded = replayActive && replaySimulated && isPostCheckeredPayload(payload);
  const latestHistorySample = history?.samples.at(-1) ?? null;
  const liveHeartbeat = heartbeatOf(payload);
  const payloadSessionKey = [asString(liveHeartbeat.eventId), asString(liveHeartbeat.eventSessionId)].filter(Boolean).join('-');
  return (
    <div
      className="page stack live-page"
      data-replay-active={replayActive ? 'true' : 'false'}
      data-live-payload-session-key={payloadSessionKey}
      data-live-session-key={history?.sessionKey ?? ''}
      data-live-source-checked-at={latestHistorySample?.checkedAt ?? ''}
      data-live-arrival-checked-at={latestHistorySample?.arrivalCheckedAt ?? ''}
      data-live-history-count={history?.samples.length ?? 0}
      data-live-history-first-checked-at={history?.samples[0]?.checkedAt ?? ''}
    >
      {replayEndedByLive ? <ReplayEndedByLiveNote /> : null}
      {replayActive && replay ? <ReplayBar replay={replay} payload={payload} /> : null}
      {replayActive && replay ? <ReplayClassificationNote payload={payload} canonicalSessionId={replay.session?.canonicalSessionId ?? null} /> : null}
      <TrustRail payload={payload} fixtureMode={fixtureMode} />
      {liveish || replayEnded ? (
        <>
          <LiveHero payload={payload} samples={samples} replayEnded={replayEnded} />
          <BattleModule payload={payload} samples={samples} history={history} />
          <div className="grid live-layout">
            <div className="stack live-layout__main">
              <PointsJumbotron payload={payload} />
              <GapTrend history={history} />
            </div>
            <FieldTower payload={payload} />
          </div>
        </>
      ) : (
        <>
          <WaitingState payload={payload} />
          <div className="grid live-layout">
            <PointsJumbotron payload={payload} />
            <GapTrend history={history} />
          </div>
        </>
      )}
      {replayActive ? null : <WatchAlong payload={payload} />}
    </div>
  );
};
