import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  appendLiveHistoryPayload,
  createLiveHistoryState,
  liveSessionHistoryForPayload,
  liveSessionKeyOf,
  liveSourceCheckedAtOf,
  seedLiveHistoryState,
  LIVE_POLL_INTERVAL_MS,
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

/** The span the charts actually paint is five minutes (RUNNING_ORDER_WINDOW_MS);
 * a minute of headroom keeps the left edge covered while the window slides. The
 * seed asks for exactly this instead of the whole race: mid-race, the unbounded
 * response was up to 400 frames and 2.4 MB to draw five minutes of line. */
const SEED_WINDOW_SECONDS = 360;

/** Below this the client has seen every source sample itself and needs no
 * catch-up: live polling, and a 1× replay, both land one archived sample per
 * poll. Above it the poll SKIPPED source time — 4 s at 4×, 16 s at 16×, or a
 * whole stretch after a backgrounded tab resumed — and the frames inside that
 * span have to be fetched or they are simply lost from the record. */
const CATCH_UP_TRIGGER_MS = Math.round(LIVE_POLL_INTERVAL_MS * 1.8);

/**
 * Lives above route selection in AppV3. Navigating away from /live therefore
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
 * Playback-rate catch-up: the seed alone is not enough once the clock runs
 * faster than the poll. One 1 s poll at 4×/16× advances 4–16 s of archive, so
 * the readiness frame is a SAMPLE of that span and everything between two polls
 * — every pass, every gap reading — never reaches the chart at all. After each
 * payload that skipped source time, this pulls the archived frames in the span
 * it skipped (`&since=…&dense=1`, bounded server-side to a small frame budget).
 * A 1× replay and a live page never trigger it, so neither pays for it. The same
 * path covers a tab that was backgrounded: the virtual clock kept running while
 * polling was paused, and the resuming poll lands far ahead — the server clamps
 * that span and marks the honest break rather than drawing across it.
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
  const catchUpInFlightRef = useRef(false);
  /** The newest source timestamp this client holds, per session. Read at fetch
   *  time (not from React state) so a catch-up asks for exactly the span it is
   *  missing even when several payloads land inside one render. */
  const latestCheckedAtRef = useRef<Map<string, string>>(new Map());
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

  /** Merge a rank-series response and advance the per-session watermark. */
  const mergeRankSeries = useCallback((data: RankSeriesResponse, sessionKey: string) => {
    setState((previous) => seedLiveHistoryState(previous, data, sessionKey));
    const newest = data.frames?.at(-1)?.checkedAt;
    if (newest) {
      const held = latestCheckedAtRef.current.get(sessionKey);
      if (!held || Date.parse(newest) > Date.parse(held)) latestCheckedAtRef.current.set(sessionKey, newest);
    }
  }, []);

  useEffect(() => {
    // 'stale' seeds too (Brief R-c): between COLD and roll-forward the capture
    // itself reads stale, and a fresh visitor to the race page must still see
    // the race-so-far — the archive holds the honest record, never a blank.
    // Live appends stay gated to ready/degraded in the history model; only the
    // one-shot server seed is allowed through here.
    if (!payload || !['ready', 'degraded', 'stale'].includes(payload.state)) return;
    const sessionKey = liveSessionKeyOf(payload);
    if (!sessionKey) return;

    const payloadCheckedAt = liveSourceCheckedAtOf(payload);
    const payloadMs = Date.parse(payloadCheckedAt);
    const replayParams = replayParamsRef.current();

    if (!seededRef.current.has(sessionKey) && !inFlightRef.current.has(sessionKey)) {
      const path = replayParams
        ? `/api/history/rank-series${replayParams}&window=${SEED_WINDOW_SECONDS}`
        : `/api/history/rank-series?session=${encodeURIComponent(sessionKey)}&window=${SEED_WINDOW_SECONDS}`;
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
          mergeRankSeries(data, sessionKey);
        } catch {
          // A failed seed is non-fatal: the client still accumulates its own polls.
        } finally {
          inFlightRef.current.delete(sessionKey);
        }
      })();
      return;
    }

    // --- playback-rate catch-up (replay only) ---
    if (!replayParams || catchUpInFlightRef.current || !Number.isFinite(payloadMs)) {
      if (Number.isFinite(payloadMs)) latestCheckedAtRef.current.set(sessionKey, payloadCheckedAt);
      return;
    }
    const held = latestCheckedAtRef.current.get(sessionKey) ?? null;
    const heldMs = held ? Date.parse(held) : NaN;
    latestCheckedAtRef.current.set(sessionKey, payloadCheckedAt);
    if (!Number.isFinite(heldMs) || payloadMs - heldMs < CATCH_UP_TRIGGER_MS) return;

    catchUpInFlightRef.current = true;
    void (async () => {
      try {
        const path = `/api/history/rank-series${replayParams}&since=${encodeURIComponent(held!)}&dense=1`;
        const response = await fetch(apiUrl(path), { headers: { accept: 'application/json' } });
        if (!response.ok || !mountedRef.current) return;
        const data = (await response.json()) as RankSeriesResponse;
        if (!mountedRef.current) return;
        mergeRankSeries(data, sessionKey);
      } catch {
        // Non-fatal: the next poll's frame still lands, the span just stays sparse.
      } finally {
        catchUpInFlightRef.current = false;
      }
    })();
  }, [payload, mergeRankSeries]);

  const active = useMemo(() => liveSessionHistoryForPayload(state, payload), [payload, state]);
  const reset = useCallback(() => {
    // A restart replays from green: forget the seed so the fresh window re-seeds
    // at the restarted virtual clock.
    seededRef.current = new Set();
    inFlightRef.current = new Set();
    catchUpInFlightRef.current = false;
    latestCheckedAtRef.current = new Map();
    setState(createLiveHistoryState());
  }, []);
  return { state, active, reset };
};
