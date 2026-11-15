import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, loadApiJson } from '../data/api';
import {
  captureBySessionKey,
  loadReplayAvailable,
  shortVenueFromEventName,
  type ReplaySessionInfo
} from '../data/replayAvailable';
import {
  FORMATION_MIN_LEAD_SECONDS,
  SKIM_SPEED,
  findFormationStart,
  findRaceStart,
  phasedClockPosition,
  skimPhases,
  type FlagSample,
  type ReplayPhase
} from '../data/replayStart';
import { useRouter } from './router';

/** The speeds the Time Machine offers. 1× is "as it happened"; 4× is the lively
 *  default; 16× skims. All three keep the archived payload shapes intact. */
export const REPLAY_SPEEDS = [1, 4, 16] as const;
const DEFAULT_REPLAY_SPEED = 4;
export { SKIM_SPEED };

/** What the clock is skimming right now, for the bar to say in plain words. */
export interface ReplaySkim {
  /** `formation`: before the green flag. `caution`: the opening caution
   *  between a start that did not hold and the restart. */
  kind: 'formation' | 'caution';
  /** The rate it plays at now. */
  speed: number;
  /** The visitor's own speed, which comes back at `until`. */
  backTo: number;
  /** Where the visitor's speed comes back. */
  until: 'green' | 'restart';
  /** Leader lap at that restart, when known. */
  restartLap: number | null;
}

export interface ReplaySession {
  /** A resolvable replay is being driven from the URL. */
  engaged: boolean;
  /** Resolving the archive (client-side availability check). */
  starting: boolean;
  /** The virtual clock has been started at least once. */
  started: boolean;
  /** Replay is not possible here (mode disabled, or session not found). */
  unavailable: boolean;
  /** A live session preempted the replay mid-playback (server live-guard). */
  endedByLive: boolean;
  /** Human-readable reason the replay could not start (unwatchable/unknown
   *  capture, or the replay service being unavailable). Set whenever the overlay
   *  could not engage playback, so the page renders an honest "this replay can't
   *  start: <reason>" state instead of an eternal cue-up. */
  refusedReason: string | null;
  session: ReplaySessionInfo | null;
  speed: number;
  speeds: readonly number[];
  venue: string | null;
  seasonYear: number | null;
  returnHref: string;
  skippedSourceGap: { seconds: number; resumeAt: string } | null;
  /** Where the clock starts and where Restart returns: the race start, or the
   *  restart when the start went to caution at once (src/data/replayStart.ts).
   *  Null until resolved. */
  raceStart: { at: string; kind: 'start' | 'restart'; lap: number | null } | null;
  /** The capture opens early enough before the start to replay the formation
   *  lap (BryceCast's own captures; lake replays begin at or after the green). */
  formationAvailable: boolean;
  /** The formation lap is being located in the archive (a few reads). */
  formationPending: boolean;
  /** The plain green flag (`firstGreenAt`, or the first frame of a lake feed
   *  that begins after it), for going back past a skipped opening caution. */
  greenFlagAt: string | null;
  /** Where the running clock was last started from: the resolved race start,
   *  a `t0` deep link, the formation lap, the plain green flag, or a jump
   *  (a source-gap skip). Lets the bar say "starts at the restart" only while
   *  that is true. */
  clockFrom: 'raceStart' | 't0' | 'formation' | 'greenFlag' | 'jump' | null;
  /** Set while the clock plays the formation laps or the opening caution at
   *  {@link SKIM_SPEED}; null when it plays at the visitor's speed. */
  skim: ReplaySkim | null;
  /** The rate the clock runs at this moment: `speed`, or the skim's rate. */
  playbackSpeed: number;
  /** Bumped whenever the clock jumps (restart, formation, green flag, a gap
   *  skip), so the page can fetch the new moment at once. */
  clockEpoch: number;
  setSpeed: (speed: number) => void;
  restart: () => void;
  /** Go back before the start: the clock runs from just before the field
   *  leaves the grid for the formation lap (session open when that can't be
   *  found). */
  restartFromFormation: () => void;
  /** Start locating the formation lap ahead of a click (hover or focus on the
   *  control), so the click itself is instant. Safe to call repeatedly. */
  prepareFormation: () => void;
  /** Go back to the plain green flag, before any skipped opening caution. */
  restartFromGreenFlag: () => void;
  /** Move the local clock to the first observation after a withheld source gap. */
  jumpTo: (iso: string, sourceGapSeconds?: number) => void;
  exit: () => void;
  /** The query string this client must append to every live-route poll while
   *  replaying — `?replay=<sessionKey>&rt=<isoVirtualTime>&speed=<n>` — or `''`
   *  when no replay is engaged. Read live off the local virtual clock, so it is
   *  correct at poll time (not render time). This is the ENTIRE server contract:
   *  the client owns the clock, the server stays stateless per request. */
  getReplayParams: () => string;
}

interface ReplayClock {
  sessionKey: string;
  /** Virtual time the clock started from (the race start), in ms. */
  virtualStartMs: number;
  /** Wall-clock ms when this segment started (reset on restart / speed change). */
  startedAtWallMs: number;
  speed: number;
  /** Archived span bounds, so the virtual clock never runs past the capture. */
  firstCheckedMs: number;
  lastCheckedMs: number;
  /** Stretches before the visitor's speed takes over (formation, opening
   *  caution). Empty for a plain clock. */
  phases: ReplayPhase[];
}

const inactive: Omit<
  ReplaySession,
  'setSpeed' | 'restart' | 'restartFromFormation' | 'prepareFormation' | 'restartFromGreenFlag' | 'jumpTo' | 'exit' | 'getReplayParams'
> = {
  engaged: false,
  starting: false,
  started: false,
  unavailable: false,
  endedByLive: false,
  refusedReason: null,
  session: null,
  speed: DEFAULT_REPLAY_SPEED,
  speeds: REPLAY_SPEEDS,
  venue: null,
  seasonYear: null,
  returnHref: '/races',
  skippedSourceGap: null,
  raceStart: null,
  formationAvailable: false,
  formationPending: false,
  greenFlagAt: null,
  clockFrom: null,
  skim: null,
  playbackSpeed: DEFAULT_REPLAY_SPEED,
  clockEpoch: 0
};

/** The longest the cue-up waits on the start search before starting at the
 *  plain green flag anyway. A clean start costs one read (~200 ms); finding a
 *  restart took 0.7-1.5 s through the dev proxy, and 4.8 s for the one
 *  20-minute opening caution in the archive (Road America 2026 Race 1). */
const RACE_START_SEARCH_TIMEOUT_MS = 6_000;

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });

const replayQuery = (sessionKey: string, atMs: number) =>
  `replay=${encodeURIComponent(sessionKey)}&rt=${encodeURIComponent(new Date(atMs).toISOString())}&speed=${DEFAULT_REPLAY_SPEED}`;

/** The archive's flag and leader lap at one virtual moment, read from the
 *  smallest replay-aware route (`/api/session`, ~2 KB). */
const sessionFlagAt = (sessionKey: string) => async (atMs: number): Promise<FlagSample> => {
  const payload = await loadApiJson<{ flag?: unknown; lap?: unknown }>(`/api/session?${replayQuery(sessionKey, atMs)}`);
  const flag = typeof payload?.flag === 'string' && payload.flag.trim() ? payload.flag.trim().toUpperCase() : null;
  const lap = Number.parseInt(String(payload?.lap ?? ''), 10);
  return { flag, lap: Number.isFinite(lap) ? lap : null };
};

/** Whether any car has registered on the timing loops at a virtual moment:
 *  a non-zero `liveGap` on any row. Null when the archive has no rows there. */
const timingMovingAt = (sessionKey: string) => async (atMs: number): Promise<boolean | null> => {
  const payload = await loadApiJson<{ rows?: Array<{ liveGap?: unknown }> }>(`/api/timing?${replayQuery(sessionKey, atMs)}`);
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) return null;
  return payload.rows.some((row) => {
    const gap = String(row?.liveGap ?? '').trim();
    return gap !== '' && !/^0+(\.0+)?$/.test(gap);
  });
};

/** The race start for a capture: the server's `firstRaceGreenAt` when it sends
 *  one, otherwise a bounded probe of the archive from `firstGreenAt`. */
/** The plain green flag as the clock can reach it. Lake replays can carry a
 *  green flag before their first frame; the clock clamps to the first frame
 *  there, so that is where "the green flag" is for them. */
const greenFlagMsOf = (session: ReplaySessionInfo): number | null => {
  const greenMs = Date.parse(session.firstGreenAt ?? '');
  const firstMs = Date.parse(session.firstCheckedAt ?? '');
  if (!Number.isFinite(greenMs)) return null;
  return Number.isFinite(firstMs) ? Math.max(greenMs, firstMs) : greenMs;
};

const resolveRaceStart = async (session: ReplaySessionInfo): Promise<ReplaySession['raceStart']> => {
  const lastMs = Date.parse(session.lastCheckedAt ?? '');
  const startMs = greenFlagMsOf(session);
  if (startMs === null) return null;
  const plain = { at: new Date(startMs).toISOString(), kind: 'start' as const, lap: null };
  const serverMs = Date.parse(session.firstRaceGreenAt ?? '');
  if (Number.isFinite(serverMs)) {
    return { at: new Date(serverMs).toISOString(), kind: serverMs > startMs + 1_000 ? 'restart' : 'start', lap: null };
  }
  if (!Number.isFinite(lastMs)) return plain;
  const found = await withTimeout(
    findRaceStart({ startMs, lastMs, flagAt: sessionFlagAt(session.sessionKey) }),
    RACE_START_SEARCH_TIMEOUT_MS,
    null
  );
  if (!found) return plain;
  return { at: new Date(found.atMs).toISOString(), kind: found.kind, lap: found.lap };
};

const formationAvailableFor = (session: ReplaySessionInfo): boolean => {
  const greenMs = Date.parse(session.firstGreenAt ?? '');
  const firstMs = Date.parse(session.firstCheckedAt ?? '');
  return Number.isFinite(greenMs) && Number.isFinite(firstMs) && greenMs - firstMs >= FORMATION_MIN_LEAD_SECONDS * 1000;
};

/** The initial playback rate a deep-link may seed via `?speed=`. "Clamped to the
 *  legal set" means: only the three offered rates (1|4|16) are honored; anything
 *  absent, unparseable, or off-set falls back to the loved default (4×) rather
 *  than snapping to a neighbor — a typo'd rate never surprises the family with a
 *  16× skim. Read ONCE at engage time, exactly like `?t0=`; the client owns the
 *  clock afterward, so every later change goes through {@link ReplaySession.setSpeed}. */
const clampSpeed = (raw: string | null): number => {
  const value = Number(raw);
  return REPLAY_SPEEDS.includes(value as (typeof REPLAY_SPEEDS)[number]) ? value : DEFAULT_REPLAY_SPEED;
};

const clampT0 = (session: ReplaySessionInfo, iso: string | null): string => {
  const green = session.firstGreenAt ?? session.firstCheckedAt ?? new Date().toISOString();
  if (!iso) return green;
  const at = Date.parse(iso);
  const last = Date.parse(session.lastCheckedAt ?? '');
  if (Number.isFinite(at) && Number.isFinite(last) && at > last) return session.lastCheckedAt ?? green;
  const first = Date.parse(session.firstCheckedAt ?? '');
  if (Number.isFinite(at) && Number.isFinite(first) && at < first) return session.firstCheckedAt ?? green;
  return iso;
};

/** Where a clock is now (src/data/replayStart.ts, `phasedClockPosition`). */
const clockPosition = (clock: ReplayClock, nowWallMs = Date.now()) =>
  phasedClockPosition({
    virtualStartMs: clock.virtualStartMs,
    elapsedWallMs: nowWallMs - clock.startedAtWallMs,
    speed: clock.speed,
    phases: clock.phases
  });

/** The current virtual timestamp of a clock, clamped into the archived span. At
 *  the end of the capture it pins to the last frame — the post-checkered
 *  "Race complete · as raced" state, which stays simulated (never live). */
const virtualNowMsOf = (clock: ReplayClock): number =>
  Math.min(clock.lastCheckedMs, Math.max(clock.firstCheckedMs, clockPosition(clock).atMs));

/** The skim phases for a clock going back before the race start. */
const skimPhasesFor = (session: ReplaySessionInfo, fromMs: number, speed: number, raceStartMs: number | null): ReplayPhase[] =>
  skimPhases({ fromMs, greenMs: greenFlagMsOf(session), raceStartMs, speed });

/**
 * Drives a per-CLIENT replay from `/live?replay=<sessionKey>`. The client owns
 * the virtual clock entirely: it resolves the capture from `/api/replay/available`,
 * starts the clock at the green flag, and thereafter appends `?replay&rt&speed`
 * to its own live-route polls via {@link ReplaySession.getReplayParams}. There
 * are NO start/stop control calls, so one viewer's replay never touches the
 * server's global state or any other viewer's Live page. `onRestart` clears the
 * client-side chart window so a restart genuinely replays from green.
 */
export const useReplaySession = (replayKey: string | null, onRestart?: () => void): ReplaySession => {
  const { navigate, route } = useRouter();
  const fromParam = route.search.get('from');
  // Optional deep-link into a race already in progress: `/live?replay=<key>&t0=<iso>`
  // starts the virtual clock at that archived moment instead of the green flag,
  // so a joiner enters mid-race (the exact "server remembers the race" case Brief
  // O seeds). Absent — the race-page replay button flow — the clock still starts
  // at green. Restart always returns to green regardless.
  const t0Param = route.search.get('t0');
  // Optional deep-link seed for the initial playback rate: `/live?replay=<key>&t0=<iso>&speed=1`
  // opens the replay paused-in-time at t0 and running at 1× ("as it happened"),
  // the shape a "watch the pass" share link uses. Absent — the default 4×. Only
  // `t0` and `speed` are honored as deep-link inputs: `rt` (the live virtual-now)
  // was superseded by `t0` for the clock SEED — the client derives `rt` off its
  // own clock for each poll (see getReplayParams) and never reads it from the URL,
  // so there is no `rt` deep-link param to add.
  const speedParam = route.search.get('speed');
  const [state, setState] = useState(inactive);
  const sessionRef = useRef<ReplaySessionInfo | null>(null);
  const clockRef = useRef<ReplayClock | null>(null);
  /** Where Restart returns (the resolved race start), per session key. */
  const raceStartRef = useRef<{ sessionKey: string; at: string; lap: number | null } | null>(null);
  /** The formation start for a session key: the search in flight, then its
   *  answer. One search per session, shared by hover and click. */
  const formationRef = useRef<{ sessionKey: string; promise: Promise<number> } | null>(null);
  const speedRef = useRef<number>(DEFAULT_REPLAY_SPEED);
  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getReplayParams = useCallback((): string => {
    const clock = clockRef.current;
    if (!clock) return '';
    const position = clockPosition(clock);
    const rt = new Date(Math.min(clock.lastCheckedMs, Math.max(clock.firstCheckedMs, position.atMs))).toISOString();
    return `?replay=${encodeURIComponent(clock.sessionKey)}&rt=${encodeURIComponent(rt)}&speed=${position.rate}`;
  }, []);

  /** Publish the clock's current phase (skim or not) and wake again at the
   *  next phase boundary, so the bar says 16x exactly while it is true. */
  const syncPhase = useCallback(() => {
    if (phaseTimerRef.current !== null) clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = null;
    const clock = clockRef.current;
    if (!clock) {
      setState((previous) => (previous.skim === null ? previous : { ...previous, skim: null }));
      return;
    }
    const position = clockPosition(clock);
    const restartLap = raceStartRef.current?.sessionKey === clock.sessionKey ? raceStartRef.current.lap : null;
    const skim: ReplaySkim | null =
      position.phase && position.phase.kind !== 'start' && position.rate > clock.speed
        ? {
            kind: position.phase.kind,
            speed: position.rate,
            backTo: clock.speed,
            // The caution always ends at the restart; the formation ends at
            // the green flag, where the visitor's speed returns for the start.
            until: position.phase.kind === 'caution' ? 'restart' : 'green',
            restartLap
          }
        : null;
    setState((previous) => {
      const same =
        previous.playbackSpeed === position.rate &&
        previous.skim?.kind === skim?.kind &&
        previous.skim?.speed === skim?.speed &&
        previous.skim?.backTo === skim?.backTo &&
        previous.skim?.restartLap === skim?.restartLap;
      return same ? previous : { ...previous, skim, playbackSpeed: position.rate };
    });
    if (position.wallToNextMs !== null) {
      phaseTimerRef.current = setTimeout(syncPhase, Math.ceil(position.wallToNextMs) + 20);
    }
  }, []);

  useEffect(
    () => () => {
      if (phaseTimerRef.current !== null) clearTimeout(phaseTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!replayKey) {
      sessionRef.current = null;
      clockRef.current = null;
      raceStartRef.current = null;
      formationRef.current = null;
      setState(inactive);
      return undefined;
    }

    let cancelled = false;
    // Seed the initial playback rate from `?speed=` (or the default). The client
    // owns the clock after this seed — `setSpeed` drives every later change.
    const seededSpeed = clampSpeed(speedParam);
    speedRef.current = seededSpeed;
    clockRef.current = null;
    setState({ ...inactive, engaged: true, starting: true, speed: seededSpeed });

    void (async () => {
      const available = await loadReplayAvailable();
      if (cancelled) return;
      const session = captureBySessionKey(available, replayKey);
      const returnHref =
        fromParam && /^session_/.test(fromParam)
          ? `/races/${encodeURIComponent(fromParam)}`
          : session?.canonicalSessionId
            ? `/races/${encodeURIComponent(session.canonicalSessionId)}`
            : '/races';
      // Hold a direct /live?replay=<key> URL to the same watchable bar the
      // race-page CTA applies; a non-watchable or wrong-series key stays out.
      if (!available || !session || !session.watchable) {
        clockRef.current = null;
        setState({
          ...inactive,
          engaged: true,
          unavailable: true,
          refusedReason: !available
            ? 'Replay isn’t available here.'
            : !session
              ? 'That race isn’t in the replay archive.'
              : 'That capture isn’t a watchable Bryce race.',
          returnHref
        });
        return;
      }
      sessionRef.current = session;
      const formationAvailable = formationAvailableFor(session);
      // Find where the race really gets going (src/data/replayStart.ts): the
      // green flag, or the restart when the start went to caution at once. A
      // `t0` deep link starts where it says without waiting; the search then
      // runs behind it, only so Restart knows where to go.
      const raceStartPromise = resolveRaceStart(session);
      const raceStart = t0Param ? null : await raceStartPromise;
      if (cancelled) return;
      if (raceStart) raceStartRef.current = { sessionKey: session.sessionKey, at: raceStart.at, lap: raceStart.lap };
      else
        void raceStartPromise.then((resolved) => {
          if (cancelled || !resolved) return;
          raceStartRef.current = { sessionKey: session.sessionKey, at: resolved.at, lap: resolved.lap };
          setState((previous) => (previous.session?.sessionKey === session.sessionKey ? { ...previous, raceStart: resolved } : previous));
        });
      // Start the local virtual clock at the race start (or, when a `t0`
      // deep-link is present, at that archived moment mid-race). The cue-up
      // clears as soon as the first archived frame arrives from the client's
      // own next readiness poll.
      const virtualStartMs = Date.parse(clampT0(session, t0Param ?? raceStart?.at ?? session.firstGreenAt));
      const firstCheckedMs = Date.parse(session.firstCheckedAt ?? '');
      const lastCheckedMs = Date.parse(session.lastCheckedAt ?? '');
      const safeStart = Number.isFinite(virtualStartMs) ? virtualStartMs : Date.now();
      clockRef.current = {
        sessionKey: session.sessionKey,
        virtualStartMs: safeStart,
        startedAtWallMs: Date.now(),
        speed: seededSpeed,
        firstCheckedMs: Number.isFinite(firstCheckedMs) ? firstCheckedMs : safeStart,
        lastCheckedMs: Number.isFinite(lastCheckedMs) ? lastCheckedMs : safeStart,
        phases: []
      };
      setState({
        ...inactive,
        engaged: true,
        starting: false,
        started: true,
        session,
        speed: seededSpeed,
        venue: shortVenueFromEventName(session.eventName),
        seasonYear: session.seasonYear,
        returnHref,
        raceStart,
        formationAvailable,
        playbackSpeed: seededSpeed,
        clockFrom: t0Param ? 't0' : 'raceStart',
        greenFlagAt: (() => {
          const ms = greenFlagMsOf(session);
          return ms === null ? null : new Date(ms).toISOString();
        })()
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, fromParam, t0Param, speedParam]);

  // Live-guard watch: while replaying, poll readiness with THIS client's own
  // replay params. If the server answers with a non-simulated payload, the real
  // runner has gone live — the server's per-request live-guard ignored our
  // params and served reality. Drop the clock (stop sending params so the main
  // poll takes over the live feed) and surface the honest handoff.
  useEffect(() => {
    if (!state.started || state.endedByLive) return undefined;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      // A backgrounded tab has no one watching for the live-guard handoff —
      // skip this tick's request rather than polling a hidden tab at the same
      // cadence as a foregrounded one. The interval keeps ticking, so the next
      // check after the tab is visible again is at most 5s away.
      if (typeof document !== 'undefined' && document.hidden) return;
      const params = getReplayParams();
      if (!params) return;
      try {
        const response = await fetch(apiUrl(`/api/readiness${params}`), { headers: { accept: 'application/json' } });
        if (!response.ok || cancelled) return;
        const data = (await response.json().catch(() => null)) as { replay?: { simulation?: { active?: boolean } } } | null;
        if (cancelled) return;
        const simulated = data?.replay?.simulation?.active === true;
        if (!simulated) {
          window.clearInterval(poll);
          clockRef.current = null;
          setState((previous) => ({ ...previous, started: false, endedByLive: true }));
        }
      } catch {
        // A transient failure is not a live-guard trip; keep replaying.
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [state.started, state.endedByLive, getReplayParams]);

  const setSpeed = useCallback((next: number) => {
    const clock = clockRef.current;
    if (!clock || !REPLAY_SPEEDS.includes(next as (typeof REPLAY_SPEEDS)[number])) return;
    // A speed the visitor picks wins over any skim still ahead: pressing 4×
    // during the 16× formation slows it to 4× there and then.
    const skimming = clockPosition(clock).rate !== clock.speed;
    if (next === clock.speed && !skimming) return;
    // Continue from the current virtual position at the new speed — purely local,
    // so the change is instant with no server round-trip.
    clockRef.current = { ...clock, virtualStartMs: virtualNowMsOf(clock), startedAtWallMs: Date.now(), speed: next, phases: [] };
    speedRef.current = next;
    setState((previous) => ({ ...previous, speed: next, started: true }));
    syncPhase();
  }, [syncPhase]);

  const restart = useCallback(() => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session) return;
    const raceStartAt = raceStartRef.current?.sessionKey === session.sessionKey ? raceStartRef.current.at : null;
    const virtualStartMs = Date.parse(clampT0(session, raceStartAt ?? session.firstGreenAt));
    clockRef.current = {
      ...clock,
      virtualStartMs: Number.isFinite(virtualStartMs) ? virtualStartMs : clock.firstCheckedMs,
      startedAtWallMs: Date.now(),
      phases: []
    };
    onRestartRef.current?.();
    setState((previous) => ({
      ...previous,
      started: true,
      endedByLive: false,
      skippedSourceGap: null,
      clockFrom: 'raceStart',
      clockEpoch: previous.clockEpoch + 1
    }));
    syncPhase();
  }, [syncPhase]);

  /** The formation start for the current session: one bounded search,
   *  shared by a hover that prepares it and the click that uses it. */
  const locateFormation = useCallback((): Promise<number> | null => {
    const session = sessionRef.current;
    if (!session || !formationAvailableFor(session)) return null;
    const sessionKey = session.sessionKey;
    if (formationRef.current?.sessionKey === sessionKey) return formationRef.current.promise;
    const openMs = Date.parse(session.firstCheckedAt ?? '');
    const greenMs = Date.parse(session.firstGreenAt ?? '');
    const promise = withTimeout(
      findFormationStart({ openMs, startMs: greenMs, movingAt: timingMovingAt(sessionKey) }),
      RACE_START_SEARCH_TIMEOUT_MS,
      { atMs: openMs, requests: 0 }
    ).then(({ atMs }) => atMs);
    formationRef.current = { sessionKey, promise };
    return promise;
  }, []);

  const prepareFormation = useCallback(() => {
    void locateFormation();
  }, [locateFormation]);

  const restartFromFormation = useCallback(() => {
    const session = sessionRef.current;
    if (!clockRef.current || !session) return;
    const sessionKey = session.sessionKey;
    const located = locateFormation();
    if (!located) return;
    setState((previous) => ({ ...previous, formationPending: true }));
    void located.then((atMs) => {
      const clock = clockRef.current;
      if (!clock || clock.sessionKey !== sessionKey) return;
      const startMs = Date.parse(clampT0(session, new Date(atMs).toISOString()));
      const virtualStartMs = Number.isFinite(startMs) ? startMs : clock.firstCheckedMs;
      const raceStartAt = raceStartRef.current?.sessionKey === sessionKey ? Date.parse(raceStartRef.current.at) : NaN;
      clockRef.current = {
        ...clock,
        virtualStartMs,
        startedAtWallMs: Date.now(),
        // The formation laps run at 16×, and so does an opening caution the
        // default start would have skipped; the start itself and the race
        // after the restart play at the visitor's speed.
        phases: skimPhasesFor(session, virtualStartMs, clock.speed, Number.isFinite(raceStartAt) ? raceStartAt : null)
      };
      onRestartRef.current?.();
      setState((previous) => ({
        ...previous,
        started: true,
        endedByLive: false,
        skippedSourceGap: null,
        formationPending: false,
        clockFrom: 'formation',
        clockEpoch: previous.clockEpoch + 1
      }));
      syncPhase();
    });
  }, [locateFormation, syncPhase]);

  const restartFromGreenFlag = useCallback(() => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session) return;
    const greenMs = greenFlagMsOf(session);
    const startMs = Date.parse(clampT0(session, greenMs === null ? null : new Date(greenMs).toISOString()));
    const virtualStartMs = Number.isFinite(startMs) ? startMs : clock.firstCheckedMs;
    const raceStartAt = raceStartRef.current?.sessionKey === session.sessionKey ? Date.parse(raceStartRef.current.at) : NaN;
    clockRef.current = {
      ...clock,
      virtualStartMs,
      startedAtWallMs: Date.now(),
      // The start at the visitor's speed, then the caution at 16× to the restart.
      phases: skimPhasesFor(session, virtualStartMs, clock.speed, Number.isFinite(raceStartAt) ? raceStartAt : null)
    };
    onRestartRef.current?.();
    setState((previous) => ({
      ...previous,
      started: true,
      endedByLive: false,
      skippedSourceGap: null,
      clockFrom: 'greenFlag',
      clockEpoch: previous.clockEpoch + 1
    }));
    syncPhase();
  }, [syncPhase]);

  const jumpTo = useCallback((iso: string, sourceGapSeconds = 0) => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session) return;
    const nextMs = Date.parse(clampT0(session, iso));
    if (!Number.isFinite(nextMs)) return;
    clockRef.current = {
      ...clock,
      virtualStartMs: nextMs,
      startedAtWallMs: Date.now(),
      // A gap skip keeps whatever skim is still ahead of the new moment.
      phases: clock.phases.filter((phase) => phase.untilMs > nextMs)
    };
    // A source gap must not leave a chart line joining the last pre-gap rank to
    // the first post-gap rank as if those seven minutes had been observed.
    onRestartRef.current?.();
    setState((previous) => ({
      ...previous,
      started: true,
      endedByLive: false,
      skippedSourceGap: { seconds: Math.max(0, sourceGapSeconds), resumeAt: iso },
      clockFrom: 'jump',
      clockEpoch: previous.clockEpoch + 1
    }));
    syncPhase();
  }, [syncPhase]);

  const exit = useCallback(() => {
    const href = state.returnHref;
    clockRef.current = null;
    navigate(href);
  }, [navigate, state.returnHref]);

  return { ...state, setSpeed, restart, restartFromFormation, prepareFormation, restartFromGreenFlag, jumpTo, exit, getReplayParams };
};
