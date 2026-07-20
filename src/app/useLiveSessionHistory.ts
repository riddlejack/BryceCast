import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  appendLiveHistoryPayload,
  createLiveHistoryState,
  liveSessionHistoryForPayload,
  liveSessionKeyOf,
  seedLiveHistoryState,
  type LiveHistoryState,
  type LiveSessionHistory,
  type RankSeriesResponse
} from '../data/liveHistoryModel';
import { apiUrl } from '../data/api';
import type { LiveReadiness } from './useReadiness';

export interface LiveSessionHistoryStatus {
  state: LiveHistoryState;
  active: LiveSessionHistory | null;
  /** Clears the accumulated window — used when a replay restarts from green. */
  reset: () => void;
}

/** Lives above route selection in AppV3. Navigating away from /live therefore
 * cannot destroy the session's five-minute chart window.
 *
 * Brief O — the server remembers the race: on the first usable payload for a
 * session, this hook fetches `/api/history/rank-series` ONCE and seeds the
 * running-order window with the session-so-far, so a mid-race joiner sees a full
 * chart on first paint instead of a blank that fills only as their own client
 * accumulates. A replay client passes its live replay params, so the history is
 * windowed to its virtual now through the same resolver the live routes use; a
 * live client passes only its session key. The seed is best-effort: any failure
 * leaves the client to fill the window from its own polls, exactly as before.
 *
 * @param getReplayParams When replaying, returns
 *   `?replay=<sessionKey>&rt=<isoVirtualTime>&speed=<n>` for the current virtual
 *   frame; otherwise `''`. Read at fetch time so the seed windows to the live
 *   virtual now.
 */
export const useLiveSessionHistory = (
  payload: LiveReadiness | null,
  getReplayParams?: () => string
): LiveSessionHistoryStatus => {
  const [state, setState] = useState<LiveHistoryState>(createLiveHistoryState);
  const seededRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const replayParamsRef = useRef<() => string>(() => '');
  replayParamsRef.current = getReplayParams ?? (() => '');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!payload) return;
    setState((previous) => appendLiveHistoryPayload(previous, payload));
  }, [payload]);

  useEffect(() => {
    // 'stale' seeds too (Brief R-c): between COLD and roll-forward the capture
    // itself reads stale, and a fresh visitor to the race page must still see
    // the race-so-far — the archive holds the honest record, never a blank.
    // Live appends stay gated to ready/degraded in the history model; only the
    // one-shot server seed is allowed through here.
    if (!payload || !['ready', 'degraded', 'stale'].includes(payload.state)) return;
    const sessionKey = liveSessionKeyOf(payload);
    if (!sessionKey || seededRef.current.has(sessionKey) || inFlightRef.current.has(sessionKey)) return;
    const replayParams = replayParamsRef.current();
    const path = replayParams
      ? `/api/history/rank-series${replayParams}`
      : `/api/history/rank-series?session=${encodeURIComponent(sessionKey)}`;
    inFlightRef.current.add(sessionKey);
    // Fire-and-forget: a later payload must not cancel an in-flight seed, so the
    // guard is unmount-only. The seededRef gate keeps it to one fetch per session.
    void (async () => {
      try {
        const response = await fetch(apiUrl(path), { headers: { accept: 'application/json' } });
        if (!response.ok || !mountedRef.current) return;
        const data = (await response.json()) as RankSeriesResponse;
        if (!mountedRef.current) return;
        seededRef.current.add(sessionKey);
        setState((previous) => seedLiveHistoryState(previous, data, sessionKey));
      } catch {
        // A failed seed is non-fatal: the client still accumulates its own polls.
      } finally {
        inFlightRef.current.delete(sessionKey);
      }
    })();
  }, [payload]);

  const active = useMemo(() => liveSessionHistoryForPayload(state, payload), [payload, state]);
  const reset = useCallback(() => {
    // A restart replays from green: forget the seed so the fresh window re-seeds
    // at the restarted virtual clock.
    seededRef.current = new Set();
    inFlightRef.current = new Set();
    setState(createLiveHistoryState());
  }, []);
  return { state, active, reset };
};
