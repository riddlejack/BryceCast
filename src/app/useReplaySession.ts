import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../data/api';
import {
  captureBySessionKey,
  loadReplayAvailable,
  shortVenueFromEventName,
  type ReplaySessionInfo
} from '../data/replayAvailable';
import { useRouter } from './router';

/** The speeds the Time Machine offers. 1× is "as it happened"; 4× is the lively
 *  default; 16× skims. All three keep the archived payload shapes intact. */
export const REPLAY_SPEEDS = [1, 4, 16] as const;
const DEFAULT_REPLAY_SPEED = 4;

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
  setSpeed: (speed: number) => void;
  restart: () => void;
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
  /** Virtual time the clock started from (the green flag), in ms. */
  virtualStartMs: number;
  /** Wall-clock ms when this segment started (reset on restart / speed change). */
  startedAtWallMs: number;
  speed: number;
  /** Archived span bounds, so the virtual clock never runs past the capture. */
  firstCheckedMs: number;
  lastCheckedMs: number;
}

const inactive: Omit<ReplaySession, 'setSpeed' | 'restart' | 'exit' | 'getReplayParams'> = {
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
  returnHref: '/races'
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

/** The current virtual timestamp of a clock, clamped into the archived span. At
 *  the end of the capture it pins to the last frame — the post-checkered
 *  "Race complete · as raced" state, which stays simulated (never live). */
const virtualNowMsOf = (clock: ReplayClock): number => {
  const elapsedReal = Math.max(0, Date.now() - clock.startedAtWallMs);
  const raw = clock.virtualStartMs + elapsedReal * clock.speed;
  return Math.min(clock.lastCheckedMs, Math.max(clock.firstCheckedMs, raw));
};

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
  const [state, setState] = useState(inactive);
  const sessionRef = useRef<ReplaySessionInfo | null>(null);
  const clockRef = useRef<ReplayClock | null>(null);
  const speedRef = useRef<number>(DEFAULT_REPLAY_SPEED);
  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;

  const getReplayParams = useCallback((): string => {
    const clock = clockRef.current;
    if (!clock) return '';
    const rt = new Date(virtualNowMsOf(clock)).toISOString();
    return `?replay=${encodeURIComponent(clock.sessionKey)}&rt=${encodeURIComponent(rt)}&speed=${clock.speed}`;
  }, []);

  useEffect(() => {
    if (!replayKey) {
      sessionRef.current = null;
      clockRef.current = null;
      setState(inactive);
      return undefined;
    }

    let cancelled = false;
    speedRef.current = DEFAULT_REPLAY_SPEED;
    clockRef.current = null;
    setState({ ...inactive, engaged: true, starting: true });

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
      // Start the local virtual clock at the green flag. No server round-trip —
      // the cue-up clears as soon as the first archived frame arrives from the
      // client's own next readiness poll.
      const virtualStartMs = Date.parse(clampT0(session, session.firstGreenAt));
      const firstCheckedMs = Date.parse(session.firstCheckedAt ?? '');
      const lastCheckedMs = Date.parse(session.lastCheckedAt ?? '');
      const safeStart = Number.isFinite(virtualStartMs) ? virtualStartMs : Date.now();
      clockRef.current = {
        sessionKey: session.sessionKey,
        virtualStartMs: safeStart,
        startedAtWallMs: Date.now(),
        speed: DEFAULT_REPLAY_SPEED,
        firstCheckedMs: Number.isFinite(firstCheckedMs) ? firstCheckedMs : safeStart,
        lastCheckedMs: Number.isFinite(lastCheckedMs) ? lastCheckedMs : safeStart
      };
      setState({
        ...inactive,
        engaged: true,
        starting: false,
        started: true,
        session,
        speed: DEFAULT_REPLAY_SPEED,
        venue: shortVenueFromEventName(session.eventName),
        seasonYear: session.seasonYear,
        returnHref
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, fromParam]);

  // Live-guard watch: while replaying, poll readiness with THIS client's own
  // replay params. If the server answers with a non-simulated payload, the real
  // runner has gone live — the server's per-request live-guard ignored our
  // params and served reality. Drop the clock (stop sending params so the main
  // poll takes over the live feed) and surface the honest handoff.
  useEffect(() => {
    if (!state.started || state.endedByLive) return undefined;
    let cancelled = false;
    const poll = window.setInterval(async () => {
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
    if (!clock || next === clock.speed || !REPLAY_SPEEDS.includes(next as (typeof REPLAY_SPEEDS)[number])) return;
    // Continue from the current virtual position at the new speed — purely local,
    // so the change is instant with no server round-trip.
    clockRef.current = { ...clock, virtualStartMs: virtualNowMsOf(clock), startedAtWallMs: Date.now(), speed: next };
    speedRef.current = next;
    setState((previous) => ({ ...previous, speed: next, started: true }));
  }, []);

  const restart = useCallback(() => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session) return;
    const virtualStartMs = Date.parse(clampT0(session, session.firstGreenAt));
    clockRef.current = {
      ...clock,
      virtualStartMs: Number.isFinite(virtualStartMs) ? virtualStartMs : clock.firstCheckedMs,
      startedAtWallMs: Date.now()
    };
    onRestartRef.current?.();
    setState((previous) => ({ ...previous, started: true, endedByLive: false }));
  }, []);

  const exit = useCallback(() => {
    const href = state.returnHref;
    clockRef.current = null;
    navigate(href);
  }, [navigate, state.returnHref]);

  return { ...state, setSpeed, restart, exit, getReplayParams };
};
