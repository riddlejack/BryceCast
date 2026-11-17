import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, ExternalLink, Flag, History, Pause, Play, Radio, RotateCcw, Tv, X } from 'lucide-react';
import { switchValue } from '../review/switches';
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
import { asNumber, asString, formatDate, formatGap, formatNumber } from '../app/format';
import { Link, useRouter } from '../app/router';
import { useNextSession } from '../app/useNextSession';
import { getNextEvent, raceDayOf } from '../data/upcoming';
import type { LiveReadiness, ReplaySourceGap } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import { isBryceCastCaptureTier, replayProvenance, watchableCaptureForRace, type ReplaySessionInfo } from '../data/replayAvailable';
import { useReplayCatalog, ReplayAffordance } from './replayAffordance';
import { chronoCompare, displayRaceLabel, displayRaceLabelText, loadDebriefArchive, type ArchiveEntry } from '../data/debriefArchive';
import { loadRaceStory } from '../data/raceStory';
import {
  buildLiveBattleFrame,
  buildOfficialPointsWindow,
  captureAgeSeconds,
  livePosition,
  liveBryceRowOf,
  liveRowsOf,
  positiveGapSeconds,
  rankChanges,
  sortRowsForLiveDisplay,
  stableDriverId,
  type LiveBattleNeighbor,
  type LiveRow
} from '../data/livePageModel';
import {
  buildBattleFrameForSample,
  liveSourceCheckedAtOf,
  sourcedGapToLeaderSeconds,
  type LiveSessionHistory
} from '../data/liveHistoryModel';
import {
  bestLapDeltaWords,
  buildBestLapDeltas,
  resolveLiveSessionKind,
  sessionRankCaption,
  type BestLapDeltas,
  type LiveSessionKind
} from '../data/liveSessionModel';
import { uiDataPackage } from '../data/uiDataPackage';
import {
  OFFSEASON_DEMO_PARAM,
  OFFSEASON_DEMO_VALUE,
  declineOffSeasonDemo,
  hasDeclinedOffSeasonDemo,
  offSeasonDemoStartAt,
  shouldAutoStartOffSeasonDemo
} from '../data/offSeasonDemo';
import { canonicalLiveRaceSessionId, replayDeepLinkQuery } from '../data/liveRaceShellModel';
import { ReplayGapSkippedNote, ReplaySourceGapNotice } from './replaySourceGap';
import {
  FlagReadout,
  HeroIdentity,
  PreStartBryce,
  PreStartOrder,
  PreStartReadout,
  FormationReadout,
  TrackPanel,
  raceIdentityFor,
  skippedCautionWords,
  useVirtualNow,
  SKIP_NOTE_WALL_MS
} from './liveParts';
import { useReplayRace, type CarLabel } from './liveTrack';
import { RaceBar, lapAxisFor, lapStepTarget, useReplayNow, type LapAxis } from './liveRaceBar';
import { aroundWindowOf, fieldCarsOf, fieldModeOf } from './liveField';
import { lapTimeSeconds } from './liveSectionLight';
import './live.css';

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
      note: 'Per-lap average speeds published by official timing, updating once per completed lap. These are lap averages, not instantaneous velocity. BryceCast shows no speedometer dial.'
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
      label: 'To the leader',
      path: '/api/readiness → liveTiming.rows[].diff, liveGap',
      note: 'Race Control’s own gap to the leader. While the leader crosses the line, the cars still finishing that lap read “1 lap” and the cars behind them are measured from the first of them; for those seconds a car’s gap is the sum of the published intervals down to it.'
    },
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
      note: 'Each car’s fastest lap of the session, exactly as published. Deltas subtract sourced best-lap times; a car with no published best lap does not appear. These are best-lap gaps, not on-track intervals. Practice and qualifying cars run different cycles, so this is never a running order.'
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
    ? 'Archived Race Control replay, not official live data.'
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

/* ---------- the one screen (round 6, Jack's review of November 16) ----------
 *
 * The track with the cars on it in the middle; the running order with the gap
 * to the leader on the left; Bryce on the right: where he is, what the race
 * would mean if it ended now, and the cars around him. One bar above carries
 * the flag, the lap and the replay controls. It replaces the separate battle,
 * running order, championship, distance-to-the-leader and field blocks. */

const runningStatus = (row: Row) => {
  const status = (asString(row.status) ?? '').toLowerCase();
  return !status || ['active', 'running', 'run'].includes(status);
};

/** Each car's gap to the leader, in running order. Race Control's own gap to
 *  the leader for a car on the leader's lap. As the leader crosses the line,
 *  the cars still finishing that lap read "1 lap" and the cars behind them are
 *  measured from the first of them, until each crosses too; for that moment a
 *  car's gap is the sum of the published intervals down to it, which stays
 *  under one lap. Otherwise (a lapped car, a broken chain) the feed's own text. */
const leaderGapsOf = (sorted: LiveRow[]): Map<string, number | null> => {
  const gaps = new Map<string, number | null>();
  const leader = sorted[0];
  const leaderLaps = leader ? asNumber(leader.laps) : null;
  const lapSeconds = leader ? lapTimeSeconds(leader.lastLapTime) : null;
  let chain: number | null = 0;
  sorted.forEach((row, index) => {
    const id = stableDriverId(row);
    if (index === 0) {
      gaps.set(id, 0);
      return;
    }
    const interval = positiveGapSeconds(row.liveGap);
    chain = chain !== null && interval !== null ? chain + interval : null;
    const laps = asNumber(row.laps);
    const sourced = sourcedGapToLeaderSeconds(row);
    if (sourced !== null && laps !== null && laps === leaderLaps) gaps.set(id, sourced);
    else if (chain !== null && laps !== null && leaderLaps !== null && laps === leaderLaps - 1 && (lapSeconds === null || chain < lapSeconds)) gaps.set(id, chain);
    else gaps.set(id, null);
  });
  return gaps;
};

/** The newest history sample at least one of Bryce's laps before the latest,
 *  with no caution in between; null when the window does not reach that far. */
const sampleLapAgo = (history: LiveSessionHistory | null, lapSeconds: number | null) => {
  const list = history?.samples ?? [];
  const latest = list.at(-1);
  if (!latest || !lapSeconds) return null;
  const target = latest.checkedAtMs - lapSeconds * 1000;
  let pick: (typeof list)[number] | null = null;
  for (const sample of list) {
    if (sample.checkedAtMs > target + 1_500) break;
    pick = sample;
  }
  if (!pick || pick.checkedAtMs < target - 6_000) return null;
  const from = pick.checkedAtMs;
  if (list.some((sample) => sample.checkedAtMs >= from && isCautionFlag(sample.flag))) return null;
  return pick;
};

const rateWords = (now: number, before: number | undefined, ahead: boolean): string | null => {
  if (before === undefined || !Number.isFinite(before)) return null;
  // Signs flip when a pass happens; a rate across a pass means nothing.
  if (Math.sign(now) !== Math.sign(before)) return null;
  const change = Math.abs(now) - Math.abs(before);
  if (Math.abs(change) < 0.05) return 'about the same as a lap ago';
  const size = `${Math.abs(change).toFixed(1)} s`;
  if (ahead) return change < 0 ? `${size} closer than a lap ago` : `${size} further than a lap ago`;
  return change < 0 ? `${size} closer to him than a lap ago` : `${size} further back than a lap ago`;
};

/** The five cars around Bryce, two ahead, him, two behind (the nearest five at
 *  either end of the order), each with its time to him from the summed
 *  intervals, and how that changed over his last lap. A gap the feed does not
 *  chain (a lapped car, a car in the pits) shows the car's status or nothing,
 *  never a made-up number. */
const AroundBryce = ({
  payload,
  history,
  highlightId,
  onHoverCar
}: {
  payload: LiveReadiness;
  history: LiveSessionHistory | null;
  highlightId: string | null;
  onHoverCar: (id: string | null) => void;
}) => {
  const rows = sortRowsForLiveDisplay(liveRowsOf(payload)) as LiveRow[];
  const bryceIndex = rows.findIndex((row) => row.bryce === true);
  if (bryceIndex < 0 || rows.length < 2) return null;
  // The same five the track marks by default (liveField.ts).
  const shown = aroundWindowOf(rows);
  const frame = buildLiveBattleFrame(payload);
  const offsets = new Map((frame?.cars ?? []).map((car) => [car.id, car.offsetSeconds]));
  const flag = asString(heartbeatOf(payload).flag);
  const lapAgo = isCautionFlag(flag) ? null : sampleLapAgo(history, lapTimeSeconds(rows[bryceIndex].lastLapTime));
  const before = lapAgo ? new Map((buildBattleFrameForSample(lapAgo)?.cars ?? []).map((car) => [car.id, car.offsetSeconds])) : null;
  return (
    <section className="live-desk__block live-around" aria-label="The cars around Bryce">
      <h2 className="live-desk__label">The cars around him</h2>
      <ol className="live-around__list">
        {shown.map((row) => {
          const id = stableDriverId(row);
          const isBryce = row.bryce === true;
          const rank = livePosition(row);
          const offset = offsets.get(id);
          const running = runningStatus(row);
          const gapText = isBryce ? '' : running ? aroundGapText(offset) : asString(row.comment) || asString(row.status) || '';
          const rate = !isBryce && running && offset !== undefined && before ? rateWords(offset, before.get(id), offset > 0) : null;
          return (
            <li
              key={id}
              className={`live-around__car${isBryce ? ' live-around__car--bryce' : ''}${highlightId === id ? ' is-focus' : ''}`}
              data-driver-id={id}
              onPointerEnter={() => onHoverCar(id)}
              onPointerLeave={() => onHoverCar(null)}
            >
              <span className="live-around__pos">{rank !== null ? `P${rank}` : ''}</span>
              <span className="live-around__name">
                {isBryce ? <Plate size="row" /> : null}
                {driverLabel(row) ?? ''}
              </span>
              <span className="live-around__gaps">
                <TickerValue className="live-around__gap" value={gapText} valueKey={gapText} />
                {rate ? <span className="live-around__rate">{rate}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {isCautionFlag(flag) ? (
        <p className="caption caption--secondary live-around__note">Under caution the field bunches up behind the pace car, so the gaps close until the restart.</p>
      ) : null}
    </section>
  );
};

const aroundGapText = (offsetSeconds: number | undefined): string => {
  if (offsetSeconds === undefined || !Number.isFinite(offsetSeconds)) return '';
  const seconds = Math.abs(offsetSeconds);
  return `${seconds.toFixed(seconds < 100 ? 1 : 0)} s ${offsetSeconds > 0 ? 'ahead' : 'behind'}`;
};

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

/** The whole field, compact: position, car, gap to the leader (best lap
 *  outside a race). Pointing at a row rings that car's dot on the track. */
const RunningOrder = ({
  payload,
  sessionKind,
  highlightId,
  onHoverCar
}: {
  payload: LiveReadiness;
  sessionKind: LiveSessionKind;
  highlightId: string | null;
  onHoverCar: (id: string | null) => void;
}) => {
  const isRace = sessionKind === 'race';
  const rows = useMemo(() => sortRowsForLiveDisplay(liveRowsOf(payload)) as LiveRow[], [payload]);
  const changedIds = useFieldRankChanges(rows);
  const leaderGaps = useMemo(() => (isRace ? leaderGapsOf(rows) : new Map<string, number | null>()), [isRace, rows]);
  const title = isRace ? 'Running order' : 'Best-lap order';
  return (
    <section className="live-desk__order live-order" aria-label={isRace ? 'Full live running order' : 'Full field by best lap'}>
      <div className="live-order__head">
        <h2 className="live-desk__label">{title}</h2>
        <SourcePill title={title} entries={isRace ? sourceEntries.tower : sourceEntries.bestLap} />
      </div>
      {rows.length === 0 ? (
        <Unavailable>The {isRace ? 'running order' : 'best-lap order'} appears when Race Control publishes timing rows for Bryce’s session.</Unavailable>
      ) : (
        <>
          <div className="live-order__cols" aria-hidden>
            <span>P</span>
            <span>No.</span>
            <span>Driver</span>
            <span>{isRace ? 'To the leader' : 'Best lap'}</span>
          </div>
          <ol className="live-order__list">
            {rows.map((row) => {
              const id = stableDriverId(row);
              const isBryce = row.bryce === true;
              const rank = livePosition(row);
              const honestStatus = runningStatus(row) ? null : asString(row.comment) || asString(row.status);
              const leaderGap = leaderGaps.get(id) ?? null;
              const gap = !isRace
                ? asString(row.bestLapTime) ?? 'pending'
                : honestStatus
                  ? honestStatus
                  : rank === 1
                    ? 'leader'
                    : leaderGap !== null
                      ? secondsLabel(leaderGap)
                      : positiveGapSeconds(row.diff) === 0
                        ? 'pending'
                        : formatGap(row.diff);
              return (
                <li
                  key={id}
                  data-driver-id={id}
                  data-live-rank={rank ?? ''}
                  className={`live-order__row${isBryce ? ' live-order__row--bryce' : ''}${changedIds.has(id) ? ' live-order__row--rank-change' : ''}${highlightId === id ? ' is-focus' : ''}`}
                  onPointerEnter={() => onHoverCar(id)}
                  onPointerLeave={() => onHoverCar(null)}
                >
                  <span className="live-order__pos">{formatNumber(rank, 0)}</span>
                  <span className="live-order__no">{asString(row.no) ?? ''}</span>
                  <span className="live-order__name">
                    {isBryce ? <Plate size="row" /> : null}
                    {driverLabel(row) ?? '—'}
                  </span>
                  <TickerValue className="live-order__gap" value={gap} valueKey={gap} />
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
};

/** Bryce now: his position and its story, his gap to the leader, his last
 *  lap's speed; in a race, what it would mean if it ended now, and the cars
 *  around him. Outside a race, his best lap against the session's. */
const BryceColumn = ({
  payload,
  samples,
  history,
  sessionKind,
  highlightId,
  onHoverCar
}: {
  payload: LiveReadiness;
  samples: GapSample[];
  history: LiveSessionHistory | null;
  sessionKind: LiveSessionKind;
  highlightId: string | null;
  onHoverCar: (id: string | null) => void;
}) => {
  const weekend = payload.raceWeekend as Row;
  const heartbeat = heartbeatOf(payload);
  const bryce = liveBryceRowOf(payload);
  const isRace = sessionKind === 'race';
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const rank = bryce ? livePosition(bryce) : null;
  const rows = liveRowsOf(payload);
  const pointsWindow = buildOfficialPointsWindow(rows);
  const points = payload.points as Row;
  const ladderEligible = ['race_control_live', 'partial'].includes(asString(points.mode) ?? '');
  const historicalRank = asNumber((points.bryce as Row)?.historicalRank);
  const standingMove = historicalRank !== null && pointsWindow ? historicalRank - pointsWindow.bryce.projectedStanding : null;
  const bestDeltas = isRace ? null : buildBestLapDeltas(rows);
  const underCaution = isCautionFlag(flag);

  // The speed line switches currency with the session: last lap in a race,
  // best lap outside one. Both are official per-lap averages, never a dial.
  const rawSpeed = bryce ? asNumber(isRace ? bryce.lastSpeed : bryce.bestSpeed) : null;
  // Before his first lap the feed carries a zero, not a speed.
  const speedValue = rawSpeed !== null && rawSpeed > 0 ? rawSpeed : null;
  const fieldFastest = isRace ? fastestLastSpeedInField(rows) : fastestBestSpeedInField(rows);
  const bryceHoldsFastest = speedValue !== null && (fieldFastest === null || fieldFastest.speed <= speedValue + 0.05);
  const fastestName = fieldFastest ? driverLabel(fieldFastest.row) : null;

  const recent = samples.filter((sample) => sample.rank !== null && (lap === null || sample.lap === null || sample.lap >= lap - 5));
  const firstRecent = recent[0];
  const gained = rank !== null && firstRecent?.rank !== null && firstRecent?.rank !== undefined ? firstRecent.rank - rank : 0;
  let positionStory: { text: string; up: boolean } | null = null;
  if (gained > 0 && firstRecent?.lap !== null && firstRecent?.lap !== undefined && lap !== null && lap > firstRecent.lap) {
    const span = Math.min(5, lap - firstRecent.lap);
    positionStory = { text: `▲ up ${gained} ${span === 1 ? 'on the last lap' : `in the last ${span} laps`}`, up: true };
  } else if (rank !== null && lap !== null) {
    let heldFrom = lap;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if (recent[index].rank !== rank) break;
      if (recent[index].lap !== null) heldFrom = Math.min(heldFrom, recent[index].lap!);
    }
    if (lap - heldFrom >= 1) positionStory = { text: `held P${rank} for ${lap - heldFrom + 1} laps`, up: false };
  }

  // Distance to the leader: the sourced gap now, and against one lap ago.
  const bryceId = bryce ? stableDriverId(bryce) : '';
  const leaderGap = isRace && rank !== null && rank > 1 ? leaderGapsOf(sortRowsForLiveDisplay(rows) as LiveRow[]).get(bryceId) ?? null : null;
  const lapAgo = isRace && !underCaution ? sampleLapAgo(history, lapTimeSeconds(bryce?.lastLapTime)) : null;
  const leaderGapBefore = lapAgo ? leaderGapsOf(sortRowsForLiveDisplay(lapAgo.rows) as LiveRow[]).get(lapAgo.bryceId) ?? null : null;
  const leaderChange = leaderGap !== null && leaderGapBefore !== null ? leaderGap - leaderGapBefore : null;

  return (
    <section className="live-desk__bryce" aria-label="Bryce now">
      <div className="live-desk__block live-me">
        <div className="live-position">
          <Plate size="hero" />
          <div>
            <span className="caption">{sessionRankCaption(sessionKind)}</span>
            <TickerValue className="stat__value stat__value--hero live-position__value" value={rank !== null ? `P${rank}` : '—'} valueKey={rank ?? 'na'} />
            {isRace && positionStory ? <span className={`stat__delta${positionStory.up ? ' stat__delta--up' : ''}`}>{positionStory.text}</span> : null}
          </div>
        </div>
        {leaderGap !== null ? (
          <p className="live-me__line">
            <TickerValue className="live-me__strong" value={`${leaderGap.toFixed(1)} s`} valueKey={leaderGap} /> behind the leader
            {leaderChange !== null && Math.abs(leaderChange) >= 0.05
              ? `, ${Math.abs(leaderChange).toFixed(1)} s ${leaderChange < 0 ? 'closer' : 'further'} than a lap ago`
              : ''}
          </p>
        ) : null}
        {speedValue !== null ? (
          <p className="live-me__line live-me__line--quiet">
            {isRace && underCaution ? (
              <>Last lap under caution · {speedValue.toFixed(1)} mph</>
            ) : (
              <>
                {isRace ? 'Last lap' : 'Best lap'} {speedValue.toFixed(1)} mph
                {bryceHoldsFastest
                  ? ` · ${isRace ? 'fastest last lap in the field' : 'fastest best lap in the field'}`
                  : ` · field best ${fastestName ? `${fastestName}, ` : ''}${fieldFastest!.speed.toFixed(1)} mph`}
              </>
            )}
          </p>
        ) : null}
      </div>
      {isRace ? (
        <div className="live-desk__block live-ended">
          <div className="live-order__head">
            <h2 className="live-desk__label">If the race ended now</h2>
            <SourcePill title="If the race ended now" entries={sourceEntries.points} caveats={['Provisional until official results publish and are reconciled.']} />
          </div>
          {pointsWindow ? (
            <>
              <div className="live-ended__row">
                <TickerValue className="stat__value stat__value--big" value={`P${pointsWindow.bryce.projectedStanding}`} valueKey={pointsWindow.bryce.projectedStanding} />
                <span className="live-ended__words">
                  in the championship
                  {standingMove !== null && standingMove !== 0 ? (
                    <span className={`stat__delta ${standingMove > 0 ? 'stat__delta--up' : 'stat__delta--down'}`}>
                      {standingMove > 0 ? `▲ ${standingMove}` : `▽ ${Math.abs(standingMove)}`} vs before the race
                    </span>
                  ) : null}
                </span>
              </div>
              {ladderEligible ? (
                <ol className="live-ended__ladder" aria-label="Projected championship around Bryce">
                  {[pointsWindow.above, pointsWindow.bryce, pointsWindow.below].map((row, index) =>
                    row ? (
                      <li className={`live-ended__rung${index === 1 ? ' live-ended__rung--bryce' : ''}`} key={row.carNo}>
                        <span className="live-ended__pos">P{row.projectedStanding}</span>
                        <span className="live-ended__name">{index === 1 ? <Plate size="row" /> : null}{row.driverName}</span>
                        <span className="live-ended__pts">
                          <TickerValue value={row.runningDriverPoints} valueKey={row.runningDriverPoints} /> pts
                        </span>
                      </li>
                    ) : null
                  )}
                </ol>
              ) : (
                <p className="live-me__line">
                  <TickerValue className="live-me__strong" value={pointsWindow.bryce.runningDriverPoints} valueKey={pointsWindow.bryce.runningDriverPoints} /> running points
                </p>
              )}
              <span className="live-points__provisional">{pointsProvenanceLabel(payload)}</span>
            </>
          ) : (
            <Unavailable>Official running points are not published in this state.</Unavailable>
          )}
        </div>
      ) : (
        <div className="live-desk__block live-ended">
          <h2 className="live-desk__label">Bryce&rsquo;s best lap</h2>
          {bestDeltas?.bryce ? (
            <div className="live-ended__row">
              <TickerValue className="stat__value stat__value--big" value={bestDeltas.bryce.bestLapTime} valueKey={bestDeltas.bryce.bestLapTime} />
              <span className="live-ended__words">
                {bestDeltas.bryceIsFastest
                  ? 'fastest in the field'
                  : bestDeltas.offSessionBestSeconds !== null
                    ? `${bestDeltas.offSessionBestSeconds.toFixed(bestDeltas.offSessionBestSeconds < 10 ? 2 : 1)} s off the best, ${bestDeltas.leader.surname} ${bestDeltas.leader.bestLapTime}`
                    : null}
              </span>
            </div>
          ) : (
            <Unavailable>Bryce's best lap appears once Race Control publishes it.</Unavailable>
          )}
          <BestLapDeltas deltas={bestDeltas} />
        </div>
      )}
      {isRace ? <AroundBryce payload={payload} history={history} highlightId={highlightId} onHoverCar={onHoverCar} /> : null}
    </section>
  );
};

/** What the one screen shows: the first frame still on its way, a replay
 *  before its green flag, the race, the race after the checkered flag. One
 *  layout for all four, so the track (and its 3D model) is never remounted. */
export type DeskPhase = 'cueing' | 'prestart' | 'race' | 'ended';

/** A replay frame's phase: the frame the page may show (a simulated frame,
 *  outside a source gap), then before the green, racing, or past the flag. */
export const replayDeskPhaseOf = (payload: LiveReadiness | null, sourceGap: unknown): { framed: LiveReadiness | null; phase: DeskPhase } => {
  const framed = payload && isSimulatedReplayPayload(payload) && !sourceGap ? payload : null;
  const ended = framed ? isPostCheckeredPayload(framed) : false;
  const phase: DeskPhase = !framed
    ? 'cueing'
    : ended
      ? 'ended'
      : framed.state === 'ready' || framed.state === 'degraded'
        ? 'race'
        : 'prestart';
  return { framed, phase };
};

/** Keys that move the clock fire at most this often; the last press wins. */
const KEY_SEEK_THROTTLE_MS = 300;

const DeskPlaceholder = ({ area, words }: { area: 'order' | 'bryce'; words: string }) => (
  <section className={`live-desk__${area} live-desk__placeholder`} aria-busy="true">
    <h2 className="live-desk__label">{area === 'order' ? 'Running order' : 'Bryce'}</h2>
    <p className="caption caption--secondary">{words}</p>
    <div className="live-desk__placeholder-rows" aria-hidden>
      {Array.from({ length: area === 'order' ? 8 : 3 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  </section>
);

/** The replay's stage, shared by the Live desk and the Tracks page (round 8):
 *  the race model, the bar's axis, the one clock readout, the field, the keys
 *  and `&lap=` in the address, and the header readout. */
export const useReplayStage = ({
  payload,
  phase,
  history,
  sessionKind,
  replay
}: {
  payload: LiveReadiness | null;
  phase: DeskPhase;
  history: LiveSessionHistory | null;
  sessionKind: LiveSessionKind;
  replay: ReplaySession | null;
}) => {
  const weekend = (payload?.raceWeekend ?? {}) as Row;
  const heartbeat = payload ? heartbeatOf(payload) : {};
  const isRace = sessionKind === 'race';
  const identity = raceIdentityFor(payload, replay);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const sessionName = asString(heartbeat.sessionName ?? weekend.sessionName);
  const { route } = useRouter();
  const fieldMode = fieldModeOf(switchValue('field', route.search));
  const trail = switchValue('trail', route.search) === 'lap';
  const cars = useMemo(() => {
    const map = new Map<string, CarLabel>();
    for (const row of payload ? liveRowsOf(payload) : []) {
      const id = stableDriverId(row);
      if (id) map.set(id, { no: asString(row.no) ?? '', surname: driverLabel(row) ?? '', position: livePosition(row) });
    }
    return map;
  }, [payload]);
  const bryceRow = payload ? liveBryceRowOf(payload) : null;
  const bryceLabel = bryceRow ? cars.get(stableDriverId(bryceRow)) ?? null : null;

  const seasonRow = identity.sessionId
    ? (uiDataPackage.screens.raceDebrief.seasonIndex ?? []).find((row) => row.sessionId === identity.sessionId) ?? null
    : null;
  const race = useReplayRace({
    sessionId: replay && isRace ? identity.sessionId : null,
    outline: identity.outline,
    history,
    timeline: replay?.timeline ?? null,
    greenAt: replay?.session?.firstGreenAt ?? null,
    startPosition: seasonRow?.startPosition ?? null,
    flag
  });
  const virtualNow = useVirtualNow(replay);
  const greenMs = replay?.greenFlagAt ? Date.parse(replay.greenFlagAt) : NaN;
  const endMs = replay?.timeline?.checkeredMs ?? (replay?.session?.lastCheckedAt ? Date.parse(replay.session.lastCheckedAt) : NaN);
  const axis = useMemo(
    () =>
      replay
        ? lapAxisFor({
            model: race.model,
            totalLaps: race.totalLaps ?? totalLaps,
            startMs: Number.isFinite(greenMs) ? greenMs : null,
            endMs: Number.isFinite(endMs) ? endMs : null
          })
        : null,
    [replay ? 1 : 0, race.model, race.totalLaps, totalLaps, greenMs, endMs]
  );

  // The clock decides the desk's phase and the header, so they are right the
  // moment the clock moves; the archived frame fills the columns when it lands.
  // Before the green it is the formation: the header says so, the order is the
  // grid (every frame carries the start positions), Bryce's column counts down.
  // After the green with a pre-green frame still up, the columns wait.
  const now = useReplayNow(axis, replay?.timeline ?? null, virtualNow);
  const clockFormation = Boolean(replay && now?.beforeGreen && phase !== 'cueing' && phase !== 'ended');
  const awaitingRace = Boolean(replay && now && !now.beforeGreen && phase === 'prestart');
  const shownPhase: DeskPhase = clockFormation ? 'prestart' : awaitingRace ? 'race' : phase;

  // After a jump of the clock, the timing panels hold their last frame,
  // quietly dimmed, until the frame for the new moment lands, so the page
  // never mixes two moments. The other cars on the track wait for it too: an
  // old frame's gaps drawn at the new moment bunched them (round 9), and when
  // the new frame lands every car takes its gap at once.
  const jumpRef = useRef<{ epoch: number; atMs: number | null; wall: number }>({ epoch: replay?.clockEpoch ?? 0, atMs: null, wall: 0 });
  if (replay && replay.clockEpoch !== jumpRef.current.epoch) {
    jumpRef.current = { epoch: replay.clockEpoch, atMs: virtualNow(), wall: Date.now() };
  }
  const sourceMs = payload ? Date.parse(liveSourceCheckedAtOf(payload)) : NaN;
  const jump = jumpRef.current;
  const settling =
    replay !== null &&
    !clockFormation &&
    !awaitingRace &&
    jump.atMs !== null &&
    Date.now() - jump.wall < 5_000 &&
    (!Number.isFinite(sourceMs) || Math.abs(sourceMs - jump.atMs) > 8_000 + replay.playbackSpeed * 2_500);
  if (!settling && jump.atMs !== null && Number.isFinite(sourceMs)) jump.atMs = null;
  const fieldCars = useMemo(
    () => (shownPhase === 'race' && !awaitingRace && !settling ? fieldCarsOf(payload, fieldMode) : []),
    [payload, fieldMode, shownPhase, awaitingRace, settling]
  );
  // His place, one reading for the whole page: the frame's own (the running
  // order and the big position read the same row), and none while the frame
  // for this moment is still on its way, so the bar and the header never
  // show two different places.
  const place = !settling && !awaitingRace && (shownPhase === 'race' || shownPhase === 'ended') && bryceRow ? livePosition(bryceRow) : null;

  // The keys: ←/→ a lap (Shift: five), Space pauses. Never while typing, and
  // the arrows are left to the 3D model when it has the focus.
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const axisRef = useRef<LapAxis | null>(axis);
  axisRef.current = axis;
  const engaged = Boolean(replay);
  useEffect(() => {
    if (!engaged) return undefined;
    let pending: number | null = null;
    let lastCommit = 0;
    let timer = 0;
    const commit = () => {
      timer = 0;
      if (pending === null) return;
      lastCommit = Date.now();
      replayRef.current?.seekTo(pending);
      pending = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) replayRef.current?.togglePause();
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (tag === 'CANVAS') return;
      const currentAxis = axisRef.current;
      const from = pending ?? virtualNow();
      if (!currentAxis || from === null) return;
      event.preventDefault();
      const laps = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 5 : 1);
      const next = lapStepTarget(currentAxis, from, laps);
      if (next === null) return;
      pending = next;
      if (timer) return;
      const wait = Math.max(0, KEY_SEEK_THROTTLE_MS - (Date.now() - lastCommit));
      if (wait === 0) commit();
      else timer = window.setTimeout(commit, wait);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) window.clearTimeout(timer);
    };
  }, [engaged, virtualNow]);

  // `&lap=N` in the address, so a reload or a shared link resumes there.
  useEffect(() => {
    if (!engaged || !axis || axis.basis !== 'laps') return undefined;
    const write = () => {
      const now = virtualNow();
      if (now === null) return;
      const pos = axis.posAt(now);
      if (pos === null) return;
      const lapNow = now < axis.startMs ? null : Math.min(axis.total, Math.floor(pos) + 1);
      const url = new URL(window.location.href);
      if (lapNow === null || lapNow < 2) url.searchParams.delete('lap');
      else url.searchParams.set('lap', String(lapNow));
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, '', next);
      }
    };
    const timer = window.setInterval(write, 1_000);
    return () => window.clearInterval(timer);
  }, [engaged, axis, virtualNow]);

  // A replay's header reads the clock (the same readout as the race bar);
  // the frame's own flag and counter stand in until the bar has its axis.
  const clockFlag = now?.flag === 'green' ? 'GREEN' : now?.flag === 'caution' ? 'YELLOW' : now?.flag === 'red' ? 'RED' : null;
  const clockLap = replay && now && now.lap !== null ? now.lap : null;
  const readout = clockFormation ? (
    <FormationReadout totalLaps={race.totalLaps ?? totalLaps} />
  ) : phase === 'prestart' && payload && !awaitingRace ? (
    <PreStartReadout payload={payload} />
  ) : (
    <FlagReadout
      flag={clockFlag ?? (awaitingRace ? null : flag)}
      lap={clockLap ?? (awaitingRace ? null : lap)}
      totalLaps={race.totalLaps ?? totalLaps}
      ended={phase === 'ended' || now?.flag === 'finished'}
      isRace={isRace}
      sessionName={sessionName}
      lapInProgress={Boolean(replay) && clockLap === null}
    />
  );
  const seek = useCallback((atMs: number) => replayRef.current?.seekTo(atMs), []);
  // The race timeline is read once the first frame is up, never beside it.
  const requestTimeline = replay?.requestTimeline;
  const simulatedFrame = payload ? isSimulatedReplayPayload(payload) : false;
  useEffect(() => {
    if (simulatedFrame && requestTimeline) requestTimeline();
  }, [simulatedFrame, requestTimeline]);
  return { identity, isRace, flag, lap, totalLaps, sessionName, fieldMode, trail, cars, bryceRow, bryceLabel, race, virtualNow, axis, now, clockFormation, awaitingRace, shownPhase, fieldCars, settling, place, readout, seek };
};

const LiveDesk = ({
  payload,
  phase,
  fixtureMode,
  samples,
  history,
  sessionKind,
  replay,
  onExit,
  storyLink
}: {
  payload: LiveReadiness | null;
  phase: DeskPhase;
  fixtureMode: boolean;
  samples: GapSample[];
  history: LiveSessionHistory | null;
  sessionKind: LiveSessionKind;
  replay: ReplaySession | null;
  onExit?: () => void;
  storyLink: ReactNode;
}) => {
  const { identity, isRace, fieldMode, trail, bryceLabel, race, axis, now, awaitingRace, shownPhase, fieldCars, settling, place, readout, seek, virtualNow } =
    useReplayStage({ payload, phase, history, sessionKind, replay });
  const [hoverCar, setHoverCar] = useState<string | null>(null);

  return (
    <section className={`live-desk${settling ? ' live-desk--settling' : ''}`} data-live-desk data-desk-phase={shownPhase} aria-label="The race, now">
      <HeroIdentity
        identity={identity}
        action={
          <div className="live-desk__head-actions">
            {storyLink}
            <SourcePill title="The race, now" entries={sourceEntries.hero} />
          </div>
        }
      />
      {replay ? (
        <>
          <ReplayBar replay={replay} payload={payload} onExit={onExit} lead={readout} />
          {axis ? <RaceBar replay={replay} axis={axis} timeline={replay.timeline} virtualNow={virtualNow} now={now} place={isRace ? place : undefined} onSeek={seek} /> : null}
        </>
      ) : payload ? (
        <div className="live-desk__bar live-desk__bar--live">
          {readout}
          <TrustRail payload={payload} fixtureMode={fixtureMode} />
        </div>
      ) : null}
      <div className="live-desk__grid">
        {phase === 'cueing' || !payload ? (
          <DeskPlaceholder area="order" words="Reading the first frame of the race." />
        ) : awaitingRace ? (
          <DeskPlaceholder area="order" words="Reading the running order at the green." />
        ) : shownPhase === 'prestart' ? (
          <PreStartOrder payload={payload} />
        ) : (
          <RunningOrder payload={payload} sessionKind={sessionKind} highlightId={hoverCar} onHoverCar={setHoverCar} />
        )}
        <TrackPanel
          identity={identity}
          replay={replay}
          race={race}
          mode={!isRace ? 'session' : shownPhase === 'race' || shownPhase === 'ended' ? 'race' : 'prestart'}
          field={fieldMode}
          fieldCars={fieldCars}
          trail={trail}
          bryceLabel={bryceLabel}
          highlightId={hoverCar}
          onHoverCar={setHoverCar}
        />
        {phase === 'cueing' || !payload ? (
          <DeskPlaceholder area="bryce" words="His position, gaps and lap appear with it." />
        ) : awaitingRace ? (
          <DeskPlaceholder area="bryce" words="His position and gaps at the green appear with it." />
        ) : shownPhase === 'prestart' && replay ? (
          <PreStartBryce payload={payload} replay={replay} />
        ) : (
          <BryceColumn payload={payload} samples={samples} history={history} sessionKind={sessionKind} highlightId={hoverCar} onHoverCar={setHoverCar} />
        )}
      </div>
    </section>
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
 * The demo is the DEFAULT experience every time Live is opened with nothing
 * scheduled — not a once-per-tab offer. Only an explicit choice in this tab
 * ("Exit replay", or "Pick another race" in the banner) turns it off and shows
 * the plain race list below; see src/data/offSeasonDemo.ts. */

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

  // Auto-start. Waits for the catalog so `featured` can resolve; if this tab
  // explicitly left the demo (or the season never yields a watchable race), it
  // stays on the plain list below instead. Nothing is recorded here — running
  // the demo is not a choice the visitor made, so it must not opt them out of
  // seeing it again.
  const autoStartAttempted = useRef(false);
  useEffect(() => {
    const featured = featuredOffSeasonRace(catalog);
    if (
      !shouldAutoStartOffSeasonDemo({
        declined: hasDeclinedOffSeasonDemo(),
        hasFeaturedRace: featured !== null,
        alreadyAttempted: autoStartAttempted.current
      })
      || !featured
    ) {
      return; // catalog not resolved yet, already navigating, or declined in this tab
    }
    autoStartAttempted.current = true;
    // `t0` joins the race a few minutes past the green flag so the seed arrives
    // with the running order and the battle already full — see
    // offSeasonDemoStartAt. Absent when the capture cannot support it, which
    // starts at green exactly as before. Only the auto-demo adds it; every
    // replay a person picks still opens at the green flag.
    const startAt = offSeasonDemoStartAt(featured.capture);
    navigate(
      `/live?replay=${encodeURIComponent(featured.capture.sessionKey)}&from=${encodeURIComponent(featured.sessionId)}`
      + `${startAt ? `&t0=${encodeURIComponent(startAt)}` : ''}`
      + `&${OFFSEASON_DEMO_PARAM}=${OFFSEASON_DEMO_VALUE}`
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
        This page wakes up on its own the moment the next INDY NXT session is scheduled. The capture runner watches
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
          One moment, reading the timing feed.
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
        quiet, and it keeps checking on its own.
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
      <p className="live-watch__pip">start the broadcast, then pop it out. Picture-in-picture sits nicely over this page.</p>
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
 *  frame — with speed, restart-from-green, the formation lap, and an exit back
 *  to the race page. Under caution it carries the flag and lap, so a still
 *  running order reads as the yellow it is. */
export const ReplayBar = ({
  replay,
  payload,
  /** The off-season demo passes a wrapper so leaving it counts as the explicit
   *  choice that turns auto-start off for this tab. Every other replay — a race
   *  page, Home, the "Relive a race" list — keeps the plain exit. */
  onExit,
  /** The one screen's flag and lap, first in the bar (round 6). */
  lead
}: { replay: ReplaySession; payload: LiveReadiness | null; onExit?: () => void; lead?: ReactNode }) => {
  const heartbeat = payload ? heartbeatOf(payload) : {};
  const venue = asString(heartbeat.trackName) ?? replay.venue ?? replay.session?.eventName ?? 'archived race';
  const year = replay.seasonYear ? ` ${replay.seasonYear}` : '';
  const prov = replayProvenance(replay.session);
  const flag = asString(heartbeat.flag)?.toUpperCase() ?? null;
  // The opening caution, once the replay has jumped it: said in the bar for
  // as long as this run of the clock is past it, with the way to watch it.
  const skippedCaution =
    replay.openingCaution && replay.cautionSkippedAt !== null && replay.clockFrom !== 'caution' ? replay.openingCaution : null;
  // While the track carries the same note (its first 15 s), the bar stays quiet,
  // so the words never show twice at once; the bar keeps it after that.
  const trackNoteShowing = skippedCaution !== null && Date.now() - (replay.cautionSkippedAt ?? 0) <= SKIP_NOTE_WALL_MS;
  return (
    <section
      className={`replay-bar${lead ? ' replay-bar--desk' : ''}`}
      aria-label="Race replay controls"
      data-replay-speed={replay.speed}
      data-replay-playback-speed={replay.playbackSpeed}
      data-replay-skim={replay.skim?.kind ?? ''}
      data-replay-opening-caution={replay.openingCaution?.kind ?? ''}
      data-replay-caution-skipped={skippedCaution ? 'true' : 'false'}
      data-replay-flag={flag ?? ''}
      data-replay-paused={replay.paused ? 'true' : 'false'}
    >
      {lead ? <div className="replay-bar__lead">{lead}</div> : null}
      <div className="replay-bar__id">
        {/* Identity and provenance sit on their own rows so neither truncates —
            "Detroit 2026 · 4×" and "third-party normalized (Timing71)" both read
            in full at every width (finding #21). */}
        <div className="replay-bar__identity">
          <span className="replay-bar__chip"><History size={13} aria-hidden /> Replay</span>
          {payload ? (
            /* The hero below names the race and carries the flag and lap large;
               the bar says only what kind of page this is. */
            <span className="replay-bar__where">
              {replay.paused ? (
                <>Archived timing, paused. Not live.</>
              ) : (
                <>
                  Archived timing, replayed at <span className="replay-bar__speed-read">{replay.playbackSpeed}×</span>. Not live.
                </>
              )}
            </span>
          ) : (
            <span className="replay-bar__where">
              {venue}
              {year} · <span className="replay-bar__speed-read">{replay.playbackSpeed}×</span>
            </span>
          )}
          <span
            className="replay-bar__tier"
            data-replay-tier={prov.tier}
            title={[prov.detail, prov.caveat].filter(Boolean).map((part) => (/[.!?]$/.test(part!) ? part : `${part}.`)).join(' ')}
          >
            {prov.label}
          </span>
        </div>
        {replay.skim ? (
          <span className="caption caption--secondary" data-replay-skim-note>
            {replay.skim.kind === 'formation' ? 'Formation laps' : 'The caution'} at {replay.skim.speed}×. Back to{' '}
            {replay.skim.backTo}× at the{' '}
            {replay.skim.until === 'green'
              ? 'green flag'
              : `${replay.skim.restartLap !== null ? `lap ${replay.skim.restartLap} ` : ''}restart`}
            .
          </span>
        ) : skippedCaution && !trackNoteShowing ? (
          <span className="caption caption--secondary" data-replay-start-note>
            {skippedCautionWords(skippedCaution)}{' '}
            <button type="button" className="replay-bar__inline-btn" data-replay-watch-caution onClick={replay.watchCaution}>
              Watch it
            </button>
          </span>
        ) : null}
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
        <button
          type="button"
          className="replay-bar__btn replay-bar__btn--pause"
          data-replay-pause
          onClick={replay.togglePause}
          aria-pressed={replay.paused}
          title={replay.paused ? 'Play (Space)' : 'Pause (Space)'}
        >
          {replay.paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />} {replay.paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className="replay-bar__btn"
          onClick={replay.restart}
          title="Back to the start"
        >
          <RotateCcw size={13} aria-hidden /> Restart
        </button>
        {replay.formationAvailable ? (
          <button
            type="button"
            className="replay-bar__btn"
            data-replay-formation
            onClick={replay.restartFromFormation}
            onPointerEnter={replay.prepareFormation}
            onFocus={replay.prepareFormation}
            disabled={replay.formationPending}
            aria-busy={replay.formationPending}
            title="Back to before the start, as the field leaves the grid"
          >
            <Flag size={13} aria-hidden /> From the formation lap
          </button>
        ) : null}
        <button type="button" className="replay-bar__btn replay-bar__btn--exit" onClick={onExit ?? replay.exit}>
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
const OffSeasonDemoBanner = ({
  replay,
  navigate,
  /** True when the demo joined past the green flag (the `t0` the auto-start
   *  URL carries). The copy must say so — the page opens mid-race and the lap
   *  counter starts at something other than 1. */
  joinedInProgress = false
}: { replay: ReplaySession; navigate: (href: string) => void; joinedInProgress?: boolean }) => {
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
          Nothing is live right now. This is the {raceLabel}{raceDate ? ` (${raceDate})` : ''}, replayed from{' '}
          {captureLabel} so you can see what race day looks like here.
          {joinedInProgress ? ' It joins a few minutes in, with the race already running. Restart goes back to the green flag.' : ''}
          {' '}The page switches to real timing on its own when the next session starts.
        </p>
      </div>
      <button
        type="button"
        className="share-button"
        onClick={() => {
          // An explicit "no thanks" for this tab: /live now opens on the race
          // list instead of restarting the demo.
          declineOffSeasonDemo();
          navigate('/live');
        }}
      >
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
    <span>A live session is on, so this is the real Race Control feed now.</span>
  </section>
);

const ReplayCueing = ({ session, joinedInProgress = false }: { session: ReplaySessionInfo | null; joinedInProgress?: boolean }) => {
  const duration = durationLabel(session);
  const prov = replayProvenance(session);
  const from = isBryceCastCaptureTier(prov.tier) ? 'our own timing capture' : prov.label;
  return (
    <HeroPanel>
      <span className="kicker">Cueing up the replay</span>
      <h1 className="screen-head__title" style={{ marginTop: 8 }}>{session?.eventName ?? 'Archived race'}</h1>
      <p style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
        {joinedInProgress ? 'Picking the race up in progress' : 'Rewinding to the green flag'} from {from}
        {duration ? ` · ${duration}` : ''}. The page below will move exactly as it did on the day.
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
  // The `demo=offseason` marker OffSeasonLive's auto-start adds to its own
  // navigate call — never present on a person's own replay pick (a race page,
  // Home, or the "Relive a race" list), so only the auto-demo gets the banner.
  const isOffSeasonDemoReplay = replayActive && route.search.get(OFFSEASON_DEMO_PARAM) === OFFSEASON_DEMO_VALUE;
  // Leaving the auto-demo through its own Exit control is the explicit choice
  // that stops it auto-starting again in this tab. `undefined` everywhere else,
  // so a person's own replay keeps the plain exit.
  // The auto-demo opens past the green flag (offSeasonDemoStartAt). Read back
  // off the URL so the banner and the cue-up say what actually happened.
  const joinedInProgress = Boolean(route.search.get('t0'));
  const demoExit = isOffSeasonDemoReplay && replay
    ? () => {
        declineOffSeasonDemo();
        replay.exit();
      }
    : undefined;


  if (replayRefused && replay) {
    return (
      <div className="page stack live-page" data-replay-active="false">
        <ReplayRefused replay={replay} />
      </div>
    );
  }

  // A replay: one screen from the click to the checkered flag. The bar, the
  // track and the running order are up at once; the first frame fills them.
  // Before the green the order column holds the grid; a source gap says so
  // above the same screen. Nothing here remounts the track.
  if (replayActive && replay) {
    const { framed, phase } = replayDeskPhaseOf(payload, replaySourceGap);
    const kind: LiveSessionKind = framed ? resolveLiveSessionKind(framed) : 'race';
    const latest = history?.samples.at(-1) ?? null;
    const storyId = replay.session?.canonicalSessionId ?? null;
    return (
      <div
        className="page stack live-page live-page--desk"
        data-replay-active="true"
        data-replay-source-gap={replaySourceGap ? 'true' : 'false'}
        data-live-session-key={history?.sessionKey ?? ''}
        data-live-session-kind={kind}
        data-live-source-checked-at={latest?.checkedAt ?? ''}
        data-live-arrival-checked-at={latest?.arrivalCheckedAt ?? ''}
        data-live-history-count={history?.samples.length ?? 0}
        data-live-history-first-checked-at={history?.samples[0]?.checkedAt ?? ''}
      >
        {isOffSeasonDemoReplay ? <OffSeasonDemoBanner replay={replay} navigate={navigate} joinedInProgress={joinedInProgress} /> : null}
        <ReplayGapSkippedNote replay={replay} />
        {replaySourceGap ? <ReplaySourceGapNotice gap={replaySourceGap} replay={replay} /> : null}
        <LiveDesk
          payload={framed}
          phase={phase}
          fixtureMode={fixtureMode}
          samples={samples}
          history={history}
          sessionKind={kind}
          replay={replay}
          onExit={demoExit}
          storyLink={
            storyId ? (
              <Link className="live-desk__story" to={`/races/${encodeURIComponent(storyId)}${replayDeepLinkQuery(replay.getReplayParams())}`}>
                The story so far, on the race page →
              </Link>
            ) : null
          }
        />
        {framed ? <ReplayClassificationNote payload={framed} canonicalSessionId={storyId} /> : null}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="page stack live-page" data-replay-active="false">
        {replayEndedByLive ? <ReplayEndedByLiveNote /> : null}
        <LiveOffAir loading={readinessCheckedAt === null && !readinessError} />
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
  const deskShown = liveish || replayEnded;
  /* Cross-links, never duplication (Brief R-c): /live answers "what is
   * happening right now?"; the race's own page holds the accumulating record.
   * One quiet link, races only; mid-replay it carries the virtual clock so the
   * replayed race gets its replayed race page. */
  const storySoFarId = replayActive ? replay?.session?.canonicalSessionId ?? null : canonicalLiveRaceSessionId(payload);
  const storyLink = storySoFarId ? (
    <Link className="live-desk__story" to={`/races/${encodeURIComponent(storySoFarId)}${replayActive && replay ? replayDeepLinkQuery(replay.getReplayParams()) : ''}`}>
      The story so far, on the race page →
    </Link>
  ) : null;
  return (
    <div
      className={`page stack live-page${deskShown ? ' live-page--desk' : ''}`}
      data-replay-active={replayActive ? 'true' : 'false'}
      data-live-payload-session-key={payloadSessionKey}
      data-live-session-key={history?.sessionKey ?? ''}
      data-live-session-kind={sessionKind}
      data-live-source-checked-at={latestHistorySample?.checkedAt ?? ''}
      data-live-arrival-checked-at={latestHistorySample?.arrivalCheckedAt ?? ''}
      data-live-history-count={history?.samples.length ?? 0}
      data-live-history-first-checked-at={history?.samples[0]?.checkedAt ?? ''}
    >
      {isOffSeasonDemoReplay && replay ? <OffSeasonDemoBanner replay={replay} navigate={navigate} joinedInProgress={joinedInProgress} /> : null}
      {replayEndedByLive ? <ReplayEndedByLiveNote /> : null}
      {replayActive && replay && !deskShown ? <ReplayBar replay={replay} payload={payload} onExit={demoExit} /> : null}
      {replayActive && replay ? <ReplayGapSkippedNote replay={replay} /> : null}
      {/* Outside the one screen, the trust state stands on its own; on it, the
          bar carries it (live) or the replay chip and provenance (replay). */}
      {replayActive || deskShown ? null : <TrustRail payload={payload} fixtureMode={fixtureMode} />}
      {deskShown ? (
        <LiveDesk
          payload={payload}
          phase={replayEnded ? 'ended' : 'race'}
          fixtureMode={fixtureMode}
          samples={samples}
          history={history}
          sessionKind={sessionKind}
          replay={null}
          storyLink={storyLink}
        />
      ) : (
        <WaitingState payload={payload} />
      )}
      {replayActive && replay ? <ReplayClassificationNote payload={payload} canonicalSessionId={replay.session?.canonicalSessionId ?? null} /> : null}
      {replayActive ? null : <WatchAlong payload={payload} />}
    </div>
  );
};
