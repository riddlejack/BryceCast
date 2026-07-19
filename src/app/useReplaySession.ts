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
  /** Resolving the archive / issuing the first control call. */
  starting: boolean;
  /** The virtual clock has been started at least once. */
  started: boolean;
  /** Replay is not possible here (mode disabled, or session not found). */
  unavailable: boolean;
  session: ReplaySessionInfo | null;
  speed: number;
  speeds: readonly number[];
  venue: string | null;
  seasonYear: number | null;
  returnHref: string;
  setSpeed: (speed: number) => void;
  restart: () => void;
  exit: () => void;
}

const inactive: ReplaySession = {
  engaged: false,
  starting: false,
  started: false,
  unavailable: false,
  session: null,
  speed: DEFAULT_REPLAY_SPEED,
  speeds: REPLAY_SPEEDS,
  venue: null,
  seasonYear: null,
  returnHref: '/races',
  setSpeed: () => {},
  restart: () => {},
  exit: () => {}
};

const control = async (query: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> => {
  try {
    const response = await fetch(apiUrl(`/api/replay/control${query}`), { headers: { accept: 'application/json' } });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
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

/**
 * Drives the read-only replay overlay from `/live?replay=<sessionKey>`. It
 * resolves the capture, starts the virtual clock at the green flag, and exposes
 * speed / restart / exit. `onRestart` clears the client-side chart window so a
 * restart genuinely replays from green. Passing `replayKey = null` (off /live,
 * or no param) leaves the overlay stopped.
 */
export const useReplaySession = (replayKey: string | null, onRestart?: () => void): ReplaySession => {
  const { navigate, route } = useRouter();
  const fromParam = route.search.get('from');
  const [state, setState] = useState<ReplaySession>(inactive);
  const sessionRef = useRef<ReplaySessionInfo | null>(null);
  const speedRef = useRef<number>(DEFAULT_REPLAY_SPEED);
  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;

  const start = useCallback(async (session: ReplaySessionInfo, t0: string | null, speed: number) => {
    const query = `?session=${encodeURIComponent(session.sessionKey)}&t0=${encodeURIComponent(clampT0(session, t0))}&speed=${speed}`;
    return control(query);
  }, []);

  useEffect(() => {
    if (!replayKey) {
      // Not on /live with a replay param: make sure any playback is stopped.
      sessionRef.current = null;
      setState(inactive);
      void control('?stop=1');
      return undefined;
    }

    let cancelled = false;
    speedRef.current = DEFAULT_REPLAY_SPEED;
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
      if (!available || !session) {
        setState({ ...inactive, engaged: true, unavailable: true, returnHref });
        return;
      }
      sessionRef.current = session;
      const started = await start(session, session.firstGreenAt, DEFAULT_REPLAY_SPEED);
      if (cancelled) return;
      setState((previous) => ({
        ...previous,
        engaged: true,
        starting: false,
        started: started.ok,
        unavailable: !started.ok,
        session,
        speed: DEFAULT_REPLAY_SPEED,
        venue: shortVenueFromEventName(session.eventName),
        seasonYear: session.seasonYear,
        returnHref
      }));
    })();

    return () => {
      cancelled = true;
      void control('?stop=1');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, fromParam, start]);

  const setSpeed = useCallback(
    (next: number) => {
      const session = sessionRef.current;
      if (!session || next === speedRef.current || !REPLAY_SPEEDS.includes(next as (typeof REPLAY_SPEEDS)[number])) return;
      void (async () => {
        // Continue from the current virtual position at the new speed.
        const status = await control('');
        const virtualNow = typeof status.data?.virtualNow === 'string' ? (status.data.virtualNow as string) : session.firstGreenAt;
        const result = await start(session, virtualNow, next);
        if (result.ok) {
          speedRef.current = next;
          setState((previous) => ({ ...previous, speed: next, started: true }));
        }
      })();
    },
    [start]
  );

  const restart = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    void (async () => {
      const result = await start(session, session.firstGreenAt, speedRef.current);
      if (result.ok) {
        onRestartRef.current?.();
        setState((previous) => ({ ...previous, started: true }));
      }
    })();
  }, [start]);

  const exit = useCallback(() => {
    const href = state.returnHref;
    void control('?stop=1');
    navigate(href);
  }, [navigate, state.returnHref]);

  return { ...state, setSpeed, restart, exit };
};
