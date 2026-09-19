import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { asNumber, asString, formatDate, formatGap, formatNumber } from '../app/format';
import { Link, useRouter } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { LiveRunningOrder } from './LiveRunningOrder';
import { useNextSession } from '../app/useNextSession';
import { getNextEvent, raceDayOf } from '../data/upcoming';
import { trackOutlineFor } from '../assets/tracks';
import type { LiveReadiness, ReplaySourceGap } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import { isBryceCastCaptureTier, replayProvenance, watchableCaptureForRace, type ReplaySessionInfo } from '../data/replayAvailable';
import { useReplayCatalog, ReplayAffordance } from './replayAffordance';
import { chronoCompare, displayRaceLabel, displayRaceLabelText, loadDebriefArchive, type ArchiveEntry } from '../data/debriefArchive';
import { loadRaceStory } from '../data/raceStory';
import {
  advanceBattleAxis,
  battleAxisExtentSeconds,
  BATTLE_AXIS_LADDER,
  buildFieldCompression,
  buildLiveBattleFrame,
  buildOfficialPointsWindow,
  captureAgeSeconds,
  createBattleAxisState,
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
  type BattleAxisState,
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
import {
  bestLapDeltaWords,
  buildBestLapDeltas,
  resolveLiveSessionKind,
  sessionOrderWording,
  sessionRankCaption,
  type BestLapDeltas,
  type LiveSessionKind
} from '../data/liveSessionModel';
import { uiDataPackage } from '../data/uiDataPackage';
import { canonicalLiveRaceSessionId, replayDeepLinkQuery } from '../data/liveRaceShellModel';
import { ReplayGapSkippedNote, ReplaySourceGapNotice } from './replaySourceGap';

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

/* The fastest last-lap average in the field, for the hero speed line. Speeds
 * are per-lap averages from official timing — apples-to-apples against Bryce's
 * own last lap, never a claim of instantaneous velocity. */
const fastestLastSpeedInField = (rows: LiveRow[]): { speed: number; row: LiveRow } | null => {
  let best: { speed: number; row: LiveRow } | null = null;
  for (const row of rows) {
    const speed = asNumber(row.lastSpeed);
    if (speed === null || speed <= 0) continue;
    if (!best || speed > best.speed) best = { speed, row };
  }
  return best;
};

/* The fastest best-lap average speed in the field, for the practice/qualifying
 * hero speed line. `bestSpeed` is the per-car fastest-lap average from official
 * timing — the right currency when the session is scored by best lap, not by
 * the last lap completed. */
const fastestBestSpeedInField = (rows: LiveRow[]): { speed: number; row: LiveRow } | null => {
  let best: { speed: number; row: LiveRow } | null = null;
  for (const row of rows) {
    const speed = asNumber(row.bestSpeed);
    if (speed === null || speed <= 0) continue;
    if (!best || speed > best.speed) best = { speed, row };
  }
  return best;
};

const sourceEntries = {
  hero: [
    {
      label: 'Race Control timing feed · car 9 identity guard',
      path: '/api/readiness + /api/timing',
      note: 'Position, lap, flag, gaps, and neighboring drivers come from the active INDY NXT timing payload. Car 9 must match source driver identity 2143 or Bryce Aron.'
    },
    {
      label: 'Lap average speed · official timing',
      path: '/api/readiness → liveTiming.rows[].lastSpeed / bestSpeed',
      note: 'Per-lap average speeds published by official timing, updating once per completed lap. These are lap averages, not instantaneous velocity — BryceCast shows no speedometer dial.'
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
  bestLap: [
    {
      label: 'Race Control timing feed · per-car best lap',
      path: '/api/readiness → liveTiming.rows[].bestLapTime',
      note: 'Each car’s fastest lap of the session, exactly as published. Deltas subtract sourced best-lap times; a car with no published best lap does not appear. These are best-lap gaps, not on-track intervals — practice and qualifying cars run different cycles, so this is never a running order.'
    },
    {
      label: 'Race Control timing feed · best-lap order',
      path: '/api/readiness → liveTiming.rows[].liveRank / rank',
      note: 'Outside a race, Race Control ranks the field by best lap. BryceCast displays that order and labels it as best-lap order, never a running position.'
    }
  ],
  battle: [
    {
      label: 'Race Control timing feed · Bryce-centered corridor',
      path: '/api/readiness → liveTiming.rows[].liveGap',
      note: 'The corridor walks Race Control’s live interval to the preceding ranked car around Bryce. Missing intervals break the chain; no gap is filled with zero and no GPS position is inferred. The frame width steps along a fixed ladder (±1s to ±8s) to fit the nearest cars, and only rescales when the pack meaningfully compresses or spreads.'
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

/** Brief P: one eased rescale ≤300ms, strong ease-out, GPU-only transforms. */
const AXIS_RESCALE_TRANSITION_MS = 250;

interface AxisTransitionLogEntry {
  at: string;
  evalIndex: number;
  from: number;
  to: number;
  occupancy: number | null;
  breach: 'low' | 'high';
}

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
  const frameCars = frame?.cars ?? [];

  /* The breathing axis (Brief P). One evaluation per sourced poll: the frame
   * width walks the quantized ladder (±1s, ±2s, ±4s, ±8s) to fit the nearest
   * cars, rescaling only on a hysteresis breach (<55% / >90% occupancy). All
   * ladder law lives in liveMotionModel; this component only holds the state
   * and renders the step. */
  const pollKey = liveSourceCheckedAtOf(payload);
  const sessionKey = history?.sessionKey ?? null;
  const axisRef = useRef<{ sessionKey: string | null; state: BattleAxisState } | null>(null);
  const axisLog = useRef<AxisTransitionLogEntry[]>([]);
  const breachCount = useRef(0);
  const evalCount = useRef(0);
  const lastPollKey = useRef<string | null>(null);
  const [axisStep, setAxisStep] = useState<number>(() => createBattleAxisState(null).step);
  const [rescaleStamp, setRescaleStamp] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!pollKey || pollKey === lastPollKey.current) return;
    lastPollKey.current = pollKey;
    const rawExtent = battleAxisExtentSeconds(frameCars);
    if (!axisRef.current || axisRef.current.sessionKey !== sessionKey) {
      // A fresh session snaps straight to the best fit — no motion on arrival.
      axisRef.current = { sessionKey, state: createBattleAxisState(rawExtent) };
      axisLog.current = [];
      breachCount.current = 0;
      evalCount.current = 0;
      setAxisStep(axisRef.current.state.step);
      setRescaleStamp(null);
      return;
    }
    evalCount.current += 1;
    const from = axisRef.current.state.step;
    const { state, decision } = advanceBattleAxis(axisRef.current.state, rawExtent);
    axisRef.current = { sessionKey, state };
    if (decision.breach) breachCount.current += 1;
    if (decision.changed && decision.breach) {
      axisLog.current = [
        ...axisLog.current,
        { at: pollKey, evalIndex: evalCount.current, from, to: decision.step, occupancy: decision.occupancy, breach: decision.breach }
      ].slice(-80);
      setAxisStep(decision.step);
      if (!reducedMotion) setRescaleStamp(Date.now());
    }
    // frameCars is derived from the same payload as pollKey; the poll guard owns the cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollKey, sessionKey, reducedMotion]);

  useEffect(() => {
    if (rescaleStamp === null) return undefined;
    const timer = window.setTimeout(() => setRescaleStamp(null), AXIS_RESCALE_TRANSITION_MS + 60);
    return () => window.clearTimeout(timer);
  }, [rescaleStamp]);
  const rescaling = rescaleStamp !== null && !reducedMotion;

  const step = axisStep;
  const maxLadderStep = BATTLE_AXIS_LADDER[BATTLE_AXIS_LADDER.length - 1];
  const renderExtent = battleAxisExtentSeconds(frameCars);
  const cars = frameCars
    .filter((car) => Math.abs(car.offsetSeconds) <= maxLadderStep)
    .sort((left, right) => left.id.localeCompare(right.id));
  const margin = { left: 36, right: 36 };
  const plotWidth = Math.max(width - margin.left - margin.right, 120);
  const axisY = 82;
  const labelLanes = [17, 34, 51, 67, 116, 133, 150, 167];
  const x = (seconds: number) => margin.left + ((Math.max(-step, Math.min(step, seconds)) + step) / (2 * step)) * plotWidth;
  const carInFrame = (offsetSeconds: number) => Math.abs(offsetSeconds) <= step;
  const axisTicks = step >= 1 ? [-step, -step / 2, 0, step / 2, step] : [-step, 0, step];
  const tickLabel = (tick: number) => (tick === 0 ? '0' : `${Math.abs(tick) < 1 ? Math.abs(tick).toFixed(1) : Math.abs(tick)}s`);
  const lanesByDriver = resolveStableLabelLanes(
    cars.filter((car) => carInFrame(car.offsetSeconds)).map((car) => ({ id: car.id, surname: car.surname, x: x(car.offsetSeconds) })),
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
    <div ref={ref} className={`live-battle__corridor${rescaling ? ' live-battle__corridor--rescale' : ''}`}>
      {width > 0 && frame ? (
        <>
          <svg
            width={width}
            height={194}
            role="img"
            aria-label={`Cars within ${step} second${step === 1 ? '' : 's'} of Bryce on a Bryce-centered seconds axis`}
            data-battle-corridor
            data-session-key={sessionKey ?? ''}
            data-axis-ladder={BATTLE_AXIS_LADDER.join(',')}
            data-axis-step={step}
            data-axis-extent={renderExtent?.toFixed(4) ?? ''}
            data-axis-occupancy={renderExtent === null ? '' : (renderExtent / step).toFixed(4)}
            data-axis-eval-count={evalCount.current}
            data-axis-breach-count={breachCount.current}
            data-axis-transition-count={axisLog.current.length}
            data-axis-transitions={JSON.stringify(axisLog.current)}
            data-axis-motion={reducedMotion ? 'off' : rescaling ? 'rescale' : animateCoordinates ? 'drift' : 'static'}
            data-axis-poll-checked-at={pollKey ?? ''}
          >
            <line x1={margin.left} x2={width - margin.right} y1={axisY} y2={axisY} stroke="var(--axis-baseline)" />
            {axisTicks.map((tick) => (
              <g key={tick} className="live-battle__tick" transform={`translate(${x(tick)} 0)`} data-axis-tick={tick}>
                <line x1={0} x2={0} y1={axisY - (tick === 0 ? 9 : 5)} y2={axisY + (tick === 0 ? 9 : 5)} stroke={tick === 0 ? 'var(--bryce)' : 'var(--axis-baseline)'} />
                <text x={0} y={axisY + 23} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>{tickLabel(tick)}</text>
              </g>
            ))}
            {cars.map((car) => {
              const visible = carInFrame(car.offsetSeconds);
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
                  data-in-frame={visible ? 'true' : 'false'}
                  opacity={visible ? 1 : 0}
                  aria-hidden={visible ? undefined : true}
                  pointerEvents={visible ? undefined : 'none'}
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
                    tabIndex={visible ? 0 : -1}
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
            {/* The protagonist marker never moves (his frame) and never fades —
                no opacity, no focus-dim class, ever (lesson 7). */}
            <g transform={`translate(${x(0)} ${axisY})`} data-protagonist="bryce">
              <rect x={-15} y={-11} width={30} height={22} rx={4} fill="var(--bryce)" />
              <text y={1} textAnchor="middle" dominantBaseline="middle" fill="#1d1d1f" fontFamily={chartFont} fontSize={12} fontWeight={750}>№9</text>
            </g>
            <text x={margin.left} y={188} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>behind Bryce</text>
            <text x={margin.left + plotWidth / 2} y={188} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5} data-axis-frame-note>
              {width < 520 ? `seconds · ±${step}s` : `gaps in seconds · frame ±${step}s`}
            </text>
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

/* ---------- best-lap deltas: the practice/qualifying comparison ---------- */

/** Quiet house rows: the session best (the lap to beat), Bryce measured against
 *  it, and Bryce's same-team cars measured against Bryce. No corridor, no
 *  on-track framing — best-lap gaps only. */
const BestLapDeltas = ({ deltas }: { deltas: BestLapDeltas | null }) => {
  if (!deltas) {
    return <Unavailable>Best-lap comparisons appear once Race Control publishes a best lap for the field.</Unavailable>;
  }
  const { leader, bryce, bryceIsFastest, offSessionBestSeconds, teammates } = deltas;
  return (
    <div className="best-lap-deltas">
      <div className={`best-lap-deltas__row${leader.isBryce ? ' best-lap-deltas__row--bryce' : ''}`} data-role={leader.isBryce ? 'leader bryce' : 'leader'}>
        <span className="best-lap-deltas__pos">{leader.isBryce ? <Plate size="row" /> : 'P1'}</span>
        <span className="best-lap-deltas__name">{leader.isBryce ? 'Bryce' : leader.surname}</span>
        <span className="best-lap-deltas__time"><TickerValue value={leader.bestLapTime} valueKey={leader.bestLapTime} /></span>
        {leader.isBryce ? (
          <span className="best-lap-deltas__delta best-lap-deltas__delta--up">the lap to beat</span>
        ) : (
          <span className="best-lap-deltas__delta best-lap-deltas__delta--flat">the lap to beat</span>
        )}
      </div>
      {teammates.map((teammate) => (
        <div className="best-lap-deltas__row" key={teammate.entry.id} data-role="teammate">
          <span className="best-lap-deltas__pos">№{teammate.entry.carNo || '—'}</span>
          <span className="best-lap-deltas__name">{teammate.entry.surname}<span className="best-lap-deltas__tag">teammate</span></span>
          <span className="best-lap-deltas__time"><TickerValue value={teammate.entry.bestLapTime} valueKey={teammate.entry.bestLapTime} /></span>
          <span className="best-lap-deltas__delta">Bryce {bestLapDeltaWords(teammate.bryceAheadSeconds)}</span>
        </div>
      ))}
      {/* Bryce's own row appears only when he is NOT the session best — when he
          is, the leader row above already IS his row (Plate, "the lap to beat").
          Rendering both would double him. */}
      {bryce && !bryceIsFastest ? (
        <div className="best-lap-deltas__row best-lap-deltas__row--bryce" data-role="bryce">
          <span className="best-lap-deltas__pos"><Plate size="row" /></span>
          <span className="best-lap-deltas__name">Bryce</span>
          <span className="best-lap-deltas__time"><TickerValue value={bryce.bestLapTime} valueKey={bryce.bestLapTime} /></span>
          <span className="best-lap-deltas__delta">
            {offSessionBestSeconds !== null ? `${offSessionBestSeconds.toFixed(offSessionBestSeconds < 10 ? 2 : 1)}s off the best` : 'best lap pending'}
          </span>
        </div>
      ) : null}
      <p className="caption caption--secondary best-lap-deltas__currency">gaps in seconds · best laps</p>
    </div>
  );
};

/* ---------- Brief J stage 2: the field-compression ticker ----------
 * A quiet one-line fact under the corridor: how many cars sit in Bryce's
 * contiguous pack and the time it covers, plus how many pairs across the field
 * run within a second. Facts from the same sourced gaps the battle uses — no
 * probabilities, no forecasts. Under caution the field bunches behind the pace
 * car for reasons that have nothing to do with racing, so it states the honest
 * bunch instead of a racing number; it is absent outside a race, when the gaps
 * cannot be read, or when a caution feed has gone stale. */
const FieldCompressionTicker = ({ payload, sessionKind }: { payload: LiveReadiness; sessionKind: LiveSessionKind }) => {
  if (sessionKind !== 'race') return null;
  const heartbeat = heartbeatOf(payload);
  const flag = asString(heartbeat.currentFlag ?? heartbeat.flag ?? (payload.raceWeekend as Row).flag);
  // A stopped session isn't racing, so there is no compression to speak of.
  if (isRedFlag(flag)) return null;

  if (isCautionFlag(flag)) {
    // The gaps still read, but under yellow they compress artificially. Say the
    // bunch plainly; when the feed has also gone stale, stay silent rather than
    // imply a live read.
    if (payload.state === 'stale' || payload.state === 'blocked') return null;
    return (
      <p className="caption caption--secondary live-battle__compression" data-field-compression="caution">
        Under caution — field bunched
      </p>
    );
  }

  const compression = buildFieldCompression(liveRowsOf(payload), liveBryceRowOf(payload));
  if (!compression) return null;

  const tightText = `${compression.tightGapSeconds.toFixed(1)}s`;
  const coveredText = `${compression.packCoveredSeconds.toFixed(1)}s`;
  const pairWord = compression.pairsWithinTight === 1 ? 'pair' : 'pairs';

  let body: ReactNode;
  if (compression.packCars >= 2) {
    body = (
      <>
        <TickerValue value={compression.packCars} valueKey={compression.packCars} /> cars covered by{' '}
        <TickerValue value={coveredText} valueKey={coveredText} /> around Bryce
        {compression.pairsWithinTight > 0 ? (
          <>
            {' '}·{' '}
            <TickerValue value={compression.pairsWithinTight} valueKey={compression.pairsWithinTight} /> {pairWord} within {tightText}
          </>
        ) : null}
      </>
    );
  } else if (compression.pairsWithinTight >= 1) {
    body = (
      <>
        <TickerValue value={compression.pairsWithinTight} valueKey={compression.pairsWithinTight} /> {pairWord} within {tightText} across the field
      </>
    );
  } else {
    body = <>The field is spread — no pairs within {tightText}</>;
  }

  return (
    <p
      className="caption caption--secondary live-battle__compression"
      data-field-compression="green"
      data-gap-basis={compression.gapBasis}
      data-pack-cars={compression.packCars}
      data-pack-covered={compression.packCoveredSeconds.toFixed(3)}
      data-pairs-within={compression.pairsWithinTight}
    >
      {body}
    </p>
  );
};

const BattleModule = ({ payload, samples, history, replayEnded = false, sessionKind }: { payload: LiveReadiness; samples: GapSample[]; history: LiveSessionHistory | null; replayEnded?: boolean; sessionKind: LiveSessionKind }) => {
  if (sessionKind !== 'race') {
    const deltas = buildBestLapDeltas(liveRowsOf(payload));
    const sessionNoun = sessionKind === 'qualifying' ? 'qualifying' : 'the session';
    const cycleNoun = sessionKind === 'qualifying' ? 'qualifying' : 'practice';
    return (
      <Card className="live-battle" title="Best-lap order" action={<SourcePill title="Best-lap order" entries={sourceEntries.bestLap} />}>
        <p className="live-battle__intro">The fastest lap each car has set, gold is Bryce. These are best-lap gaps, not on-track position — cars run different cycles in {cycleNoun}.</p>
        <BestLapDeltas deltas={deltas} />
        <div className="live-battle__divider" />
        <p className="live-battle__shared-title">Best-lap order over {sessionNoun}</p>
        <LiveRunningOrder history={history} clockCheckedAt={liveSourceCheckedAtOf(payload)} replayEnded={replayEnded} wording={sessionOrderWording(sessionKind)} />
        <p className="caption caption--secondary live-battle__caption">Five minutes of best-lap order · gold is Bryce · neutral line patterns stay with each driver · ○ a best-lap order change involving Bryce</p>
      </Card>
    );
  }
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
      <FieldCompressionTicker payload={payload} sessionKind={sessionKind} />
      <div className="live-battle__divider" />
      <p className="live-battle__shared-title">The running order</p>
      <LiveRunningOrder history={history} clockCheckedAt={liveSourceCheckedAtOf(payload)} replayEnded={replayEnded} />
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

const LiveHero = ({ payload, samples, replayEnded = false, sessionKind }: { payload: LiveReadiness; samples: GapSample[]; replayEnded?: boolean; sessionKind: LiveSessionKind }) => {
  const weekend = payload.raceWeekend as Row;
  const heartbeat = heartbeatOf(payload);
  const bryce = liveBryceRowOf(payload);
  const isRace = sessionKind === 'race';
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const rank = bryce ? livePosition(bryce) : null;
  const sessionName = asString(heartbeat.sessionName ?? weekend.sessionName);
  const outline = trackOutlineFor(asString(heartbeat.trackName ?? weekend.trackName));
  const progress = lap !== null && totalLaps !== null && totalLaps > 0 ? lap / totalLaps : 0;
  const pointsWindow = buildOfficialPointsWindow(liveRowsOf(payload));
  const points = payload.points as Row;
  const historicalRank = asNumber((points.bryce as Row)?.historicalRank);
  const standingMove = historicalRank !== null && pointsWindow ? historicalRank - pointsWindow.bryce.projectedStanding : null;

  // Best-lap comparison for practice/qualifying — the currency when the field
  // is scored by fastest lap, not by finishing order.
  const bestDeltas = isRace ? null : buildBestLapDeltas(liveRowsOf(payload));

  // The speed line switches currency with the session: last lap in a race,
  // best lap outside one. Both are official per-lap averages, never a dial.
  const bryceLastSpeed = bryce ? asNumber(bryce.lastSpeed) : null;
  const bryceBestSpeed = bryce ? asNumber(bryce.bestSpeed) : null;
  const speedValue = isRace ? bryceLastSpeed : bryceBestSpeed;
  const fieldFastest = isRace ? fastestLastSpeedInField(liveRowsOf(payload)) : fastestBestSpeedInField(liveRowsOf(payload));
  const bryceHoldsFastest =
    speedValue !== null && (fieldFastest === null || fieldFastest.speed <= speedValue + 0.05);
  const fastestName = fieldFastest ? driverLabel(fieldFastest.row) : null;
  const speedLead = isRace ? 'Last lap' : 'Best lap';
  const speedFastestCopy = isRace ? 'fastest last lap in the field' : 'fastest best lap in the field';
  const underCaution = isCautionFlag(flag);

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
            {isRace ? (
              <TickerValue className="live-lap" value={lap !== null && totalLaps !== null ? `Lap ${lap} of ${totalLaps}` : sessionName ?? 'Session live'} valueKey={`${lap ?? 'na'}-${totalLaps ?? 'na'}`} />
            ) : (
              /* No lap counter outside a race — a session has no finish line. The
               * payload carries no session clock, so we show its name and status,
               * never an invented elapsed time. */
              <TickerValue className="live-lap" value={sessionName ?? 'Session live'} valueKey={sessionName ?? 'session'} />
            )}
          </div>
          <div className="live-position">
            <Plate size="hero" />
            <div>
              <span className="caption">{sessionRankCaption(sessionKind)}</span>
              <TickerValue className="stat__value stat__value--hero live-position__value" value={rank !== null ? `P${rank}` : '—'} valueKey={rank ?? 'na'} />
              {isRace && positionStory ? <span className={`stat__delta${positionStory.up ? ' stat__delta--up' : ''}`}>{positionStory.text}</span> : null}
            </div>
          </div>
          {speedValue !== null ? (
            <p className="live-hero__speed caption caption--secondary">
              {isRace && underCaution ? (
                /* Under yellow the field runs to a controlled caution pace, so
                 * the drop is real but a cross-car comparison would pit laps
                 * that aren't the same caution lap against each other. Keep
                 * Bryce's own last lap; omit the field comparison. */
                <>
                  Last lap under caution ·{' '}
                  <TickerValue
                    className="live-hero__speed-value"
                    value={`${speedValue.toFixed(1)} mph`}
                    valueKey={`${lap ?? 'na'}-${speedValue}`}
                  />
                </>
              ) : (
                <>
                  {speedLead}{' '}
                  <TickerValue
                    className="live-hero__speed-value"
                    value={`${speedValue.toFixed(1)} mph`}
                    valueKey={`${lap ?? 'na'}-${speedValue}`}
                  />
                  {bryceHoldsFastest ? (
                    <> · {speedFastestCopy}</>
                  ) : (
                    <>
                      {' · '}field best: {fastestName ? `${fastestName}, ` : ''}
                      <TickerValue
                        className="live-hero__speed-value"
                        value={`${fieldFastest!.speed.toFixed(1)} mph`}
                        valueKey={`${lap ?? 'na'}-${fieldFastest!.speed}`}
                      />
                    </>
                  )}
                </>
              )}
            </p>
          ) : null}
        </div>
        <div className="hero-race__art live-hero__art">
          {outline ? <TrackArt outline={outline} showCornerLabels={false} maxHeight={150} /> : null}
          <span className="caption caption--secondary live-hero__art-caption">full circuit outline · no car-position data</span>
          {/* Race completion is a race-only idea — a practice or qualifying
              session runs to the clock, not a lap total. */}
          {isRace ? (
            <>
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
            </>
          ) : null}
        </div>
        {isRace ? (
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
        ) : (
          /* Outside a race there is no championship math — the headline is
             Bryce's best lap and how far it sits off the session best. */
          <div className="live-hero__jumbotron">
            <span className="caption">Bryce's best lap</span>
            {bestDeltas?.bryce ? (
              <>
                <div className="row live-hero__standing-row">
                  <TickerValue className="stat__value stat__value--big" value={bestDeltas.bryce.bestLapTime} valueKey={bestDeltas.bryce.bestLapTime} />
                  {bestDeltas.bryceIsFastest ? (
                    <span className="stat__delta stat__delta--up">fastest in the field</span>
                  ) : bestDeltas.offSessionBestSeconds !== null ? (
                    <span className="stat__delta stat__delta--flat">{bestDeltas.offSessionBestSeconds.toFixed(bestDeltas.offSessionBestSeconds < 10 ? 2 : 1)}s off the best</span>
                  ) : null}
                </div>
                {bestDeltas.bryceIsFastest ? (
                  <div className="live-hero__running-points">the lap to beat, right now</div>
                ) : (
                  <div className="live-hero__running-points">P1 <TickerValue className="live-hero__points-number" value={bestDeltas.leader.surname} valueKey={bestDeltas.leader.surname} /> set {bestDeltas.leader.bestLapTime}</div>
                )}
                <span className="live-points__provisional">gaps in seconds · best laps</span>
              </>
            ) : (
              <Unavailable>Bryce's best lap appears once Race Control publishes it.</Unavailable>
            )}
          </div>
        )}
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

const FieldTower = ({ payload, sessionKind }: { payload: LiveReadiness; sessionKind: LiveSessionKind }) => {
  const isRace = sessionKind === 'race';
  const rows = useMemo(() => sortRowsForLiveDisplay(liveRowsOf(payload)) as LiveRow[], [payload]);
  const changedIds = useFieldRankChanges(rows);
  const standings = uiDataPackage.screens.upcomingPrep.standingsSnapshot;
  const careerRivals = uiDataPackage.screens.careerLab.headToHead;
  const bryceRank = livePosition(rows.find((row) => row.bryce === true) ?? {});
  const bryceTeam = asString((rows.find((row) => row.bryce === true) ?? {}).team)?.toLowerCase() ?? null;
  if (rows.length === 0) {
    return (
      <Card title="The field" action={<SourcePill title="The field" entries={sourceEntries.tower} />}>
        <Unavailable>The {isRace ? 'running order' : 'best-lap order'} appears when Race Control publishes timing rows for Bryce’s session.</Unavailable>
      </Card>
    );
  }

  return (
    <Card flush className="live-field" title="The field" action={<SourcePill title="The field" entries={isRace ? sourceEntries.tower : sourceEntries.bestLap} />}>
      <div className="tower" role="table" aria-label={isRace ? 'Full live running order' : 'Full field by best lap'}>
        <div className="tower__row live-field__header" role="row">
          <span>P</span>
          <span>driver</span>
          <span>{isRace ? 'gap to leader' : 'best lap'}</span>
        </div>
        {rows.map((row, index) => {
          const rowId = stableDriverId(row);
          const isBryce = row.bryce === true;
          const rank = livePosition(row);
          const previous = rows[index - 1];
          // Same-team match: Bryce's team when known (a truthful teammate flag in
          // any series), falling back to the historical Ganassi entry.
          const rowTeam = asString(row.team)?.toLowerCase() ?? null;
          const teammate = !isBryce && Boolean(rowTeam && ((bryceTeam && rowTeam === bryceTeam) || rowTeam.includes('ganassi')));
          const interval = index > 0 ? positiveGapSeconds(row.liveGap) : null;
          // Battle brackets are an on-track-proximity idea — race only.
          const battleBracket = isRace && interval !== null && interval <= 1;
          const bryceBracket = battleBracket && (isBryce || previous?.bryce === true);
          const status = (asString(row.status) ?? '').toLowerCase();
          const running = !status || ['active', 'running', 'run'].includes(status);
          const honestStatus = running ? null : asString(row.comment) || asString(row.status);
          const sourcedLeaderGap = sourcedGapToLeaderSeconds(row);
          const bestLapText = asString(row.bestLapTime);
          const displayGap = !isRace
            ? bestLapText ?? 'best lap pending'
            : honestStatus
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
  /* Name the actual series on track (from the primary timing endpoint), never the
   * event/location — "Detroit" is a place, not a series. Unknown → drop the claim
   * rather than mislabel it (finding #22). */
  const timingEndpoints = ((payload.sources as Record<string, unknown> | undefined)?.endpoints as Array<Row> | undefined) ?? [];
  const rawSeriesOnTrack =
    payload.state === 'wrong_series'
      ? asString(timingEndpoints.find((endpoint) => asString(endpoint.role) === 'primary_timing')?.series)
      : null;
  /* The endpoint's series field can be a machine identifier (the fallback
   * endpoint descriptor carries 'global_active_session'). Family copy never
   * prints an identifier — snake_case means unknown, and unknown drops the
   * claim (finding #22's own rule; leak caught 2026-07-21). */
  const seriesOnTrack = rawSeriesOnTrack && !rawSeriesOnTrack.includes('_') ? rawSeriesOnTrack : null;
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
        {copy?.detail ?? payload.reason}{seriesOnTrack ? ` The ${seriesOnTrack} is on track now.` : ''}
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

/* ---------- off-air: the live page with no readiness payload ----------
 * The readiness endpoint returns nothing until a runner is live (a family
 * visiting between race weekends gets a 503). The page used to sit on four empty
 * gray skeleton slabs forever — no status, no next race, no way out (the audit
 * blocker). This replaces them with a bounded loading beat that times out into a
 * real idle state: what's next, when it wakes up, and a way to Race Week. */
const monthDay = (isoDate: string | null): string | null => {
  if (!isoDate) return null;
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
};

/* ---------- off-season: auto-demo ----------
 * Rather than a static "nothing on the calendar" page, the off-season idle
 * state auto-starts a replay of a featured race so a visitor who just taps
 * Live sees what race day looks like here — positions, battle, the works —
 * clearly labeled as a replay (OffSeasonDemoBanner, below, rendered once the
 * replay engages). This reuses the EXACT mechanism ReplayAffordance's play
 * button uses (navigate to `/live?replay=<sessionKey>&from=<sessionId>`,
 * which useReplaySession picks up from the URL) — never a second playback
 * path — plus one extra `&demo=offseason` marker this screen and AppV3's nav
 * read back to know it's the auto-demo, not a person's own pick.
 *
 * Runs at most once per browser tab: sessionStorage remembers that the demo
 * was offered, so exiting it (or it finishing and the visitor navigating back
 * to a bare /live) shows the plain race list below instead of restarting. */
const OFFSEASON_DEMO_PARAM = 'demo';
const OFFSEASON_DEMO_VALUE = 'offseason';
const OFFSEASON_DEMO_SEEN_KEY = 'bc:offseason-demo-seen';

const hasOfferedOffSeasonDemo = (): boolean => {
  try {
    return window.sessionStorage.getItem(OFFSEASON_DEMO_SEEN_KEY) === '1';
  } catch {
    return false; // storage blocked (private mode, etc.) — the demo just offers again next tap, which is fine
  }
};

const markOffSeasonDemoOffered = (): void => {
  try {
    window.sessionStorage.setItem(OFFSEASON_DEMO_SEEN_KEY, '1');
  } catch {
    /* see hasOfferedOffSeasonDemo */
  }
};

/** The season's best clean (officially-running) finish with a watchable
 *  capture — the 2026 Grand Prix of Monterey Race 1 (P6) — falling back to
 *  the most recent watchable race when no clean finish has one. Ties prefer
 *  our own Race Control capture over a third-party tier. Pure function of the
 *  package's season index (synchronous) plus the async replay catalog. */
const featuredOffSeasonRace = (
  catalog: ReturnType<typeof useReplayCatalog>
): { sessionId: string; raceLabel: string; capture: ReplaySessionInfo } | null => {
  if (!catalog) return null;
  const rows = uiDataPackage.screens.raceDebrief.seasonIndex ?? [];
  const years = rows.map((row) => row.seasonYear).filter((year): year is number => year !== null);
  if (years.length === 0) return null;
  const latestYear = Math.max(...years);
  const seasonRows = rows.filter((row) => row.seasonYear === latestYear && row.sessionId);

  const dateOf = (row: (typeof seasonRows)[number]) => row.raceDate ?? row.eventStartDate ?? '';
  const ownTierFirst = (capture: ReplaySessionInfo) => (isBryceCastCaptureTier(replayProvenance(capture).tier) ? 0 : 1);

  const withCapture = seasonRows
    .map((row) => ({ row, capture: watchableCaptureForRace(catalog, row.sessionId) }))
    .filter((entry): entry is { row: (typeof seasonRows)[number]; capture: ReplaySessionInfo } => entry.capture !== null);
  if (withCapture.length === 0) return null;

  const clean = withCapture.filter((entry) => entry.row.officialStatus === 'running' && entry.row.finishPosition !== null);
  const ranked =
    clean.length > 0
      ? [...clean].sort(
          (a, b) =>
            (a.row.finishPosition as number) - (b.row.finishPosition as number) ||
            ownTierFirst(a.capture) - ownTierFirst(b.capture) ||
            dateOf(b.row).localeCompare(dateOf(a.row))
        )
      : [...withCapture].sort(
          (a, b) => dateOf(b.row).localeCompare(dateOf(a.row)) || ownTierFirst(a.capture) - ownTierFirst(b.capture)
        );
  const best = ranked[0];
  return { sessionId: best.row.sessionId, raceLabel: best.row.raceLabel, capture: best.capture };
};

/* ---------- off-season: nothing scheduled at all ----------
 * `pre_session` (and the no-payload idle state above) also cover the ordinary
 * pre-green wait during an active race weekend, so this only renders once the
 * schedule feed (useNextSession), the package's own upcoming-events list
 * (getNextEvent), AND readiness itself all agree nothing is on the calendar.
 * "Pre-session / hasn't gone green yet" and Watch Along's "no route published
 * yet" both imply an imminent session — false with the calendar empty. This
 * offers something real to do instead: relive the season that just finished,
 * through the same watchable-replay machinery the race pages and Home's
 * "watch the last race" card already use — and, the first time this tab sees
 * it, auto-starts the featured race so the page shows race day right away. */
const OffSeasonLive = () => {
  const { navigate } = useRouter();
  const catalog = useReplayCatalog();
  const [season, setSeason] = useState<ArchiveEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadDebriefArchive()
      .then((archive) => {
        if (cancelled) return;
        if (archive.length === 0) {
          setSeason([]);
          return;
        }
        const latestYear = Math.max(...archive.map((entry) => entry.pack.seasonYear));
        setSeason(
          archive
            .filter((entry) => entry.pack.seasonYear === latestYear)
            .sort((a, b) => chronoCompare(b.pack, a.pack))
        );
      })
      .catch(() => {
        if (!cancelled) setSeason([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const watchable = useMemo(() => {
    if (!season || !catalog) return [];
    return season
      .map((entry) => ({ entry, capture: watchableCaptureForRace(catalog, entry.pack.sessionId) }))
      .filter((row): row is { entry: ArchiveEntry; capture: ReplaySessionInfo } => row.capture !== null);
  }, [season, catalog]);
  const shown = watchable.slice(0, 6);

  // Auto-start, once per tab. Waits for the catalog so `featured` can resolve;
  // if this tab already saw the demo (or the season never yields a watchable
  // race), it stays on the plain list below instead.
  const autoStartAttempted = useRef(false);
  useEffect(() => {
    if (autoStartAttempted.current) return;
    if (hasOfferedOffSeasonDemo()) {
      autoStartAttempted.current = true;
      return;
    }
    const featured = featuredOffSeasonRace(catalog);
    if (!featured) return; // catalog not resolved yet, or nothing watchable — try again once it changes
    autoStartAttempted.current = true;
    markOffSeasonDemoOffered();
    navigate(
      `/live?replay=${encodeURIComponent(featured.capture.sessionKey)}&from=${encodeURIComponent(featured.sessionId)}&${OFFSEASON_DEMO_PARAM}=${OFFSEASON_DEMO_VALUE}`
    );
  }, [catalog, navigate]);

  return (
    <HeroPanel>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="kicker">Live</span>
          <h1 className="screen-head__title" style={{ marginTop: 8 }}>No session on the calendar.</h1>
        </div>
        <SourcePill
          title="Live idle state"
          entries={[
            {
              label: 'Product readiness reducer',
              path: '/api/readiness',
              note: 'No INDY NXT session is active or scheduled right now.'
            }
          ]}
        />
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '62ch' }}>
        This page wakes up on its own the moment the next INDY NXT session is scheduled — the capture runner watches
        INDYCAR’s official schedule feed.
      </p>
      {shown.length > 0 ? (
        <section className="race-replay" aria-label="Relive a race" style={{ marginTop: 20 }}>
          <div className="race-replay__years race-replay__years--sole">
            <span className="race-replay__years-lead">Relive a race</span>
            {shown.map(({ entry, capture }) => (
              <ReplayAffordance
                key={entry.pack.sessionId}
                capture={capture}
                fromSessionId={entry.pack.sessionId}
                title={displayRaceLabel(entry.pack)}
                variant="compact"
              />
            ))}
          </div>
          {watchable.length > shown.length ? (
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              <Link to="/races" className="navlink" style={{ padding: 0 }}>See every race →</Link>
            </p>
          ) : null}
        </section>
      ) : (
        <p style={{ margin: '18px 0 0', fontSize: 13.5 }}>
          <Link to="/races" className="navlink" style={{ padding: 0 }}>Every race</Link>
          {' · '}
          <Link to="/career" className="navlink" style={{ padding: 0 }}>The whole career</Link>
        </p>
      )}
      <Link to="/race-week" className="live-race-week-link"><CalendarClock size={14} aria-hidden /> Race Week</Link>
    </HeroPanel>
  );
};

const LiveOffAir = ({ loading }: { loading: boolean }) => {
  // A visible timeout: the calm loading beat never outstays a stalled feed — it
  // resolves into the idle state after a few seconds no matter what.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setTimedOut(true), 6_000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const nextSession = useNextSession();
  const nextEvent = getNextEvent();
  const eventName = nextSession?.eventName ?? nextEvent?.eventName ?? null;
  const sessionName = nextSession?.sessionName ?? null;
  const trackName = nextEvent?.trackName ?? null;
  const startsAt =
    nextSession?.startsAt && new Date(nextSession.startsAt).getTime() > Date.now() ? nextSession.startsAt : null;
  const raceDay = nextEvent ? monthDay(raceDayOf(nextEvent)) : null;
  // Nothing on the schedule feed AND nothing in the package's upcoming-events
  // list: a genuine off-season idle, not just a quiet moment between weekends.
  const nothingScheduled = !startsAt && !nextEvent;

  if (loading && !timedOut) {
    return (
      <HeroPanel>
        <span className="kicker">Live</span>
        <h1 className="screen-head__title" style={{ marginTop: 8 }}>Checking for a live session…</h1>
        <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
          One moment — reading the timing feed.
        </p>
        <div className="skeleton" style={{ height: 3, width: 140, marginTop: 20, borderRadius: 2 }} aria-hidden />
      </HeroPanel>
    );
  }

  if (nothingScheduled) return <OffSeasonLive />;

  return (
    <HeroPanel>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="kicker">Live</span>
          <h1 className="screen-head__title" style={{ marginTop: 8 }}>The live feed is quiet.</h1>
        </div>
        <SourcePill
          title="Live idle state"
          entries={[
            {
              label: 'Product readiness reducer',
              path: '/api/readiness',
              note: 'No active INDY NXT session is confirmed by the timing feed right now; the page rechecks continuously and switches to live the moment one is.'
            }
          ]}
        />
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '62ch' }}>
        When Bryce’s car is on track, this page follows every lap from green flag to checkered. Until then it stays
        quiet — and it keeps checking on its own.
      </p>
      {eventName ? (
        <div style={{ marginTop: 20 }}>
          <span className="caption">Next up · {[eventName, sessionName].filter(Boolean).join(' · ')}</span>
          {trackName ? (
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
              {trackName}
              {raceDay ? ` · race day ${raceDay}` : ''}
            </p>
          ) : null}
          {startsAt ? (
            <div style={{ marginTop: 10 }}>
              <Countdown to={startsAt} />
            </div>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-muted)' }}>
              It comes alive the moment the session starts.
            </p>
          )}
        </div>
      ) : (
        <p style={{ margin: '18px 0 0', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
          The next session isn’t on the calendar yet. Race Week has the full schedule as soon as it’s set.
        </p>
      )}
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
  const prov = replayProvenance(replay.session);
  return (
    <section className="replay-bar" aria-label="Race replay controls" data-replay-speed={replay.speed}>
      <div className="replay-bar__id">
        {/* Identity and provenance sit on their own rows so neither truncates —
            "Detroit 2026 · 4×" and "third-party normalized (Timing71)" both read
            in full at every width (finding #21). */}
        <div className="replay-bar__identity">
          <span className="replay-bar__chip"><History size={13} aria-hidden /> Replay</span>
          <span className="replay-bar__where">
            {venue}
            {year} · <span className="replay-bar__speed-read">{replay.speed}×</span>
          </span>
        </div>
        <span
          className="replay-bar__tier"
          data-replay-tier={prov.tier}
          title={`${prov.detail}${prov.caveat ? ` — ${prov.caveat}` : ''}`}
        >
          {prov.label}
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

/** Sits above the replay chrome only for the auto-started off-season demo
 *  (never for a person's own replay pick — race pages, Home, and the "Relive
 *  a race" list all keep their plain ReplayBar-only experience). Names the
 *  race and date from the package data, never hardcoded, and offers a way
 *  back to the race list without hunting for the generic Exit control. */
const OffSeasonDemoBanner = ({ replay, navigate }: { replay: ReplaySession; navigate: (href: string) => void }) => {
  const seasonRow = replay.session?.canonicalSessionId
    ? (uiDataPackage.screens.raceDebrief.seasonIndex ?? []).find(
        (row) => row.sessionId === replay.session?.canonicalSessionId
      )
    : null;
  // "2026 Grand Prix of Monterey Race 1" — the raw season-index label carries
  // a redundant trailing "R1"; trim it, then keep the year so the sentence
  // below reads naturally ("this is the 2026 ...").
  const raceLabel = seasonRow
    ? `${seasonRow.seasonYear ?? ''} ${displayRaceLabelText(seasonRow.raceLabel)}`.trim()
    : replay.session?.eventName ?? 'a past race';
  const raceDate = seasonRow ? formatDate(seasonRow.raceDate ?? seasonRow.eventStartDate) : null;
  const prov = replayProvenance(replay.session);
  const captureLabel = isBryceCastCaptureTier(prov.tier) ? 'our timing capture' : prov.label;
  return (
    <section className="demo-banner" aria-label="Off-season demo notice" role="status">
      <div>
        <span className="demo-banner__kicker"><History size={13} aria-hidden /> Off-season · replay, not live</span>
        <p className="demo-banner__copy">
          Nothing is live right now — this is the {raceLabel}{raceDate ? ` (${raceDate})` : ''}, replayed from{' '}
          {captureLabel} so you can see what race day looks like here. The page switches to real timing on its own
          when the next session starts.
        </p>
      </div>
      <button type="button" className="share-button" onClick={() => navigate('/live')}>
        Pick another race
      </button>
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
  const prov = replayProvenance(session);
  const from = isBryceCastCaptureTier(prov.tier) ? 'our own timing capture' : prov.label;
  return (
    <HeroPanel>
      <span className="kicker">Cueing up the replay</span>
      <h1 className="screen-head__title" style={{ marginTop: 8 }}>{session?.eventName ?? 'Archived race'}</h1>
      <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
        Rewinding to the green flag from {from}{duration ? ` · ${duration}` : ''}. The page below will
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
  replay = null,
  replaySourceGap = null,
  readinessError = null,
  readinessCheckedAt = null
}: {
  payload: LiveReadiness | null;
  fixtureMode: boolean;
  history: LiveSessionHistory | null;
  replay?: ReplaySession | null;
  replaySourceGap?: ReplaySourceGap | null;
  /** Readiness fetch error (endpoint 503/unreachable). Distinguishes the idle
   *  "no runner" state from a still-in-flight first poll. */
  readinessError?: string | null;
  /** When the last readiness poll resolved (null = first fetch still pending). */
  readinessCheckedAt?: number | null;
}) => {
  const samples = useMemo(() => gapSamplesFromHistory(history), [history]);
  // Called unconditionally (rules of hooks) so the off-season check below can
  // use it regardless of which branch this render takes.
  const nextSessionInfo = useNextSession();
  // Only used to read the `demo=offseason` URL marker (see OffSeasonLive) and
  // to drive "Pick another race" — never for engaging/exiting the replay
  // itself, which stays entirely on useReplaySession's own URL-param path.
  const { route, navigate } = useRouter();
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
  // The `demo=offseason` marker OffSeasonLive's auto-start adds to its own
  // navigate call — never present on a person's own replay pick (a race page,
  // Home, or the "Relive a race" list), so only the auto-demo gets the banner.
  const isOffSeasonDemoReplay = replayActive && route.search.get(OFFSEASON_DEMO_PARAM) === OFFSEASON_DEMO_VALUE;

  if (replayRefused && replay) {
    return (
      <div className="page stack live-page" data-replay-active="false">
        <ReplayRefused replay={replay} />
      </div>
    );
  }

  if (replayActive && replay && replaySourceGap) {
    return (
      <div className="page stack live-page" data-replay-active="true" data-replay-source-gap="true">
        <ReplayBar replay={replay} payload={null} />
        <ReplaySourceGapNotice gap={replaySourceGap} replay={replay} />
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
          <LiveOffAir loading={readinessCheckedAt === null && !readinessError} />
        )}
      </div>
    );
  }

  // Off-season truthfulness: `pre_session` also covers the ordinary pre-green
  // wait during a scheduled race weekend, so this only fires when the schedule
  // feed, the package's own upcoming-events list, AND readiness itself all
  // agree nothing is on the calendar — see OffSeasonLive above. Every other
  // state (including a scheduled pre_session, and any live/replay state)
  // falls straight through to the unchanged rendering below.
  const nextSessionScheduled = Boolean(
    nextSessionInfo?.startsAt && new Date(nextSessionInfo.startsAt).getTime() > Date.now()
  );
  const offSeasonIdle = !replayActive && payload.state === 'pre_session' && !nextSessionScheduled && !getNextEvent();
  if (offSeasonIdle) {
    return (
      <div className="page stack live-page" data-replay-active="false">
        <OffSeasonLive />
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
  // The session shape comes from the sourced payload ALONE (Race Control's
  // SessionType), never a display flag and never the clock. `replayEnded` is a
  // separate presentation state (it drives the "Race complete · as raced" hero);
  // it must not override the sourced kind. Replays are always of races, so a
  // finished-race replay resolves to race here on its own.
  const sessionKind = resolveLiveSessionKind(payload);
  const raceShaped = sessionKind === 'race';
  return (
    <div
      className="page stack live-page"
      data-replay-active={replayActive ? 'true' : 'false'}
      data-live-payload-session-key={payloadSessionKey}
      data-live-session-key={history?.sessionKey ?? ''}
      data-live-session-kind={sessionKind}
      data-live-source-checked-at={latestHistorySample?.checkedAt ?? ''}
      data-live-arrival-checked-at={latestHistorySample?.arrivalCheckedAt ?? ''}
      data-live-history-count={history?.samples.length ?? 0}
      data-live-history-first-checked-at={history?.samples[0]?.checkedAt ?? ''}
    >
      {isOffSeasonDemoReplay && replay ? <OffSeasonDemoBanner replay={replay} navigate={navigate} /> : null}
      {replayEndedByLive ? <ReplayEndedByLiveNote /> : null}
      {replayActive && replay ? <ReplayBar replay={replay} payload={payload} /> : null}
      {replayActive && replay ? <ReplayGapSkippedNote replay={replay} /> : null}
      {replayActive && replay ? <ReplayClassificationNote payload={payload} canonicalSessionId={replay.session?.canonicalSessionId ?? null} /> : null}
      <TrustRail payload={payload} fixtureMode={fixtureMode} />
      {liveish || replayEnded ? (
        <>
          <LiveHero payload={payload} samples={samples} replayEnded={replayEnded} sessionKind={sessionKind} />
          {(() => {
            /* Cross-links, never duplication (Brief R-c): /live answers "what is
             * happening right now?"; the race's own page holds the accumulating
             * record. One quiet link — races only, and mid-replay it carries the
             * virtual clock so the replayed race gets its replayed race page. */
            const storySoFarId = replayActive
              ? replay?.session?.canonicalSessionId ?? null
              : canonicalLiveRaceSessionId(payload);
            if (!storySoFarId) return null;
            const query = replayActive && replay ? replayDeepLinkQuery(replay.getReplayParams()) : '';
            return (
              <p className="caption caption--secondary" style={{ margin: '-8px 0 0' }}>
                <Link to={`/races/${encodeURIComponent(storySoFarId)}${query}`}>
                  This race&rsquo;s page — the story so far →
                </Link>
              </p>
            );
          })()}
          <BattleModule payload={payload} samples={samples} history={history} replayEnded={replayEnded} sessionKind={sessionKind} />
          {raceShaped ? (
            <div className="grid live-layout">
              <div className="stack live-layout__main">
                <PointsJumbotron payload={payload} />
                <GapTrend history={history} />
              </div>
              <FieldTower payload={payload} sessionKind={sessionKind} />

            </div>
          ) : (
            /* Outside a race the championship projection and the leader-gap trend
             * are race framing (the doc's "If the race ended now" / "Distance to
             * the leader"), so they drop; the field stands full-width as the
             * best-lap order. */
            <FieldTower payload={payload} sessionKind={sessionKind} />
          )}
        </>
      ) : (
        /* Bryce's session isn't active: no live outcome or gap to project, so the
         * two projection modules collapse into the single protected-state card
         * (finding #22). Exit replay (the bar above, during a replay) and Race
         * Week (inside the card) are the prioritized ways out. */
        <WaitingState payload={payload} />
      )}
      {replayActive ? null : <WatchAlong payload={payload} />}
    </div>
  );
};
