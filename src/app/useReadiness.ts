import { useCallback, useEffect, useRef, useState } from 'react';
import { uiDataPackage, type UiLiveFixture } from '../data/uiDataPackage';
import { useRouter } from './router';

/** Runtime readiness payload shares the fixture shape (live-readiness.v1). */
export type LiveReadiness = UiLiveFixture;

export interface ReplaySourceGap {
  code: 'source_gap';
  sessionKey: string;
  requestedAt: string;
  lastObservedAt: string;
  heldThroughAt: string;
  nextObservedAt: string;
  resumeAt: string;
  sourceGapSeconds: number;
  maximumHoldSeconds: number;
  message: string;
}

export interface ReadinessStatus {
  payload: LiveReadiness | null;
  /** true when rendering a package fixture via ?fixture= (dev/QA affordance) */
  fixtureMode: boolean;
  error: string | null;
  /** A replay interval deliberately withheld after its bounded hold expired. */
  sourceGap: ReplaySourceGap | null;
  checkedAt: number | null;
  /** Forces an immediate poll, cancelling the scheduled one. A cold pre-race
   *  page sits on a 15s pre_session cadence (60s after a failed fetch); when a
   *  replay engages server-side in ~30ms the page must not wait out that gap on
   *  the cue card, so the replay hook nudges an immediate refetch. */
  refresh: () => void;
  /** Like `refresh`, after the replay clock has jumped: an answer still in
   *  flight for the old moment is dropped instead of shown. */
  resync: () => void;
}

/** Poll cadence per product contract: 1s live, gentle otherwise, backoff on failure. */
const cadenceFor = (state: string | undefined, failures: number): number => {
  if (failures > 0) return Math.min(60_000, 5_000 * 2 ** (failures - 1));
  switch (state) {
    case 'ready':
    case 'degraded':
      return 1_000;
    case 'pre_session':
      return 15_000;
    case 'wrong_series':
    case 'stale':
      return 30_000;
    default:
      return 60_000;
  }
};

/**
 * @param getReplayParams When the Live page is driving a per-client replay, this
 *   returns `?replay=<sessionKey>&rt=<isoVirtualTime>&speed=<n>` for the current
 *   virtual frame; otherwise `''`. It is appended to every readiness poll, so
 *   the replay lives entirely in THIS client's requests — a plain client (no
 *   params) always receives the real feed. Read at poll time so `rt` is current.
 */
export const useReadiness = (getReplayParams?: () => string): ReadinessStatus => {
  const { route } = useRouter();
  const fixtureState = route.search.get('fixture');
  const fixtureVariant = route.search.get('variant') ?? 'base';
  const replayParamsRef = useRef<() => string>(() => '');
  replayParamsRef.current = getReplayParams ?? (() => '');

  // A replay route waits for its clock before the first poll (round 7): a poll
  // without replay params is the real feed, which the production host answers
  // 503 off-season, and that failure set the first frame back 5 s.
  const replayRouteRef = useRef(false);
  replayRouteRef.current = Boolean(route.search.get('replay')) && !fixtureState;

  const [status, setStatus] = useState<Omit<ReadinessStatus, 'resync'>>({ payload: null, fixtureMode: false, error: null, sourceGap: null, checkedAt: null, refresh: () => {} });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  const nudgeRef = useRef<() => void>(() => {});
  /** One poll in flight at a time; a nudge during one runs straight after it. */
  const inFlightRef = useRef(false);
  const againRef = useRef(false);
  /** Bumped by `resync`: an answer from an older generation is dropped. */
  const generationRef = useRef(0);
  /** The replay params of the last answer shown: a paused clock asks again
   *  only when they change. */
  const lastShownParamsRef = useRef<string | null>(null);
  // Replay-only: a poll held back because the tab was hidden when it would have
  // fired (see scheduleTick below).
  const pendingResumeRef = useRef(false);

  useEffect(() => {
    if (fixtureState) {
      const fixture =
        uiDataPackage.screens.liveCompanionFixtures.fixtures.find(
          (candidate) => candidate.state === fixtureState && (candidate.variant ?? 'base') === fixtureVariant
        ) ?? null;
      nudgeRef.current = () => {};
      setStatus({ payload: fixture, fixtureMode: true, error: fixture ? null : `No fixture for state ${fixtureState}`, sourceGap: null, checkedAt: Date.now(), refresh: () => {} });
      return undefined;
    }

    let cancelled = false;

    const waitStartedAt = Date.now();
    const tick = async () => {
      if (inFlightRef.current) {
        againRef.current = true;
        return;
      }
      const params = replayParamsRef.current();
      if (!params && replayRouteRef.current && Date.now() - waitStartedAt < 4_000) {
        // The replay clock has not started yet; its start nudges this poll.
        scheduleTick(250);
        return;
      }
      if (params && params === lastShownParamsRef.current) {
        // Paused: the same moment is already on the page.
        scheduleTick(1_000);
        return;
      }
      const generation = generationRef.current;
      inFlightRef.current = true;
      try {
        const response = await fetch(`/api/readiness${params}`, { headers: { accept: 'application/json' } });
        if (generation !== generationRef.current) return;
        if (params && response.status === 502) {
          // A replay frame the server could not render (a Timing71 feed's
          // opening seconds carry no Bryce row): keep the page as it is and
          // ask again for the next moment. Keyed on the status, never the body.
          if (cancelled) return;
          scheduleTick(1_000);
          return;
        }
        if (response.status === 409) {
          const refused = (await response.json().catch(() => null)) as { error?: string; gap?: ReplaySourceGap } | null;
          if (refused?.error === 'source_gap' && refused.gap?.resumeAt) {
            if (cancelled) return;
            failuresRef.current = 0;
            lastShownParamsRef.current = null;
            // Drop the prior payload immediately. Keeping it would visually hold
            // the last known rank through an interval the archive did not see.
            setStatus({ payload: null, fixtureMode: false, error: null, sourceGap: refused.gap, checkedAt: Date.now(), refresh: nudgeRef.current });
            scheduleTick(1_000);
            return;
          }
        }
        if (!response.ok) throw new Error(`readiness ${response.status}`);
        const payload = (await response.json()) as LiveReadiness;
        if (cancelled || generation !== generationRef.current) return;
        failuresRef.current = 0;
        lastShownParamsRef.current = params || null;
        setStatus({ payload, fixtureMode: false, error: null, sourceGap: null, checkedAt: Date.now(), refresh: nudgeRef.current });
        scheduleTick(cadenceFor(payload.state, 0));
      } catch (error) {
        if (cancelled || generation !== generationRef.current) return;
        failuresRef.current += 1;
        setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), checkedAt: Date.now(), refresh: nudgeRef.current }));
        scheduleTick(cadenceFor(undefined, failuresRef.current));
      } finally {
        inFlightRef.current = false;
        if (!cancelled && (againRef.current || generation !== generationRef.current)) {
          againRef.current = false;
          if (timerRef.current) clearTimeout(timerRef.current);
          void tick();
        }
      }
    };

    // Replay mode only: a demo tab left in the background has no one watching
    // it, so hold the next poll instead of running it at full (up to 1s) live
    // cadence — the off-season auto-demo can leave several tabs idling. Plain
    // live polling is untouched: a family glancing back at a backgrounded live
    // tab expects it to already be caught up, so it keeps polling regardless of
    // visibility, exactly as before.
    const scheduleTick = (delayMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (replayParamsRef.current() && typeof document !== 'undefined' && document.hidden) {
        pendingResumeRef.current = true;
        return;
      }
      timerRef.current = setTimeout(tick, delayMs);
    };

    const onVisibilityChange = () => {
      if (!document.hidden && pendingResumeRef.current) {
        pendingResumeRef.current = false;
        nudgeRef.current();
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);

    // An immediate poll that cancels the scheduled one — idempotent enough that a
    // spurious call just refreshes readiness a beat early.
    nudgeRef.current = () => {
      if (cancelled) return;
      pendingResumeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      void tick();
    };
    setStatus((previous) => ({ ...previous, refresh: nudgeRef.current }));

    void tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fixtureState, fixtureVariant]);

  const refresh = useCallback(() => nudgeRef.current(), []);
  const resync = useCallback(() => {
    generationRef.current += 1;
    lastShownParamsRef.current = null;
    nudgeRef.current();
  }, []);
  return { ...status, refresh, resync };
};
